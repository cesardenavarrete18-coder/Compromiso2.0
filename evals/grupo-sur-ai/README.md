# Grupo Sur — Eval Harness shadow

Runner independiente y sin efectos laterales para medir la IA comercial desplegada contra Golden Dataset v1.0.0 y Matriz v1.4.

## Runtime TypeScript aislado

El harness registra `tsx` mediante `node --import tsx` para cargar en memoria los snapshots TypeScript del runtime productivo. La dependencia está fijada en `package-lock.json`, vive únicamente en esta carpeta y no transpila, reescribe ni altera los archivos congelados de `snapshot/runtime_source/`.

Instalación reproducible:

```bash
npm ci
```

## Estado actual

El harness está preparado, pero no tiene autorización para ejecutar el baseline:

- la credencial se inyecta exclusivamente como secreto `OPENAI_EVAL_API_KEY` del entorno shadow y nunca se guarda aquí;
- el modelo efectivo quedó verificado como `gpt-4.1-mini-2025-04-14` en `snapshot/model_verification.json`;
- `EVAL_EXECUTION_CONFIRMED` no debe configurarse hasta una autorización posterior;
- no se ejecutó ninguna inferencia.

El fallback `gpt-4.1-mini` observado en el código se conserva como dato histórico, no como evidencia del modelo efectivo.

## Límites de seguridad

El proceso sólo permite:

- leer archivos locales congelados;
- consultar `GET /v1/vector_stores/{id}` con la credencial exclusiva de Evals;
- llamar `POST /v1/responses` con `store=false`;
- escribir resultados dentro de `runs/`.

No contiene cliente Supabase, webhook, Meta API ni adaptadores de leads, mensajes, routing, handoff, recordatorios o notificaciones. Cualquier intento de usar un adaptador prohibido lanza `SIDE_EFFECT_BLOCKED` y cancela el run.

## Preflight offline

```bash
npm run preflight:offline
```

Este comando nunca usa red. En un checkout local sin el secreto inyectado informa `OPENAI_EVAL_API_KEY_MISSING`; en Cloud valida el resto del snapshot sin mostrar ni utilizar la credencial.

## Carga segura de la credencial y preflight live

El entorno shadow debe configurarse desde **Environment settings → Secrets**. Crear un secreto con nombre exacto:

```text
OPENAI_EVAL_API_KEY
```

Pegar allí el valor y guardar. No usar Environment variables, archivos `.env`, secretos de GitHub ni comandos que incluyan el valor. Iniciar una sesión nueva del entorno para que el secreto sea inyectado sin mostrarse.

Después ejecutar solamente:

```bash
npm run preflight:live
```

Este comando permite una única operación de red: lectura del Vector Store congelado. No permite `POST /v1/responses`, por lo que ejecuta cero inferencias y cero Eval Cases. También falla si detecta credenciales productivas de OpenAI, Supabase, Meta o WhatsApp dentro del proceso.

## Habilitación futura

Antes del run debe existir `snapshot/model_verification.json` con:

- `status=verified`;
- nombre exacto del modelo productivo;
- referencia a una fuente no mutante;
- fecha y responsable de la verificación.

Además deben estar presentes:

```text
OPENAI_EVAL_API_KEY
EVAL_EXECUTION_CONFIRMED=YES
```

El proceso verifica acceso de lectura al Vector Store congelado. Si falla, mantiene el bloqueo `RAG_RESOURCE_SCOPE_MISMATCH` y reporta únicamente un diagnóstico seguro con `http_status`, `error.type`, `error.code`, `error.message_sanitized` y una clasificación explícita:

- `401`: `credential_invalid_or_unauthenticated`;
- `403`: `permission_or_policy_insufficient`;
- `404`: `resource_not_visible_or_not_found`;
- cualquier otro status: `other_http_error`.

El diagnóstico no conserva headers de la respuesta, el header `Authorization`, la API key ni bodies no estructurados. Ningún fallo habilita un baseline degradado.

Si `fetch()` falla antes de recibir una respuesta HTTP, el mismo bloqueo incluye `transport_error=true`, hostname, clasificación y únicamente `error.name`, `error.code`, `error.cause.code`, `error.cause.name` y `message_sanitized`. Las clasificaciones posibles son `dns_resolution`, `tls_certificate`, `connection_refused`, `timeout`, `network_policy_or_proxy` y `other_transport_error`. No se registran headers, cuerpos, credenciales ni variables de entorno.

La ejecución requiere dos barreras simultáneas:

```bash
EVAL_EXECUTION_CONFIRMED=YES npm run run
```

No hay reintentos con prompts alternativos ni cambios de expected outcomes.

## Reproducibilidad

Cada run registra:

- timestamp UTC;
- modelo efectivo verificado;
- hash del snapshot;
- versión/hash de Edge Function;
- hash del dataset;
- Vector Store;
- 100 outputs crudos sanitizados;
- resultado de cada grader y segmentos.

Los Eval Cases nunca se incorporan al prompt ni al retrieval de conversaciones reales.

## Contrato de entrada y réplica

El harness mantiene dos componentes separados:

1. `golden-compiler.mjs` + `canonical-case-contract.mjs` convierten el Dataset congelado en un `runtime_input` canónico. Marca, modalidad y estados previos se declaran explícitamente; no se reconstruyen desde prosa.
2. `production-state-adapter.mjs` traduce ese contrato a la forma exacta que consumía `analyzeLeadConversation`. `runtime-replica.mjs` sólo reproduce prompt, Responses, routing y postprocesadores; no interpreta expectativas del Dataset.

Todo `runtime_input` distingue mensaje entrante, `existing_model_interest`, historial, referral Meta, modelo/modalidad anunciados, calificación previa, control conversacional, DNC, takeover, routing y datos persistidos. Los casos con estado conocido declaran rutas obligatorias y fallan con `STATEFUL_INPUT_NOT_DELIVERED` si el dato no llega a la réplica.

Los bypasses anteriores a Responses incluyen DNC/cierre determinístico, takeover humano, calificación previa y handoff ya iniciado. Por eso el número de llamadas a Responses puede ser menor que el número de Eval Cases.

## Graders de capacidad y fidelidad

Cada grader distingue `FAIL_FUNCTIONAL` de `CAPABILITY_MISSING`. El score oficial permanece comparable con el contrato v1.0.0 y se acompaña de `available_score`, `available_max`, `normalized_existing_capabilities_score`, `official_pass`, `existing_capabilities_pass` y `blocked_by_missing_capabilities`.

El análisis conversacional detecta preguntas directas e indirectas, grupos comerciales, alternativas múltiples y repetición de datos conocidos. `next_action` valida acción principal, exclusividad, acciones incorrectas adicionales y requisitos de respuesta. Las prohibiciones críticas se emiten como checks estructurados.

`training_examples_present` registra `{id, score}` sin atribuir causalidad y excluye ejemplos con score cero sólo en el harness. La traza RAG separa `retrieval_attempted`, `retrieval_returned`, `evidence_available`, `claim_supported` y `source_current_authorized`; observar un `file_search_call` no aprueba grounding.
