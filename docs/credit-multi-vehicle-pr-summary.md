# PR summary — Créditos multi-modelo

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

## Auditoría previa al PR

- `main`: `ac7e91b1e0a8cb132e0d94d3cf709f96c4b5c79b`.
- Producción Supabase sin la migración nueva.
- `bank_credit_offers.model_id` sigue `NOT NULL` en producción.
- RPC multi-crédito ausente en producción.
- RLS activo en ofertas, vínculos y presupuestos.
- Vercel build del head auditado: success.
- GitHub Actions para el commit: no configuradas/no registradas.
- Producción observada: 36 créditos, 35 activos, 14 presupuestos de crédito; 6 condiciones de crédito están referenciadas históricamente.

## Importante para rollout

No mergear ni aplicar migración hasta hacer el smoke controlado indicado en `docs/credit-multi-vehicle-rollout.md`.
