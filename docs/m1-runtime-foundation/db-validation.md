# Validación real PostgreSQL — M1-01/02/03

Validación de la candidata `be507e866722168bae0dbcd847f93b45652333e7`, en la misma rama `feat/m1-runtime-foundation`. La decisión de certificación formal queda a cargo del usuario. No se avanzó a M1-04.

**Resultado:** 54 subpruebas PostgreSQL reales aprobadas: 26 originales + 10 de seguridad + 9 de instalación + 9 de schema relevante. El contador TAP total es 58 porque incluye cuatro tests padre; no son 58 casos independientes. Cero fallos, cancelaciones, skips o TODO. Pruebas puras: 23/23, sin aumento de cantidad ni cambios de contrato.

## Entorno y aislamiento acreditado

Se provisionó una VM Linux descartable local con QEMU 8.2.2, emulación TCG, 2 CPU y 2048 MiB; kernel Ubuntu 6.8.0-138-generic; PostgreSQL **17.6** sin modificar, Node **24.19.0**, Python **3.12.3** y libpq. El cluster corre como UID/GID65534. No se utilizó ningún proyecto Supabase remoto ni el QA existente. Los binarios proceden del snapshot Ubuntu 20260828 y del paquete `@embedded-postgres/linux-x64@17.6.0-beta.15`; versiones y SHA-256 están en [toolchain.json](evidence/db-validation/toolchain.json).

El host original sólo permitía UID0 y rechazaba AF_UNIX. La VM resuelve esa limitación con un kernel invitado real y usuario no-root; no se parcheó PostgreSQL ni se falsificó su identidad. Las descargas se extrajeron como archivos; no se instalaron servicios ni se cambió el aislamiento del host.

Evidencia independiente del enunciado del runner:

- QEMU arrancó con `-nodefaults -nic none`, sin discos, puertos reenviados ni mounts del host. La única interfaz del invitado fue `lo`; tabla de rutas vacía.
- Sólo entraron un initramfs de runtimes y un paquete de fuente permitido con hashes: tests, fixtures, contrato y las tres migraciones. No entraron `.env`, `.git`, credenciales, archivos del CRM ajenos al alcance ni datos reales.
- Entorno inicial del invitado: `LANG`, `LC_ALL`, `PATH`; entorno de tests reconstruido por allowlist. Archivos de password/service vacíos, sin DSN remoto ni token Meta/service_role productivo.
- PostgreSQL con `listen_addresses=''`, socket Unix privado, UID65534 y launcher seccomp que deniega sockets IP. Se probaron los rechazos de egress.
- No se instalaron cron, pg_net, Edge Functions, sender, Apps Script ni integración de clientes. La fixture B sólo lleva definiciones; sus tablas permanecen vacías.
- Cada suite creó y destruyó su propio cluster. VM apagada y directorio temporal eliminado; `guest_destroyed=true`, salida QEMU y runner 0.

La evidencia final está en [database.json](evidence/db-validation/final-all/database.json), [vm.json](evidence/db-validation/final-all/vm.json) e [isolation.json](evidence/db-validation/final-all/isolation.json). El manifest VM contiene los hashes del código probado y los argumentos efectivos. El ejecutor valida esos hashes y la lista de suites; no infiere PASS solamente del exit code.

## Migraciones y defecto demostrado

Se aplicaron desde cero y en orden, exclusivamente en los clusters descartables:

1. `20260917154844_m1_runtime_authority_foundation.sql` — sin cambios respecto de la candidata.
2. `20260917154854_m1_private_capabilities.sql` — corrección de dos grants.
3. `20260917154905_m1_command_receipts_events.sql` — corrección de dos grants.

La primera ejecución real, run04, instaló PSQL-01 y falló PSQL-02 con **SQLSTATE 0LP01: ADMIN option cannot be granted back to your own grantor**. PostgreSQL 17 concede automáticamente ADMIN al creador CREATEROLE mediante el grantor inicial. Volver a otorgar ADMIN al mismo creador crea un ciclo administrativo prohibido. Era un defecto real de las migraciones, no un fallo comercial.

