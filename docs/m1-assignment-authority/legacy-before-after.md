# M1-04A — revisión de acceso y convivencia

Esta revisión cubre las candidatas `20260918033251_m1_assignment_adoption_guard.sql` y `20260918033407_m1_assignment_commands.sql`, comparadas con las definiciones/ACL capturadas en M0 y la matriz `docs/m1-assignment-authority/writer-matrix.md`. Describe el código revisado; los resultados DB y su recuento pertenecen al informe del harness aislado. No certifica consumidores, frontend ni producción.

## Objetos legacy: before / after

| Objeto | Before | After y alcance |
| --- | --- | --- |
| `private.current_user_can_manage_whatsapp(uuid)` | Seller activo dueño obtiene permiso; admin/supervisor conservan su rama | La rama seller agrega **ausencia de adopción durable de Assignment**. Sigue siendo SQL STABLE y sin locks, compatible con lecturas GET/HEAD/read-only. Runtime presente, gate `ready` o gate en `paused` no sustituyen ni borran el hecho de adopción |
| `public.set_whatsapp_conversation_mode(uuid,text)` | Comprueba permiso y escribe modo/evento; no bloquea lead antes de autorizar | Agrega `leads FOR SHARE` antes de comprobar permiso. Firma, retorno, owner, ACL y semántica de modos permanecen. El lock y el toque técnico del lead durante adopción cierran la escritura con snapshot anterior; no se modifica el sender |
| `private.start_contact_sequence_after_assignment()`; trigger existente `leads_start_contact_sequence` | UPDATE de owner puede invocar `start_lead_crm_cycle` y reiniciar estado/protocolo | En lead adoptado sólo admite cambio con receipt privado de Assign/Transfer y retorna sin iniciar ciclo. Sin adopción conserva el cuerpo legacy. La definición del trigger existente no cambia |
| `public.complete_contact_task(uuid,text,text)` | Autoriza con `task.seller_user_id` histórico | Bloquea lead antes de task y revalida la fila bloqueada. Para lead adoptado exige seller activo dueño actual; conserva seller histórico y todos los resultados comerciales. Sus wrappers heredan el lock durante la transacción |
| `public.record_contact_answer_with_transition` — base de 14 argumentos | Autoriza con seller histórico de task; después bloquea CRM | Misma adaptación de owner/locks. El overload de 15 argumentos sigue delegando sin cambios; no se modifica transición, agenda, entrevista ni seña |
| `public.record_lead_follow_up` — 14 argumentos | Comprueba owner sin lock y después modifica CRM | Agrega assertion/lock del lead antes de autorizar. El cuerpo de resultados permanece intacto |
| `public.refresh_due_contact_protocols()` | Selecciona secuencias por seller histórico y modifica tareas/estado | Para leads adoptados selecciona por owner actual; bloquea lead antes de secuencia y vuelve a comprobar elegibilidad después de esperar. Mantiene resultados del reloj, procedencia histórica y actividad de sistema |
| `lead_contact_tasks_read_management_or_owner`, `lead_contact_sequences_read_management_or_owner`, `lead_assignments_read_management_or_owner` | Lectura de management o seller histórico activo | Conserva **íntegra** esa rama y agrega lectura para seller activo dueño actual del lead adoptado, sin `sales_cases`. A conserva lectura histórica permitida; B obtiene contexto y obligaciones. Esta ampliación de lectura no autoriza a A a mutar |

No se reemplazan los cuerpos de `assign_lead_to_seller`, `reassign_leads_to_seller` ni `assign_lead_to_seller_with_reason`: sus escrituras encuentran la frontera de tabla del lead adoptado. Tampoco se cambian las policies de `leads`, `lead_crm`, presupuestos o tasaciones para ampliar capacidades.

## Guardas nuevas y permisos

| Trigger nuevo | Tabla/operación | Efecto |
| --- | --- | --- |
| `leads_assignment_owner_fence` | UPDATE de owner, assigned_by o assigned_at en `leads` | Para adoptados exige contexto privado del comando, destino/actor/from-owner y timestamps válidos; un GUC, JWT o routing_reason no constituye autorización |
| `lead_assignments_runtime_fence` | INSERT/UPDATE/DELETE de historial | En adoptados admite sólo INSERT compatible con el receipt Assign/Transfer; bloquea edición/borrado de hechos existentes |
| `lead_assignments_runtime_truncate_fence` | TRUNCATE de historial | Impide eliminar historia adoptada. Rechaza REPEATABLE READ/SERIALIZABLE para evitar omitir filas invisibles al snapshot; utiliza NOWAIT para hacer visible la contención |
| `lead_crm_assignment_current_owner` | INSERT/UPDATE/DELETE CRM | Revalida al seller actual en leads adoptados y revierte la transacción del exowner que autorizó antes de Transfer; cubre las rutas demostradas de edición tardía sin cambiar sus resultados |
| `sales_quotes_assignment_current_owner` | INSERT/UPDATE/DELETE presupuesto | Cierra el UPDATE de A permitido por la policy legacy basada sólo en seller histórico/draft |
| `vehicle_appraisals_assignment_current_owner` | INSERT/UPDATE/DELETE tasación | Cierra la carrera entre el chequeo inicial de owner de `save_lead_vehicle_appraisal` y su escritura |

Las últimas tres guardas son restrictivas para el principal seller identificado mediante `auth.uid()` y `profiles`. No otorgan permisos ni sustituyen las reglas independientes de management, administración de ventas o ejecuciones de sistema. Los otros writers comerciales no se convierten en comandos M1.

