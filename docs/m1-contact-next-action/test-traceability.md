# M1-04B — trazabilidad de aceptación PostgreSQL

Baseline certificado: `8a331e647eeb574be90cb2a6bd28a7e46f874ae3`.

La ejecución final está cerrada en [test-results.md](test-results.md): 80/80 PASS,
con TAP PostgreSQL e identificación de archivos. Esta matriz conserva los
requisitos y no reemplaza esa evidencia de ejecución.

Fuente de requisitos: §12 del **M1-04B — Contacto y Próxima Acción — Plan ejecutable v1**, interpretado junto con las precisiones vinculantes de la autorización del 2026-09-18. La autorización prevalece: el reloj no produce productividad; el 40% queda reservado para una fase posterior; omisiones predominantes es sólo descripción; evidencia manual nunca implica corroboración por proveedor.

La suite `tests/m1/contact-runtime.integration.test.mjs` contiene exactamente los 80 identificadores de aceptación, sin duplicados. Esta tabla describe trazabilidad, **no constituye evidencia PASS**. El resultado final se obtiene del TAP emitido por PostgreSQL real y de su manifest de hashes. Un fallo de instalación deja los escenarios dependientes sin validar; no se interpreta como prueba de comportamiento.

Las pruebas no llaman Meta, Edge Functions, WhatsApp, Apps Script ni un proyecto remoto. El fixture usa schema B capturado y overlays Assignment con cinco definiciones adicionales capturadas de writers legacy. No es un clon completo de producción ni una prueba de integración del gateway REST/frontend.

## Mapeo exacto

