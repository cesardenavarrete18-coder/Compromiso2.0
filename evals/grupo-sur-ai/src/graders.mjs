const WEIGHTS = {
  extraction: 18, qualification: 8, temperature: 5, handoff: 7,
  commercial_profile: 7, conversation_status: 6, next_action: 10,
  conversational_compliance: 14, grounding: 10, hallucinations: 10, privacy: 5,
};

const questionCount = (text) => (String(text).match(/\?/g) || []).length;
const hasHandoffCopy = (text) => /\b(asesor|deriv|continuar[aá].*gesti[oó]n|persona)\b/i.test(String(text));
const hasMoneyClaim = (text) => /(?:\$\s*\d|\b\d[\d.,]*\s*(?:pesos|cuotas?|mensual))/i.test(String(text));
const isTeraPickup = (text) => /\btera\b[\s\S]{0,80}\bpick[\s-]?up\b|\bpick[\s-]?up\b[\s\S]{0,80}\btera\b/i.test(String(text));
const pIIEcho = (text) => /\b\d{7,11}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(String(text));

function result(score, evidence) {
  return { status: score >= 1 ? "pass" : score > 0 ? "partial" : "fail", score, evidence };
}

function expectedModel(expectedText) {
  const hit = String(expectedText).match(/model_interest\s*=\s*([^;,]+)/i);
  return hit?.[1]?.trim() || "";
}

function gradeExtraction(evalCase, output) {
  const expected = evalCase.expected.extraction || "";
  const model = expectedModel(expected);
  if (!model) return result(output.model_interest !== undefined ? 0.5 : 0, "El contrato actual sólo ofrece model_interest y resumen libre.");
  const ok = String(output.model_interest || "").toLocaleLowerCase("es-AR").includes(model.toLocaleLowerCase("es-AR"));
  return result(ok ? 0.5 : 0, ok ? "Modelo extraído; el resto de la extracción estructurada no existe." : "Modelo y campos estructurados no coinciden/no existen.");
}

function inferNextAction(output) {
  const reply = String(output.reply_text || "");
  if (!reply) return "no_ai_response";
  if (hasHandoffCopy(reply)) return "handoff";
  if (/c[oó]digo TikTok|nombre y apellido/i.test(reply)) return "ask_tiktok_identifier_once";
  if (/anticipo|efectivo|monto inicial|dispon[eé]s|cont[aá]s/i.test(reply)) return "obtain_cash_available";
  if (/cuota.*(?:sirve|viable|c[oó]mod|pagar|sostener)/i.test(reply)) return "obtain_target_installment";
  if (questionCount(reply)) return "ask_question";
  return "answer_only";
}

function nextActionScore(expected, observed) {
  if (expected === observed) return 1;
  if (/handoff|supervisor|human|visit|deposit|credit|stock|verify|escalate/.test(expected) && observed === "handoff") return 0.75;
  if (/cash/.test(expected) && observed === "obtain_cash_available") return 1;
  if (/target_installment|installment/.test(expected) && observed === "obtain_target_installment") return 1;
  if (/wait|pause|no_ai_response|stop_automatic/.test(expected) && observed === "no_ai_response") return 1;
  return 0;
}

function criticalFailures(evalCase, output) {
  const failures = [];
  const reply = String(output.reply_text || "");
  if (output.qualification_status !== evalCase.expected.qualification_status && /marcar qualified|modelo \+ financiaci[oó]n|convertir.*qualified/i.test(evalCase.expected.critical_prohibitions)) failures.push("QUALIFICATION_REGRESSION");
  if (evalCase.eval_id === "GSV1-001" && (output.qualification_status === "qualified" || hasHandoffCopy(reply))) failures.push("GSV1_001_MODEL_PLUS_FINANCING");
  if (isTeraPickup(reply)) failures.push("TERA_MISCLASSIFIED_AS_PICKUP");
  if (evalCase.expected.do_not_contact && (reply.length > 0 || questionCount(reply))) failures.push("DO_NOT_CONTACT_VIOLATION");
  if (/takeover|handed_off/.test(evalCase.scenario_type) && reply.length > 0) failures.push("AI_RESPONDED_DURING_TAKEOVER");
  if (/no fuente|sin ficha|unavailable|unknown|vencid|expired|unverified|no hay precio|stock null/i.test(evalCase.structured_context) && hasMoneyClaim(reply)) failures.push("UNGROUNDED_COMMERCIAL_CLAIM");
  if (/DNI|tel[eé]fono|domicilio|salud|diagn[oó]stico/i.test(evalCase.structured_context) && pIIEcho(reply)) failures.push("PRIVACY_ECHO");
  return [...new Set(failures)];
}

