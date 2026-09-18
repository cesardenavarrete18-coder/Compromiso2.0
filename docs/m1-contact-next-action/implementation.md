# M1-04B — Contacto y Próxima Acción: candidata de laboratorio

Base certificada: `8a331e647eeb574be90cb2a6bd28a7e46f874ae3` en `feat/m1-runtime-foundation`.
Alcance autorizado: seis comandos, getter sin efectos, tres migraciones candidatas y pruebas aisladas. No es autorización ni certificación de cutover.

## Contrato y autoridad

Todos los comandos pasan por `public.crm_submit_command(jsonb)` y `private.crm_execute_contact_command(jsonb)`. El gateway conserva el despacho de Assignment y Foundation. La instalación revoca EXECUTE a `PUBLIC`, `anon`, `authenticated` y `service_role`; únicamente el fixture de laboratorio abre temporalmente el gateway para comprobar actores reales. No se otorga DML de tablas privadas a clientes.

El envelope contiene schema_version=1, command_id, command_type, idempotency_key, scope.lead_id, policy_version_seen, expected_versions, payload y correlation/causation opcionales. El actor se deriva de identidad autenticada y perfil activo bajo lock. No admite actor, rol, autoridad de canal, procedencia de proveedor o cutoff aportados por cliente.

Versiones exigidas: lead_aggregate_version, assignment_epoch, contact_revision, next_action_revision, protocol_revision y vector exacto del gate `command_contact_next_action`, contrato `contact_next_action.v1`. El hash canónico incluye intención, actor derivado, scope, versiones, política y causation. No incluye command_id o correlation_id como parte de la intención idempotente. Un replay vuelve a validar actor activo y derecho actual sobre el lead antes de devolver información.

| Comando | Intención y condiciones | Efectos autorizados |
|---|---|---|
| RecordContactOutcome / record | Hecho manual con UUID, canal personal, tipo de hecho, resultado, occurred_at y nota. Referencias de tarea/acción verificadas en servidor. | Hecho append-only, crédito separado si cumple requisitos, cierre factual de búsqueda o acción, proyección y eventos. Una respuesta sin compromiso mantiene necesidad visible. |
| RecordContactOutcome / review | Sólo admin/supervisor activo; expected_review_revision; confirm_credit, deny_credit o amend; motivo. | Decisión auditada o nueva revisión append-only de un hecho B. Nunca modifica evidencia legacy ni borra omisiones. |
| RecordContactTaskOmission | Tarea pendiente del protocolo actual, sin crédito válido; causa y nota. | skipped como omisión, performed_at NULL; sin hecho ni intento ficticio. |
| ScheduleNextAction | Fecha futura del servidor, zona válida, canal personal. Reemplazo explícito de acción/protocolo si existen. | Acción identificable y única abierta, agenda proyectada; sin cambiar etapa. |
| RescheduleNextAction | Acción principal abierta y revisión esperada. | Misma identidad, nueva fecha/revisión/evento; no nueva gestión comercial. |
| CancelNextAction | Acción principal abierta y revisión esperada. Gestión/Cierre requieren reemplazo salvo restricción. | Cancelación administrativa auditada, con reemplazo atómico cuando corresponde. |
| EvaluateContactDeadlines | Payload vacío; corte exclusivo de reloj servidor. | Omisiones/vencimientos observados, promoción de tareas existentes y resumen factual. No actividad/productividad del invocante. |

`public.crm_read_contact_work_context(uuid)` es STABLE y READ ONLY. Deriva scope activo, devuelve versiones, gate, etapa/owner de referencia, protocolo, hechos, créditos, acción principal/historia, necesidad/revisión y proyecciones. No evalúa vencimientos, adopta, escribe ni envía. No hay UI/cron/worker productivo.

Los errores de negocio controlados terminan un receipt rejected sin efectos parciales; errores transitorios 40001/40P01/55P03 abortan y requieren retry de la misma intención. El motor no convierte un error transitorio en éxito. Códigos específicos incluyen VERSION_CONFLICT, WRITER_FENCED, FORBIDDEN_SCOPE, FORBIDDEN_COMMAND, CONTACT_DOMAIN_NOT_ADOPTED, CONTACT_RESTRICTED, CONTACT_EVIDENCE_NOT_ELIGIBLE, HISTORICAL_ATTRIBUTION_REVIEW_REQUIRED, NEXT_ACTION_CONFLICT, NEXT_ACTION_REQUIRED, PROTOCOL_STATE_CONFLICT, TASK_ALREADY_CREDITED, IDENTITY_RECONCILIATION_REQUIRED y NO_STATE_CHANGE.

