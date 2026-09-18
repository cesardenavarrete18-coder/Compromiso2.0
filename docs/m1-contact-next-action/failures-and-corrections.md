# M1-04B — fallos conservados y correcciones verificables

La ejecución se reanudó desde `8a331e647eeb574be90cb2a6bd28a7e46f874ae3`,
con las candidatas sin commit. No se descartó ni reconstruyó el working tree.
El checkpoint y sus hashes previos a nuevas modificaciones están en
[resumption-checkpoint.json](evidence/attempts/resumption-checkpoint.json).
Los intentos anteriores se preservan en [index.json](evidence/attempts/index.json).
Una corrida posterior verde no convierte los intentos anteriores en PASS.

| Evidencia | Hallazgo y causa | Corrección acotada | Verificación real requerida |
|---|---|---|---|
| run01, previo a la reanudación | B-02 fallaba 42723 por definiciones duplicadas. La corrección ya estaba en el checkpoint. | Se conservó la eliminación previa; no se usó run01 para validar la candidata corregida. | Reinstalación completa B02/B03/B01/B04/B05 en clusters nuevos. |
| run02 | B-03: 42601 al comparar con CASE dentro de IF PL/pgSQL. | Paréntesis explícitos alrededor de CASE. | Instalación desde cero; no se avanzó a escenarios funcionales. |
| run03 | B-03: 42601 por comilla faltante en extracción de `reason` del evento de enmienda. | Corregida expresión SQL. | Nueva instalación completa, sin quitar BEGIN/COMMIT. |
| run05 | 42501 en helpers DEFINER postgres; membresía NOINHERIT/NOSET no concedía acceso a tablas del runtime. | ACL internas mínimas explícitas en B-01 y EXECUTE del helper de revisión en B-03. No grants API ni DML legacy al runtime owner. | DB-B04/05/21–50; membresías, roles y efectos reales. |
| run05, B07/B41 | La adopción tocaba tareas/secuencias y los triggers legacy alteraban `updated_at`, aun con asignación al valor anterior. | Adopción toca sólo el padre lead; barrera de hijos `FOR SHARE NOWAIT`, compatible con INSERT y snapshots previos. | B07/B41 preservan filas completas; B57/B68 ejercen borrado, inserción y REPEATABLE READ reales. |
| run06 | 42702: `k.task_id` era ambiguo entre variable record de PL/pgSQL y alias de tabla al promover la próxima tarea. | Alias SQL específico `slot_credit` en las dos subconsultas. | B21/B24/B25/B42–49 y carreras de tarea/reloj. |
| run05/run06 | Fixtures asumían permiso authenticated sobre `complete_contact_task`, permitían customer_id NULL o esperaban el trigger antes del rechazo nativo de TRUNCATE con FK. El schema capturado contradice esas suposiciones. | Usar la RPC real permitida `record_contact_task_result`; probar además el helper privilegiado; identidad incoherente con FK existente; TRUNCATE CASCADE para la guarda y 0A000 separado sin CASCADE. | B40/B51/B52/B57/B58/B68. No se ampliaron permisos ni se cambió el oracle legacy. |
| run04/run05 | Sin informe final. Una sesión de pérdida de respuesta podía quedar abierta después de un fallo de assertion. | Cierre en finally y TAP transmitido en vivo además de guardarse. | B73 y finalización del proceso/VM. Los logs incompletos no certifican ninguna suite. |
| run06, B74 | El test de deadlock pretendía bloquear tablas privadas como authenticated; el rechazo de permisos impedía formar el ciclo esperado. | Deadlock real entre dos transacciones autenticadas con receipts de dos comandos públicos, sin grants adicionales. | Un 40P01 real; rollback del perdedor; dos intenciones únicas y replay de ambas tras commit del ganador. |
| Revisión de B15/B61/B73 | Comparar `.result` podía comparar dos valores undefined aunque los DTO reales tuvieran otra forma. | Comparación de todos los campos del resultado durable, excluyendo sólo status/original_status de transporte. | Replays secuencial, concurrente y tras pérdida de respuesta, más conteos persistidos. |
| run07 | VM terminó sin marcador/informe final, después de 42 PASS observados. No hay evidencia suficiente para atribuir causa. | Conservar manifest/log como INCOMPLETE y repetir en otra VM limpia. | run08 completó 80/80, con informe y destrucción de guest. |
| Regresión final, primer intento | El socket Unix existía mientras PostgreSQL aún informaba `the database system is starting up`; falló un perfil antes de ejecutar sus tests. | Harness verifica SELECT 1 por socket Unix bajo seccomp/libpq; sólo reintenta ese error de arranque, con plazo y probes registrados. No requiere utilidades ausentes del toolchain. | Regresión final desde clusters nuevos; no retry de migraciones sobre un cluster parcialmente preparado. |
| run09, assertion adicional B40 | El fixture intentaba establecer directamente DNC de customer después de la adopción; la guarda lo rechazó correctamente con COMMAND_METADATA_REQUIRED. | Preparar la restricción preexistente antes de adoptar A/B; conservar todas las guardas. No hubo corrección de SQL. | Repetición B80 con DNC sólo customer preexistente: agenda e intento deben ser rechazados aun cuando DNC del lead sea false. |

Las correcciones anteriores a la interrupción también se verifican en la suite
actual: `next_action_required` (B33/B47), agenda manual separada del protocolo
sustituido (B33/B46), vínculo de secuencia en enmiendas (B29), opt-out tardío
restrictivo (B39), DNC de lead/customer y error de identidad (B38–40), promoción
con evento (B24), productividad sin multiplicación por eventos derivados
(B21/B25), atribución histórica desconocida (B28) y fixtures consistentes con el
schema real capturado (B40/B51/B52/B57/B58/B68).

En B74 se reforzó además la prueba 40001: el error se provoca dentro de
`crm_submit_command` como authenticated con snapshot REPEATABLE READ, después
de que otro comando real avance el agregado. Se comprueba que su receipt/eventos
se revierten; retry de la misma intención devuelve VERSION_CONFLICT por versiones
ahora stale y luego replay del rechazo, sin una segunda aplicación. Esto sustituye
la comprobación más débil de 40001 mediante SELECT FOR UPDATE directo y no cambia
ninguna candidata SQL.

Todos los cambios de producto de esta reanudación están dentro de B-01/B-02/B-03.
El contrato JS B conservó su hash inicial. No se reparó un dominio excluido para
obtener PASS, ni se ejecutó SQL en una base remota.
