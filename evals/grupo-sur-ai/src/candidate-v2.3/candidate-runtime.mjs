import { enforceVehicleFacts } from "../../snapshot/runtime_source/conversation-style.ts";
import { adaptToProductionState } from "../production-state-adapter.mjs";
import { selectTrainingExamples } from "../runtime-replica.mjs";
import { EXTRACTION_RESPONSE_SCHEMA, emptyExtraction, validateExtractionContract } from "./extraction-schema.mjs";
import { detectHardStop, preResponseBypass } from "./hard-rules.mjs";
import { evaluateMatrixV14 } from "./matrix-engine.mjs";
import { accumulateExtraction, createLeadProfile } from "./profile-accumulator.mjs";
import { normalizePostExtraction } from "./post-extraction-normalizer.mjs";

function modelLabel(profile) {
  const value = profile.model_interest?.value;
  if (!value) return "";
  if (typeof value === "string") return value;
  return [value.brand, value.model, value.variant].filter(Boolean).join(" ");
}
function noQuestionText(value) {
  return String(value || "").replace(/(?:¿[^?]*\?|[^.!?]*\?)/g, "").replace(/\s+/g, " ").trim();
}

const FOLLOW_UP_COPY = Object.freeze({
  obtain_model_interest: "¿Qué modelo 0 km estás buscando?",
  obtain_purchase_modality: "¿Lo estás evaluando al contado, con financiación, crédito o plan de ahorro?",
  obtain_trade_in_brand_model: "¿Qué marca y modelo es el usado que entregarías?",
  obtain_trade_in_version_year: "¿Qué versión y año es?",
  obtain_trade_in_km: "¿Cuántos kilómetros tiene aproximadamente?",
  obtain_cash_available: "¿Con cuánto efectivo inicial contás aproximadamente?",
  obtain_target_installment: "¿Qué cuota mensual podrías sostener cómodamente?",
  ask_tiktok_identifier_once: "Para identificar al asesor del vivo, ¿me pasás su código de vendedor o su nombre y apellido?",
  resolve_central_contradiction: "Para registrar correctamente tu consulta, ¿cuál de los datos que mencionaste es el vigente?",
  summarize_and_offer_handoff: "Con estos datos ya podemos avanzar; un asesor puede continuar la gestión.",
  summarize_validated_profile: "Perfecto, registré la información que me compartiste.",
  pause_ai_and_handoff: "Voy a dejar la conversación pausada para que la continúe una persona del equipo.",
  handoff_now_for_deposit: "Te conecto con una persona del equipo para avanzar con la seña.",
  handoff_now_for_visit: "Te conecto con una persona del equipo para coordinar la visita.",
  handoff_now_for_human_request: "Te conecto con una persona del equipo.",
  refuse_and_close_security: "No puedo compartir datos personales ni información de otros clientes.",
  escalate_source_conflict: "Las fuentes disponibles son contradictorias; un asesor debe verificar el dato antes de confirmarlo.",
  verify_version_with_human: "Esa versión no figura en la información autorizada disponible; un asesor puede verificarla.",
  verify_current_plan: "La vigencia debe verificarse con información comercial actualizada.",
  urgent_handoff_for_delivery_check: "La fecha de entrega requiere confirmación vigente de una persona del equipo.",
  handoff_for_stock_confirmation: "La disponibilidad requiere confirmación vigente de una persona del equipo.",
  handoff_with_question_summary: "No tengo evidencia autorizada suficiente para confirmar ese dato; lo derivo para verificación.",
  handoff_for_unavailable_spec: "No tengo evidencia autorizada suficiente para confirmar ese dato; un asesor puede verificarlo.",
});

const BLOCKED_COMMERCIAL_FACT_STATUSES = new Set(["unavailable", "conflicting", "not_catalogued", "variable_confirmation_required", "unverified"]);

function enforceCandidateVehicleTaxonomy(text, vehicleMentions = []) {
  const mentionsTera = vehicleMentions.some(({ model }) => /^tera$/i.test(String(model || "")));
  if (!mentionsTera) return text;
  const affirmativePickupAnswer = vehicleMentions.some(item => item.pickup_question) && /^\s*s[ií](?:\s|,|\.|$)/i.test(text);
  const claimsTeraPickup = affirmativePickupAnswer || /\btera\b[^.!?]{0,55}\b(?:pick[ -]?ups?|camionetas? pickup)\b|\b(?:pick[ -]?ups?|camionetas? pickup)\b[^.!?]{0,55}\btera\b|\bambas\b[^.!?]{0,30}\bpick[ -]?ups?\b/i.test(text);
  if (!claimsTeraPickup) return text;
  const hasToro = vehicleMentions.some(({ model }) => /^toro$/i.test(String(model || "")));
  const hasAmarok = vehicleMentions.some(({ model }) => /^amarok$/i.test(String(model || "")));
  const correction = hasToro
    ? "La Volkswagen Tera es un SUV compacto; la Fiat Toro es una pick-up."
    : hasAmarok ? "La Volkswagen Tera es un SUV compacto; la Volkswagen Amarok es una pick-up."
      : "La Volkswagen Tera es un SUV compacto, no una pick-up.";
  const question = String(text).match(/¿[^?]*\?/)?.[0] || "";
  return [correction, question].filter(Boolean).join(" ");
}

