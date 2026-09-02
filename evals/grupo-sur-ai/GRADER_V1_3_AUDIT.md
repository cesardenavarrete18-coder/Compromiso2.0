# Grader v1.3 — auditoría contractual offline

Fecha: 2026-09-01. Alcance: corrección mínima y aislada sobre Grader v1.2; no se modificaron Candidate, Matrix, Golden, runtime, Training Examples ni Vector Store. No se ejecutaron Responses, eval online, deploy ni merge.

## Identidad y contratos corregidos

- **Grader v1.3 SHA-256:** `9daa4d58acc3ddec9f52c0e1ec0981d315029978df714f887d08959bcbbef142`.
- La familia de `next_action` se obtiene con una sola función aplicada a expected y observed. Los handoffs con causa explícita conservan el guard causal; no se introdujo equivalencia causal universal.
- Grounding acepta importes exactos aportados por el cliente en `runtime_input.inbound_message` o en valores customer-sourced canónicos persistidos. Extraction, profile y `evidence.quote` no agregan autoridad. Cualquier cifra externa requiere RAG con evidencia disponible, claim soportado y fuente vigente/autorizada.
- El modelo esperado elimina solamente backticks/comillas, puntuación terminal y whitespace ornamental, y luego exige igualdad normalizada exacta (no fuzzy matching).
- `identifier_status`, `identifier_attempts` y contadores de reminders quedan fuera del profile comercial de extraction.
- **GSV1-040:** `runtime_input.inbound_message.source_channel=tiktok` contradice el texto esperado “source_channel sigue WhatsApp”. El resultado incluye `GOLDEN_RUNTIME_CONTRACT_ISSUE`; no se exige alterar Candidate.

## Tests

- Grader v1.2: **21/21 PASS**.
- Grader v1.3: **26/26 PASS**. Incluye los contratos A–I: normalización simétrica, guard causal, eco customer-sourced de `$6.000.000`/otros importes, cifra inventada critical, precio externo con/sin RAG, parsing exacto de modelo y exclusión de routing fields.
- Suite combinada de graders v1.2 + v1.3: **47/47 PASS**.
- Suite integral: **197/203 PASS; 6 FAIL contabilizados**. Grader v1.3 no se importa en esas suites:
  - GSV1-029 falla funcionalmente en Candidate v2 y Candidate v2.1;
  - GSV1-080 falla funcionalmente en Candidate v2 y Candidate v2.1;
  - el wrapper padre `GSV1-080/GSV1-082` se contabiliza como fail en ambas suites porque GSV1-080 falla;
  - GSV1-082 **PASS** en Candidate v2 y Candidate v2.1;
  - GSV1-082 **NO es contract-blocked**.

Únicos contract-blocked congelados:

- `GSV1-029 — MISSING_CONTEXT`;
- `GSV1-080 — GOLDEN_RUNTIME_CONFLICT`.

## Regrading offline de outputs históricos

El único conjunto histórico de 100 outputs presente es `candidate-comparison-artifacts-ab-v1-2026-08-27T22-01-57Z.tar.gz`, identificado por su metadata como arm Candidate del commit `2933887...` (Candidate v1). Se regradó sin inferencias ni Responses.

| Candidate | Score v1.3 | PASS | FAIL | casos con critical |
|---|---:|---:|---:|---:|
| v1 | 82.70 | 29 | 71 | 2 |
| v2 | **NO CALCULABLE** | — | — | — |
| v2.1 | **NO CALCULABLE** | — | — | — |

No existen outputs históricos serializados de Candidate v2 ni v2.1 en el repositorio o los dos tarballs disponibles. Fabricarlos implicaría ejecutar nuevas inferencias (prohibido por “NO Responses”), por lo que no se inventan scores.

En Candidate v1, v1.2 daba 81.80, 27 PASS, 73 FAIL y 2 casos con critical. v1.3 cambia sólo:

| Caso | v1.2 | v1.3 | PASS cambiado |
|---|---:|---:|---|
| GSV1-002 | 62.33 | 80.33 | no |
| GSV1-003 | 51.00 | 69.00 | no |
| GSV1-004 | 69.00 | 87.00 | no |
| GSV1-033 | 73.67 | 91.67 | FAIL → PASS |
| GSV1-040 | 73.67 | 91.67 | FAIL → PASS |

Los criticals permanecen exactamente en GSV1-068 y GSV1-087 (`PROHIBITION_HANDOFF_FORBIDDEN`).

## Casos de control

- **GSV1-024:** 100.00, PASS, sin critical; handoff expected/observed normalizado y causal compatible.
- **GSV1-051:** 72.00, FAIL, sin critical. La salida histórica no afirmó un importe; grounding no concede una autorización ficticia.
- **GSV1-064:** 65.33, FAIL, sin critical; expected `obtain_target_installment` frente a observed handoff continúa penalizado.
- El test general “precio comercial sin RAG continúa siendo critical” verifica que `$29.481.100` externo produce `PROHIBITION_AMOUNT_INVENTION_FORBIDDEN`; el test contiguo sólo lo permite cuando RAG declara soporte autorizado.

## Integridad de artefactos congelados

| Artefacto | SHA-256 intacto |
|---|---|
| Grader v1 | `151158dd6c65a410daf95a0dc6d9e7520d970d45ccfb58f1864e302f20dea203` |
| Grader v1.1 | `1eff7a52124a5a80647410f7990c06a555145e981aed79a2aedbac31c164c3d2` |
| Grader v1.2 | `7bc5d450413bd7d01edbd45120b209d7b01b889b88fbefcdcc3511d8f7d0f9b3` |
| Matrix | `b05bce2f43a160e22acbff0e107bfe1ee041f3a45fc1424ce3717f92098f17c9` |
| Golden source | `934d70c25c69c7543e2faf74e0ee5667fc258a273fcf39237a4bb8c4c394cdd0` |
| Golden compiled | `2e096d0230421ac694086e3b2cb85ab8bf87d526cbb9cb9642a3e33ccad1f806` |
| Candidate v1 tree checksum-of-checksums (diagnóstico) | `8de8bd32da0179f792aadb298c7a3d40fb87f4eb962a102efa13baeaeda1aef1` |
| Candidate v2 tree checksum-of-checksums (diagnóstico) | `5c9971a56e709a4bd27205841781e241a6a678e14fa5b0b800929d4699f4bc9f` |
| Candidate v2.1 tree checksum-of-checksums (diagnóstico) | `249ee5d32df36e65928b7f48dec845b89d008b688550b9b9b43abb1815fdaad7` |
| Candidate v2 frozen compound (manifest) | `412969d9c75c51a13127cc8b7ca73b7ffe0ac702c96c7069ea164140c7e6f92e` |
| Candidate v2.1 `historical_compound_sha256` | `b40aeba422d58008cf7a89873274cd683bb700a254972bfa9d5569b00c20a39d` |
| Candidate v2.1 `portable_manifest_sha256` | `d2057318072b6f598165711dab55fa4fbf53f93e6b568ace1401f8a68f689378` |

Los valores `tree checksum-of-checksums` son checksums diagnósticos calculados con su propio método y **NO reemplazan los identificadores canónicos congelados**.

`git diff --check` finaliza limpio. El status previo al commit contiene exclusivamente los tres artefactos v1.3 nuevos: grader, tests y este reporte.
