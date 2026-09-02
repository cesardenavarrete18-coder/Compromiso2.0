# Candidate v2.3 — purchase modality provenance audit

Audit performed before Candidate v2.3 implementation against the frozen compiled forensic input at base commit `75ff988aec4215b78d34852cca665c8736d14e58`. The audit treats `runtime_input` as the production contract. `known_state_requirements`, Golden prose, expected fields and `structured_context` are diagnostic metadata only and are **not** runtime authority.

## Classification key

- **A** — explicit customer evidence.
- **B** — persisted canonical state.
- **C** — structured Meta referral.
- **D** — deterministic prior canonical state.
- **E** — prior conversational text only.
- **F** — structured-context or Golden assumption only.
- **G** — generic financing context only.
- **H** — no canonical evidence.

`G` deliberately does not materialize `purchase_modality`: installments, down payments and general financing language permit qualification continuity, but do not identify an exact modality. Asking for a cash price likewise does not establish a cash transaction.

## Complete audit of reported `missing purchase_modality` cases

| Case | Class | Runtime evidence | Candidate v2.3 treatment |
|---|---:|---|---|
| GSV1-009 | G | Customer accepts an authorized installment anchor; no modality is persisted and the assistant's prior prose is not monetary authority. | Preserve the accepted anchor only when its canonical runtime anchor exists; modality remains unknown. |
| GSV1-010 | G | “cuota baja” is a qualitative installment preference. | Financing context only; do not materialize financing/plan/credit. |
| GSV1-013 | G | Two conflicting down-payment amounts. | Preserve cash conflict; modality remains unknown. |
| GSV1-015 | H | Trade-in declaration and persisted unmaterialized cash, but no modality. | Preserve trade-in and cash knowledge; modality remains unknown. |
| GSV1-018 | F | Cash/target/trade markers exist, but no persisted modality; Golden assumes a financed operation. | Do not manufacture modality. Action-ready semantics may still dominate collection. |
| GSV1-019 | F | Cash/target and expired valuation markers exist, but no persisted modality. | Do not infer modality from adjacent economic state. |
| GSV1-025 | H | Frustration and an existing model only. | Repair/handoff causality is independent of modality. |
| GSV1-029 | F | “documentación” + “avanzar hoy”; no model or credit/modal­ity state. | Detect documentation-ready action, but never invent credit. Known contract tension, deliberately not optimized. |
| GSV1-030 | F | Cash/target/horizon are persisted; exact modality appears only in Golden expectation. | Preserve runtime state and horizon; modality remains unknown. |
| GSV1-032 | F | TikTok routing identity and model; Golden assumes plan. | Route deterministically; no modality materialization. |
| GSV1-034 | F | TikTok routing ambiguity and model; no modality runtime state. | Supervisor routing dominates; modality remains unknown. |
| GSV1-041 | H | Meta supplies Tera as model, not modality; customer asks taxonomy. | Preserve Meta model and answer only through authorized taxonomy safety. |
| GSV1-043 | H | Model plus unavailable product evidence. | Handle concrete query; no modality inference. |
| GSV1-044 | H | Model plus authorized product evidence. | Answer concrete query, then at most one logical question; modality remains unknown. |
| GSV1-046 | H | Model plus authorized product evidence. | Same; variant/spec language is not modality. |
| GSV1-047 | H | Model plus conflicting product evidence. | Escalate factual conflict; modality remains unknown. |
| GSV1-048 | H | Meta supplies Tera as model; “Toro” is a comparison, no modality. | Keep target ambiguous where appropriate and enforce taxonomy for every mentioned/canonical vehicle. |
| GSV1-049 | H | Manipulation request without canonical model or modality. | Refuse false factual claim; do not qualify by invented state. |
| GSV1-053 | H | “precio … al contado” is a price idiom, not transactional cash intent. | Keep modality unknown; never convert to cash. |
| GSV1-056 | H | Immediate-delivery query with model and unknown stock. | Verification policy controls action; no modality inference. |
| GSV1-057 | H | Delivery-date query without model or modality. | Urgent verification may dominate; modality remains unknown. |
| GSV1-063 | F | Existing model and turn-limit state only; Golden assumes financing. | Preserve model; no exact modality. |
| GSV1-065 | G | Explicit cash amount and target installment imply financing context, not an exact product. | Preserve economic facts and continue; modality remains unknown unless explicitly supplied. |
| GSV1-068 | G | “Sólo decime la cuota” plus prior assistant questionnaire. | Respect explicit limited scope; assistant prose is not modality authority. Deliberately no case-specific optimization. |
| GSV1-073 | A | “Quiero consultar el plan.” | Materialize `savings_plan` from current customer evidence. |
| GSV1-079 | F | Reminder event/model only; Golden assumes financing. | Event policy only; modality remains unknown. |
| GSV1-080 | F | Reminder event/model only; Golden/runtime timing conflict is unrelated to modality. | Deliberately not optimized. |
| GSV1-082 | F | Reminder counters/model only; Golden assumes financing. | Do not put reminder count in commercial profile; deliberately not optimized. |
| GSV1-083 | F | Takeover event/model only; Golden assumes financing. | Automation block/ownership dominates; modality remains unknown. |
| GSV1-084 | H | Human takeover, model and generic price query only. | No AI response and no modality inference. |
| GSV1-085 | F | Accepted handoff/model/prior qualification only; Golden assumes financing. | Preserve human ownership; modality remains unknown. |
| GSV1-089 | G | A model and installment query; omitted address is PII context. | Do not echo PII and do not infer exact modality. |

## Programmatic expansion beyond the supplied list

The compiled Golden cases were scanned for expected missing-field text containing `purchase_modality` and for runtime inputs lacking `persisted_data.purchase_modality` and `meta_referral.advertised_modality`. No additional case with canonical persisted or Meta modality was discovered among the supplied forensic set. The broader scan confirms that many expected descriptions implicitly name financing or plan despite the value not existing in `runtime_input`; those are class **F** or **G**, not production facts.

## Canonical modality findings

- **Actually canonical in this audited set:** only **GSV1-073**, through explicit current-turn customer evidence (`savings_plan`).
- **Canonical persisted modality:** none of the listed cases.
- **Canonical Meta modality:** none of the listed cases.
- **Not canonical:** GSV1-009/010/013/065/068/089 contain only generic financing context; the remaining F/H cases have Golden-only assumptions or no modality evidence.

## Implementation boundary

Candidate v2.3 may consume explicit customer evidence, materialized persisted state, structured Meta referral state, the deterministic existing model field, and supported previous state. It must not read `known_state_requirements`, Golden expected values, `eval_id`, or `structured_context` as commercial truth.
