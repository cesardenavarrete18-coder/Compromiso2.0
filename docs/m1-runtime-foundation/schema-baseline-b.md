# Capa B: reproducción del esquema relevante observado

Este documento delimita la fixture B de validación de M1-01/02/03. La fixture reproduce metadatos observados de las dependencias relevantes; **no es un clon de producción ni una certificación del comportamiento comercial**. Es independiente de la fixture mínima A. Un resultado A satisfactorio no sustituye la ejecución B.

La capa B pasó su ejecución real en PostgreSQL **17.6: 9/9 subtests, cero fallos y cero omitidos** (10 resultados TAP al contar el test padre). El reporte específico identifica `fixture_layer=schema_only_baseline_b`, bootstrap `supabase_admin` y hashes coincidentes. Este PASS corresponde a la frontera y a las exclusiones documentadas aquí.

## Resultado verificado

La ejecución `m103-vm-run06-schema-baseline-b`, run ID `a89d5604-c5de-487c-b585-f451d5c1162b`, aplicó las tres migraciones como `postgres NOSUPERUSER`. Coincidieron tanto el catálogo seleccionado inicial como sus definiciones, propietarios, permisos, triggers y policies después de cada migración. Pasaron las pruebas de `auth.uid` real, las seis tablas M1 vacías y cerradas, el handler instalado que rechaza `COMMAND_NOT_IMPLEMENTED` y la ausencia de permisos legacy para el propietario runtime.

La [evidencia PostgreSQL](evidence/db-validation/schema-baseline-b/database.json) contiene los resultados TAP y las huellas. `migrations_applied` aparece vacío porque el runner delega la instalación a la suite (`migration_installation=suite_controlled_verbatim`); los subtests B4, B5 y B6 registran la ejecución íntegra de cada archivo y sus comprobaciones posteriores. No se interpreta ese arreglo del runner como omisión de las migraciones.

La [evidencia de la VM](evidence/db-validation/schema-baseline-b/vm.json) y el [registro de aislamiento](evidence/db-validation/schema-baseline-b/isolation.json) confirman ausencia de NIC, reenvíos de puertos y montajes del host, PostgreSQL limitado a socket Unix y destrucción del entorno temporal. No hubo aplicación de SQL remoto ni activación comercial.

| Artefacto ejecutado | SHA-256 |
| --- | --- |
| Bootstrap B | `8ea22a1e8b4cd6559732331ca66ac2728d90f58e11ada4f344c398040608c5e6` |
| Suite B | `9d329069fc08242962363af5a77edccb7eea25983a511ccaef93a8746e03590d` |
| M1-01 | `6dbb4e1c6a0c8da22de49424fdf965f46e74e85dad0e822a6201b2ec31f09d49` |
| M1-02 | `6154b2dd302d1f5793ea5c9b4151a1423f4f5b956e688ae7089bf8f00b80cd60` |
| M1-03 | `433615402b82cbc5b85cd4f168c0b96ff48658de84cfdadad56b02616f7bf9e7` |

Los cambios de M1-02/03 probados incluyen la corrección del regrant circular de ADMIN detectado en la ejecución A anterior. No se necesitó modificar la fixture ni el core para hacer pasar B después de observar su resultado.

## Evidencia y límites de captura

Se realizaron exclusivamente consultas `SELECT` sobre catálogos del proyecto autorizado. No se consultaron filas comerciales, usuarios de Auth, contraseñas, valores de secuencias, contenido de Vault, tokens ni configuraciones privadas. Las definiciones estáticas de funciones se revisaron antes de guardarse. Los SQL de captura, sus respuestas, timestamps y procedencia están en [source.json](../../tests/m1/fixtures/schema-baseline-b/source.json); las huellas del conjunto y del SQL generado están en [manifest.json](../../tests/m1/fixtures/schema-baseline-b/manifest.json).

