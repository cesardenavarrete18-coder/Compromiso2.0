# Filter v1 — diseño del estado canónico

## Alcance y autoridad

Contrato técnico de diseño, no implementación. Separa **estado del cliente**, **facts autorizados** y **política conversacional**. Sólo son verdad runtime el mensaje actual, historia canónica materializada, referral Meta, CRM estructurado, catálogo técnico y facts autorizados. Golden, grader, títulos, `expected` y labels diagnósticos nunca ingresan al runtime.

## Envelope y tipos

Todo campo mutable usa `{value, status, provenance}`. `status = known | missing | explicitly_unknown | conflicting`; `known` exige payload no nulo (cero es válido) y provenance. `provenance` contiene `source = customer_message | canonical_history | meta_referral | crm_structured | technical_catalog | authorized_fact`, `source_id`, `event_at`, `message_id`, `evidence_span` y opcional `inferred=true` con regla determinística. Ausencia de payload/provenance para `known` es error de contrato, no conocimiento.

```json
{
  "schema_version":"filter-state/1.0",
  "lead_id":"uuid", "revision":7, "event_at":"2026-09-04T13:00:00Z",
  "timezone":"America/Argentina/Buenos_Aires",
  "target":{"brand":{"value":"Fiat","status":"known","provenance":{}},"model":{"value":null,"status":"conflicting","provenance":{}},"candidates":[{"brand":"Fiat","model":"Toro"},{"brand":"Fiat","model":"Fastback"}]},
  "acquisition_context":{"channel":"meta_ads","campaign_id":"uuid","advertised_model":"Toro","advertised_modality":"financing"},
  "purchase_mode":{"value":"unknown","status":"missing","provenance":null,"customer_literal":null},
  "down_payment_amount":{"value":null,"currency":"ARS","status":"missing","provenance":null},
  "monthly_installment_capacity":{"value":null,"currency":"ARS","period":"month","status":"missing","provenance":null},
  "has_trade_in":{"value":"unknown","status":"missing","provenance":null},
  "vehicles":[], "customer_name":{}, "customer_location":{},
  "commercial_profile":{}, "contact":{}, "requested_action":{},
  "qualification_status":"follow_up", "handoff_status":"not_ready", "next_action":"clarify_target"
}
```

Enums: `purchase_mode=cash|financed|unknown`; `has_trade_in=yes|no|unknown`; vehicle `role=target|candidate|comparison|owned_only|trade_in`; qualification `qualified|follow_up|unqualified`; handoff `not_ready|ready|immediate|scheduled|human_owned|closed_or_routed`; next action incluye `ask_*|answer_then_ask|handoff|no_ai_response|close_or_route_noncommercial`.

## Precedencia, correcciones y concurrencia

1. Corrección explícita actual del cliente.
2. Declaración explícita anterior no retractada en historia canónica.
3. CRM estructurado confirmado por humano (datos administrativos, no preferencias contra una corrección nueva).
4. Meta referral inequívoco sólo para target inicial y acquisition context.
5. Inferencia determinística documentada.

La recencia sola no basta: comparación y vehículo propio no corrigen target. Se conserva un journal append-only de eventos y se proyecta una revisión con optimistic locking; conflictos concurrentes no se pisan. Una corrección agrega evento `supersedes`, conserva auditoría y recalcula derivados. La modalidad anunciada nunca modifica `purchase_mode`.

## Vehículos y candidatos

Cada vehículo tiene identidad de catálogo cuando se resuelve, campos brand/model/variant/year/km con status y provenance, y rol explícito. `owned_only` no materializa trade-in; sólo intención de entrega lo cambia. Dos candidatos mantienen `model.status=conflicting`; misma marca permite conservar brand, marcas distintas requieren aclarar cuál atender primero. Comparaciones jamás sustituyen target.

## Perfil comercial derivado

Para `financed`: model, purchase mode, anticipo, capacidad mensual y trade-in; para `cash`: model, purchase mode y trade-in. Si trade-in=yes se incluyen brand/model/variant/year/km. Cada componente reporta `known|explicitly_unknown|missing|conflicting`, peso 1, y resultado. `component_score = componentes resueltos / aplicables`; `complete=true` sólo cuando todos son `known` o `explicitly_unknown`. El score también reporta `known_count` y `explicitly_unknown_count`, evitando igualar información efectiva con desconocimiento justificado. Contacto, nombre y ubicación no participan.

## Contacto, acción y salida

`contact.preference={timing:now|same_day|next_business_day|future|unknown,literal,callback_at,callback_window,asked_once}`. Timestamp sólo se resuelve con `event_at`, timezone, calendario y expresión inequívoca. `contact_priority=hot|warm|cold` mide distancia temporal, nunca probabilidad. `requested_action={type:none|human_request|deposit|visit|documentation|purchase_progress,status,literal,requested_action_at}` es independiente del timing de contacto.

Pedido humano o acción fuerte produce inmediatamente `handoff_status=immediate`, `contact_priority=hot`, `next_action=handoff`, aun con `qualification_status=follow_up`; se detienen preguntas. `human_owned` siempre produce `no_ai_response`. Perfil completo sin preferencia produce qualified/cold/ready.

## Compatibilidad

Adapters de lectura/escritura, no duplicación de verdad: `cash_available -> down_payment_amount`, `target_installment -> monthly_installment_capacity`, `commercial_temperature -> contact_priority`, `model_interest -> target.model.value`. Valores legacy fuera de dominio se rechazan o normalizan con evento auditable; `financing_subtype` queda sólo como literal contextual.

## Ejemplos completos

**Meta financiero, saludo:** target Tera conocido desde referral; acquisition financing; purchase mode missing/unknown; se pregunta modalidad. **Corrección:** “Vi Tera pero quiero Amarok” supersede target con provenance del mensaje. **Posee Amarok:** vehículo owned_only, trade-in missing. **Financiado completo con versión desconocida:** versión `explicitly_unknown`, resto conocido, score resuelto 1.0 pero cuenta de known inferior; qualified. **Visita sábado:** requested action visit con fecha si resoluble, immediate/hot ahora; la visita futura no se copia a callback.

## Simplificación Implementation Phase 1

`down_payment_amount` es capacidad declarada por el cliente; `campaigns.advance_amount` es `delivery_advance`, condición comercial para retiro. Nunca se copian entre sí. Query intent se conserva separado de purchase mode: consultar cuota o valor contado no cambia modalidad. Plan facts se proyectan de campañas activas y technical facts del catálogo; la arquitectura avanzada de facts queda `deferred_to_seller_v2`.