## Objetos y representación durable

| Tabla privada | Verdad almacenada |
|---|---|
| crm_contact_next_action_adoptions | Hecho técnico sticky, operación única, timestamp, principal postgres, gate/epoch/revisión/contrato/política/manifiesto, motivo y snapshot anterior. |
| crm_contact_runtime | Tres revisiones, punteros, resumen de protocolo, necesidad de próxima acción, causas de revisión y evaluación de reloj. |
| crm_contact_facts | Hechos manuales append-only; occurred_at distinto de recorded_at; raíz/revisión/supersesión, actor registrante, ejecutor conocido, owner/epoch al registro y vínculos. |
| crm_next_actions | Identidad, fecha/zona/canal, estado/revisión, comando de origen/último, cumplimiento factual o snapshot de agenda anterior. |
| crm_contact_task_credits | Proyección controlada por tarea: review_required/credited/denied/revoked; conserva ventanas y omisión observada. Historia completa en eventos/receipts. |

Las cinco tablas usan RLS y FORCE RLS, dueño `crm_runtime_owner` NOLOGIN sin BYPASSRLS, policies internas de propietario y grants cerrados. Adopciones/hechos no admiten UPDATE/DELETE; no se elimina/trunca historia. FKs impiden mezclar leads/hechos/tareas/acciones y borrar padres protegidos.

Los helpers de efectos ejecutan como `postgres` no-superuser con BYPASSRLS del baseline. Requieren ACL internas explícitas porque la membresía final en `crm_runtime_owner` tiene INHERIT=false y SET=false: SELECT de las cinco tablas B, INSERT de hechos/acciones/créditos, UPDATE de runtime B/acciones/créditos, SELECT de runtime/gates/policies/receipts/events e INSERT de eventos. No reciben DELETE/TRUNCATE ni UPDATE del agregado común o receipts por este grant; ningún grant se transmite a roles API. Esta necesidad fue demostrada por SQLSTATE 42501 en el laboratorio.

El receipt añade capability `contact_effect_authorized`, sólo válida mientras está evaluating y coincide transaction xid/backend PID/tipo/scope. No es un GUC ni un flag de payload. Es incompatible con capability Assignment. Helpers de efecto son SECURITY DEFINER de postgres, cerrados, search_path vacío, SQL fijo y verificación de la capability. El executor/normalizadores son INVOKER; gateway/getter y funciones de lectura/adopción tienen propietarios/permisos explícitos.

`private.crm_adopt_contact_lead(uuid,uuid,bigint,text)` sólo permite session_user postgres. Requiere instalación completa, adopción A, gate B autoritativo explícito, política consistente y snapshot no ambiguo. No hay adopción por mera fila runtime, payload ni modo de gate. No hay seeds/cutover en las migraciones.

Adopción A y B son independientes. B no altera owner, assignment_epoch, authority_epoch, channel_authority ni dialogue_policy. La adopción B no puede deshacerse bajando un gate. Paused permite únicamente RecordContactOutcome/record/inbound_response/requested_no_contact sin referencias de tarea/acción ni reemplazo; no permite nuevo intento ni crédito. Una futura desadopción exige otra autorización.

## Evidencia y protocolo

Los únicos canales declarables son call y whatsapp_personal. source_kind/evidence_quality se derivan: manual_attested o supervisor_attested, siempre manual_attestation. No se aceptan IDs de WhatsApp IA, señales de click ni declaraciones de entrega corroborada. El snapshot de una agenda legacy puede usar canal unspecified sin inventar procedencia.

El registro tardío conserva el hecho. No borra skipped, tiempo de registro ni ventana original; requiere revisión supervisora explícita para crédito vencido. La corrección crea otro hecho B, conserva vínculos y revoca crédito anterior cuando corresponde. No reactiva automáticamente acciones/protocolos cerrados. Con DNC sólo permite corregir evidencia anterior a la restricción conocida sin debilitarla; no acredita un intento posterior a DNC.

`assignment_epoch` en un hecho es el epoch al registro, no una prueba del propietario histórico al momento del hecho. Para conciliación histórica por supervisor, performer puede ser desconocido (NULL) y no se atribuye al vendedor actual.

