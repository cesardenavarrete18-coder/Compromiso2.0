> Documento histórico del diagnóstico anterior a la excepción autorizada. La implementación y evidencia posteriores están en [README.md](README.md); sus estados «pendiente/BLOCKED» describen aquel momento.

# M1-04A — writers de ownership y plan de regresión

Base de código: `292e1f8a435a07d104e990b129707fbfffc1a795`, rama `feat/m1-runtime-foundation`. Autorización: `Pasted markdown(20260917-193622).md`. Este documento caracteriza entradas existentes y pruebas necesarias; **no acredita una implementación ni la aceptación de M1-04A**. No se modificaron writers, policies ni migraciones para preparar esta matriz. Esta matriz reutiliza capturas anteriores; las recapturas puntuales de catálogo de la revisión global se documentan por separado en el README y no incluyen datos comerciales.

La matriz es completa para las definiciones SQL capturadas y los callers conocidos inspeccionados, no para consumidores externos desconocidos. BL-02 y BL-03 permanecen abiertos. El bloqueo de capacidad WhatsApp derivada de owner impide afirmar el requisito 19 sin una decisión de alcance; véase [architecture-boundary.md](architecture-boundary.md).

## 1. Fuentes y alcance de la evidencia

- Captura M0 `m01-db-baseline.json`: 108 definiciones completas, firmas, ACL, triggers y policies; grafo derivado `m01-sql-writer-graph.json`; matriz anterior `m01-writers-consumers.md`. Los tres artefactos están en el expediente de auditoría original. Las referencias `D:n` que siguen son líneas dentro de la definición `pg_get_functiondef` capturada, no líneas de un archivo SQL del repositorio.
- [Fuente B](../../tests/m1/fixtures/schema-baseline-b/source.json) y [bootstrap B](../../tests/m1/fixtures/schema-baseline-b/bootstrap.sql): schema relevante capturado después de M0. La comparación previa no encontró diferencias en las funciones compartidas. B es una frontera parcial: no contiene todas las funciones de esta matriz ni `lead_assignments`; no sirve como sustituto de una fixture ampliada de assignment.
- Callers: archivos del HEAD certificado, con líneas indicadas abajo. El webhook desplegado se inspeccionó separadamente durante M0; sus números de línea difieren de main. Las líneas de webhook de este documento corresponden **al repositorio**, no afirman que ese archivo sea el bundle actualmente desplegado.
- [Estado M0](../m1-runtime-foundation/m0-status.md): evidencia y límites de BL-01–08. No se infiere ausencia de un writer de una búsqueda sin resultados.

`Fenceable` significa que existe un punto de escritura identificable que podría quedar sujeto a una guarda transaccional de autoridad. **No significa fenced, migrado ni listo para cutover.** El inventario distingue cambio del owner de lead, historial de asignación y asignación de un item Recall; son hechos diferentes.

## 2. Siete escritores SQL directos de owner

