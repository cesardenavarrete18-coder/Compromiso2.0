# M1-01/02/03 — fundación inactiva

Implementación local sobre `main` verificado `e3675903ade49080a575f5d19f61b243ad2aa948`, rama `feat/m1-runtime-foundation`. Referencia: **Plan ejecutable M0–M1 — Grupo Sur / CDN — v1**, aprobado el 17/09/2026. La autorización posterior permite estos tres pasos con M0 todavía abierto; no autoriza instalar, activar, abrir PR, hacer merge ni avanzar a M1-04.

Este paquete no modifica el CRM productivo. No instala un handler comercial, sender, worker, cron, webhook, interfaz, inbox, outbox, handoff ni obligación. No cambia permisos, triggers ni funciones legacy. Las migraciones no se aplicaron en Supabase remoto. El estado de M0 y el P0 de capacidad legacy seller sobre WhatsApp IA siguen separados de las pruebas de esta rama.

## Lectura del paquete

- `baseline.json`: dependencias mínimas observadas y hashes de evidencia; manifest **parcial**, no certificado de cierre M0.
- `m0-status.md` y `evidence/m0-*.json`: recaptura en lectura y bloqueos pendientes.
- `traceability.md`: requisitos de esta autorización, pruebas concretas y límites respecto de los casos A–K v2 completos.
- `verification.json`: resultado de la ejecución local aislada y hashes de los artefactos probados.
- `../../tests/m1`: contratos puros, fixtures sintéticos y harness PostgreSQL.

## Migraciones y objetos

| Archivo | Objetos nuevos |
|---|---|
| `20260917154844_m1_runtime_authority_foundation.sql` — PSQL-01 | `private.crm_runtime_policies`, `crm_runtime_gates`, `crm_conversation_state`, `crm_lead_runtime`; checks, FK, índices, cierre RLS/ACL inicial y guards de policy inmutable |
| `20260917154854_m1_private_capabilities.sql` — PSQL-02 | Rol `crm_runtime_owner`, transferencia de ownership de objetos nuevos, policies exclusivas del owner y defaults cerrados de ese owner |
| `20260917154905_m1_command_receipts_events.sql` — PSQL-03 | `private.crm_command_receipts`, `crm_events`; gateway `public.crm_submit_command(jsonb)`, validación/canon/hash, núcleo transaccional, lectores mínimos de actor/scope, stub y guards de integridad |

Los nombres de archivo fueron generados por **Supabase CLI 2.117.0**. Cada migración es transaccional. No hay filas iniciales, backfills, reemplazos de objetos de negocio ni revocaciones legacy. Las FK son sobre tablas nuevas vacías y usan `RESTRICT`; agregan dependencias referenciales que deberán revisarse antes de poblarlas. No hay borrado ni anonimización históricos en esta entrega.

### Permisos desde instalación

| Principal/superficie | Estado instalado |
|---|---|
| `PUBLIC`, `anon`, `authenticated`, `service_role` | Sin permisos directos sobre las seis tablas, sin EXECUTE del gateway ni de helpers nuevos |
| Seller, supervisor, admin, admventas | Ninguna habilitación del nuevo gateway por ser un rol de aplicación; sus JWT usan el mismo rol DB `authenticated` |
| `crm_runtime_owner` | NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS; owner de objetos nuevos; policy RLS exclusiva; sin permisos de tabla legacy |
| `postgres` | Administrador confiable de migraciones. Conserva ADMIN sobre el rol nuevo, con INHERIT=false y SET=false al terminar. No cambia sus atributos globales |
| Tablas nuevas | ENABLE y FORCE RLS. Seis policies owner-only; no policy para seller, authenticated ni service_role |
| Canal | CHECK de conversación exige disabled/paused y ningún turno activo. No existe estado `human`, API de takeover ni permiso seller nuevo |
| Gates | Default observe; sólo observe/ready/paused. Imposible authoritative/quiescing. Recupero y aviso interno tampoco admiten ready |

`BYPASSRLS` no reemplaza permisos de tabla. El harness está preparado para probar un ejecutor `postgres` no-superusuario, con CREATEROLE/BYPASSRLS; esa ejecución permanece BLOCKED. Se conceden temporalmente membership y CREATE sólo para DDL de objetos nuevos, dentro de la transacción; se retiran al finalizar. No se crea LOGIN, contraseña o credencial de worker.

Dos helpers de SQL fijo, `private.crm_foundation_actor(boolean)` y `private.crm_foundation_scope(uuid)`, conservan SECURITY DEFINER de `postgres`, `search_path=''` y EXECUTE sólo para `crm_runtime_owner`. Derivan `auth.uid()` internamente y leen/bloquean perfiles/leads. No escriben legacy. Esta excepción acotada evita agregar permisos UPDATE o policies legacy para obtener `FOR SHARE`. Los otros helpers pertenecen al owner cerrado; el guard diferido usa SECURITY DEFINER de ese owner únicamente sobre receipts/events nuevos.