| Captura | Instante UTC del 17/09/2026 | Contenido |
| --- | --- | --- |
| Plataforma relevante | 18:12:17 | `auth.uid`, `auth.users`, esquemas, propietario de la base e inventario de extensiones |
| Aplicación y dependencias | 18:25:01 | Tablas, columnas, constraints, índices, triggers, policies, funciones, enum y configuración de secuencias |
| Seguridad | 18:16:37 | Atributos no secretos de roles, membresías, propietarios, ACL y privilegios por defecto |
| Identidad del rol inicial | 18:27:46 | OID/rol/grantor de `postgres` y `supabase_admin` |

Son capturas separadas, no un snapshot transaccional único. Las secuencias se recapturaron con los límites `bigint` convertidos a texto decimal: el máximo `9223372036854775807` no puede pasar por un número JavaScript sin pérdida. Se restauran parámetros de definición, nunca el contador observado de producción.

La comparación con `m01-db-baseline.json` (SHA-256 `11b49868c9d4a8f37a2a628d50bf25205a857f48710beb09586abccf424298ec`) no halló discrepancias en los campos comparables de 28 tablas, 41 funciones, 234 constraints, 134 índices, 40 triggers, 56 policies y 427 columnas. Los campos comparados están delimitados en `provenance.m0_comparison`; por ejemplo, la comparación de columnas con M0 comprende identidad nominal, orden y nulabilidad, no una igualdad de tipos que aquella captura no permitía comprobar directamente. La nueva captura incorpora los 35 campos de `auth.users`, sus constraints/índices y la definición real de `auth.uid` que faltaban en M0.

## Frontera reconstruida

El SQL generado contiene 29 tablas, 462 columnas, 237 constraints, 149 índices, 40 triggers, 56 policies, 42 funciones, 5 secuencias y los cuatro valores actuales de `public.app_role`. Conserva propietarios, privilegios de objeto, grantors, políticas RLS, estados de triggers, defaults, identidad de columnas y la columna generada de Auth. También reconstruye los privilegios por defecto observados de los esquemas incluidos.

La frontera parte de `auth.uid`, `auth.users`, `public.profiles` y `public.leads`; incorpora las relaciones referenciadas por sus claves, policies y triggers y las dependencias estáticas de esas funciones. Por eso incluye objetos existentes de clientes, campañas, protocolo, CRM, recupero, ventas y ofertas. Se conserva el código capturado de esos objetos como parte del esquema; no se rediseña banco ni se ejecuta su flujo. La lista exacta de objetos está en `source.json`. Todas las claves foráneas de las tablas seleccionadas tienen su relación referenciada dentro de esa lista.

El cierre estático fue revisado sobre las definiciones capturadas y se verifica al instalar constraints/policies/triggers en la fixture. Las funciones PL/pgSQL no son una garantía automática de cierre de todas las rutas posibles: la capa B no pretende ejecutar ni certificar todos sus caminos comerciales. `check_function_bodies=off` se usa sólo durante la reconstrucción para conservar el orden de dependencias entre funciones existentes; luego se restablece. La comparación posterior exige que el texto y la huella de cada función coincidan con la captura. No se reemplaza `auth.uid` por una función de prueba.

El rol inicial requiere una reproducción particular: en producción `supabase_admin` tiene OID 10 y es superusuario; `postgres` tiene otro OID y **no** es superusuario. El runner B inicializa el cluster con `supabase_admin`, y el bootstrap rechaza un rol inicial distinto. No se fuerzan OID internos, no se renombra el rol de otra fixture ni se modifican catálogos manualmente. Se reproduce la condición estructural `postgres != bootstrap`; el número concreto asignado a `postgres` por `initdb` no participa en la autorización. Las tres migraciones se ejecutan con `SET SESSION AUTHORIZATION postgres`, no como superusuario ni mediante un simple `SET ROLE` que oculte el usuario de sesión.

## Exclusiones explícitas

