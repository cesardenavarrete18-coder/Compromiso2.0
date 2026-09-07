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

### Family J — Response Generator no consumía el contrato real de `responsePlan` (bug real, crítico para fidelidad de telemetría) — **FIJADO**
Lo que en la entrega anterior quedó anotado como "nota fuera de alcance" se reclasificó como Family J y se cerró antes del merge, porque afecta directamente la fidelidad del `v2_candidate_reply` que la telemetría de Shadow necesita para decidir promoción. Dos problemas concretos en `response-generator.mjs`:

1. Leía `responsePlan.prompt`, key que **no existe** en el contrato real de `buildCommercialResponsePlan()` (`answer_kind`, `answer_fact`, `knowledge_request`, `next_filter_question`, `handoff`, `warnings` — nunca `prompt`). Siempre caía en el fallback hardcodeado `"¿En qué modelo estás interesado?"`, sin importar qué pregunta correspondía realmente según el estado del filtro.
2. Para respuestas comerciales, volvía a inferir la intención con regex sobre `currentMessage` (`/precio|cuanto (?:sale|cuesta|vale)|cuotas?/`) en vez de usar `responsePlan.answer_fact` (ya resuelto por el engine con el `fact_type` correcto), y priorizaba `final_price` sobre `installment` sin mirar qué se preguntó — podía contestar precio total ante una pregunta de cuota. `delivery_advance` no tenía ninguna rama en absoluto y caía en la pregunta genérica aunque el engine ya hubiera resuelto el anticipo.

Esto rompía la separación arquitectónica Extractor → Filter/Engine → Response Plan → Composer: el Composer volvía a decidir semántica comercial por su cuenta en vez de componer el `responsePlan` ya decidido.

**Metodología red→green**: se escribieron 13 tests en `evals/grupo-sur-ai/test/filter-v1-production-blockers-family-j.test.mjs`, todos manejando el **engine real** (`runFilterV1Integration`, invocado por `pipeline.mjs` como su propio `runFilter`, con sólo la extracción semántica LLM stubbeada — sin red) para producir un `responsePlan` genuino, nunca un objeto `{ prompt: "..." }` fabricado a mano. Se confirmó el rojo real: se hizo `git stash` de `response-generator.mjs` (volviendo a leer `.prompt` y a la regex de precio/cuota) y se corrió la suite → **9 de 13 casos fallaron** (cuota devolvía precio total; anticipo de retiro cae en pregunta genérica; los 5 casos de `next_filter_question` — purchase_mode, down_payment, monthly_capacity, has_trade_in, trade_in_variant — todos caían en el fallback genérico; `ambiguous_initial_amount` no distinguía nada; el handoff "ready" con fact resuelto perdía el precio). Se restauró el fix (`git stash pop`) → 13/13 verde.

**REAL_RESPONSE_PLAN_CONTRACT** (el único que `response-generator.mjs` consume ahora): `answer_kind`, `answer_fact` (`{fact_type, status, value, source_campaign_id, provenance}` o `{fact_type:"technical_knowledge", status:"requires_knowledge_lookup", ...}`), `next_filter_question`, `handoff`. `commercial_framing_allowed`, `promotional_hook`, `cross_campaign_combination`, `can_present_as_single_alternative` y `warnings` no se consumen en el composer (no hacía falta para los 12 casos pedidos).

**ANSWER_FACT_COMPOSITION**: `renderAnswerFact(plan.answer_fact)` es ahora la fuente primaria — mapeo determinístico 1:1 por `fact_type`:
- `model_reference_value` → "El precio informado es {monto}."
- `installment_offer` → "La cuota informada es {monto}."
- `delivery_advance` → "El anticipo para retirarlo es {monto}." (nuevo — antes no existía ninguna rama para este fact_type).
- `status:"not_materialized"` → "No tengo un valor estructurado vigente para confirmarte."
Nunca se vuelve a elegir campaña ni a combinar cuota de una campaña con precio/anticipo de otra — `answer_fact` ya viene resuelto por `resolvePlanFact()` desde una única campaña (`plan-fact-resolver.mjs`, sin tocar). El guard anti-Frankenstein (`assessMultiFactCombination`) sigue intacto en `commercial-response-policy.mjs`, no modificado.