| ID | Writer directo y evidencia actual | Entrada/caller conocido | Efecto y riesgo que debe caracterizarse |
| --- | --- | --- | --- |
| OW-01 | `private.assign_lead_to_seller_with_reason(uuid,uuid,uuid,text)`; D:36–59. [Migración portfolio](../../supabase/migrations/20260901131303_supervisor_portfolio_reassignment.sql), línea 5 | `public.assign_lead_to_seller(uuid,uuid)` y `public.reassign_leads_to_seller(uuid[],uuid,text)` | UPDATE owner/by/assigned_at/routing; INSERT assignment y actividad. Trigger posterior reinicia ciclo en transferencia normal. Es la ruta directa principal a separar del handler canónico |
| OW-02 | `public.reactivate_lead_cycle(uuid,uuid,text,boolean)`; D:35–53. [Corrección de reactivación](../../supabase/migrations/20260909094500_reactivate_lead_cycle_seller_change_fix.sql), línea 24 | Función pública callable; no caller frontend encontrado. Eso no prueba desuso | UPDATE owner/by/assigned_at/routing/closed_at; agrega assignment y actividad. Si cambia owner normalmente depende del trigger; mismo owner u override DNC llama al ciclo explícitamente. Un fence que sólo mire owner distinto no detecta toda esta ruta. Reactivar no se transforma implícitamente en TransferLead |
| OW-03 | `public.record_recall_attempt(uuid,text,text,timestamptz,text,timestamptz,text)`; D:93–118 y 135. [Compatibilidad Recall](../../supabase/migrations/20260909180500_recall_crm_v2_compatibility.sql), línea 116 | `vendedores/recalls.js:137` | Sólo rama `answered`: convierte item, cambia owner a quien responde, assigned_at/routing/closed_at, llama explícitamente a ciclo y después follow-up. Inserta historial. El trigger evita duplicar el ciclo por `recall_reactivated`. Rechazar ownership debe revertir **toda** la transacción, incluido intento y conversión; no autoriza rediseñar Recall |
| OW-04 | `public.create_manual_lead(text,text,text,text,text,text,uuid,timestamptz)`; D:27–53. [Agenda CRM](../../supabase/migrations/20260815120000_lead_crm_agenda.sql), línea 353 | `vendedores/supervisor/supervisor.js:1108` | INSERT de lead con owner opcional; si se asigna, inserta assignment y se genera protocolo inicial por trigger. También puede crear lead sin owner: no bloquear esa variante por un fence genérico de INSERT |
| OW-05 | `public.review_seller_lead_submission(uuid,boolean,text)`; D:35–46. [Import/Recall/submissions](../../supabase/migrations/20260818162216_lead_import_recall_and_seller_submissions.sql), línea 471 | `vendedores/supervisor/lead-bases.js:221` | Aprobación que crea lead nuevo: INSERT con owner del postulante y assignment. Si encuentra lead activo existente, agrega historia sin cambiar owner. No tratar ambas ramas como transferencia |
| OW-06 | `public.submit_prequalification_sale(uuid,text)`; D:59 y 91. [Draft de venta](../../supabase/migrations/20260818232855_provisional_sales_draft_workflow.sql), línea 9 | Selector `saleFunction` en `vendedores/app.js:1537–1540` | Si no reutiliza lead propio elegible, INSERT asignado al actor y assignment; luego solicitud/CRM Cierre. Está dentro de precalificación/venta, no de una pantalla de asignación. Un fence indiscriminado puede romper el alta de venta y flujos comerciales fuera de M1-04A |
| OW-07 | `public.create_completed_client_from_admin(jsonb)`; D:106. [Cliente completado administrativo](../../supabase/migrations/20260826190000_completed_client_admin_form.sql), línea 7 | `vendedores/admventas/completed-client.js:71` | INSERT lead con vendedor y assigned_at derivado de la fecha histórica de venta; no se observó INSERT en lead_assignments en esta función. No es una transferencia operativa. Un fence global puede bloquear la carga histórica administrativa |

Estas siete funciones escriben directamente el owner de `public.leads`; las dos RPC de OW-01 son entradas adicionales al mismo writer, no otros dos cuerpos de UPDATE. Todas deben caracterizarse para la futura frontera, pero M1-04A no autoriza implementar siete nuevos comandos de negocio.

### Entradas de OW-01 y discrepancia individual/masiva

| Entrada | Caller | Comportamiento efectivo |
| --- | --- | --- |
| `assign_lead_to_seller` | `vendedores/supervisor/supervisor.js:963`; tarjeta `:463` ofrece Asignar/Reasignar | Management y destino seller activo; delega al helper. No valida terminales CRM. Puede usar la misma RPC para asignación inicial y transferencia |
| `reassign_leads_to_seller` con un ID | Mismo archivo `:780` | Detalle individual usa la semántica del batch. Mensaje `:789`: «protocolo de contacto reiniciado», correcto para ese legacy, incompatible con prometer TransferLead preservador |
| `reassign_leads_to_seller` con varios IDs | Mismo archivo `:1031` | Lista no vacía, máximo 500, sin nulos/duplicados; motivo y seller activo; bloquea lead/CRM por UUID; rechaza no asignado, mismo destino y `venta/desistir/invalido`; después llama al helper para cada ID |

La validación de destino activo no mantiene un lock de perfil contra inactivación concurrente. La atomicidad del batch no provee por sí sola CAS ni protege una intención basada en una versión vieja. No se inventa un contrato batch nuevo en esta fase; cualquier convivencia del caller viejo debe seguir explícita.

