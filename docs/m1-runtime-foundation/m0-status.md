# M0 continúa abierto — recaptura de lectura 17/09/2026

> Actualización 18/09/2026, M1-04A: los ocho blockers siguen ABIERTOS y BL-06 sigue P0. La excepción posterior autorizó candidatas **locales** que restringen el helper seller exclusivamente tras adopción durable de Assignment y adaptan las fronteras mínimas de ownership. Esa guarda se valida sólo en el laboratorio; no está instalada en producción ni cierra BL-06. El alcance actual y sus resultados están en [la entrega M1-04A](../m1-assignment-authority/README.md). El resto de este documento conserva la captura y autorización históricas de M1-01/02/03, no limita ni certifica por sí solo la autorización posterior.

La inspección adicional del 18/09 fue únicamente de catálogo: estructura/ACL/identity de `lead_assignments`, dependencias del modo de canal, trece hashes de funciones (13/13 coinciden con M0) y schema/función de tasaciones. No se copiaron filas de aplicación ni secretos ni se midió nuevamente uso human o trabajo en vuelo. Fuentes fechadas: `tests/m1/fixtures/assignment-runtime/*source.json` y `function-hash-comparison.json`. No hay nueva evidencia que cierre Vercel, Apps Script, consumidores externos, credenciales, sender, configuración efectiva o aislamiento de rollout.

Esta rama no declara M0 completo. La autorización permite fundaciones locales inactivas, sin cutover. Las consultas remotas de esta tarea fueron SELECT de catálogo/agregados y lecturas de metadatos/fuentes; no hubo RPC de negocio, envíos, DDL/DML, backfill, rotación de credenciales ni cambios de configuración.

Evidencia saneada reproducible: `evidence/m0-external.json` y `evidence/m0-runtime.json`. Incluyen timestamps, consultas, resultados mínimos y hashes, sin mensajes, destinatarios, tokens, nombres/IDs de clientes o valores de secretos. Captura original 15:42–15:47 UTC; no es un snapshot atómico entre proveedores. La validación DB posterior agrega catálogos de schema entre 18:12 y 18:27 UTC, documentados en `schema-baseline-b.md`; no recaptura uso comercial ni configuración externa.

| Bloqueo | Evidencia nueva | Estado y qué falta |
|---|---|---|
| BL-01 — Vercel/frontend | Listado de teams vacío; deployment conocido devuelve 403 en su scope. Main verificado por GitHub y fetch, sin prueba de alias/build servido | **ABIERTO.** Lectura autorizada de deployment/alias/config/assets efectivos. No se publica rama remota mientras no pueda descartarse un preview automático con superficies conectadas |
| BL-02 — Apps Script/Sheets | Búsquedas de metadata Drive no devuelven fuente accesible. Repo conserva receptor Apps Script y POST en captura | **ABIERTO.** Proyecto/revisión/triggers/planillas/destinos/retries/custodio. Ausencia de resultados no prueba ausencia del escritor |
| BL-03 — externos privilegiados | Catálogos y sesiones agregadas confirman capacidades, no custodios. No se observan foreign servers/FDW | **ABIERTO.** Inventario de credenciales/principals/consumidores y evidencia de uso. FDW ausente no excluye REST o Dashboard |
| BL-04 — productor/dispatcher/credenciales | Nueve Edge con versiones/bundle hashes sin cambios; tres senders conocidos con fuentes idénticas. Nombres de secrets presentes en código, sin valores | **ABIERTO.** Binding efectivo de secretos, principals y capacidades por runtime; inventario completo de emisores. Módulos separados no prueban aislamiento |
| BL-05 — trabajo en vuelo | Cron cada 5 min activo, 288 registros succeeded/24 h; 72 respuestas HTTP200 retenidas; cola pg_net 0 al corte; reminders 3 pending (1 vencido), 283 sent, 296 cancelled | **ABIERTO.** Ledger/inventario de intentos HTTP, quiesce y unknown. Cola vacía o HTTP200 no prueba drenaje ni entrega Meta |
| BL-06 — consumidores human | Nueve registros históricos de eventos de modo humano: 4 taken, 3 released, 2 message_sent; un actor observado cuyo perfil actual es admin; agregado de 1 registro de mensaje origin=human y 4 controls. Ruta en portal Supervisor conocida; ACL/funciones sin cambios | **ABIERTO / P0.** Caracterizar necesidad, contexto y consumidores actuales. Esos registros no prueban que actuaran vendedores, que hubiera envíos reales, que el uso fuera incorrecto ni que el actor observado fuera el único consumidor. Rol actual no acredita rol histórico. Seller owner conserva capacidad backend potencial en legacy; no se ensayó con clientes reales |
| BL-07 — configuración efectiva | Fingerprints/longitudes de qualification_rules y conversation_style idénticos; vector store configurado. No hay `private.crm_*` nuevas instaladas en remoto | **ABIERTO.** Manifest no secreto de env/modelo/flags/API/prompt ensamblado/config resuelta. Defaults del código no equivalen a valores efectivos |
| BL-08 — aislamiento | Validación local acreditada en VM Linux temporal sin NIC, rutas, mounts de host ni credenciales; PostgreSQL 17.6 con UID65534, socket Unix y seccomp sin IP. Se ejecutan las suites DB reales A y B | **ABIERTO para rollout.** Resuelto únicamente el impedimento del laboratorio local. Frontend/QA remoto, configuración y aislamiento completo de despliegue siguen sin certificarse |

## Riesgo P0 ratificado

La fuente actual de `private.current_user_can_manage_whatsapp(uuid)` admite admin/supervisor y seller activo dueño. `set_whatsapp_conversation_mode` conserva modos ai/human y el endpoint `whatsapp-human-message` usa esa frontera, RLS y control human antes de enviar. El owner seller no tiene acceso universal a cualquier lead; existen condiciones adicionales de RLS, incluidas sales_cases. Aun así, la capacidad potencial contradice la decisión de negocio de que el vendedor no opera WhatsApp IA.

Esta rama **no modifica ni elimina** esa ruta, conforme a la autorización. Nuevos objetos no tienen estado human, permisos de canal seller, handlers de envío ni grants al gateway. Las pruebas objetivo nuevas deben mantener visible esa separación; no se deben interpretar como cierre del P0 productivo.

## Reglas para la siguiente revisión

1. Conservar las ocho filas abiertas hasta evidencia positiva correspondiente; un test sintético no certifica consumidores/configuración reales.
2. Conservar evidencia de las pruebas DB ejecutadas en VM descartable sin egress; no extrapolar el aislamiento local al rollout ni a un proyecto llamado QA.
3. La rama no cambia main, Vercel, Supabase, Apps Script ni Meta. No hubo cambio operativo que revertir.
4. La autorización de esta revisión cubre instalar las tres migraciones sólo en el laboratorio descartable. No autoriza M1-04, instalación remota/productiva, revocar legacy, desplegar la rama ni corregir históricos.
