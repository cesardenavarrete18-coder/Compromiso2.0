# Filter v1 — resolución comercial simplificada

## No se selecciona una oferta

Filter v1 no elige producto financiero ni necesita `ai_primary_offer`. Resuelve **cada fact consultado** sobre `public.campaigns` y comunica el resultado como valor “desde”. Administración controla usabilidad exclusivamente con `active`: `true` utilizable, `false` ignorada. `valid_from` y `valid_to` pueden existir en schema, pero no son precondición v1.

## Algoritmo por fact

Para `target_model_id`, filtrar `campaign.active === true`, mismo `model_id` y columna no nula. Retornar el mínimo y el campaign ID que lo produjo:

* valor del modelo → `MIN(final_price)` → `model_reference_value`;
* cuota → `MIN(installment_amount)` → `installment_offer`;
* anticipo de retiro → `MIN(advance_amount)` → `delivery_advance`.

Una consulta de precio contado no establece purchase mode cash y una de cuota no establece financed. El wording dice “valores/cuotas/anticipos desde” y no implica oferta única.

## Suscripción no es anticipo

“Entrar/suscribirme/arrancar el plan” pide `subscription_amount`, hoy no materializado. Nunca sustituir `campaigns.advance_amount`, que representa condición comercial de retiro. “¿Cuánto tengo que poner?” sin contexto produce `ambiguous_initial_amount` y `clarify_initial_amount_intent`.

## Integridad multi-fact

Cada resultado incluye `source_campaign_id`, columna y valor. Mismos IDs permiten describir una alternativa real. IDs distintos activan `cross_campaign_combination=true` y `DO_NOT_PRESENT_AS_SINGLE_OPERATION`; se explican como mínimos correspondientes a distintos planes. Así Plan A con menor anticipo y Plan B con menor cuota nunca se sintetizan.

## Reuso y fuera de alcance

Se reutilizan campaigns, modelo, montos, bonus, benefits, active y audit log. `sort_order`, precio más bajo y el primer registro no seleccionan un plan. `slots`, timers y stock no participan. Bank credit, TNA/CFTEA, coeficientes, comparación/recomendación financiera, `ai_primary_offer`, ventanas obligatorias y fact platform genérica quedan `deferred_to_seller_v2`.