| ID | Requisito aprobado | Escenario ejecutable |
|---|---|---|
| DB-B01 | Instalar fundación+A+B desde cero en orden; validar catálogo de tablas, tipos, FK/CHECK/índices/triggers/functions. | `complete ordered installation has validated PostgreSQL catalogs` |
| DB-B02 | Falta de una dependencia real, hash/firma incompatible u orden incorrecto: fallo transaccional y gateway/adopción B no utilizables. | `missing dependencies and wrong order roll back without B authority` |
| DB-B03 | Instalar sólo 01, sólo prefijo 01+02 y completa: cero adoptions/gates authoritative/grants API automáticos; sin mutación comercial disponible. | `each installation prefix is closed and adopts no business row` |
| DB-B04 | Owners, memberships, NOLOGIN/NOBYPASSRLS, search_path, SECURITY DEFINER/INVOKER y EXECUTE coinciden con allowlist; caller no elige definer/actor. | `owner role, memberships, fixed search paths and closed definer functions` |
| DB-B05 | Roles anon/authenticated/seller/service_role reales del fixture: sin acceso directo a tablas nuevas; FORCE RLS afecta al owner según policy explícita. | `real API roles have no direct table access and FORCE RLS remains enabled` |
| DB-B06 | Fila runtime/gate/claim/GUC/header/RPC-name no bastan para adopción; seller/supervisor vía API no pueden crearla. | `runtime rows, gate, JWT/header/GUC never constitute technical adoption` |
| DB-B07 | Adopción exige A durable, gate B scope/epoch/revision/manifest correctos y schema completo; snapshot de agenda/protocolo no inventa hechos ni altera historia. | `adoption requires durable Assignment and exact B gate, preserves baseline evidence` |
| DB-B08 | Pausa/cambio de gate no elimina adopción ni fences; no restaura permiso WhatsApp seller; no incrementa/baja epochs comerciales o de canal. | `pause is sticky, keeps commercial/channel epochs and seller channel denial` |
| DB-B09 | UPDATE/DELETE/TRUNCATE de adoptions/facts/eventos/receipts terminales se rechazan; constraints/cascadas no permiten borrado indirecto. | `durable facts, adoptions and terminal history cannot be updated/deleted/truncated` |
| DB-B10 | Instalación B no abre Recupero IA, notificaciones internas, V2 emisora, handoff ni modo human; FoundationProbe sigue sin mutar negocio. | `future gates and FoundationProbe remain non-authoritative` |
| DB-B11 | Seller owner actual puede registrar bajo gates autorizados; no-owner/exowner/seller histórico de task no. Admin/supervisor activos conservan scope real. | `current owner and management scope, never historical task ownership` |
| DB-B12 | Actor/role/owner/source privilegiado/evidence_level/capability inyectados se rechazan; registrador real queda en receipt y hechos. | `actor, ownership and privileged provenance cannot be injected` |
| DB-B13 | Perfil inactivo inicial y desactivación concurrente con validación: ninguna aplicación no autorizada. | `inactive actor and concurrent deactivation are rejected` |
| DB-B14 | Task, sequence, action, fact o referencia de enmienda de otro lead: rechazo sin fuga de datos/versiones. | `foreign task, sequence, action and fact references fail closed` |
| DB-B15 | Mismo command_id + mismo intent: resultado original; no segundo hecho/crédito/acción/evento. | `same command ID and intent yield one effect and replay` |
| DB-B16 | Misma key/hash con otro command_id: replay de un resultado lógico; key/command ID con payload distinto: conflicto. | `same idempotency key replays only same hash` |
| DB-B17 | Keys diferentes con mismo fact_id/action_id: no segundo efecto; contenido diferente no puede reemplazar el existente. | `new keys cannot duplicate or overwrite stable fact/action identities` |
| DB-B18 | Stale aggregate, assignment_epoch, revisiones propias, gate o action revision: conflicto correcto; cero efectos parciales. | `stale aggregate, Assignment and B revisions never partially apply` |
| DB-B19 | Replay tras transferencia/inactivación/pérdida de scope: no devuelve resultado protegido al actor sin acceso. Con acceso y gate paused sí recupera receipt previo. | `replay reevaluates read rights but succeeds through pause for authorized actor` |
| DB-B20 | Capacidad B sólo vale en su receipt evaluating/xid/backend/scope/recursos/tipo; no activa fence Assignment; prueba A no activa efecto Contact. | `neither GUC nor another domain receipt grants Contact DML` |
| DB-B21 | Llamada no_answer registra intento y crédito admisible sin respuesta, cambio de etapa o permiso de canal. | `no_answer records real declared attempt/credit without stage/channel mutation` |
| DB-B22 | sent manual distingue envío declarado de entrega/respuesta; llamada+sent, WA+no_answer, clic/wa.me y origen IA suplantado no acreditan. | `personal WA sent is declared evidence, never delivery or corporate channel proof` |
| DB-B23 | answered registra respuesta, cierra protocolo por su causa y conserva etapa/entrevista/seña/venta; respuesta+agenda válida atómica. | `answered plus explicit next action is atomic and preserves commercial stage` |
| DB-B24 | skipped manual produce omisión con actor/motivo; no performed_at, hecho de intento, última gestión ni conteo de contacto. | `manual skipped records omission, never attempt or last contact` |
| DB-B25 | Reloj produce ausencia de registro al corte; no atribuye ejecución a su caller, no_answer ni contacto ficticio. | `deadline observation is clock work with no seller contact or productivity attribution` |
| DB-B26 | Hora futura, zona ambigua o canal/ventana incompatibles: rechazo o hecho sin crédito conforme al contrato; jamás normalización invisible. | `future/ambiguous times and incompatible channels never receive silent normalization` |
| DB-B27 | Hecho realizado en ventana, registrado tarde: evidencia durable/review_required; aprobación gerencial otorga crédito sin borrar omisión/demora ni alterar ventanas. | `late evidence survives and only explicit supervisor review grants delayed credit` |
| DB-B28 | Hechos fuera de orden temporal: último intento/respuesta/CRM no retroceden por fecha de registro; hecho de contexto anterior es historical_only. | `older occurrence does not replace latest contact and remains historical evidence` |
| DB-B29 | Revisión/enmienda supervisora de hecho B: original inmutable, referencia/motivo, compensación de crédito y sin reapertura automática; seller o enmienda legacy masiva rechazados. | `supervisor amendment is append-only, compensates credit and never reopens protocol` |
| DB-B30 | Una tarea y un hecho tienen como máximo un crédito activo; respuesta por otro canal puede cerrar búsqueda sin fabricar créditos de llamadas omitidas. | `one task and fact have at most one credit; inbound response does not invent call credit` |
| DB-B31 | Programar acción con ausencia de principal: identidad/revisión/canal/fecha válidos; sin último contacto ni cambio de etapa. | `new action has stable identity, revision and explicit date without contact or stage` |
| DB-B32 | Reprogramar y editar nota conservan identidad/historia; no se acreditan contactos ni se reinicia/cancela otro protocolo implícitamente. | `reschedule and note editing preserve action identity and protocol history` |
| DB-B33 | Cumplir acción sólo por hecho admisible e intención explícita; sin nuevo compromiso queda completed y next_action_required visible, nunca una fecha inventada. Cancelación administrativa sigue exigiendo reemplazo en Gestión/Cierre. | `factual completion needs no invented date, but ordinary cancellation needs replacement` |
| DB-B34 | Cancelar o sustituir acción es explícito, auditado y no reinicia protocolo; payload ausente no se interpreta como borrar agenda. | `explicit cancellation and replacement do not restart protocol or erase on omission` |
| DB-B35 | Vencimiento usa reloj servidor, respeta igualdad de frontera y emite un evento por revisión; lectura READ ONLY no escribe. | `server clock observes deadline once while getter performs zero writes` |
| DB-B36 | Reprogramación posterior a overdue conserva historia de incumplimiento; nuevo deadline no genera eventos repetidos del anterior. | `rescheduling an overdue action retains old observation and advances revision` |
| DB-B37 | Snapshot profundo de etapa/assigned_at/citas/seña/importe/fechas/oferta/sales_cases/historia/canal antes-después idéntico salvo allowlist B. | `deep protected snapshot remains identical through contact/action/omission` |
| DB-B38 | Opt-out registra hecho+DNC lead/customer+retiro de contacto futuro atómicos, preserva identidad/consentimiento/etapa y no crea Recall/reminder. | `opt-out atomically restricts linked customer and removes future work without stage` |
| DB-B39 | Opt-out conocido tarde y en gate paused: sólo restricción acotada permitida; no contacto ordinario, agenda nueva, crédito o levantamiento de DNC. | `paused gate only admits restrictive opt-out without credit or new schedule` |
| DB-B40 | Identidad/customer incoherentes o inexistentes no disparan upsert/saneamiento silencioso; error explícito. Ninguna corrección/Transfer/reactivación B levanta DNC. | `incoherent customer identity fails without repair and no B operation lifts restriction` |
| DB-B41 | Preservar exactamente IDs/calendario/18 llamadas+2 mensajes y formato histórico 6+2; no regenerar ni añadir secuencia al adoptar o transferir. | `18+2 and historical 6+2 protocol IDs/windows survive adoption and transfer` |
| DB-B42 | Requisitos todos acreditados sin respuesta: cierre factual executed_no_response; cero Desistir/fría/Recall/venta. | `fully credited no-response protocol closes factually without cold/Recall/stage` |
| DB-B43 | Todos omitidos sin historia desconocida: cero intentos, protocol_incomplete/zero_effective_attempts y review visible. | `all omitted yields protocol_incomplete and visible zero registered attempts` |
| DB-B44 | Mezcla parcial, mayoría estricta de omisiones y mitad exacta: conteos/clasificación correctos, sin inventar umbral del 40%. | `partial counts retain denominator and descriptive majority without future routing` |
| DB-B45 | Historia legacy desconocida/N=0/forma no reconocida: evidencia insuficiente, nunca certificar ejecución total ni cero trabajo físico. | `unknown legacy work or empty/unrecognized plan cannot prove full or zero physical work` |
| DB-B46 | Sustitución por agenda con historia mixta: sólo futuro cancelled, causa superseded; completed/skipped/ventanas/actores intactos. | `manual agenda explicitly supersedes only future work, preserving credited/omitted history` |
| DB-B47 | answered/no_interest/invalid/requested_no_contact: causas de cierre diferenciadas; no etapa terminal ni siguiente intento automático incompatible. | `response, no_interest, invalid and restriction remain distinct operational causes` |
| DB-B48 | Clasificador invocado por trigger y directamente sobre adoptado: no puede generar cold/Recall; no adoptado conserva conducta caracterizada. | `legacy classifier trigger/direct call is contained only for adopted cohort` |
| DB-B49 | Evaluación repetida sin cambio: NO_STATE_CHANGE terminal sin evento/avance; próxima ventana futura visible como not_yet_due. | `no-change clock is terminal without events/version; future windows remain visible` |
| DB-B50 | Getter muestra evidencia/calidad/ejecutor/tiempos/revisión/snapshot/overdue/review; coincide para roles autorizados sin afirmar una agenda global de entrevista/postseña. | `operational getter is READ ONLY, scoped and exposes evidence/review/clock context` |
| DB-B51 | Tres estados de cohorte: sin A, A-only y A+B. Sólo la última cambia autoridad de Contact; instalación sin adopción conserva resultados legacy. | `legacy, A-only and A+B cohorts preserve distinct writer authority` |
| DB-B52 | Todas las firmas legacy de resultado/answer/followup: adopted recibe error antes de task/CRM/actividad; overload no elude fence. | `every legacy result/answer/follow-up overload rejects before any side effect` |
| DB-B53 | Supervisor schedule/management/status que toca B: no bypass gerencial; writer mixto no compromete etapa/venta antes de fallar. | `mixed supervisor scheduling/status/management cannot partially commit excluded domains` |
| DB-B54 | Restart/reconcile/start-from-future/Recall que intersectan: no reset, nuevo protocolo, contacto sintético ni limpieza parcial. | `restart/reconcile/future/Recall writers cannot reset adopted work` |
| DB-B55 | Refresh legacy con cohortes mixtas sólo procesa no adoptados; revalida después del lock; B no se procesa dos veces ni desaparece del getter. | `mixed-cohort legacy refresh processes only legacy and preserves B for explicit clock` |
| DB-B56 | Direct DML/API/service_role/definer: sin bypass de campos B; comentario/updated_at ajeno sigue permitido según permisos existentes. | `service/direct DML/definer do not bypass B fields; excluded notes retain permissions` |
| DB-B57 | INSERT/DELETE/cascade/TRUNCATE de tareas/secuencias/CRM protegidos: no borran/crean historia adoptada; guardas resisten snapshots viejos. | `insert/delete/cascade/truncate cannot erase or forge adopted CRM/protocol history` |
| DB-B58 | Entradas de ingreso de leads no adoptados conservan inicialización; no auto-adopción B ni revocación global de ingreso. | `new legacy leads retain initialization without implicit adoption` |
| DB-B59 | Citas/postseña/documentación que sólo escriben campos excluidos: preservación y ausencia de crédito/contacto/cambio de versiones propias no afectadas. | `excluded appointment/deposit/document fields alone do not create B effects` |
| DB-B60 | Reproducir DML de webhook y writers de ventas sin llamar Edge/Meta: rechazo íntegro donde toca B; documentar consumidor incompatible como bloqueo, no declarar integración resuelta. | `reproduced webhook/sales mixed DML is rejected atomically without external functions` |
| DB-B61 | Dos conexiones, misma key/intención simultánea: un resultado lógico y un efecto; observar bloqueo real, no sleep como única evidencia. | `two real sessions with same intent block then commit one logical result` |
| DB-B62 | Dos keys/facts para misma tarea y versión: un crédito y conflicto del perdedor. | `different simultaneous facts for same task produce one credit and stale loser` |
| DB-B63 | Contacto vs Transfer en ambos órdenes: CAS/scope correctos; A no se apropia del hecho B ni B de historia A. | `contact versus Transfer serializes both orders without owner/history confusion` |
| DB-B64 | Contacto/agenda vs Acknowledge: conflicto conservador de aggregate; acuse no cambia epoch ni cumple acción. | `contact/agenda and Acknowledge share aggregate CAS without changing epoch` |
| DB-B65 | Reschedule/cancel/replacement vs RecordContactOutcome en ambos órdenes: agenda y hecho atómicos, sin pérdida. | `reschedule/cancel replacement versus factual completion preserves one consistent outcome` |
| DB-B66 | Clock vs contacto oportuno/tardío: conservar verdad del hecho y observación del corte; sin doble resolución ni cierre comercial. | `clock versus late evidence preserves deadline observation and review requirement` |
| DB-B67 | Gate pause/policy update vs comando: snapshot consistente; excepción DNC cerrada; replay no repite efecto. | `gate pause serializes with command and cannot broaden the DNC exception` |
| DB-B68 | Adopción vs legacy RPC/direct DML/refresh y snapshots REPEATABLE READ previos: efecto antes o rechazo/40001, nunca fuga postadopción. | `adoption fences old snapshots and direct legacy writers without inverse-lock bypass` |
| DB-B69 | Opt-out vs nueva agenda/Transfer/revisión: restricción monotónica y lock de identidad sin efectos sobre otro lead. | `opt-out versus agenda and Transfer stays monotonic and scoped to linked identity` |
| DB-B70 | Dos revisiones/enmiendas/créditos concurrentes: una decisión efectiva y cadena/eventos coherentes; nunca dos créditos activos. | `concurrent supervisor decisions produce one credit/review revision` |
| DB-B71 | Fallo inyectado tras insertar hecho, después de crédito y después de agenda: receipt/eventos/efectos/versiones vuelven todos al estado previo. | `failures after fact, credit and agenda roll back the complete command transaction` |
| DB-B72 | Terminar backend antes del commit: cero efecto parcial y retry seguro de misma intención. | `backend termination before commit leaves zero partial effects and same intent retries` |
| DB-B73 | Commit y pérdida simulada de respuesta: retry recupera exactamente resultado/IDs/fechas anteriores sin repetir tarea/actividad. | `commit with lost response is recovered exactly without duplicate timestamps or work` |
| DB-B74 | 40P01/40001/55P03 provocados controladamente: rollback íntegro, retry misma key, sin doble intención ni falso rechazo terminal. | `real 55P03, 40001 and deadlock rollback never create a duplicate intention` |
| DB-B75 | Falla de helper con privilegios y de trigger de proyección: no filtra capacidad evaluating ni permite DML posterior en la sesión. | `projection/helper failure cannot leak a live evaluating capability into session` |
| DB-B76 | Version exhaustion, referencia borrada/restringida y violación FK/unique: fallos seguros sin overflow, saltos o historia mutilada. | `version exhaustion, missing references and uniqueness fail without mutilating history` |
| DB-B77 | Replay de eventos B en proyección descartable reproduce hechos/acciones/créditos/resumen; no reejecuta comandos ni side effects legacy. | `event replay reconstructs disposable projections without invoking commands or legacy effects` |
| DB-B78 | Pausar y rollback técnico compatible conservan adoptions/fences/epochs/historia/denegación seller; no fallback a RPC legacy. | `compatible technical pause retains adoption/fences/epochs/history and seller channel denial` |
| DB-B79 | Suite A de guarda seller (23), 27 casos originales de comandos ya certificados, concurrencia/preservación y regresión certificadas: sin degradación en presencia de B. | `Assignment regression boundary remains valid with B installed` |
| DB-B80 | Regresión fundación y todos los propósitos cerrados; receipt terminal/eventos inmutables y controles de permisos siguen efectivos tras instalar B. | `foundation history/closed purposes and private privileges remain protected after B` |

