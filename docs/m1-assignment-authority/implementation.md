# M1-04A: contratos implementados y límites de autoridad

Fecha: 2026-09-18. Rama local `feat/m1-runtime-foundation`. Base de esta entrega: `ef4b59b86467f3c29064e02f3cf22127a2a20f97`; fundación certificada `292e1f8a435a07d104e990b129707fbfffc1a795`. Candidatas instaladas sólo en PostgreSQL descartable. No existe autorización de cutover. El diagnóstico previo se conserva en [scope-block-before-authorization.md](scope-block-before-authorization.md).

## A. Adopción durable y guarda restrictiva

La candidata `20260918033251_m1_assignment_adoption_guard.sql` agrega `private.crm_assignment_adoptions`. Una fila representa un hecho técnico explícito de adopción del dominio Assignment, independiente de las filas de metadata runtime y del modo actual del gate.

| Campo | Procedencia y restricción |
|---|---|
| `lead_id` | PK; FK a runtime, DELETE RESTRICT |
| `operation_id` | UUID único de la operación técnica; no es un comando comercial |
| `adopted_at` | `clock_timestamp()` del servidor |
| `executor_principal` | `session_user` real, exactamente `postgres` |
| `gate_scope_key` | Exactamente `lead:<uuid>` |
| `writer_epoch`, `gate_revision` | Snapshot del gate explícito del lead; epoch positivo; enteros seguros |
| `contract_version` | Exactamente `assignment.v1` |
| `policy_version`, `baseline_manifest_id` | Política y evidencia del gate verificados en servidor |
| `reason` | Motivo obligatorio de la operación técnica |

`crm_adopt_assignment_lead(lead_id, operation_id, expected_gate_revision, reason)` exige sesión técnica postgres, gate explícito `command_owner/lead:<uuid>` authoritative, contrato correcto, revisión esperada y misma política del runtime. Nadie activa ese gate al instalar las candidatas. Sólo este helper cerrado inserta la adopción en la ruta propuesta; un DBA capaz de cambiar DDL sigue siendo una identidad de confianza, no un atacante contenido por RLS.

La tabla tiene owner `crm_runtime_owner`, RLS y FORCE RLS, policy sólo para ese owner, sin grants API y triggers que rechazan UPDATE/DELETE/TRUNCATE. La función técnica sólo es ejecutable por postgres; ni `SET ROLE` ni una claim que diga postgres sustituyen `session_user`. Cambiar un payload, header, GUC, owner, acuse o futuro handoff no inserta ni elimina el hecho. La adopción no se limpia al pausar gates. El replay técnico devuelve el registro original sin cambiar su timestamp ni volver a tocar el lead.

Antes, `current_user_can_manage_whatsapp` autorizaba un perfil activo admin/supervisor **o** seller cuyo ID coincidía con owner. Después conserva literalmente la rama gerencial y agrega `AND NOT crm_assignment_is_adopted(lead_id)` exclusivamente a la rama seller. El helper continúa SQL STABLE y apto para transacciones READ ONLY. No se crea un modo humano, operador ni permiso de canal nuevo.

| Escenario | Resultado seller por ownership |
|---|---|
| Sin adopción, aunque exista runtime o gate authoritative | Semántica legacy: sólo owner activo |
| Adoptado, A→B, NULL→B, B→A, acuse | Denegado |
| Adoptado, gate paused/observe/ready | Denegado; writer runtime detenido |
| Rollback de una transacción comercial posterior | Conserva la adopción ya comprometida y la denegación |
| Admin/supervisor activo | Rama legacy sin cambio funcional |

