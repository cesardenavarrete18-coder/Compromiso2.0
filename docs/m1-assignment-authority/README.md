# M1-04A — guarda restrictiva y Assignment/Transfer, entrega de laboratorio

Fecha: 18/09/2026. Rama local: `feat/m1-runtime-foundation`. Commit de implementación: `364f28b78e12be8b59b8d65444037dd149c644f8`. HEAD inicial de esta autorización: `ef4b59b86467f3c29064e02f3cf22127a2a20f97`. Fundación certificada anterior: `292e1f8a435a07d104e990b129707fbfffc1a795`.

**La guarda y los tres comandos están implementados como candidatas cerradas y validados en PostgreSQL 17.6 aislado.** Esta entrega no declara M0 completado, no habilita cutover ni modifica autoridad productiva. La certificación formal de M1-04A queda a decisión del usuario. No se avanzó a M1-04B.

## A. Validación de la guarda restrictiva

La adopción se representa en `private.crm_assignment_adoptions`: hecho append-only por lead, con operation ID único, timestamp de servidor, executor real, scope, gate revision/epoch, contrato, policy, manifest y motivo. Exige una operación técnica cerrada de `session_user=postgres` contra un gate explícito authoritative/versionado del lead. No basta runtime metadata ni el gate solo. No se admite una afirmación de adopción del caller.

Antes de la adopción, el seller owner activo conserva el permiso legacy. Después, ni cambio de owner, ni acuse, ni pausa ni retry recuperan el permiso. La rama admin/supervisor permanece intacta. La denegación no depende de cambiar channel_authority/dialogue_policy/authority_epoch. La RPC directa de modo toma un lock del lead antes de autorizar; se rechaza el snapshot mutante anterior a la adopción. Lecturas READ ONLY siguen funcionando.

Resultados: **16/16 pruebas de prerrequisito** con A sola y **23/23 permisos obligatorios** con A+B y comandos reales. Se probaron helper, RPC `set_whatsapp_conversation_mode`, RLS de controls/events, GUC/header/payload falsificados, usuario inactivo, ausencia de grants seller, owner/exowner/retorno y pausa/rollback. [Casos individuales y resultados](test-results.md).

No se modificó ni ejecutó `whatsapp-human-message`; se probaron las precondiciones DB que hoy necesita la ruta humana por ownership. No hubo fetch a Meta, credenciales ni mensajes. No se certifica una petición Edge que ya estuviera autorizada antes del cutover: BL-06 sigue P0.

## B. Implementación y validación de Assignment

Implementados `AssignLead`, `TransferLead` y `AcknowledgeLeadAssignment` con envelope cerrado, actor derivado, gates explícitos, CAS, recibos idempotentes, eventos/versiones y capacidad interna vinculada a receipt+xid+backend. Gateway sin EXECUTE para roles API por instalación. La prueba lo abre sólo en su fixture.

Transfer cambia owner/by y responsabilidad futura; conserva assigned_at, CRM, agenda, entrevista, seña, fecha/importe, protocolo/IDs, tareas/actores/timestamps, playbook, presupuestos, datero, solicitud de venta, Recall y canal. Incrementa assignment_epoch y aggregate_version una vez. El acuse no cambia owner, assigned_at, protocolo ni epoch de Assignment y no es handoff. Assign inicial no crea ciclo/protocolo: exige elegibilidad nueva explícita.

Los **27/27 casos obligatorios** pasaron en sesiones PostgreSQL reales. La suite de comandos agrega ocho casos de concurrencia/acceso y nueve regresiones de la fundación después de A+B. Se verificaron dos supervisores A→B/A→C, doble click con misma key, respuesta perdida/retry desde otra sesión, acuse prematuro, inactivación concurrente del destino, exowner con identidad antigua, resolución futura por B y RPC real de tasación que autorizó a A antes del Transfer y escribe después. No se reemplazó esa RPC por un mock.

La corrida conjunta tiene **143/143 hojas DB, 151 entradas TAP incluidos ocho padres**, cero fail/cancel/skip/todo. Las pruebas puras son **23/23 fundación +23/23 contratos Assignment**; la regresión legacy seleccionada es **131/131**. **El suplemento final pasó 47/47 hojas de comandos** (27 obligatorias +11 adicionales de Assignment +9 de fundación): incluye rechazo de huérfanos con agenda/contacto/protocolo, terminales/sales_cases y excepción SQL tras escribir owner e historial, seguida de rollback completo y retry de la misma key. La evidencia compuesta suma **146 casos DB distintos**: 99 no-runtime de la corrida conjunta +47 runtime del suplemento. No se suman dos veces los 44 repetidos. [Suplemento completo](evidence/validation-20260918/commands-supplement-pass/database.json) y [verificación de fuentes y cobertura](verification-20260918.json).

