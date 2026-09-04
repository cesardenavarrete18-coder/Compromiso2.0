# Filter v1 — Integration Phase 2 boundary

## Estado

Integration layer **offline**, sin red, DB writes, Responses API, webhook, envío ni deploy. `FILTER_V1_ENABLED=false` por defecto. Los adapters reciben rows ya materializadas y el engine sólo produce estado, facts, handoff, response plan y trace observacional.

```text
CURRENT WHATSAPP FLOW
        ↓ (futura bifurcación detrás de FILTER_V1_ENABLED)
CRM-shaped read adapters
        ↓
semantic extraction (futura; output estructurado, no autoridad factual)
        ↓
Filter v1 integration engine
        ↓
response composer (futuro)
        ↓
send / suppress / handoff (runtime existente, futuro adapter)
```

## Shapes reutilizados

* `public.campaigns`: PLAN_FACTS; sólo `active=true`, modelo y campo no nulo. Sin fechas, primary, bank credit o selección de plan.
* `public.brands`, `public.models`, `public.model_versions`: identidad y aliases; `suggested_price` no es autoridad comercial.
* `public.lead_attributions`: acquisition/referral. Puede iniciar target inequívoco; nunca purchase mode.
* `public.leads`: contexto legacy y `metadata.filter_v1` para snapshot, sin reinterpretar priority/qualification.
* `public.whatsapp_conversation_controls`: ownership autoritativo; human implica suppression.
* `public.whatsapp_conversation_events`: potencial journal. La constraint actual sólo acepta `taken|released|message_sent`; un nuevo `filter_v1_state_updated` exigiría cambio posterior. No es necesario para el estado inicial y no se escribe en Phase 2.

## Persistencia inicial

`leads.metadata.filter_v1={schema_version,state_version,updated_at,state}` es suficiente para el primer rollout porque el lead ya ofrece JSONB y el snapshot incluye provenance. Optimistic concurrency debe implementarse posteriormente en una actualización condicional/RPC que compare `state_version`; nunca last-write-wins silencioso.

`MIGRATION_REQUIRED_FOR_INITIAL_FILTER_STATE=no`. Una migration sólo sería necesaria más adelante si se decide agregar un event type dedicado, constraints/indexes JSONB o garantías transaccionales que no puedan implementarse con el mecanismo de update existente. No se creó migration en esta fase.

## Próximos puntos exactos del runtime (no modificados)

1. `supabase/functions/whatsapp-webhook/index.ts`: detrás del flag, materializar lead/attribution/control/campaign/catalog y llamar al extractor/engine; conservar checks de takeover antes y después.
2. Reemplazar exclusivamente la rama de decisión/respuesta AI por adapter + extractor + engine + composer; no tocar routing TikTok ni Candidate histórico.
3. Implementar read queries server-side para campaigns activas y catálogo; jamás enviar todas las filas al LLM.
4. Persistir snapshot con compare-and-swap y, si se aprueba, trace resumido en metadata/evento.
5. Mapear handoff engine → control/routing existente de forma idempotente.
6. Composer debe enlazar claims con resolved facts y obedecer suppression antes de enviar.

## Seguridad

Decision trace contiene decisiones/resultados/source IDs, no chain-of-thought. Specs ausentes devuelven `requires_commercial_confirmation`. Tera se resuelve estructuralmente como SUV compacto. Customer correction prevalece sobre snapshot, CRM y referral. El mínimo por fact conserva campaign ID y facts cross-campaign no se presentan como una operación sintética.

## Fuera de alcance

Golden/Grader, semantic extractor, composer final, DB writes, webhook activation, migrations, producción, stock, scarcity, bank credit, `ai_primary_offer`, fechas obligatorias y selección financiera por LLM.

`PREEXISTING_LEGACY_FAILURES`: GSV1-029 y GSV1-080, incluidas sus repeticiones en suites Candidate históricas; no se corrigen en Phase 2.

## Phase 3 — semantic extraction boundary

A provider-agnostic, injected client now produces a proposal conforming to `filter-v1-semantic-extractor/1.0`. Validator and normalizer fail closed before `semanticExtractionToEngine`; the engine remains authority for target IDs, facts, qualification, priority, handoff and response planning. No real provider/runtime connection exists. Sequence is now: extraction contract/regression → online extractor evaluation → human-approved Golden Filter v1.
