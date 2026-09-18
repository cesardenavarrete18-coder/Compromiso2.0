# M1-04B — Validación de laboratorio, regresiones y bloqueos de rollout

Validación de laboratorio completada, 18/09/2026. Base certificada por el usuario para M1-04A:
`8a331e647eeb574be90cb2a6bd28a7e46f874ae3`, rama local
`feat/m1-runtime-foundation`. La autorización B cubre implementación y pruebas
aisladas; no autoriza push, PR, merge, deploy, cutover ni cambios productivos.

**La entrega candidata completó B80, regresión DB y pruebas puras.** La certificación
formal corresponde al usuario. [Resultados finales individuales](test-results.md)
y [entrega](delivery.md). Se conserva a continuación la regresión inicial con sus
propios hashes; no se presenta esa instantánea anterior como validación final.

## 1. Regresión inicial ejecutada

Se transportó una instantánea limpia del HEAD certificado antes de los cambios B.
Cada archivo de integración recibió un cluster nuevo, incluidos roles y fixtures.
Los resultados siguientes son de PostgreSQL real, sin cambiar los oráculos.
No equivalen a volver a ejecutar las 146 pruebas con las tres migraciones B
instaladas en cada cluster.

| Perfil DB | Casos hoja | Resultado | Migraciones candidatas en ese perfil |
|---|---:|---|---|
| `assignment-boundary.integration.test.mjs` | 6 | PASS | Ninguna; diagnóstico histórico |
| `assignment-channel-guard.integration.test.mjs` | 23 | PASS | Guarda y comandos Assignment |
| `assignment-channel-prerequisite.integration.test.mjs` | 16 | PASS | Guarda Assignment |
| `assignment-runtime.integration.test.mjs` | 47 | PASS | Guarda y comandos Assignment |
| `foundation.integration.test.mjs` | 26 | PASS | Ninguna |
| `installation.integration.test.mjs` | 9 | PASS | Ninguna; controla instalación de fundación |
| `schema-baseline-b.integration.test.mjs` | 9 | PASS | Ninguna; compatibilidad estructural capturada |
| `security.integration.test.mjs` | 10 | PASS | Ninguna |
| **Total de casos distintos** | **146** | **PASS** | **8 clusters independientes** |

El TAP contiene además ocho tests padre; no se suman como casos adicionales.
Se compararon las parejas exactas `suite`/`case` contra el manifiesto certificado:
**cero casos ausentes, cero fallos y cero skips**. El perfil diagnóstico conserva
la contradicción legacy observada; su PASS significa diagnóstico reproducido,
no permiso seller aceptado para el dominio nuevo.

| Grupo puro conservado | Casos | Resultado |
|---|---:|---|
| Fundación | 23 | PASS |
| Assignment | 23 | PASS |
| Selección legacy original, ocho archivos | 131 | PASS |
| **Total** | **177** | **PASS, cero fallos/skips** |

Las pruebas puras verifican contratos y regresiones de fuente/comportamiento
local. No sustituyen PostgreSQL. La suite pura B y la regresión final posterior a
las modificaciones requieren sus propios resultados; no están incluidas en 177.

Evidencia copiada sin modificaciones desde la corrida local:

- [Resumen de los 146 casos](evidence/baseline-20260918/summary.json).
- [Resultados PG/TAP completos](evidence/baseline-20260918/database.json).
- [Verificador y hashes de la VM](evidence/baseline-20260918/vm.json).
- [Inspección de aislamiento](evidence/baseline-20260918/isolation.json).
- [Resultados puros completos](evidence/baseline-20260918/pure-regression.json).

## 2. Entorno exacto y aislamiento

Las corridas finales reutilizan este entorno. Los hashes de archivo fuente y
manifiesto de la tabla siguiente pertenecen exclusivamente al baseline inicial;
los manifests finales están en `evidence/final-db` y `evidence/final-contact`.

Se utilizó el mismo toolchain local ya identificado por la validación anterior;
esta ejecución no descargó herramientas ni usó una base remota.

