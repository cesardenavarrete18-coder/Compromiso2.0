# Filter v1 real-schema preflight v0.2.1

Schema SHA: `ffc847ef78095ec255235d3f9ac0c23e3469209a39acb5a22ee16809d6f8d2bb`; offline compatibility errors: **0**.

Exactly two online calls were made, one per requested model, using unchanged FVS-001, dataset and semantic prompt.

| Model | HTTP | Provider accepted | Structured output | Local validator | Evidence | Expected match |
|---|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | 200 | true | true | true | true | true |
| gpt-5.6-terra | 200 | true | true | false | false | false |

READY_TO_RERUN_BENCHMARK_V0_2=no

Luna passed provider acceptance, parsing, local validation, evidence validation and the FVS-001 expected comparison. Terra passed provider acceptance and parsing, but local validation rejected its output with `INVALID_OR_MISSING_EVIDENCE`; therefore the transport gate remains closed. The v0.2.1 runner did not retain raw output on local failure, so the exact offending evidence member cannot be reconstructed without another bounded Terra preflight. Raw structured output retention has been added for future diagnostics, without another online call in this task.
