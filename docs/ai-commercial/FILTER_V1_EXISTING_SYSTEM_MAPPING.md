# Filter v1 — mapeo del sistema existente

## Método y límites

Inspección estática del checkout `e982847`; no se consultó Supabase remoto. Por tanto **schema exists** no implica **live value exists**. Candidate/Golden/Grader históricos sólo son evidencia, no runtime truth ni objetivos a modificar.

| CONCEPT | FILTER REQUIREMENT | CURRENT IMPLEMENTATION | CURRENT SOURCE/PATH | REUSABLE? | GAP | PROPOSED CHANGE | DB CHANGE NEEDED? | RUNTIME CHANGE NEEDED? | RISK |
|---|---|---|---|---|---|---|---:|---:|---|
| CRM lead state | estado canónico por campo | lead plano con model, qualification, priority, summary | `20260814120000_supervisor_lead_routing.sql`; `commercial_operations_foundation.sql`; `vendedores/crm.js` | parcial | sin purchase/trade/contact provenance | estado JSON/versionado + journal | sí | sí | migración/replay |
| Meta referral | target inicial + acquisition | raw referral en metadata y `lead_attributions`; parser de headline/body | `whatsapp-webhook/index.ts`; `commercial_operations_foundation.sql` | sí, adapter | modelo/oferta no vinculados por ID confiable | normalizar referral y mapping campaña | probable | sí | texto ambiguo |
| WhatsApp ingress | eventos ordenados/idempotentes | persiste mensajes, dedup y analiza | `whatsapp-webhook/index.ts`; `20260820173402_*` | sí | decisión monolítica Seller-like | insertar projector/policy Filter detrás de flag | no inicial | sí | concurrencia |
| Edge AI runtime | interpretación + RAG | prompt/schema simple, Responses/file_search, fuerza qualification | `whatsapp-webhook/index.ts` | transporte/historia | contradice profile derivado; acopla respuesta | runtime Filter nuevo posterior | no | sí | regresión |
| Campaigns/offers | selección exacta/primary | múltiples campaigns con cuota, anticipo, final_price, active, bonus/benefits | schema + `20260813165424_*`, `20260817203000_*`; admin | alto | falta proyección mínima con provenance | resolver mínimos por fact sobre active | no para core offline | sí después | semántica advance |
| Credit/savings products | no recomendación | bank credit offers/versions, plans, quotes | `20260815180000_sales_administration_and_quotes.sql`; admin/sales | Seller v2 | riesgo de elección LLM | excluir del selector Filter | no | sí | contaminación |
| Models/variants | IDs y catálogo | brands/models; version text y vehicle_versions | schema; sales administration migrations | parcial | aliases/body/spec/version publication | catálogo técnico normalizado | sí | sí | duplicados |
| Datero | preservar fuera de Filter | commercial applications/provisional sales | schema; `20260818232855_*`; vendedores | Seller v2 | ninguno core | sólo handoff, no ejecución | no | no | scope creep |
| Commercial facts | envelope autorizado | columnas comerciales + snapshots | campaigns, quotes, appraisals | parcial | no envelope/claim scope/revocation | facts/view auditada | sí | sí | claims obsoletos |
| PDFs/assets | evidencia técnica | fichas locales por modelo | `assets/*.pdf` | como source | sin manifest/version claim | ingest draft + aprobación catálogo | sí | sí | PDF viejo |
| Vector Store | explicación documental | `ai_knowledge_documents`, file IDs, vector_store_id/file_search | `20260814190000_ai_knowledge_center.sql`; ingest; webhook | secundario | retrieval no determinista | nunca autoridad estructural | no | sí | grounding |
| Trade-in | intención + 5 campos | vehicle_appraisals posee detalle/valuación | `20260820173402_*`; CRM | parcial | intención y statuses separados ausentes | vincular canonical role/status | probable | sí | confundir posesión |
| Handoff/takeover | immediate, suppression | mode ai/human, owner, events; doble check durante AI | `20260820224500_whatsapp_human_inbox.sql`; webhook | alto | estado Filter/acuse uniforme | evento idempotente + payload parcial | probable | sí | carreras |
| Seller assignment | routing/ownership | assigned seller, cuotas, supervisor | routing migrations; supervisor JS | sí | handoff accepted explícito | adaptar sin redefinir routing | probable | sí | lead sin dueño |
| Business hours | sábado/configurable | timezone y función business_date, follow-up fijo | `commercial_operations_foundation.sql`; `follow_up_process_reliability.sql` | lógica parcial | no calendario administrable | calendar tables/service | sí | sí | feriados |
| Follow-up reminders | lead incompleto visible | reminder service/scheduling | `whatsapp-follow-up-reminders`; `20260821123627_*` | operational/Seller | fuera del core | suite separada, respeta takeover | no | quizá | mensajes indebidos |
| UI admin | configurar facts/primary/catalog | campaigns y AI knowledge forms | `vendedores/admin/admin.js` | parcial | falta publish/primary/provenance | pantallas posteriores | sí | sí | permisos |

## Reuso prioritario

IDs brands/models; estructura de campaigns y audit log; lead_attributions/raw referral; mensajes/deduplicación; controles human takeover; seller assignment/bandejas; knowledge documents como evidencia; vehicle appraisals; timezone y business_date como punto de partida. No reutilizar qualification forzada, `priority` como probabilidad, slots/timer como scarcity ni expected históricos.

## Gaps de alto nivel

DB: estado/revisiones y provenance; catálogo/versiones/aliases/specs; proyección PLAN_FACTS; mapping attribution opcional; calendario; handoff ack. Runtime: projector determinista, resolver facts/oferta, parsing temporal, policy de una pregunta, response composer y suppression/observabilidad. Toda propuesta queda pendiente de inspección de datos reales antes de migrations.

## Simplificación aprobada para Phase 1

`public.campaigns` es la única fuente de valores comerciales Filter v1: `active=true` basta; fechas no son requisito. Resolver mínimos independientes de final_price/installment_amount/advance_amount preservando campaign ID. Subscription no existe y no reutiliza advance. No se añade primary ni fact table genérica. Bank credit y el envelope financiero avanzado quedan `deferred_to_seller_v2`; physical stock queda fuera de alcance. El código nuevo vive sólo bajo `evals/grupo-sur-ai/src/filter-v1` y recibe snapshots como argumentos, sin DB/webhook.
