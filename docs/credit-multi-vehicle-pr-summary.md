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
- Defensa en profundidad: trigger de Postgres rechaza combinación crédito/modelo/versión no habilitada, inactiva o fuera de vigencia.
- Histórico: si un crédito tiene presupuestos, el Admin lo archiva en vez de borrarlo.
- Compatibilidad: el selector legado queda deshabilitado para no interferir con la validación nativa del formulario.
- Vigencia: fecha comercial calculada en `America/Argentina/Buenos_Aires`.

## Integración CRM V2

- PR #60 fue integrado a `main` después de sincronizar los commits nuevos de AI V2/Filter.
- La portación de la feature original sobre CRM V2 no presentó conflictos funcionales.
- `admin.js` y `sales.js` no cambiaron respecto de la base funcional original de créditos.
- El workspace CRM V2 mantiene el contrato DOM requerido por el adapter de presupuestos.

## Migración

- Supabase Production registró la migración como `20260910134044_bank_credit_multi_vehicle_applicability`.
- El archivo del repositorio debe usar el mismo timestamp canónico: `20260910134044_bank_credit_multi_vehicle_applicability.sql`.
- El nombre previo `20260910131500_bank_credit_multi_vehicle_applicability.sql` fue sólo el nombre pre-aplicación y debe retirarse para evitar drift en futuros `db push`.
- El SQL es idéntico; la reconciliación es de filename/version únicamente.

## Auditoría

- Migración aplicada en Production y registrada una sola vez.
- `bank_credit_offers.model_id` nullable.
- RPC y trigger presentes; `authenticated` puede ejecutar el RPC y `anon` no.
- 14/14 presupuestos históricos de crédito cumplen la nueva relación crédito/modelo/versión; 0 incompatibles.
- Security Advisors post-DDL no agregaron nuevas advertencias atribuibles a esta feature.
- Vercel Production del merge de PR #60: success.
- GitHub Actions asociados al commit: ninguno; Vercel no se considera equivalente a una suite CI completa.