Los cuatro RPC/helpers legacy de contacto conservan owner `postgres` y sus ACL capturadas: `complete_contact_task` continúa sin EXECUTE para authenticated; los tres RPC públicos restantes lo conservan. Los helpers nuevos de assertion/trigger son privados, owner postgres y sin EXECUTE de PUBLIC/anon/authenticated/service_role. Sólo `crm_assignment_current_owner_read(uuid)` otorga EXECUTE a authenticated, para un booleano de lectura sin locks. No se otorgan escrituras legacy a `crm_runtime_owner` ni se abre el gateway a usuarios por instalar la candidata.

La adopción es una operación técnica cerrada que exige el principal real `session_user=postgres`, gate explícito del lead y revisión/política válida. Su hecho es inmutable y no se borra al pausar. La capacidad de ejecución comercial usa receipt en evaluación, flag privado, transaction ID y backend PID; no puede transportarse en el payload. La membresía temporal del migrador se restaura con INHERIT/SET false y `crm_runtime_owner` permanece NOLOGIN.

## Locks, lecturas y límites

Las entradas de mutación toman `lead FOR SHARE` incluso antes de adopción; después toman task/CRM. Esto conserva las reglas comerciales legacy, pero agrega serialización observable y debe contarse como cambio técnico de convivencia. El gateway toma runtime y luego `lead FOR UPDATE`; no bloquea filas comerciales preservadas al inspeccionarlas. Ninguna guarda legacy toma un lock de runtime después de bloquear CRM/task. Se evita así la inversión específica runtime/lead/CRM; esto no certifica ausencia de todos los deadlocks históricos entre writers de contacto.

Leer el transcript de `lead_messages` sigue siendo una capacidad comercial separada: su policy existente depende del owner vigente y restricciones de venta, no de `current_user_can_manage_whatsapp`. B puede conservar lectura legítima del transcript sin adquirir control del canal. Las policies de controls/events de WhatsApp siguen usando el permiso restrictivo. No se reescribe `lead_messages` ni su policy para lograr el resultado.

Las ACL legacy capturadas incluyen privilegios de tabla amplios —por ejemplo en `lead_messages` y `whatsapp_conversation_events`— que esta candidata no revoca globalmente. RLS de filas y rechazo del RPC no prueban que desapareció toda capacidad SQL privilegiada; TRUNCATE no equivale a DELETE bajo RLS. Tampoco se cancelan requests externos ya autorizados antes de la adopción ni se verifica el envío real del endpoint. Estas limitaciones impiden presentar M1-04A como cierre general del canal o de BL-06.

Las versiones nuevas protegen los tres comandos de Assignment. Las ediciones comerciales legacy no pasan a incrementar `aggregate_version`: el lock serializa ownership frente a las rutas cubiertas, pero no constituye CAS general de CRM. Preservar presupuestos/documentos tampoco acredita que B tenga toda la experiencia de edición de esos antecedentes; sus policies funcionales y el frontend siguen fuera de esta certificación. La elegibilidad inicial de Assign fue reforzada con cierre, agenda/contacto y antecedentes de tasks, quotes, applications y appraisals, sin agregar resets.

## Writers y blockers

| Grupo de la matriz M0 | Cobertura y límite |
| --- | --- |
| OW-01; OW-02/03 cuando escriben owner/historia del lead adoptado | Frontera de tabla rechaza el writer legacy fuera del receipt; no representa migración completa de reactivación ni Recall. Una excepción SQL revierte la transacción; la prueba de cada ruta debe identificarse por separado |
| OW-04–07, altas legacy | Leads nuevos sin adopción mantienen la convivencia; no se proclama cutover global de altas/ventas/administración. Historia añadida a un lead ya adoptado sí encuentra el fence |
| OW-08 webhook; OW-09 REST management; OW-10 DML privilegiado ordinario | Los cambios de owner/historia en adoptados encuentran las mismas guardas. No se adapta ni se certifica el manejo externo del rechazo; DDL/propiedad privilegiada puede retirar controles y requiere inventario |
| OW-11 Apps Script; OW-12 otros consumidores externos | No caracterizados exhaustivamente. No se infiere su ausencia ni se los da por cerrados por tener triggers locales |

| Blocker | Estado mantenido |
| --- | --- |
| BL-01 | Abierto: deployment/build/frontend efectivos |
| BL-02 | Abierto: Apps Script/Sheets, revisiones, triggers y custodio |
| BL-03 | Abierto: principals, credenciales y consumidores privilegiados |
| BL-04 | Abierto: productor/dispatcher y binding efectivo de credenciales |
| BL-05 | Abierto: trabajo en vuelo, quiesce e intentos de resultado desconocido |
| BL-06 | **Abierto / P0**: necesidad, consumidores y contexto de uso human; la guarda local no certifica ese inventario |
| BL-07 | Abierto: configuración y manifest efectivo de runtime |
| BL-08 | Abierto para rollout: el laboratorio aislado no acredita aislamiento de frontend/QA/despliegue |

La revisión inicial fue independiente y sólo de lectura; después se autorizó y redactó el fragmento acotado de acceso, revisado también por otro agente. No hubo ejecución remota de negocio, escritura productiva, push, deploy ni modificación de emisor desde esta subtarea. Una regresión local no acredita el estado de los consumidores productivos. No existe autorización de cutover.