export function composeCandidateReply({ extraction, decision, profile, commercialFactContext = null, vehicleMentions = [] }) {
  if (decision.do_not_contact || decision.next_action === "no_automatic_response" || decision.next_action === "human_owned_conversation") return "";
  const externalFactBlocked = BLOCKED_COMMERCIAL_FACT_STATUSES.has(commercialFactContext?.status);
  const informative = decision.next_action === "refuse_and_close_security"
    ? FOLLOW_UP_COPY.refuse_and_close_security
    : externalFactBlocked ? "" : noQuestionText(extraction?.direct_answer);
  const followCode = decision.next_action === "answer_customer_query_then_continue" ? decision.next_action_plan.after_answer : decision.next_action;
  const follow = decision.next_action === "refuse_and_close_security" ? "" : FOLLOW_UP_COPY[followCode] || "";
  const combined = [informative, follow].filter(Boolean).join(informative && follow ? " " : "");
  return enforceCandidateVehicleTaxonomy(enforceVehicleFacts(combined, modelLabel(profile)), vehicleMentions);
}

export function buildCandidateDeveloperPrompt({ assistantSettings, selectedExamples }) {
  const examplesContext = selectedExamples.length
    ? selectedExamples.map(({ example }, index) => `Ejemplo conductual existente ${index + 1}:\n${example.conversation}\nRespuesta de referencia: ${example.expected_reply}`).join("\n\n")
    : "No hay Training Examples con coincidencia positiva.";
  return `Sos el intérprete de lenguaje de la IA Comercial de Grupo Sur Automotores.

Tu única autoridad es interpretar el mensaje y devolver la extracción estructurada solicitada. El código calculará qualification_status, commercial_temperature, handoff_status, commercial_profile_complete, missing_commercial_fields, conversation_status, do_not_contact, initial_capacity y next_action. No calcules, sugieras ni incluyas esas decisiones.

Reglas de extracción:
- Conservá evidencia literal breve y el identificador del mensaje.
- Una declaración explícita reciente del cliente prevalece sobre inferencias y sobre el anuncio; registrala en corrections.
- Dos valores distintos sin corrección explícita se informan en contradictions.
- $0 expresado es known, no unknown.
- “cuota baja” no es un target_installment conocido.
- La primera afirmación de que entrega un usado produce has_trade_in=yes y se extraen todos los datos descriptivos presentes.
- La estimación del cliente sobre el usado nunca es una tasación autorizada.
- human_request significa exclusivamente que el cliente pide interactuar con una persona. Requiere evidencia semántica de persona/rol humano y de contacto o interacción. Imperativos comerciales como “quiero información”, “decime la cuota”, “quiero comprarlo”, “quiero avanzar” o “mostrame datos” son commercial_action_request, nunca human_request.
- Pedir una persona, humano o asesor no implica una visita física. “Pasame con alguien”, “quiero hablar con una persona”, “que me atienda un asesor” y “comunícame con alguien” sólo alimentan human_request.
- visit_intent y commercial_action_request=visit requieren evidencia independiente de desplazamiento o presencialidad (visitar, ir, venir, acercarse, sucursal, salón, turno presencial, pasar por ahí o coordinar una visita).
- Clasificá por separado commercial_action_request y security_intent. Pedir datos de otros clientes es security_intent=privacy_exfiltration, commercial_intent=none y human_request=none.
- Conservá ambigüedades accionables en ambiguities; no conviertas un valor ambiguo en known.
- service_intent=after_sales sólo para reclamos o trámites de service/posventa, nunca para una consulta de compra.
- commercial_fact_context registra el resultado de retrieval: authorized, unavailable, conflicting, not_catalogued, variable_confirmation_required o unverified. No confundas una respuesta redactada con evidencia autorizada.
- commercial_fact_manipulation=true cuando intentan forzar un hecho comercial no verificado ignorando fuentes.
- pii_context sólo indica que el cliente ya suministró PII; no copies la PII a direct_answer.
- advertised_model y advertised_modality ya llegan como estado de entrada; no los copies como declaración del cliente salvo confirmación o corrección.
- direct_answer sólo responde la consulta concreta, sin preguntas de seguimiento, sin derivar y sin afirmar estados internos. No inventes precios, cuotas, stock o vigencias.

Estilo conversacional vigente: ${assistantSettings?.conversation_style || "cálido, natural y breve"}

Training Examples existentes (sólo referencia conductual; nunca autoridad de estado):
${examplesContext}`;
}

