# Trazabilidad de la primera rama: M1-01, M1-02 y M1-03

Referencias aprobadas: **Plan ejecutable M0–M1 — Grupo Sur / CDN — v1**, §§9, 11, 20, 22 y 25; **Diseño de dominio CRM Grupo Sur A–K v2**, sección I y sus 155 casos. Esta rama tiene una autorización posterior y más acotada: infraestructura nueva, inactiva y no autoritativa, sin avanzar a M1-04 ni declarar M0 terminado.

## Estado de la evidencia

- **PASS de contratos puros:** 23 pruebas de [contracts.test.mjs](../../tests/m1/contracts.test.mjs), reejecutadas con Node 24.19.0 mediante `node --test tests/m1/contracts.test.mjs`; 23/23 PASS. No prueban permisos SQL, concurrencia ni atomicidad.
- **PASS-FOUNDATION, capa A:** run05 ejecutó PostgreSQL 17.6 real en VMs locales sin NIC y clústeres nuevos por archivo. Aprobaron las 26 subpruebas de [foundation](../../tests/m1/foundation.integration.test.mjs), 10 de [security](../../tests/m1/security.integration.test.mjs) y 9 de [installation](../../tests/m1/installation.integration.test.mjs), con cero fallos y cero omisiones. Sus 45 subpruebas más tres tests padre producen 48 entradas TAP. [Evidencia foundation](evidence/db-validation/foundation/database.json), [seguridad](evidence/db-validation/security/database.json) e [instalación](evidence/db-validation/installation/database.json).
- **PASS-SCHEMA-B:** run06 aprobó las 9 subpruebas de [schema-baseline-b](../../tests/m1/schema-baseline-b.integration.test.mjs), sin fallos ni omisiones; 10 entradas TAP con su test padre. Comprobó instalación y preservación de la frontera observada, sin filas productivas ni sustitución de `auth.uid`. [Reporte B](evidence/db-validation/schema-baseline-b/database.json) y [límites de la reproducción](schema-baseline-b.md).
- **PASS conjunto final:** run07-final-all volvió a ejecutar las cuatro suites con el harness definitivo, cada una desde cero en su propio clúster: 54/54 subpruebas SQL y 58/58 entradas TAP con los cuatro tests padre, cero fallos y cero omisiones. [Reporte final](evidence/db-validation/final-all/database.json), [VM](evidence/db-validation/final-all/vm.json) y [aislamiento](evidence/db-validation/final-all/isolation.json). Los hashes del reporte identifican los archivos ejecutados; el resultado no se extrapola a una versión distinta.
- **Defecto descubierto y corregido por DB real:** run04 falló en PSQL-02 con `0LP01`, ADMIN circular. Se quitaron cuatro `ADMIN TRUE` redundantes de los GRANT de PSQL-02/03. PostgreSQL ya otorga administración al creador; se conservan las capacidades temporales de DDL y se cierran INHERIT/SET al terminar. Run05 y B verificaron el resultado como postgres NOSUPERUSER. La membresía se comprueba por principal y por opciones en cada fila, sin asumir un solo grantor.
- El primer intento en el contenedor permaneció bloqueado por UID/GID y AF_UNIX. Ese resultado histórico no se convirtió en PASS: se obtuvo evidencia nueva en una VM autorizada sin NIC, sin montajes del host, sin credenciales y con seccomp/sondas de egress vigentes. Los archivos `vm.json` e `isolation.json` acompañan cada `database.json`; el launcher y comandos están en [el harness](../../tests/m1/harness/README.md).
- **Ningún caso completo de los 155 IDs v2 se declara PASS en esta rama.** Una primitiva genérica probada no equivale al comando comercial, al canal operativo ni al circuito de negocio que la utilizará.
- No se ejecutaron estas pruebas en producción. No se aplicaron migraciones productivas ni se habilitaron gateway, workers o emisores.

Los estados distinguen `PASS-PURO`, `PASS-FOUNDATION`, `PASS-SCHEMA-B` y `DIFERIDO`. `PASS-FOUNDATION` corresponde sólo a la variante sintética expresamente probada y a los hashes consignados en el reporte. B tiene su propio resultado y exclusiones; no convierte los escenarios sintéticos en procesos comerciales verificados. En conjunto se ejecutaron 54 subpruebas SQL, 58 entradas TAP contando los cuatro tests padre.

Identidad de la ejecución pura constatada:

| Archivo | SHA-256 |
|---|---|
| `tests/m1/contracts.test.mjs` | `bc77889f05c506e0fd42c987ab9103f1c9e4647e47a8f417fc571fe57028c105` |
| `supabase/functions/_shared/crm-runtime/contracts.mjs` | `baf5bcf12eae9985775d246589b197189f8b0af47e9a7dbdb742a1da43015857` |