| Grupo | Casos PASS en corrida conjunta | Alcance |
|---|---:|---|
| Fundación original | 26 | Contratos/transacciones/concurrencia/receipts DB certificados |
| Seguridad e instalación | 19 | Grants/RLS/FORCE RLS/roles/ownership/instalación/SQL fallido |
| Compatibilidad schema B | 9 | Frontera relevante capturada, no todo Supabase |
| Guarda A sola | 16 | Adopción, permiso, old snapshot, READ ONLY, rollback |
| Guarda A+B | 23 | Matriz obligatoria usando Assign/Transfer/Acknowledge reales |
| Comandos M1-04A | 27 | Casos A01–A27 obligatorios |
| Adicionales de comandos | 8 | Carreras, resolver, alcance de acceso, tasación y presupuestos |
| Fundación después de A+B | 9 | Núcleo idéntico; proof/constraints; probe cerrado; atomicidad/replay |
| Diagnóstico histórico | 6 | Reproduce contradicción original sin A/B; no aceptación del modelo nuevo |

## Migraciones, objetos y cambios legacy

Candidatas nuevas, en orden después de las tres migraciones certificadas, que no se editaron:

1. `20260918033251_m1_assignment_adoption_guard.sql` — SHA256 `89bd8e0a1e8ecfaad13077780da576612f81fc34bf94347bfd7ea0104ae654be`.
2. `20260918033407_m1_assignment_commands.sql` — SHA256 `f8760de6053cdb2d56ec23e6b1d4c7bf7efbfaa31ed174bd7ddaf22f21c0b9bf`.

A crea la tabla durable, helpers técnicos, fences y CHECK de gate acotado. B agrega tres columnas de proof a receipts, índice único parcial, listas cerradas ampliadas de command/event/aggregate, handlers, dispatcher, guardas de exowner y lector comercial actual. No hay backfill, seeds de autoridad, handlers de otros dominios ni DML amplio concedido a runtime_owner.

Se cambian siete funciones legacy en las nuevas candidatas: helper WhatsApp, RPC de modo, helper del trigger de asignación, complete_contact_task, record_contact_answer_with_transition base, record_lead_follow_up y refresh_due_contact_protocols. Se adaptan tres policies de lectura comercial y se agregan seis triggers a tablas legacy; los otros dos triggers protegen la adopción nueva. No se editan archivos SQL históricos, frontend ni Edge. Los cuerpos before están en las fuentes capturadas de fixtures y los after completos en las candidatas.

- [Archivos exactos creados/modificados](changed-files.md).
- [Contrato físico, comandos, idempotencia, locks, permisos y rollback](implementation.md).
- [Mapa exacto before/after, policies, triggers y writers](legacy-before-after.md).
- [Inventario de objetos candidato](database-object-inventory.json) y [hashes/ACL de las cuatro adaptaciones de acceso](access-function-hashes.json).
- [Fixture schema-only y límites](../../tests/m1/fixtures/assignment-runtime/README.md).
- [Diagnóstico anterior preservado](scope-block-before-authorization.md); sus estados BLOCKED son históricos y su contradicción fue resuelta en laboratorio mediante la excepción autorizada.

## Entorno y evidencia real

VM QEMU descartable, Linux 6.8.0-138, PostgreSQL **17.6**, Node 24.19.0 y Python 3.12.3. Sin NIC, rutas, mounts del host ni credenciales. PostgreSQL y pruebas bajo UID65534, socket Unix, listen_addresses vacío y seccomp sin conexiones IP. Cada suite usa un cluster nuevo. Las candidatas se aplican como `postgres` **NOSUPERUSER**, con los atributos capturados que incluyen CREATEROLE/BYPASSRLS; bootstrap usa un rol separado.

El empaquetado transporta sólo contratos, migraciones explícitas y tests/schema/fixtures permitidos; no copia configuración del repo, tokens, clientes ni conversaciones reales. No se utilizó QA remoto. Las VMs y clusters se destruyeron al terminar. El aislamiento local no cierra BL-08 de rollout.

Evidencia completa: [database.json](evidence/validation-20260918/all-profiles-pass/database.json), [VM y hashes](evidence/validation-20260918/all-profiles-pass/vm.json), [aislamiento](evidence/validation-20260918/all-profiles-pass/isolation.json), [resumen por perfil](evidence/validation-20260918/all-profiles-pass/summary.json), [manifest de fuente ejecutada](evidence/validation-20260918/all-profiles-pass/source-manifest.json), [pruebas puras/regresión](evidence/validation-20260918/pure-regression.json).

Manifest de la corrida conjunta: `8d39a9b75e8471ae42b57a3aaca7ca69a12d53cffb1bdcf52de037229203dcda`. Archive fuente consumido por la VM: `1089fec0615f0a066dd9e020300e8b79523a661d1400beffceaba920be20f73e`. Hashes de suite/migración y comandos del harness están en los reportes; no se usa regex o JS como sustituto de un resultado SQL.

## Fallos y correcciones

El primer intento A falló por discrepancias del harness: faltaba un grant EXECUTE service_role capturado en el fixture, la comparación no ordenaba ACL y una sentencia BEGIN REPEATABLE READ iba en el mismo envío que un SELECT previo. Se corrigieron fixture/normalización de ACL/orden de queries; no se relajaron permisos ni assertions. [Evidencia fallida preservada](evidence/validation-20260918/guard-run01-fixture-failure/database.json).

