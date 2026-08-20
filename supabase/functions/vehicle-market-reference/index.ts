import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeDiagnostic(value, maxLength = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function readUpstreamFailure(response) {
  let payload = null;
  try { payload = await response.clone().json(); } catch { /* Mercado Libre may return an empty/non-JSON body. */ }
  return {
    status: response.status,
    code: safeDiagnostic(payload?.code || payload?.error || payload?.cause?.[0]?.code, 80),
    message: safeDiagnostic(payload?.message || payload?.error_description || payload?.cause?.[0]?.message),
  };
}

function upstreamFailureBasis(failure) {
  return [
    `Mercado Libre respondió HTTP ${failure.status}.`,
    failure.code ? `Código: ${failure.code}.` : "",
    failure.message ? `Detalle: ${failure.message}` : "",
  ].filter(Boolean).join(" ").slice(0, 500);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value) {
  return normalize(value).split(" ").filter((word) => word.length > 1);
}

function attribute(item, ids) {
  const wanted = new Set(ids);
  const found = (item.attributes || []).find((entry) => wanted.has(String(entry.id || "").toUpperCase()));
  return found?.value_name ?? found?.value_id ?? "";
}

function numberFrom(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
}

function versionCoverage(target, candidate) {
  const targetWords = [...new Set(words(target))];
  if (!targetWords.length) return 1;
  const candidateWords = new Set(words(candidate));
  return targetWords.filter((word) => candidateWords.has(word)).length / targetWords.length;
}

function percentile(sorted, value) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * value;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function roundMoney(value) {
  return Math.round(Number(value) / 1000) * 1000;
}

function comparableFrom(item, target) {
  if (item.condition && item.condition !== "used") return null;
  const title = String(item.title || "");
  if (/\b(anticipo|cuotas?|plan\s+de\s+ahorro|adjudicad[oa]|financiad[oa])\b/i.test(normalize(title))) return null;

  const brand = String(attribute(item, ["BRAND", "VEHICLE_BRAND"]) || "");
  const model = String(attribute(item, ["MODEL", "VEHICLE_MODEL"]) || "");
  const version = String(attribute(item, ["TRIM", "VEHICLE_VERSION", "VERSION"]) || title);
  const year = numberFrom(attribute(item, ["VEHICLE_YEAR", "YEAR"]));
  const mileage = numberFrom(attribute(item, ["KILOMETERS", "MILEAGE"]));
  const price = Number(item.price);

  const searchable = normalize([brand, model, title].join(" "));
  if (!searchable.includes(normalize(target.brand)) || !searchable.includes(normalize(target.model))) return null;
  if (target.version && versionCoverage(target.version, version + " " + title) < 0.6) return null;
  if (!year || Math.abs(year - target.year) > 1) return null;
  const mileageTolerance = Math.max(20000, Math.round(target.mileage * 0.25));
  if (mileage == null || Math.abs(mileage - target.mileage) > mileageTolerance) return null;
  if (!Number.isFinite(price) || price <= 0 || !item.currency_id) return null;

  return {
    id: String(item.id || ""),
    title,
    price,
    currency: String(item.currency_id),
    year,
    mileage,
    version,
    permalink: String(item.permalink || ""),
  };
}

function calculateReference(items, target) {
  const candidates = items.map((item) => comparableFrom(item, target)).filter(Boolean);
  const byCurrency = candidates.reduce((groups, item) => {
    (groups[item.currency] ||= []).push(item);
    return groups;
  }, {});
  const currency = Object.keys(byCurrency).sort((a, b) => byCurrency[b].length - byCurrency[a].length)[0];
  if (!currency || byCurrency[currency].length < 6) return { sufficient: false, count: currency ? byCurrency[currency].length : 0 };

  const sameCurrency = byCurrency[currency];
  const preliminary = sameCurrency.map((item) => item.price).sort((a, b) => a - b);
  const q1 = percentile(preliminary, 0.25);
  const q3 = percentile(preliminary, 0.75);
  const iqr = q3 - q1;
  const floor = Math.max(0, q1 - iqr * 1.5);
  const ceiling = q3 + iqr * 1.5;
  const valid = sameCurrency.filter((item) => item.price >= floor && item.price <= ceiling);
  if (valid.length < 6) return { sufficient: false, count: valid.length };

  const prices = valid.map((item) => item.price).sort((a, b) => a - b);
  const median = roundMoney(percentile(prices, 0.5));
  return {
    sufficient: true,
    currency,
    count: valid.length,
    marketMin: roundMoney(percentile(prices, 0.25)),
    marketMax: roundMoney(percentile(prices, 0.75)),
    marketMedian: median,
    suggestedValue: roundMoney(median * 0.85),
    references: valid.sort((a, b) => Math.abs(a.price - median) - Math.abs(b.price - median)).slice(0, 12),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Sesión requerida." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: "Configuración del servidor incompleta." }, 500);

  const token = authorization.replace("Bearer ", "");
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse({ error: "Sesión inválida o vencida." }, 401);

  let payload;
  try { payload = await request.json(); } catch { return jsonResponse({ error: "Solicitud inválida." }, 400); }
  const appraisalId = String(payload.appraisalId || "");
  if (!appraisalId) return jsonResponse({ error: "Falta identificar la tasación." }, 400);

  const [{ data: caller }, { data: appraisal, error: appraisalError }] = await Promise.all([
    adminClient.from("profiles").select("role, active").eq("user_id", authData.user.id).single(),
    adminClient.from("vehicle_appraisals").select("id, lead_id, brand, model, version, vehicle_year, mileage_km, lead:leads!inner(assigned_seller_user_id)").eq("id", appraisalId).single(),
  ]);
  const lead = Array.isArray(appraisal?.lead) ? appraisal.lead[0] : appraisal?.lead;
  const management = caller?.active === true && ["admin", "supervisor", "admventas"].includes(caller.role);
  const owner = caller?.active === true && lead?.assigned_seller_user_id === authData.user.id;
  if (appraisalError || !appraisal) return jsonResponse({ error: "No se encontró la tasación." }, 404);
  if (!management && !owner) return jsonResponse({ error: "No tenés permiso para consultar esta tasación." }, 403);

  const connectionResult = await adminClient.rpc("get_mercadolibre_oauth_connection");
  const connection = Array.isArray(connectionResult.data) ? connectionResult.data[0] : null;
  if (connectionResult.error || !connection?.access_token || !connection?.refresh_token) {
    return jsonResponse({ error: "Mercado Libre todavía no está conectado.", code: "MELI_NOT_CONNECTED" }, 409);
  }

  let accessToken = String(connection.access_token);
  if (new Date(connection.expires_at).getTime() <= Date.now() + 120000) {
    const clientId = Deno.env.get("MELI_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("MELI_CLIENT_SECRET") ?? "";
    if (!clientId || !clientSecret) return jsonResponse({ error: "La renovación de Mercado Libre no está configurada." }, 500);
    const refreshed = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: String(connection.refresh_token),
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!refreshed.ok) return jsonResponse({ error: "Mercado Libre solicita volver a autorizar la conexión." }, 502);
    const credentials = await refreshed.json();
    accessToken = String(credentials.access_token || "");
    const saved = await adminClient.rpc("save_mercadolibre_oauth_connection", {
      p_access_token: accessToken,
      p_refresh_token: String(credentials.refresh_token || connection.refresh_token),
      p_expires_at: new Date(Date.now() + Number(credentials.expires_in || 0) * 1000).toISOString(),
      p_external_user_id: String(connection.external_user_id || credentials.user_id || ""),
      p_scopes: String(credentials.scope || connection.scopes || ""),
    });
    if (saved.error) return jsonResponse({ error: "No se pudo renovar de forma segura la conexión con Mercado Libre." }, 500);
  }

  const categoryId = Deno.env.get("MELI_VEHICLE_CATEGORY_ID") || "MLA1744";
  const query = [appraisal.brand, appraisal.model, appraisal.version, appraisal.vehicle_year].filter(Boolean).join(" ");
  const url = new URL("https://api.mercadolibre.com/sites/MLA/search");
  url.searchParams.set("q", query);
  url.searchParams.set("category", categoryId);
  url.searchParams.set("condition", "used");
  url.searchParams.set("limit", "50");

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(9000),
    });
  } catch (error) {
    const checkedAt = new Date().toISOString();
    await adminClient.from("vehicle_appraisals").update({
      estimated_min: null,
      estimated_max: null,
      market_median: null,
      suggested_value: null,
      market_currency: null,
      estimate_source: "mercadolibre_request_failed",
      estimate_basis: "La consulta a Mercado Libre no pudo completarse por un problema de red o tiempo de espera.",
      reference_count: 0,
      market_references: [],
      market_checked_at: checkedAt,
    }).eq("id", appraisal.id);
    console.error(JSON.stringify({
      event: "mercadolibre_search_transport_failed",
      error_name: safeDiagnostic(error?.name, 80),
      error_message: safeDiagnostic(error?.message),
      category_id: categoryId,
    }));
    return jsonResponse({
      error: "Mercado Libre no respondió a tiempo. Intentá nuevamente.",
      code: "MELI_REQUEST_FAILED",
    }, 502);
  }
  if (!response.ok) {
    const failure = await readUpstreamFailure(response);
    const checkedAt = new Date().toISOString();
    const basis = upstreamFailureBasis(failure);
    await adminClient.from("vehicle_appraisals").update({
      estimated_min: null,
      estimated_max: null,
      market_median: null,
      suggested_value: null,
      market_currency: null,
      estimate_source: "mercadolibre_request_failed",
      estimate_basis: basis,
      reference_count: 0,
      market_references: [],
      market_checked_at: checkedAt,
    }).eq("id", appraisal.id);
    console.error(JSON.stringify({
      event: "mercadolibre_search_failed",
      upstream_status: failure.status,
      upstream_code: failure.code || null,
      upstream_message: failure.message || null,
      category_id: categoryId,
    }));
    const needsAuth = failure.status === 401 || failure.status === 403;
    return jsonResponse({
      error: needsAuth
        ? `Mercado Libre rechazó la autorización de la búsqueda (HTTP ${failure.status}).`
        : `Mercado Libre rechazó la búsqueda (HTTP ${failure.status}).`,
      code: "MELI_SEARCH_FAILED",
      upstreamStatus: failure.status,
      upstreamCode: failure.code || null,
      upstreamMessage: failure.message || null,
    }, 502);
  }
  const market = await response.json();
  const result = calculateReference(Array.isArray(market.results) ? market.results : [], {
    brand: appraisal.brand,
    model: appraisal.model,
    version: appraisal.version,
    year: Number(appraisal.vehicle_year),
    mileage: Number(appraisal.mileage_km),
  });

  if (!result.sufficient) {
    await adminClient.from("vehicle_appraisals").update({
      estimated_min: null,
      estimated_max: null,
      market_median: null,
      suggested_value: null,
      market_currency: null,
      estimate_source: "mercadolibre_insufficient_sample",
      estimate_basis: "Se requieren al menos 6 publicaciones comparables válidas.",
      reference_count: result.count,
      market_references: [],
      market_checked_at: new Date().toISOString(),
    }).eq("id", appraisal.id);
    return jsonResponse({ sufficient: false, count: result.count, message: "No hay suficientes publicaciones equivalentes para calcular una referencia confiable." });
  }

  const estimateBasis = "Mediana de publicaciones activas equivalentes en Mercado Libre; valor sugerido de toma = mediana menos 15%.";
  const { error: updateError } = await adminClient.from("vehicle_appraisals").update({
    estimated_min: result.marketMin,
    estimated_max: result.marketMax,
    market_median: result.marketMedian,
    suggested_value: result.suggestedValue,
    market_currency: result.currency,
    estimate_source: "mercadolibre_active_listings",
    estimate_basis: estimateBasis,
    reference_count: result.count,
    market_references: result.references,
    market_checked_at: new Date().toISOString(),
    status: "pending",
    confirmed_value: null,
    confirmed_currency: null,
    review_note: "",
    reviewed_by: null,
    reviewed_at: null,
  }).eq("id", appraisal.id);
  if (updateError) return jsonResponse({ error: "No se pudo guardar la referencia de mercado." }, 500);

  await adminClient.from("lead_activities").insert({
    lead_id: appraisal.lead_id,
    actor_user_id: authData.user.id,
    activity_type: "vehicle_market_reference_checked",
    title: "Referencia de Mercado Libre actualizada",
    detail: `${result.count} comparables · toma sugerida 15% debajo de la mediana`,
    metadata: { appraisal_id: appraisal.id, currency: result.currency, market_median: result.marketMedian, suggested_value: result.suggestedValue },
  });

  return jsonResponse({
    sufficient: true,
    currency: result.currency,
    count: result.count,
    marketMin: result.marketMin,
    marketMax: result.marketMax,
    marketMedian: result.marketMedian,
    suggestedValue: result.suggestedValue,
    references: result.references,
  });
});