Si cambia un archivo que participa en la prueba, se conserva la ejecución anterior como evidencia histórica y se vuelve a ejecutar el alcance afectado. La mera presencia de un test no cambia su estado a PASS.

## Correspondencia con el orden del plan (§22)

| Paso | Implementación de esta rama | Prueba y límite de aceptación |
|---|---|---|
| M1-01: baseline, contratos y harness | Contrato cerrado `FoundationProbe`, fixtures separados A/B y runner PostgreSQL local con socket Unix, entorno limpio y egress IP denegado. | Pruebas puras PASS; A PASS-FOUNDATION y B PASS-SCHEMA-B dentro de sus límites. El inventario M0, escritores externos y demás bloqueadores tienen su propio reporte: **este paso no equivale a M0 completo**. No existe proveedor real ni se simulan envíos. |
| M1-02: fundaciones privadas y permisos | PSQL-01/02 crean `crm_runtime_policies`, `crm_runtime_gates`, `crm_conversation_state`, `crm_lead_runtime` y owner NOLOGIN. Checks impiden activar autoridad/canal; RLS, FORCE RLS y revokes desde creación. | M12–M15 e ISOLATION verifican instalación y capacidades en PostgreSQL sintético. No se atribuyen a los objetos legacy ni a credenciales desplegadas. |
| M1-03: comandos, receipts, eventos y versiones | PSQL-03 añade `crm_command_receipts`, `crm_events`, gateway cerrado, normalización, actor derivado, hash, dedupe de intención, locks/CAS, eventos y errores estables. | M01–M11 y pruebas adicionales ejercitan el núcleo con un handler sintético instalado **sólo por el fixture**. El handler de la migración siempre devuelve `COMMAND_NOT_IMPLEMENTED`. No hay handlers de asignación, seña, venta o envío. |
| M1-04 y siguientes | No implementados por esta rama. | Wrappers/fences legacy, transferencia real, inbox, obligaciones, handoff, outbox, V1 adaptada, cierre de rutas antiguas, UI, cutover y rollback compuesto siguen diferidos y requieren autorización correspondiente. |

Los nombres de archivos de §25.3 eran propuestas para M1 completo. Esta entrega conserva `contracts.test.mjs` y las 26 pruebas originales de `foundation.integration.test.mjs`, y añade seguridad, instalación y esquema B con responsabilidades separadas. El contrato se implementa en `.mjs`, importado por Node, en lugar de los nombres preliminares `.ts`/`idempotency.ts`; no se certificó su ejecución en Deno. Las suites de negocio restantes conservan su responsabilidad futura.

## Requisitos 1–15 de la validación autorizada

Los nombres entre comillas son los títulos reales de subtests de `foundation.integration.test.mjs`. Sus prefijos M01–M15 identifican **estos quince mínimos**, no las fases M1-01–M1-15 del plan.

