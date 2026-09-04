# Filter v1 — plan de implementación futura

> Plan únicamente. Ninguna etapa se ejecuta en esta consolidación. Cada etapa usa feature flag, escritura dual o shadow y rollback independiente.

| # / ETAPA | DEPENDENCIES | FILES/TABLES LIKELY AFFECTED | TESTS | ROLLBACK | PRODUCTION IMPACT |
|---|---|---|---|---|---|
| 1 data/schema groundwork | contratos aprobados, inventario live | nuevas migrations; leads/state journal | schema, RLS, zero/null, concurrency | migrations aditivas + desactivar writes | ninguno hasta flag |
| 2 plan facts | 1 | proyección pura de campaigns activas | mínimos, null/inactive, provenance, no Frankenstein | retirar módulo | offline |
| 3 technical catalog | 1, manifest PDFs | brands/models, catalog versions/aliases/specs | Tera SUV!=pickup, aliases, checksum | volver versión publicada | ninguno runtime |
| 4 per-fact resolution | 2-3 | adapter futuro campaigns → input materializado | active, mínimo por campo, subscription unsupported | flag resolver off | shadow logs |
| 5 canonical accumulation | 1, adapters | webhook modules nuevos, state tables | corrections, roles, provenance, replay | stop projector; conservar journal | dual-write/shadow |
| 6 question policy | 5 | decision module futuro | one question, skip resolved, explicit unknown | flag policy off | shadow |
| 7 response composition/persuasion | 2,6 | composer/templates family | answer first, fact linkage, no scarcity/SLA | disable generated send | shadow |
| 8 handoff/contact priority | 5, calendar | controls, handoff event/calendar | Saturday, outside-hours, races, actions | old inbox routing | shadow then limited |
| 9 Golden Filter v1 | 1-8 contracts + real fixtures | **nuevo** dataset/manifest | 100 human review, hashes, contrasts | discard draft dataset | none |
| 10 Grader Filter v1 | 9 | **nuevo** grader/tests | dimensions, no double penalty, critical gates | retain historical v1.3 | none |
| 11 Candidate Filter v1 | 2-10 | runtime new modules behind flag | deterministic rules, adapters, end-to-end | flag off | none initially |
| 12 offline regression | 9-11 | test reports only | full Golden/adversarial/facts/calendar/takeover | fix/revert candidate | none |
| 13 CRM historical replay | privacy approval,12 | offline anonymized fixtures/report | point-in-time truth, false inference/handoff | delete derived artifacts | none |
| 14 shadow mode | 12-13, observability | webhook flag/log sinks | compare state/copy/handoff, no sends | flag off | compute/log only |
| 15 controlled rollout | accepted shadow, runbook | feature flags/monitoring | canary, critical metrics, human review | immediate flag rollback | progressively sends |

## Gates

Antes de Golden: fixtures reales anonimizados con payload/provenance/event_at, catálogo/facts/calendar contracts y separación de suites. Antes de integración: adapter de lectura de campaigns, catálogo materializado, mapping target model ID y contratos de persistencia auditados. Antes de producción: Golden+Grader aprobados, cero críticos, replay/shadow satisfactorios, data populated, RLS/observabilidad/on-call/rollback y aceptación operativa.

## Secuencia de PRs futura

Un PR por schema aditivo, loaders/admin, resolver, projector, policy, composer, handoff, datasets y rollout plumbing. Nunca mezclar migration irreversible con activación. Seller v2, Golden/Grader/Candidate históricos quedan intactos.

## Phase 1 ejecutada offline

El primer slice implementa contratos/estado, PLAN_FACTS, intents, response plan, prioridad y handoff sin producción. No crea Golden. `active` reemplaza ventanas obligatorias; no existe primary; bank credit/fact platform avanzada son `deferred_to_seller_v2`. Próxima fase integra un adapter read-only sólo después de revisión del core y datos reales.

## Semantic extraction gate

Before Golden, evaluate the versioned extractor contract online in an isolated harness: evidence validity, abstention, query/intent separation and provider structured-output reliability. Only validated extraction reaches the engine. Order: offline semantic contract → online extractor evaluation → Golden Filter v1 → Grader → Candidate/runtime rollout.
