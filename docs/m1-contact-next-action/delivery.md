# M1-04B — entrega candidata validada en laboratorio

Estado: **COMPLETED_PENDING_REVIEW**. Se completaron implementación y validación
autorizadas; la certificación formal y cualquier cambio posterior corresponden
al usuario. No se avanzó a M1-04C, ni a otro dominio.

Rama: `feat/m1-runtime-foundation`. HEAD inicial: `8a331e647eeb574be90cb2a6bd28a7e46f874ae3`.
Commit funcional: `64edc545db884932aad466c5042c89d3b74f6506` — `feat(m1): add closed contact and next-action authority`.
El segundo commit agrega esta documentación y evidencia. Su hash, que es el HEAD
final de cierre, se informa explícitamente en la respuesta que acompaña este documento.
El código funcional validado contiene 20 paths: 6.416 inserciones y 16 eliminaciones;
los demás paths corresponden a documentación y evidencia.

La reanudación conservó la implementación sin commit. Se verificó el working
tree y se recalcularon hashes antes de modificar funciones. El checkpoint está
en [la evidencia inicial](evidence/attempts/resumption-checkpoint.json).
No se usó run01 para aprobar B02/B03 corregidas.

## Resultado y evidencia

- **80/80 DB-B01–DB-B80 PASS**, ejecutados en PostgreSQL real. [Resultado individual](test-results.md).
- **146/146 regresiones DB anteriores PASS**, cero casos ausentes respecto del manifiesto certificado.
- **70 ejecuciones adicionales** de Assignment/canal con B instalado; A27 verifica la instalación A previa y los restantes comportamientos corren después de B.
- **214/214 pruebas puras PASS**: 23 fundación + 23 Assignment + 131 legacy + 37 B.
- Cero fallos, skips o cancelaciones en las corridas finales. Los fallos anteriores siguen preservados.

La corrida final integrada contiene 296 casos hoja en 11 clusters independientes.
Una repetición final de B80 comprueba assertions reforzadas de B29/B40/B74;
las candidatas SQL y el contrato son idénticos entre ambas corridas. La comparación
de manifests sólo encuentra distinta la suite de tests B, no código funcional.
Ver [resultados](test-results.md), [fallos y correcciones](failures-and-corrections.md)
y [catálogo real](evidence/final-catalog.json).

## Cambios, SQL y superficies legacy

Se implementan las tres migraciones candidatas, el contrato JS B, tests,
fixtures capturados, harness y documentación. La lista exacta de paths queda en
`changed-files.txt`; el diff completo se entrega como artefacto y puede reproducirse
con `git diff 8a331e647eeb574be90cb2a6bd28a7e46f874ae3..HEAD`.

**Ningún archivo legacy de aplicación, Edge, frontend o migración histórica fue
editado.** Sí hay reemplazos focales de funciones legacy/A dentro de la nueva
B02: son parte expresa del alcance autorizado, no deben confundirse con ausencia
de cambios de comportamiento para una futura cohorte adoptada.

Dos suites certificadas recibieron sólo import/hook optativo para probar B
instalado; sus assertions permanecen intactas. Sus perfiles originales no activan
el hook. El resto de los cambios a archivos ya existentes está en el harness.

| Migración | SHA-256 final |
|---|---|
| `20260918160432_m1_contact_runtime_foundation.sql` | `77ce546027d03fab8bca91671ded6429071269392c2554a13ecfeeb9a4c0f72c` |
| `20260918160433_m1_contact_legacy_fences.sql` | `e90f8a82f635cb91ebe5a3ccc2a7bb1298b42699f0990026617968d1e6f205c9` |
| `20260918160434_m1_contact_commands.sql` | `f6ab335396ea25f174a9c1cb368d5c1bc410bf5c41bf75ac7582190ae65b3fae` |

Objetos: **5 tablas privadas, 33 funciones nuevas, 23 triggers nuevos, 5 policies,
8 índices explícitos** más índices PK/UNIQUE. Extensiones acotadas de gates,
receipts y events; 22 reemplazos focales y despacho B en el gateway existente.
El [inventario before/after](object-inventory.md) detalla firmas, owners,
SECURITY DEFINER/INVOKER, ACL y triggers. Los SQL son los contratos ejecutados,
no pseudocódigo. [Hashes de suite y contratos](evidence/final-artifact-hashes.json).

## Adopción, comandos y permisos

La adopción es una fila inmutable en
`private.crm_contact_next_action_adoptions`: lead, operación técnica única,
timestamp, principal postgres, gate/epoch/revisión/contrato/política/manifiesto,
motivo y snapshot. Requiere adopción Assignment previa y gate B autoritativo
explícito; sólo la función técnica cerrada, con `session_user=postgres`, puede
establecerla por el camino previsto. No depende de UI, payload, GUC, header ni
mera fila runtime. Pausar no desadopta ni reactiva writers legacy.

Los seis comandos son RecordContactOutcome (record/review/amend),
RecordContactTaskOmission, ScheduleNextAction, RescheduleNextAction,
CancelNextAction y EvaluateContactDeadlines. El getter es
`public.crm_read_contact_work_context(uuid)`, STABLE y READ ONLY.
Los [contratos detallados](implementation.md) especifican versiones, hash,
idempotencia, scope, efectos, errores y normalización. El actor procede de
auth/perfil activo; el replay exige conservar acceso actual.

Todo se instala cerrado: no adopciones ni gates activados, sin EXECUTE API del
gateway/getter y sin DML API sobre las cinco tablas. RLS/FORCE RLS, policies de
owner interno, receipt transaccional con xid/PID y capability B exclusiva.
Los grants internos postgres demostrados necesarios no se transmiten a seller
ni amplían DML del runtime owner sobre tablas legacy. No se otorga autoridad
de WhatsApp IA; se conserva la denegación sticky certificada de Assignment.

