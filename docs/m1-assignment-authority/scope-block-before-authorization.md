# M1-04A — bloqueo de alcance antes de implementar los comandos

Base y certificación recibida: `292e1f8a435a07d104e990b129707fbfffc1a795`, rama `feat/m1-runtime-foundation`. El usuario certificó M1-01/02/03 dentro de su alcance probado (54 subpruebas DB y 23 puras), sin completar M0 ni autorizar producción. La nueva autorización comprende sólo AssignLead, AcknowledgeLeadAssignment y TransferLead, con preservación comercial e instalación inactiva.

**Estado de M1-04A: BLOCKED por una contradicción de alcance. No implementado ni certificado.** No se generó migración candidata, no se modificaron handlers ni objetos legacy y no se amplió el contrato de comandos de la fundación. Se conserva esa base y se entrega diagnóstico reproducible, inventario y diseño acotado para resolver el bloqueo sin ocultarlo en pruebas.

## Contradicción concreta

La autorización exige que el seller no pueda usar assignment para adquirir acceso al WhatsApp IA y que TransferLead no lo habilite (prueba obligatoria 19). A la vez excluye cambios de canal y deja BL-06 fuera del alcance funcional.

El permiso actual no es independiente del owner. La definición de `private.current_user_can_manage_whatsapp(uuid)` contiene:

```sql
p.active = true
and (
  p.role::text in ('admin', 'supervisor')
  or (p.role::text = 'seller' and l.assigned_seller_user_id = p.user_id)
)
```

Por lo tanto, para B activo con rol seller, cambiar el owner de A a B hace verdadero el permiso, aunque ninguna fila o versión de canal cambie. El mismo efecto aparece en asignación inicial NULL→B. Mantener `crm_conversation_state.channel_authority='disabled'` y `authority_epoch` intactos no demuestra ausencia del permiso legacy.

La recaptura read-only del 17/09/2026 19:46:48 UTC confirma que el predicado sigue vigente y que `public.set_whatsapp_conversation_mode(uuid,text)` es SECURITY DEFINER postgres, ejecutable por authenticated, y usa ese predicado antes de tomar/liberar una conversación. La RPC no consulta la autoridad M1. Ver [catálogo actual](evidence/channel-rpc-catalog.json). La lectura de controles también usa ese helper por RLS. No se invocó la RPC de modo ni el endpoint humano en producción ni en el diagnóstico.

Se revisó además el endpoint existente `whatsapp-human-message`: lee lead y control mediante RLS, exige mode human y después utiliza su emisor privilegiado. Esto describe una capacidad potencial; no prueba un envío real. No se modificó ni ejecutó ese endpoint.

## Diagnóstico DB y límites

La suite nueva `assignment-boundary.integration.test.mjs` reutiliza el schema B certificado intacto, agrega un overlay capturado de helper/controles/ACL/RLS/triggers y datos enteramente sintéticos. El runner instala únicamente las tres migraciones M1 ya certificadas. Las identidades seller se prueban con `SET SESSION AUTHORIZATION authenticated` y `auth.uid()` comprobados.

La observación cambia `leads.assigned_seller_user_id` mediante SQL privilegiado **sólo dentro de la VM descartable**. No se presenta ese UPDATE como AssignLead/TransferLead. Se mantienen los triggers legacy, incluida su semántica de reinicio; esta prueba no certifica preservación comercial. Se comparan antes/después el permiso efectivo, la visibilidad RLS y filas reales de autoridad/control de canal.

Un resultado PASS de esta suite significa **contradicción observada correctamente**, no aceptación M1-04A ni aprobación del comportamiento. Las 27 pruebas de aceptación de los comandos permanecen pendientes/BLOCKED, y la prueba 19 tiene una precondición de alcance incompatible con el predicado actual.

El overlay conserva el trigger legacy de cancelación de reminders, pero no ejerce su rama human; no instala reminders, RPC de modo, eventos de canal, sender ni servicios externos. Las pruebas usan controles mode=ai. No se afirma que se haya validado el endpoint, un mensaje entregado o todo el schema Supabase.

Resultado real, PostgreSQL **17.6**, VM QEMU local descartable sin NIC, sin rutas, sin mounts del host y sin credenciales; UID65534, socket Unix, `listen_addresses` vacío y seccomp sin IP. Se destruyeron la VM y sus cinco clusters independientes. [Reporte DB final](evidence/run02-final/database.json), [VM y hashes](evidence/run02-final/vm.json), [aislamiento](evidence/run02-final/isolation.json) e [índice de verificación](verification.json).

| Grupo | Resultado | Qué significa |
|---|---|---|
| Fundación certificada: 26 originales +19 seguridad/instalación +9 schema B | 54/54 subpruebas DB PASS | Regresión de M1-01/02/03 intacta |
| Diagnóstico nuevo | 6/6 subpruebas DB PASS | Se reprodujo el permiso incompatible; **no** acepta M1-04A |
| Contratos puros de fundación | 23/23 PASS | Contrato certificado sin cambios |
| Regresión legacy seleccionada | 131/131 PASS | Fuente/modelos JavaScript; no preservación DB por Transfer |
| Aceptación M1-04A | 0/27 ejecutadas | BLOCKED/pending: no hay handlers ni migración candidata |

