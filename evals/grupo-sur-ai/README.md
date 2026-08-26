# Grupo Sur — Eval Harness shadow

Runner independiente y sin efectos laterales para medir la IA comercial desplegada contra Golden Dataset v1.0.0 y Matriz v1.4.

## Runtime TypeScript aislado

El harness registra `tsx` mediante `node --import tsx` para cargar en memoria los snapshots TypeScript del runtime productivo. La dependencia está fijada en `package-lock.json`, vive únicamente en esta carpeta y no transpila, reescribe ni altera los archivos congelados de `snapshot/runtime_source/`.

Instalación reproducible:

```bash
npm ci
```

## Estado actual

El harness está preparado pero deliberadamente bloqueado:

- `OPENAI_EVAL_API_KEY` todavía no fue confirmada;
- el valor efectivo de `OPENAI_LEAD_MODEL` no pudo verificarse mediante una fuente no mutante;
- no se ejecutó ninguna inferencia.

El fallback `gpt-4.1-mini` observado en el código no constituye prueba del valor efectivo.

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

Debe terminar bloqueado mientras el modelo no esté verificado y la credencial no esté confirmada. Este comando nunca usa red.

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

El proceso verifica acceso de lectura al Vector Store congelado. Si falla, termina con `RAG_RESOURCE_SCOPE_MISMATCH`; no ejecuta un baseline degradado.

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