| Exclusión | Consecuencia para la interpretación |
| --- | --- |
| Filas de Auth y CRM | Se prueban instalación, permisos y preservación de esquema; no comportamiento con datos productivos ni distribución de estados |
| Otros objetos de Auth, Realtime, Storage, MercadoLibre y CRM sin dependencia seleccionada | No hay certificación del esquema completo ni de toda integración Supabase |
| Extensiones `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp` | Se conserva el inventario pero no se instalan; las definiciones seleccionadas no llaman funciones de estas extensiones. No se crean jobs ni vías de salida |
| ACL de base hacia roles exclusivos de plataforma `supabase_etl_admin` / `supabase_storage_admin` | Se conserva su evidencia, pero no esos grants de CREATE ni esos roles. No tienen propiedad/grants de objeto dentro de la frontera seleccionada. Se reproduce el propietario de la base `postgres` |
| Nombre y locale de base definidos por el runner | No se prueba equivalencia de ordenación/comparación textual bajo el locale ICU observado en producción |
| REST/PostgREST, GoTrue, JWT firmados y servicios externos | La prueba de `auth.uid` usa los GUC de claims en una sesión aislada; no demuestra emisión, verificación ni transporte de tokens |

Estas exclusiones no deben desaparecer del reporte aunque la suite pase. Una futura validación que dependa de cualquiera de ellas requerirá evidencia y un entorno adicionales. No corresponde llenar esas brechas con stubs y llamar al resultado «producción reproducida».

## Prueba definida

La suite [schema-baseline-b.integration.test.mjs](../../tests/m1/schema-baseline-b.integration.test.mjs) exige un cluster independiente sin fixture A, sin handler simulado y sin grants artificiales sobre el gateway. Antes de instalar M1 verifica huellas, rol inicial, roles/ACL y la igualdad del catálogo seleccionado con las capturas. También verifica que todas las tablas estén vacías.

Ejecuta después los tres archivos de migración íntegros, incluyendo sus límites de transacción, como `postgres NOSUPERUSER`. Después de cada uno compara nuevamente el catálogo legacy seleccionado y comprueba ausencia de filas. Esta comparación incluye restricciones, funciones, triggers y permisos: no se limita al nombre de las tablas. Al terminar comprueba las seis tablas M1 vacías, su propietario y FORCE RLS, la denegación de acceso a `anon`/`authenticated`/`service_role`, la falta de grants legacy al propietario runtime y la revocación de CREATE/SET/INHERIT temporales.

Se llama al handler instalado únicamente para comprobar su rechazo `COMMAND_NOT_IMPLEMENTED`; no se lo reemplaza y no se habilitan efectos comerciales. Se comprueba también el comportamiento de la definición real de `auth.uid`: claims ausentes, fallback al JSON, prioridad del claim individual y rechazo de JSON inválido. Los valores usados son sintéticos y sólo de sesión.

La fixture A conserva una finalidad diferente: escenarios funcionales, concurrencia e idempotencia sobre agregados y datos sintéticos. La capa B aporta la compatibilidad del esquema y del contexto de permisos observado. Ninguna de las dos autoriza M1-04, encendido de autoridad, integración legacy, envío de mensajes, deploy ni cambios remotos.

## Reproducción y estado

`python tests/m1/fixtures/schema-baseline-b/build.py` regenera únicamente archivos locales a partir de `source.json`; no conecta a ninguna base. El runner de integración reconoce el nombre de la suite y selecciona su bootstrap y rol inicial. El comando y el ambiente de ejecución se documentan en [el harness](../../tests/m1/harness/README.md). Las migraciones transportadas deben conservar sus hashes, incluidos los ajustes de M1-02/03 que surjan de fallos reales de validación.

Los nueve eventos históricos mencionados en BL-06 no prueban que hayan sido vendedores, que se hayan enviado mensajes, que existiera ilegitimidad ni que hubiera un único consumidor. BL-06 conserva su condición P0 respecto de la capacidad backend observada; esta prueba schema-only no la cierra y no aporta nueva evidencia de uso.
