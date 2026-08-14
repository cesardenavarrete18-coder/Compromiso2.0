import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type LeadDecision = {
  qualification_status: "qualified" | "follow_up" | "unqualified";
  priority: "low" | "normal" | "high";
  intent_summary: string;
  model_interest: string;
  disqualify_reason: string;
  reply_text: string;
};

const encoder = new TextEncoder();

function response(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json" },
  });
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function validMetaSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return timingSafeEqual(`sha256=${hex(digest)}`, signature.toLowerCase());
}

function messageText(message: JsonRecord) {
  const text = message.text as JsonRecord | undefined;
  if (typeof text?.body === "string") return text.body.trim();
  const button = message.button as JsonRecord | undefined;
  if (typeof button?.text === "string") return button.text.trim();
  const interactive = message.interactive as JsonRecord | undefined;
  const reply = (interactive?.button_reply || interactive?.list_reply) as JsonRecord | undefined;
  return typeof reply?.title === "string" ? reply.title.trim() : "";
}

function isConversationalMessage(message: JsonRecord) {
  return ["text", "button", "interactive"].includes(String(message.type ?? "")) && messageText(message).length > 0;
}

function fallbackDecision(text: string): LeadDecision {
  const normalized = text.toLocaleLowerCase("es-AR");
  const salesIntent = /(0\s?km|auto|veh[ií]culo|modelo|cuota|anticipo|financi|plan|precio|entrega|volkswagen|peugeot|fiat)/i.test(normalized);
  const urgent = /(hoy|urgente|ya|comprar|seña|entrega inmediata)/i.test(normalized);
  return {
    qualification_status: salesIntent ? "qualified" : "follow_up",
    priority: urgent ? "high" : "normal",
    intent_summary: salesIntent ? "Consulta comercial recibida por WhatsApp" : "Contacto nuevo pendiente de ampliar información",
    model_interest: "",
    disqualify_reason: "",
    reply_text: salesIntent
      ? "¡Hola! Soy el asistente de Grupo Sur Automotores. Para orientarte mejor, ¿qué modelo estás buscando y con qué anticipo aproximado contás?"
      : "¡Hola! Soy el asistente de Grupo Sur Automotores. ¿Qué vehículo 0 km estás buscando?",
  };
}

async function analyzeLeadConversation(history: string[], text: string, qualificationRules = "", vectorStoreId = ""): Promise<LeadDecision> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey || !text) return fallbackDecision(text);

  const conversation = [...history, `Cliente: ${text}`].slice(-12).join("\n");

  try {
    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_LEAD_MODEL") ?? "gpt-4.1-mini",
        store: false,
        max_output_tokens: 650,
        input: [
          {
            role: "developer",
            content: `Sos el asistente comercial de Grupo Sur Automotores, una concesionaria argentina de vehículos 0 km.
Tu tarea es filtrar el lead y redactar la próxima respuesta de WhatsApp en español rioplatense profesional, cálido y breve.

Datos que conviene reunir de manera natural: modelo de interés, tipo de operación, anticipo disponible, si entrega usado (marca/modelo/año/km), zona, plazo de compra y experiencia previa con financiación.
- Hacé como máximo dos preguntas por mensaje y no repitas datos ya informados.
- Respondé específicamente a lo que dijo el cliente: mencioná el modelo, usado, anticipo, zona o plazo cuando ya estén informados. Evitá respuestas genéricas que podrían servir para cualquier conversación.
- Presentate solamente en el primer mensaje de la conversación. En los siguientes, continuá naturalmente sin volver a saludar ni explicar que sos un asistente.
- Preferí una sola pregunta concreta por turno. Si el cliente ya dio información suficiente, resumila y derivá en lugar de seguir interrogándolo.
- No inventes precios, cuotas, stock, aprobaciones crediticias ni fechas de entrega.
- Si ya hay al menos tres datos comerciales útiles, confirmá un resumen breve e indicá que un asesor continuará la gestión.
- qualified: intención comercial concreta y datos suficientes para derivar.
- follow_up: posible lead, pero todavía faltan datos.
- unqualified: empleo, proveedor, spam o asunto ajeno. En ese caso respondé cortésmente que el canal es para consultas de vehículos.
- priority high solo cuando expresa urgencia real, disponibilidad inmediata para avanzar o señar.
- reply_text debe poder enviarse directamente por WhatsApp y no superar 600 caracteres.

Reglas comerciales configuradas por Administración:
${qualificationRules || "Aplicá los criterios generales anteriores."}

Si hay documentos comerciales disponibles, consultalos cuando la respuesta dependa de condiciones, modelos, planes o argumentos de venta. Nunca inventes un dato ausente.`,
          },
          { role: "user", content: conversation.slice(-8000) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "lead_decision",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                qualification_status: { type: "string", enum: ["qualified", "follow_up", "unqualified"] },
                priority: { type: "string", enum: ["low", "normal", "high"] },
                intent_summary: { type: "string" },
                model_interest: { type: "string" },
                disqualify_reason: { type: "string" },
                reply_text: { type: "string" },
              },
              required: ["qualification_status", "priority", "intent_summary", "model_interest", "disqualify_reason", "reply_text"],
            },
          },
        },
        ...(vectorStoreId ? {
          tools: [{ type: "file_search", vector_store_ids: [vectorStoreId], max_num_results: 3 }],
        } : {}),
      }),
    });
    if (!result.ok) {
      const errorBody = await result.text();
      console.error("OpenAI analysis failed", result.status, errorBody.slice(0, 1200));
      return fallbackDecision(text);
    }
    const payload = await result.json();
    const outputText = (payload.output || [])
      .flatMap((item: JsonRecord) => Array.isArray(item.content) ? item.content : [])
      .find((item: JsonRecord) => item.type === "output_text")?.text;
    if (typeof outputText !== "string") return fallbackDecision(text);
    return JSON.parse(outputText) as LeadDecision;
  } catch (error) {
    console.error("OpenAI analysis exception", error instanceof Error ? error.message : String(error));
    return fallbackDecision(text);
  }
}

