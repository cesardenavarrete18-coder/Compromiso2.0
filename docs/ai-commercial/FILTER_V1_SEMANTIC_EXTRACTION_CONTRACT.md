# Filter v1 — Semantic Extraction Contract 1.0

## Boundary

The extractor proposes structured observations; the deterministic engine owns every effect. Input is the current customer message, recent conversation, prior canonical state, acquisition context and known catalog context. It never receives campaign prices, PLAN_FACTS, Golden/grader expectations or desired decisions.

Provider integration is a single injected function. Phase 3 imports no SDK and makes no network request. Prompt/schema version: `filter-v1-semantic-extractor/1.0`.

## Semantics

`certainty=explicit|contextual|ambiguous`; there is no numeric confidence. Contextual extraction may cite the current customer message plus the immediately preceding assistant question or canonical state. Ambiguity preserves literal data, abstains from a resolved value and adds a clarification code.

The contract separates query intent from `purchase_mode_statement`. Questions about installments, financing or cash price do not state a purchase mode. Subscription is distinct from delivery advance. Customer `down_payment_capacity` is distinct from every campaign field; the extractor never sees campaign values.

Vehicle roles are `target|target_candidate|comparison|owned_only|trade_in|unknown`. It emits text, never UUIDs. Multiple candidates remain multiple. Ownership alone never means trade-in. Action timing and contact timing occupy separate fields.

## Evidence

Every material object carries `{message_id,text}` evidence; material primitive signals use the top-level evidence map. Text must occur in the referenced input message. Optional offsets must reproduce the exact substring. Contextual values cite all observable messages that establish the interpretation. Invented/missing evidence fails the whole extraction.

No `reasoning`, `analysis`, `thinking` or `chain_of_thought` is accepted or persisted. Decision trace remains an engine concern.

## Validation and fail-closed policy

Structural corruption, invalid enum/schema, invalid evidence, forbidden effect field, malformed JSON or provider failure returns `status=extraction_failed`, `extraction=null`; the engine must not run on partial output. Valid semantic ambiguity is not failure: normalize unsafe amount/currency to null and retain clarification.

Forbidden effect fields include qualification, handoff, contact priority, profile completeness, selected campaign/plan, answer fact, next action/question and numeric confidence. Unknown top-level fields are removed and reported; forbidden effect fields fail extraction. Normalization also prevents query→purchase-mode, ambiguous `5.000`→5M, and trade-in without intent.

## Engine adapter

Only validated extraction passes through `semanticExtractionToEngine`. It maps explicit cash/financed statements, safe customer amounts, vehicle text roles, trade-in intent, human/action/DNC signals, corrections and timing literals. The existing integration engine then resolves catalog IDs, campaign facts, profile, priority, handoff and response plan.

## Deferred

Online provider evaluation, real Responses integration, provider-specific structured output, temporal parsing, deep catalog completion, Golden and Grader are later phases. This test suite is contract/regression coverage, not the Golden dataset.