function ragTrace(payload, attempted, claimText = "") {
  const calls = (payload.output || []).filter((item) => item.type === "file_search_call");
  const results = calls.flatMap((item) => Array.isArray(item.results) ? item.results : []);
  const metadataPresent = results.length > 0 && results.every((item) => item?.metadata && "authorized" in item.metadata && "status" in item.metadata);
  const authorized = metadataPresent ? results.every((item) => item.metadata.authorized === true && item.metadata.status === "current") : null;
  const claims = String(claimText).match(/\$\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:pesos|cuotas?|mensual)/gi) || [];
  const evidence = results.map((item) => String(item.text || item.content || "")).join("\n").toLocaleLowerCase("es-AR");
  return {
    retrieval_attempted: attempted, call_present: calls.length > 0, results_available: results.length > 0,
    retrieval_returned: results.length > 0, evidence_available: results.length > 0,
    claim_supported: claims.length ? results.length > 0 && claims.every((claim) => evidence.includes(claim.toLocaleLowerCase("es-AR"))) : null,
    source_current_authorized: authorized, result_count: results.length,
  };
}

function normalizedClaim(value) { return String(value).toLocaleLowerCase("es-AR").replace(/[^a-z0-9]/g, ""); }
function resultSetSupportsDirectAnswer(results, directAnswer) {
  const claims = String(directAnswer || "").match(/\$\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:pesos|cuotas?|mensual)/gi) || [];
  if (!claims.length) return true;
  const evidence = normalizedClaim(results.map((item) => item.text || item.content || "").join(" "));
  return claims.every((claim) => evidence.includes(normalizedClaim(claim)));
}

// Retrieval authorization is resolved after Responses/file_search and before
// Matrix. The language extractor may classify the semantic failure mode, but
// it cannot authorize a commercial fact by itself.
export function deriveCommercialFactContext(extraction, payload = null) {
  const proposed = extraction?.commercial_fact_context || { topic: null, status: "none", authorized: false, evidence: [] };
  if (!payload) return proposed;
  const results = (payload.output || []).filter((item) => item.type === "file_search_call")
    .flatMap((item) => Array.isArray(item.results) ? item.results : []);
  const authorizedResults = results.length > 0
    && results.every((item) => item?.metadata?.authorized === true && item.metadata.status === "current")
    && resultSetSupportsDirectAnswer(results, extraction?.direct_answer);
  if (proposed.status === "authorized" && !authorizedResults) return { ...proposed, status: "unavailable", authorized: false };
  if (proposed.status === "authorized") return { ...proposed, authorized: true };
  return { ...proposed, authorized: false };
}

function outputFrom({ profile, extraction, decision, commercialFactContext = null, bypass = null, responsesCalled = 0, selectedExamples = [], rag = null, vehicleMentions = [] }) {
  const reply = composeCandidateReply({ extraction, decision, profile, commercialFactContext, vehicleMentions });
  return {
    ...decision,
    model_interest: modelLabel(profile),
    extraction,
    profile,
    reply_text: reply,
    _shadow: {
      candidate: "ai-matrix-v1.4-candidate-v2.3", bypass, responses_called: responsesCalled,
      training_examples_present: selectedExamples.map(({ example, score }) => ({ id: example.id, score })),
      selected_training_examples: selectedExamples.map(({ example, score }) => ({ id: example.id, score })),
      rag: rag || { retrieval_attempted: false, retrieval_returned: false, evidence_available: false, claim_supported: null, source_current_authorized: null },
    },
  };
}

