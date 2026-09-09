import { extractSemanticMessage } from "../filter-v1/extraction/semantic-extractor.mjs";
import { semanticExtractionToEngine } from "../filter-v1/extraction/semantic-engine-adapter.mjs";
import { runFilterV1Integration } from "../filter-v1/integration/filter-v1-engine.mjs";
import { FILTER_V1_PROVIDER_SCHEMA } from "../filter-v1/online/provider-schema.mjs";
import { buildFilterInput } from "./input-adapter.mjs";
import { createShadowRepository } from "./repository.mjs";
import { runV2ShadowSafely } from "./pipeline.mjs";

async function rows(query) { const result = await query; if (result.error) throw result.error; return result.data ?? []; }
async function openAIExtractorClient({ systemPrompt, input }, env) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY_MISSING");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OPENAI_FILTER_MODEL || "gpt-4.1-mini-2025-04-14", store: false, instructions: systemPrompt, input: JSON.stringify(input), text: { format: { type: "json_schema", name: "filter_v1_semantic", strict: true, schema: FILTER_V1_PROVIDER_SCHEMA } } }) });
  if (!response.ok) throw new Error(`RESPONSES_API_${response.status}`);
  const payload = await response.json();
  return payload.output_text ?? payload.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text ?? (() => { throw new Error("RESPONSES_OUTPUT_MISSING"); })();
}


async function lookupTechnicalKnowledge(request, vectorStoreId, env) {
  if (!vectorStoreId) return [];
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY_MISSING");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OPENAI_V2_RESPONSE_MODEL || "gpt-4.1-mini-2025-04-14", store: false, input: `Find only stable technical documentation for model ${request.subject_model ?? "unknown"}. Do not return prices, installments, advances, bonuses, rates, stock, availability, or campaign terms.`, tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }] }) });
  if (!response.ok) throw new Error(`KNOWLEDGE_RESPONSES_API_${response.status}`);
  const payload = await response.json();
  const content = (payload.output ?? []).flatMap(item => item.content ?? []).find(item => item.type === "output_text");
  if (!content?.text) return [];
  return [{ type: "technical_documentation", value: content.text, source: "ai_knowledge_documents", citations: content.annotations ?? [] }];
}

/** The only production integration surface. Its repository capability can write only the shadow table. */
export async function runWhatsappV2Shadow({ db, env, lead, inboundMessage, conversationControl, v1Decision = null, logger = console }) {
  if (env.AI_V2_SHADOW_MODE !== "true") return { status: "disabled" };
  const repository = createShadowRepository(db);
  const previousRun = await repository.previous(lead.id, inboundMessage.created_at);
  const [messages, attributions, models, brands, campaigns, versions, offers, settings] = await Promise.all([
    rows(db.from("lead_messages").select("id,direction,body,created_at").eq("lead_id", lead.id).lte("created_at", inboundMessage.created_at).order("created_at", { ascending: true }).limit(24)),
    rows(db.from("lead_attributions").select("*").eq("lead_id", lead.id).limit(1)),
    rows(db.from("models").select("*")), rows(db.from("brands").select("*")), rows(db.from("campaigns").select("*").eq("active", true)), rows(db.from("model_versions").select("*")), rows(db.from("bank_credit_offers").select("*,bank_credit_offer_versions(*)").eq("active", true)),
    rows(db.from("ai_assistant_settings").select("vector_store_id").eq("id", true).limit(1)),
  ]);
  const catalog = { brands, models, model_versions: versions };
  const filterInput = buildFilterInput({ lead, messages, attribution: attributions[0] ?? null, catalog, campaigns, modelVersions: versions, bankOffers: offers, conversationControl, previousRun, inboundMessage });
  return runV2ShadowSafely({ env, input: { lead, inboundMessage, filterInput, previousRunId: previousRun?.id ?? null }, repository, extractSemantic: input => extractSemanticMessage({ ...input, client: args => openAIExtractorClient(args, env) }), normalizeExtraction: semanticExtractionToEngine, runFilter: runFilterV1Integration, lookupKnowledge: request => lookupTechnicalKnowledge(request, settings[0]?.vector_store_id, env), v1Decision }, logger);
}
