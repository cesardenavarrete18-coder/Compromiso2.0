# Filter v1 semantic online diagnostic v0.1

Both requested model runs used the same prompt, provider schema, dataset and parameters. No prompt tuning occurred between runs.

| Metric | Luna | Terra | Gate |
|---|---:|---:|---:|
| Schema valid | 0.0000 | 0.0000 | 1.00 |
| Extraction success | 0.0000 | 0.0000 | — |
| Field F1 | 0.0000 | 0.0000 | ≥0.95 |
| Critical pass | 0.0000 | 0.0000 | 1.00 |
| Evidence valid | 0.0000 | 0.0000 | 1.00 |
| Correct abstention | 0.0000 | 0.0000 | ≥0.95 |
| False inference | 0.0000 | 0.0000 | diagnostic |
| Forbidden effect | 0.0000 | 0.0000 | 0.00 |

`RECOMMENDED_MODEL=NONE`. All 100 cases for each model returned `EXTRACTOR_CLIENT_ERROR` before a validated extraction. The frozen v0.1 harness intentionally did not retain response bodies, but it also failed to retain the safe HTTP status; therefore this run cannot distinguish unavailable model IDs from a provider rejection of the request/schema. No semantic conclusions about Luna versus Terra are valid.

A future v0.2 run must first add safe provider diagnostics (HTTP status/request ID without body or secrets), then execute only after approval as a new frozen comparison.
