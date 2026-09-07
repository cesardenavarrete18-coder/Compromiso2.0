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
- 3 puntos de invocación: modo humano, lead ya calificado, y después de `enforceVehicleFacts` (con la decisión V1 ya calculada, sin re-ejecutar V1). **Actualizado en Family G** (ver más abajo): los tres pasaron de `await runShadow(...)` a `scheduleShadow(runShadow(...))` no bloqueante, y el tercero se reubicó después de los re-chequeos de "latest inbound" y takeover.
- **`Volkswagen Polo` se preservó tal cual está en `main`** (post PR #40); `cab2105` todavía tenía `"Volkswagen Polo Robust"` y esa línea NO se tocó.
- Diff final (versión inicial de rc1, antes de Family G): sólo líneas agregadas (+27/-0) fuera de la línea de import.

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

### Family G — Shadow bloquea V1 (bug real, crítico) — **FIJADO**
Reportado por el usuario tras la entrega de rc1: los tres call sites del webhook hacían `await runShadow(...)`. Aunque `runShadow` atrapa sus propios errores y nunca los propaga, el `await` seguía obligando a V1 a esperar la ejecución completa de V2 (extracción semántica vía OpenAI, lookup de knowledge, resolución de facts, escritura en `ai_v2_shadow_runs`) antes de continuar con el chequeo de "latest inbound", el re-chequeo de takeover, la persistencia de la clasificación V1 y el envío del WhatsApp. Un V2 lento, colgado, o con timeout de OpenAI/DB agregaba esa latencia directamente a la respuesta de V1 — viola el contrato "V2 Shadow NO puede bloquear V1".

**Metodología red→green**: se escribió primero el archivo `evals/grupo-sur-ai/test/filter-v1-production-blockers-family-g.test.mjs` importando `scheduleShadow`/`decideShadowScheduling` desde un módulo (`scheduler.mjs`) que todavía no existía. Se corrió el test: falló con `ERR_MODULE_NOT_FOUND` (rojo genuino — el mecanismo no bloqueante no existía en absoluto). Se implementó `supabase/functions/_shared/ai-v2-shadow/scheduler.mjs` y se volvió a correr: 8/8 verde.

**Fix — `scheduler.mjs`**:
- `scheduleShadow(task, { edgeRuntime = globalThis.EdgeRuntime, logger })`: envuelve la promesa ya iniciada (`task = runShadow(...)`) con un `.catch()` defensivo propio (nunca depende únicamente del try/catch interno de `runShadow`, para no dejar nunca un unhandled rejection en ese borde), y si `edgeRuntime.waitUntil` existe la registra ahí. **Nunca hace `await`** — es síncrona desde la perspectiva de quien la llama y retorna de inmediato, independientemente de cuánto tarde `task`. `edgeRuntime` es inyectable explícitamente, así que en Node se mockea pasando `{ waitUntil: fn }` o seteando `globalThis.EdgeRuntime`, sin depender del runtime real de Supabase.
- `decideShadowScheduling({ isStaleInbound, isHumanTakeoverDuringAnalysis, v1Decision })`: política pura que decide si programar el shadow y con qué `v1Decision`, documentando explícitamente la semántica elegida (ver más abajo).

**Fix — `whatsapp-webhook/index.ts`**: los tres call sites pasaron de `await runShadow(...)` a `scheduleShadow(runShadow(...))` (sin `await`), y se movió el tercer call site (el que sigue al cálculo de `classification`) para que ocurra **después** del chequeo de "latest inbound" y del re-chequeo de takeover, no antes.

**Semántica de scheduling elegida (orden del call site normal)**:
1. Se calcula V1 (`classification`) — sin cambios.
2. Se comprueba si el inbound quedó stale (llegó un mensaje más nuevo mientras OpenAI procesaba). **Si es stale: no se programa shadow para esa decisión** — nunca se aplicó al cliente, y una invocación posterior del webhook para el mensaje más nuevo ya generará su propia comparación shadow. Programarlo igual auditaría una respuesta V1 que nunca se envió.
3. Se re-comprueba takeover humano ocurrido durante el análisis. **Si hubo takeover: sí se programa shadow, pero con `v1Decision = null`**, nunca con la clasificación descartada — mismo criterio que las dos ramas de takeover/lead-ya-calificado al inicio del handler, que también programan con `v1Decision = null` porque V1 tampoco respondió ahí. La intención es preservar la observabilidad del momento (llegó un mensaje bajo control humano) sin que el registro de auditoría parezca "V1 contestó esto" cuando en realidad se descartó.
4. Recién si ninguno de los dos casos anteriores aplica, se programa el shadow con la `classification` real — la que efectivamente se va a enviar.
5. En ningún caso se espera (`await`) la resolución del shadow: V1 continúa de inmediato con la persistencia de su decisión y el envío del WhatsApp.

### Family H — `conversationControl` stale en takeover mid-análisis (bug real, de fidelidad) — **FIJADO**
Reportado en release review. El closure `runShadow()` siempre pasaba `conversationControl: conversationControl.data` — la lectura **inicial** de `whatsapp_conversation_controls`. En el escenario `initial mode=ai → análisis → humano toma el chat → controlAfterAnalysis.mode=human`, V1 se suprime correctamente (usa `controlAfterAnalysis` para decidirlo), pero Shadow seguía recibiendo `mode=ai` — podía generar una candidate reply y dejar `would_suppress_for_human=false` cuando la realidad era exactamente la opuesta. No afecta a V1 ni a producción (Shadow apagado por default), pero falsea la telemetría de `ai_v2_shadow_runs` que se usaría para decidir promoción.

**Metodología red→green**: se extendió `decideShadowScheduling` para que también devuelva `conversationControl` (antes sólo devolvía `schedule`/`v1Decision`/`reason`). Se comprobó el rojo real de dos formas: (1) se hizo `git stash` de `scheduler.mjs` para volver a la versión sin el campo `conversationControl` y se corrió `filter-v1-production-blockers-family-h.test.mjs` → los 3 tests fallaron (`candidate_reply_status` daba `'ready'` en vez de `'suppressed_human'`, `conversationControl` era `undefined`); (2) dentro del mismo test, se reprodujo el bug explícitamente alimentando el pipeline real (`runV2Shadow`) con el control stale (`mode:"ai"`) para un takeover, mostrando que produce `would_suppress_for_human:false` y una candidate reply no nula — la forma exacta, incorrecta, que el bug generaba en producción. Se restauró el fix (`git stash pop`) y los 3 tests dieron verde.

**Fix**:
- `decideShadowScheduling({..., initialConversationControl, conversationControlAfterAnalysis})` ahora también devuelve `conversationControl`: la snapshot inicial en el camino normal, la snapshot **posterior al análisis** en el camino de takeover mid-análisis, y `null` en el camino stale (no se programa nada de todos modos).
- `runShadow(v1Decision, conversationControlOverride = conversationControl.data)` en `index.ts` acepta ahora un segundo parámetro opcional; los dos call sites de entrada (humano ya presente, lead ya calificado) no cambian — siguen usando el default (su propia snapshot inicial, que ya es la correcta para esos casos). El call site de takeover mid-análisis y el call site normal pasan explícitamente `shadowScheduling.conversationControl` (o `resolvedControl` en la rama de takeover).

**TAKEOVER_SHADOW_SEMANTICS** (documentada explícitamente en el código): en el camino normal, Shadow recibe la snapshot inicial de `conversationControl` (por construcción, si hubiera sido `human` ya se habría cortado antes; y `controlAfterAnalysis` tampoco es `human` en ese camino, así que ambas coinciden). En el camino de takeover mid-análisis, Shadow recibe **siempre** `controlAfterAnalysis.data` (la snapshot fresca), nunca la inicial, y `v1Decision=null` (la clasificación descartada nunca se persiste como si hubiera sido aplicada). Los caminos de "humano ya presente al entrar" y "lead ya calificado" no se tocaron — conservan exactamente su semántica previa.

### Family I — contrato `wouldHandoff` incorrecto (bug real, crítico para telemetría) — **FIJADO**
`pipeline.mjs` calculaba `wouldHandoff = engine.handoff_decision?.handoff_status === "requested" || engine.handoff_decision?.handoff === true`. `decideHandoff()` (`handoff-policy.mjs`, único productor real de `handoff_decision` en todo el código) **nunca** devuelve `handoff_status:"requested"` ni una propiedad `handoff` — su contrato real es `handoff_status ∈ {human_owned, closed_or_routed, immediate, ready, not_ready}`, y la intención real de derivar está en `next_action === "handoff"`. Consecuencia: la condición vieja era **siempre falsa, para cualquier input** — `would_handoff` nunca reflejaba un handoff real, incluso cuando Filter lo ordenaba de forma inmediata (pedido explícito de humano, acción fuerte). Como además el `response_plan` real del engine no tiene una key `.prompt` (sólo `next_filter_question`), un `would_handoff` falso incorrecto hacía que `response-generator.mjs` cayera en el fallback genérico `"¿En qué modelo estás interesado?"` en vez del copy de derivación.

**Metodología red→green**: se escribió `evals/grupo-sur-ai/test/filter-v1-production-blockers-family-i.test.mjs` con 7 casos, usando el `decideHandoff` **real** (no un mock) para construir cada `handoff_decision` y corriendo el pipeline real. Se corrió contra el código sin arreglar: los 3 casos donde Filter sí ordena handoff (`explicitHumanRequest`, `strongAction`, perfil completo + horario conocido) fallaron con `would_handoff=false` — rojo genuino, exactamente la falla descripta. Los 4 casos negativos (perfil completo + horario desconocido, `closed_or_routed`, `human_owned`, `not_ready`) ya daban verde, pero sólo por la casualidad de que la condición vieja era siempre falsa — no por evaluar correctamente el contrato negativo.

**Fix**: `wouldHandoff = engine.handoff_decision?.next_action === "handoff"` — una sola condición, derivada de la intención real del engine (`next_action`), no de una lista frágil de strings. Cubre los 3 casos positivos y preserva los 4 negativos por la razón correcta esta vez (evaluados explícitamente contra el contrato real de `decideHandoff`, no por casualidad).

No se tocó `handoff-policy.mjs`: su contrato es consistente y correcto; el bug estaba enteramente en cómo `pipeline.mjs` lo leía.

**HANDOFF_SHADOW_SEMANTICS**: `would_handoff=true` si y sólo si `next_action==="handoff"` (handoff inmediato por pedido humano/acción fuerte, o handoff por perfil completo con horario de contacto ya conocido). `human_owned`, `closed_or_routed`, `complete_filter` y `ask_next_missing_component` nunca cuentan como un nuevo handoff comercial.

**Nota fuera de alcance** (no se tocó, documentada para una futura family): `response-generator.mjs` lee `input.responsePlan?.prompt`, pero el `response_plan` real del engine nunca tiene esa key (usa `next_filter_question`) — incluso con `wouldHandoff` corregido, el camino "no es handoff ni precio ni knowledge lookup" sigue cayendo siempre en el fallback hardcodeado en vez de usar la pregunta real del filtro. Es un mismatch de contrato preexistente, independiente de Family I, y no formaba parte de lo pedido en esta iteración.

## Resultados de tests

```
npm test   (evals/grupo-sur-ai)
# tests 245
# pass 245
# fail 0
```

Incluye: 169 (filter:v1 core) + 14 (unsafe-metric) + 10 (semantic-online-harness, con transporte fake, sin red real) + 30 (ai-v2-shadow, incluyendo parity y no-sender) + 4 (production-blockers A–D) + 8 (Family G) + 3 (Family H) + 7 (Family I).

## Auditoría de side effects

- **Lectura únicamente** fuera de `ai_v2_shadow_runs`: el pipeline sólo hace `select` sobre `lead_messages`, `lead_attributions`, `models`, `brands`, `campaigns`, `model_versions`, `bank_credit_offers`, `ai_assistant_settings`. Ningún `insert`/`update`/`delete` fuera de la tabla de auditoría (confirmado por lectura completa de `repository.mjs` y `whatsapp-adapter.mjs`).
- **Nunca envía WhatsApp**: sin referencia a `sendWhatsAppText` en todo el directorio (Family C).
- **Fail-closed real**: el flag se chequea antes de cualquier acceso a datos (Family D); y dentro del webhook, `runShadow()` envuelve todo en try/catch propio y sólo hace `console.error` — nunca puede interrumpir la respuesta V1. Tras Family G, tampoco puede **demorarla**: se programa con `scheduleShadow()`/`EdgeRuntime.waitUntil`, nunca con `await`.
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
5. **`EdgeRuntime.waitUntil` no se verificó contra el runtime real de Supabase** (no hay forma de desplegar/ejecutar la función edge en este entorno). `scheduleShadow()` está escrito defensivamente (si `edgeRuntime`/`waitUntil` no existieran, igual no hace `await` ni lanza — simplemente no se registra background task explícito), pero la confirmación de que Supabase efectivamente mantiene vivo el request hasta que la tarea termine debe hacerse en un ambiente real antes de confiar en la telemetría de `ai_v2_shadow_runs` para tráfico de alto volumen.
6. **`response-generator.mjs` lee `responsePlan.prompt`, que el engine real nunca produce** (usa `next_filter_question`). Detectado como efecto colateral de auditar Family I; no es parte de Family I ni de Family H, no se tocó, y no afecta ninguna garantía de aislamiento V1/latencia — sólo la calidad del texto candidato en escenarios que no son handoff/precio/knowledge-lookup. Candidato a una family futura si se decide perseguir fidelidad completa del candidate reply antes de habilitar shadow en un ambiente real.

## Veredicto

**READY_FOR_SHADOW_MERGE_REVIEW**

Con la misma aclaración que en la entrega anterior: "ready" es para *revisión de merge* del estado shadow reconstruido (código + tests + migración en el repo, apagado por default, cero efecto en latencia o en resultado de V1, cero efecto en producción, y ahora también telemetría de fidelidad corregida en los escenarios de takeover y handoff) — no para habilitar `AI_V2_SHADOW_MODE=true` en ningún ambiente real todavía, dado el Family F abierto, la falta de corridas reales (puntos 1–2), `EdgeRuntime.waitUntil` sin confirmar contra el runtime real (punto 5), y el mismatch `responsePlan.prompt` recién documentado (punto 6).