## 3. Otras rutas conocidas y límites de exhaustividad

| ID | Ruta | Evidencia | Clasificación y futuro fence |
| --- | --- | --- | --- |
| OW-08 | Edge `whatsapp-webhook` | Repositorio `supabase/functions/whatsapp-webhook/index.ts:436,669–709,722–723,769–776` | Lee snapshot de owner; puede asignar por código/nombre o volver a escribir el owner viejo en cualquier UPDATE posterior; inserta assignment por otra llamada HTTP. Writer de owner e historial conocido, fuera de implementación M1-04A. Gate futuro debe detectar una escritura obsoleta; rechazarla hoy produce `continue` y omite el procesamiento posterior de ese mensaje. No declarar integración lista sin adaptar/validar ese consumidor |
| OW-09 | DML REST management | Policies `leads_management_insert`, `leads_management_update`, `lead_assignments_management_insert` | Permite cambios directos con identidad management, sin pasar por RPC de asignación. Fence futuro de campos/hechos, no sólo de nombres de RPC. No se detectó un PATCH directo de owner en el frontend inspeccionado; la capacidad existe aunque falte caller observado |
| OW-10 | `service_role` y SQL privilegiado | ACL/grants/roles de M0 | RLS no sustituye una frontera frente a estos principals. DML normal es caracterizable; un principal con DDL/ownership puede retirar guardas. BL-03 requiere inventario de identidades, credenciales, custodios y uso. No se promete aislamiento contra un DBA malicioso mediante un trigger |
| OW-11 | Apps Script / Sheets | `script.js:185`, `lead-capture.js:283`, destino configurado en `lead-capture-config.js:2` | POST conocido al receptor Apps Script; código downstream, triggers, revisiones y destinos no disponibles. **No demostrado** que escriba owner, tampoco demostrado que no lo haga. BL-02 abierto; no clasificar como writer cerrado o innecesario |
| OW-12 | Otros externos privilegiados no caracterizados | BL-03 | Capacidad y custodio distintos: inspeccionar ACL/ausencia de FDW no acredita la lista de clientes REST, SQL, jobs y Dashboard. Pueden cambiar owner o historial. Inventario pendiente, sin cifra inventada de writers externos |

El historial de asignación requiere protección propia: OW-01/02/03/04/05/06/08 insertan hechos; REST management permite INSERT adicional; privilegiados pueden hacer otros DML. Evitar duplicados en owner no prueba que no se falsificó o duplicó `lead_assignments`. Acknowledge es un hecho nuevo separado: no reinterpretar un INSERT legacy ni la lectura de una fila como acuse recibido.

### Rutas relacionadas que no escriben owner de lead

| Ruta | Evidencia | Distinción necesaria |
| --- | --- | --- |
| `public.import_lead_rows` → `private.import_lead_rows_raw` | `vendedores/supervisor/lead-bases.js:121`; definición raw D:70/93 | INSERT de leads sin owner; merge agrega historia. La importación a base Recall no equivale a asignación comercial. Conservar importación sin dueño; no bloquearla por escuchar todos los INSERT |
| `public.claim_whatsapp_lead` | Webhook `:387`; definición capturada | Reclama/crea lead sin owner. La asignación llega después en OW-08. No confundir identidad inicial con asignación |
| `public.assign_recall_items` | `vendedores/supervisor/lead-bases.js:208`; definición D:25/37/57 | Cambia `lead_recall_items.assigned_seller_user_id` y panel, no `leads.assigned_seller_user_id`. Ownership del lead sólo cambia después en OW-03 answered |
| `public.submit_seller_lead_candidate` | `vendedores/recalls.js:154` | Crea una propuesta; aprobación OW-05 puede crear lead asignado. Propuesta no es autoasignación de lead |
| `private.apply_lead_opt_out`, `public.revise_sales_minute`, `public.update_assigned_lead_name` | Definiciones M0 | Escriben otros campos del lead. No son writers de owner por aparecer en una búsqueda de UPDATE leads. El guard de owner no debe congelar contacto, documentos o nombre fuera de su alcance |

## 4. Cadena de reset, historial y acceso futuro