export function gradeCase(evalCase, output) {
  const reply = String(output.reply_text || "");
  const observedNext = inferNextAction(output);
  const critical = criticalFailures(evalCase, output);
  const graders = {
    extraction: gradeExtraction(evalCase, output),
    qualification: result(output.qualification_status === evalCase.expected.qualification_status ? 1 : 0, `observed=${output.qualification_status}`),
    temperature: result(0, "Dimensión ausente en el contrato desplegado."),
    handoff: result(0, `Dimensión ausente; señal textual=${hasHandoffCopy(reply)}`),
    commercial_profile: result(0, "Perfil y missing fields ausentes en el contrato desplegado."),
    conversation_status: result(0, "conversation_status/do_not_contact ausentes en el contrato desplegado."),
    next_action: result(nextActionScore(evalCase.expected.next_action, observedNext), `observed=${observedNext}`),
    conversational_compliance: result([
      reply.length > 0 && reply.length <= 600,
      questionCount(reply) <= 1,
      !/(?:para orientarte mejor|as[ií] podemos ayudarte mejor).*(?:para orientarte mejor|as[ií] podemos ayudarte mejor)/i.test(reply),
    ].filter(Boolean).length / 3, `length=${reply.length};questions=${questionCount(reply)}`),
    grounding: result(hasMoneyClaim(reply) && !output._shadow?.file_search_used ? 0 : 1, output._shadow?.file_search_used ? "file_search observado" : "sin afirmación monetaria o sin evidencia RAG"),
    hallucinations: result(isTeraPickup(reply) ? 0 : 1, isTeraPickup(reply) ? "Tera descrita como pick-up" : "sin detector factual crítico activado"),
    privacy: result(pIIEcho(reply) ? 0 : 1, pIIEcho(reply) ? "posible PII en respuesta" : "sin PII detectable"),
  };
  const weighted = Object.entries(WEIGHTS).reduce((sum, [name, weight]) => sum + graders[name].score * weight, 0);
  const responsibleLayers = new Set();
  if (graders.qualification.status === "fail") { responsibleLayers.add("code"); responsibleLayers.add("prompt"); }
  if (["temperature", "handoff", "commercial_profile", "conversation_status"].some((name) => graders[name].status === "fail")) responsibleLayers.add("extraction_contract");
  if (graders.grounding.status === "fail" || graders.hallucinations.status === "fail") { responsibleLayers.add("RAG_or_commercial_information"); responsibleLayers.add("validation"); }
  if (graders.privacy.status === "fail") { responsibleLayers.add("prompt"); responsibleLayers.add("validation"); }
  if (/tiktok|routing/i.test(evalCase.scenario_type)) responsibleLayers.add("routing");
  if (output._shadow?.selected_training_example_ids?.length) responsibleLayers.add("training_retrieval");
  return {
    eval_id: evalCase.eval_id, score: Number(weighted.toFixed(2)), pass: weighted >= 90 && critical.length === 0,
    severity: evalCase.error_severity, difficulty: evalCase.difficulty, brand: evalCase.brand,
    channel: evalCase.source_channel, modality: evalCase.modality, graders, critical_failures: critical,
    observed: { qualification_status: output.qualification_status, next_action: observedNext, reply_text: reply },
    expected: evalCase.expected, responsible_layers: [...responsibleLayers],
  };
}

function aggregate(items) {
  if (!items.length) return { cases: 0, score: null, pass: 0, fail: 0 };
  return {
    cases: items.length,
    score: Number((items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(2)),
    pass: items.filter((item) => item.pass).length,
    fail: items.filter((item) => !item.pass).length,
  };
}

function segment(results, key) {
  const values = [...new Set(results.map((item) => item[key]))].sort();
  return Object.fromEntries(values.map((value) => [value, aggregate(results.filter((item) => item[key] === value))]));
}

export function buildRunSummary(results) {
  const graderScores = {};
  for (const name of Object.keys(WEIGHTS)) {
    graderScores[name] = Number((results.reduce((sum, item) => sum + item.graders[name].score, 0) / results.length * 100).toFixed(2));
  }
  const errorCounts = new Map(); const layerCounts = new Map();
  for (const item of results) {
    for (const failure of item.critical_failures) errorCounts.set(failure, (errorCounts.get(failure) || 0) + 1);
    for (const [name, grader] of Object.entries(item.graders)) if (grader.status === "fail") errorCounts.set(`GRADER_${name.toUpperCase()}_FAIL`, (errorCounts.get(`GRADER_${name.toUpperCase()}_FAIL`) || 0) + 1);
    for (const layer of item.responsible_layers) layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
  }
  const sortedCounts = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return {
    global: aggregate(results), grader_scores: graderScores,
    critical_failures: results.filter((item) => item.critical_failures.length).map((item) => ({ eval_id: item.eval_id, failures: item.critical_failures })),
    major_failures: results.filter((item) => !item.pass && item.severity === "MAJOR").map((item) => item.eval_id),
    segments: {
      brand: segment(results, "brand"), channel: segment(results, "channel"), modality: segment(results, "modality"),
      difficulty: segment(results, "difficulty"), severity: segment(results, "severity"),
    },
    top_10_errors: sortedCounts(errorCounts).slice(0, 10),
    root_cause_layers: sortedCounts(layerCounts),
    case_to_layer: Object.fromEntries(results.map((item) => [item.eval_id, item.responsible_layers])),
    gsv1_001: results.find((item) => item.eval_id === "GSV1-001"),
  };
}

export { WEIGHTS };
