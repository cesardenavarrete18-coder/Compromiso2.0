import { createClient } from "@supabase/supabase-js";
import { candidateAdvisorName, candidateCodes, knownAdvisorName, mentionsTikTok, normalizedPersonName } from "./routing-identifiers.ts";
import { enforceVehicleFacts, firstName, handoffReply, hasKnownCommercialOperation, polishCommercialReply, qualifyAndHandoffReply, shouldForceHandoff, tiktokIdentifierReply } from "./conversation-style.ts";

type JsonRecord = Record<string, unknown>;

type LeadDecision = {
  qualification_status: "qualified" | "follow_up" | "unqualified";
  priority: "low" | "normal" | "high";
  intent_summary: string;
  model_interest: string;
  disqualify_reason: string;
  reply_text: string;
};

type TrainingExample = {
  conversation: string;
  expected_status: string;
  expected_reply: string;
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

const advertisedVehicles = [
  ["peugeot partner", "Peugeot Partner"],
  ["peugeot expert", "Peugeot Expert"],
  ["peugeot 2008", "Peugeot 2008"],
  ["peugeot 208", "Peugeot 208"],
  ["volkswagen amarok", "Volkswagen Amarok"],
  ["volkswagen taos", "Volkswagen Taos"],
  ["volkswagen t-cross", "Volkswagen T-Cross"],
  ["volkswagen tcross", "Volkswagen T-Cross"],
  ["volkswagen tera", "Volkswagen Tera"],
  ["volkswagen nivus", "Volkswagen Nivus"],
  ["volkswagen virtus", "Volkswagen Virtus"],
  ["volkswagen polo", "Volkswagen Polo Robust"],
  ["fiat cronos", "Fiat Cronos"],
  ["fiat mobi", "Fiat Mobi"],
  ["fiat strada", "Fiat Strada"],
  ["fiat toro", "Fiat Toro"],
  ["fiat fiorino", "Fiat Fiorino"],
  ["fiat fastback", "Fiat Fastback"],
] as const;

function advertisedVehicle(referral: JsonRecord | undefined) {
  const source = `${String(referral?.headline ?? "")} ${String(referral?.body ?? "")}`.toLocaleLowerCase("es-AR");
  const exact = advertisedVehicles.find(([needle]) => source.includes(needle));
  if (exact) return exact[1];
  const uniqueNames = advertisedVehicles.filter(([needle]) => source.includes(needle.split(" ").slice(1).join(" ")));
  return uniqueNames.length === 1 ? uniqueNames[0][1] : "";
}

function mentionedVehicle(text: string) {
  const source = String(text || "").toLocaleLowerCase("es-AR");
  const matches = new Set<string>();
  for (const [needle, canonical] of advertisedVehicles) {
    const modelName = needle.split(" ").slice(1).join(" ");
    if (source.includes(needle) || (modelName && source.includes(modelName))) matches.add(canonical);
  }
  return matches.size === 1 ? Array.from(matches)[0] : "";
}

function fallbackDecision(text: string, advertisedInterest = "", customerName = "", isFirstReply = true): LeadDecision {
  const normalized = text.toLocaleLowerCase("es-AR");
  const salesIntent = Boolean(advertisedInterest) || /(0\s?km|auto|veh[ií]culo|modelo|cuota|anticipo|financi|plan|precio|entrega|volkswagen|peugeot|fiat)/i.test(normalized);
  const urgent = /(hoy|urgente|ya|comprar|seña|entrega inmediata)/i.test(normalized);
  const greeting = isFirstReply ? `¡Hola${firstName(customerName) ? ` ${firstName(customerName)}` : ""}! ` : "";
  return {
    qualification_status: salesIntent ? "qualified" : "follow_up",
    priority: urgent ? "high" : "normal",
    intent_summary: advertisedInterest ? `Consulta por ${advertisedInterest} recibida desde Meta Ads` : salesIntent ? "Consulta comercial recibida por WhatsApp" : "Contacto nuevo pendiente de ampliar información",
    model_interest: advertisedInterest,
    disqualify_reason: "",
    reply_text: salesIntent
      ? advertisedInterest
        ? `${greeting}Tengo registrada tu consulta por ${advertisedInterest}. Puedo ayudarte con versiones, financiación o compra al contado. ¿Cuál de esas opciones querés ver primero?`
        : `${greeting}Soy el asistente de Compromiso mi 0km. Para orientarte mejor, ¿qué modelo estás buscando y qué tipo de operación tenés en mente?`
      : `${greeting}Soy el asistente de Compromiso mi 0km. ¿Qué vehículo 0 km estás buscando?`,
  };
}

function exampleTokens(value: string) {
  return new Set(String(value).toLocaleLowerCase("es-AR").match(/[a-záéíóúñ0-9]{4,}/g) || []);
}

function selectTrainingExamples(examples: TrainingExample[], text: string, advertisedInterest: string) {
  const target = exampleTokens(`${text} ${advertisedInterest}`);
  return examples.map((example) => {
    const source = exampleTokens(example.conversation);
    let score = 0;
    target.forEach((token) => { if (source.has(token)) score += 1; });
    return { example, score };
  }).sort((left, right) => right.score - left.score).slice(0, 4).map((item) => item.example);
}

async function analyzeLeadConversation(
  history: string[],
  text: string,
  qualificationRules = "",
  conversationStyle = "",
  vectorStoreId = "",
  referralContext = "",
  advertisedInterest = "",
  customerName = "",
  customerPhone = "",
  trainingExamples: TrainingExample[] = [],
): Promise<LeadDecision> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const isFirstReply = history.length === 0;
  const priorAssistantReplies = history.filter((item) => item.startsWith("Asistente:")).length;
  if (!apiKey || !text) return fallbackDecision(text, advertisedInterest, customerName, isFirstReply);

  const contactContext = `Datos autorizados del contacto:\nNombre: ${customerName || "no informado"}\nTeléfono: ${customerPhone || "no informado"}`;
  const conversation = [contactContext, referralContext, ...history, `Cliente: ${text}`].filter(Boolean).slice(-14).join("\n");
  const examples = selectTrainingExamples(trainingExamples, text, advertisedInterest);
  const examplesContext = examples.length
    ? examples.map((example, index) => `Ejemplo aprobado ${index + 1}:\n${example.conversation}\nEstado esperado: ${example.expected_status}\nRespuesta esperada: ${example.expected_reply}`).join("\n\n")
    : "Todavía no hay ejemplos corregidos aplicables.";

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

Datos que conviene reunir de manera natural: modelo de interés, tipo de operación, anticipo disponible, si entrega usado (marca/modelo/año/km), zona y plazo de compra. No necesitás reunirlos todos para derivar.
- Tu prioridad es ayudar, no completar un formulario. Primero respondé con información útil y después, solamente si hace falta para avanzar, hacé una pregunta concreta.
- Hacé como máximo una pregunta por mensaje. También podés responder sin preguntas.
- No encadenes preguntas de preferencia. Si el cliente pide precios, versiones, equipamiento, ubicación o condiciones, respondé primero esa consulta usando la información disponible y recién después pedí un único dato indispensable.
- Evitá muletillas repetidas como “para orientarte mejor”, “así podemos ayudarte mejor” o “¿querés que te detalle...?”. No prometas información para volver a preguntar lo mismo en el mensaje siguiente.
- No repitas datos ya informados como si los estuvieras descubriendo de nuevo.
- Respondé específicamente a lo que dijo el cliente: mencioná el modelo, usado, anticipo, zona o plazo cuando ya estén informados. Evitá respuestas genéricas que podrían servir para cualquier conversación.
- La referencia del anuncio de Meta es un dato comercial confirmado, no una pista opcional. Si identifica un modelo concreto, asumí que ese es el modelo consultado, guardalo en model_interest y mencioná ese modelo en la primera respuesta. No vuelvas a preguntar qué modelo quiere salvo que el cliente diga expresamente que busca otro o que el anuncio sea ambiguo.
- Presentate solamente en el primer mensaje de la conversación. En los siguientes, continuá naturalmente sin volver a saludar ni explicar que sos un asistente.
- En la primera respuesta podés saludar usando solamente el nombre de pila. Después no vuelvas a usar el nombre como encabezado o muletilla. No repitas el teléfono ni otros datos personales en la respuesta.
- Preferí una sola pregunta concreta por turno. Si el cliente ya dio información suficiente, resumila y derivá en lugar de seguir interrogándolo.
- No inventes precios, cuotas, stock, aprobaciones crediticias ni fechas de entrega.
- Hecho obligatorio de producto: Volkswagen Tera es un SUV compacto. Nunca lo describas como pick-up. Si no conocés con certeza la carrocería o una especificación de otro modelo, no la inventes.
- Si el cliente dice que viene de TikTok y todavía no informó un código o asesor identificable, pedí exclusivamente el código TikTok del vendedor o el nombre y apellido del asesor. No lo trates como tráfico web u orgánico. El código TikTok es público y distinto del código interno de acceso al portal.
- Si ya conocés modelo y modalidad de compra, o ya hay tres datos comerciales útiles, dejá de preguntar: confirmá brevemente lo entendido e indicá que un asesor continuará la gestión.
- Si la persona está lejos de la sucursal, no supongas que quiere viajar ni insistas con una visita; explicá las alternativas reales de atención remota disponibles en la documentación.
- Nunca prolongues el cuestionario durante más de cinco respuestas de la IA. Derivá antes si ya hay intención comercial clara.
- qualified: intención comercial concreta y datos suficientes para derivar.
- follow_up: posible lead, pero todavía faltan datos.
- unqualified: empleo, proveedor, spam o asunto ajeno. En ese caso respondé cortésmente que el canal es para consultas de vehículos.
- priority high solo cuando expresa urgencia real, disponibilidad inmediata para avanzar o señar.
- reply_text debe poder enviarse directamente por WhatsApp y no superar 600 caracteres.

Reglas comerciales configuradas por Administración:
${qualificationRules || "Aplicá los criterios generales anteriores."}

Personalidad y estilo configurados por Administración:
${conversationStyle || "Respondé con calidez, naturalidad y una sola pregunta concreta por turno."}

Ejemplos revisados por Supervisión. Usalos como guía de tono y criterio cuando sean pertinentes; no copies datos personales ni detalles de otro cliente:
${examplesContext}

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
      return fallbackDecision(text, advertisedInterest, customerName, history.length === 0);
    }
    const payload = await result.json();
    const outputText = (payload.output || [])
      .flatMap((item: JsonRecord) => Array.isArray(item.content) ? item.content : [])
      .find((item: JsonRecord) => item.type === "output_text")?.text;
    if (typeof outputText !== "string") return fallbackDecision(text, advertisedInterest, customerName, history.length === 0);
    const decision = JSON.parse(outputText) as LeadDecision;
    if (advertisedInterest) {
      decision.model_interest = advertisedInterest;
      if (!history.length && /qu[eé]\s+modelo|cu[aá]l\s+modelo/i.test(decision.reply_text)) {
        decision.reply_text = fallbackDecision(text, advertisedInterest, customerName, true).reply_text;
      }
    }
    const customerConversation = [...history.filter((item) => item.startsWith("Cliente:")), `Cliente: ${text}`].join("\n");
    if ((decision.model_interest || advertisedInterest) && hasKnownCommercialOperation(customerConversation) && decision.qualification_status !== "unqualified") {
      decision.qualification_status = "qualified";
      decision.reply_text = qualifyAndHandoffReply(decision.reply_text, decision.model_interest || advertisedInterest);
    } else if (shouldForceHandoff(priorAssistantReplies, decision.qualification_status)) {
      decision.qualification_status = "qualified";
      decision.reply_text = handoffReply(decision.model_interest || advertisedInterest);
    }
    decision.reply_text = enforceVehicleFacts(
      polishCommercialReply(decision.reply_text, customerName, isFirstReply),
      decision.model_interest || advertisedInterest,
    );
    return decision;
  } catch (error) {
    console.error("OpenAI analysis exception", error instanceof Error ? error.message : String(error));
    return fallbackDecision(text, advertisedInterest, customerName, history.length === 0);
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

  const [assistantSettingsResult, trainingExamplesResult] = await Promise.all([
    db.from("ai_assistant_settings").select("qualification_rules, conversation_style, vector_store_id").eq("id", true).maybeSingle(),
    db.from("ai_training_examples").select("conversation, expected_status, expected_reply").eq("active", true).neq("expected_reply", "").order("updated_at", { ascending: false }).limit(20),
  ]);
  const assistantSettings = assistantSettingsResult.data || { qualification_rules: "", conversation_style: "", vector_store_id: "" };
  const trainingExamples = (trainingExamplesResult.data || []) as TrainingExample[];

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
        const referral = message.referral as JsonRecord | undefined;
        const hasMetaReferral = Boolean(referral && (referral.ctwa_clid || referral.source_id || referral.source_url));
        const incomingMentionsTikTok = mentionsTikTok(body);
        let codes = candidateCodes(body);
        let advisorName = candidateAdvisorName(body);
        let tiktokIdentifierType = codes.length ? "tiktok_code" : advisorName ? "advisor_name" : "";
        let tiktokMentioned = Boolean(tiktokIdentifierType) || incomingMentionsTikTok;
        const initialMetadata = {
          phone_number_id: (value?.metadata as JsonRecord | undefined)?.phone_number_id || null,
          referral: hasMetaReferral ? referral : null,
        };
        const claimResult = await db.rpc("claim_whatsapp_lead", {
          p_customer_phone: customerPhone,
          p_customer_name: customerName,
          p_source_channel: tiktokMentioned ? "tiktok" : "whatsapp",
          p_source_detail: tiktokIdentifierType || (incomingMentionsTikTok ? "pending_identifier" : hasMetaReferral ? "meta_ads" : "organic"),
          p_metadata: initialMetadata,
        });
        const claim = Array.isArray(claimResult.data) ? claimResult.data[0] : null;
        if (claimResult.error || !claim?.lead_id) {
          console.error("WhatsApp lead claim failed", claimResult.error?.message || "No lead returned");
          continue;
        }
        const leadId = String(claim.lead_id);

        // Persist first, analyze second. Besides preserving the complete conversation,
        // the unique WhatsApp id makes concurrent Meta retries harmless.
        const inboundResult = await db.from("lead_messages").insert({
          lead_id: leadId,
          whatsapp_message_id: whatsappMessageId || null,
          direction: "inbound",
          message_type: String(message.type ?? "unknown"),
          body,
          raw_payload: message,
          origin: "customer",
        }).select("id, created_at").single();
        if (inboundResult.error) {
          if (inboundResult.error.code === "23505") continue;
          console.error("Inbound message persistence failed", inboundResult.error.message);
          continue;
        }

        if (claim.created_new) {
          const dueAt = new Date(new Date(inboundResult.data.created_at).getTime() + 2 * 60 * 60 * 1000).toISOString();
          const reminderResult = await db.from("whatsapp_follow_up_reminders").insert({
            lead_id: leadId,
            first_inbound_message_id: inboundResult.data.id,
            due_at: dueAt,
          });
          if (reminderResult.error) console.error("Reminder scheduling failed", reminderResult.error.message);
        } else {
          const reminderCancellation = await db.from("whatsapp_follow_up_reminders").update({
            status: "cancelled",
            last_error: "El cliente respondió antes del recordatorio",
          }).eq("lead_id", leadId).in("status", ["pending", "processing"]);
          if (reminderCancellation.error) console.error("Reminder cancellation failed", reminderCancellation.error.message);
        }

        const existingResult = await db
          .from("leads")
          .select("id, assigned_seller_user_id, assigned_at, routing_status, qualification_status, do_not_contact, model_interest, source_channel, source_detail, seller_code_received, metadata")
          .eq("id", leadId)
          .single();
        const existing = existingResult.data;
        const storedMetadata = existing?.metadata as JsonRecord | undefined;
        const storedReferral = storedMetadata?.referral as JsonRecord | undefined;
        const effectiveReferral = hasMetaReferral ? referral : storedReferral;
        const advertisedInterest = advertisedVehicle(effectiveReferral) || String(existing?.model_interest ?? "");
        const referralContext = effectiveReferral
          ? `Referencia comercial confirmada por Meta Ads:\nTítulo: ${String(effectiveReferral.headline ?? "")}\nTexto: ${String(effectiveReferral.body ?? "")}\nModelo identificado: ${advertisedInterest || "no determinado"}\nURL: ${String(effectiveReferral.source_url ?? "")}`.trim()
          : "";

        // A human takeover is authoritative. The inbound message remains stored,
        // but OpenAI is not called and the bot cannot compete with the operator.
        const conversationControl = await db
          .from("whatsapp_conversation_controls")
          .select("mode")
          .eq("lead_id", leadId)
          .maybeSingle();
        if (conversationControl.data?.mode === "human") {
          await db.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", leadId);
          continue;
        }

        // Una vez calificado, el lead ya fue transferido al equipo comercial.
        // Los mensajes posteriores se conservan y notifican al supervisor, pero
        // la IA no reinicia el cuestionario ni compite con la atención humana.
        if (existing?.qualification_status === "qualified") {
          await db.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", existing.id);
          if (!existing.do_not_contact) {
            await db.from("lead_crm").update({
              status: "en_proceso",
              next_contact_at: null,
              next_contact_note: "",
              last_contact_at: new Date().toISOString(),
              last_contact_outcome: "Respuesta recibida por WhatsApp",
            }).eq("lead_id", existing.id).in("status", ["nuevo", "no_contesta", "desistir"]);
          }
          if (hasMetaReferral) {
            await db.from("lead_attributions").upsert({
              lead_id: existing.id,
              platform: "meta_ads",
              source_type: String(referral?.source_type ?? "ad"),
              ad_id: referral?.source_id ? String(referral.source_id) : null,
              click_id: referral?.ctwa_clid ? String(referral.ctwa_clid) : null,
              source_url: referral?.source_url ? String(referral.source_url) : null,
              headline: referral?.headline ? String(referral.headline).slice(0, 1000) : null,
              body: referral?.body ? String(referral.body).slice(0, 3000) : null,
              media_type: referral?.media_type ? String(referral.media_type) : null,
              raw_referral: referral,
            }, { onConflict: "lead_id" });
          }

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

        const historyResult = await db.from("lead_messages")
          .select("direction, body, whatsapp_message_id")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(12);
        const historyRows = (historyResult.data || []).reverse();
        const routingConversation = historyRows.filter((item) => item.direction === "inbound").map((item) => item.body || "").join("\n");
        codes = candidateCodes(routingConversation);
        advisorName = codes.length ? "" : candidateAdvisorName(routingConversation);
        tiktokMentioned = mentionsTikTok(routingConversation) || existing?.source_channel === "tiktok";
        let activeSellerProfiles: JsonRecord[] = [];
        if (tiktokMentioned && !codes.length) {
          const activeSellers = await db
            .from("profiles")
            .select("user_id, tiktok_code, full_name")
            .eq("role", "seller")
            .eq("active", true);
          activeSellerProfiles = activeSellers.data || [];
          if (!advisorName) {
            advisorName = knownAdvisorName(
              routingConversation,
              activeSellerProfiles.map((profile) => String(profile.full_name || "")).filter(Boolean),
            );
          }
        }
        tiktokIdentifierType = codes.length ? "tiktok_code" : advisorName ? "advisor_name" : "";
        const history = historyRows
          .filter((item) => !whatsappMessageId || item.whatsapp_message_id !== whatsappMessageId)
          .map((item) => `${item.direction === "outbound" ? "Asistente" : "Cliente"}: ${item.body}`);
        const explicitModelInterest = mentionedVehicle(routingConversation) || advertisedInterest;
        const classification: LeadDecision = tiktokMentioned && !tiktokIdentifierType
          ? {
            qualification_status: "follow_up",
            priority: "normal",
            intent_summary: `Lead de TikTok${explicitModelInterest ? ` interesado en ${explicitModelInterest}` : ""}, pendiente de identificar asesor`,
            model_interest: explicitModelInterest,
            disqualify_reason: "",
            reply_text: tiktokIdentifierReply(customerName || "", history.length === 0, explicitModelInterest),
          }
          : await analyzeLeadConversation(
            history,
            body,
            String(assistantSettings.qualification_rules || ""),
            String(assistantSettings.conversation_style || ""),
            String(assistantSettings.vector_store_id || ""),
            referralContext,
            advertisedInterest,
            customerName || "",
            customerPhone,
            trainingExamples,
          );
        if (!classification.model_interest && explicitModelInterest) {
          classification.model_interest = explicitModelInterest;
        }
        classification.reply_text = enforceVehicleFacts(
          classification.reply_text,
          classification.model_interest || explicitModelInterest,
        );

        // If a newer inbound arrived while OpenAI was working, that newer execution
        // owns the answer. This prevents two replies and stale questions.
        const latestInboundResult = await db.from("lead_messages")
          .select("whatsapp_message_id")
          .eq("lead_id", leadId)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (whatsappMessageId && latestInboundResult.data?.whatsapp_message_id !== whatsappMessageId) continue;

        // The conversation may have been taken while OpenAI was processing.
        // Rechecking here closes that race before any classification or reply is applied.
        const controlAfterAnalysis = await db
          .from("whatsapp_conversation_controls")
          .select("mode")
          .eq("lead_id", leadId)
          .maybeSingle();
        if (controlAfterAnalysis.data?.mode === "human") {
          await db.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", leadId);
          continue;
        }

        let seller: JsonRecord | null = null;
        let advisorNameAmbiguous = false;
        if (codes.length) {
          const sellerResult = await db
            .from("profiles")
            .select("user_id, tiktok_code, full_name")
            .eq("role", "seller")
            .eq("active", true)
            .in("tiktok_code", codes)
            .limit(1)
            .maybeSingle();
          seller = sellerResult.data;
        } else if (advisorName) {
          const sellerProfiles = activeSellerProfiles.length
            ? activeSellerProfiles
            : (await db.from("profiles").select("user_id, tiktok_code, full_name").eq("role", "seller").eq("active", true)).data || [];
          const normalizedCandidate = normalizedPersonName(advisorName);
          const matches = sellerProfiles.filter((profile) => normalizedPersonName(String(profile.full_name || "")) === normalizedCandidate);
          seller = matches.length === 1 ? matches[0] : null;
          advisorNameAmbiguous = matches.length > 1;
        }

        let routingStatus = existing?.routing_status || "pending_supervisor";
        let routingReason = existing?.assigned_seller_user_id ? "existing_owner" : "general_inbox";
        let assignedSellerId = existing?.assigned_seller_user_id || null;
        let assignedAt: string | null = existing?.assigned_at || null;
        let attributionOutcome = existing?.assigned_seller_user_id && tiktokIdentifierType ? "existing_owner" : "";

        if (seller?.user_id && !existing?.assigned_seller_user_id) {
          const settingsResult = await db.from("seller_routing_settings").select("daily_quota, paused").eq("seller_user_id", seller.user_id).maybeSingle();
          const settings = settingsResult.data || { daily_quota: 20, paused: false };
          const assignedToday = await db.from("leads").select("id", { count: "exact", head: true }).eq("assigned_seller_user_id", seller.user_id).gte("assigned_at", argentinaDayStart());
          if (!settings.paused && (assignedToday.count || 0) < settings.daily_quota) {
            routingStatus = "assigned_direct";
            routingReason = tiktokIdentifierType === "advisor_name" ? "valid_advisor_name" : "valid_tiktok_code";
            assignedSellerId = seller.user_id as string;
            assignedAt = new Date().toISOString();
            attributionOutcome = "assigned";
          } else {
            routingReason = settings.paused ? "seller_paused" : "daily_quota_reached";
            attributionOutcome = routingReason;
          }
        } else if (tiktokIdentifierType && !existing?.assigned_seller_user_id) {
          routingReason = advisorNameAmbiguous ? "ambiguous_advisor_name" : tiktokIdentifierType === "advisor_name" ? "invalid_advisor_name" : "invalid_tiktok_code";
          attributionOutcome = advisorNameAmbiguous ? "ambiguous" : "invalid";
        } else if (tiktokMentioned && !existing?.assigned_seller_user_id) {
          routingReason = "missing_tiktok_identifier";
        }

        const leadValues = {
          customer_phone: customerPhone,
          customer_name: customerName,
          source_channel: tiktokMentioned ? "tiktok" : existing?.source_channel || "whatsapp",
          source_detail: tiktokIdentifierType || (tiktokMentioned ? "pending_identifier" : hasMetaReferral ? "meta_ads" : existing?.source_detail || "organic"),
          seller_code_received: codes[0] || existing?.seller_code_received || null,
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
          contact_consent_at: new Date().toISOString(),
          contact_consent_source: "whatsapp_inbound",
          metadata: {
            ...(storedMetadata || {}),
            phone_number_id: (value?.metadata as JsonRecord | undefined)?.phone_number_id || storedMetadata?.phone_number_id || null,
            referral: hasMetaReferral ? referral : storedReferral || null,
          },
        };

        const leadResult = await db.from("leads").update(leadValues).eq("id", leadId).select("id").single();
        if (leadResult.error || !leadResult.data) continue;

        if (tiktokIdentifierType) {
          const attributionResult = await db.from("lead_tiktok_attributions").insert({
            lead_id: leadResult.data.id,
            whatsapp_message_id: whatsappMessageId || null,
            identifier_type: tiktokIdentifierType,
            raw_identifier: (codes[0] || advisorName).slice(0, 160),
            matched_seller_user_id: seller?.user_id || null,
            outcome: attributionOutcome || "invalid",
            routing_reason: routingReason.slice(0, 300),
          });
          if (attributionResult.error) console.error("TikTok attribution audit failed", attributionResult.error.message);
        }

        if (hasMetaReferral) {
          await db.from("lead_attributions").upsert({
            lead_id: leadResult.data.id,
            platform: "meta_ads",
            source_type: String(referral?.source_type ?? "ad"),
            ad_id: referral?.source_id ? String(referral.source_id) : null,
            click_id: referral?.ctwa_clid ? String(referral.ctwa_clid) : null,
            source_url: referral?.source_url ? String(referral.source_url) : null,
            headline: referral?.headline ? String(referral.headline).slice(0, 1000) : null,
            body: referral?.body ? String(referral.body).slice(0, 3000) : null,
            media_type: referral?.media_type ? String(referral.media_type) : null,
            raw_referral: referral,
          }, { onConflict: "lead_id" });
        }

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
              origin: "ai",
            });
          } else {
            console.error("WhatsApp send failed", JSON.stringify(outgoing.payload));
          }
        }

        if (!existing?.assigned_seller_user_id && assignedSellerId) {
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
            title: assignedSellerId ? (tiktokIdentifierType === "advisor_name" ? "Lead derivado por asesor" : "Lead derivado por código") : tiktokMentioned ? "TikTok requiere identificación" : "Nuevo lead para asignar",
            body: `${customerName || customerPhone}: ${classification.intent_summary}${tiktokMentioned ? ` · ${routingReason}` : ""}`.slice(0, 500),
          })));
        }
      }
    }
  }

  return response({ received: true });
});
