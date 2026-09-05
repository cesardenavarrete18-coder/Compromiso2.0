# Filter v1 semantic extractor 1.3 — final business decisions

## Contract

Version `filter-v1-semantic-extractor/1.3` removes the unsupported subscription intent. Entry/start-of-plan questions without a concrete amount type use `ambiguous_initial_amount` plus `initial_amount_intent` clarification.

Only one canonical target model is persisted. Its transition priority is: explicit customer correction, existing canonical state, single acquisition referral, single explicit purchase target, then structured CRM fallback. Other turn mentions may be a transient fact subject or alternatives, but never become multiple persisted interests.

Technical questions produce an authorized-knowledge request. The semantic extractor identifies intent and subject only; it does not retrieve documents or answer specifications.

## Authorized ground-truth changes from v0.1 to v0.2

| Cases | Old expectation | New expectation | Business reason |
|---|---|---|---|
| FVS-011–014 | Legacy subscription intent | `ambiguous_initial_amount` + `initial_amount_intent` | Subscription is not a supported commercial concept. |
| FVS-020 | Ambiguous initial amount | Unchanged, with safe clarification retained | Explicitly records the canonical behavior shared with entry queries. |
| FVS-057 | `model_text=Gol` | `model_text=Gol Trend` | Preserve the complete model explicitly stated by the customer. |
| FVS-058 | `trade_in_intent=no` | `not_present` | “Me la quedo” has no safe referent without prior context. |
| FVS-066 | `human_request=true` | `human_request=null` | Isolated verification “with someone” is not an unequivocal handoff request. |
| FVS-071 | `documents` strong action | requested/strong action absent | Having papers ready is not a request to send them. |
| FVS-047–049 | Transient target candidates | Unchanged extraction; integration asserts zero or one persisted canonical target | Alternatives are turn-local and require prioritization. |

Historical dataset v0.1 and all v1.2 evaluation artifacts remain immutable.

## Authorized knowledge handoff

Administration uploads a PDF into `ai_knowledge_documents` and invokes `ai-knowledge-ingest`. The ingest function indexes the OpenAI file in the configured Vector Store and stores its identifier in `ai_assistant_settings.vector_store_id`. The current WhatsApp assistant reads that setting and enables `file_search` for response generation.

Filter v1.3 now emits a `technical_knowledge` fact with `requires_knowledge_lookup`, the transient subject model, and an `authorized_knowledge` request in its response plan. Filter remains provider-agnostic and does not perform retrieval itself. The production webhook does not yet call `runFilterV1Integration`; connecting this response-plan contract to its existing `file_search` request is the remaining production wiring step.
