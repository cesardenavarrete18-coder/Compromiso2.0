# AI V2 Shadow — reconstrucción rc1 sobre `main`

Base: `main` @ `fe0c68e1aef8e7a76c051acde27549cd53ad2390` (intacto, sin mergear PR37/38/39).
Rama: `claude/ai-v2-shadow-rc1`.
Fuente histórica inspeccionada (no mergeada): `cab2105d19199b2df05ae9770578c84686b9f821` (tip de PR39), más PR37/PR38 como antecedentes de diseño.

## Archivos portados desde PR37/38/39 (`cab2105`)

Copia literal (`git checkout cab2105 -- <path>`), sin cherry-pick de commits:

- `evals/grupo-sur-ai/src/filter-v1/**` (27 módulos) — runtime canónico Filter v1.3.
- `supabase/functions/_shared/filter-v1/**` — copia byte-a-byte de lo anterior (verificada por test de parity).
- `supabase/functions/_shared/ai-v2-shadow/**` — pipeline shadow, adapter de WhatsApp, firewall, facts, generador de respuesta candidata, repositorio, replay.
- `supabase/migrations/20260905120000_ai_v2_shadow_runs.sql` → **renombrada** a `20260907120000_ai_v2_shadow_runs.sql` (ver Family B).
- `evals/grupo-sur-ai/datasets/filter-v1-semantic-online-v0.1.jsonl` y `v0.2.jsonl` (requeridas por `filter-v1-final-closure.test.mjs`).
- Tests: `filter-v1.test.mjs`, `filter-v1-integration.test.mjs`, `filter-v1-semantic-extraction.test.mjs`, `filter-v1-production-critical-semantics.test.mjs`, `filter-v1-final-closure.test.mjs`, `filter-v1-unsafe-metric.test.mjs`, `filter-v1-semantic-online-harness.test.mjs`, `ai-v2-shadow.test.mjs`.
- `evals/grupo-sur-ai/.gitignore`, `package-lock.json` (idénticos a `cab2105`).

**No portado deliberadamente**: todo el árbol `candidate-v1/`, `candidate-v2*/`, `ab-v1/`, `graders*.mjs`, `runtime-replica.mjs`, `safety.mjs`, `cli.mjs`, reportes/eval-results históricos y toda la documentación de diseño (`docs/ai-commercial/FILTER_V1_*`). Esos archivos pertenecen al track "Seller v2 / Matrix v1.4" ya desacoplado o son documentación, no runtime/test necesario para esta reconstrucción mínima.

`package.json` de `evals/grupo-sur-ai` fue reescrito a mano (no copiado) con únicamente los scripts `filter:v1:*` y `ai:v2:shadow:test` — mismo `devDependencies.tsx@4.23.12` que `cab2105`.

## Integración manual en `whatsapp-webhook/index.ts`

Aplicada a mano sobre el `index.ts` **actual** de `main` (no sobrescritura), comparando línea por línea contra el diff de `cab2105`:

