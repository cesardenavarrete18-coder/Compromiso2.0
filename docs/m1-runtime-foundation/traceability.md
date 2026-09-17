# Trazabilidad de la primera rama: M1-01, M1-02 y M1-03

Referencias aprobadas: **Plan ejecutable M0–M1 — Grupo Sur / CDN — v1**, §§9, 11, 20, 22 y 25; **Diseño de dominio CRM Grupo Sur A–K v2**, sección I y sus 155 casos. Esta rama tiene una autorización posterior y más acotada: infraestructura nueva, inactiva y no autoritativa, sin avanzar a M1-04 ni declarar M0 terminado.

## Estado de la evidencia

- **PASS de contratos puros:** 23 pruebas de [contracts.test.mjs](../../tests/m1/contracts.test.mjs), ejecutadas con Node 24.19.0 mediante `node --test tests/m1/contracts.test.mjs`. No prueban permisos SQL, concurrencia ni atomicidad.
- **BLOCKED de integración foundation:** [foundation.integration.test.mjs](../../tests/m1/foundation.integration.test.mjs) contiene las pruebas identificadas abajo, pero no pudo ejecutarse en este entorno. El namespace sólo ofrece UID/GID 0; cambiar de usuario o crear un namespace aislado falla con EPERM. Además, el runtime prohíbe AF_UNIX incluso sin el filtro propio. El launcher se detuvo antes de `initdb`: **cero migraciones aplicadas y cero pruebas de integración ejecutadas**. Se entregan harness y suites para un entorno que cumpla sus requisitos; no se debilitó el aislamiento para forzar un resultado.
- **Ningún caso completo de los 155 IDs v2 se declara PASS en esta rama.** Una primitiva genérica probada no equivale al comando comercial, al canal operativo ni al circuito de negocio que la utilizará.
- No se ejecutaron estas pruebas en producción. No se aplicaron migraciones productivas ni se habilitaron gateway, workers o emisores.

Los estados de las tablas siguientes distinguen `PASS-PURO`, `BLOCKED-DB` y `DIFERIDO`. Un futuro `PASS-FOUNDATION` sólo será válido para la variante sintética expresamente probada y el hash del artefacto consignado en el reporte del harness.

Identidad de la ejecución pura constatada:

| Archivo | SHA-256 |
|---|---|
| `tests/m1/contracts.test.mjs` | `bc77889f05c506e0fd42c987ab9103f1c9e4647e47a8f417fc571fe57028c105` |
| `supabase/functions/_shared/crm-runtime/contracts.mjs` | `baf5bcf12eae9985775d246589b197189f8b0af47e9a7dbdb742a1da43015857` |

Si cambia un archivo que participa en la prueba, se conserva la ejecución anterior como evidencia histórica y se vuelve a ejecutar el alcance afectado. La mera presencia de un test no cambia su estado a PASS.

## Correspondencia con el orden del plan (§22)

| Paso | Implementación de esta rama | Prueba y límite de aceptación |
|---|---|---|
| M1-01: baseline, contratos y harness | Contrato cerrado `FoundationProbe`, fixtures sintéticos y runner PostgreSQL local con socket Unix, entorno limpio y egress IP denegado. | Las pruebas puras pasan. La integración está bloqueada por el entorno antes de iniciar PostgreSQL. El inventario M0, escritores externos y demás bloqueadores tienen su propio reporte: **este paso no equivale a M0 completo**. No existe proveedor real ni hace falta simular envíos todavía. |
| M1-02: fundaciones privadas y permisos | PSQL-01/02 crean `crm_runtime_policies`, `crm_runtime_gates`, `crm_conversation_state`, `crm_lead_runtime` y owner NOLOGIN. Checks impiden activar autoridad/canal; RLS, FORCE RLS y revokes desde creación. | M12–M15 e ISOLATION verifican instalación y capacidades en PostgreSQL sintético. No se atribuyen a los objetos legacy ni a credenciales desplegadas. |
| M1-03: comandos, receipts, eventos y versiones | PSQL-03 añade `crm_command_receipts`, `crm_events`, gateway cerrado, normalización, actor derivado, hash, dedupe de intención, locks/CAS, eventos y errores estables. | M01–M11 y pruebas adicionales ejercitan el núcleo con un handler sintético instalado **sólo por el fixture**. El handler de la migración siempre devuelve `COMMAND_NOT_IMPLEMENTED`. No hay handlers de asignación, seña, venta o envío. |
| M1-04 y siguientes | No implementados por esta rama. | Wrappers/fences legacy, transferencia real, inbox, obligaciones, handoff, outbox, V1 adaptada, cierre de rutas antiguas, UI, cutover y rollback compuesto siguen diferidos y requieren autorización correspondiente. |

