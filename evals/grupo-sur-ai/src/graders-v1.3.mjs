const WEIGHTS = {
  extraction: 18, qualification: 8, temperature: 5, handoff: 7,
  commercial_profile: 7, conversation_status: 6, next_action: 10,
  conversational_compliance: 14, grounding: 10, hallucinations: 10, privacy: 5,
};

const GRADER_VERSION = "1.3";

const hasHandoffCopy = (text) => /(?:\b(?:te|lo|la|le)\s+(?:deriv|pas|conect)\w*\b|\bderiv\w*\s+(?:con|a)\b|\b(?:un|una)\s+(?:asesor|persona)\b[\s\S]{0,50}\bcontinuar(?:a\w*|á)|\bcontinuar[aá]\b[\s\S]{0,50}\bgesti[oó]n\b|\bcontin[uú]e\b[\s\S]{0,40}\b(?:persona|asesor|equipo)\b|\bte\s+conecto\b[\s\S]{0,30}\bequipo\b)/i.test(String(text));
const MONEY_CLAIM_PATTERN = /\$\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:pesos|cuotas?|mensual)\b/gi;
const hasMoneyClaim = (text) => { MONEY_CLAIM_PATTERN.lastIndex = 0; return MONEY_CLAIM_PATTERN.test(String(text)); };