`leads_start_contact_sequence` se ejecuta AFTER INSERT OR UPDATE OF `assigned_seller_user_id`. Su helper `private.start_contact_sequence_after_assignment()` llama a `private.start_lead_crm_cycle()` cuando cambia vendedor, salvo excepciones DNC/venta/Recall. El ciclo cancela secuencia activa y tasks pending/scheduled, limpia CRM/agenda/entrevista/seña/venta reflejada, reabre playbook y crea secuencia. El snapshot previo en una actividad **no preserva** el estado comercial vigente, las tareas pendientes ni los IDs del recorrido activo. El detalle de triggers transitivos y excepciones consta en [architecture-boundary.md](architecture-boundary.md).

Un INSERT asignado inicia protocolo por otro branch; un UPDATE de NULL a vendedor pasa hoy por el reset completo. Por eso NULL owner no acredita que se trate de un lead realmente nuevo. Acknowledge no debe ejecutar ninguno de esos branches.

| Superficie de acceso | Evidencia actual | Consecuencia de preservar protocolo al transferir sin adaptar autorización |
| --- | --- | --- |
| SELECT tasks/sequences/assignment history | Policies `lead_contact_tasks_read_management_or_owner`, `lead_contact_sequences_read_management_or_owner`, `lead_assignments_read_management_or_owner`: comparan `seller_user_id` histórico con auth.uid | B no necesariamente verá obligaciones creadas bajo A; A conserva lectura histórica. Mantener historia no significa permitir mutación futura; no corregir con UPDATE masivo de seller histórico |
| SELECT leads/CRM | `leads_read_management_or_owner`, `lead_crm_read_management_or_owner`: owner actual, además de restricciones por sales_case | B obtiene scope comercial actual; no demuestra que todos los RPC internos comprueben ese mismo owner |
| Resultado de tarea | `public.complete_contact_task`: D:13–15 bloquea task y valida su seller histórico. Es helper sin EXECUTE autenticado; wrappers `record_contact_task_result` y `complete_contact_task_with_follow_up` sí son callable y lo invocan | A puede seguir satisfaciendo la comprobación histórica, B puede ser rechazado. RLS de SELECT no remedia una función SECURITY DEFINER. Se necesita resolver futuro + epoch y revalidación bajo locks, sin rediseñar resultados comerciales |
| Respuesta con transición | Overload base `record_contact_answer_with_transition`: D:16–19 valida task seller histórico y luego bloquea CRM; el otro overload delega | Mismo problema A/B. La fixture no puede sustituirlo por un stub que ya valide owner actual |
| Edición general | `record_lead_follow_up`: D:11 verifica owner sin lock; D:24 bloquea CRM después | Carrera posible: A autoriza, Transfer cambia owner, A muta CRM. No se resuelve sólo versionando Transfer. La prueba debe forzar ese interleaving con el cuerpo legacy real |
| Capacidad WhatsApp | `private.current_user_can_manage_whatsapp`: D:11–15 admite seller activo si es owner. `set_whatsapp_conversation_mode`: D:11 lo usa y permite human/ai | Transfer puede otorgar a B capacidad de intervención sin tocar channel authority ni su epoch. Es bloqueo del requisito 19, no sólo un riesgo de interfaz. No se cambia canal en esta subtarea |

**Frontera de alcance pendiente:** adecuar la validación de owner de un writer legacy no autoriza convertirlo en un comando nuevo de contacto/agenda/venta. Si la mínima separación no puede realizarse dentro de los permisos ratificados, se documenta y se detiene ese requisito. Una guarda genérica que rechace todas las mutaciones no demuestra que B pueda trabajar y congela writers no autorizados para migración.

## 5. Reglas para futura cobertura del fence