## Contrato instalado: `FoundationProbe`

Es una sonda de infraestructura reservada, no una operación comercial. El único handler instalado lanza siempre `P0103 / COMMAND_NOT_IMPLEMENTED`. No hay modo, flag, GUC, payload o policy que lo convierta en handler activo. La sustitución por efecto sintético y el grant al caller aparecen exclusivamente bajo `tests/m1/fixtures` y sólo los carga el harness aislado después de verificar el cierre original.

Envelope schema 1, con propiedades adicionales rechazadas:

| Campo | Contrato |
|---|---|
| `command_id` | UUID; identidad estable del comando |
| `command_type` | Sólo `FoundationProbe`; toda operación real se rechaza |
| `idempotency_key` | 1–128 caracteres ASCII `[A-Za-z0-9._:-]`; no sustituye la deduplicación de intención de cada futuro handler |
| `scope` | Exactamente `{lead_id: UUID}` |
| `expected_versions` | `lead_aggregate_version`, `assignment_epoch` y dos dependencias: command_crm + command_owner, cada una con scope/epoch/revision/contract_version/policy_version |
| `payload` | Exactamente `{operation_id: UUID, value: entero seguro}`; sin significado comercial |
| `policy_version_seen` | Versión publicada; el namespace project_ref proviene del recurso/policy del servidor |
| `causation` | Opcional/null o `{event_id: UUID}` de mismo proyecto/lead |
| `correlation_id` | UUID opcional; default command_id; la correlación original se conserva en replay |

El actor proviene de `auth.uid()` y de `profiles` actual/activo. Se rechazan actor, role, owner, result, hash y capacidades suministradas por el cliente. Dentro del fixture, seller sólo puede probar su lead actual; admin/supervisor tienen el scope comercial previsto. Esto **no concede canal**, y no habilita el gateway instalado a ningún usuario.

La función retorna JSON `applied`, `rejected` o `replayed` (este último incluye `original_status`). Una decisión aplicada incluye IDs de recurso/evento y versiones. `obligations` y `effects` son arrays vacíos en esta fundación. Un fallo transitorio/inesperado aborta SQL y revierte la transacción; no se convierte en una decisión negativa definitiva.

### Idempotencia, locks y versiones

El servidor calcula SHA-256 de la intención JSON normalizada: actor, schema/type, scope, versiones, payload, causa y policy. No acepta un hash del caller. La clave canónica ordena claves y normaliza UUID/enteros; el orden de las dos dependencias se normaliza. `command_id`, idempotency_key y correlation_id no integran ese hash, pero la identidad del receipt verifica command ID/key/actor/scope. Cambiar la key bajo el mismo command_id es conflicto. Mismo key/hash con otro ID recupera el ID canónico; no crea un segundo resultado.

La unicidad se aplica tanto a command_id como a `(project_ref, actor_subject, command_type, scope_key, idempotency_key)`. Versiones observadas y gates se comparan sólo al aplicar una intención nueva. Replay revalida actor/scope actuales y recupera la decisión anterior aunque hayan cambiado gates/versiones; no reintenta un rechazo con una intención modificada. Para corregir un rechazo se requiere nueva intención, command_id y key.

Orden de locks: receipt → conjunto de gates → perfil → lead runtime → lead. Resolver gates incluye el más específico antes del global, y registra el vector real. Un `LOCK TABLE ... IN SHARE MODE` protege también la ausencia de un gate más específico. Es deliberadamente conservador para esta fundación inactiva y **no certifica capacidad de carga del futuro runtime**. Los writers legacy no siguen aún este orden ni elevan estas versiones; falta M1-04 y el cierre M0 antes de usarlo como autoridad.

Dentro de una transacción: efecto sintético → incremento CAS/version → evento `FoundationProbeApplied` → receipt terminal. Un receipt `evaluating` no puede hacer commit. `applied` exige evento; `rejected` no admite evento, incluso agregado después. Eventos y receipts terminales no se actualizan/borran; TRUNCATE está bloqueado. La suite propone verificar atomicidad real con abort/terminación de sesión y reintentos en PostgreSQL local. **Ejecución BLOCKED en este entorno antes de initdb; no se certifica esa propiedad todavía.**

### Errores estables

Validación/autorización: `INVALID_ENVELOPE`, `COMMAND_METADATA_REQUIRED`, `UNSUPPORTED_COMMAND`, `INVALID_SCOPE`, `INVALID_VERSIONS`, `INVALID_PAYLOAD`, `INVALID_CAUSATION`, `AUTHENTICATION_REQUIRED`, `ACTOR_INACTIVE`, `FORBIDDEN_SCOPE`.

Decisión/versionado: `POLICY_VERSION_CONFLICT`, `RUNTIME_STATE_REQUIRED`, `WRITER_FENCED`, `VERSION_CONFLICT`, `VERSION_EXHAUSTED`, `IDEMPOTENCY_KEY_REUSED`, `COMMAND_NOT_IMPLEMENTED`, `DUPLICATE_INTENT` (sólo fixture/contrato reservado).