| Superficie | Evidencia de esta ejecución |
|---|---|
| Hipervisor | QEMU x86_64, aceleración TCG, 2 vCPU, 2048 MiB |
| Guest | Linux `6.8.0-138-generic`, initramfs descartable construido con allowlist |
| Red de VM | `-nodefaults -nic none`; interfaces observadas: sólo `lo`; tabla de rutas vacía |
| Puentes al host | Sin mounts compartidos, port forwards, monitor ni credenciales del host |
| PostgreSQL | `postgres (PostgreSQL) 17.6`; paquete local `@embedded-postgres/linux-x64@17.6.0-beta.15` |
| Identidad del proceso PG | UID/GID 65534, cuenta sintética `nobody` |
| Transporte DB | `listen_addresses=''`; sólo socket Unix; `inet_server_addr() IS NULL` |
| Defensa de egress adicional | Launcher seccomp niega sockets no Unix, ABI x32 e `io_uring_setup`; no broker remoto |
| Identidad migradora | Sesión `postgres`, `NOSUPERUSER`, `CREATEROLE`, `BYPASSRLS`; no credencial de Supabase |
| Bootstrap | `supabase_admin` sintético en perfiles de schema capturado; `m1_test_admin` en fixture mínimo |
| Datos | Fixtures ficticios; sin leads, conversaciones, destinatarios o secretos reales |
| Efectos externos | No Edge Functions, Meta, WhatsApp, Apps Script, cron ni worker productivos |
| Fin de ejecución | QEMU y runner terminaron con código 0; VM y clusters eliminados |

La versión del paquete tiene sufijo beta; el binario nativo identifica PostgreSQL
17.6. No se presenta ese empaquetado de terceros como distribución oficial.
Cada conexión del harness verifica el marcador aleatorio del cluster y la base
sintética admitida; no acepta DSN ni proyecto Supabase del usuario.

Hashes relevantes:

| Artefacto | SHA-256 |
|---|---|
| Binario PostgreSQL | `23cd174849b273064c47d581b55be596be2f5cf0ee5d3e76c0146e2464bf873a` |
| QEMU | `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854` |
| Kernel | `d74be574189057a036866309fd5546724a92390a4f6ba086e93ddab2f6e0e01d` |
| Launcher seccomp compilado | `d48cf6d387092c71323d7e6a24af26c582d7bc0103545cd3614641e9608183f7` |
| Archivo fuente transportado | `22f7c8cea9938dccafa8f6b3c3cf553c22c701642d69b6f863ae51767254a922` |
| Manifiesto fuente | `835ca942803709bf1da1b0539c574d323b62e314c99d5d4d328550078da01fcb` |

El manifiesto fuente registra `source_has_uncommitted_changes=false` y el HEAD
certificado. El hash de la futura corrida B debe registrarse separadamente: no
puede apropiarse de esta evidencia de una instantánea anterior.

## 3. Perfiles de validación B y límites de compatibilidad

`contact-runtime.integration.test.mjs` tiene un perfil nuevo e independiente:
`B_plus_synthetic_contact_data`, etapa `contact_acceptance_candidate`. Aquí la
letra del **schema-baseline B** identifica una captura estructural anterior y no
significa por sí misma que M1-04B esté instalado o certificado.

El runner instala solamente las tres migraciones de fundación sobre ese schema.
La suite instala los overlays observados, las dos migraciones Assignment y las
tres candidatas Contact/Next Action de forma controlada y sin quitar sus
transacciones. Verifica también prefijos incompletos y dependencias inválidas.
El harness no adopta leads, no activa gates ni concede permisos por defecto.
Las activaciones para los casos deben ser explícitas en fixtures aislados.

| Archivo candidato B | Rol de la candidata |
|---|---|
| `20260918160432_m1_contact_runtime_foundation.sql` | Estructura privada, constraints y permisos cerrados |
| `20260918160433_m1_contact_legacy_fences.sql` | Guardas y contención de efectos legacy en adopciones B |
| `20260918160434_m1_contact_commands.sql` | Comandos cerrados, getter y adopción técnica |

Los nombres se asignaron desde UTC del sistema al no disponer de Supabase CLI y
fallar los intentos de obtenerlo. Es una diferencia documentada respecto de la
creación preferida con `supabase migration new`; no se utilizó una conexión
productiva como alternativa. Las pruebas deben conservar evidencia de los
archivos exactos, sus hashes y su instalación transaccional real.

