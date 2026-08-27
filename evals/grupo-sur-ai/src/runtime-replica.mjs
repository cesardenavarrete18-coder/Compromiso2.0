import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  enforceVehicleFacts, firstName, handoffReply, hasKnownCommercialOperation,
  polishCommercialReply, qualifyAndHandoffReply, shouldForceHandoff, tiktokIdentifierReply,
} from "../snapshot/runtime_source/conversation-style.ts";
import { candidateAdvisorName, candidateCodes, knownAdvisorName, mentionsTikTok, normalizedPersonName } from "../snapshot/runtime_source/routing-identifiers.ts";
import { adaptToProductionState } from "./production-state-adapter.mjs";

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
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score).slice(0, 4);
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
  if (input.routing_state?.tiktok_identifier_status) {
    const status = input.routing_state.tiktok_identifier_status;
    return {
      mentioned: input.source_channel === "tiktok" || status !== null,
      codes: [], advisor_name: "", identifier_type: status === "absent" ? "" : "canonical_fixture",
      resolution: status === "valid" ? "resolved" : status === "conflicting" ? "conflicting" : status === "absent" ? "absent" : "invalid_or_inactive",
      resolved_user_id: input.routing_state.resolved ? "canonical-fixture-advisor" : null,
      known_name: "", source: "canonical_runtime_input",
    };
  }
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

function noResponseBypass(input, routing, bypass) {
  return {
    qualification_status: input.prior_qualification.status || "follow_up",
    priority: "normal", intent_summary: "Runtime productivo omitió Responses por estado previo",
    model_interest: input.existing_model_interest || input.advertised_interest || "",
    disqualify_reason: "", reply_text: "",
    _shadow: {
      bypass, routing, responses_called: 0, training_examples_present: [],
      selected_training_examples: [], fallback: false,
      rag: {
        retrieval_attempted: false, retrieval_returned: false, evidence_available: false,
        claim_supported: null, source_current_authorized: null,
      },
    },
  };
}

export function applyDeterministicPostprocessors(decision, input) {
  const output = { ...decision };
  const isFirstReply = input.history.length === 0;
  const priorAssistantReplies = input.history.filter((item) => item.startsWith("Asistente:")).length;
  if (input.advertised_interest) {
    output.model_interest = input.advertised_interest;
    if (!input.history.length && /qu[eé]\s+modelo|cu[aá]l\s+modelo/i.test(output.reply_text)) {
      output.reply_text = fallbackDecision(input.text, input.advertised_interest, input.customer_name, true).reply_text;
    }
  }
  const customerConversation = [...input.history.filter((item) => item.startsWith("Cliente:")), `Cliente: ${input.text}`].join("\n");
  if ((output.model_interest || input.advertised_interest) && hasKnownCommercialOperation(customerConversation) && output.qualification_status !== "unqualified") {
    output.qualification_status = "qualified";
    output.reply_text = qualifyAndHandoffReply(output.reply_text, output.model_interest || input.advertised_interest);
  } else if (shouldForceHandoff(priorAssistantReplies, output.qualification_status)) {
    output.qualification_status = "qualified";
    output.reply_text = handoffReply(output.model_interest || input.advertised_interest);
  }
  output.reply_text = enforceVehicleFacts(polishCommercialReply(output.reply_text, input.customer_name, isFirstReply), output.model_interest || input.advertised_interest);
  return output;
}

function ragTrace(payload, attempted, claimText = "") {
  const calls = (payload.output || []).filter((item) => item.type === "file_search_call");
  const results = calls.flatMap((item) => Array.isArray(item.results) ? item.results : []);
  const hasAuthorizationMetadata = results.length > 0 && results.every((item) => item?.metadata && "authorized" in item.metadata && "status" in item.metadata);
  const authorizedCurrent = hasAuthorizationMetadata ? results.every((item) => item.metadata.authorized === true && item.metadata.status === "current") : null;
  const claimAmounts = String(claimText).match(/\$\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:pesos|cuotas?|mensual)/gi) || [];
  const evidenceText = results.map((item) => String(item.text || item.content || "")).join("\n").toLocaleLowerCase("es-AR");
  const supported = claimAmounts.length && results.length
    ? claimAmounts.every((claim) => evidenceText.includes(claim.toLocaleLowerCase("es-AR")))
    : claimAmounts.length ? false : null;
  return {
    retrieval_attempted: attempted,
    retrieval_returned: calls.length > 0,
    evidence_available: results.length > 0,
    claim_supported: supported,
    source_current_authorized: authorizedCurrent,
    result_count: results.length,
  };
}