La validación o autenticación fallida antes de admitir el comando no genera receipt. Los rechazos admitidos quedan terminales. Fallos internos de integridad/SQL se propagan; el caller debe distinguirlos de los códigos de decisión. No se implementan aún reintentos de red, observabilidad de frontend ni interpretación HTTP/PostgREST de estos resultados.

## Ejecutar pruebas sin producción

Pruebas puras, sin paquetes externos:

```bash
node --test tests/m1/contracts.test.mjs
```

Integración: Linux x86_64, Python 3, Node 24, compilador C y árbol local PostgreSQL 17 con `bin/postgres`, `initdb`, `pg_ctl` y `lib/libpq.so.5*`. El runner no tiene modo remoto, no descarga dependencias, no admite DSN externo y no reutiliza una DB existente.

```bash
python3 tests/m1/harness/run-local.py \
  --pg-root /ruta/al/postgresql-local \
  --report /tmp/m1-foundation-verification.json
```

El runner crea un cluster descartable, copia sólo tests/contrato/migraciones y usa fixtures sin clientes reales. `listen_addresses=''`, socket Unix privado, entorno por allowlist, PGPASSFILE/PGSERVICEFILE vacíos y launcher seccomp heredado bloquean sockets de red. Las pruebas comprueban la denegación de red y que no se heredaron secretos. No se levanta frontend ni se importa código de Meta/WhatsApp. No existe proveedor emisor en este paso: intentar egress es un error del harness, no un stub que acepte envíos.

La evidencia del intento se conserva en `verification.json`. **BLOCKED:** el namespace del contenedor sólo representa UID/GID 0; cambiar a un usuario no-root falla y PostgreSQL no permite iniciar como root. Además, el runtime rechaza crear sockets Unix aun sin el filtro propio. No se aplicó ninguna migración local ni se ejecutó la suite DB. Tampoco se certifican la reconstrucción completa de la DB productiva, PostgREST/Auth real, Edge/Deno, RLS legacy, Vercel, navegador o Meta. El harness queda preparado para un host aislado que admita usuario sin privilegios.

## Diferencias explícitas respecto del plan

1. Manifest M0 parcial: la autorización permite fundaciones inactivas aun con BL abiertos; no equivale a cumplir el criterio global de M1-01 ni a cerrar M0.
2. `.mjs` y Node sin transpilar sustituyen la distribución `.ts`/`idempotency.ts` propuesta. Contrato importable, sin incorporación a las Edge actuales. No se certificó Deno.
3. Registry acotado a FoundationProbe; commands comerciales/scopes de conversación todavía ausentes. El handler aplicado existe sólo como fixture.
4. Gates y conversación tienen restricciones más fuertes que el modelo final. Futura activación exige una migración/autorización independiente; no un flag.
5. Lectores mínimos legacy SECURITY DEFINER postgres y membership DDL temporal, justificados arriba; no grants de tabla legacy al rol nuevo.
6. FK históricas `RESTRICT`, sin contrato de anonimización implementado. La política hash usa representación PostgreSQL `jsonb::text`, distinta del canon de hash de comando; ambas se nombran explícitamente.
7. Locks conservadores del conjunto de gates; optimización y pruebas con writers reales quedan pendientes.
8. Harness usa PostgreSQL 17.6 real por libpq sobre socket Unix y fixture mínimo, sin Docker ni stack Supabase completo. No afirma probar adaptadores/productores no implementados.

## Riesgos y rollback del alcance

| Riesgo | Contención / reversión permitida |
|---|---|
| Instalación accidental en entorno conectado | Esta rama no instala ni publica. Verificar entorno y aprobación antes de cualquier futura ejecución; no agregar seed, grants ni workers |
| Dependencias FK/catalog locks futuros | Revisar baseline efectivo y ventana antes de instalar. No poblar ni backfill aquí |
| Helper privilegiado read/lock | SQL fijo, search_path vacío, EXECUTE privado, pruebas actor/scope. No convertirlo en ejecutor genérico |
| Presión de locks o deadlock con writers legacy | No autoritativo ni llamado por legacy. Futuro fencing exige pruebas propias; un deadlock debe abortar/reintentar la misma intención |
| Uso erróneo de fixtures | Nunca desplegar `tests/m1/fixtures`; no están bajo migrations/functions. El runner prueba cierre instalado antes de reemplazar el stub |
| P0 seller canal sigue en producción | Mantener gate de cutover bloqueado; esta fundación no elimina ni amplía la ruta existente |
| Rollback elimina historia | No hacer DROP de receipts/events con datos. En entorno futuro, cerrar entrada/ejecución y conservar historia; regresar sólo a contratos compatibles |

En esta entrega el rollback operativo es innecesario: sólo existen archivos/commits locales; el cluster de prueba ni siquiera llegó a iniciarse. No se incluye migración down destructiva. **Detención obligatoria en M1-03.**