**NEXT_FILTER_QUESTION_COMPOSITION**: mapeo determinístico 1:1 `FILTER_QUESTION_COPY[plan.next_filter_question]` para los 11 valores reales que puede emitir `chooseNextQuestion()` (`model`, `purchase_mode`, `down_payment_amount`, `monthly_installment_capacity`, `has_trade_in`, `trade_in_brand`, `trade_in_model`, `trade_in_variant`, `trade_in_year`, `trade_in_km`, `contact_preference`), cada uno con una única pregunta concreta y verificable. `clarify_initial_amount_intent` tiene su propio texto fijo, una sola pregunta que distingue "monto para arrancar el plan" de "anticipo para retirar el vehículo" (sin introducir ningún campo nuevo como `subscription_amount` — sólo texto, no hay cambio de contrato de datos).

**Handoff (`wouldHandoff===true`, Family I)**: nunca se agrega una pregunta de filtrado nueva. Si el engine ya resolvió un `answer_fact` para ese turno (posible en un handoff "ready", donde `stop_questions` es `false` y el engine sigue construyendo una respuesta normal — a diferencia de un handoff "immediate", donde el engine nunca calcula `answer_fact`), se antepone al copy de derivación en vez de descartarse. Verificado en el caso 10b: perfil completo + horario conocido + intención de precio ya resuelta → el candidato menciona el precio **y** deriva, sin preguntar por el horario de contacto que el engine seguía sugiriendo en `next_filter_question`.

