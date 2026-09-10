# Créditos multi-modelo — rollout auditado sobre CRM V2

## Estado auditado

- Base actual: `main` en `4380f25a7f9761da6cc9214ca93bff28b9bd9270`.
- Candidato: `integration/credit-multi-vehicle-v2-port`, 0 commits detrás de `main` al abrir PR #60.
- CRM V2 ya está en `main` y aplicado en Supabase Production.
- Última migración productiva observada: `20260910012455_crm_v2_recover_history_only_no_contact`.
- Migración de esta feature: `20260910131500_bank_credit_multi_vehicle_applicability.sql`, posterior al estado productivo CRM V2.
- Producción permanece sin esta migración: `bank_credit_offers.model_id` sigue `NOT NULL`, el RPC nuevo no existe y el trigger nuevo no existe.
- Vercel Preview del candidato: success.
- No hay GitHub Actions asociados al commit; Vercel no se considera sustituto de la suite de tests.

## Modelo de negocio implementado

- Una condición de crédito puede aplicar a múltiples versiones de múltiples modelos.
- La aplicabilidad se persiste como snapshot explícito en `bank_credit_offer_versions`.
- Seleccionar “todo el modelo” guarda únicamente las versiones activas existentes al momento de guardar.
- Una versión creada en el futuro no hereda automáticamente el crédito.
- Presupuestos de vendedores sólo ofrecen créditos enlazados a versiones del modelo seleccionado.
- Postgres valida la combinación crédito + modelo + versión al insertar o modificar los campos comerciales de un presupuesto.
- La vigencia se evalúa con la fecha comercial de `America/Argentina/Buenos_Aires`, no con UTC.

## Compatibilidad con CRM V2

- `vendedores/admin/admin.js` y `vendedores/sales.js` mantienen el mismo contenido que la base sobre la que se desarrolló la feature.
- CRM V2 modificó el workspace vendedor pero preservó los IDs del diálogo de Presupuestos requeridos por el adapter (`quoteForm`, `quoteModel`, `quoteOfferType`, `quoteOffer`, `quoteVersion`, `quoteSubmit`, etc.).
- El Admin actual conserva los IDs del módulo de créditos (`creditForm`, `creditModel`, `creditVersionOptions`, `creditOfferList`, etc.).
- La portación sobre `main` se realizó mediante una integración interna sin conflictos.

## Verificación de datos e histórico

La auditoría actual verificó 14 presupuestos históricos con `offer_type = 'bank_credit'`:

- 14/14 cumplen la relación crédito + modelo + versión que exigirá el nuevo trigger;
- 0 incompatibles.

No se debe borrar automáticamente el histórico. El panel aplica esta regla:

- crédito sin presupuestos históricos: se puede eliminar;
- crédito con presupuestos históricos: se archiva (`active = false`) en vez de borrarse.

Las versiones ya vinculadas a créditos también se archivan en vez de eliminarse, preservando las relaciones históricas.

## Rehearsal de migración

El SQL completo fue ejecutado sobre el esquema CRM V2 actual de Supabase Production dentro de una transacción explícita con `ROLLBACK`.

Dentro de la transacción se confirmó:

- `bank_credit_offers.model_id` nullable;
- RPC `admin_upsert_bank_credit_offer(...)` creado;
- función privada de validación creada;
- trigger de aplicabilidad creado sobre `sales_quotes`.

Después del `ROLLBACK` se confirmó nuevamente que los cuatro cambios no persistieron. Production quedó intacta.

El proyecto QA disponible no contiene actualmente el módulo `sales_quotes`, por lo que no representa el esquema completo necesario para un E2E de esta feature. No se usa esa diferencia como evidencia negativa de la migración.

## Orden recomendado de rollout

1. Auditar PR #60 y confirmar que continúa 0 commits detrás de `main`.
2. Confirmar Vercel Preview verde y revisar el diff final.
3. Aplicar `20260910131500_bank_credit_multi_vehicle_applicability.sql` en Production sólo con autorización explícita.
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
8. Sólo después promover definitivamente el cambio.

## Salvaguardas relevantes

- RPC con `SECURITY INVOKER` y control `private.current_user_is_admin()`.
- RLS existente en `bank_credit_offers`, `bank_credit_offer_versions` y `sales_quotes`.
- El selector legado `creditModel` queda deshabilitado y sin `required`, evitando que la validación nativa bloquee el formulario multi-modelo.
- El vendedor refresca líneas de crédito al entrar a la modalidad Crédito.
- La UI y Postgres validan aplicabilidad, evitando depender sólo del frontend.
