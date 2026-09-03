# Filter v1 — auditoría de fuentes comerciales

## Hallazgo ejecutivo

El snapshot de evaluación no contiene una fuente comercial estructurada completa. `runtime_input.persisted_data` usa rótulos como `current_authorized`, `expired`, `wrong_model` o `unavailable`; éstos describen el escenario, pero no materializan el fact. Candidate v2.3 posee un control que exige metadata `authorized=true` y `status=current` sobre resultados RAG, pero el snapshot no aporta un contrato uniforme de producto, payload, vigencia y autorización. Por ello ningún monto o claim variable puede declararse seguro sólo a partir del Golden.

Training Examples, `expected_reply`, `direct_answer` y `commercial_fact_context` generados por LLM no son fuentes.

## Inventario

| FACT TYPE | CURRENT SOURCE | STRUCTURED? | CURRENT/AUTHORIZED METADATA? | TEMPORAL/VERSIONED? | SAFE FOR FILTER? | MISSING CONTRACT? |
|---|---|---:|---:|---:|---:|---|
| taxonomía/body type | PDFs/assets y guard operativo v2.3; regla contractual Tera | parcial | no uniforme | catálogo sin versión explícita | sólo Tera con regla canónica; resto no | catálogo canónico versionado, IDs y aliases |
| versión/variante | PDFs de fichas y resultados RAG esperados | parcial | RAG la exige, snapshot no la materializa | no uniforme | no para claims variables | producto/variante ID, source, vigencia, status |
| motor/equipamiento/capacidad | fichas PDF por modelo + RAG | documental | no visible por claim en runtime | fecha de ficha no normalizada | no de forma general | extracción estructurada y cita de sección |
| precio/lista | campañas/ofertas en base productiva inferidas por migrations; rótulos del eval | parcial fuera del snapshot | ausente en caso | modelos de DB tienen timestamps, no envelope del eval | no | amount, currency, price_type, product, validity, authorization |
| precio de contado | no hay campo inequívoco materializado en snapshot | no | no | no | no | `cash_price` separado de list/final price |
| cuota | campañas/planes y anchors persistidos simbólicos | parcial | `authorized_installment_anchor` sin payload/source | no en runtime del caso | no | amount/range, periodicidad, cantidad, plan, vigencia |
| anticipo | textos históricos y posibles planes/campañas | parcial | no materializada | no | no | tipo (mínimo/sugerido), amount, moneda, plan, vigencia |
| valor final/costo total | no se identifica fuente contractual única | no | no | no | no | definición contable y componentes incluidos |
| campaña/plan vigente | tablas/migrations comerciales y retrieval esperado | parcial | status simbólico en Golden | no materializada | no | campaign/plan ID, status, valid_from/to, aprobador |
| stock/unidades | `stock=unknown` en runtime; no snapshot de inventario | no | no | no | no | ubicación, cantidad, variante, observed_at, TTL |
| disponibilidad/entrega | derivación humana en Matrix; no fuente materializada | no | no | no | no | disponibilidad vs fecha prometida, source y SLA/TTL |
| descuento | campañas/ofertas; sin evidence envelope | parcial | no | no materializada | no | amount/percent, elegibilidad, vigencia, acumulabilidad |
| bonificación | status simbólico `unavailable/expired` | no | no | no | no | payload, condiciones, vigencia, autorización |
| promoción | menciones históricas en conversación/expected reply | no autorizada | no | no | no | promo ID, claim permitido, producto, vigencia |
| condiciones comerciales | documentos/planes no incluidos como registro estructurado en caso | parcial | no uniforme | no uniforme | no | términos, exclusiones, jurisdicción, versionado |
| valuación de usado | `authorized_valuation_current/expired` simbólico | parcial | sin valor/source ID | status temporal sin fechas | no | valuation ID, amount, currency, valuador, valid_to |

## Ubicación observada

* `evals/grupo-sur-ai/compiled/golden-v1.0.0.json`: runtime congelado; facts comerciales se reducen a banderas simbólicas y no exponen payload autorizante.
* `evals/grupo-sur-ai/snapshot/runtime_snapshot.json`: transcripciones y `expected_reply` históricos contienen montos/promesas; son evidencia de comportamiento, no autoridad.
* `evals/grupo-sur-ai/src/candidate-v2.3/candidate-runtime.mjs`: recibe resultados RAG y controla metadata `authorized/status`, luego neutraliza un `authorized` propuesto por LLM sin resultados autorizados.
* `evals/grupo-sur-ai/src/candidate-v2.3/extraction-schema.mjs`: `commercial_fact_context` sigue siendo una interpretación generativa y no contiene el payload comercial completo.
* `evals/grupo-sur-ai/src/candidate-v2.3/operative-catalog.mjs`: taxonomía operativa mínima, útil para guards pero no catálogo comercial vigente completo.
* `supabase/migrations/20260813165424_multiple_commercial_offers.sql`, `20260817203000_rename_campaign_list_price_to_final_price.sql` y `20260817204000_enforce_campaign_final_price_on_quotes.sql`: evidencian estructura productiva para ofertas/campañas/precios; una migration define esquema, no acredita el estado vigente de una fila.
* `assets/*.pdf`: fichas técnicas por modelo; son documentos candidatos, pero sin manifest de versión/vigencia/autorización por claim.

## Contrato mínimo de fact autorizado

```json
{
  "fact_id": "immutable-id",
  "fact_type": "cash_price|installment|stock|promotion|spec",
  "subject": {"brand_id":"...","model_id":"...","variant_id":"..."},
  "value": {},
  "currency_or_unit": "ARS",
  "source_id": "...",
  "authorized": true,
  "status": "current",
  "valid_from": "RFC3339",
  "valid_to": "RFC3339|null",
  "observed_at": "RFC3339",
  "allowed_claim": "texto o template aprobado",
  "conditions": [],
  "supersedes": "fact_id|null"
}
```

Además: TTL por tipo, resolución de conflictos, timezone Argentina, política de revocación, auditoría del aprobador y vínculo claim→fact. Precio contado debe ser un tipo propio. Stock necesita localización y observación fresca; una campaña vigente no prueba stock ni fecha de entrega.

## Política segura

Responder el claim sólo si existe fact aplicable, current y authorized. Si falta, decir que no se dispone de confirmación vigente y ofrecer verificación humana; no repetir el monto del cliente como oficial. Puede agregarse un único hook únicamente con otro fact vigente aplicable. La ausencia de fact no cambia `purchase_mode` ni debe forzar `has_trade_in`.