La corrección elimina únicamente cuatro `ADMIN TRUE` redundantes. Conserva las membresías temporales SET/INHERIT necesarias para DDL y el cierre final `SET=false`, `INHERIT=false`. El ADMIN original permanece sólo para el migrador confiable postgres. PostgreSQL puede registrar varias filas para un miembro con grantors distintos; las pruebas verifican tanto las opciones individuales como la capacidad efectiva. No se revocaron permisos legacy ni se concedió acceso a usuarios API.

[La ejecución fallida](evidence/db-validation/failure-0LP01/database.json) se preserva junto con el [estado BLOCKED de la candidata](evidence/db-validation/previous-candidate-blocked.json). Los intentos previos de arranque de QEMU encontraron rutas de módulos/ROM incompletas y fueron corregidos en el harness; no habían iniciado PostgreSQL ni producido una prueba funcional.

Tras el ajuste, run05 pasó A/seguridad/instalación; run06 pasó B. Run07 repitió las cuatro suites sobre el **mismo snapshot final de código**, con cuatro clusters vacíos. Los SHA-256 coinciden con el árbol entregado. El control de diff detecta un único espacio final en el cuerpo capturado de `auth.uid` (`bootstrap.sql:695`); se conserva deliberadamente para que la definición y su hash coincidan con el catálogo observado. No es una modificación del objeto legacy. No se sustituyeron assertions por regex o por JavaScript equivalente: los resultados DB proceden de consultas reales y conexiones concurrentes de libpq.

## Instalación, permisos y estado resultante

La suite de instalación ejecuta archivos SQL íntegros, incluidos BEGIN/COMMIT, como `postgres NOSUPERUSER`. Verifica dependencias y orden, rollback de los intentos fallidos, instalación parcial cerrada después de PSQL-01 y PSQL-02, índices válidos, constraints, triggers, functions, policies, owners y grants. Reaplicar PSQL-03 falla limpiamente sin alterar lo instalado. `migrations_applied=[]` en instalación/B significa que la suite controla el DDL, no que se hayan omitido las migraciones.

Las seis tablas nuevas pertenecen a `crm_runtime_owner`, tienen RLS y FORCE RLS, y carecen de acceso directo para PUBLIC/anon/authenticated/service_role. El gateway está sin EXECUTE para usuarios API. El owner es NOLOGIN/NOSUPERUSER/NOBYPASSRLS; no tiene CREATE final en public/private ni DML sobre profiles/leads. Sólo postgres conserva membership administrativa, sin SET/INHERIT final. Ningún seller recibe autoridad de canal.

Se probó FORCE RLS sobre el owner con una policy restrictiva temporal y un control NO FORCE dentro de una transacción revertida. Se distinguió RLS de ACL y del BYPASSRLS de service_role: FORCE no elimina BYPASSRLS; los objetos instalados se protegen además retirando grants. Dos helpers de lectura/lock son SECURITY DEFINER postgres, con search_path fijo vacío; las pruebas comprueban actor y scope derivado. No se transformaron en ejecutores DML ni se otorgaron capacidades legacy al owner nuevo.

`FoundationProbe` instalado sigue rechazando `COMMAND_NOT_IMPLEMENTED`, incluso con gates listos en fixture. Únicamente A reemplaza el stub por un efecto sintético, después de probar el cierre instalado. B no reemplaza ese handler. No hay mutación comercial, integración frontend, nuevo sender, worker ni API de canal.

## Pruebas originales: resultados completos

Los 26 títulos y las 99 assertions originales se conservaron; en ese archivo sólo se incorporó escala de timeout para emulación, sin debilitar condiciones.