async function sendWhatsAppText(to: string, body: string) {
  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const graphVersion = Deno.env.get("META_GRAPH_API_VERSION") ?? "v25.0";
  if (!accessToken || !phoneNumberId || !body) {
    return { ok: false, messageId: "", payload: { error: "WhatsApp sending configuration incomplete" } };
  }

  const result = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4096) },
    }),
  });
  const payload = await result.json().catch(() => ({})) as JsonRecord;
  const sentMessages = Array.isArray(payload.messages) ? payload.messages as JsonRecord[] : [];
  return { ok: result.ok, messageId: String(sentMessages[0]?.id ?? ""), payload };
}

function argentinaDayStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T00:00:00-03:00`;
}

function candidateCodes(text: string) {
  return Array.from(new Set(text.toUpperCase().match(/\b[A-Z]{2,}[A-Z0-9_-]*\d[A-Z0-9_-]*\b/g) || []));
}

Deno.serve(async (request) => {
  const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    return mode === "subscribe" && token === verifyToken ? response(challenge) : response("Forbidden", 403);
  }

  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const rawBody = await request.text();
  const signatureOk = await validMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), Deno.env.get("META_APP_SECRET") ?? "");
  if (!signatureOk) return response({ error: "Invalid Meta signature" }, 401);

  let webhook: JsonRecord;
  try {
    webhook = JSON.parse(rawBody);
  } catch {
    return response({ error: "Invalid JSON" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return response({ error: "Server configuration incomplete" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const assistantSettingsResult = await db
    .from("ai_assistant_settings")
    .select("qualification_rules, vector_store_id")
    .eq("id", true)
    .maybeSingle();
  const assistantSettings = assistantSettingsResult.data || { qualification_rules: "", vector_store_id: "" };

  const entries = Array.isArray(webhook.entry) ? webhook.entry as JsonRecord[] : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes as JsonRecord[] : [];
    for (const change of changes) {
      const value = change.value as JsonRecord | undefined;
      const messages = Array.isArray(value?.messages) ? value.messages as JsonRecord[] : [];
      const contacts = Array.isArray(value?.contacts) ? value.contacts as JsonRecord[] : [];
      for (const message of messages) {
        // Meta también entrega reacciones, imágenes, ubicaciones y otros eventos en
        // `messages`. Solo el contenido conversacional debe activar a la IA o
        // modificar el estado del lead.
        if (!isConversationalMessage(message)) continue;

        const whatsappMessageId = String(message.id ?? "");
        const duplicate = whatsappMessageId
          ? await db.from("lead_messages").select("id").eq("whatsapp_message_id", whatsappMessageId).maybeSingle()
          : { data: null };
        if (duplicate.data) continue;

        const customerPhone = String(message.from ?? contacts[0]?.wa_id ?? "").replace(/\D/g, "");
        if (customerPhone.length < 6) continue;
        const profile = contacts[0]?.profile as JsonRecord | undefined;
        const customerName = typeof profile?.name === "string" ? profile.name.slice(0, 120) : null;
        const body = messageText(message);
        const codes = candidateCodes(body);

        const existingResult = await db
          .from("leads")
          .select("id, assigned_seller_user_id, routing_status, qualification_status")
          .eq("customer_phone", customerPhone)
          .not("routing_status", "in", "(closed,lost)")
          .gte("last_message_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const existing = existingResult.data;

        // Una vez calificado, el lead ya fue transferido al equipo comercial.
        // Los mensajes posteriores se conservan y notifican al supervisor, pero
        // la IA no reinicia el cuestionario ni compite con la atención humana.
        if (existing?.qualification_status === "qualified") {
          await db.from("lead_messages").insert({
            lead_id: existing.id,
            whatsapp_message_id: whatsappMessageId || null,
            direction: "inbound",
            message_type: String(message.type ?? "unknown"),
            body,
            raw_payload: message,
          });
          await db.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", existing.id);

          const supervisors = await db.from("profiles").select("user_id").eq("role", "supervisor").eq("active", true);
          if (supervisors.data?.length) {
            await db.from("supervisor_notifications").insert(supervisors.data.map((supervisor) => ({
              recipient_user_id: supervisor.user_id,
              lead_id: existing.id,
              notification_type: "routing_alert",
              title: "Nuevo mensaje de un lead calificado",
              body: `${customerName || customerPhone}: ${body}`.slice(0, 500),
            })));
          }
          continue;
        }

        const historyResult = existing?.id
          ? await db.from("lead_messages").select("direction, body").eq("lead_id", existing.id).order("created_at", { ascending: false }).limit(11)
          : { data: [] };
        const history = (historyResult.data || []).reverse().map((item) => `${item.direction === "outbound" ? "Asistente" : "Cliente"}: ${item.body}`);
        const classification = await analyzeLeadConversation(
          history,
          body,
          String(assistantSettings.qualification_rules || ""),
          String(assistantSettings.vector_store_id || ""),
        );

        let seller: JsonRecord | null = null;
        if (!existing?.assigned_seller_user_id && codes.length) {
          const sellerResult = await db
            .from("profiles")
            .select("user_id, seller_code, full_name")
            .eq("role", "seller")
            .eq("active", true)
            .in("seller_code", codes)
            .limit(1)
            .maybeSingle();
          seller = sellerResult.data;
        }

        let routingStatus = existing?.routing_status || "pending_supervisor";
        let routingReason = existing?.assigned_seller_user_id ? "existing_owner" : "general_inbox";
        let assignedSellerId = existing?.assigned_seller_user_id || null;
        let assignedAt: string | null = assignedSellerId ? new Date().toISOString() : null;

        if (seller?.user_id) {
          const settingsResult = await db.from("seller_routing_settings").select("daily_quota, paused").eq("seller_user_id", seller.user_id).maybeSingle();
          const settings = settingsResult.data || { daily_quota: 20, paused: false };
          const assignedToday = await db.from("leads").select("id", { count: "exact", head: true }).eq("assigned_seller_user_id", seller.user_id).gte("assigned_at", argentinaDayStart());
          if (!settings.paused && (assignedToday.count || 0) < settings.daily_quota) {
            routingStatus = "assigned_direct";
            routingReason = "valid_seller_code";
            assignedSellerId = seller.user_id as string;
            assignedAt = new Date().toISOString();
          } else {
            routingReason = settings.paused ? "seller_paused" : "daily_quota_reached";
          }
        } else if (codes.length && !existing?.assigned_seller_user_id) {
          routingReason = "invalid_seller_code";
        }

        const leadValues = {
          customer_phone: customerPhone,
          customer_name: customerName,
          source_channel: codes.length ? "tiktok" : "whatsapp",
          source_detail: codes.length ? "seller_code" : "organic",
          seller_code_received: codes[0] || null,
          qualification_status: classification.qualification_status,
          priority: classification.priority,
          intent_summary: classification.intent_summary,
          model_interest: classification.model_interest || null,
          disqualify_reason: classification.disqualify_reason || null,
          routing_status: routingStatus,
          routing_reason: routingReason,
          assigned_seller_user_id: assignedSellerId,
          assigned_at: assignedAt,
          last_message_at: new Date().toISOString(),
          metadata: { phone_number_id: (value?.metadata as JsonRecord | undefined)?.phone_number_id || null },
        };

        const leadResult = existing
          ? await db.from("leads").update(leadValues).eq("id", existing.id).select("id").single()
          : await db.from("leads").insert(leadValues).select("id").single();
        if (leadResult.error || !leadResult.data) continue;

        await db.from("lead_messages").insert({
          lead_id: leadResult.data.id,
          whatsapp_message_id: whatsappMessageId || null,
          direction: "inbound",
          message_type: String(message.type ?? "unknown"),
          body,
          raw_payload: message,
        });

        const outgoingBody = classification.reply_text.trim();
        if (outgoingBody) {
          const outgoing = await sendWhatsAppText(customerPhone, outgoingBody);
          if (outgoing.ok) {
            await db.from("lead_messages").insert({
              lead_id: leadResult.data.id,
              whatsapp_message_id: outgoing.messageId || null,
              direction: "outbound",
              message_type: "text",
              body: outgoingBody,
              raw_payload: outgoing.payload,
            });
          } else {
            console.error("WhatsApp send failed", JSON.stringify(outgoing.payload));
          }
        }

        if (!existing && assignedSellerId) {
          await db.from("lead_assignments").insert({
            lead_id: leadResult.data.id,
            seller_user_id: assignedSellerId,
            assignment_type: "direct_code",
            reason: routingReason,
          });
        }

        const supervisors = await db.from("profiles").select("user_id").eq("role", "supervisor").eq("active", true);
        if (supervisors.data?.length) {
          await db.from("supervisor_notifications").insert(supervisors.data.map((supervisor) => ({
            recipient_user_id: supervisor.user_id,
            lead_id: leadResult.data.id,
            notification_type: assignedSellerId ? "direct_assignment" : "new_pending_lead",
            title: assignedSellerId ? "Lead derivado por código" : "Nuevo lead para asignar",
            body: `${customerName || customerPhone}: ${classification.intent_summary}`.slice(0, 500),
          })));
        }
      }
    }
  }

  return response({ received: true });
});