Los nombres de archivos de §25.3 eran propuestas para M1 completo. Esta primera entrega concentra la evidencia acotada en `contracts.test.mjs` y `foundation.integration.test.mjs`; no crea archivos vacíos para aparentar cobertura. El contrato se implementa en `.mjs`, compartible por Node y Deno, en lugar de los nombres preliminares `.ts`/`idempotency.ts`. Las suites funcionales restantes conservan su responsabilidad futura.

## Los quince requisitos mínimos del usuario

Los nombres entre comillas son los títulos reales de subtests de `foundation.integration.test.mjs`. Sus prefijos M01–M15 identifican **estos quince mínimos**, no las fases M1-01–M1-15 del plan.

| # | Requisito | Prueba existente y evidencia concreta esperada | Estado actual / límite |
|---|---|---|---|
| 1 | Mismo command_id + intención: un resultado lógico | **“M01: same command_id and same intent have one logical result”**: compara evento original/replay y cuenta un efecto, receipt y evento; versión 1. | BLOCKED-DB. Un resultado del probe; no venta/asignación real. |
| 2 | Misma key + hash no duplica | **“M02: same idempotency key/hash with a new command UUID replays the original”**: ID canónico y eventos originales aunque cambien UUID de transporte y correlation. | BLOCKED-DB. El hash puro ya excluye command_id/key/correlation sin excluir la semántica. |
| 3 | Misma key + payload diferente: conflicto | **“M03: a changed payload under the same key conflicts without another effect”**: `IDEMPOTENCY_KEY_REUSED`; cardinalidad sin incremento. | BLOCKED-DB; PASS-PURO para vinculación del hash con payload, actor, scope, causa, política y versiones. |
| 4 | Versiones obsoletas: VERSION_CONFLICT | **“M04: stale aggregate/assignment versions reject before applying”**: prueba por separado `assignment_epoch` y `aggregate_version` obsoletos, y verifica rechazo sin efecto/evento. **GATE-VECTOR** prueba dependencia equivocada y **VERSION-EXHAUSTED** el techo numérico. | BLOCKED-DB. Las dos variantes están definidas pero no ejecutadas; no equivalen a una transferencia concurrente. |
| 5 | Actor/rol nunca provienen del payload | **“M05: caller actor/role cannot be supplied in envelope or payload”**: entradas fabricadas rechazadas y actor del evento coincide con sesión. Pruebas puras **“actor, role, result, hash and authority never enter through envelope fields”** y **“closed payload prevents caller-supplied actor, owner, channel and operational handlers”**. | PASS-PURO; BLOCKED-DB. No prueba JWT/PostgREST real ni todos los servicios futuros. |
| 6 | Usuario inactivo rechazado | **“M06: inactive user cannot apply a command or recover an old replay”**: usuario inicialmente inactivo no crea receipt; desactivado después no obtiene eventos del replay. | BLOCKED-DB. Fixture `auth.uid()` local; no validación del emisor de tokens. |
| 7 | Scope ajeno rechazado | **“M07: foreign, unassigned and formerly owned scopes are denied without receipt disclosure”**: otro owner, owner NULL, exowner y colisión de command_id de otro actor. | BLOCKED-DB; PASS-PURO para forma/scope exactos. Cambio de owner del fixture es secuencial, no una prueba de transferencia de negocio. |
| 8 | Efecto/evento/receipt atómicos | **“M08: effect/event/receipt/version commit atomically and SQL hash matches the actual JS contract”**: compara cardinalidades, actor/owner al hecho y hash SQL con módulo real. **FAILPOINT** fuerza excepción tras DML sintético. | BLOCKED-DB. No hay outbox, seña, venta o handoff que puedan quedar certificados. |
| 9 | Crash antes de commit no deja parcial | **“M09: backend crash before COMMIT leaves no partial receipt/event/effect”**: termina un backend con transacción pendiente, verifica ausencia de efectos y reintenta. | BLOCKED-DB. Crash de sesión SQL, no fallo HTTP, proveedor o cluster completo. |
| 10 | Retry después de commit devuelve anterior | **“M10: retry after COMMIT from a fresh connection returns the committed result”**: conexión nueva conserva evento y efecto único. | BLOCKED-DB. No se simula respuesta del proveedor externo. |
| 11 | Dos sesiones no aplican dos veces | **“M11: two real sessions race on one command; observed lock wait, exactly one application”**: sesión A retiene commit; B debe aparecer esperando lock en `pg_stat_activity`; luego replay y efecto único. | BLOCKED-DB. Carrera del mismo comando; no dos ventas, último cupo, transferencia contra edición o dispatch. |
| 12 | Gates cerrados/no autoritativos | **“M12: default gates observe; no authoritative/quiescing state can be installed”** y **“STOCK-HOOK: even fixture-ready gates cannot activate the installed handler”**. | BLOCKED-DB. Incluso el fixture debe probar primero el handler instalado cerrado, antes de reemplazarlo. |
| 13 | Recupero/avisos futuros no se activan | **“M13: future recovery/internal send purposes cannot become ready or authoritative”**. Prueba pura **“business and future sending commands are not enabled by the foundation contract”**. | PASS-PURO; BLOCKED-DB. No existe sender, RecoverySession ni planificador de avisos. |
| 14 | Seller sin acceso directo a tablas nuevas | **“M14: no API role can directly read/write new tables or execute the installed gateway”**: ACL de las seis tablas para anon/authenticated/service_role, membership owner, FORCE RLS y llamada real al gateway denegada. M15 ejecuta además un UPDATE real como seller. | BLOCKED-DB. No afirmar batería REST completa ni revocación de permisos legacy. |
| 15 | Nada nuevo concede canal IA al seller | **“M15: new conversation structure stays disabled/paused; seller cannot acquire channel authority”**: defaults cerrados, CHECK impide activación incluso al fixture privilegiado y UPDATE seller denegado. Contrato puro no admite comandos de canal/envío. | PASS-PURO; BLOCKED-DB. No certifica el cierre del takeover legacy: permanece fuera de esta rama y conserva su riesgo P0. |