El total técnico del runner es 60 subpruebas SQL, 65 entradas TAP incluyendo cinco tests padre. Cero fallos, cancelaciones, skips o TODO en la ejecución final; ese total **no** es una certificación M1-04A.

| Observación de B | A→B: antes | A→B: después | NULL→B: antes | NULL→B: después |
|---|---|---|---|---|
| `can_manage_whatsapp` | false | **true** | false | **true** |
| Filas lead visibles por RLS | 0 | 1 | 0 | 1 |
| Filas control visibles por RLS | 0 | 1 | 0 | 1 |
| `channel_authority` | disabled | disabled | disabled | disabled |
| `dialogue_policy` | paused | paused | paused | paused |
| `authority_epoch` | 17 | 17 | 23 | 23 |

Se compararon completas las filas de autoridad y control: permanecieron idénticas, no sólo sus epochs. Los datos exactos before/after se imprimieron como diagnósticos del TAP y se incluyen en el índice de verificación. Estos permisos fueron medidos como authenticated/seller, no inferidos de un UPDATE ejecutado como administrador.

La primera ejecución falló por un dato sintético incompleto: el lead con owner carecía de `assigned_at` y PostgreSQL rechazó `leads_assignment_complete` con SQLSTATE23514. Se corrigió exclusivamente el fixture: fecha en el alta con owner y en NULL→B; A→B conserva la fecha. No se relajó el constraint ni se modificó una migración. [Intento original](evidence/run01-fixture-failure/database.json) preservado. La segunda ejecución pasó todas las suites desde clusters vacíos, con hashes coincidentes con los archivos entregados.

Las seis subpruebas nuevas son: D00 igualdad de catálogos/ACL/funciones con captura; D01 fixture sintético y estado de canal real con triggers activos; D02 B sin permiso/lectura antes de assignment; D03 A→B concede el permiso sin cambiar canal; D04 NULL→B produce el mismo efecto; D05 objetos M1 y gateway continúan inaccesibles para seller. No se probó una emisión ni una RPC de modo.

Los [131 casos legacy](evidence/legacy-regression.json) y las [23 pruebas puras](evidence/foundation-pure.json) se ejecutaron por separado, en un entorno local limpio: son inspecciones de fuente y ejecución JavaScript, no sustitutos de PostgreSQL. No se cambiaron sus oráculos ni sus archivos. Los casos de concurrencia de la fundación fueron reejecutados; las carreras específicas de Assignment/Transfer están pendientes y no se cubren por analogía.

## Decisión mínima propuesta para continuar

Solicitar autorización expresa para incluir una **guarda restrictiva de permiso de canal**, acotada a la cohorte gobernada por assignment runtime y validada únicamente en aislamiento. Propuesta concreta:

| Situación | Predicado actual | Cambio propuesto, todavía no implementado |
|---|---|---|
| Instalación/precutover: lead aún no incorporado al dominio runtime | Gestión autorizada o seller activo dueño | Exactamente el comportamiento legacy actual |
| Cohorte incorporada a assignment runtime en la prueba aislada | Seller dueño obtiene permiso | El ownership seller deja de autorizar intervención del canal para esa cohorte; una pausa posterior no vuelve a habilitarlo |
| Admin/supervisor | Regla comercial actual de acceso humano | Conservar su regla; no ampliar ni caracterizar por inferencia consumidores gerenciales |
| APIs y emisión | RPC/endpoint existentes | Sin nuevo modo, handler de envío, aceptación de handoff ni cambio de sender |
| Instalación candidata | M1 cerrado | Ningún gate habilitado, ningún writer_epoch productivo modificado, ningún grant nuevo a usuarios |

La intervención mínima se ubica en `private.current_user_can_manage_whatsapp`, o en una frontera equivalente cuya cobertura se pruebe. Debe derivar el gate y la incorporación del lead al dominio server-side desde objetos privados; no un boolean del caller, GUC falsificable o nombre de RPC. El gate pre-cutover inactivo y la pausa de una cohorte ya incorporada no deben confundirse: la segunda conserva la denegación del seller. La implementación, sus locks y tests requieren la autorización explícita de esa excepción porque **sí cambia permisos del canal**, aunque sea para restringirlos y quede inactiva al instalar.

Esto no cierra BL-06: siguen pendientes consumidores, credenciales, peticiones en vuelo y la autorización de cualquier futuro cambio productivo. Tampoco autoriza M1-04B, handoff, webhook, sender ni frontend. Antes de un futuro cutover, la vuelta a legacy no puede reabrir el permiso del seller inadvertidamente: rollback compatible exige pausa/cierre del dominio conservando el fence, no bajar un flag ciegamente.

