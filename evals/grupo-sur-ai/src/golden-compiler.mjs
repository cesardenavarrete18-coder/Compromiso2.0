import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  BRAND_BY_CASE, CASE_STATE_OVERRIDES, EXPECTED_SEGMENT_COUNTS, MODALITY_BY_CASE,
} from "./canonical-case-contract.mjs";
import { buildCanonicalRuntimeInput } from "./production-state-adapter.mjs";

const EXPECTED_DATASET_HASH = "934d70c25c69c7543e2faf74e0ee5667fc258a273fcf39237a4bb8c4c394cdd0";

function clean(value = "") {
  return String(value).trim().replace(/^`|`$/g, "");
}

function canonicalChannel(value) {
  if (/tiktok/i.test(value)) return "tiktok";
  if (/meta/i.test(value)) return "meta_ads";
  return "whatsapp_organic";
}

function extractQuotedCustomerText(value) {
  const labeled = [...value.matchAll(/Cliente:\s*[“\"]([^”\"]+)[”\"]/gi)].map((item) => item[1]);
  if (labeled.length) return labeled.at(-1).trim();
  const quoted = [...value.matchAll(/[“\"]([^”\"]+)[”\"]/g)].map((item) => item[1]);
  return quoted.length ? quoted.at(-1).trim() : "";
}

function splitConversation(conversation) {
  const normalized = clean(conversation).replace(/\\n/g, "\n");
  const turns = normalized.split(/\n(?=(?:Cliente|Asistente):)/).map((item) => item.trim()).filter(Boolean);
  const lastCustomer = [...turns].reverse().findIndex((item) => item.startsWith("Cliente:"));
  if (lastCustomer < 0) return { history: [], text: normalized };
  const index = turns.length - 1 - lastCustomer;
  return { history: turns.slice(0, index), text: turns[index].replace(/^Cliente:\s*/, "") };
}

function parseList(value) {
  const v = clean(value).replace(/^\[|\]$/g, "").trim();
  if (!v || v === "—") return [];
  return v.split(/,\s*/).map(clean).filter(Boolean);
}

function parseBoolean(value) {
  return /^true$/i.test(clean(value));
}

function expandedCases(markdown) {
  const section = markdown.match(/## 5\. Primeros 20 Eval Cases completos([\s\S]*?)## 6\./)?.[1] || "";
  const blocks = [...`${section}\n### GSV1-END`.matchAll(/^### (GSV1-\d{3}) — ([^\n]+)\n([\s\S]*?)(?=^### GSV1-)/gm)];
  return blocks.map((match) => {
    const fields = {};
    for (const item of match[3].matchAll(/^- `([^`]+)`: (.+)$/gm)) fields[item[1]] = clean(item[2]);
    const conversation = splitConversation(fields.conversation || "");
    const channel = canonicalChannel(fields.source_channel);
    return {
      eval_id: match[1], title: match[2].trim(), scenario_type: fields.scenario_type,
      source_channel: channel,
      matrix_version: fields.matrix_version,
      structured_context: fields.structured_context || "", conversation: fields.conversation,
      parsed_history: conversation.history, parsed_text: conversation.text,
      expected: {
        extraction: fields.expected_extraction,
        qualification_status: fields.expected_qualification_status,
        commercial_temperature: fields.expected_commercial_temperature,
        handoff_status: fields.expected_handoff_status,
        conversation_status: fields.expected_conversation_status,
        do_not_contact: parseBoolean(fields.expected_do_not_contact),
        commercial_profile_complete: parseBoolean(fields.expected_commercial_profile_complete),
        missing_commercial_fields: parseList(fields.expected_missing_commercial_fields),
        commercial_tags: parseList(fields.expected_commercial_tags),
        next_action: fields.expected_next_action,
        response_requirements: fields.response_requirements,
        critical_prohibitions: fields.critical_prohibitions,
      },
      error_severity: fields.error_severity, difficulty: fields.difficulty,
      input_fidelity: "expanded_case",
    };
  });
}

function compactCases(markdown) {
  const section = markdown.match(/## 6\. Eval Cases 021–100[^\n]*([\s\S]*?)## 7\./)?.[1] || "";
  return section.split("\n").filter((line) => /^\| GSV1-\d{3} \|/.test(line)).map((line) => {
    const columns = line.split("|").slice(1, -1).map((item) => item.trim());
    const [evalId, scenario, extraction, outcomes, nextAction, prohibitions, severityDifficulty] = columns;
    const scenarioType = scenario.match(/^`([^`]+)`/)?.[1] || "unknown";
    const channel = canonicalChannel(scenario);
    const outcomeParts = outcomes.split("·").map((item) => item.trim());
    const dimensions = outcomeParts[0].split("/").map((item) => item.trim());
    const mf = outcomeParts.find((item) => /^MF\b/i.test(item))?.replace(/^MF\s*/i, "") || "";
    const cs = outcomeParts.find((item) => /^CS\b/i.test(item))?.replace(/^CS\s*/i, "") || "open";
    const dnc = outcomeParts.find((item) => /^DNC\b/i.test(item))?.replace(/^DNC\s*/i, "") || "false";
    const tagsPart = outcomeParts.find((item) => !/^(MF|CS|DNC)\b/i.test(item) && item !== outcomeParts[0]) || "";
    const quoted = extractQuotedCustomerText(scenario);
    const text = quoted || scenario.replace(/^`[^`]+`,?\s*/, "");
    const action = nextAction.match(/`([^`]+)`/)?.[1] || nextAction.split(";")[0].trim();
    const [severity, difficulty] = severityDifficulty.split("/").map((item) => item.trim());
    return {
      eval_id: evalId, title: scenarioType, scenario_type: scenarioType,
      source_channel: channel,
      matrix_version: "1.4", structured_context: scenario, conversation: text,
      parsed_history: [], parsed_text: text,
      expected: {
        extraction,
        qualification_status: dimensions[0], commercial_temperature: dimensions[1], handoff_status: dimensions[2],
        commercial_profile_complete: parseBoolean(dimensions[3]),
        missing_commercial_fields: parseList(mf), commercial_tags: parseList(tagsPart),
        conversation_status: cs, do_not_contact: parseBoolean(dnc), next_action: action,
        response_requirements: nextAction.replace(/`[^`]+`;?\s*/, ""), critical_prohibitions: prohibitions,
      },
      error_severity: severity, difficulty,
      input_fidelity: quoted ? "compact_case_customer_quote" : "compact_case_context_compilation",
    };
  });
}

export async function compileGoldenDataset(path) {
  const markdown = await readFile(path, "utf8");
  const sha256 = createHash("sha256").update(markdown).digest("hex");
  if (sha256 !== EXPECTED_DATASET_HASH) throw new Error(`DATASET_HASH_MISMATCH:${sha256}`);
  const parsedCases = [...expandedCases(markdown), ...compactCases(markdown)].sort((a, b) => a.eval_id.localeCompare(b.eval_id));
  const cases = parsedCases.map((item) => {
    const brand = BRAND_BY_CASE.get(item.eval_id);
    const primaryModality = MODALITY_BY_CASE.get(item.eval_id);
    if (!brand || !primaryModality) throw new Error(`CANONICAL_METADATA_MISSING:${item.eval_id}`);
    const runtimeInput = buildCanonicalRuntimeInput(item, CASE_STATE_OVERRIDES[item.eval_id] || {});
    const { parsed_history: _history, parsed_text: _text, ...datasetCase } = item;
    return {
      ...datasetCase,
      brand,
      primary_modality: primaryModality,
      modality: primaryModality,
      runtime_input: runtimeInput,
    };
  });
  const ids = new Set(cases.map((item) => item.eval_id));
  if (cases.length !== 100 || ids.size !== 100 || cases[0]?.eval_id !== "GSV1-001" || cases.at(-1)?.eval_id !== "GSV1-100") {
    throw new Error(`GOLDEN_DATASET_COMPILE_FAILED:count=${cases.length}:unique=${ids.size}`);
  }
  if (cases.some((item) => item.matrix_version !== "1.4")) throw new Error("MATRIX_VERSION_MISMATCH");
  for (const [dimension, expected] of Object.entries(EXPECTED_SEGMENT_COUNTS)) {
    for (const [value, count] of Object.entries(expected)) {
      const observed = cases.filter((item) => item[dimension === "primary_modality" ? "primary_modality" : dimension] === value).length;
      if (observed !== count) throw new Error(`CANONICAL_SEGMENT_COUNT_MISMATCH:${dimension}:${value}:${observed}:${count}`);
    }
  }
  return { version: "1.0.0", matrix_version: "1.4", sha256, cases };
}

export const internals = { canonicalChannel, extractQuotedCustomerText };
