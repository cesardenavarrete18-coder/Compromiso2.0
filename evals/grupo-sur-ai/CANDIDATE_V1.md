# Candidate v1 — Motor comercial Matriz v1.4

Estado: implementación shadow para evaluación; no desplegada.

## Fronteras de autoridad

La Candidate separa cuatro capas:

1. `golden-compiler.mjs` y `production-state-adapter.mjs` entregan el estado canónico del caso sin reconstruir datos conocidos desde prosa.
2. `extraction-schema.mjs` limita al LLM a interpretar lenguaje, extraer datos, evidencia, confianza, correcciones y contradicciones.
3. `profile-accumulator.mjs` conserva un perfil acumulativo con fuente, confianza, evidencia, fecha e historial. Un valor `unknown` nunca reemplaza un valor `known`; una corrección explícita reciente del cliente prevalece sobre inferencias y Meta.
4. `matrix-engine.mjs` es la única autoridad para estados, completitud, capacidad inicial, handoff y próxima acción.

`candidate-runtime.mjs` orquesta estas capas y aplica `hard-rules.mjs` antes de cualquier transporte. DNC, takeover, cierre y handoff requerido pueden producir cero llamadas a Responses.

## Contrato de extracción

El JSON Schema incluye:

- modelo y modalidad;
- efectivo y cuota objetivo;
- usado y sus datos descriptivos;
- estimación del cliente separada de tasación autorizada;
- zona, plazo, urgencia, visita, seña e intención comercial;
- solicitud humana, objeciones, correcciones y contradicciones;
- consulta concreta y respuesta directa sin seguimiento.

El contrato prohíbe que el LLM emita `initial_capacity`, `qualification_status`, `commercial_temperature`, `handoff_status`, `commercial_profile_complete`, `missing_commercial_fields`, `conversation_status`, `do_not_contact` o `next_action`.

## Decisiones determinísticas

El motor devuelve cada decisión junto con IDs de regla y evidencia:

- `qualification_status`;
- `commercial_temperature`;
- `commercial_profile_complete` y faltantes;
- `commercial_tags`;
- `handoff_status`;
- `conversation_status` y `do_not_contact`;
- `next_action` y su plan;
- `initial_capacity` calculada sólo por código;
- completitud y estado de tasación del usado.

Modelo más financiación, sin capacidad ni intención suficiente, permanece `follow_up`. El límite de turnos sustantivos puede exigir handoff pero no cambia calificación. Los reminders no incrementan ese límite.

## Componentes deliberadamente congelados

- Modelo: `gpt-4.1-mini-2025-04-14`.
- Vector Store: `vs_6a80740821c081918bc10552428e6249`.
- 11 Training Examples del snapshot.
- Selección léxica actual, con registro de score y exclusión shadow de score cero.
- `file_search` con el mismo Vector Store y máximo tres resultados.
- Fuentes comerciales y snapshots productivos.

La única variación de Responses es el nuevo JSON Schema de extracción y el espacio de salida necesario para ese contrato. No se modificó ningún snapshot productivo.

## Verificación offline

```bash
npm run candidate:test
npm run candidate:demo:gsv1-001
npm test
```

El demo de `GSV1-001` verifica que `Peugeot 208` ya existe en `runtime_input` antes de “Financiar” y que el motor produce `follow_up + warm + continue_ai`, con `cash_available` como siguiente dato. El demo no usa red ni Responses.

No existe un comando de baseline Candidate habilitado en esta versión. Los 100 casos no deben ejecutarse hasta autorización explícita.