1. Gate inactivo: comparar antes/después con definiciones legacy reales. Instalar infraestructura no cambia el reset, mensajes ni acceso productivo sin cutover autorizado.
2. Gate aislado autoritativo: acreditar contexto privado del comando, versiones y actor; no aceptar un GUC, routing_reason o flag de payload como credencial. Probar owner, assigned_by, assigned_at e historial; no sólo owner distinto.
3. Limitar el guard a la semántica de asignación y al scope del dominio. Imports sin owner, cambios de identidad/consentimiento y actividades ajenas no deben bloquearse por coincidencia de tabla.
4. Caracterizar OW-02–07 como transacciones completas. Cuando una ruta futura no sea compatible, rechazar con rollback y diagnóstico; no migrarla parcialmente ni habilitar un bypass service_role. Un rechazo puede impedir ventas/Recall/administración: por eso no habilitar el gate hasta decidir su convivencia.
5. El fence final de tabla no reemplaza locks de entrada. Insertar locks de runtime/gates desde un trigger después de que legacy bloqueó lead/CRM puede invertir el orden del núcleo y crear deadlocks.
6. No cerrar BL-02/03 con una prueba sintética. No cerrar BL-06 comprobando únicamente que las columnas de canal no cambiaron. BL-01 sigue condicionando conocer qué callers frontend están efectivamente servidos.

## 6. Oráculos legacy que no son aceptación de TransferLead

Las pruebas actuales leen migraciones históricas específicas, no una composición del schema efectivo. Pueden pasar simultáneamente oráculos de distintas épocas. Se conservan como caracterización del camino que nombran; no se borra una prueba sólo porque el nuevo comando deba tener otra semántica.

| Archivo y línea | Oracle existente | Clasificación para M1-04A |
| --- | --- | --- |
| `tests/canonical-next-action.test.mjs:193` | «la reasignación Supervisor conserva el reinicio canónico» | Histórico pre-cutover; TransferLead debe tener oracle contrario: conservar recorrido y agenda |
| `tests/supervisor-portfolio-followup.test.mjs:285` | «Cambiar assigned_seller_user_id conserva el reinicio canónico del protocolo» | Histórico; no es criterio nuevo del campo owner ni prueba DB |
| `tests/crm-v2-workspace.test.mjs:84` | «una transferencia autorizada inicia el nuevo ciclo sin usar la matriz comercial» | Histórico; no trasladarlo a TransferLead |
| `tests/crm-v2-recall-assignment-order.test.mjs:12` | Mantiene branch normal assignment/transfer/reactivation | Histórico de la función legacy. La excepción Recall sigue requiriendo caracterización; no autoriza reset runtime |
| `tests/crm-v2-release-hardening.test.mjs:229,344` | Nuevo ciclo limpia campos/playbook y deja un único protocolo activo | Válido sólo para el helper explícito de ciclo que prueba. Lo incorrecto sería llamar ese helper desde Transfer, no necesariamente retirar toda su semántica legacy |
| `tests/supervisor-crm-v2-compat.test.mjs:150` | Reasignación hereda opt-out del ciclo | DNC sigue siendo una restricción; nueva ruta debe comprobarla explícitamente sin depender de reinicio |
| `tests/crm-v2-recall-production-compat.test.mjs:42,48`; release-hardening `:264` | Recall contestado/reactivación explícita abre ciclo y aplica contacto efectivo | Fuera del nuevo comando de transferencia. No cambiar globalmente estos oráculos para dar por migrado Recall |
| `tests/protocol-advisory-layer.integration.sql:171–206` | Reasignar con agenda conserva acción y no abre protocolo; sin agenda sí abre uno | **Contradicción histórica interna:** el helper vivo posterior llama al reset para transferencia normal y borra agenda. Caracterizar baseline antes de usar este SQL. No declarar una falla nueva M1 por un oracle que baseline actual no cumple |

No se modificó ningún oracle en esta revisión. Su reclasificación queda explícita aquí. Los oráculos de Base Fría/protocolo de versiones anteriores tampoco certifican M3 ni la política v2 de 40%.

## 7. Regresión ejecutable sin DB ni red

La selección que ejecuta el agente raíz usa `node:test`, lectura de archivos y, en algunas suites, funciones JS extraídas en `node:vm` o mocks. Inspección de imports/cuerpo: no inicia DB ni conecta al backend. **Son pruebas puras/de fuente; ningún PASS acredita RLS, trigger efectivo, concurrencia SQL o permiso de canal.** Los resultados exactos se publican separadamente en [evidence/legacy-regression.json](evidence/legacy-regression.json) y [evidence/foundation-pure.json](evidence/foundation-pure.json).

