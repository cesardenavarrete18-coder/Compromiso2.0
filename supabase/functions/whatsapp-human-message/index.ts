import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Configuración del servidor incompleta" }, 500);
  if (!token) return json({ error: "Sesión requerida" }, 401);

  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authResult = await userDb.auth.getUser(token);
  const user = authResult.data.user;
  if (authResult.error || !user) return json({ error: "La sesión no es válida" }, 401);

  let input: { leadId?: string; message?: string };
  try {
    input = await request.json();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }
  const leadId = String(input.leadId ?? "").trim();
  const message = String(input.message ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return json({ error: "Lead inválido" }, 400);
  if (!message || message.length > 4096) return json({ error: "El mensaje debe tener entre 1 y 4096 caracteres" }, 400);

  // Both reads are protected by RLS: only management or the assigned seller can pass.
  const [leadResult, controlResult] = await Promise.all([
    userDb.from("leads").select("id, customer_phone").eq("id", leadId).single(),
    userDb.from("whatsapp_conversation_controls").select("mode").eq("lead_id", leadId).maybeSingle(),
  ]);
  if (leadResult.error || !leadResult.data) return json({ error: "No tenés permiso para acceder a esta conversación" }, 403);
  if (controlResult.error || controlResult.data?.mode !== "human") {
    return json({ error: "Tomá la conversación antes de responder" }, 409);
  }

  const adminDb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Recheck with the service client just before sending to avoid replying after a release.
  const liveControl = await adminDb.from("whatsapp_conversation_controls").select("mode").eq("lead_id", leadId).maybeSingle();
  if (liveControl.data?.mode !== "human") return json({ error: "La conversación volvió a la IA" }, 409);

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const graphVersion = Deno.env.get("META_GRAPH_API_VERSION") ?? "v25.0";
  if (!accessToken || !phoneNumberId) return json({ error: "WhatsApp no está configurado" }, 500);

  const metaResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: leadResult.data.customer_phone, type: "text", text: { preview_url: false, body: message } }),
  });
  const metaPayload = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) {
    console.error("Human WhatsApp send failed", JSON.stringify(metaPayload));
    return json({ error: "WhatsApp rechazó el envío. Verificá que la conversación esté dentro de la ventana de atención de 24 horas." }, 502);
  }

  const whatsappMessageId = Array.isArray(metaPayload?.messages) ? metaPayload.messages[0]?.id ?? null : null;
  const now = new Date().toISOString();
  const persistence = await Promise.all([
    adminDb.from("lead_messages").insert({
      lead_id: leadId,
      whatsapp_message_id: whatsappMessageId,
      direction: "outbound",
      message_type: "text",
      body: message,
      raw_payload: metaPayload,
      origin: "human",
    }),
    adminDb.from("whatsapp_conversation_controls").update({ last_human_message_at: now }).eq("lead_id", leadId).eq("mode", "human"),
    adminDb.from("whatsapp_conversation_events").insert({ lead_id: leadId, actor_user_id: user.id, event_type: "message_sent", body: message, metadata: { whatsapp_message_id: whatsappMessageId } }),
    adminDb.from("leads").update({ last_message_at: now }).eq("id", leadId),
  ]);
  const persistenceError = persistence.find((item) => item.error)?.error;
  if (persistenceError) {
    console.error("Human WhatsApp persistence failed", persistenceError.message);
    return json({ error: "El mensaje se envió, pero no pudo guardarse completamente en el historial" }, 500);
  }

  return json({ sent: true, whatsappMessageId });
});