No se elige una excepción que rechace toda asignación/transferencia, se excluyan leads con conversación, se cree un segundo owner privado o se prueben sólo campos de la tabla nueva para obtener un PASS. Esas alternativas incumplen el caso positivo o cambian la regla de negocio. Si el usuario decide acotar el requisito 19 exclusivamente a objetos nuevos y diferir el permiso efectivo legacy, deberá hacerlo expresamente y esa limitación deberá constar en la certificación; no se presume aquí.

## Assignment y preservación: trabajo de diseño realizado

[architecture-boundary.md](architecture-boundary.md) contiene la cadena real de triggers y helpers, las definiciones before/hashes, los efectos de reset, el contrato propuesto de los tres comandos y convivencia gated. [writer-matrix.md](writer-matrix.md) enumera escritores conocidos, consumidores, permisos de resolución futura, oráculos históricos y plan de las 27 pruebas.

Hallazgos que no desaparecen al resolver el bloqueo de canal:

- La actualización de owner dispara `leads_start_contact_sequence` → `start_contact_sequence_after_assignment` → `start_lead_crm_cycle`; reinicia CRM/protocolo, borra seña/agenda y reabre playbook. El futuro runtime debe evitar esa rama sin alterar la convivencia inactiva.
- La RPC individual y la masiva difieren en elegibilidad de terminales. Se requiere un único contrato explícito para los comandos nuevos.
- Las policies de tasks/sequences usan seller histórico. Conservar historia requiere autorización del resolver vigente tanto en lectura como dentro de RPC; cambiar masivamente seller histórico sería incorrecto.
- El fence del owner alcanza rutas de Recall/ingreso/venta/webhook que esta autorización no permite rediseñar. Debe caracterizarse qué se rechaza y qué queda fuera antes del cutover; no congelar esas rutas accidentalmente.
- Una edición legacy autorizada antes de la transferencia requiere revalidar ownership bajo locks compatibles. Un CAS únicamente en Transfer no demuestra esa carrera resuelta.

No se cambiaron oráculos legacy. Sus resets documentados permanecen como evidencia histórica y eventual prueba de convivencia con gate inactivo; no como objetivo de TransferLead runtime. La discrepancia de `protocol-advisory-layer.integration.sql` con el helper posterior se detalla en la matriz.

## M0

| Bloqueo | Estado de esta revisión |
|---|---|
| BL-01 Vercel/frontend | ABIERTO. Sin nueva evidencia de alias/deployment efectivo; no se accedió ni modificó Vercel |
| BL-02 Apps Script/Sheets | ABIERTO. Writer externo y destinos sin caracterización suficiente; no se infiere ausencia |
| BL-03 consumidores privilegiados | ABIERTO. Conjunto de writers externos no exhaustivo; el diagnóstico no lo cierra |
| BL-04 credenciales/productor/dispatcher | ABIERTO. No se inspeccionaron valores de secretos ni se cambiaron principals/configuración |
| BL-05 sender/trabajo en vuelo | ABIERTO. No se volvió a medir ni drenar trabajo productivo; se conserva la captura histórica fechada |
| BL-06 vía humana | ABIERTO/P0. Recaptura del helper/RPC/ACL vigente y diagnóstico aislado owner→permiso. Los nueve eventos históricos se conservan sin atribuirlos a vendedores, envíos reales, uso incorrecto o inventario exhaustivo |
| BL-07 configuración efectiva | ABIERTO. El catálogo de permisos no prueba bindings ni configuración efectiva de Edge/Meta |
| BL-08 aislamiento rollout | ABIERTO. El laboratorio sin NIC se verifica por separado; no certifica QA remoto ni aislamiento completo de rollout |

## Superficies y rollback

Cero archivos legacy modificados y ninguna definición DB de producto modificada en el repositorio. La guarda de permisos se propone únicamente como diseño pendiente de autorización. El único archivo existente adaptado es el harness M1 para seleccionar esta suite diagnóstica; conserva el listado de tres migraciones y las suites certificadas. Lo demás son tests, fixtures de laboratorio y documentación/evidencia.

No existe SQL after de producto ni migración candidata que aprobar todavía. Las propuestas before/after son diseño explícitamente no implementado. No hay nuevos grants productivos, cambios de RLS/canal ni writer fences instalados. El rollback de laboratorio consiste en destruir sus clusters/VM; no hay operación productiva que revertir.

La revisión de whitespace de Git señaló únicamente una línea vacía adicional al final de `tests/m1/fixtures/assignment-boundary/overlay.sql`. Se conservan los bytes efectivamente ejecutados y sus hashes; no es un fallo SQL ni se presenta ese chequeo de estilo como PASS.

No se aplicaron migraciones productivas, ejecutaron RPC comerciales remotos, enviaron mensajes, copiaron clientes/conversaciones reales, modificaron tokens/secrets, ni hicieron push, PR, merge o deploy. M1-04A se detiene aquí para resolver la contradicción de alcance antes de escribir su camino canónico.
