# Filter v1 — auditoría consolidada de 100 casos

> Generado directamente desde `FILTER_V1_100_CASE_AUDIT.jsonl`; no editar manualmente.

**Schema:** `filter-v1-audit/2.0` · **Total:** 100

## Resumen

| Veredicto | Casos |
|---|---:|
| `keep` | 19 |
| `rewrite` | 27 |
| `runtime_contract_issue` | 28 |
| `move_to_seller_v2` | 8 |
| `move_to_operational_suite` | 18 |
| `remove_or_merge` | 0 |

## Casos

| ID | Suite | Veredicto | Propósito | Gap runtime |
|---|---|---|---|---|
| GSV1-001 | `filter_core` | `rewrite` | REGRESSION: model + financing does not mean qualified | — |
| GSV1-002 | `filter_core` | `runtime_contract_issue` | Meta aporta modelo y financiación | — |
| GSV1-003 | `filter_core` | `rewrite` | Cambio explícito de financiación Meta a contado | — |
| GSV1-004 | `filter_core` | `rewrite` | Anuncio Meta ambiguo | — |
| GSV1-005 | `filter_core` | `rewrite` | Cambio de modelo respecto del anuncio | — |
| GSV1-006 | `filter_core` | `rewrite` | Cliente corrige financiación por plan de ahorro | — |
| GSV1-007 | `seller_v2_preserved` | `move_to_seller_v2` | Conflicto de modalidad no resuelto | — |
| GSV1-008 | `filter_core` | `runtime_contract_issue` | Precio solicitado antes del cuestionario | — |
| GSV1-009 | `filter_core` | `runtime_contract_issue` | Cuota autorizada aceptada por el cliente | symbolic_known_requires_payload_and_provenance, authorized_fact_envelope_required |
| GSV1-010 | `filter_core` | `rewrite` | Cuota vaga no completa target | authorized_fact_envelope_required |
| GSV1-011 | `filter_core` | `keep` | Efectivo inicial cero explícito | — |
| GSV1-012 | `filter_core` | `rewrite` | Perfil financiado completo sin usado | — |
| GSV1-013 | `filter_core` | `keep` | Efectivo contradictorio | — |
| GSV1-014 | `filter_core` | `runtime_contract_issue` | Usado mencionado sin descripción | — |
| GSV1-015 | `filter_core` | `runtime_contract_issue` | Usado parcialmente informado | symbolic_known_requires_payload_and_provenance |
| GSV1-016 | `filter_core` | `runtime_contract_issue` | Usado completo con tasación pendiente | — |
| GSV1-017 | `filter_core` | `runtime_contract_issue` | Estimación del cliente no es tasación | — |
| GSV1-018 | `seller_v2_preserved` | `move_to_seller_v2` | Tasación autorizada e initial capacity | symbolic_known_requires_payload_and_provenance |
| GSV1-019 | `seller_v2_preserved` | `move_to_seller_v2` | Tasación autorizada vencida | symbolic_known_requires_payload_and_provenance |
| GSV1-020 | `filter_core` | `runtime_contract_issue` | Perfil completo con cash, cuota y usado espontáneos | — |
| GSV1-021 | `filter_edge_and_safety` | `rewrite` | visit today model known | — |
| GSV1-022 | `filter_core` | `rewrite` | hot without model | — |
| GSV1-023 | `filter_core` | `rewrite` | human request unqualified | — |
| GSV1-024 | `filter_edge_and_safety` | `rewrite` | conversation exhaustion | — |
| GSV1-025 | `seller_v2_preserved` | `move_to_seller_v2` | frustrated financing customer | — |
| GSV1-026 | `filter_core` | `rewrite` | exploratory price request | — |
| GSV1-027 | `seller_v2_preserved` | `move_to_seller_v2` | long term interest | — |
| GSV1-028 | `filter_edge_and_safety` | `rewrite` | deposit ready | — |
| GSV1-029 | `filter_edge_and_safety` | `rewrite` | documentation ready | — |
| GSV1-030 | `seller_v2_preserved` | `move_to_seller_v2` | complete but long term | symbolic_known_requires_payload_and_provenance |
| GSV1-031 | `operational_shared` | `move_to_operational_suite` | tiktok valid code | — |
| GSV1-032 | `operational_shared` | `move_to_operational_suite` | tiktok unambiguous advisor name | — |
| GSV1-033 | `operational_shared` | `move_to_operational_suite` | tiktok missing identifier | — |
| GSV1-034 | `operational_shared` | `move_to_operational_suite` | tiktok conflicting codes | — |
| GSV1-035 | `operational_shared` | `move_to_operational_suite` | tiktok invalid code | — |
| GSV1-036 | `operational_shared` | `move_to_operational_suite` | tiktok inactive advisor | — |
| GSV1-037 | `operational_shared` | `move_to_operational_suite` | tiktok code name conflict | — |
| GSV1-038 | `operational_shared` | `move_to_operational_suite` | tiktok hot missing identifier | — |
| GSV1-039 | `operational_shared` | `move_to_operational_suite` | routing not qualification | authorized_fact_envelope_required |
| GSV1-040 | `operational_shared` | `move_to_operational_suite` | channel claim without identifier | — |
| GSV1-041 | `filter_edge_and_safety` | `runtime_contract_issue` | tera body type grounding | — |
| GSV1-042 | `filter_edge_and_safety` | `keep` | tera adversarial misclassification | — |
| GSV1-043 | `filter_edge_and_safety` | `runtime_contract_issue` | unvalidated engine question | authorized_fact_envelope_required |
| GSV1-044 | `filter_edge_and_safety` | `runtime_contract_issue` | authorized product spec | symbolic_known_requires_payload_and_provenance, authorized_fact_envelope_required |
| GSV1-045 | `filter_edge_and_safety` | `runtime_contract_issue` | product rag missing | authorized_fact_envelope_required |
| GSV1-046 | `filter_edge_and_safety` | `runtime_contract_issue` | fiat product variant | symbolic_known_requires_payload_and_provenance, authorized_fact_envelope_required |
| GSV1-047 | `filter_edge_and_safety` | `runtime_contract_issue` | conflicting product sources | authorized_fact_envelope_required |
| GSV1-048 | `filter_edge_and_safety` | `rewrite` | tera toro confusion | — |
| GSV1-049 | `filter_edge_and_safety` | `keep` | product prompt injection | — |
| GSV1-050 | `filter_edge_and_safety` | `runtime_contract_issue` | unknown version availability | symbolic_known_requires_payload_and_provenance |
| GSV1-051 | `filter_edge_and_safety` | `runtime_contract_issue` | authorized current price | symbolic_known_requires_payload_and_provenance, authorized_fact_envelope_required |
| GSV1-052 | `filter_edge_and_safety` | `runtime_contract_issue` | expired commercial price | — |
| GSV1-053 | `filter_edge_and_safety` | `runtime_contract_issue` | missing commercial price | authorized_fact_envelope_required |
| GSV1-054 | `filter_edge_and_safety` | `runtime_contract_issue` | commercial offer model mismatch | authorized_fact_envelope_required |
| GSV1-055 | `filter_edge_and_safety` | `runtime_contract_issue` | expired campaign | authorized_fact_envelope_required |
| GSV1-056 | `filter_edge_and_safety` | `rewrite` | unknown stock | symbolic_known_requires_payload_and_provenance |
| GSV1-057 | `seller_v2_preserved` | `move_to_seller_v2` | delivery date unavailable | — |
| GSV1-058 | `filter_edge_and_safety` | `runtime_contract_issue` | unverified bonus | authorized_fact_envelope_required |
| GSV1-059 | `filter_core` | `rewrite` | currency and amount ambiguity | — |
| GSV1-060 | `filter_edge_and_safety` | `runtime_contract_issue` | customer quotes old ad | authorized_fact_envelope_required |
| GSV1-061 | `filter_edge_and_safety` | `keep` | answer question first | — |
| GSV1-062 | `filter_core` | `keep` | one logical question per turn | — |
| GSV1-063 | `filter_core` | `keep` | avoid repeating name | — |
| GSV1-064 | `filter_core` | `runtime_contract_issue` | do not repeat known question | symbolic_known_requires_payload_and_provenance, authorized_fact_envelope_required |
| GSV1-065 | `filter_core` | `runtime_contract_issue` | extract multiple spontaneous fields | symbolic_known_requires_payload_and_provenance, authorized_fact_envelope_required |
| GSV1-066 | `filter_core` | `keep` | ambiguous cash statement eval only | — |
| GSV1-067 | `filter_edge_and_safety` | `keep` | customer rude but commercial | — |
| GSV1-068 | `filter_edge_and_safety` | `rewrite` | anti interrogation | authorized_fact_envelope_required |
| GSV1-069 | `filter_edge_and_safety` | `keep` | zone question remote | — |
| GSV1-070 | `filter_core` | `runtime_contract_issue` | contextual yes resolution | symbolic_known_requires_payload_and_provenance |
| GSV1-071 | `filter_edge_and_safety` | `rewrite` | sensitive health context | authorized_fact_envelope_required |
| GSV1-072 | `filter_edge_and_safety` | `keep` | unsolicited dni | — |
| GSV1-073 | `filter_edge_and_safety` | `rewrite` | unsolicited phone | — |
| GSV1-074 | `filter_edge_and_safety` | `keep` | explicit opt out | — |
| GSV1-075 | `filter_edge_and_safety` | `keep` | wrong number | — |
| GSV1-076 | `filter_edge_and_safety` | `keep` | employment inquiry | — |
| GSV1-077 | `filter_edge_and_safety` | `keep` | supplier inquiry | — |
| GSV1-078 | `filter_edge_and_safety` | `keep` | after sales request | — |
| GSV1-079 | `operational_shared` | `move_to_operational_suite` | two hour reminder due | — |
| GSV1-080 | `operational_shared` | `move_to_operational_suite` | reminder not yet due | — |
| GSV1-081 | `operational_shared` | `move_to_operational_suite` | reminder after customer reply | — |
| GSV1-082 | `operational_shared` | `move_to_operational_suite` | single reminder limit | — |
| GSV1-083 | `operational_shared` | `move_to_operational_suite` | human takeover active | — |
| GSV1-084 | `operational_shared` | `move_to_operational_suite` | incoming during takeover | — |
| GSV1-085 | `operational_shared` | `move_to_operational_suite` | handoff accepted | — |
| GSV1-086 | `operational_shared` | `move_to_operational_suite` | handoff not yet accepted | — |
| GSV1-087 | `filter_edge_and_safety` | `keep` | privacy prompt injection | — |
| GSV1-088 | `filter_edge_and_safety` | `keep` | training data exfiltration spam | — |
| GSV1-089 | `filter_edge_and_safety` | `rewrite` | precise address unnecessary | authorized_fact_envelope_required |
| GSV1-090 | `filter_edge_and_safety` | `rewrite` | supervisor privacy summary | — |
| GSV1-091 | `filter_edge_and_safety` | `keep` | commercial prompt injection | authorized_fact_envelope_required |
| GSV1-092 | `filter_core` | `runtime_contract_issue` | multiple modality corrections | — |
| GSV1-093 | `filter_edge_and_safety` | `rewrite` | conflicting model interest | — |
| GSV1-094 | `filter_core` | `runtime_contract_issue` | no cash not unqualified | authorized_fact_envelope_required |
| GSV1-095 | `filter_edge_and_safety` | `rewrite` | explicit no economic capacity | authorized_fact_envelope_required |
| GSV1-096 | `filter_core` | `rewrite` | cash purchase complete | — |
| GSV1-097 | `filter_edge_and_safety` | `rewrite` | serious fraud objection | — |
| GSV1-098 | `filter_core` | `runtime_contract_issue` | remote zone service | — |
| GSV1-099 | `filter_core` | `rewrite` | qualified explicit human request | — |
| GSV1-100 | `seller_v2_preserved` | `move_to_seller_v2` | turn limit preserves qualification | — |

## Regla de regeneración

Este informe es una proyección del JSONL. El JSONL es la única fuente de auditoría; cualquier cambio debe hacerse allí y regenerar esta tabla.
