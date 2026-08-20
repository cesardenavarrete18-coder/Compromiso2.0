import { createClient } from "npm:@supabase/supabase-js@2.112.2";

function page(title, message, ok) {
  const color = ok ? "#08734f" : "#b42318";
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="margin:0;background:#eef4f8;font:16px system-ui;color:#092c5c"><main style="max-width:560px;margin:12vh auto;padding:32px;border-radius:16px;background:#fff;box-shadow:0 18px 60px #08284920"><div style="width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:${color}18;color:${color};font-size:28px;font-weight:800">${ok ? "✓" : "!"}</div><h1>${title}</h1><p style="line-height:1.55;color:#526b82">${message}</p><p style="font-size:13px;color:#74899b">Ya podés cerrar esta ventana y volver al CRM.</p></main></body></html>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return page("Solicitud inválida", "Mercado Libre no envió una autorización válida.", false);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return page("Autorización incompleta", "Falta el código o el estado de seguridad.", false);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const clientId = Deno.env.get("MELI_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("MELI_CLIENT_SECRET") ?? "";
  const redirectUri = Deno.env.get("MELI_REDIRECT_URI") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret || !redirectUri) return page("Configuración incompleta", "Faltan credenciales seguras del servidor.", false);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const consumed = await admin.rpc("consume_mercadolibre_oauth_state", { p_state_hash: await sha256(state) });
  if (consumed.error || consumed.data !== true) return page("Autorización vencida", "El enlace de conexión expiró o ya fue utilizado.", false);

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) return page("No se pudo conectar", "Mercado Libre rechazó el intercambio de autorización. Revisaremos la configuración antes de reintentarlo.", false);
  const credentials = await response.json();
  const expiresAt = new Date(Date.now() + Number(credentials.expires_in || 0) * 1000).toISOString();
  const saved = await admin.rpc("save_mercadolibre_oauth_connection", {
    p_access_token: credentials.access_token,
    p_refresh_token: credentials.refresh_token,
    p_expires_at: expiresAt,
    p_external_user_id: String(credentials.user_id || ""),
    p_scopes: String(credentials.scope || ""),
  });
  if (saved.error) return page("No se pudo guardar la conexión", "La autorización fue recibida, pero no pudo almacenarse de manera segura.", false);
  return page("Mercado Libre conectado", "La cuenta quedó autorizada y los tokens fueron guardados cifrados. La renovación será automática.", true);
});