export async function runCurrentRuntimeCase({ evalCase, snapshot, routingSnapshot, model, transport }) {
  const input = adaptToProductionState(evalCase);
  const isFirstReply = input.history.length === 0;
  const routing = deriveTikTokRouting(input, routingSnapshot);
  const explicitModel = sourceModel(`${input.text}\n${input.referral_context}`) || input.advertised_interest;

  if (evalCase.runtime_input.inbound_message.event_type !== "customer_message") return noResponseBypass(input, routing, `event_${evalCase.runtime_input.inbound_message.event_type}`);
  if (input.do_not_contact || input.conversation_control.status === "closed") return noResponseBypass(input, routing, input.do_not_contact ? "do_not_contact_or_closed" : "conversation_closed");
  if (input.takeover.active) return noResponseBypass(input, routing, "human_takeover");
  if (input.prior_qualification.status === "qualified" || ["handoff_required", "handed_off"].includes(input.conversation_control.handoff_status)) {
    return noResponseBypass(input, routing, input.prior_qualification.status === "qualified" ? "already_qualified" : "handoff_in_progress");
  }

  if (routing.mentioned && !routing.identifier_type) {
    return {
      qualification_status: "follow_up", priority: "normal",
      intent_summary: `Lead de TikTok${explicitModel ? ` interesado en ${explicitModel}` : ""}, pendiente de identificar asesor`,
      model_interest: explicitModel, disqualify_reason: "",
      reply_text: tiktokIdentifierReply(input.customer_name || "", input.history.length === 0, explicitModel),
      _shadow: {
        bypass: "tiktok_missing_identifier", routing, responses_called: 0,
        training_examples_present: [], selected_training_examples: [], fallback: false,
        rag: { retrieval_attempted: false, retrieval_returned: false, evidence_available: false, claim_supported: null, source_current_authorized: null },
      },
    };
  }

  const selectedExamples = selectTrainingExamples(snapshot.training_examples, input.text, input.advertised_interest);
  const examplesContext = selectedExamples.length
    ? selectedExamples.map(({ example }, index) => `Ejemplo aprobado ${index + 1}:\n${example.conversation}\nEstado esperado: ${example.expected_status}\nRespuesta esperada: ${example.expected_reply}`).join("\n\n")
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
    return { ...fallback, _shadow: { routing, responses_called: 1, training_examples_present: selectedExamples.map(({ example, score }) => ({ id: example.id, score })), selected_training_examples: selectedExamples.map(({ example, score }) => ({ id: example.id, score })), fallback: true, api_status: response.status, rag: { retrieval_attempted: Boolean(snapshot.assistant_settings.vector_store_id), retrieval_returned: false, evidence_available: false, claim_supported: null, source_current_authorized: null } } };
  }
  const payload = await response.json();
  const outputText = (payload.output || []).flatMap((item) => Array.isArray(item.content) ? item.content : []).find((item) => item.type === "output_text")?.text;
  if (typeof outputText !== "string") {
    const fallback = fallbackDecision(input.text, input.advertised_interest, input.customer_name, isFirstReply);
    return { ...fallback, _shadow: { routing, responses_called: 1, training_examples_present: selectedExamples.map(({ example, score }) => ({ id: example.id, score })), selected_training_examples: selectedExamples.map(({ example, score }) => ({ id: example.id, score })), fallback: true, api_status: response.status, rag: ragTrace(payload, Boolean(snapshot.assistant_settings.vector_store_id)) } };
  }
  const decision = applyDeterministicPostprocessors(JSON.parse(outputText), input);
  return {
    ...decision,
    _shadow: {
      routing, responses_called: 1,
      training_examples_present: selectedExamples.map(({ example, score }) => ({ id: example.id, score })),
      selected_training_examples: selectedExamples.map(({ example, score }) => ({ id: example.id, score })), fallback: false,
      response_id: payload.id || null, model_reported: payload.model || null,
      file_search_used: (payload.output || []).some((item) => item.type === "file_search_call"),
      rag: ragTrace(payload, Boolean(snapshot.assistant_settings.vector_store_id), decision.reply_text),
    },
  };
}
