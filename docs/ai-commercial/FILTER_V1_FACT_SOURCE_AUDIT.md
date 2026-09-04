# Filter v1 — auditoría de fuentes comerciales reales

## Alcance

Auditoría estática del repo en base `e982847`; no hubo acceso a producción/Supabase remoto. **SCHEMA EXISTS** significa que código/migration define el dato; **LIVE VALUE WOULD EXIST** permanece `unknown` en todos los casos. Seeds prueban intención histórica, no vigencia actual. Golden, expected, grader requirements, training examples y labels diagnósticos no son fuentes runtime.

| DATO | SCHEMA EXISTS / UBICACIÓN | LIVE VALUE WOULD EXIST | UTILIDAD FILTER | GAP CONTRACTUAL |
|---|---|---|---|---|
| brand/model | sí: `brands`, `models` en `supabase/schema.sql`; seeds y migrations de modelos | unknown | identidad parcial | aliases, catálogo versionado, provenance |
| variant | parcial: `campaigns.version_name`; `vehicle_versions` y links de credit offers en sales admin | unknown | subject comercial parcial | ID canónico y vínculo catálogo |
| campaign/plan | sí: `campaigns`, múltiples por modelo, plan_name, active, dates, audit log | unknown | base fuerte de oferta | authorization, primary, mapping Meta exacto |
| final_price | sí: rename/list enforcement en `20260817203000_*` y `20260817204000_*`; admin lo edita | unknown | `final_value` sólo tras definir semántica | moneda/claim scope/envelope |
| cash_price | no inequívoco; final_price no prueba contado | unknown | ninguno seguro | tipo propio y definición |
| cuota comercial | sí: campaigns installment amount/count/from; bank offers; quote snapshots | unknown | `installment_offer` potencial | periodicidad, vigencia, subject, autorización |
| anticipo comercial | sí: campaigns.advance_amount, modelos.advance_text histórico | unknown | `commercial_down_payment` potencial | separar del anticipo del cliente |
| anticipo cliente | no campo canónico Filter; puede aparecer en transcript/summary | unknown | ninguno estructurado | canonical state + provenance |
| promoción | parcial: campaign benefits/bonus, textos | unknown | hook sólo si autorizado | promo ID, scope, vigencia, linkage |
| bonificación | sí como texto `campaigns.bonus`; defaults genéricos | unknown | no seguro por defecto | payload/claim/approval; default no evidencia |
| descuento | no envelope inequívoco observado | unknown | ninguno | amount/percent/conditions |
| technical specs | PDFs `assets/*.pdf`, knowledge documents/Vector Store; operative catalog mínimo | unknown | evidencia secundaria | catálogo estructurado/versionado |
| commercially offered | aproximable con model/campaign active | unknown | fact requerido | definir semántica; nunca stock |
| valuación usado | `vehicle_appraisals` con valores/status/source/timestamps | unknown | contexto humano; no pricing de 0 km | envelope si se afirma al cliente |
| attribution Meta | `lead_attributions` + raw referral metadata | unknown | acquisition y target inicial | mapping ID a oferta/modelo confiable |
| stock/entrega | slots/timer/textos históricos no son inventario | unknown | **fuera de dependencia Filter** | no diseñar stock; derivar confirmación |

## Evidencia de runtime

`supabase/functions/whatsapp-webhook/index.ts` arma contexto de referral, lee settings/vector store, llama al modelo y hoy produce qualification/priority/model/summary. Conserva raw referral y comprueba takeover antes y después de AI. Es reutilizable como ingress y suppression, pero no implementa el estado ni fact envelope Filter. `ai-knowledge-ingest` y `ai_knowledge_documents` administran PDF/file IDs; retrieval variable no es contrato estructural.

`campaigns` y Administración son el mejor punto de reuso comercial: final price, advance, installment, version y active. Sin filas remotas no se puede afirmar qué campaigns están activas; Filter v1 no exige `valid_from/to`. `bank_credit_offers`, plans, quotes, applications/Datero y sale flows pertenecen al asesor/Seller v2; Filter no selecciona producto financiero.

## Contrato faltante y política

Materializar la proyección simplificada descrita en `FILTER_V1_AUTHORIZED_FACT_CONTRACT.md`: tipo, payload, source campaign/field y provenance. Resolver el mínimo por fact entre campaigns activas; no existe primary y combinaciones cross-campaign fallan cerradas. Falta de fact produce explicación breve + continuación/handoff, nunca invención.

No se propone `physical_stock`. `commercially_offered` no promete existencia, entrega inmediata ni cantidad. Eliminar como persuasión slots, “últimas unidades”, timers, cantidades y vencimientos no autorizados; usar framing general y como máximo un hook promocional factual.