| # | Requisito | Prueba ejecutada y evidencia concreta | Estado actual / límite |
|---|---|---|---|
| 1 | Mismo command_id + intención: un resultado lógico | **“M01: same command_id and same intent have one logical result”**: compara evento original/replay y cuenta un efecto, receipt y evento; versión 1. | PASS-FOUNDATION. Un resultado del probe; no venta/asignación real. |
| 2 | Misma key + hash no duplica | **“M02: same idempotency key/hash with a new command UUID replays the original”**: ID canónico y eventos originales aunque cambien UUID de transporte y correlation. | PASS-FOUNDATION. El hash puro ya excluye command_id/key/correlation sin excluir la semántica. |
| 3 | Misma key + payload diferente: conflicto | **“M03: a changed payload under the same key conflicts without another effect”**: `IDEMPOTENCY_KEY_REUSED`; cardinalidad sin incremento. | PASS-FOUNDATION; PASS-PURO para vinculación del hash con payload, actor, scope, causa, política y versiones. |
| 4 | Versiones obsoletas: VERSION_CONFLICT | **“M04: stale aggregate/assignment versions reject before applying”**: prueba por separado `assignment_epoch` y `aggregate_version` obsoletos, y verifica rechazo sin efecto/evento. **GATE-VECTOR** prueba dependencia equivocada y **VERSION-EXHAUSTED** el techo numérico. | PASS-FOUNDATION. Las dos variantes se ejecutaron; no equivalen a una transferencia comercial concurrente. |
| 5 | Actor/rol nunca provienen del payload | **“M05: caller actor/role cannot be supplied in envelope or payload”**: entradas fabricadas rechazadas y actor del evento coincide con sesión. Pruebas puras **“actor, role, result, hash and authority never enter through envelope fields”** y **“closed payload prevents caller-supplied actor, owner, channel and operational handlers”**. | PASS-PURO; PASS-FOUNDATION. No prueba JWT/PostgREST real ni todos los servicios futuros. |
| 6 | Usuario inactivo rechazado | **“M06: inactive user cannot apply a command or recover an old replay”**: usuario inicialmente inactivo no crea receipt; desactivado después no obtiene eventos del replay. | PASS-FOUNDATION. Fixture `auth.uid()` local; no validación del emisor de tokens. |
| 7 | Scope ajeno rechazado | **“M07: foreign, unassigned and formerly owned scopes are denied without receipt disclosure”**: otro owner, owner NULL, exowner y colisión de command_id de otro actor. | PASS-FOUNDATION; PASS-PURO para forma/scope exactos. Cambio de owner del fixture es secuencial, no una prueba de transferencia de negocio. |
| 8 | Efecto/evento/receipt atómicos | **“M08: effect/event/receipt/version commit atomically and SQL hash matches the actual JS contract”**: compara cardinalidades, actor/owner al hecho y hash SQL con módulo real. **FAILPOINT** fuerza excepción tras DML sintético. | PASS-FOUNDATION. No hay outbox, seña, venta o handoff que puedan quedar certificados. |
| 9 | Crash antes de commit no deja parcial | **“M09: backend crash before COMMIT leaves no partial receipt/event/effect”**: termina un backend con transacción pendiente, verifica ausencia de efectos y reintenta. | PASS-FOUNDATION. Crash de sesión SQL, no fallo HTTP, proveedor o cluster completo. |
| 10 | Retry después de commit devuelve anterior | **“M10: retry after COMMIT from a fresh connection returns the committed result”**: conexión nueva conserva evento y efecto único. | PASS-FOUNDATION. No se simula respuesta del proveedor externo. |
| 11 | Dos sesiones no aplican dos veces | **“M11: two real sessions race on one command; observed lock wait, exactly one application”**: sesión A retiene commit; B debe aparecer esperando lock en `pg_stat_activity`; luego replay y efecto único. | PASS-FOUNDATION. Carrera del mismo comando; no dos ventas, último cupo, transferencia contra edición o dispatch. |
| 12 | Gates cerrados/no autoritativos | **“M12: default gates observe; no authoritative/quiescing state can be installed”** y **“STOCK-HOOK: even fixture-ready gates cannot activate the installed handler”**. | PASS-FOUNDATION. El fixture verificó primero el handler instalado cerrado, antes de reemplazarlo. |
| 13 | Recupero/avisos futuros no se activan | **“M13: future recovery/internal send purposes cannot become ready or authoritative”**. Prueba pura **“business and future sending commands are not enabled by the foundation contract”**. | PASS-PURO; PASS-FOUNDATION. No existe sender, RecoverySession ni planificador de avisos. |
| 14 | Seller sin acceso directo a tablas nuevas | **“M14: no API role can directly read/write new tables or execute the installed gateway”**: ACL de las seis tablas para anon/authenticated/service_role, membership owner, FORCE RLS y llamada real al gateway denegada. M15 ejecuta además un UPDATE real como seller. | PASS-FOUNDATION. No afirmar batería REST completa ni revocación de permisos legacy. |
| 15 | Nada nuevo concede canal IA al seller | **“M15: new conversation structure stays disabled/paused; seller cannot acquire channel authority”**: defaults cerrados, CHECK impide activación incluso al fixture privilegiado y UPDATE seller denegado. Contrato puro no admite comandos de canal/envío. | PASS-PURO; PASS-FOUNDATION. No certifica el cierre del takeover legacy: permanece fuera de esta rama y conserva su riesgo P0. |

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

Estas pruebas adicionales integran las 26 subpruebas originales ejecutadas y aprobadas en run05. Las 23 puras cubren además tipos numéricos, UUID, orden canónico, arrays con orden significativo, SHA-256 independiente, Unicode inválido, propiedades no JSON y límites de tamaño/profundidad.

## Requisitos 16–26: seguridad y concurrencia verificadas

Los prefijos S corresponden a los diez subtests de `security.integration.test.mjs`; un subtest puede cubrir varios requisitos relacionados. Todos alcanzaron PASS-FOUNDATION en run05.

