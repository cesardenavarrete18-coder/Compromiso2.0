# Puesta en producción de WhatsApp + IA

Este documento corresponde a la rama `agent/supervisor-lead-routing`. No activar los webhooks de Meta hasta que la migración y la función estén desplegadas.

## 1. Aplicar backend

1. Aplicar la migración `supabase/migrations/20260814120000_supervisor_lead_routing.sql`.
2. Desplegar nuevamente `manage-users`.
3. Desplegar `whatsapp-webhook` con verificación JWT desactivada, según `supabase/config.toml`.
4. Configurar los secretos del proyecto:
   - `META_WEBHOOK_VERIFY_TOKEN`: texto aleatorio largo generado para esta integración.
   - `META_APP_SECRET`: secreto de la app de Meta; nunca se expone en el navegador.
   - `OPENAI_API_KEY`: clave de API usada por la clasificación de leads.
   - `OPENAI_LEAD_MODEL`: opcional; por defecto `gpt-4.1-mini`.

La URL pública de callback tendrá este formato:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook
```

## 2. Crear el primer supervisor

1. Entrar a `/vendedores/admin/` con una cuenta administradora.
2. Abrir **Vendedores**.
3. En **Rol**, elegir **Supervisor**.
4. Completar nombre, código interno, teléfono, correo y contraseña inicial.
5. El supervisor entra desde `/vendedores/supervisor/` usando su correo real y esa contraseña.

## 3. Configurar Meta

1. En la app de Meta, abrir **WhatsApp > Configuración de producción > Configurar webhooks**.
2. En **URL de devolución de llamada**, pegar la URL pública de la función.
3. En **Token de verificación**, pegar exactamente el mismo valor guardado en `META_WEBHOOK_VERIFY_TOKEN`.
4. Presionar **Verificar y guardar**.
5. Suscribir el campo `messages`.
6. Activar **Suscribir webhooks** para el número productivo.
7. Enviar un WhatsApp real al número y confirmar que el lead aparezca en la bandeja de Supervisor.

## 4. Credenciales permanentes y salida a producción

1. Crear un usuario del sistema en el portfolio comercial.
2. Asignarle la app y la cuenta de WhatsApp con los permisos mínimos necesarios para mensajería.
3. Generar un token permanente y guardarlo como secreto del backend; no usar el token temporal del panel.
4. Completar el método de pago de WhatsApp Business.
5. Verificar la aprobación del nombre visible y completar en la app la política de privacidad, eliminación de datos, categoría e icono si Meta los solicita.
6. Publicar la app sólo después de validar recepción, asignación y trazabilidad con el número real.

## 5. Pruebas mínimas

- Mensaje general sin código: queda en `pending_supervisor`.
- Mensaje con código válido: se deriva directamente si el vendedor está activo, no está pausado y tiene cupo.
- Código inválido, vendedor pausado o cupo agotado: vuelve a la bandeja del supervisor.
- Teléfono ya asignado en los últimos 30 días: conserva al vendedor propietario.
- Todo cambio manual queda registrado en `lead_assignments`.