## Pruebas adicionales y lo que aportan

| Subtest real | Evidencia acotada |
|---|---|
| `ISOLATION: PostgreSQL17, Unix socket, restricted migrator and six private tables` | Versión, escucha IP vacía, socket Unix, migrador NOSUPERUSER y conjunto exacto de tablas. El launcher añade aislamiento de egress y marcador de ejecución. |
| `FAILPOINT: exception after synthetic DML rolls back every command effect` | Error inyectado por fixture, rollback de efecto/receipt/evento/versión. No hay failpoint habilitable desde el envelope productivo. |
| `GATE-VECTOR: changing one domain epoch does not borrow authority from the other` | No sustituir writer_epoch de command_crm por el de command_owner aunque ambos estén presentes. |
| `VERSION-EXHAUSTED: safe integer ceiling cannot overflow into an imprecise JS version` | Rechazo antes del handler cuando ya no puede producir una versión representable exactamente. |
| `BUSINESS-DEDUPE: different keys cannot duplicate the synthetic operation identity` | Segunda intención con otra key no repite `operation_id` del fixture. **La palabra BUSINESS del título no certifica dedupe económico real.** |
| `DEFERRED-GUARD: evaluating receipts cannot commit` | Constraint diferida impide comprometer un receipt sin decisión. Los submits ordinarios hacen COMMIT con rol authenticated para ejercitar el guard al salir del wrapper. |
| `DEFERRED-EVENT: an event cannot later attach to a rejected receipt` | Impide insertar tardíamente un evento asociado a una decisión rechazada. |
| `CONCURRENT-CAS: distinct intents at one version produce one effect and one conflict` | Dos intenciones del probe compiten por la misma versión; una aplica y la otra debe devolver VERSION_CONFLICT. |
| `APPEND-ONLY: terminal receipts/events/policy reject mutation and TRUNCATE` | Mutaciones ensayadas y truncado de historia son rechazados. No es prueba contra un administrador capaz de sustituir DDL. |
| `FINAL-INVARIANTS: no evaluating receipt/orphan event; new channel authority remains closed` | Cuenta receipts incompletos y pares receipt/evento incompatibles; confirma conversación disabled/paused. El fixture no contiene el CRM legacy completo; no demuestra regresión de sus procesos. |

Todas estas pruebas DB están BLOCKED; sus títulos describen lo implementado en la suite, no resultados ejecutados. Requieren un entorno aislado compatible y un reporte satisfactorio ligado al artefacto final. Las 23 puras cubren además tipos numéricos, UUID, orden canónico, arrays con orden significativo, SHA-256 independiente, Unicode inválido, propiedades no JSON y límites de tamaño/profundidad.

## Relación honesta con los 155 casos A–K v2 (§25.4)

**Cobertura genérica parcial** significa una primitiva útil para ese caso, no su ejecución completa. En esta captura, las primitivas SQL tienen su gate de integración BLOCKED por el entorno.