Los 80 escenarios `DB-B01`–`DB-B80` se ejecutaron con trazabilidad individual.
B79/B80 aportan evidencia con B instalado y, adicionalmente, dos perfiles repiten
47 casos Assignment y 23 de canal incorporando B antes del comportamiento de
comandos/canal. A27 comprueba primero la instalación A. Los 146 casos anteriores
también se ejecutaron con sus límites originales. No se cambia un oracle legacy
para forzarlo a coincidir con la cohorte B.

Una ejecución completa del harness transporta una sola instantánea y crea un
cluster por archivo. Los perfiles certificados siguen recibiendo sus listas de
migraciones originales; el perfil Contact y los dos perfiles de regresión con B
reciben A2+B3. Su tiempo máximo
mayor permite la matriz ampliada y no permite omitir casos ni declarar observada
una espera de lock basándose sólo en `sleep`.

No se certifican por esta capa: una copia íntegra del schema productivo, JWT y
PostgREST reales, Edge Functions, consumidores externos, frontend servido,
credenciales, colas existentes, un productor automático de deadlines ni canales
de envío. Las carreras se deben ensayar con sesiones PostgreSQL reales; la
equivalencia JavaScript y las búsquedas de fuente no son evidencia de una carrera.

## 4. M0 y BL-01–BL-08

**M0 permanece abierto.** Ni la validación inicial ni la final hicieron consultas remotas ni
recapturó la configuración o el uso productivo. La evidencia externa siguiente
procede de las capturas fechadas del 17–18/09 documentadas en
[m0-status.md](../m1-runtime-foundation/m0-status.md) y conserva sus limitaciones.
La falta de nueva evidencia no cierra un bloqueo.

| Bloqueo | Estado | Evidencia disponible y pendiente para futuro rollout |
|---|---|---|
| BL-01 — Vercel/frontend/alias | **ABIERTO** | Metadata/403 previos no acreditan build ni alias servido. Verificar deployment efectivo, configuración y caller compatible con comandos/DTO B; no desplegar para conseguir esa evidencia. |
| BL-02 — Apps Script/Sheets | **ABIERTO** | Código receptor y POST conocidos; faltan revisión, triggers, hojas, destinos, retries y custodio efectivo. Una búsqueda vacía no elimina al writer. |
| BL-03 — Consumidores privilegiados externos | **ABIERTO** | Capacidades de catálogo no identifican todos los consumidores/principals. Faltan inventario y evidencia de uso de REST, Dashboard, scripts y otras credenciales. |
| BL-04 — Credenciales/productor/dispatcher | **ABIERTO** | Fuentes/hashes y nombres de secrets conocidos no acreditan el binding de credenciales ni separación operativa efectiva. No se leyó ni utilizó un token productivo. |
| BL-05 — Senders y trabajo en vuelo | **ABIERTO** | Cron, respuestas HTTP y colas fueron observados en cortes anteriores, no drenados. Falta caracterizar trabajos pendientes/inciertos e inventario de emisores; HTTP200 o cola vacía no prueban entrega ni quiesce. |
| BL-06 — Vía humana WhatsApp IA | **ABIERTO / P0** | Conservar los nueve eventos históricos: 4 `taken`, 3 `released`, 2 `message_sent`. Falta caracterizar consumidores, necesidad operativa, historial, credenciales, permisos, sender y operaciones en vuelo. |
| BL-07 — Configuración efectiva no expuesta | **ABIERTO** | Fingerprints anteriores no prueban env/modelo/flags/prompt ensamblado/configuración resuelta actual. Defaults de fuente no son configuración efectiva. |
| BL-08 — Aislamiento de rollout | **ABIERTO** | El laboratorio local de esta corrida sí está acreditado. Eso no acredita QA remoto, frontend, integración completa ni aislamiento de un futuro despliegue. |

En BL-06, los nueve eventos **no prueban** que sus actores fueran vendedores,
que se hayan emitido mensajes reales, que el uso fuese incorrecto ni que el actor
observado sea el único consumidor. Su rol actual tampoco prueba su rol histórico.
La guarda certificada de Assignment sigue limitada al laboratorio y a adopciones
durables. Su denegación seller no certifica el modelo gerencial definitivo ni
autoriza rediseñar la ruta `whatsapp-human-message`.

## 5. Bloqueos previos a cualquier cutover futuro

