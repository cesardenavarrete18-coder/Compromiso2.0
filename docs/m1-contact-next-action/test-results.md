# M1-04B — resultados ejecutados

PostgreSQL 17.6 real, VM sin NIC, datos sintéticos. **80/80 PASS, cero fallos, skips o cancelaciones** en la suite final. La instalación se ejecutó B02→B03→B01→B04→B05 antes de los escenarios funcionales.

| ID | Escenario ejecutado | Resultado |
|---|---|---|
| DB-B01 | complete ordered installation has validated PostgreSQL catalogs | **PASS** |
| DB-B02 | missing dependencies and wrong order roll back without B authority | **PASS** |
| DB-B03 | each installation prefix is closed and adopts no business row | **PASS** |
| DB-B04 | owner role, memberships, fixed search paths and closed definer functions | **PASS** |
| DB-B05 | real API roles have no direct table access and FORCE RLS remains enabled | **PASS** |
| DB-B06 | runtime rows, gate, JWT/header/GUC never constitute technical adoption | **PASS** |
| DB-B07 | adoption requires durable Assignment and exact B gate, preserves baseline evidence | **PASS** |
| DB-B08 | pause is sticky, keeps commercial/channel epochs and seller channel denial | **PASS** |
| DB-B09 | durable facts, adoptions and terminal history cannot be updated/deleted/truncated | **PASS** |
| DB-B10 | future gates and FoundationProbe remain non-authoritative | **PASS** |
| DB-B11 | current owner and management scope, never historical task ownership | **PASS** |
| DB-B12 | actor, ownership and privileged provenance cannot be injected | **PASS** |
| DB-B13 | inactive actor and concurrent deactivation are rejected | **PASS** |
| DB-B14 | foreign task, sequence, action and fact references fail closed | **PASS** |
| DB-B15 | same command ID and intent yield one effect and replay | **PASS** |
| DB-B16 | same idempotency key replays only same hash | **PASS** |
| DB-B17 | new keys cannot duplicate or overwrite stable fact/action identities | **PASS** |
| DB-B18 | stale aggregate, Assignment and B revisions never partially apply | **PASS** |
| DB-B19 | replay reevaluates read rights but succeeds through pause for authorized actor | **PASS** |
| DB-B20 | neither GUC nor another domain receipt grants Contact DML | **PASS** |
| DB-B21 | no_answer records real declared attempt/credit without stage/channel mutation | **PASS** |
| DB-B22 | personal WA sent is declared evidence, never delivery or corporate channel proof | **PASS** |
| DB-B23 | answered plus explicit next action is atomic and preserves commercial stage | **PASS** |
| DB-B24 | manual skipped records omission, never attempt or last contact | **PASS** |
| DB-B25 | deadline observation is clock work with no seller contact or productivity attribution | **PASS** |
| DB-B26 | future/ambiguous times and incompatible channels never receive silent normalization | **PASS** |
| DB-B27 | late evidence survives and only explicit supervisor review grants delayed credit | **PASS** |
| DB-B28 | older occurrence does not replace latest contact and remains historical evidence | **PASS** |
| DB-B29 | supervisor amendment is append-only, compensates credit and never reopens protocol | **PASS** |
| DB-B30 | one task and fact have at most one credit; inbound response does not invent call credit | **PASS** |
| DB-B31 | new action has stable identity, revision and explicit date without contact or stage | **PASS** |
| DB-B32 | reschedule and note editing preserve action identity and protocol history | **PASS** |
| DB-B33 | factual completion needs no invented date, but ordinary cancellation needs replacement | **PASS** |
| DB-B34 | explicit cancellation and replacement do not restart protocol or erase on omission | **PASS** |
| DB-B35 | server clock observes deadline once while getter performs zero writes | **PASS** |
| DB-B36 | rescheduling an overdue action retains old observation and advances revision | **PASS** |
| DB-B37 | deep protected snapshot remains identical through contact/action/omission | **PASS** |
| DB-B38 | opt-out atomically restricts linked customer and removes future work without stage | **PASS** |
| DB-B39 | paused gate only admits restrictive opt-out without credit or new schedule | **PASS** |
| DB-B40 | incoherent customer identity fails without repair and no B operation lifts restriction | **PASS** |
| DB-B41 | 18+2 and historical 6+2 protocol IDs/windows survive adoption and transfer | **PASS** |
| DB-B42 | fully credited no-response protocol closes factually without cold/Recall/stage | **PASS** |
| DB-B43 | all omitted yields protocol_incomplete and visible zero registered attempts | **PASS** |
| DB-B44 | partial counts retain denominator and descriptive majority without future routing | **PASS** |
| DB-B45 | unknown legacy work or empty/unrecognized plan cannot prove full or zero physical work | **PASS** |
| DB-B46 | manual agenda explicitly supersedes only future work, preserving credited/omitted history | **PASS** |
| DB-B47 | response, no_interest, invalid and restriction remain distinct operational causes | **PASS** |
| DB-B48 | legacy classifier trigger/direct call is contained only for adopted cohort | **PASS** |
| DB-B49 | no-change clock is terminal without events/version; future windows remain visible | **PASS** |
| DB-B50 | operational getter is READ ONLY, scoped and exposes evidence/review/clock context | **PASS** |
| DB-B51 | legacy, A-only and A+B cohorts preserve distinct writer authority | **PASS** |
| DB-B52 | every legacy result/answer/follow-up overload rejects before any side effect | **PASS** |
| DB-B53 | mixed supervisor scheduling/status/management cannot partially commit excluded domains | **PASS** |
| DB-B54 | restart/reconcile/future/Recall writers cannot reset adopted work | **PASS** |
| DB-B55 | mixed-cohort legacy refresh processes only legacy and preserves B for explicit clock | **PASS** |
| DB-B56 | service/direct DML/definer do not bypass B fields; excluded notes retain permissions | **PASS** |
| DB-B57 | insert/delete/cascade/truncate cannot erase or forge adopted CRM/protocol history | **PASS** |
| DB-B58 | new legacy leads retain initialization without implicit adoption | **PASS** |
| DB-B59 | excluded appointment/deposit/document fields alone do not create B effects | **PASS** |
| DB-B60 | reproduced webhook/sales mixed DML is rejected atomically without external functions | **PASS** |
| DB-B61 | two real sessions with same intent block then commit one logical result | **PASS** |
| DB-B62 | different simultaneous facts for same task produce one credit and stale loser | **PASS** |
| DB-B63 | contact versus Transfer serializes both orders without owner/history confusion | **PASS** |
| DB-B64 | contact/agenda and Acknowledge share aggregate CAS without changing epoch | **PASS** |
| DB-B65 | reschedule/cancel replacement versus factual completion preserves one consistent outcome | **PASS** |
| DB-B66 | clock versus late evidence preserves deadline observation and review requirement | **PASS** |
| DB-B67 | gate pause serializes with command and cannot broaden the DNC exception | **PASS** |
| DB-B68 | adoption fences old snapshots and direct legacy writers without inverse-lock bypass | **PASS** |
| DB-B69 | opt-out versus agenda and Transfer stays monotonic and scoped to linked identity | **PASS** |
| DB-B70 | concurrent supervisor decisions produce one credit/review revision | **PASS** |
| DB-B71 | failures after fact, credit and agenda roll back the complete command transaction | **PASS** |
| DB-B72 | backend termination before commit leaves zero partial effects and same intent retries | **PASS** |
| DB-B73 | commit with lost response is recovered exactly without duplicate timestamps or work | **PASS** |
| DB-B74 | real 55P03, 40001 and deadlock rollback never create a duplicate intention | **PASS** |
| DB-B75 | projection/helper failure cannot leak a live evaluating capability into session | **PASS** |
| DB-B76 | version exhaustion, missing references and uniqueness fail without mutilating history | **PASS** |
| DB-B77 | event replay reconstructs disposable projections without invoking commands or legacy effects | **PASS** |
| DB-B78 | compatible technical pause retains adoption/fences/epochs/history and seller channel denial | **PASS** |
| DB-B79 | Assignment regression boundary remains valid with B installed | **PASS** |
| DB-B80 | foundation history/closed purposes and private privileges remain protected after B | **PASS** |