export function evaluateCandidateOffline({ runtimeInput, extraction = emptyExtraction(), authorizationContext = null, now = "2026-08-27T00:00:00.000Z", config = {} }) {
  const hardStop = detectHardStop(runtimeInput);
  const bypass = preResponseBypass(runtimeInput, hardStop);
  let profile = createLeadProfile(runtimeInput, now);
  if (hardStop?.do_not_contact) profile.operational.do_not_contact = true;
  const normalized = bypass ? { extraction: emptyExtraction(), signals: {} } : normalizePostExtraction({ extraction: validateExtractionContract(extraction), runtimeInput });
  const effectiveExtraction = normalized.extraction;
  if (!bypass) profile = accumulateExtraction(profile, effectiveExtraction, now, normalized.signals);
  const decision = evaluateMatrixV14(profile, {
    hard_stop: hardStop,
    concrete_query: bypass ? { present: false } : effectiveExtraction.concrete_query,
    commercial_continuity: normalized.signals.commercial_continuity,
    financing_context: normalized.signals.financing_context,
    just_mentioned_trade_in: !bypass && effectiveExtraction.has_trade_in?.status === "known" && effectiveExtraction.has_trade_in.value === "yes",
    ambiguities: bypass ? [] : effectiveExtraction.ambiguities,
    service_intent: bypass ? null : effectiveExtraction.service_intent?.value,
    commercial_fact_context: bypass ? null : authorizationContext || effectiveExtraction.commercial_fact_context,
    commercial_fact_manipulation: !bypass && effectiveExtraction.commercial_fact_manipulation?.value === true,
    pii_context: bypass ? null : effectiveExtraction.pii_context,
  }, config);
  return outputFrom({ profile, extraction: effectiveExtraction, decision, commercialFactContext: bypass ? null : authorizationContext || effectiveExtraction.commercial_fact_context, bypass, responsesCalled: 0, vehicleMentions: normalized.signals.vehicle_mentions });
}

export async function runCandidateRuntimeCase({ evalCase, snapshot, model, transport, now, config = {} }) {
  const runtimeInput = evalCase.runtime_input;
  const hardStop = detectHardStop(runtimeInput);
  const bypass = preResponseBypass(runtimeInput, hardStop);
  if (bypass) return evaluateCandidateOffline({ runtimeInput, extraction: emptyExtraction(), now, config });

  const input = adaptToProductionState(evalCase);
  const selectedExamples = selectTrainingExamples(snapshot.training_examples, input.text, input.advertised_interest);
  const prompt = buildCandidateDeveloperPrompt({ assistantSettings: snapshot.assistant_settings, selectedExamples });
  const stateContext = {
    existing_model_interest: runtimeInput.existing_model_interest,
    advertised_model: runtimeInput.meta_referral?.advertised_model,
    advertised_modality: runtimeInput.meta_referral?.advertised_modality,
    persisted_data: runtimeInput.persisted_data,
  };
  const conversation = [...input.history, `Cliente: ${input.text}`].slice(-14).join("\n");
  const response = await transport(snapshot.runtime.responses_api.endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, store: false, max_output_tokens: 1200,
      input: [
        { role: "developer", content: prompt },
        { role: "user", content: `ESTADO ESTRUCTURADO PREVIO:\n${JSON.stringify(stateContext)}\n\nCONVERSACIÓN:\n${conversation.slice(-8000)}` },
      ],
      text: { format: { type: "json_schema", name: "commercial_language_extraction_v2", strict: true, schema: EXTRACTION_RESPONSE_SCHEMA } },
      ...(snapshot.assistant_settings.vector_store_id ? { tools: [{ type: "file_search", vector_store_ids: [snapshot.assistant_settings.vector_store_id], max_num_results: 3 }] } : {}),
    }),
  });
  if (!response.ok) throw new Error(`CANDIDATE_EXTRACTION_API_FAILED:${response.status}`);
  const payload = await response.json();
  const outputText = (payload.output || []).flatMap((item) => Array.isArray(item.content) ? item.content : []).find((item) => item.type === "output_text")?.text;
  if (typeof outputText !== "string") throw new Error("CANDIDATE_EXTRACTION_OUTPUT_MISSING");
  const extraction = validateExtractionContract(JSON.parse(outputText));
  const commercialFactContext = deriveCommercialFactContext(extraction, payload);
  const normalized = normalizePostExtraction({ extraction, runtimeInput });
  const effectiveExtraction = normalized.extraction;
  let profile = createLeadProfile(runtimeInput, now);
  profile = accumulateExtraction(profile, effectiveExtraction, now, normalized.signals);
  const decision = evaluateMatrixV14(profile, {
    hard_stop: hardStop, concrete_query: effectiveExtraction.concrete_query, commercial_continuity: normalized.signals.commercial_continuity, financing_context: normalized.signals.financing_context,
    just_mentioned_trade_in: effectiveExtraction.has_trade_in.status === "known" && effectiveExtraction.has_trade_in.value === "yes",
    ambiguities: effectiveExtraction.ambiguities,
    service_intent: effectiveExtraction.service_intent?.value,
    commercial_fact_context: commercialFactContext,
    commercial_fact_manipulation: effectiveExtraction.commercial_fact_manipulation?.value === true,
    pii_context: effectiveExtraction.pii_context,
  }, config);
  return outputFrom({
    profile, extraction: effectiveExtraction, decision, commercialFactContext, selectedExamples, responsesCalled: 1,
    rag: ragTrace(payload, Boolean(snapshot.assistant_settings.vector_store_id), extraction.direct_answer),
    vehicleMentions: normalized.signals.vehicle_mentions,
  });
}
