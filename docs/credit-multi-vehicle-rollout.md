# Créditos multi-modelo — rollout auditado sobre CRM V2

## Estado actual

- CRM V2 está en `main` y aplicado en Supabase Production.
- PR #60 fue mergeado a `main` después de sincronizar los cambios recientes de AI V2/Filter.
- Vercel Production del merge de PR #60: success.
- Supabase Production registró la migración de créditos como `20260910134044_bank_credit_multi_vehicle_applicability`.
- El repositorio debe conservar el mismo timestamp canónico en `20260910134044_bank_credit_multi_vehicle_applicability.sql`.
- El filename pre-aplicación `20260910131500_bank_credit_multi_vehicle_applicability.sql` debe retirarse para evitar drift de migration history.

## Modelo de negocio implementado

- Una condición de crédito puede aplicar a múltiples versiones de múltiples modelos.
- La aplicabilidad se persiste como snapshot explícito en `bank_credit_offer_versions`.
- Seleccionar “todo el modelo” guarda únicamente las versiones activas existentes al momento de guardar.
- Una versión creada en el futuro no hereda automáticamente el crédito.
- Presupuestos de vendedores sólo ofrecen créditos enlazados a versiones del modelo seleccionado.
- Postgres valida la combinación crédito + modelo + versión y además exige que oferta, modelo y versión estén activos y que la oferta esté vigente.
- La vigencia se evalúa con la fecha comercial de `America/Argentina/Buenos_Aires`, no con UTC.

## Verificación de datos e histórico

La auditoría post-migración verificó 14 presupuestos históricos con `offer_type = 'bank_credit'`:

- 14/14 cumplen la relación crédito + modelo + versión;
- 0 incompatibles.

No se borra automáticamente el histórico. El panel aplica esta regla:

- crédito sin presupuestos históricos: se puede eliminar;
- crédito con presupuestos históricos: se archiva (`active = false`) en vez de borrarse.

Las versiones ya vinculadas a créditos también se archivan en vez de eliminarse, preservando las relaciones históricas.

## Estado de Supabase Production

- `bank_credit_offers.model_id` es nullable.
- RPC `admin_upsert_bank_credit_offer(...)` presente.
- `authenticated` puede ejecutar el RPC; `anon` no.
- Trigger de aplicabilidad presente sobre `sales_quotes`.
- Security Advisors post-DDL no agregaron alertas nuevas atribuibles a la feature.
- El contador preexistente de funciones `SECURITY DEFINER` ejecutables por authenticated se mantuvo sin aumento por esta migración.

## Siguiente validación operativa

Con backend y frontend ya productivos corresponde smoke real:

1. crear un crédito que aplique a 2+ modelos;
2. seleccionar todas las versiones de un modelo y sólo algunas de otro;
3. editar la condición y verificar que el cambio sea atómico;
4. desde vendedor, comprobar que sólo aparezcan modelos/versiones permitidos;
5. generar un presupuesto válido;
6. comprobar que una combinación no habilitada sea rechazada por Postgres;
7. archivar/eliminar condiciones viejas según tengan o no historial.

## Salvaguardas relevantes

- RPC con `SECURITY INVOKER` y control `private.current_user_is_admin()`.
- RLS existente en `bank_credit_offers`, `bank_credit_offer_versions` y `sales_quotes`.
- El selector legado `creditModel` queda deshabilitado y sin `required`.
- El vendedor refresca líneas de crédito al entrar a la modalidad Crédito.
- UI y Postgres validan aplicabilidad; no se depende sólo del frontend.