La certificación de laboratorio, si se alcanza, sólo acreditará el contrato y el
baseline efectivamente probado. Antes de un cutover independiente se necesitan:

1. Callers/frontend compatibles con intent IDs, versiones, errores, retries y
   getter B. Debe existir una superficie operativa visible para seller/supervisor:
   una necesidad `next_action_required` o revisión no puede hacer desaparecer al
   lead. La autorización actual permite getter/contrato, no frontend productivo.
2. Cierre positivo de writers externos, Apps Script y consumidores privilegiados
   que puedan tocar campos adoptados. Un fence que los rechaza protege integridad;
   no significa que su flujo de negocio haya quedado integrado.
3. Resolución de los workflows mixtos que combinan contacto con etapa,
   entrevista, seña o venta. Deben fallar íntegramente al cruzar una frontera no
   autorizada; no se les permite mutar primero un subconjunto.
4. Integración futura de autoridad de etapa. B no decide Nuevo→No contesta,
   En gestión/Cierre ni Desistir desde un resultado de contacto.
5. Caracterización de senders, restricciones efectivas y trabajo en vuelo,
   especialmente BL-06/P0. La anotación manual de WhatsApp personal no certifica
   entrega ni permite operar el canal WhatsApp IA.
6. Un productor autorizado de `EvaluateContactDeadlines` y operación visible de
   los resultados. B no instala cron, worker ni botón productivo; el getter nunca
   ejecuta ese comando implícitamente.
7. Autorización separada de rollout/cutover, manifest de dependencias efectivo,
   aislamiento acreditado y procedimiento operativo de pausa/reanudación.
8. Verificar ACL efectiva del gateway compartido: B lo instala cerrado como en
   el baseline probado. Una Assignment previamente expuesta requeriría planificar
   ese grant; no se certifica que la instalación preserve una exposición API
   diferente de la capturada.

## 6. Rollback compatible

Durante el laboratorio un cluster fallido es descartable. Se conservan su fuente,
hashes, SQLSTATE/TAP y evidencia antes de corregir la candidata y ejecutar otra
corrida; no se convierte un fallo en PASS mediante cambio de oracle.

En el diseño posterior a una adopción válida, rollback técnico significa detener
o pausar al writer, manteniendo adoptions, hechos, eventos, receipts, créditos,
acciones, versiones y evidencia. **No significa borrar adopción B, restaurar
writers legacy sobre recursos adoptados ni bajar epochs.** La adopción A y la
denegación seller del canal WhatsApp IA también permanecen.

La excepción restrictiva aprobada de `requested_no_contact` con gate B `paused`
debe conservarse únicamente bajo su contrato server-side: registrar/aplicar DNC
conocido, retirar trabajo futuro y mantener etapa/identidad. No habilita nuevos
intentos, agenda, crédito comercial ni levantar restricciones. La pausa no crea
un fallback al flujo legacy de opt-out que cambia etapa o genera Recall.

No se proponen down migrations que borren historia. Una desadopción o restauración
de semántica legacy requiere autorización expresa futura. No existe cambio
productivo de esta ejecución que deba revertirse.

## 7. Estado del entregable final de laboratorio

| Verificación | Estado en este documento |
|---|---|
| Baseline certificado anterior, 146 DB | **PASS ejecutado** en instantánea limpia anterior a B |
| Baseline puro anterior, 177 | **PASS ejecutado** |
| M1-04B, 80 escenarios DB | **80/80 PASS final**, PostgreSQL real |
| Suite pura B | **37/37 PASS** |
| Regresión final tras cambios | **146/146 PASS** más 70 ejecuciones adicionales Assignment/canal con B; matriz integrada 296/296 |
| Puras finales | **214/214 PASS**: 23 + 23 + 131 + 37 |
| Cutover/producción | **No autorizado; blockers abiertos** |

La matriz final integrada y la repetición final de B conservan idénticos hashes
de SQL/contratos. Sólo se reforzaron las assertions B29/B40/B74 entre ambas.
Los manifests y resultados identifican cada suite exacta; no se reutiliza evidencia
anterior para un archivo funcional diferente. [Fallos y correcciones](failures-and-corrections.md)
preserva intentos fallidos/incompletos. Ningún resultado sustituye la certificación
formal del usuario ni cierra un bloqueo de rollout.