| # | Subprueba original ejecutada | Resultado |
|---|---|---|
| 1 | `ISOLATION: PostgreSQL17, Unix socket, restricted migrator and six private tables` | PASS |
| 2 | `M14: no API role can directly read/write new tables or execute the installed gateway` | PASS |
| 3 | `M12: default gates observe; no authoritative/quiescing state can be installed` | PASS |
| 4 | `M13: future recovery/internal send purposes cannot become ready or authoritative` | PASS |
| 5 | `M15: new conversation structure stays disabled/paused; seller cannot acquire channel authority` | PASS |
| 6 | `STOCK-HOOK: even fixture-ready gates cannot activate the installed handler` | PASS |
| 7 | `M01: same command_id and same intent have one logical result` | PASS |
| 8 | `M02: same idempotency key/hash with a new command UUID replays the original` | PASS |
| 9 | `M03: a changed payload under the same key conflicts without another effect` | PASS |
| 10 | `M04: stale aggregate/assignment versions reject before applying` | PASS |
| 11 | `M05: caller actor/role cannot be supplied in envelope or payload` | PASS |
| 12 | `M06: inactive user cannot apply a command or recover an old replay` | PASS |
| 13 | `M07: foreign, unassigned and formerly owned scopes are denied without receipt disclosure` | PASS |
| 14 | `M08: effect/event/receipt/version commit atomically and SQL hash matches the actual JS contract` | PASS |
| 15 | `M09: backend crash before COMMIT leaves no partial receipt/event/effect` | PASS |
| 16 | `M10: retry after COMMIT from a fresh connection returns the committed result` | PASS |
| 17 | `M11: two real sessions race on one command; observed lock wait, exactly one application` | PASS |
| 18 | `FAILPOINT: exception after synthetic DML rolls back every command effect` | PASS |
| 19 | `GATE-VECTOR: changing one domain epoch does not borrow authority from the other` | PASS |
| 20 | `VERSION-EXHAUSTED: safe integer ceiling cannot overflow into an imprecise JS version` | PASS |
| 21 | `BUSINESS-DEDUPE: different keys cannot duplicate the synthetic operation identity` | PASS |
| 22 | `DEFERRED-GUARD: evaluating receipts cannot commit` | PASS |
| 23 | `APPEND-ONLY: terminal receipts/events/policy reject mutation and TRUNCATE` | PASS |
| 24 | `DEFERRED-EVENT: an event cannot later attach to a rejected receipt` | PASS |
| 25 | `CONCURRENT-CAS: distinct intents at one version produce one effect and one conflict` | PASS |
| 26 | `FINAL-INVARIANTS: no evaluating receipt/orphan event; new channel authority remains closed` | PASS |

El crash M09 termina un backend real mediante `pg_terminate_backend` antes de COMMIT: prueba rollback de la transacción y retry, no un corte eléctrico del almacenamiento. M10 usa una conexión nueva tras commit. Las carreras esperan locks observados en PostgreSQL. La prueba adicional S24 induce un deadlock SQLSTATE40P01 real y verifica que la intención sólo produzca un efecto tras completar/reintentar la transacción.

## Nuevas pruebas: resultados completos

Se agregaron 28 subpruebas, distribuidas en tres suites. El contrato y las 23 pruebas puras no cambiaron.

### `installation.integration.test.mjs`

| Subprueba ejecutada | Resultado |
|---|---|
| `I00: fresh relevant schema only, with no M1 role, gateway or tables` | PASS |
| `I01: 02 and 03 without predecessors fail and leave no role, schema grant or object` | PASS |
| `I02: 01 preflight rejects an absent required legacy relation before creating anything` | PASS |
| `I03: 01 alone commits four empty tables, FORCE RLS and no API permission` | PASS |
| `I04: 03 after only 01 fails without making the partial installation usable` | PASS |
| `I05: 02 transfers only new ownership and removes temporary CREATE/SET/INHERIT` | PASS |
| `I06: a dependency failure in 03 rolls back its temporary membership and schema grants` | PASS |
| `I07: 01->02->03 commits six closed tables with validated constraints/indexes and expected trigger graph` | PASS |
| `I08: accidentally applying 03 twice fails transactionally, without changing the installed state` | PASS |

### `schema-baseline-b.integration.test.mjs`