| Suite | Evidencia que aporta | Límite |
| --- | --- | --- |
| `seller-isolation-and-desist-recall.test.mjs` | Scope de vistas/queries, sesión vieja descartada, separación ventas/Recall | No intenta escritura como exowner mediante PostgreSQL |
| `supervisor-portfolio-followup.test.mjs` | Caller batch, selección terminal, reason/target, próxima acción y atribución | Incluye oracle histórico de reset; validaciones mayormente fuente/modelo JS |
| `canonical-next-action.test.mjs` | Prioridad agenda manual, protocolo como respaldo, callers CRM/supervisor | No prueba preservación de filas tras UPDATE owner |
| `crm-v2-recall-assignment-order.test.mjs` | Orden/excepción del trigger para Recall | Lee migración particular, no ejecuta Recall |
| `crm-v2-recall-production-compat.test.mjs` | Contrato fuente de Recall answered y contacto efectivo | Su nombre no significa ejecución en producción |
| `crm-shared-datero.test.mjs` | Persistencia de CRM/precalificación, identidad de campaña y formularios | No abre venta real ni prueba permisos después de Transfer |
| `crm-v2-protocol-hardening.test.mjs` | Guardas fuente de contacto y presencia de assertions en fixture SQL | Leer `crm-v2-contact-answer.integration.sql` no equivale a ejecutar sus assertions |
| `crm-v2-release-hardening.test.mjs` | Cierre/Seña-only (`:181`), solicitud pendiente/desistir (`:190`), no modificar importe/fecha de seña al enviar venta (`:304`), venta idempotente (`:310`) | Cubre regresión de fuente seña/venta, **no** preservación DB de seña/venta tras transferir |
| `tests/m1/contracts.test.mjs` | 23 contratos puros de fundación ya certificados | No contiene handlers de Assign/Transfer/Acknowledge |

Selección adicional posible, sin presentarla como ya ejecutada aquí: `crm-v2-workspace.test.mjs`, `supervisor-crm-v2-compat.test.mjs`, `crm-v2-frontend-event-path.test.mjs`, `protocol-advisory-layer.test.mjs`. Sirve para caracterizar otros oráculos legacy y scope de respuestas frontend, no resuelve el bloqueo de canal.

Las suites M1 DB certificadas `foundation.integration.test.mjs`, `security.integration.test.mjs`, `installation.integration.test.mjs` y `schema-baseline-b.integration.test.mjs` requieren el harness aislado real; no son parte del comando puro. Mantener su recuento certificado separado de una eventual repetición. Los SQL `protocol-advisory-layer.integration.sql` y `crm-v2-contact-answer.integration.sql` son mutantes dentro de sus fixtures, necesitan schema completo compatible y **no** deben lanzarse sobre producción ni sobre B parcial sin preparación. Tampoco son una suite de TransferLead ya existente.

## 8. Cobertura exigida: 27 requisitos, plan pendiente

Los IDs siguientes son identificadores de planificación, **no nombres de tests implementados ni resultados PASS**. Fixture ampliada con cuerpos legacy reales, roles reales no superuser y snapshots completos. Gate inactivo y gate reservado de laboratorio son escenarios distintos. No se sustituye la propiedad por regex, lectura de migración o mock. La prueba 19 tiene bloqueo de alcance conocido; las demás siguen pendientes de handlers/fixture y no se consideran aprobadas por similitud con FoundationProbe.

