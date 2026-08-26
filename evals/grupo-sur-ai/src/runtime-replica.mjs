import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  enforceVehicleFacts, firstName, handoffReply, hasKnownCommercialOperation,
  polishCommercialReply, qualifyAndHandoffReply, shouldForceHandoff, tiktokIdentifierReply,
} from "../snapshot/runtime_source/conversation-style.ts";
import { candidateAdvisorName, candidateCodes, knownAdvisorName, mentionsTikTok, normalizedPersonName } from "../snapshot/runtime_source/routing-identifiers.ts";

const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    qualification_status: { type: "string", enum: ["qualified", "follow_up", "unqualified"] },
    priority: { type: "string", enum: ["low", "normal", "high"] },
    intent_summary: { type: "string" }, model_interest: { type: "string" },
    disqualify_reason: { type: "string" }, reply_text: { type: "string" },
  },
  required: ["qualification_status", "priority", "intent_summary", "model_interest", "disqualify_reason", "reply_text"],
};

const advertisedVehicles = [
  ["peugeot partner", "Peugeot Partner"], ["peugeot expert", "Peugeot Expert"],
  ["peugeot 2008", "Peugeot 2008"], ["peugeot 208", "Peugeot 208"],
  ["volkswagen amarok", "Volkswagen Amarok"], ["volkswagen taos", "Volkswagen Taos"],
  ["volkswagen t-cross", "Volkswagen T-Cross"], ["volkswagen tcross", "Volkswagen T-Cross"],
  ["volkswagen tera", "Volkswagen Tera"], ["volkswagen nivus", "Volkswagen Nivus"],
  ["volkswagen virtus", "Volkswagen Virtus"], ["volkswagen polo", "Volkswagen Polo Robust"],
  ["fiat cronos", "Fiat Cronos"], ["fiat mobi", "Fiat Mobi"], ["fiat strada", "Fiat Strada"],
  ["fiat toro", "Fiat Toro"], ["fiat fiorino", "Fiat Fiorino"], ["fiat fastback", "Fiat Fastback"],
];

function exampleTokens(value) {
  return new Set(String(value).toLocaleLowerCase("es-AR").match(/[a-záéíóúñ0-9]{4,}/g) || []);
}

export function selectTrainingExamples(examples, text, advertisedInterest) {
  const target = exampleTokens(`${text} ${advertisedInterest}`);
  return examples.map((example) => {
    const source = exampleTokens(example.conversation); let score = 0;
    target.forEach((token) => { if (source.has(token)) score += 1; });
    return { example, score };
  }).sort((left, right) => right.score - left.score).slice(0, 4).map((item) => item.example);
}

function fallbackDecision(text, advertisedInterest = "", customerName = "", isFirstReply = true) {
  const normalized = text.toLocaleLowerCase("es-AR");
  const salesIntent = Boolean(advertisedInterest) || /(0\s?km|auto|veh[ií]culo|modelo|cuota|anticipo|financi|plan|precio|entrega|volkswagen|peugeot|fiat)/i.test(normalized);
  const urgent = /(hoy|urgente|ya|comprar|seña|entrega inmediata)/i.test(normalized);
  const greeting = isFirstReply ? `¡Hola${firstName(customerName) ? ` ${firstName(customerName)}` : ""}! ` : "";
  return {
    qualification_status: salesIntent ? "qualified" : "follow_up", priority: urgent ? "high" : "normal",
    intent_summary: advertisedInterest ? `Consulta por ${advertisedInterest} recibida desde Meta Ads` : salesIntent ? "Consulta comercial recibida por WhatsApp" : "Contacto nuevo pendiente de ampliar información",
    model_interest: advertisedInterest, disqualify_reason: "",
    reply_text: salesIntent ? advertisedInterest
      ? `${greeting}Tengo registrada tu consulta por ${advertisedInterest}. Puedo ayudarte con versiones, financiación o compra al contado. ¿Cuál de esas opciones querés ver primero?`
      : `${greeting}Soy el asistente de Compromiso mi 0km. Para orientarte mejor, ¿qué modelo estás buscando y qué tipo de operación tenés en mente?`
      : `${greeting}Soy el asistente de Compromiso mi 0km. ¿Qué vehículo 0 km estás buscando?`,
  };
}