Resumen preserva N (obligaciones requeridas del snapshot), C (créditos válidos), F (intentos admisibles), R (respuestas), O (omisiones no cubiertas), U (evidencia desconocida), omisiones observadas históricas, C/N, canales y calidad. U no se convierte en cero trabajo por inferencia. >50% de omisiones es sólo descriptivo; no sustituye el futuro umbral de negocio <40% ni decide Base Fría/Recupero.

Respuesta/restricción/sustitución/revisión tienen precedencia; luego evidencia incompleta, ejecución completa sin respuesta, cero intentos registrados y ejecución parcial. Contacto nunca modifica etapa. El cierre no llama clasificadores comerciales, Recall, venta, reinicio de protocolo ni sender.

Cumplir realmente una acción puede dejarla completed sin otra fecha y persistir next_action_required. Cancelar administrativamente una acción de Gestión/Cierre sigue exigiendo reemplazo. El opt-out registra restricción monotónica sobre lead/customer previamente vinculados y consistentes, retira trabajo futuro, preserva etapa e identidad y no emite mensajes.

## Concurrencia, eventos y límites

Orden principal compatible con A: receipt → SHARE sobre tabla de gates → actor → runtime común → lead → runtime B → fila de gate → customer cuando corresponde → CRM → secuencias/tareas → acciones/créditos. El aggregate común serializa Transfer/Acknowledge con contacto. El SHARE de la tabla de gates permite comandos concurrentes, pero una actualización de gates espera a los comandos en vuelo incluso de otros leads: es una limitación de contención que requiere evaluación antes del rollout. Las barreras de writers legacy usan NOWAIT para no esperar al parent después de bloquear una fila hija; el estado antiguo en REPEATABLE READ debe fallar con serialización, no omitir adopción. Las pruebas SQL son la evidencia de este comportamiento, no esta descripción.

Cada mutación genera eventos mínimos y `ContactWorkStateProjected` con delta versionado para replay local: runtime, hechos del comando, acciones/créditos tocados, protocolo/tareas y proyección CRM. No son una integración productiva de reporting. Evaluate emite origen domain_clock y commercial_work=false; sólo el evento factual de contacto actual puede marcar trabajo, nunca el número total de eventos.

La migración 02 caracteriza 22 funciones y siete triggers del baseline antes de reemplazarlos; aborta ante drift. Ver `legacy-boundary.md` para before/after. No se modifican archivos históricos de migración, Edge Functions, frontend, tokens ni configuración productiva.

## Diferencias explícitas y riesgos

- Fechas de transporte limitadas a UTC con milisegundos exactos; la zona IANA se almacena por separado. Es más restrictivo que aceptar cualquier representación RFC3339.
- Las barreras de concurrencia pueden devolver 55P03/40001 a un writer legacy pre-adopción bajo contención; conservan sus reglas comerciales pero cambian el contrato técnico de retry.
- La pausa admite exclusivamente un opt-out inbound sin nuevas referencias operativas. Un opt-out registrado como nuevo intento outbound debe reformularse como hecho restrictivo inbound, nunca ejecutarse como intento mientras paused.
- Gateway/getter permanecen sin grants cliente al instalar. Los grants del fixture no son permisos de rollout.
- Una atestación manual es evidencia declarada y susceptible de error; no se presenta como corroboración física.
- Snapshot de protocolo incompleto o histórico mantiene U/revisión. No hay saneamiento ni backfill productivo.
- Replays operativos requieren autorización actual; transferir ownership puede denegar replay al exowner aunque el resultado exista.
- La compatibilidad estructural cubre schema capturado y overlays explícitos, no certifica cron, Edge, REST, usuarios/clientes ni catálogo productivo actual.
- La creación de los nombres de migración usó timestamp UTC local porque el CLI Supabase no estaba disponible y su descarga no fue accesible; no se afirma generación por CLI. Sólo se aplican en el laboratorio aislado.

Evidencia final: 80/80 escenarios B, 146/146 regresiones DB anteriores, 70 ejecuciones adicionales de Assignment/canal con B instalado y 214/214 pruebas puras. Ver test-results.md, delivery.md y los manifests de evidence/final-db y evidence/final-contact. La certificación formal del usuario sigue siendo independiente.