| # | Requisito | Evidencia SQL ejecutada y límite |
|---|---|---|
| 16 | RLS con roles reales | S16/S19 cambia SESSION AUTHORIZATION a anon/authenticated/service_role y prueba SELECT/DELETE/gateway/SET ROLE denegados. S16/S17 otorga SELECT sólo en fixture y comprueba filtrado RLS para authenticated. No equivale a HTTP/REST. |
| 17 | FORCE RLS efectivo | S17 introduce una policy restrictiva temporal: el owner ve cero filas con FORCE, ve filas al quitar FORCE y vuelve a cero al restaurarlo, en las seis tablas. INSERT se rechaza por RLS. S16/S17 comprueba explícitamente que BYPASSRLS ignora RLS si además recibe ACL de tabla. |
| 18 | SECURITY DEFINER conserva actor sin ampliar DML | S18 verifica modos/owners/search_path y EXECUTE privados. S18/S26 instala guards que fallarían ante DML sobre profiles/leads sintéticos; el probe cerrado sigue rechazando. Los helpers devuelven actor/scope actuales y el runtime owner sigue sin SELECT/DELETE directo sobre legacy. S18/S25 demuestra que claims/GUC auxiliares falsificados no elevan la identidad autorizada. |
| 19 | Ownership/membership PostgreSQL 17 | S16/S19 comprueba atributos del owner, único principal postgres y ausencia de INHERIT/SET en todas las filas de membresía. SET ROLE falla para API y migrador al terminar. I01–I08 comprueban transferencias y cierre en éxito/error, usando migraciones intactas y ejecutor NOSUPERUSER. |
| 20 | Receipts terminales inmutables | S20/S21/S22 rechaza UPDATE y DELETE; compara el registro completo antes/después. DEFERRED-GUARD evita commits sin decisión. |
| 21 | Eventos append-only | S20/S21/S22 rechaza UPDATE/DELETE; DEFERRED-EVENT impide anexar evento a receipt rechazado. No es defensa contra un administrador que puede sustituir DDL. |
| 22 | TRUNCATE/DELETE/UPDATE no borran historia | Matriz S20/S21/S22 para receipts/events/policy, incluido TRUNCATE conjunto y CASCADE. Se conservan exactamente snapshots JSON y cardinalidades. |
| 23 | Locks gates/lead sin doble aplicación | M11 y CONCURRENT-CAS conservan efecto único. S23-GATE observa ShareLock pendiente y revalida el gate después de esperar; S23-LEAD observa el bloqueo real y revalida ownership cambiado antes de aplicar. No prueba todos los writers legacy futuros. |
| 24 | Deadlock/transitorio no duplica intención | S24 invierte deliberadamente el orden en un actor de fixture, exige SQLSTATE 40P01 real y reintenta la transacción completa. El resultado final conserva un efecto/receipt/evento y versión 1, cualquiera sea la víctima del detector. |
| 25 | Replay requiere derecho actual | M06/M07 niegan replay tras desactivación o transferencia y no revelan eventos. S23-LEAD amplía la verificación a una carrera bajo lock. No sustituye las futuras reglas comerciales de transferencia. |
| 26 | FoundationProbe instalado no muta negocio | STOCK-HOOK y S18/S26 exigen COMMAND_NOT_IMPLEMENTED con gates ready, cero efecto/evento/versionado y guards DML legacy. B08 conserva el handler instalado y ninguna fila comercial. El handler sintético se habilita sólo en A después de esa comprobación. |

## Instalación desde cero, parcial y con dependencias fallidas

Los nueve subtests I00–I08 aprobaron en un clúster propio que comenzó sin objetos M1. Ejecutaron los archivos originales con BEGIN/COMMIT y SESSION AUTHORIZATION postgres: no se retiraron límites transaccionales para forzar la prueba.

| Etapa probada | Resultado observado |
|---|---|
| I00–I02: cero y predecesores ausentes | No objetos/rol/gateway M1; 02/03 en orden incorrecto y 01 sin lead requerido fallan limpiamente. ROLLBACK no deja roles ni objetos parciales. |
| I03–I05: 01 y 01→02 | Cuatro tablas vacías con FORCE RLS y sin permiso API; gateway ausente. La migración 02 transfiere ownership y cierra SET/INHERIT/CREATE; reintentarla falla sin cambiar estado. |
| I06: 03 con dependencia ausente | El error revierte también memberships y CREATE temporales; el estado parcial anterior sigue cerrado. |
| I07–I08: instalación completa y repetición | Seis tablas vacías, policies/owners esperados, constraints e índices válidos, ocho triggers de aplicación nuevos incluidos dos diferidos. Repetir 03 falla sin alterar funciones ni capacidades. |

La capa B agrega nueve subtests sobre el esquema relevante capturado: compara catálogos y ACL/grantors, prueba la definición real de `auth.uid`, aplica cada archivo como postgres NOSUPERUSER y vuelve a comparar objetos legacy seleccionados y ausencia de datos. Mantiene owner runtime cerrado incluso con defaults públicos amplios. [schema-baseline-b.md](schema-baseline-b.md) conserva frontera y exclusiones: no replica todos los objetos, extensiones, locale ni servicios del proyecto.

## Relación honesta con los 155 casos A–K v2 (§25.4)

**Cobertura genérica parcial** significa una primitiva útil para ese caso, no su ejecución completa. A verificó las primitivas SQL en fixtures sintéticos y B verificó compatibilidad de instalación con la frontera de esquema observada. Los IDs de negocio conservan los límites de las tablas siguientes.

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