| IDs relacionados | Qué aporta la primera rama | Qué impide declarar PASS al ID completo |
|---|---|---|
| X-01, X-22 | Actor/scope actuales del probe, ACL nuevas, inactivo/exowner/owner NULL y ausencia de canal nuevo. | Falta matriz completa de comandos/entradas, JWT/REST/Edge/UI, documentos con RLS real y cierre legacy. |
| X-02, I-09, N-03 | Contrato/hash/receipt genéricos, replay y carrera del mismo probe. | Faltan comandos comerciales, outbox e identidad concreta de aviso/tarea/destinatario. |
| X-24, X-25 | Expectativas cerradas, metadatos obligatorios, CAS del agregado y vector por dominio. | Faltan snapshot/delta reales, cliente viejo, wrapper legacy y UI accionable. |
| F-04 | Atomicidad y rollback del efecto sintético con receipt/evento. | Faltan outbox/handoff y demás efectos del caso completo. |
| X-15 | Unicidad material de `operation_id` en fixture separado de dedupe de intención. | Ninguna prueba sobre recibo económico, seña, corrección o reversa real. |
| X-21 | Evento del probe conserva actor y owner del hecho. | No cohortes, cancelación económica ni REPORTES. |
| ACC-F, ACC-H, I-07, I-18, N-01, N-07, N-08, N-22 | Barreras negativas de estructuras nuevas: no canal seller ni propósitos futuros habilitables. | No existe aceptación/handoff/transferencia/envío de aviso; siguen abiertas las entradas legacy y no se modifica su autorización. |

El resto no recibe cobertura funcional por compartir una columna, un nombre o un patrón SQL. La siguiente partición enumera los **155 IDs**; los “relacionados” remiten exclusivamente a la cobertura parcial anterior.

| Familia | IDs con primitiva relacionada | IDs sin caso funcional ejecutado en esta rama |
|---|---|---|
| 8 obligatorios | ACC-F, ACC-H | ACC-A–ACC-E, ACC-G |
| 14 unitarias | Ninguno | U-01–U-14 |
| 18 integración | I-07, I-09, I-18 | I-01–I-06, I-08, I-10–I-17 |
| 16 concurrencia | Ninguno | C-01–C-16 |
| 15 fallos | F-04 | F-01–F-03, F-05–F-15 |
| 14 regresión | Ninguno | R-01–R-14 |
| 12 observabilidad | Ninguno | O-01–O-12 |
| 34 contratos/seguridad | X-01, X-02, X-15, X-21, X-22, X-24, X-25 | X-03–X-14, X-16–X-20, X-23, X-26–X-34 |
| 24 notificaciones/bordes | N-01, N-03, N-07, N-08, N-22 | N-02, N-04–N-06, N-09–N-21, N-23–N-24 |

Los 18 IDs relacionados permanecen **PARCIALES**, no PASS completo; los otros 137 no tienen caso funcional ejecutado por esta rama. En particular, una carrera de `FoundationProbe` no se cuenta como ninguno de los 16 escenarios C, cuyos recursos y estímulos son distintos.

## Qué queda diferido y dónde corresponde retomarlo

| Siguiente alcance del plan | Casos y límites que siguen pendientes |
|---|---|
| M1-04 | Wrappers/fences reales; transferencia conserva etapa, agenda, seña y protocolo; venta/pago actuales sin duplicación. Incluye las porciones aplicables de ACC-G, U-05, I-16, X-03/04/06/14–22/25/31/32. No se diseña crédito nuevo. |
| M1-05–06 | Inbox, medios/unknown, identidad, procesamiento, obligaciones, handoff y diálogo independiente. Incluye ACC-F, las obligaciones de ACC-H y los casos de recepción/control correspondientes. |
| M1-07–09 | Outbox, intentos, callbacks, unknown, fencing de emisores; V1 adaptada; cierre de rutas antiguas. No basta mantener cerrado el gateway nuevo. |
| M1-10–11 | UI/REST/Edge y credenciales reales de prueba; composición, observabilidad, carreras y reversión compatible. Hace falta manifest final por artefacto y prueba de que binarios viejos no pueden saltar la frontera. |
| M1-12–16 | Instalación/cutover/piloto/expansión requieren autorizaciones separadas. Ningún test local las concede. |
| M2 y siguientes del diseño A–K | Mapeo/saneamiento histórico y hechos/proyecciones; M3 protocolo/40%, Base Fría, Recupero, Rellamados, Centro de Alertas y REPORTES; M4 circuito comercial nuevo de ahorro; M5 semántica V2; M6 activación posterior. Sus pruebas completas no se adelantan mediante el probe. |

Quedan fuera de cualquier PASS aquí la regla del 40%, recuperación con cero intentos, aceptación comercial, continuidad factual IA, conservación real por transferencia, banco/cotizador, callbacks/dispatch, dedupe económico real, autenticación del proveedor, protección de credenciales desplegadas y reparación del takeover legacy. Se conserva explícitamente esa diferencia entre arquitectura propuesta, infraestructura presente y comportamiento verificado.
