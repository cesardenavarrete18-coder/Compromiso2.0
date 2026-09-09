# Créditos multi-modelo — rollout auditado

## Estado auditado

- Base: `main` en `ac7e91b1e0a8cb132e0d94d3cf709f96c4b5c79b`.
- Feature: `feat/admin-credit-multi-vehicle-applicability`.
- Producción Supabase permanece sin la migración `20260909130000_bank_credit_multi_vehicle_applicability.sql`.
- `bank_credit_offers.model_id` continúa `NOT NULL` en producción hasta el rollout.
- El RPC `admin_upsert_bank_credit_offer(...)` no existe todavía en producción.
- Vercel build del head auditado: success.

## Modelo de negocio implementado

- Una condición de crédito puede aplicar a múltiples versiones de múltiples modelos.
- La aplicabilidad se persiste como snapshot explícito en `bank_credit_offer_versions`.
- Seleccionar “todo el modelo” guarda únicamente las versiones activas existentes al momento de guardar.
- Una versión creada en el futuro no hereda automáticamente el crédito.
- Presupuestos de vendedores sólo ofrecen créditos enlazados a versiones del modelo seleccionado.
- Postgres valida la combinación crédito + modelo + versión al insertar o modificar los campos comerciales de un presupuesto.

## Historial y créditos viejos

En la auditoría de producción se observaron 36 créditos, 35 activos y 14 presupuestos de crédito que referencian 6 condiciones distintas.

No se debe borrar automáticamente todo el histórico durante la migración. El panel nuevo aplica esta regla:

- crédito sin presupuestos históricos: se puede eliminar;
- crédito con presupuestos históricos: se archiva (`active = false`) en vez de borrarse.

Esto permite reemplazar las condiciones comerciales actuales sin romper presupuestos emitidos.

## Orden recomendado de rollout

1. Revisar PR y preview frontend.
2. Confirmar que `main` no se movió o rebasar/auditar nuevamente si cambió.
3. Aplicar la migración Supabase de forma controlada.
4. Confirmar migration history y advisors post-DDL.
5. Cargar las nuevas condiciones multi-modelo desde Admin.
6. Hacer smoke real con al menos:
   - un crédito que aplique a 2+ modelos;
   - un modelo completo y otro parcialmente seleccionado;
   - creación y edición del crédito;
   - presupuesto vendedor para versión permitida;
   - comprobación de que una versión no permitida no aparece;
   - intento directo inválido rechazado por la validación de Postgres.
7. Archivar/eliminar las condiciones viejas según tengan o no historial.
8. Recién después autorizar merge/promoción definitiva.

## Salvaguardas relevantes

- RPC con `SECURITY INVOKER` y control `private.current_user_is_admin()`.
- RLS existente en `bank_credit_offers`, `bank_credit_offer_versions` y `sales_quotes`.
- El selector legado `creditModel` queda deshabilitado y sin `required`, evitando que la validación nativa bloquee el formulario multi-modelo.
- El vendedor refresca líneas de crédito al entrar a la modalidad Crédito.
- La UI y Postgres validan aplicabilidad, evitando depender sólo del frontend.
