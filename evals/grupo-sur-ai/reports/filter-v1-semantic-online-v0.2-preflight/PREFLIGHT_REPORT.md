# Filter v1 online extractor preflight v0.2

## Request inspected

| Field | v0.1 | v0.2 preflight |
|---|---|---|
| models | Luna / Terra | Luna / Terra |
| reasoning | `{"effort":"minimal"}` | `{"effort":"none"}` |
| text format | `json_schema`, strict | same for B/C; absent for A |
| store | false | false |
| tools | absent | absent |
| max output tokens | 3000 | 3000 |
| endpoint | Responses API | Responses API |

`minimal` was a request-compatibility bug and was removed before v0.2.

## Offline schema audit

The enhanced linter marks the schema sent during preflight C as incompatible: 20 `const`/`enum` nodes lacked an explicit `type`. Root/object required and `additionalProperties=false` checks otherwise passed. The provider independently returned `invalid_json_schema` at `text.format.schema`, first reporting `schema_version` without `type`.

A representation-only v0.2 schema adds explicit string types without changing semantic enums or nullability. Old provider SHA: `8660f9d23e34e1731cb0859cef929e02f681d1d984f7ec7262cf80e4a35e8807`; corrected SHA: `ffc847ef78095ec255235d3f9ac0c23e3469209a39acb5a22ee16809d6f8d2bb`. The corrected schema passes the local compatibility linter but was not sent online because the six-call cap had been reached.

## Online stages

| Model | Basic | Minimal structured | Real Filter schema |
|---|---|---|---|
| `gpt-5.6-luna` | passed, HTTP 200 | passed, HTTP 200 | failed, HTTP 400 `invalid_json_schema` |
| `gpt-5.6-terra` | passed, HTTP 200 | passed, HTTP 200 | failed, HTTP 400 `invalid_json_schema` |

Calls: **6/6**. Both models are accessible and both support `reasoning.effort=none` plus minimal strict Structured Outputs. The failure is the provider-facing Filter schema representation, not auth, access, transport, or semantic model quality.

## Root cause and next gate

`ROOT_CAUSE=PROVIDER_SCHEMA_INCOMPATIBLE,STRUCTURED_OUTPUT_REQUEST_ERROR`.

`READY_TO_RERUN_BENCHMARK_V0_2=no`: first execute a new bounded real-schema-only compatibility preflight (one call per model) against the corrected SHA. Do not run the 100-case benchmark until both calls pass local semantic validation. Frozen v0.1 artifacts and its dataset/prompt/expected remain unchanged.
