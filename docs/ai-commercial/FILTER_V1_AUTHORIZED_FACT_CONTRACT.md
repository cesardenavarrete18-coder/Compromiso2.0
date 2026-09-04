# Filter v1 — contrato simplificado de facts autorizados

## Decisión v1

Filter v1 no requiere una plataforma genérica de facts. Usa dos proyecciones determinísticas, offline-testables:

1. **PLAN_FACTS**, desde filas materializadas de `public.campaigns` con `active=true`.
2. **TECHNICAL_FACTS**, desde el catálogo técnico canónico publicado.

`bank_credit_offers`, `bank_credit_offer_versions`, TNA, CFTEA, coeficientes, comparación crédito/plan y selección de producto se marcan `deferred_to_seller_v2`. `valid_from`/`valid_to` no determinan usabilidad v1: Administración expresa vigencia operativa mediante `campaign.active`. No se consulta stock físico.

## Plan facts

| fact type | columna | resolución |
|---|---|---|
| `model_reference_value` | `final_price` | mínimo no nulo por modelo entre campañas activas |
| `installment_offer` | `installment_amount` | mínimo no nulo; comunicar “cuotas desde”, sin inferir financed |
| `delivery_advance` | `advance_amount` | mínimo no nulo; comunicar “anticipos desde” |
| `bonus` | `bonus` | contexto general de una ficha activa, sin inventar monto |
| `benefits` | `benefits` | hook general opcional de una ficha activa |
| `subscription_amount` | — | `requires_commercial_confirmation`; jamás usar `advance_amount` |

Envelope mínimo de una resolución:

```json
{"fact_type":"installment_offer","status":"resolved","value":450000,"source_campaign_id":"uuid","source_field":"installment_amount","provenance":{"source":"public.campaigns","source_campaign_id":"uuid","field":"installment_amount","value":450000}}
```

El input es un snapshot de campaigns ya materializado; el core offline no consulta DB. Sólo `active === true`, mismo `model_id` y payload no nulo participan. Un empate usa ID como desempate estable, no preferencia financiera. Ausencia devuelve `not_materialized`.

## No Frankenstein

Cada mínimo conserva `source_campaign_id`. Valores resueltos desde campañas diferentes pueden mencionarse únicamente como mínimos de **distintas alternativas**. No pueden presentarse como una cuota+anticipo pertenecientes a una misma operación. Sólo facts con un mismo campaign ID soportan la descripción de una alternativa conjunta.

## Technical facts

Tipos: `brand`, `model`, `variant`, `body_type`, `engine`, `technical_spec`. Cada uno conserva versión/ID de catálogo y source. Campaigns no son autoridad de specs salvo un campo explícitamente normalizado y vinculado a variante. Tera se resuelve como `compact_suv`, nunca pickup.

## Persuasión y ausencia

Política: respuesta factual primero, framing comercial siempre permitido en una respuesta normal, hook promocional general opcional y una pregunta de filtro. Bonus/benefits no habilitan escasez, cupos, stock, vencimientos ni urgencia inventada. Sin fact, aclarar que el detalle requiere confirmación comercial y continuar o derivar.

## Diferido

El envelope avanzado previo —authorization workflow genérico, supersession, revocation, ventanas temporales por fact y claims financieros complejos— se conserva conceptualmente como `deferred_to_seller_v2`; no bloquea ni forma parte del core Filter v1.