| Subprueba ejecutada | Resultado |
|---|---|
| `B00: source integrity and real bootstrap identity are prerequisites` | PASS |
| `B01: observed tables, columns, constraints, indexes, triggers, policies, functions, sequences and enum match` | PASS |
| `B02: selected roles, membership grantors, schemas and default ACLs match` | PASS |
| `B03: captured auth.uid implementation honors real JWT claims precedence and malformed claims` | PASS |
| `B4: 20260917154844_m1_runtime_authority_foundation.sql applies verbatim as postgres NOSUPERUSER and preserves observed objects` | PASS |
| `B5: 20260917154854_m1_private_capabilities.sql applies verbatim as postgres NOSUPERUSER and preserves observed objects` | PASS |
| `B6: 20260917154905_m1_command_receipts_events.sql applies verbatim as postgres NOSUPERUSER and preserves observed objects` | PASS |
| `B07: six empty runtime tables are closed despite broad observed public-schema default grants` | PASS |
| `B08: installed handler remains closed and no legacy capabilities leak to the runtime owner` | PASS |

### `security.integration.test.mjs`

| Subprueba ejecutada | Resultado |
|---|---|
| `S16/S19: installed owners, membership options and real API denials` | PASS |
| `S18: definer/invoker ownership and private helper EXECUTE are explicit` | PASS |
| `S18/S26: installed probe derives actor through read/lock helpers and cannot mutate legacy` | PASS |
| `S20/S21/S22: UPDATE, DELETE and TRUNCATE cannot rewrite or remove committed history` | PASS |
| `S17: FORCE RLS filters the NOLOGIN table owner; disabling FORCE changes the result` | PASS |
| `S16/S17: RLS still denies an ordinary role with fixture SELECT; BYPASSRLS is not falsely certified` | PASS |
| `S18/S25: spoofed auxiliary claims do not replace the active profile or current owner` | PASS |
| `S23-GATE: an in-flight gate change is awaited and rechecked before any effect` | PASS |
| `S23-LEAD/S25: current ownership is read under a real lead lock after waiting` | PASS |
| `S24: a real PostgreSQL deadlock and full transaction retry cannot duplicate an intent` | PASS |

## Cobertura de los 26 mínimos de esta autorización

| Mínimos del usuario | Evidencia real |
|---|---|
| 1–15 | M01–M15 de foundation; incluye actor/scope, versiones, atomicidad, crash/retry, concurrencia, cierre de gates y denegación seller |
| 16 | S16/S19, S16/S17, B07: roles reales y rechazo de acceso |
| 17 | S17: control FORCE RLS/NO FORCE y distinción BYPASSRLS |
| 18 | S18, S18/S26, S18/S25: actor, ownership, SECURITY DEFINER/INVOKER y DML restringido |
| 19 | I05/I07, S16/S19 y B00/B02/B5/B08: ownership y memberships PG17 |
| 20–22 | APPEND-ONLY, DEFERRED-GUARD/EVENT, S20/S21/S22: receipts terminales y eventos protegidos de UPDATE/DELETE/TRUNCATE |
| 23 | M11, CONCURRENT-CAS, S23-GATE y S23-LEAD: espera/revalidación y una aplicación |
| 24 | S24: deadlock real40P01, rollback/retry de intención y no duplicación |
| 25 | M06/M07 y S18/S25/S23-LEAD: replay sujeto a usuario activo y scope actual |
| 26 | STOCK-HOOK, S18/S26 y B08: stub instalado incapaz de mutación comercial |

La correspondencia con el Plan y casos A–K v2 se conserva en [traceability.md](traceability.md). Se certifica evidencia de las primitivas probadas; ningún caso comercial completo ni handler futuro obtiene PASS por analogía.

## Diferencias entre A y B

| Aspecto | A mínimo | B schema relevante observado |
|---|---|---|
| Datos | Usuarios/leads/efectos totalmente sintéticos | Cero filas de Auth/CRM; ninguna copia de usuarios, leads, mensajes o contadores de secuencias |
| Auth | Función mínima para claim sub | Definición real de auth.uid: sub, fallback JSON, precedencia y error de claim malformado |
| Rol inicial | m1_test_admin | supabase_admin OID10 observado; postgres no es superusuario |
| Schema | Dependencias mínimas y tablas de prueba | 29 tablas,462 columnas,237 constraints,149 índices,40 triggers,56 policies,42 funciones,5 secuencias y enum app_role |
| Propósito | Comandos sintéticos, invariantes, permisos y concurrencia | Compatibilidad del DDL, permisos reales observados y preservación del catálogo seleccionado |
| Handler | Fixture sintética tras verificar cierre | Stub original cerrado en todo momento |