## Naturaleza de la evidencia

- **Instalación:** ejecuta los archivos SQL completos, transacciones incluidas, como `postgres` no-superuser. Prueba orden incorrecto, dependencia ausente, firma legacy incompatible y prefijos cerrados antes de grants exclusivos del fixture.
- **Permisos:** usa `SET SESSION AUTHORIZATION` y el subject JWT únicamente en el entorno de prueba. Verifica acceso API denegado y el efecto de FORCE RLS sobre el propietario real al quitar transaccionalmente su policy y revertirla.
- **Contacto/agenda:** assertions sobre filas durables, tasks, créditos, receipts, eventos, versiones y snapshots de los campos comerciales/canal excluidos. Los resultados de comandos no sustituyen las comprobaciones de persistencia.
- **Concurrencia:** sesiones independientes y observación de `pg_stat_activity.wait_event_type='Lock'` antes de liberar el actor bloqueante; los casos NOWAIT exigen `55P03`. El mero transcurso de un sleep no se usa para demostrar una carrera.
- **Evidencia tardía:** tres fixtures adoptan antes del deadline, capturan un `occurred_at` del servidor dentro de la ventana y esperan el deadline real antes de registrar. La espera sólo establece que el reloj venció; el crédito se comprueba en filas/eventos posteriores y requiere revisión.
- **Fallos:** triggers de inyección sólo en el cluster descartable, terminación real de backend sin commit, lock_timeout real, conflicto REPEATABLE READ y deadlock entre dos transacciones que ya tienen efectos sin commit.
- **Replay:** reducción de `ContactWorkStateProjected` a tablas temporales y comparación con las filas finales, sin invocar nuevamente comandos ni funciones de negocio.