**Ruta legada preservada, no eliminada**: cuando no hay `plan.answer_fact` en absoluto (tests unitarios preexistentes que ejercitan sólo `allowedFacts.commercial_facts` sin pasar por el engine completo — tests #17/#25 de `ai-v2-shadow.test.mjs`), se mantiene el camino anterior basado en `allowedFacts.commercial_facts` + regex de precio/cuota, pero **sólo como fallback secundario**, nunca por encima de un `plan.answer_fact` real. Ningún test de los 30 de `ai-v2-shadow.test.mjs` se rompió por esto.

**Test histórico engañoso corregido**: el test `#23` de `ai-v2-shadow.test.mjs` ("candidate has at most one conceptual question") validaba manualmente `responsePlan: { prompt: "¿Uno? ¿Dos?" }` — una estructura que no existe en el engine real, y que además seguía "pasando" con el fix nuevo por una razón distinta (esa key ya no se lee en absoluto, así que caía al fallback genérico de una sola pregunta, ocultando que el test ya no probaba nada real). Se reemplazó por una iteración sobre los 12 valores reales de `next_filter_question` que el engine puede emitir, confirmando `≤1 "?"` en cada uno — cobertura real, no una casualidad.

No se tocó: extractor, semantic prompt, provider schema, normalizer, sanitizer, evaluator, datasets FVS, Golden, `handoff-policy.mjs`, ni nada de Family F. Paridad byte-a-byte de `filter-v1` sigue verde (no se modificó ningún archivo de esa carpeta; el fix es enteramente en `supabase/functions/_shared/ai-v2-shadow/response-generator.mjs`, que está fuera del árbol con parity-check).

### Nota de proceso — Families K, L y M sí tocan `filter-v1/`
A diferencia de A–J (que sólo tocaron `ai-v2-shadow/`), K/L/M corrigen bugs determinísticos dentro del propio runtime `filter-v1/` compartido (`contracts.mjs`, `contact-priority.mjs`, `integration/filter-v1-engine.mjs`, y un módulo nuevo `contact-timing-resolver.mjs`). Cada cambio se aplicó primero en `evals/grupo-sur-ai/src/filter-v1/` (fuente canónica) y luego se repitió byte-a-byte en `supabase/functions/_shared/filter-v1/` (`diff` verificado archivo por archivo antes de cada commit) — el mecanismo de promoción documentado en el propio README de `ai-v2-shadow/` se mantiene vigente. El test de parity (`#30` de `ai-v2-shadow.test.mjs`) sigue verde.

### Family K — Response Generator no componía "answer + next question" (bug real) — **FIJADO**
El contrato aprobado de Filter v1 es "ANSWER primero + máximo una pregunta lógica del filtro, o handoff". `response-generator.mjs` (ya corregido en Family J para usar `plan.answer_fact`) devolvía el fact resuelto **o** la siguiente pregunta, nunca ambos — así, un engine que correctamente decidía `answer_fact=cuota` + `next_filter_question=purchase_mode` producía una respuesta que sólo contestaba la cuota y dejaba de avanzar el filtro.

**Metodología red→green**: 8 tests contra el engine real (`runFilterV1Integration` vía `pipeline.mjs`). Se revirtió temporalmente el fix de Family K (`git show HEAD:...` sobre el archivo) y se corrió: 6/8 fallaron exactamente en los casos de "fact + pregunta pendiente" (cuota+modalidad, precio+modalidad, anticipo+modalidad, financiado+anticipo pendiente, financiado+capacidad mensual pendiente, técnica+modalidad). Restaurado el fix → 8/8 verde.

**Fix**: `response-generator.mjs` ahora compone `answer + questionCopy(next_filter_question)` (una sola función `questionCopyFor()` reutilizada en las tres ramas: técnica, fact resuelto, y fallback puro) siempre que exista una pregunta pendiente real y no sea un turno de handoff/suprimido — nunca más de una pregunta (`finalize()` sigue truncando como red de seguridad, aunque con las copies fijas nunca hace falta).

### Family L — `contact_preference` nunca se resolvía ni se persistía (2 bugs reales adicionales descubiertos en el propio red de esta family) — **FIJADO**
`semantic-engine-adapter.mjs` hardcodeaba `contact_preference.timing: "unknown"` sin importar el literal real del cliente. Además, el engine nunca leía/escribía `state.contact_preference.asked_once`, y el `stop_questions:true` de `decideHandoff` para un perfil completo con timing desconocido silenciaba `next_filter_question` para siempre — así que "preguntar la preferencia de contacto" no podía ocurrir ni una sola vez.

**Metodología red→green**: 7 tests (A–G). Se revirtieron con `git stash` los 4 archivos tocados (`contact-priority.mjs`, `semantic-engine-adapter.mjs`, `filter-v1-engine.mjs`, más el módulo nuevo movido fuera temporalmente) y se corrió contra el código original: **7/7 fallaron**. Al reconstruir el fix se encontraron además, en el propio proceso de hacerlo pasar honestamente (no ajustando el test para que "diera verde"), dos bugs reales adicionales, no listados originalmente pero dentro del mismo alcance determinístico:
- `chooseNextQuestion()` trataba un componente condicional ausente (`down_payment_amount`/`monthly_installment_capacity` cuando `purchase_mode` no es `"financed"`, o `trade_in_*` cuando `has_trade_in` no es `"yes"`) como `undefined`, y `undefined` no está en `["known","explicitly_unknown"]` — así que preguntaba por campos que ni siquiera aplicaban al perfil del cliente. Fix: `key in profile.components && ...` antes de evaluar el estado.
- El motor calculaba `timing` a partir de `extraction.contact_preference` para la prioridad de contacto de ese turno, pero **nunca lo persistía** en `next_state` — el literal del cliente se perdía en el siguiente turno. Fix: persistir `state.contact_preference` cuando `extraction.contact_preference` está presente.

Ambos se verificaron contra los 169 tests de `filter-v1` (ninguno dependía del comportamiento roto) antes de aceptarlos como parte de Family L.

**Fix — `contact-timing-resolver.mjs`** (nuevo, determinístico, sin LLM): mapea el literal a `now`/`same_day`/`next_business_day`/`future`/`unknown` usando regex + `nextBusinessDate()`/`dateKey()` (reutilizados de `contact-priority.mjs`, ahora exportados). Nunca fabrica un `callback_at` exacto que el literal no dio — un límite inferior de hora ("después de las 17") se guarda en `callback_window`, no en `callback_at`.

**Fix — `filter-v1-engine.mjs`**: `askContactPreferenceNow = handoff.next_action === "complete_filter" && !state.contact_preference?.asked_once` — si es true, se bypassea el `stop_questions` para esa única pregunta y se marca `asked_once:true` en `next_state`. Turnos posteriores sin respuesta ya no la repiten (verificado: caso F). Si el cliente informa el timing, se persiste el literal y no se vuelve a preguntar (verificado: caso G, vía `wouldHandoff` de Family I ya que timing conocido = handoff "ready").

**Fix — `response-generator.mjs`**: nuevo copy `CONTACT_PENDING_HOLDING_COPY` para el caso "ready pero sin handoff comercial" (perfil completo, timing pendiente, ya preguntado una vez) — ni repite la pregunta ni fabrica una derivación que no ocurrió.

### Family M — DNC decidido por regex del composer en vez del engine (bug real, invariante de safety) — **FIJADO**
El composer tenía su propio regex de DNC, independiente de la decisión real del engine (`handoff_status="closed_or_routed"` / `next_action="close_or_route_noncommercial"`, ya presente en `decideHandoff` desde antes de esta iteración). Podían discrepar: frases que el extractor/sanitizer ya reconocían como DNC pero que el regex local del composer no cubría (ej. "Bórrenme.", "No quiero recibir mensajes.") seguían el flujo comercial normal — incluida una nueva pregunta de filtro.

**Metodología red→green**: 10 tests, usando `extraction.noncommercial=true` para simular que el extractor/sanitizer ya reconocieron la frase (esa clasificación en sí es LLM/sanitizer, fuera de alcance — lo que se testea es que engine+composer actúen correcto y consistentemente sobre esa señal). Se revirtieron con `git stash` los 5 archivos tocados y se corrió: **5/10 fallaron** — exactamente "Bórrenme."/"No quiero recibir mensajes." (frases que el regex viejo del composer no reconocía) y los 3 tests de telemetría multiturno (`dnc_acknowledged`, `dnc_first_ack`, `would_suppress_for_dnc`, que no existían). Los otros 5 pasaban por coincidencia (el regex viejo sí matcheaba "no me escriban/contacten", y `decideHandoff`/`would_handoff` ya eran correctos desde antes de esta family). Restaurado el fix → 10/10 verde.

**Fix — `filter-v1-engine.mjs`**: nueva rama temprana (segunda en precedencia, justo después de `human_owned`, antes de toda resolución de target/extracción) que corta el turno si `lead.do_not_contact || extraction.noncommercial===true`. `state.dnc_acknowledged` (nuevo campo en `createFilterState()`) se lee **antes** de sobrescribirlo, así que el primer turno DNC se distingue de los siguientes. `response_plan.handoff="closed_or_routed"` y `response_plan.dnc_first_ack` son la única fuente de verdad para el composer.

**Fix — `response-generator.mjs`**: `plan.handoff==="closed_or_routed"` se chequea **antes** que el regex local (que se conserva sólo como red de seguridad adicional, nunca puede contradecir al engine porque el chequeo del engine retorna primero e incondicionalmente). Primer turno → `DNC_ACK_COPY` breve. Turnos siguientes → `{text:null, status:"suppressed_dnc"}`, sin repetir el ack, sin pregunta, sin nuevo handoff comercial (ya garantizado por Family I: `close_or_route_noncommercial` nunca es `would_handoff`).

**Fix — `pipeline.mjs` + migración**: nuevo campo de telemetría `would_suppress_for_dnc` (true en cualquier turno DNC que no sea el de primer-ack), agregado también a `ai_v2_shadow_runs` (`would_suppress_for_dnc boolean not null default false`) — la migración todavía no fue aplicada en ningún ambiente, así que se editó el archivo existente en vez de crear una nueva.

**Persistencia sin depender de re-detectar el texto**: `lead.do_not_contact` (columna CRM, ya leída por el shadow en cada corrida vía `whatsapp-adapter.mjs`) alcanza por sí sola para mantener el DNC en cualquier turno posterior, aunque el mensaje nuevo no repita la frase — verificado explícitamente con un test dedicado.

**Precedencia verificada**: `human_owned` (ya existente) → DNC (Family M, nuevo) → pedido humano explícito/acción fuerte → perfil completo/ready → filtrado normal. DNC nunca se convierte en handoff comercial ni siquiera cuando coincide en el mismo turno con un pedido explícito de humano o un perfil ya completo (2 tests dedicados).

### Replay determinístico multi-turno (validación final, K+L+M juntas)
`evals/grupo-sur-ai/test/filter-v1-multiturn-replay.test.mjs` encadena `next_state` entre turnos (igual que `whatsapp-adapter.mjs` en producción) sobre un mismo lead: (1) consulta de cuota → responde + pregunta modalidad; (2) el cliente completa el perfil → pregunta preferencia de contacto una sola vez; (3) no responde el horario → no se repite, sigue `qualified`/`ready`; (4) DNC → acknowledgment breve; (5) mensaje siguiente bajo DNC → `suppressed_dnc`, sin repetir ack, sin pregunta, sin handoff. Verde en el primer intento tras completar K/L/M por separado — confirma que las tres families componen correctamente entre sí, no sólo de forma aislada.

## Resultados de tests

```
npm test   (evals/grupo-sur-ai)
# tests 284
# pass 284
# fail 0
```

Incluye: 169 (filter:v1 core) + 14 (unsafe-metric) + 10 (semantic-online-harness, con transporte fake, sin red real) + 30 (ai-v2-shadow, incluyendo parity y no-sender, con el test #23 reescrito contra el contrato real) + 4 (production-blockers A–D) + 8 (Family G) + 3 (Family H) + 7 (Family I) + 13 (Family J) + 8 (Family K) + 7 (Family L) + 10 (Family M) + 1 (replay determinístico multi-turno).

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
- **Columna agregada** (Family M): `would_suppress_for_dnc boolean not null default false` — con default, no requiere cambios en `repository.claim()`. Se editó el archivo existente (no se creó una migración nueva) porque, como el resto, **todavía no fue aplicada en ningún ambiente**.
- **No aplicada**: no se ejecutó `supabase db push`, `migration up`, ni ninguna herramienta de Supabase contra ningún proyecto. Sólo existe como archivo en el working tree de esta rama.

## Blockers restantes (no cerrados en este rc1)

1. **Family F** (gate semántico Filter v1.3): `passes_gates:false`, `LIMITED_GO`, críticas `FVS-016`/`FVS-018` sin resolver. Requiere iteración de prompt/normalizer + nueva corrida online real contra el proveedor (fuera del alcance de un fix determinístico local).
2. **Nunca se corrió el shadow pipeline contra tráfico real**: no existe ninguna fila histórica en `ai_v2_shadow_runs` (la tabla ni siquiera fue creada en ningún ambiente todavía). Antes de cualquier promoción habría que habilitar `AI_V2_SHADOW_MODE=true` en un ambiente controlado y revisar resultados reales, no sólo unit tests.
3. **No se pudo correr `deno check`/`deno test`** en este entorno (binario no disponible) — la integración en `index.ts` se validó por comparación estructural, no por type-check real de Deno.
4. **Variables de entorno requeridas** (`OPENAI_API_KEY`, `OPENAI_FILTER_MODEL`, `OPENAI_V2_RESPONSE_MODEL`, `AI_V2_SHADOW_MODE`) no están documentadas en ningún `.env.example` de este repo — quedaría pendiente antes de un rollout real, aunque no bloquea el estado "shadow-only, apagado por default".
5. **`EdgeRuntime.waitUntil` no se verificó contra el runtime real de Supabase** (no hay forma de desplegar/ejecutar la función edge en este entorno). `scheduleShadow()` está escrito defensivamente (si `edgeRuntime`/`waitUntil` no existieran, igual no hace `await` ni lanza — simplemente no se registra background task explícito), pero la confirmación de que Supabase efectivamente mantiene vivo el request hasta que la tarea termine debe hacerse en un ambiente real antes de confiar en la telemetría de `ai_v2_shadow_runs` para tráfico de alto volumen.

~~6. `response-generator.mjs` leía `responsePlan.prompt`~~ — reclasificado como **Family J** y **cerrado**.
~~7. Composer no componía answer+question, contact_preference nunca se resolvía, DNC dependía de regex local~~ — reclasificados como **Families K, L y M** y **cerrados** en esta entrega, junto con dos bugs adicionales encontrados en el propio proceso de hacer pasar Family L honestamente (`chooseNextQuestion` tratando un componente condicional ausente como no resuelto; `contact_preference` nunca persistido en `next_state`).

Ninguna de las families A–M abiertas listadas arriba (1–5) se cerró en esta pasada; siguen siendo exactamente los mismos 5 puntos.

## Veredicto

**READY_FOR_SHADOW_MERGE_REVIEW**

Con la misma aclaración que en las entregas anteriores: "ready" es para *revisión de merge* del estado shadow reconstruido (código + tests + migración en el repo, apagado por default, cero efecto en latencia o en resultado de V1, cero efecto en producción, y ahora también fidelidad completa de la respuesta candidata: answer+pregunta compuestos correctamente, preferencia de contacto resuelta y preguntada una sola vez, y DNC gobernado enteramente por la decisión real del engine con semántica multi-turno de acknowledgment/supresión) — no para habilitar `AI_V2_SHADOW_MODE=true` en ningún ambiente real todavía, dado el Family F abierto, la falta de corridas reales (puntos 1–2), y `EdgeRuntime.waitUntil` sin confirmar contra el runtime real (punto 5). Families G, H, I, J, K, L y M quedan cerradas. Ésta es la última pasada funcional acordada antes de la revisión de merge de Shadow — no se abrieron líneas de investigación nuevas más allá de lo pedido.
