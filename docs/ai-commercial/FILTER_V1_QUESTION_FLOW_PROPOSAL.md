# Filter v1 — propuesta de flujo de preguntas

## Objetivo

Obtener el próximo dato comercial faltante con el mínimo de fricción. El flujo es una política sobre estado canónico, no un cuestionario fijo.

## Regla de turno

1. Ingerir todos los datos espontáneos y resolver roles/provenance.
2. Si hay DNC, takeover, número equivocado o circuito no comercial, aplicar la regla dura y detener colección.
3. Si hay pregunta concreta, responderla primero sólo con facts autorizados.
4. Opcionalmente agregar un hook autorizado (máximo uno).
5. Hacer una sola pregunta lógica faltante o coordinar contacto.

Una pregunta puede cubrir un bloque natural (“¿Qué versión y año es?”), pero no encadenar alternativas y cuatro campos. Nunca repetir un campo `known`; un campo `conflicting` se aclara en vez de volver a preguntarse como desconocido.

## Prioridad de colección

1. `model_interest`: “¿Qué modelo estás buscando?”
2. `purchase_mode`: “¿Pensás pagarlo al contado o financiarlo?”
3. si financed, `cash_available`: “¿Con cuánto contás para el anticipo?”
4. si financed, `target_installment`: “¿Qué cuota mensual podrías sostener cómodamente?”
5. `has_trade_in`: “¿Tenés algún usado que quieras entregar como parte de pago?”
6. si yes: marca/modelo → versión/año → km, aprovechando todo lo ya dicho.
7. al completar perfil: “¿Cuándo preferís que te contacte un asesor?”

El orden se salta o reordena según información espontánea. Un pedido explícito de contacto inmediato dispara entrega con el resumen disponible: no retener al cliente para completar el formulario.

## Trade-in y roles

“Tengo una Amarok” conserva `has_trade_in=unknown` y rol `owned_only`; preguntar una vez “¿La querés entregar como parte de pago para esta compra?”. “Tengo una Amarok para entregar” fija yes. “Me la quedo” fija no. El target previo no cambia por mencionar el usado. Comparaciones (“¿la Tera es como la Toro?”) tienen rol `comparison`, no target nuevo.

## Consultas concretas

Plantilla: **ANSWER + optional authorized hook + one question/handoff**.

* “¿Cuánto vale de contado?” → responder precio vigente si existe; mantener mode unknown; preguntar modo sólo después.
* “¿Qué cuota tiene?” → responder oferta autorizada; no inferir financed; preguntar cómo piensa comprar.
* “¿La Tera es pick-up?” → “No, la Volkswagen Tera es un SUV compacto”; continuar con un dato faltante.
* Sin fact vigente → declarar que requiere confirmación, ofrecer asesor y no improvisar cifra.

## Contact preference

Preservar siempre el literal. `now`: inmediato. `same_day`: ventana del mismo día. `near_term`: hasta 48 horas. `scheduled`: fecha/hora concreta posterior. `future`: expresión posterior no completamente agendable. `unknown`: sin preferencia. Resolver `callback_at` sólo con `event_at`, timezone y expresión inequívoca; “después de las 18” sin fecha puede conservarse sin inventar día.

## Antipatrones

* “¿Tenés un usado?”: pregunta posesión, no intención operativa.
* Repetir modelo/anticipo porque no está en el último mensaje aunque sí en estado.
* Inferir cash desde una consulta de precio.
* Preguntar subtipo credit/plan.
* Pedir contacto antes de contestar una consulta disponible.
* Agregar dos hooks, falsa escasez o vencimiento no probado.
* Seguir interrogando luego de DNC o durante takeover.

## Estado de salida

El perfil completo produce `qualified` y `handoff_status=ready`, independientemente del timing. Contacto now eleva a immediate; timing futuro puede programar; timing desconocido mantiene prioridad cold sin degradar la calidad del lead. Si faltan campos, `follow_up` y la siguiente pregunta sale de la primera dependencia aplicable.
