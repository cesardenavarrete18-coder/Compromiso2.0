# Filter v1 — handoff, contacto y calendario

## Calendario

Configuración versionada por operación: timezone `America/Argentina/Buenos_Aires`, intervalos por día, sábado operativo, feriados/cierres excepcionales y vigencia. No hardcodear “48 horas”. Reusar `private.business_date` sólo tras corregir/auditar su semántica: hoy migrations de follow-up contienen horario argentino y lógica de días hábiles, pero el calendario no aparece como entidad administrable completa.

## Preferencia y prioridad

`contact_preference={timing:now|same_day|next_business_day|future|unknown,literal,callback_at,callback_window,asked_once}`. Resolver timestamp sólo con event_at + timezone + calendario + expresión inequívoca; de lo contrario conservar literal sin inventar hora. Preguntar una vez.

`hot`: ahora/cuanto antes. `warm`: mismo día o próximo día operativo. `cold`: posterior o desconocido. Mide timing, no calidad. Viernes “mañana” es warm si sábado opera; lunes “el sábado” es cold.

## Acciones vs contacto

“Quiero visitar el sábado”: requested_action=visit, requested_action_at=sábado si resoluble, immediate handoff/hot **ahora** para coordinar. “Quiero que me contacten el sábado”: callback futuro y prioridad según distancia; no implica visita. Seña, visita, documentación, transferencia, “quiero avanzar” o humano detienen preguntas y generan handoff inmediato aun con perfil incompleto.

## Ownership y entrega

Reusar `whatsapp_conversation_controls.mode=human`, owner y eventos de toma/liberación; takeover gana incluso si el análisis AI está en vuelo. `human_owned => no_ai_response`. Reusar seller assignment/routing y bandeja, pero agregar acuse idempotente de handoff/accepted y payload canónico parcial. El handoff al sistema se crea fuera de horario igual; no se promete respuesta inmediata.

Copys por familia, no caso: normal `ANSWER + COMMERCIAL FRAMING + ONE QUESTION`; handoff `ACKNOWLEDGE + HANDOFF MESSAGE + STOP`; fuera de horario `ACKNOWLEDGE + el equipo comercial continuará cuando esté disponible + STOP`. Nunca SLA no configurado.

## Máquina de estados y riesgos

`not_ready -> ready|immediate`; `ready -> human_owned|scheduled`; `immediate -> human_owned|closed_or_routed`; cualquier estado pasa a human_owned por takeover. Idempotency key lead/event/action evita duplicados. Riesgos: calendario desactualizado, carreras webhook/takeover, callback ambiguo, asignación sin aceptación. Métricas: handoff creado/aceptado, latencia (observacional, no promesa), AI suprimida y errores de parsing.