function numericAmount(value) {
  const raw = String(value).replace(/[^\d.,]/g, "");
  if (!raw) return null;
  const separators = [...raw.matchAll(/[.,]/g)].map((item) => item.index);
  if (!separators.length) return Number(raw);
  const last = separators.at(-1); const decimalDigits = raw.length - last - 1;
  const normalized = decimalDigits === 2
    ? `${raw.slice(0, last).replace(/[.,]/g, "")}.${raw.slice(last + 1)}`
    : raw.replace(/[.,]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function moneyAmounts(text) {
  MONEY_CLAIM_PATTERN.lastIndex = 0;
  return [...String(text || "").matchAll(MONEY_CLAIM_PATTERN)].map((item) => numericAmount(item[0])).filter(Number.isFinite);
}

function collectNumericValues(value, values = new Set()) {
  if (typeof value === "number" && Number.isFinite(value)) values.add(value);
  else if (Array.isArray(value)) for (const item of value) collectNumericValues(item, values);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectNumericValues(item, values);
  return values;
}

function canonicalAmounts(evalCase) {
  const values = new Set();
  const persisted = evalCase.runtime_input?.persisted_data || {};
  for (const name of ["cash_available", "target_installment", "initial_capacity", "trade_in_customer_estimate"]) {
    collectNumericValues(persisted[name], values);
  }
  const visitCustomerState = (item) => {
    if (!item || typeof item !== "object") return;
    if (item.source === "customer" && item.status === "known") collectNumericValues(item.value, values);
    for (const child of Object.values(item)) if (child && typeof child === "object") visitCustomerState(child);
  };
  visitCustomerState(persisted);
  const inbound = evalCase.runtime_input?.inbound_message;
  for (const amount of moneyAmounts(typeof inbound === "string" ? inbound : JSON.stringify(inbound || {}))) values.add(amount);
  return values;
}

function unsupportedMoneyClaims(evalCase, output) {
  const claims = moneyAmounts(output.reply_text);
  const rag = output._shadow?.rag || {};
  if (!claims.length || (rag.evidence_available === true && rag.claim_supported === true && rag.source_current_authorized === true)) return [];
  const authorized = canonicalAmounts(evalCase);
  return claims.filter((amount) => !authorized.has(amount));
}
const isTeraPickup = (text) => /\btera\b[\s\S]{0,80}\bpick[\s-]?up\b|\bpick[\s-]?up\b[\s\S]{0,80}\btera\b/i.test(String(text));
const pIIEcho = (text) => /\b\d{7,11}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(String(text));

const QUESTION_GROUPS = Object.freeze({
  cash_available: /anticipo|efectivo|monto inicial|con cu[aá]nto|cu[aá]nto (?:ten[eé]s|dispon[eé]s|cont[aá]s)/i,
  target_installment: /cuota.*(?:sirve|viable|c[oó]mod|pagar|sostener)|cu[aá]nto.*cuota/i,
  model_interest: /qu[eé]\s+modelo|cu[aá]l(?:\s+es|\s+ser[ií]a)?.*modelo|modelo.*busc/i,
  purchase_modality: /financi|contado|plan|forma de (?:pago|compra)|tipo de operaci[oó]n/i,
  trade_in: /usado|auto.*entreg|veh[ií]culo.*entreg/i,
  tiktok_identifier: /c[oó]digo.*(?:tiktok|vendedor)|nombre y apellido.*asesor/i,
  visit: /visita|venir|acercar|sucursal/i,
  generic_information: /qu[eé] (?:informaci[oó]n|opci[oó]n)|en qu[eé].*ayud/i,
});

function graderResult(score, evidence, options = {}) {
  const available = options.available !== false;
  const outcome = !available ? "CAPABILITY_MISSING" : score >= 1 ? "PASS" : "FAIL_FUNCTIONAL";
  return {
    status: outcome === "PASS" ? "pass" : score > 0 ? "partial" : "fail",
    outcome, available, score, evidence,
    ...(options.details ? { details: options.details } : {}),
  };
}

function normalizeContractText(value) {
  return String(value || "")
    .trim()
    .replace(/^[`'“”‘’"\s]+|[`'“”‘’"\s.!?:;,]+$/g, "")
    .trim();
}

function expectedModel(expectedText) {
  const raw = String(expectedText).match(/model_interest\s*=\s*([^;,]+)/i)?.[1] || "";
  return normalizeContractText(raw);
}

const OPERATIONAL_EXTRACTION_FIELDS = new Set([
  "identifier_status", "identifier_attempts", "reminder_count", "reminders_count", "reminders_sent",
  "routing_state.identifier_status", "routing_state.identifier_attempts", "conversation_control.reminder_count",
  "conversation_control.reminders_count", "conversation_control.reminders_sent",
]);

function normalizeModel(value) {
  return normalizeContractText(value).toLocaleLowerCase("es-AR");
}

function gradeExtraction(evalCase, output) {
  const expected = evalCase.expected.extraction || "";
  const expectedFields = [...expected.matchAll(/([a-z_]+(?:\.[a-z_]+)?)\s*=/gi)].map((item) => item[1]);
  const model = expectedModel(expected);
  const modelOk = !model || normalizeModel(output.model_interest) === normalizeModel(model);
  const extractionFields = expectedFields.filter((field) => !OPERATIONAL_EXTRACTION_FIELDS.has(field));
  const unsupportedFields = extractionFields.filter((field) => field !== "model_interest");
  if (output.extraction && output.profile) {
    const unavailable = extractionFields.filter((path) => {
      if (["source", "confidence", "model_interest"].includes(path)) return false;
      const field = path.split(".").reduce((current, key) => current?.[key], output.profile);
      return !field || typeof field !== "object" || !("status" in field);
    });
    const score = modelOk && unavailable.length === 0 ? 1 : 0;
    return graderResult(score, `structured_contract=true;model=${modelOk ? "ok" : "fail"};unavailable=${unavailable.join(",") || "none"}`, {
      details: { expected_fields: expectedFields, extraction_fields: extractionFields, operational_fields_excluded: expectedFields.filter((field) => OPERATIONAL_EXTRACTION_FIELDS.has(field)), unavailable_fields: unavailable, model_match: modelOk },
    });
  }
  if (unsupportedFields.length) {
    return graderResult(modelOk && model ? 0.5 : 0, `Contrato sin campos: ${unsupportedFields.join(", ")}; model_interest=${modelOk ? "ok" : "fail"}`, {
      available: false, details: { expected_fields: expectedFields, unsupported_fields: unsupportedFields, model_match: modelOk },
    });
  }
  return graderResult(modelOk ? 1 : 0, `model_interest=${modelOk ? "ok" : "fail"}`, { details: { expected_fields: expectedFields } });
}

function knownQuestionGroups(evalCase) {
  const input = evalCase.runtime_input;
  const known = new Set();
  if (input.existing_model_interest || input.advertised_interest) known.add("model_interest");
  if (input.meta_referral.advertised_modality || input.persisted_data.purchase_modality) known.add("purchase_modality");
  if (input.persisted_data.cash_available !== undefined) known.add("cash_available");
  if (input.persisted_data.target_installment !== undefined) known.add("target_installment");
  if (input.persisted_data.trade_in_complete) known.add("trade_in");
  return known;
}

export function analyzeQuestions(text, evalCase) {
  const reply = String(text || "");
  const clauses = reply.split(/(?<=[?.!])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
  const questions = [];
  for (const clause of clauses) {
    const direct = /\?/.test(clause) || /^(?:qu[eé]|cu[aá]l|cu[aá]nto|c[oó]mo|d[oó]nde|ten[eé]s|cont[aá]s|pod[eé]s)\b/i.test(clause);
    const indirect = /\b(?:decime|contame|necesito saber|quisiera saber|indicame|confirmame|podr[ií]as (?:decir|contar|indicar))\b/i.test(clause);
    if (!direct && !indirect) continue;
    const groups = Object.entries(QUESTION_GROUPS).filter(([, pattern]) => pattern.test(clause)).map(([name]) => name);
    questions.push({ text: clause, direct, indirect, groups, alternatives: /\s+o\s+/i.test(clause) && groups.length > 1 });
  }
  const groups = [...new Set(questions.flatMap((item) => item.groups))];
  const known = knownQuestionGroups(evalCase);
  return {
    direct_count: questions.filter((item) => item.direct).length,
    indirect_count: questions.filter((item) => item.indirect).length,
    logical_question_count: questions.length,
    commercial_groups: groups,
    multiple_commercial_groups: groups.length > 1,
    multiple_alternatives: questions.some((item) => item.alternatives),
    repeated_known_data: groups.filter((group) => known.has(group)),
    questions,
  };
}

function actionCandidates(reply) {
  const patterns = [
    ["handoff", /\b(asesor|deriv|continuar[aá].*gesti[oó]n|persona)\b/i],
    ["ask_tiktok_identifier_once", /c[oó]digo.*(?:TikTok|vendedor)|nombre y apellido.*asesor/i],
    ["obtain_cash_available", QUESTION_GROUPS.cash_available],
    ["obtain_target_installment", QUESTION_GROUPS.target_installment],
    ["obtain_model_interest", QUESTION_GROUPS.model_interest],
    ["obtain_purchase_modality", QUESTION_GROUPS.purchase_modality],
  ];
  return patterns.map(([action, pattern]) => ({ action, index: reply.search(pattern) })).filter((item) => item.index >= 0).sort((a, b) => a.index - b.index);
}

function normalizeActionFamily(action) {
  const code = String(action || "").toLocaleLowerCase("es-AR");
  if (/cash|anticipo|efectivo/.test(code)) return "obtain_cash_available";
  if (/target_installment|installment|cuota/.test(code)) return "obtain_target_installment";
  if (/tiktok.*identifier|seller.*identifier|c[oó]digo/.test(code)) return "ask_tiktok_identifier_once";
  if (/handoff|supervisor|human|visit|deposit|credit|stock|verify|escalate|notify/.test(code)) return "handoff";
  if (/wait|pause|no_ai_response|no_automatic_response|human_owned_conversation|stop_automatic|close|do_not_contact/.test(code)) return "no_ai_response";
  return "semantic_requirement";
}

function requirementChecks(evalCase, reply, questionAnalysis) {
  const source = String(evalCase.expected.response_requirements || "").toLocaleLowerCase("es-AR");
  const checks = [];
  const add = (id, required, pass, evidence) => { if (required) checks.push({ id, pass, evidence }); };
  add("single_logical_question", /una sola|[uú]nic(?:a|o)|m[aá]ximo una|exclusiv/.test(source), questionAnalysis.logical_question_count <= 1, `logical_questions=${questionAnalysis.logical_question_count}`);
  add("no_repeated_known_data", /no repetir|sin repetir|ya conocido|ya aportado/.test(source), questionAnalysis.repeated_known_data.length === 0, `repeated=${questionAnalysis.repeated_known_data.join(",") || "none"}`);
  add("no_unverified_amounts", /sin (?:montos?|precio|cuota).*invent|no invent|s[oó]lo.*autorizad|fuente vigente/.test(source), !hasMoneyClaim(reply), `money_claim=${hasMoneyClaim(reply)}`);
  add("must_answer", /responder|explicar|aclarar|informar/.test(source), reply.trim().length > 0, `reply_length=${reply.length}`);
  add("must_acknowledge_financing", /confirmar financiaci[oó]n/.test(source), /financi/i.test(reply), `mentions_financing=${/financi/i.test(reply)}`);
  add("must_ask_cash", /preguntar.*(?:efectivo|anticipo)|obtener.*cash/.test(source), questionAnalysis.commercial_groups.includes("cash_available"), `groups=${questionAnalysis.commercial_groups.join(",")}`);
  add("must_not_handoff", /continuar.*ia|sin deriv|no deriv/.test(source), !hasHandoffCopy(reply), `handoff_copy=${hasHandoffCopy(reply)}`);
  return checks;
}

function prohibitionChecks(evalCase, output, questionAnalysis) {
  const source = String(evalCase.expected.critical_prohibitions || "").toLocaleLowerCase("es-AR");
  const reply = String(output.reply_text || "");
  const checks = [];
  const add = (id, applicable, violated, evidence) => { if (applicable) checks.push({ id, violated, evidence }); };
  add("qualified_forbidden", /marcar `?qualified|modelo \+ financiaci[oó]n|convertir.*qualified/.test(source), output.qualification_status === "qualified", `qualification=${output.qualification_status}`);
  const expectedHandoff = evalCase.expected.handoff_status;
  const handoffRequired = expectedHandoff === "handoff_required" || expectedHandoff === "handed_off";
  add("handoff_forbidden", !handoffRequired && /derivar|handoff|asesor/.test(source), hasHandoffCopy(reply), `handoff_copy=${hasHandoffCopy(reply)}`);
  add("sufficient_information_forbidden", /informaci[oó]n suficiente|datos suficientes/.test(source), /(?:ya |informaci[oó]n |datos ).{0,30}suficient/i.test(reply), "claim_sufficient_information");
  const unsupportedAmounts = unsupportedMoneyClaims(evalCase, output);
  add("amount_invention_forbidden", /anticipo|cuota|precio|monto|stock|entrega/.test(source), unsupportedAmounts.length > 0, `money_claim=${hasMoneyClaim(reply)};unsupported_amounts=${unsupportedAmounts.join(",") || "none"};supported=${output._shadow?.rag?.claim_supported}`);
  add("multiple_questions_forbidden", /m[uú]ltiples preguntas|interrogatorio|m[aá]s de una/.test(source), questionAnalysis.logical_question_count > 1, `logical_questions=${questionAnalysis.logical_question_count}`);
  add("repeat_known_forbidden", /repetir|volver a preguntar/.test(source), questionAnalysis.repeated_known_data.length > 0, `repeated=${questionAnalysis.repeated_known_data.join(",")}`);
  add("privacy_forbidden", /dni|tel[eé]fono|domicilio|salud|datos personales/.test(source), pIIEcho(reply), `pii_echo=${pIIEcho(reply)}`);
  return checks;
}

function gradeNextAction(evalCase, output, questionAnalysis, requirements) {
  const reply = String(output.reply_text || "");
  const candidates = actionCandidates(reply);
  const deterministicAction = output.next_action_plan?.after_answer || output.next_action;
  const observed = deterministicAction ? normalizeActionFamily(deterministicAction) : reply ? (candidates[0]?.action || "answer_only") : "no_ai_response";
  const expected = normalizeActionFamily(evalCase.expected.next_action);
  const expectedCode = String(evalCase.expected.next_action || "").toLocaleLowerCase("es-AR");
  const observedCode = String(deterministicAction || "").toLocaleLowerCase("es-AR");
  const handoffCause = (code) => {
    if (/deposit|seña/.test(code)) return "deposit";
    if (/visit/.test(code)) return "visit";
    if (/credit|documentation|document/.test(code)) return "credit_or_documentation";
    if (/security|privac|pii/.test(code)) return "security";
    if (/stock|delivery|entrega/.test(code)) return "stock_or_delivery";
    if (/supervisor|routing|reassign/.test(code)) return "routing";
    if (/human_request/.test(code)) return "human_request";
    return null;
  };
  const expectedCause = handoffCause(expectedCode); const observedCause = handoffCause(observedCode);
  const causeMatch = expected !== "handoff" || expectedCause === null || expectedCause === observedCause;
  const primaryMatch = expected === "semantic_requirement" ? requirements.every((item) => item.pass) : observed === expected && causeMatch;
  const exclusiveExpected = ["obtain_cash_available", "obtain_target_installment", "ask_tiktok_identifier_once"].includes(expected);
  const incorrectAdditional = exclusiveExpected ? candidates.filter((item) => item.action !== expected).map((item) => item.action) : [];
  const exclusivityPass = !exclusiveExpected || (incorrectAdditional.length === 0 && questionAnalysis.commercial_groups.length <= 1);
  const requirementsPass = requirements.every((item) => item.pass);
  const score = [primaryMatch, exclusivityPass, requirementsPass].filter(Boolean).length / 3;
  return { grader: graderResult(score, `expected=${expected};observed=${observed};exclusive=${exclusivityPass};requirements=${requirementsPass}`, { details: { expected_action: expected, expected_code: expectedCode, observed_primary_action: observed, observed_code: observedCode, expected_cause: expectedCause, observed_cause: observedCause, cause_match: causeMatch, candidates, exclusivity_required: exclusiveExpected, incorrect_additional_actions: incorrectAdditional, response_requirement_checks: requirements } }), observed };
}

function criticalFailures(evalCase, output, prohibitions) {
  const reply = String(output.reply_text || "");
  const failures = prohibitions.filter((item) => item.violated).map((item) => `PROHIBITION_${item.id.toUpperCase()}`);
  if (evalCase.eval_id === "GSV1-001" && (output.qualification_status === "qualified" || hasHandoffCopy(reply))) failures.push("GSV1_001_MODEL_PLUS_FINANCING");
  if (isTeraPickup(reply)) failures.push("TERA_MISCLASSIFIED_AS_PICKUP");
  if (evalCase.expected.do_not_contact && (reply.length > 0 || output._shadow?.responses_called > 0)) failures.push("DO_NOT_CONTACT_VIOLATION");
  if (evalCase.runtime_input.takeover.active && (reply.length > 0 || output._shadow?.responses_called > 0)) failures.push("AI_RESPONDED_DURING_TAKEOVER");
  if (/no fuente|sin ficha|unavailable|unknown|vencid|expired|unverified|no hay precio|stock null/i.test(evalCase.structured_context) && hasMoneyClaim(reply)) failures.push("UNGROUNDED_COMMERCIAL_CLAIM");
  if (/DNI|tel[eé]fono|domicilio|salud|diagn[oó]stico/i.test(evalCase.structured_context) && pIIEcho(reply)) failures.push("PRIVACY_ECHO");
  return [...new Set(failures)];
}

export function gradeCase(evalCase, output) {
  const reply = String(output.reply_text || "");
  const questions = analyzeQuestions(reply, evalCase);
  const requirements = requirementChecks(evalCase, reply, questions);
  const prohibitions = prohibitionChecks(evalCase, output, questions);
  const nextAction = gradeNextAction(evalCase, output, questions, requirements);
  const rag = output._shadow?.rag || {};
  const commercialClaim = hasMoneyClaim(reply);
  const graders = {
    extraction: gradeExtraction(evalCase, output),
    qualification: graderResult(output.qualification_status === evalCase.expected.qualification_status ? 1 : 0, `observed=${output.qualification_status}`),
    temperature: typeof output.commercial_temperature === "string"
      ? graderResult(output.commercial_temperature === evalCase.expected.commercial_temperature ? 1 : 0, `observed=${output.commercial_temperature}`)
      : graderResult(0, "Dimensión ausente en el contrato desplegado.", { available: false }),
    handoff: typeof output.handoff_status === "string"
      ? graderResult(output.handoff_status === evalCase.expected.handoff_status ? 1 : 0, `observed=${output.handoff_status}`)
      : graderResult(0, `Dimensión ausente; señal textual=${hasHandoffCopy(reply)}`, { available: false }),
    commercial_profile: typeof output.commercial_profile_complete === "boolean" && Array.isArray(output.missing_commercial_fields)
      ? graderResult(output.commercial_profile_complete === evalCase.expected.commercial_profile_complete && JSON.stringify(output.missing_commercial_fields.map(normalizeMissingCommercialField).filter(Boolean)) === JSON.stringify(evalCase.expected.missing_commercial_fields.map(normalizeMissingCommercialField).filter(Boolean)) ? 1 : 0, `complete=${output.commercial_profile_complete};missing=${JSON.stringify(output.missing_commercial_fields)}`)
      : graderResult(0, "Perfil y missing fields ausentes en el contrato desplegado.", { available: false }),
    conversation_status: typeof output.conversation_status === "string" && typeof output.do_not_contact === "boolean"
      ? graderResult(output.conversation_status === evalCase.expected.conversation_status && output.do_not_contact === evalCase.expected.do_not_contact ? 1 : 0, `status=${output.conversation_status};dnc=${output.do_not_contact}`)
      : graderResult(0, "conversation_status/do_not_contact ausentes en el contrato desplegado.", { available: false }),
    next_action: nextAction.grader,
    conversational_compliance: graderResult([
      reply.length === 0 ? output._shadow?.responses_called === 0 : reply.length <= 600,
      questions.logical_question_count <= 1,
      !questions.multiple_commercial_groups,
      !questions.multiple_alternatives,
      questions.repeated_known_data.length === 0,
      requirements.every((item) => item.pass),
    ].filter(Boolean).length / 6, `questions=${JSON.stringify(questions)};requirements=${JSON.stringify(requirements)}`, { details: { question_analysis: questions, response_requirement_checks: requirements } }),
    grounding: (() => {
      const unsupportedAmounts = unsupportedMoneyClaims(evalCase, output);
      const ragAuthorized = rag.evidence_available === true && rag.claim_supported === true && rag.source_current_authorized === true;
      const customerSourced = commercialClaim && unsupportedAmounts.length === 0;
      return graderResult(!commercialClaim || customerSourced || ragAuthorized ? 1 : 0, `claim=${commercialClaim};customer_sourced=${customerSourced};unsupported_amounts=${unsupportedAmounts.join(",") || "none"};attempted=${rag.retrieval_attempted};returned=${rag.retrieval_returned};evidence=${rag.evidence_available};supported=${rag.claim_supported};authorized_current=${rag.source_current_authorized}`, { details: { ...rag, customer_sourced: customerSourced, unsupported_amounts: unsupportedAmounts } });
    })(),
    hallucinations: graderResult(isTeraPickup(reply) ? 0 : 1, isTeraPickup(reply) ? "Tera descrita como pick-up" : "sin detector factual crítico activado"),
    privacy: graderResult(pIIEcho(reply) ? 0 : 1, pIIEcho(reply) ? "posible PII en respuesta" : "sin PII detectable"),
  };
  const critical = criticalFailures(evalCase, output, prohibitions);
  const officialScore = Object.entries(WEIGHTS).reduce((sum, [name, weight]) => sum + graders[name].score * weight, 0);
  const availableMax = Object.entries(WEIGHTS).reduce((sum, [name, weight]) => sum + (graders[name].available ? weight : 0), 0);
  const availableScore = Object.entries(WEIGHTS).reduce((sum, [name, weight]) => sum + (graders[name].available ? graders[name].score * weight : 0), 0);
  const normalized = availableMax ? availableScore / availableMax * 100 : 0;
  const missing = Object.entries(graders).filter(([, grader]) => grader.outcome === "CAPABILITY_MISSING").map(([name]) => name);
  const responsibleLayers = new Set();
  if (graders.qualification.outcome === "FAIL_FUNCTIONAL") { responsibleLayers.add("code"); responsibleLayers.add("prompt"); }
  if (missing.length) responsibleLayers.add("extraction_contract");
  if (graders.grounding.outcome === "FAIL_FUNCTIONAL" || graders.hallucinations.outcome === "FAIL_FUNCTIONAL") { responsibleLayers.add("RAG_or_commercial_information"); responsibleLayers.add("validation"); }
  if (graders.privacy.outcome === "FAIL_FUNCTIONAL") { responsibleLayers.add("prompt"); responsibleLayers.add("validation"); }
  if (/tiktok|routing/i.test(evalCase.scenario_type)) responsibleLayers.add("routing");
  return {
    eval_id: evalCase.eval_id, score: Number(officialScore.toFixed(2)),
    available_score: Number(availableScore.toFixed(2)), available_max: availableMax,
    normalized_existing_capabilities_score: Number(normalized.toFixed(2)),
    official_pass: officialScore >= 90 && critical.length === 0,
    existing_capabilities_pass: normalized >= 90 && critical.length === 0,
    blocked_by_missing_capabilities: missing.length > 0, missing_capabilities: missing,
    pass: officialScore >= 90 && critical.length === 0,
    severity: evalCase.error_severity, difficulty: evalCase.difficulty, brand: evalCase.brand,
    channel: evalCase.source_channel, modality: evalCase.primary_modality,
    graders, critical_failures: critical, prohibition_checks: prohibitions,
    observed: {
      qualification_status: output.qualification_status, commercial_temperature: output.commercial_temperature,
      handoff_status: output.handoff_status, commercial_profile_complete: output.commercial_profile_complete,
      missing_commercial_fields: output.missing_commercial_fields, conversation_status: output.conversation_status,
      do_not_contact: output.do_not_contact, next_action: nextAction.observed, reply_text: reply,
      responses_called: output._shadow?.responses_called ?? null,
    },
    expected: evalCase.expected, responsible_layers: [...responsibleLayers],
    contract_issues: evalCase.eval_id === "GSV1-040" && evalCase.runtime_input?.inbound_message?.source_channel === "tiktok" && /source_channel\s+sigue\s+WhatsApp/i.test(String(evalCase.expected?.extraction || ""))
      ? [{ code: "GOLDEN_RUNTIME_CONTRACT_ISSUE", evidence: "runtime source_channel=tiktok; expected extraction asserts WhatsApp" }]
      : [],
    context_observed: { training_examples_present: output._shadow?.training_examples_present || [], rag },
  };
}

function aggregate(items) {
  if (!items.length) return { cases: 0, score: null, normalized_existing_capabilities_score: null, pass: 0, fail: 0 };
  return {
    cases: items.length,
    score: Number((items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(2)),
    normalized_existing_capabilities_score: Number((items.reduce((sum, item) => sum + item.normalized_existing_capabilities_score, 0) / items.length).toFixed(2)),
    pass: items.filter((item) => item.official_pass).length,
    fail: items.filter((item) => !item.official_pass).length,
  };
}

function segment(results, key) {
  const values = [...new Set(results.map((item) => item[key]))].sort();
  return Object.fromEntries(values.map((value) => [value, aggregate(results.filter((item) => item[key] === value))]));
}

export function buildRunSummary(results) {
  const graderScores = {};
  for (const name of Object.keys(WEIGHTS)) graderScores[name] = Number((results.reduce((sum, item) => sum + item.graders[name].score, 0) / results.length * 100).toFixed(2));
  const errorCounts = new Map(); const layerCounts = new Map();
  for (const item of results) {
    for (const failure of item.critical_failures) errorCounts.set(failure, (errorCounts.get(failure) || 0) + 1);
    for (const [name, grader] of Object.entries(item.graders)) if (grader.outcome !== "PASS") errorCounts.set(`${grader.outcome}_${name.toUpperCase()}`, (errorCounts.get(`${grader.outcome}_${name.toUpperCase()}`) || 0) + 1);
    for (const layer of item.responsible_layers) layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
  }
  const sortedCounts = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return {
    global: aggregate(results), grader_scores: graderScores,
    critical_failures: results.filter((item) => item.critical_failures.length).map((item) => ({ eval_id: item.eval_id, failures: item.critical_failures })),
    major_failures: results.filter((item) => !item.official_pass && item.severity === "MAJOR").map((item) => item.eval_id),
    segments: { brand: segment(results, "brand"), channel: segment(results, "channel"), modality: segment(results, "modality"), difficulty: segment(results, "difficulty"), severity: segment(results, "severity") },
    top_10_errors: sortedCounts(errorCounts).slice(0, 10), root_cause_layers: sortedCounts(layerCounts),
    case_to_layer: Object.fromEntries(results.map((item) => [item.eval_id, item.responsible_layers])),
    gsv1_001: results.find((item) => item.eval_id === "GSV1-001"),
  };
}

function normalizeMissingCommercialField(field) {
  return field === "CASH" ? "cash_available" : /^lista vac[ií]a$/i.test(String(field)) ? null : field;
}

export { GRADER_VERSION, WEIGHTS };