## Regresión y conteo

DB-B79 y DB-B80 comprueban fronteras de Assignment/fundación **con B instalado**. La reejecución separada de los 146 casos certificados conserva sus identificadores y oráculos originales. Estos 146 casos no vuelven a sumarse dentro de B79/80. El informe final debe distinguir las verificaciones específicas pos-B de las suites originales ejecutadas en sus entornos certificados, y no presentar estas últimas como una reproducción de todas las superficies productivas.

Las suites puras son evidencia adicional de contratos y regresiones. Ningún regex, recuento de funciones o equivalencia JavaScript convierte por sí solo un escenario de comportamiento PostgreSQL en PASS.

## Limitaciones y controles de interpretación

- No hay proveedor autenticado de telefonía/WhatsApp personal: los hechos conservan `manual_attestation` o procedencia supervisora; no certifican ejecución física ni entrega.
- El rechazo de DML por RLS puede manifestarse como cero filas afectadas, en lugar de excepción. La prueba exige filas retornadas vacías y estado persistido sin cambios; los fences se prueban adicionalmente con sesiones privilegiadas y llamadas SECURITY DEFINER.
- Los escenarios de convivencia mantienen cohortes legacy, A-only y A+B. No se altera un oráculo legacy para que adopte semántica B.
- El fixture no acredita frontend, Apps Script, consumidores privilegiados remotos, sender/trabajo en vuelo ni aislamiento de rollout. M0 sigue abierto; BL-06 continúa P0.