La RPC `set_whatsapp_conversation_mode(uuid,text)` conserva firma, owner, grants y cuerpo de negocio; agrega un lock de lead FOR SHARE **antes** del permiso. La primera adopción crea una nueva versión física del lead mediante un UPDATE técnico de `updated_at`; el trigger existente determina ese timestamp. Un snapshot REPEATABLE READ anterior no puede bloquear y modificar esa fila después de la adopción sin recibir 40001. En READ COMMITTED, toma de modo y adopción se serializan. Un lock dentro del helper de lectura habría roto GET/HEAD READ ONLY; por eso está en la frontera mutante. [Contrato de transacciones PostgREST](https://docs.postgrest.org/en/stable/references/transactions.html).

La denegación del helper y sus policies corresponde a snapshots que ya ven la adopción. Una transacción REPEATABLE READ anterior puede conservar lectura histórica; la RPC mutante toma el lock y falla 40001, y tras rollback la sesión ve la denegación. No se promete revocación retroactiva de lecturas ya autorizadas.

La adopción no cambia owner, etapa, agenda, seña, protocolo ni estado de canal. Sí cambia `leads.updated_at` técnico una vez: no se presenta como una operación sin ninguna escritura legacy.

Para que la adopción sea una frontera real, A instala fences sobre campos owner/by/assigned_at e historial de asignación. Antes de B, una cohorte adoptada queda cerrada a cambios de ownership. B sólo permite las escrituras respaldadas por el receipt autorizado. No existe intervalo adoptado en el que el writer legacy mantenga autoridad de Assignment.

## B. Comandos canónicos

`20260918033407_m1_assignment_commands.sql` agrega el normalizador y ejecutor de Assignment y adapta el gateway cerrado `crm_submit_command(jsonb)`. Los ocho cuerpos SQL del núcleo certificado permanecen idénticos. El contrato JavaScript se incorpora en un módulo separado; `contracts.mjs` no cambia.

Envelope schema 1: command ID, tipo, key, scope de un lead, policy version, payload cerrado, correlation y causation opcionales. `expected_versions` contiene `lead_aggregate_version`, `assignment_epoch` y exactamente un gate `command_owner` del mismo lead, con sus seis campos/versiones y contrato `assignment.v1`. No acepta actor, rol, adopción, assigned_by ni proof de ejecución desde el caller.

| Comando | Autoridad/precondiciones | Payload | Efectos permitidos |
|---|---|---|---|
| `AssignLead` | Admin/supervisor activo; destino seller activo; lead sin owner y realmente nuevo/elegible | `seller_user_id`, `reason` | Owner/by; primer assigned_at; assignment histórico, actividad, evento; aggregate+1 y assignment_epoch+1; limpia acuse vigente |
| `TransferLead` | Admin/supervisor activo; owner esperado A; B activo y distinto; oportunidad no terminal/administrada | `from_seller_user_id`, `to_seller_user_id`, `reason` | Owner/by; **conserva assigned_at**; append de assignment/actividad/evento; aggregate+1 y assignment_epoch+1; limpia acuse vigente |
| `AcknowledgeLeadAssignment` | Seller activo que sigue siendo owner; versiones vigentes; sin acuse actual | `{}` | Registra received_at/by; aggregate+1; assignment_epoch sin cambio; evento separado; no escribe lead ni historial legacy |

Los tres exigen adopción durable y gate authoritative explícito/versionado. No hay composición con protocolo ni ciclo en Assign inicial: esta rama sólo asigna. Transfer y Assign rechazan `venta/desistir/invalido` o existencia de sales_cases; no reactivan terminales. Transfer preserva DNC y hechos existentes. Assign requiere CRM `nuevo`, no DNC ni closed_at, sin asignaciones/secuencias/tareas/solicitudes de venta/presupuestos/dateros/tasaciones previos ni próxima acción, último contacto, seña, entrevista o fecha de solicitud. NULL owner por sí solo no basta. Perfil y mensajes espontáneos de IA no se reinterpretan como aceptación humana.

La autoridad gerencial conserva el scope global que tiene el backend capturado; esta rama no inventa territorios/equipos ni los declara certificados. El seller sólo puede acusar su asignación; no autoasignarse ni transferir. Acknowledgement no acepta handoff ni resuelve obligaciones. No hay efectos externos: `obligations=[]`, `effects=[]`.

Eventos mínimos: `LeadAssigned`, `LeadTransferred`, `LeadAssignmentAcknowledged`, aggregate `lead_assignment`. Guardan actor real, responsable en ese momento, owner anterior/nuevo, assignment histórico cuando corresponde, motivo, timestamp, versión/epoch y correlation/causation. Las tareas y secuencias antiguas conservan seller/actor/timestamps; B puede ser resolver futuro sin convertirse en autor de lo que hizo A.

## Receipt, idempotencia y capacidad interna

El hash canónico deriva del intent normalizado y actor server-side. Excluye command ID, key y correlation; conserva expected versions, payload, policy y causation. Misma intención/key devuelve el resultado original; mismo command ID/key con otro intent produce `IDEMPOTENCY_KEY_REUSED`. Un nuevo command ID con la misma key no crea una segunda fila ni efecto. Replay revalida actor activo, rol y derecho actual de lectura antes de devolver el resultado; no reejecuta por un cambio posterior de gate, destino o versiones. Una nueva key para un acuse ya vigente recibe `ASSIGNMENT_ALREADY_ACKNOWLEDGED`.

Se agregan a receipts `execution_xid xid8`, `execution_backend_pid integer` y `assignment_effect_authorized boolean`. Los receipts anteriores mantienen NULL/NULL/false, sin UPDATE histórico ni backfill. Los nuevos toman xid/pid del servidor. El flag sólo puede ser true en un receipt evaluating de esos tres comandos; índice único parcial evita dos contextos activos por scope/xid/pid. El trigger diferido certificado impide commit de evaluating.

Después de actor/destino/adopción/gate/CAS, el engine marca el receipt autorizado. Los helpers postgres que escriben los campos cerrados de assignment verifican ese receipt, scope, xid8 y PID actuales. No tienen DML genérico ni reciben un rol del caller. El flag se desactiva en la misma actualización que vuelve terminal el receipt. Error de negocio retornado por el helper usa una subtransacción que revierte cualquier efecto previo; SQLSTATE transitorios no se convierten en un resultado comercial falso. Receipt, evento, owner, historial, actividad, versiones y acuse son una transacción.

Códigos principales: `VERSION_CONFLICT`, `WRITER_FENCED`, `ASSIGNMENT_NOT_ADOPTED`, `FORBIDDEN_COMMAND`, `FORBIDDEN_SCOPE`, `OWNER_CONFLICT`, `ASSIGNMENT_NOT_ELIGIBLE`, `TARGET_SELLER_INACTIVE`, `ASSIGNMENT_ALREADY_ACKNOWLEDGED`, `VERSION_EXHAUSTED` y errores de schema/idempotencia/policy. Conflicto CAS autorizado incluye versiones actuales. 40001/40P01/55P03 requieren rollback y retry de la **misma** intención/key; no generar una intención nueva silenciosamente.

## Locks y permisos

Orden nuevo: receipt → gate table SHARE → perfil actor SHARE → perfil destino SHARE → runtime FOR UPDATE → lead FOR UPDATE. El destino no puede quedar inactivo entre validación y commit. El gate table lock evita cambio de resolución de gates durante el comando; es deliberadamente conservador y puede limitar throughput. No hay benchmark de producción en esta entrega.

La transferencia no bloquea ni escribe CRM, tareas, presupuestos o documentos para preservarlos. Las fronteras legacy de autorización bloquean el lead antes de la mutación; guardas finales cierran el intervalo entre autorización anterior y escritura posterior en CRM/presupuestos/tasaciones. Una tasación real que ya pasó el chequeo inicial se rechaza si Transfer se comprometió antes de su escritura final. Los locks no incrementan versiones de otros dominios: CAS general de contacto/agenda/venta queda fuera de M1-04A.

`crm_runtime_owner` sigue NOLOGIN/NOBYPASSRLS, sin membresías para anon/authenticated/service_role ni DML amplio en tablas legacy. Gateway sin EXECUTE API por instalación; las pruebas conceden EXECUTE únicamente en fixture. Helpers internos con search_path vacío, propietarios explícitos y EXECUTE mínimo. El lector comercial `crm_assignment_current_owner_read` sí es ejecutable por authenticated para las tres policies afectadas: devuelve un boolean de scope y no concede gestión del canal. El helper de canal conserva su ACL existente.

## Convivencia y rollback compatible

1. Instalar A+B no siembra gates, adoptions, runtime de leads ni activa escritores. Sin adopción sigue el reset legacy observado; no se promete que ese reset sea el comportamiento objetivo.
2. Una futura adopción requerirá autorización de cutover independiente y cierre de sus blockers. Las rutas legacy que cambien owner/by/assigned_at o escriban historial sobre adoptados reciben `WRITER_FENCED`; no se inventa un comando/version actual para traducirlas automáticamente.
3. Pausar el gate detiene nuevas decisiones runtime. Replay autorizado recupera un resultado anterior; no realiza efectos nuevos. Se conservan adopciones, epochs, receipts, eventos, estado comercial y denial seller. Los fences permanecen.
4. No se entrega un down-migration que quite la guarda: después de adopción sería una restauración no autorizada de permisos. Una corrección técnica futura debe ser hacia adelante o mantener al menos A y sus hechos/fences; no bajar epochs ni borrar historia. El gateway puede seguir cerrado.
5. El laboratorio se revierte destruyendo VM y clusters; eso no es un procedimiento de rollback productivo.

## Diferencias y límites explícitos

- A extiende el CHECK certificado de gate para admitir authoritative **sólo** en `command_owner`, scope lead y `assignment.v1`; otros dominios/futuros emisores continúan cerrados. B extiende listas cerradas de command/event/aggregate y el dispatcher, sin modificar las tres migraciones certificadas.
- Locks nuevos en la RPC de modo y fronteras comerciales pueden introducir espera aun pre-adopción; no cambian el resultado de negocio pre-cutover observado. TRUNCATE del historial en REPEATABLE READ/SERIALIZABLE se rechaza incluso sin adopciones visibles: un snapshot viejo no permite demostrar ausencia de una adopción posterior. Es una restricción técnica explícita, no «ningún cambio imaginable» en legacy.
- El fixture combina capturas schema-only fechadas, no un snapshot atómico de toda producción. Reproduce cuerpos, ACL y triggers relevantes, no PostgREST desplegado, UI, Edge, servicios gerenciales o todo Supabase.
- Hash JS/SQL coincide para los intent válidos ejecutados. Algunos números inválidos se rechazan como `INVALID_ENVELOPE` en JS y `INVALID_VERSIONS` en SQL; no se afirma equivalencia de cada clasificación de error malformado. Ninguno se acepta ni obtiene hash aplicable.
- Se prueba el permiso backend requerido por la ruta humana, incluida la RPC directa y lectura de controles. No se ejecuta `whatsapp-human-message`. Una petición Edge ya autorizada antes de adoptar requiere caracterización/drenaje independiente; la guarda no cancela mágicamente trabajo en vuelo.
- Lectura de mensajes tiene una policy independiente del helper; no se afirma que el seller pierda toda lectura histórica. ACL legacy amplios, incluidos permisos de tabla TRUNCATE, no se rediseñan aquí; BL-06 sigue P0.
- Las tres policies comerciales agregan acceso del owner vigente a tareas/secuencias/asignaciones y conservan lectura histórica permitida. No certifican todas las vistas frontend, presupuesto/documentación histórica ni permisos administrativos futuros.
- Writers externos, Apps Script, webhook que vuelve a enviar un owner viejo y RPC de Recall/reactivación requieren caracterización antes de cutover. Estar fenced en la tabla no significa que su consumidor maneje correctamente ese rechazo.