Regresión final de una instantánea común: **296 casos hoja ejecutados**; 146 IDs anteriores + 80 B + 70 repeticiones en perfiles con B instalado. Los 70 son regresiones adicionales, no requisitos nuevos ni un aumento de los 146 únicos certificados.

| Suite | Casos hoja | Estado |
|---|---:|---|
| `assignment-boundary.integration.test.mjs` | 6 | **PASS** |
| `assignment-channel-guard.integration.test.mjs` | 23 | **PASS** |
| `assignment-channel-prerequisite.integration.test.mjs` | 16 | **PASS** |
| `assignment-runtime.integration.test.mjs` | 47 | **PASS** |
| `contact-assignment-regression.integration.test.mjs` | 47 | **PASS** |
| `contact-channel-regression.integration.test.mjs` | 23 | **PASS** |
| `contact-runtime.integration.test.mjs` | 80 | **PASS** |
| `foundation.integration.test.mjs` | 26 | **PASS** |
| `installation.integration.test.mjs` | 9 | **PASS** |
| `schema-baseline-b.integration.test.mjs` | 9 | **PASS** |
| `security.integration.test.mjs` | 10 | **PASS** |

En el perfil Contact→Assignment, A27 prueba la instalación A antes de incorporar B; los 46 casos restantes, incluidos los nueve de fundación integrados, se ejecutan después de B. Los 23 de canal se ejecutan con B instalado. B79 verifica además cohorte adoptada A+B.

Los ocho perfiles históricos mantienen su baseline y semántica originales. No se afirma que los tests de instalación negativa o el diagnóstico legacy se ejecutaran sobre B ya instalado. La comparación exacta contra el manifiesto previo encontró **cero casos faltantes**.

Después de la instantánea de regresión se reforzaron exclusivamente las assertions B29 (enmienda sin tarea tras sustituir el protocolo), B40 (DNC sólo customer) y B74 (40001 dentro del comando autenticado y retry de la intención stale). Se repitieron los 80 en `final-contact`, sobre los **mismos hashes de las tres migraciones y contratos**. El único archivo ejecutable distinto respecto de `final-db` es esa suite B; no se cambió código funcional, harness ni assertions certificadas entre ambas corridas.

| Suite pura | Casos | Estado |
|---|---:|---|
| foundation-pure | 23 | **PASS** |
| assignment-pure | 23 | **PASS** |
| legacy-regression | 131 | **PASS** |
| contact-next-action-pure | 37 | **PASS** |

Total puro: **214**, cero fallos/skips. Los 131 legacy son pruebas locales seleccionadas; no se presentan como PostgreSQL.

Evidencia individual completa: `evidence/final-db/summary.json` (296 filas), `evidence/final-contact/summary.json` (B01–80), sus database.json con TAP íntegro, `evidence/final-pure-regression.json` y manifests de VM. Los tests padre de TAP no se cuentan como casos.

No quedan pruebas BLOCKED dentro de B01–80 ni de las regresiones pedidas. No se certifican producción, un schema actual íntegro, JWT/PostgREST reales, frontend, Edge, cron, proveedores, egress, consumers desconocidos ni aislamiento de un futuro rollout.
