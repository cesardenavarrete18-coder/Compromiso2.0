# PR summary — Créditos multi-modelo sobre CRM V2

## Objetivo

Permitir que una única condición de crédito aplique a múltiples modelos y versiones, evitando duplicar la misma línea por cada vehículo.

## Alcance

- Admin: selector jerárquico multi-modelo / multi-versión.
- Snapshot: seleccionar un modelo guarda las versiones activas existentes en ese momento; futuras versiones no heredan automáticamente.
- Backend: `bank_credit_offers.model_id` pasa a ser ancla legado nullable para nuevos créditos multi-vehículo.
- Persistencia atómica mediante `admin_upsert_bank_credit_offer(...)`.
- Seller: sólo muestra créditos aplicables al modelo elegido y limita las versiones a las vinculadas.
- Presupuestos: snapshot conserva modelo y versión realmente utilizados.
- Defensa en profundidad: trigger de Postgres rechaza combinación crédito/modelo/versión no habilitada.
- Histórico: si un crédito tiene presupuestos, el Admin lo archiva en vez de borrarlo.
- Compatibilidad: el selector legado queda deshabilitado para no interferir con la validación nativa del formulario.
- Vigencia: fecha comercial calculada en `America/Argentina/Buenos_Aires`.

## Integración CRM V2

- Base actual: `main @ 4380f25a7f9761da6cc9214ca93bff28b9bd9270`.
- Candidato: `integration/credit-multi-vehicle-v2-port`.
- PR final de auditoría: #60, Draft.
- La portación de la feature original sobre CRM V2 fue mergeable y no presentó conflictos.
- `admin.js` y `sales.js` no cambiaron respecto de la base funcional original de créditos.
- El workspace CRM V2 mantiene el contrato DOM requerido por el adapter de presupuestos.

## Migración

- Archivo vigente: `20260910131500_bank_credit_multi_vehicle_applicability.sql`.
- El archivo previo `20260909130000_bank_credit_multi_vehicle_applicability.sql` fue retirado del candidato para no quedar intercalado antes de las migraciones CRM V2 ya aplicadas.
- Última migración Production observada antes de esta feature: `20260910012455_crm_v2_recover_history_only_no_contact`.

## Auditoría

- Producción todavía no tiene aplicada la migración de créditos multi-modelo.
- Rehearsal SQL completo sobre Production CRM V2 dentro de `BEGIN/ROLLBACK`: aprobado.
- Post-rollback: columna, RPC y trigger volvieron exactamente al estado previo.
- 14/14 presupuestos históricos de crédito cumplen la nueva relación crédito/modelo/versión; 0 incompatibles.
- Vercel Preview del candidato: success.
- GitHub Actions asociados al commit: ninguno; no considerar Vercel equivalente a una suite CI completa.
- Tests de la feature cubren aplicabilidad, snapshot de versiones, seguridad del RPC, archive guard, bloqueo del selector legado, orden de migración y borde horario Buenos Aires/UTC.

## Importante para rollout

PR #60 debe permanecer Draft hasta completar la auditoría final del diff y definir el smoke productivo. No aplicar la migración ni mergear a `main` sin autorización explícita.