function sourceModel(text) {
  const source = String(text || "").toLocaleLowerCase("es-AR");
  const matches = new Set();
  for (const [needle, canonical] of advertisedVehicles) {
    const modelName = needle.split(" ").slice(1).join(" ");
    if (source.includes(needle) || (modelName && source.includes(modelName))) matches.add(canonical);
  }
  return matches.size === 1 ? [...matches][0] : "";
}

export async function buildExactDeveloperPrompt(snapshot, examplesContext) {
  const indexPath = new URL("../snapshot/runtime_source/index.ts", import.meta.url);
  const source = await readFile(indexPath, "utf8");
  const startMarker = "content: `Sos el asistente comercial de Grupo Sur Automotores";
  const start = source.indexOf(startMarker);
  const endMarker = "`,\n          },\n          { role: \"user\", content: conversation.slice(-8000) }";
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("DEPLOYED_PROMPT_EXTRACTION_FAILED");
  let prompt = source.slice(start + "content: `".length, end);
  prompt = prompt.replace(/\$\{qualificationRules \|\| "[^"]+"\}/, snapshot.assistant_settings.qualification_rules || "Aplicá los criterios generales anteriores.");
  prompt = prompt.replace(/\$\{conversationStyle \|\| "[^"]+"\}/, snapshot.assistant_settings.conversation_style || "Respondé con calidez, naturalidad y una sola pregunta concreta por turno.");
  prompt = prompt.replace("${examplesContext}", examplesContext);
  if (prompt.includes("${")) throw new Error("DEPLOYED_PROMPT_INTERPOLATION_INCOMPLETE");
  return prompt;
}

export async function verifySnapshotSource(snapshot) {
  for (const [name, expected] of Object.entries(snapshot.runtime.source_files)) {
    const content = await readFile(new URL(`../snapshot/runtime_source/${name}`, import.meta.url));
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== expected) throw new Error(`RUNTIME_SOURCE_HASH_MISMATCH:${name}`);
  }
}

export function deriveTikTokRouting(input, routingSnapshot) {
  const conversation = [...input.history, `Cliente: ${input.text}`].join("\n");
  const tiktokMentioned = mentionsTikTok(conversation) || input.source_channel === "tiktok";
  const advisors = routingSnapshot.advisors || [];
  const codes = candidateCodes(conversation);
  const activeNames = advisors.filter((item) => item.active).map((item) => item.full_name);
  const advisorName = candidateAdvisorName(conversation) || knownAdvisorName(conversation, activeNames);
  const codeMatches = advisors.filter((item) => item.active && codes.includes(String(item.tiktok_code || "").toUpperCase()));
  const nameMatches = advisors.filter((item) => item.active && advisorName && normalizedPersonName(item.full_name) === normalizedPersonName(advisorName));
  const resolved = [...new Set([...codeMatches, ...nameMatches].map((item) => item.user_id))];
  return {
    mentioned: tiktokMentioned, codes, advisor_name: advisorName || "",
    identifier_type: codes.length ? "tiktok_code" : advisorName ? "advisor_name" : "",
    resolution: resolved.length === 1 ? "resolved" : resolved.length > 1 ? "conflicting" : (codes.length || advisorName) ? "invalid_or_inactive" : "absent",
    resolved_user_id: resolved.length === 1 ? resolved[0] : null,
    known_name: knownAdvisorName(conversation, activeNames) || "",
  };
}

export async function runCurrentRuntimeCase({ evalCase, snapshot, routingSnapshot, model, transport }) {
  const input = evalCase.runtime_input;
  const isFirstReply = input.history.length === 0;
  const priorAssistantReplies = input.history.filter((item) => item.startsWith("Asistente:")).length;
  const routing = deriveTikTokRouting({ ...input, source_channel: evalCase.source_channel }, routingSnapshot);
  const explicitModel = sourceModel(`${input.text}\n${input.referral_context}`) || input.advertised_interest;

  if (routing.mentioned && !routing.identifier_type) {
    return {
      qualification_status: "follow_up", priority: "normal",
      intent_summary: `Lead de TikTok${explicitModel ? ` interesado en ${explicitModel}` : ""}, pendiente de identificar asesor`,
      model_interest: explicitModel, disqualify_reason: "",
      reply_text: tiktokIdentifierReply(input.customer_name || "", input.history.length === 0, explicitModel),
      _shadow: { bypass: "tiktok_missing_identifier", routing, selected_training_example_ids: [], fallback: false },
    };
  }

  const examples = selectTrainingExamples(snapshot.training_examples, input.text, input.advertised_interest);
  const examplesContext = examples.length
    ? examples.map((example, index) => `Ejemplo aprobado ${index + 1}:\n${example.conversation}\nEstado esperado: ${example.expected_status}\nRespuesta esperada: ${example.expected_reply}`).join("\n\n")
    : "Todavía no hay ejemplos corregidos aplicables.";
  const prompt = await buildExactDeveloperPrompt(snapshot, examplesContext);
  const contactContext = `Datos autorizados del contacto:\nNombre: ${input.customer_name || "no informado"}\nTeléfono: ${input.customer_phone || "no informado"}`;
  const conversation = [contactContext, input.referral_context, ...input.history, `Cliente: ${input.text}`].filter(Boolean).slice(-14).join("\n");

  const response = await transport(snapshot.runtime.responses_api.endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, store: false, max_output_tokens: 650,
      input: [{ role: "developer", content: prompt }, { role: "user", content: conversation.slice(-8000) }],
      text: { format: { type: "json_schema", name: "lead_decision", strict: true, schema: RESPONSE_SCHEMA } },
      ...(snapshot.assistant_settings.vector_store_id ? { tools: [{ type: "file_search", vector_store_ids: [snapshot.assistant_settings.vector_store_id], max_num_results: 3 }] } : {}),
    }),
  });
  if (!response.ok) {
    const fallback = fallbackDecision(input.text, input.advertised_interest, input.customer_name, isFirstReply);
    return { ...fallback, _shadow: { routing, selected_training_example_ids: examples.map((x) => x.id), fallback: true, api_status: response.status } };
  }
  const payload = await response.json();
  const outputText = (payload.output || []).flatMap((item) => Array.isArray(item.content) ? item.content : []).find((item) => item.type === "output_text")?.text;
  if (typeof outputText !== "string") {
    const fallback = fallbackDecision(input.text, input.advertised_interest, input.customer_name, isFirstReply);
    return { ...fallback, _shadow: { routing, selected_training_example_ids: examples.map((x) => x.id), fallback: true, api_status: response.status } };
  }
  const decision = JSON.parse(outputText);
  if (input.advertised_interest) {
    decision.model_interest = input.advertised_interest;
    if (!input.history.length && /qu[eé]\s+modelo|cu[aá]l\s+modelo/i.test(decision.reply_text)) {
      decision.reply_text = fallbackDecision(input.text, input.advertised_interest, input.customer_name, true).reply_text;
    }
  }
  const customerConversation = [...input.history.filter((item) => item.startsWith("Cliente:")), `Cliente: ${input.text}`].join("\n");
  if ((decision.model_interest || input.advertised_interest) && hasKnownCommercialOperation(customerConversation) && decision.qualification_status !== "unqualified") {
    decision.qualification_status = "qualified";
    decision.reply_text = qualifyAndHandoffReply(decision.reply_text, decision.model_interest || input.advertised_interest);
  } else if (shouldForceHandoff(priorAssistantReplies, decision.qualification_status)) {
    decision.qualification_status = "qualified";
    decision.reply_text = handoffReply(decision.model_interest || input.advertised_interest);
  }
  decision.reply_text = enforceVehicleFacts(polishCommercialReply(decision.reply_text, input.customer_name, isFirstReply), decision.model_interest || input.advertised_interest);
  return {
    ...decision,
    _shadow: {
      routing, selected_training_example_ids: examples.map((x) => x.id), fallback: false,
      response_id: payload.id || null, model_reported: payload.model || null,
      file_search_used: (payload.output || []).some((item) => item.type === "file_search_call"),
    },
  };
}
