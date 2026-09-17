# M0 continúa abierto — recaptura de lectura 17/09/2026

Esta rama no declara M0 completo. La autorización permite fundaciones locales inactivas, sin cutover. Las consultas remotas de esta tarea fueron SELECT de catálogo/agregados y lecturas de metadatos/fuentes; no hubo RPC de negocio, envíos, DDL/DML, backfill, rotación de credenciales ni cambios de configuración.

Evidencia saneada reproducible: `evidence/m0-external.json` y `evidence/m0-runtime.json`. Incluyen timestamps, consultas, resultados mínimos y hashes, sin mensajes, destinatarios, tokens, nombres/IDs de clientes o valores de secretos. Captura 15:42–15:47 UTC; no es un snapshot atómico entre proveedores.

| Bloqueo | Evidencia nueva | Estado y qué falta |
|---|---|---|
| BL-01 — Vercel/frontend | Listado de teams vacío; deployment conocido devuelve 403 en su scope. Main verificado por GitHub y fetch, sin prueba de alias/build servido | **ABIERTO.** Lectura autorizada de deployment/alias/config/assets efectivos. No se publica rama remota mientras no pueda descartarse un preview automático con superficies conectadas |
| BL-02 — Apps Script/Sheets | Búsquedas de metadata Drive no devuelven fuente accesible. Repo conserva receptor Apps Script y POST en captura | **ABIERTO.** Proyecto/revisión/triggers/planillas/destinos/retries/custodio. Ausencia de resultados no prueba ausencia del escritor |
| BL-03 — externos privilegiados | Catálogos y sesiones agregadas confirman capacidades, no custodios. No se observan foreign servers/FDW | **ABIERTO.** Inventario de credenciales/principals/consumidores y evidencia de uso. FDW ausente no excluye REST o Dashboard |
| BL-04 — productor/dispatcher/credenciales | Nueve Edge con versiones/bundle hashes sin cambios; tres senders conocidos con fuentes idénticas. Nombres de secrets presentes en código, sin valores | **ABIERTO.** Binding efectivo de secretos, principals y capacidades por runtime; inventario completo de emisores. Módulos separados no prueban aislamiento |
| BL-05 — trabajo en vuelo | Cron cada 5 min activo, 288 registros succeeded/24 h; 72 respuestas HTTP200 retenidas; cola pg_net 0 al corte; reminders 3 pending (1 vencido), 283 sent, 296 cancelled | **ABIERTO.** Ledger/inventario de intentos HTTP, quiesce y unknown. Cola vacía o HTTP200 no prueba drenaje ni entrega Meta |
| BL-06 — consumidores human | Uso histórico: 4 taken, 3 released, 2 message_sent; un actor cuyo perfil actual es admin; 1 mensaje origin=human y 4 controls. Ruta en portal Supervisor conocida; ACL/funciones sin cambios | **ABIERTO / P0.** Caracterizar necesidad/legitimidad/consumidores actuales. Rol actual no acredita rol histórico. Seller owner conserva capacidad backend potencial en legacy; no se ensayó con clientes reales |
| BL-07 — configuración efectiva | Fingerprints/longitudes de qualification_rules y conversation_style idénticos; vector store configurado. No hay `private.crm_*` nuevas instaladas en remoto | **ABIERTO.** Manifest no secreto de env/modelo/flags/API/prompt ensamblado/config resuelta. Defaults del código no equivalen a valores efectivos |
| BL-08 — aislamiento | Harness local diseñado con Unix socket, entorno permitido y seccomp sin red. Contenedor permite sólo UID/GID 0; PostgreSQL no puede iniciar con usuario no-root; AF_UNIX está prohibido incluso sin filtro propio | **ABIERTO.** Integración/concurrencia/RLS bloqueadas antes de initdb. Frontend/QA remoto tampoco certificados; las pruebas puras no cierran este bloqueo |

## Riesgo P0 ratificado

La fuente actual de `private.current_user_can_manage_whatsapp(uuid)` admite admin/supervisor y seller activo dueño. `set_whatsapp_conversation_mode` conserva modos ai/human y el endpoint `whatsapp-human-message` usa esa frontera, RLS y control human antes de enviar. El owner seller no tiene acceso universal a cualquier lead; existen condiciones adicionales de RLS, incluidas sales_cases. Aun así, la capacidad potencial contradice la decisión de negocio de que el vendedor no opera WhatsApp IA.

Esta rama **no modifica ni elimina** esa ruta, conforme a la autorización. Nuevos objetos no tienen estado human, permisos de canal seller, handlers de envío ni grants al gateway. Las pruebas objetivo nuevas deben mantener visible esa separación; no se deben interpretar como cierre del P0 productivo.

## Reglas para la siguiente revisión

1. Conservar las ocho filas abiertas hasta evidencia positiva correspondiente; un test sintético no certifica consumidores/configuración reales.
2. Ejecutar las pruebas DB de esta rama en un host acreditado sin egress que admita PostgreSQL no-root. No usar un proyecto remoto por conveniencia.
3. La rama no cambia main, Vercel, Supabase, Apps Script ni Meta. No hubo cambio operativo que revertir.
4. No hay autorización implícita para M1-04, instalar migraciones, revocar legacy, desplegar la rama o corregir históricos.