| N.º / ID propuesto | Caso DB necesario y oracle |
| --- | --- |
| 1 / A04-01 | Assign inicial de oportunidad realmente nueva/elegible; seller activo; decisión de política inicial explícita; rechazar lead sin owner que ya tenga hechos incompatibles |
| 2 / A04-02 | Transfer A→B válido: sólo cambian campos/versiones/eventos del contrato cerrado |
| 3 / A04-03 | Matriz de fixtures Nuevo/En gestión/Entrevista/Cierre/Seña: igualdad de etapa y estado operativo antes/después; terminales según guardas explícitas |
| 4 / A04-04 | Igualdad de próxima acción, fuente, nota, cita y timestamps, incluidos vencidos |
| 5 / A04-05 | Igualdad de fecha, modalidad, lugar y estado operativo de entrevista |
| 6 / A04-06 | Igualdad de importe, fecha, validación, seguimiento post-seña y hechos relacionados |
| 7 / A04-07 | Secuencia activa y secuencias históricas conservan IDs, started_at, estados y metadatos |
| 8 / A04-08 | Tasks completed/skipped/pending conservan IDs, creador/procedencia, completed_by, performed_at, recorded_at y demás campos históricos. Comparar también playbook, actividades previas, ofertas, solicitudes, presupuestos y documentos; append nuevo sólo permitido por contrato |
| 9 / A04-09 | Conteos/IDs de protocolo y tasks idénticos; ninguna secuencia cancelada o nueva por la transferencia |
| 10 / A04-10 | Ausencia de efectos del ciclo: no actividad de inicio de ciclo, no reset CRM/playbook, no cancelación de Recall; inspección de dependencia complementa snapshot, no la sustituye |
| 11 / A04-11 | assignment_epoch aumenta exactamente una vez por Transfer aplicado; mismo command retry no vuelve a aumentar |
| 12 / A04-12 | aggregate_version sigue contrato explícito para Assign/Transfer/Acknowledge; versiones de otros dominios intactas |
| 13 / A04-13 | Un assignment y evento/actividad permitida por intención aplicada; atomicidad ante error inducido al insertar historia |
| 14 / A04-14 | Misma key/intención devuelve resultado estable sin duplicar; misma key con destino diferente conflicto; doble click/timeout con sesiones reales |
| 15 / A04-15 | Tras commit, token viejo de A no permite mutación por cada entrada relevante, incluidos wrappers de task y follow-up; no atribuir rechazo únicamente a la UI |
| 16 / A04-16 | B ve/resuelve obligaciones futuras autorizadas creadas bajo A sin reescribir seller histórico; otros leads y facultades de supervisor siguen denegados |
| 17 / A04-17 | Snapshot de channel authority, modo/control legacy y eventos de canal intacto |
| 18 / A04-18 | authority_epoch de canal idéntica, sin adquirir capacidades por otra proyección |
| 19 / A04-19 | B continúa sin capacidad de operar WhatsApp IA: probar helper/RPC real, RLS y frontera endpoint sin enviar. **BLOQUEO conocido:** helper actual deriva capacidad desde owner; columnas intactas no satisfacen este caso |
| 20 / A04-20 | Acknowledge del seller actual + epoch vigente registra receipt separado; owner/assigned_at/protocolo intactos; retry idempotente; B anticipado o A viejo rechazados |
| 21 / A04-21 | Acknowledge no crea/acepta handoff, no resuelve obligación ni cambia canal. No implementar M1-06 para cumplir la prueba |
| 22 / A04-22 | Sesiones A→B frente a A→C/dos supervisores: barrera real en locks; un ganador por versión, perdedor conflicto, sin último-write-gana ni historia doble |
| 23 / A04-23 | Forzar que edición de A autorice antes del Transfer y continúe después; resultado serializable autorizado o rechazo. Usar RPC real susceptible a TOCTOU, no un mock que ya revalida owner |
| 24 / A04-24 | Inactivar destino entre validación y commit; resultado conforme al orden de locks, nunca asignación a destino ya inválido por snapshot viejo; errores revierten todo |
| 25 / A04-25 | Cada OW-01–10 caracterizado en sus ramas; fence futuro semántico, historia incluida. Unknown OW-11/12 mantienen BL-02/03 abiertos. Incluye writer que repite mismo owner y cambia assigned_at/by |
| 26 / A04-26 | Gate inactivo mantiene antes/después legacy, incluidas transferencias/reset y OW-02–07; inserts sin owner/imports no se congelan; gate aislado no permite bypass de writer retirado |
| 27 / A04-27 | Instalar candidata no activa handler/gate/grant por sí sola ni cambia writer_epoch; fixture limpia verifica ausencia de seeds e igualdad de comportamiento legacy |

Casos maliciosos adicionales incluidos en esa matriz: seller que se autoasigna/transfiere, actor o assigned_by falsificado, scope de otro lead, destino/epoch omitidos, replay tras cambio de owner, spoof de GUC/routing_reason, batch parcial, fallo de historial a mitad de operación y lock timeout/deadlock con rollback visible. Ninguno se declara resuelto aquí. El plan no habilita sender, webhook, nuevos resultados de contacto, máquina de handoff ni rediseño de crédito bancario.