Se preservan etapa, entrevista, seña, oferta, venta, ownership, epochs de canal,
conversaciones e historia. Omisión no es intento; agenda manual no reinicia
protocolo; acción realmente cumplida puede dejar next_action_required sin fecha
inventada. DNC sólo restringe identidad ya vinculada; no sanea ni levanta restricciones.
Evaluate usa reloj servidor y no produce productividad del invocante.

## Concurrencia y fallos

Sesiones PostgreSQL reales verifican B61–B70: misma intención, dos hechos por
tarea, contacto/Transfer en ambos órdenes, agenda/contacto/Acknowledge,
reprogramación/cancelación/respuesta, reloj/contacto, pausa/comando,
adopción/writer legacy (incluido REPEATABLE READ e INSERT), opt-out/agenda/Transfer
y revisiones supervisoras. Se observan locks en pg_stat_activity; sleep no es el oracle.

B71–B76 cubren rollback tras hechos/crédito/agenda, terminación real del backend
precommit, commit con pérdida de respuesta, **40P01, 40001 y 55P03 reales**, retry
de misma intención, fallo de helper y agotamiento de versiones. B77 reproduce
proyecciones B en estructuras descartables sin ejecutar comandos otra vez;
no se presenta como restauración íntegra de toda la base productiva.

Los defectos SQL encontrados fueron corregidos exclusivamente dentro de las
candidatas B. Las equivocaciones de fixture/harness se corrigieron sin modificar
permisos ni oracles legacy para obtener PASS. [Registro con causa y prueba](failures-and-corrections.md).

## Entorno y límites

PostgreSQL **17.6**, QEMU TCG sin NIC ni mount del host, 2 vCPU/2048 MiB,
Linux 6.8.0-138-generic, initramfs descartable y allowlist de fuentes.
Sólo lo, sin rutas; PG por socket Unix, listen_addresses vacío; UID/GID 65534
y seccomp contra sockets IP. Migrador postgres NOSUPERUSER/CREATEROLE/BYPASSRLS
del fixture. Sin DSN remoto, service_role productivo, token Meta, datos de
clientes o conversaciones reales. No Edge, cron ni llamadas a proveedores.
Manifests, hashes, aislamiento y destrucción de cada guest están en
`evidence/final-db` y `evidence/final-contact`.

El baseline es schema capturado más overlays explícitos y datos ficticios;
no equivale a una copia íntegra ni actualizada de producción. El fixture mínimo
de fundación se mantiene en sus propios perfiles, separado de esa compatibilidad.
Los nueve eventos históricos de modo humano se conservan como evidencia limitada:
no prueban vendedores, envíos efectivos, uso incorrecto ni consumidor exclusivo.

## Diferencias, riesgos y writers pendientes

- Timestamps del transporte: UTC exacto con milisegundos; zona por separado. Nombres de migración creados con UTC local por ausencia de CLI, documentado.
- Barreras SHARE NOWAIT pueden devolver 55P03/40001 incluso al writer legacy preadopción bajo contención. La semántica comercial sigue caracterizada; el contrato técnico de retry necesita callers preparados.
- El SHARE sobre la tabla de gates retrasa cambios de gate mientras hay comandos en vuelo, incluso de otros leads. No hay benchmark de carga productiva.
- La instalación cierra EXECUTE del gateway compartido, como en el baseline de laboratorio. Si un rollout futuro ya hubiera abierto Assignment a clientes, debe revisar ese grant y su secuencia de instalación; estas pruebas no certifican instalar B sobre una exposición API distinta de la capturada.
- La evidencia manual no corrobora llamada ni entrega; las métricas futuras deben usar hechos/créditos/calidad, nunca cantidad bruta de eventos. El 40% futuro no se implementó.
- No hay UI ni productor automático de deadlines. Antes del cutover deben existir consumidores visibles para next_action_required, revisión y protocol_incomplete.
- Siguen incompatibles los callers legacy que mezclan contacto con etapa/entrevista/seña/venta/Recall, frontend actual, writers de webhook/ventas cuando pisan B, Apps Script y consumidores privilegiados no caracterizados. El rechazo atómico protege datos; no completa la integración.
- No se implementaron Centro de Alertas, reportes, frío/recupero, sender, handoff, entrevista, seña, venta ni Bank Credit. La regla gerencial de canal no se certifica como definitiva.

Las superficies exactas y su comportamiento por cohorte constan en
[legacy-boundary.md](legacy-boundary.md). M0 y **BL-01–BL-08 permanecen ABIERTOS**;
**BL-06 sigue P0**. No hubo evidencia remota nueva que permita cerrarlos.
La [tabla individual BL-01–08](validation-and-rollout.md) conserva evidencia,
limitaciones y pendientes. El aislamiento del laboratorio no cierra BL-08 de rollout.

## Rollback y cierre

Antes de adopción: descartar el laboratorio o reparar hacia adelante. Tras una
adopción válida: pausar/detener writer, preservar adopciones A/B, epochs, receipts,
eventos, hechos, créditos, acciones, estado comercial y denegación seller.
No bajar un flag para recuperar permisos o writers legacy; no down migration
que borre historia. Se conserva únicamente el opt-out restrictivo permitido
bajo paused. Una futura desadopción requiere otra autorización.

**Cero cambios productivos. No push, PR, merge, deploy, cutover ni adopción de
leads reales.** Sólo commits locales al concluir una validación coherente.
La entrega se detiene en M1-04B; no habilita la etapa siguiente.