- Import de `runWhatsappV2Shadow`.
- Helper `runShadow(v1Decision)` con try/catch propio (nunca propaga al flujo V1).
- 3 puntos de invocación: modo humano, lead ya calificado, y después de `enforceVehicleFacts` (con la decisión V1 ya calculada, sin re-ejecutar V1).
- **`Volkswagen Polo` se preservó tal cual está en `main`** (post PR #40); `cab2105` todavía tenía `"Volkswagen Polo Robust"` y esa línea NO se tocó.
- Diff final: sólo líneas agregadas (+27/-0) fuera de la línea de import.

No se pudo correr `deno check`/`deno test` en este entorno (no hay binario `deno` disponible); la integración se validó por comparación estructural 1:1 contra el diff de PR39 y por lectura completa del archivo resultante.

## Blockers de producción — familias A–F

Metodología: para A y B se escribió primero un test rojo contra el comportamiento real (no contra el fake en memoria que traía el propio test de PR39), se confirmó el fallo, se aplicó el fix mínimo, y se confirmó verde. C y D se auditaron y se fijaron como test de regresión (ya estaban correctos). E se apoya en el test de parity ya existente. F queda documentado como abierto.

### Family A — `ai_v2_shadow_runs` INSERT viola NOT NULL (bug real, crítico) — **FIJADO**
`repository.claim()` insertaba una fila sin `runtime_fingerprint` ni `filter_model`, ambas `NOT NULL` **sin default** en la migración. El fake de test de PR39 (`memoryRepo` en `ai-v2-shadow.test.mjs`) es un `Map` en memoria que nunca validó esto, así que los 30/30 tests de PR39 pasaban mientras que **cada intento real de shadow en producción habría fallado en el primer INSERT**, siempre, silenciosamente (atrapado por `runV2ShadowSafely`, logueado por `console.error`, cero filas completadas jamás).
- Test rojo: `evals/grupo-sur-ai/test/filter-v1-production-blockers.test.mjs` → *"Family A (red→green)"*, con un `db` fake que sí simula la violación NOT NULL leyendo la migración real.
- Fix: `repository.claim()` ahora recibe `runtimeFingerprint`/`filterModel` y los incluye en el INSERT; `pipeline.mjs` los pasa (`RUNTIME_FINGERPRINT`, `config.filterModel`), valores que ya se conocían de forma síncrona antes del claim.
- Resultado: verde, y sin romper ninguno de los 30 tests originales de `ai-v2-shadow.test.mjs`.

### Family B — orden de migración incorrecto (bug real) — **FIJADO**
La migración venía fechada `20260905120000`, **anterior** a `20260905173149_rename_volkswagen_polo_model.sql`, ya aplicada en `main`. Aplicar una migración con timestamp anterior al último ya aplicado es exactamente el tipo de desorden que rompe el tracking de Supabase (`schema_migrations`) o que herramientas de CI rechazan.
- Test rojo: *"Family B (red→green)"* — verifica que el archivo de la migración ordene lexicográficamente después de todos los demás.
- Fix: renombrada a `20260907120000_ai_v2_shadow_runs.sql`.

### Family C — fuga de sender/PII/token (auditado, cobertura ampliada) — **VERDE, sin hallazgos**
El test original de PR39 (`#29`) sólo escaneaba `pipeline.mjs`. Se amplió a **todos** los `.mjs` de `ai-v2-shadow/` buscando `sendWhatsAppText`, `META_ACCESS_TOKEN`, `customer_phone`/`customerPhone`, `whatsapp_message_id`. Resultado: ningún archivo del directorio referencia esos símbolos. No había fuga; se cerró el hueco de cobertura del test, no un bug.

### Family D — fail-closed / cero efecto si el flag está apagado (auditado) — **VERDE, ya correcto**
Se confirmó y se fijó con test de regresión que `runWhatsappV2Shadow` corta en `AI_V2_SHADOW_MODE !== "true"` **antes** de tocar la base — cero queries. Hoy, sin esa variable seteada en Supabase, el shadow pipeline es 100% inerte.

### Family E — paridad byte-a-byte `filter-v1` (auditado) — **VERDE, heredado de PR39**
El test `#30` de `ai-v2-shadow.test.mjs` (ya portado) compara `evals/grupo-sur-ai/src/filter-v1/` contra `supabase/functions/_shared/filter-v1/` archivo por archivo y byte por byte. Pasa tras el port. Cualquier futura edición de uno sin repetir `cp -a` al otro haría fallar este test — el mecanismo de promoción sigue vigente.

### Family F — gate de calidad semántica de Filter v1.3 (abierto, NO cerrable con código local)
El propio benchmark de 100 casos heredado (`filter-v1.3-final-100-20260905-397fc48`) reporta `PRODUCT_READINESS: "LIMITED_GO"` y `passes_gates: false`, con violaciones críticas `FVS-016`/`FVS-018` (el extractor LLM abstiene en frases coloquiales de "cuánto pongo/saco para entregar"). Esto depende del modelo/LLM en inferencia real (`gpt-4.1-mini`), no de un bug determinístico local: no hay fix de código unitario que lo cierre sin re-tunear prompt/normalizer y correr un benchmark online nuevo contra el proveedor real. **Queda abierto** — ver "Blockers restantes".

## Resultados de tests

```
npm test   (evals/grupo-sur-ai)
# tests 227
# pass 227
# fail 0
```

Incluye: 169 (filter:v1 core) + 14 (unsafe-metric) + 10 (semantic-online-harness, con transporte fake, sin red real) + 30 (ai-v2-shadow, incluyendo parity y no-sender) + 4 (production-blockers nuevas, A–D).

## Auditoría de side effects

- **Lectura únicamente** fuera de `ai_v2_shadow_runs`: el pipeline sólo hace `select` sobre `lead_messages`, `lead_attributions`, `models`, `brands`, `campaigns`, `model_versions`, `bank_credit_offers`, `ai_assistant_settings`. Ningún `insert`/`update`/`delete` fuera de la tabla de auditoría (confirmado por lectura completa de `repository.mjs` y `whatsapp-adapter.mjs`).
- **Nunca envía WhatsApp**: sin referencia a `sendWhatsAppText` en todo el directorio (Family C).
- **Fail-closed real**: el flag se chequea antes de cualquier acceso a datos (Family D); y dentro del webhook, `runShadow()` envuelve todo en try/catch propio y sólo hace `console.error` — nunca puede interrumpir ni demorar la respuesta V1.
- **Aislamiento por superficie de API, no por permisos de DB**: la función edge corre con `service_role` (mismo patrón que el resto de `whatsapp-webhook/index.ts`), que **bypassea RLS**. La garantía de "repositorio restringido a `ai_v2_shadow_runs`" es un contrato de diseño (el objeto `createShadowRepository` sólo expone métodos sobre esa tabla), no una restricción a nivel de motor. Esto ya era así en el diseño original de PR39; se documenta explícitamente acá porque no estaba dicho en ningún lado.
- **PII**: `ai_v2_shadow_runs` no guarda número de teléfono ni tokens; sólo `lead_id`/`inbound_message_id` (FKs) y JSON derivado (`v1_decision` vía `v1DecisionSnapshot`, que sólo copia `qualification_status/priority/intent_summary/model_interest/disqualify_reason/reply_text`).
- **Cero impacto en build/deploy**: no hay workflows de CI (`.github/workflows` no existe) ni `package.json` en la raíz; el sitio se despliega a Vercel como estático (`vercel.json` sólo define redirects/rewrites). Agregar `evals/grupo-sur-ai/package.json` y `supabase/functions/_shared/**` no afecta ese pipeline. `_shared/` es la convención estándar de Supabase Edge Functions para código no desplegable como función propia (ya se generaría igual si `main` hubiera tenido otros `_shared/*` antes).

## Auditoría de migración

- **Aditiva pura**: `CREATE TABLE`, 3 `CREATE INDEX`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `REVOKE`, `GRANT`. Ningún `ALTER`/`DROP` sobre tablas existentes.
- **Dependencia externa**: la policy usa `private.current_user_is_admin()`, función que **no está definida en ninguna migración versionada** pero sí es usada exitosamente por dos migraciones ya mergeadas a `main` (`20260814190000_ai_knowledge_center.sql`, `20260815180000_sales_administration_and_quotes.sql`) — es decir, ya existe en la base real fuera del control de este repo (mismo patrón pre-existente que `public.campaigns`/`public.models`/`public.brands`, creadas antes del historial de migraciones). No es una dependencia nueva introducida por este trabajo.
- **Orden corregido** (Family B): ahora `20260907120000_...`, posterior a todo lo demás en `main`.
- **No aplicada**: no se ejecutó `supabase db push`, `migration up`, ni ninguna herramienta de Supabase contra ningún proyecto. Sólo existe como archivo en el working tree de esta rama.

## Blockers restantes (no cerrados en este rc1)

1. **Family F** (gate semántico Filter v1.3): `passes_gates:false`, `LIMITED_GO`, críticas `FVS-016`/`FVS-018` sin resolver. Requiere iteración de prompt/normalizer + nueva corrida online real contra el proveedor (fuera del alcance de un fix determinístico local).
2. **Nunca se corrió el shadow pipeline contra tráfico real**: no existe ninguna fila histórica en `ai_v2_shadow_runs` (la tabla ni siquiera fue creada en ningún ambiente todavía). Antes de cualquier promoción habría que habilitar `AI_V2_SHADOW_MODE=true` en un ambiente controlado y revisar resultados reales, no sólo unit tests.
3. **No se pudo correr `deno check`/`deno test`** en este entorno (binario no disponible) — la integración en `index.ts` se validó por comparación estructural, no por type-check real de Deno.
4. **Variables de entorno requeridas** (`OPENAI_API_KEY`, `OPENAI_FILTER_MODEL`, `OPENAI_V2_RESPONSE_MODEL`, `AI_V2_SHADOW_MODE`) no están documentadas en ningún `.env.example` de este repo — quedaría pendiente antes de un rollout real, aunque no bloquea el estado "shadow-only, apagado por default".

## Veredicto

**READY_FOR_SHADOW_REVIEW**

Con la aclaración explícita de que "ready" es sólo para *revisión* del estado shadow reconstruido (código + tests + migración en el repo, apagado por default, cero efecto en V1/producción) — no para habilitar `AI_V2_SHADOW_MODE=true` en ningún ambiente real todavía, dado el Family F abierto y la falta de corridas reales (puntos 1–2 de "blockers restantes").