B compara catálogos antes/después de **cada** migración, incluidos owners/ACL y cuerpos de funciones. Los objetos seleccionados coinciden con las capturas y no cambian al instalar M1. Se reprodujeron los defaults amplios observados del schema public y se comprobó que no abrieran las nuevas superficies.

B tiene límites explícitos: capturas separadas, no snapshot atómico; nombre/locale local, sin equivalencia ICU; excluye objetos de plataforma no dependientes, grants CREATE de base de roles exclusivos ETL/storage y extensiones externas no requeridas por esta frontera. No se instalaron pg_cron/pg_net/vault ni se invocó negocio legacy. Detalle y procedencia: [schema-baseline-b.md](schema-baseline-b.md).

## BLOCKED y riesgos pendientes

**Ninguna de las 26 DB originales sigue BLOCKED.** A, seguridad, instalación y B relevante terminaron PASS. Permanecen sin certificar/BLOCKED: equivalencia completa de schema/plataforma Supabase; locale productivo; PostgREST/GoTrue y JWT firmados; bindings/configuración desplegada; integración con writers legacy, carga real y aislamiento de rollout. No se usó A para cubrir esas ausencias ni se incorporaron al conteo PASS.

Riesgos concretos ratificados o precisados:

1. La semántica de ADMIN/membership de PG17 era incompatible con el grant redundante y quedó corregida. El test de instalación protege esta regresión; otra versión/rol migrador requiere validación propia.
2. Privilegios por defecto amplios y rol de bootstrap real son condiciones relevantes que el fixture A no representaba por completo. B los reproduce y comprueba cierre. No equivale a certificar todo objeto futuro creado por otros owners.
3. Las capturas B no son atómicas ni completas. Antes de una instalación/cutover futuro hay que revalidar drift y dependencias actuales; esta prueba no autoriza deploy.
4. Los locks conservadores pueden contender con writers legacy. S24 prueba recuperación de una carrera controlada; no prueba rendimiento ni que los writers actuales adopten las versiones/fencing. Eso sigue fuera de M1-03.
5. Herramientas binarias externas se identifican por origen/versión/hash. No se incluyen binarios grandes en Git; el harness exige artefactos revisados y locales, sin descarga o conexión remota automática.
6. Las fixtures con privilegios sintéticos son exclusivamente de pruebas. No deben instalarse junto con migraciones de producto. El paquete nuevo no introduce un camino para activarlas por payload o flags.
7. BL-06 P0 persiste: capacidad backend potencial seller en la vía humana legacy. Nueve eventos históricos se conservan sin atribuirlos a vendedores, envíos reales, uso incorrecto o inventario exhaustivo de consumidores.

## M0 y superficies excluidas

BL-01 a BL-08 permanecen **ABIERTOS**, con BL-06 **P0**. Se precisó sólo la evidencia del laboratorio local de BL-08; el bloqueo completo de rollout permanece. Vercel/alias, Apps Script, consumidores privilegiados, credenciales/productor/dispatcher, trabajo legacy en vuelo y configuración efectiva no quedaron cerrados por estas pruebas. [m0-status.md](m0-status.md) conserva cada bloqueo y la evidencia histórica fechada.

No se modificó producción: las consultas remotas fueron SELECT de catálogo; no se aplicó ninguna migración remota, no hubo DML productivo ni RPC comercial, no se copiaron datos personales, no se desplegó ni envió WhatsApp. No se modificaron archivos legacy. No hubo push, PR, merge, Vercel, cambio de token/secrets, Edge deployment ni M1-04.

El rollback de laboratorio consistió en eliminar clusters y VM descartables. No existe operación productiva que revertir. No se agrega migración down destructiva ni se elimina historia.