La revisión previa detectó dos límites que se resolvieron antes de aceptar A: un lock en el helper impedía READ ONLY y un snapshot anterior podía omitir una adopción posterior al operar historia. El lock mutante se ubicó en la RPC y la adopción marca la tupla; TRUNCATE histórico en aislamiento de snapshot se rechaza. La segunda corrida A pasó y habilitó B. B se instaló y pasó sus 44 hojas en el primer intento, sin modificar la candidata para obtener el PASS.

El primer suplemento de elegibilidad falló únicamente al construir un lead huérfano: limpiar owner sin limpiar assigned_by/assigned_at violaba `leads_assignment_complete`. Se corrigieron juntos los tres campos antes de adoptar, preservando protocolo e historia; no se cambió el constraint ni el rechazo esperado. En ese intento, los casos terminal y fallo SQL a mitad de comando ya pasaron. [Intento preservado](evidence/validation-20260918/commands-supplement-run01-fixture-failure/database.json).

Los oráculos legacy no se editaron. Los que esperan reset tras reasignación siguen caracterizando su camino histórico/pre-adopción; no son el objetivo de TransferLead. La regresión seleccionada es pura/de fuente y está separada de las pruebas DB.

## Riesgos, pendientes y rollback

El suplemento final conservó idénticos migraciones, contratos, overlays y harness; sólo agregó tres casos al archivo de runtime. Su manifest es `14e93142c1bd4183adb2d838da84dcc16eeef4e3275b71ca1003f8fafb11bc0c`, y el archive fuente `31e1ac9fc8270b0b456e0274357b4ff7d94023549c1279126d81f7c3640bb775`. Cada archivo de código/fixture ejecutado coincide con la entrega.

Los 23 permisos y 27 casos solicitados están ejecutados; no se marca BLOCKED una prueba aprobada ni se extrapola a superficies no reproducidas. Siguen fuera de certificación: endpoint/egress real, PostgREST desplegado, UI/alias efectivo, todas las ramas de writers externos/Recall/ventas, aislamiento de rollout y throughput. Las capturas schema relevantes no son un snapshot atómico de producción.

La restricción de canal no elimina toda lectura histórica de mensajes ni permisos amplios independientes de tablas legacy. Un request autorizado en el emisor antes de adoptar sigue siendo un problema de trabajo en vuelo. Los permisos gerenciales no se ratifican como arquitectura final. Los nuevos locks pueden agregar contención; los errores transitorios exigen retry de la misma intención. Las versiones no gobiernan todavía todas las mutaciones legacy de CRM.

Los fences rechazan cambios owner/by/assigned_at e historia de adoptados que no vengan del receipt. Eso cubre el punto de escritura de rutas conocidas; no acredita que un webhook/Apps Script/cliente privilegiado tolere el rechazo. OW-02/03 (reactivación/Recall), OW-08 (webhook), OW-11/12 (externos) siguen siendo bloqueantes para cutover por caracterización/integración pendiente. Las altas de leads sin adopción permanecen legacy.

Rollback compatible: cerrar/pausar writer conservando adopción, epochs, evidencia, estado comercial y denegación seller. No bajar un flag que reactive legacy, borrar adoptions ni restaurar globalmente el helper anterior. No se entrega down-migration destructivo. No hubo operación productiva que revertir.

| Bloqueo M0 | Estado al entregar |
|---|---|
| BL-01 Vercel/frontend | ABIERTO; sin evidencia nueva de build/alias efectivo |
| BL-02 Apps Script/Sheets | ABIERTO; destinos, código downstream y writers no exhaustivos |
| BL-03 externos privilegiados | ABIERTO; principals, custodios y consumidores sin inventario completo |
| BL-04 credenciales/productor/dispatcher | ABIERTO; binding y frontera efectiva no certificados |
| BL-05 sender/trabajo en vuelo | ABIERTO; sin drenaje ni medición nueva de efectos remotos |
| BL-06 vía humana | **ABIERTO/P0**; consumidores, necesidad, historial, credenciales y envíos pendientes |
| BL-07 configuración efectiva | ABIERTO; catálogo/schema no acredita runtime/prompt/secret resuelto |
| BL-08 aislamiento de rollout | ABIERTO; laboratorio verificado no equivale a QA/deployment aislados |

Se conservan los **nueve eventos históricos de modo humano**, sin inferir que fueran vendedores, envíos reales, uso indebido ni todos los consumidores. Las nuevas consultas remotas fueron SELECT de catálogo/hashes; no se copiaron datos comerciales. [Estado M0 actualizado](../m1-runtime-foundation/m0-status.md).

**Cero cambios productivos:** sin DDL/DML/RPC de negocio remoto, backfills, mensajes, secrets/Meta, frontend, Vercel, Apps Script, despliegues, push, PR ni merge. La rama se detiene en M1-04A.
