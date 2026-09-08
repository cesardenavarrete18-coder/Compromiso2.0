# Supabase aislado para Vercel Preview

La configuración commiteada en `vendedores/supabase-config.js` sigue siendo la de Production. El build no la modifica cuando `VERCEL_ENV=production`.

Para cada Vercel Preview, cargar estas variables con scope **Preview** solamente (no Production):

- `SUPABASE_URL=https://lygtmfvmdyjfiosnfwbp.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<publishable/anon key del proyecto QA>`

Vercel ejecuta el `buildCommand` declarado en `vercel.json`:

```sh
node scripts/configure-supabase-preview.mjs
```

Durante un build con `VERCEL_ENV=preview`, el script exige ambas variables, valida que la URL pertenezca exactamente al proyecto QA `lygtmfvmdyjfiosnfwbp` y recién entonces reemplaza el objeto `window.GRUPO_SUR_SUPABASE_CONFIG` del artefacto estático. Una variable ausente o una URL de otro proyecto termina el build con error; nunca existe fallback de Preview a Production.

## Verificación en el browser

1. Abrir la URL del deployment Preview y entrar a uno de los portales CRM.
2. En DevTools > Console ejecutar:

   ```js
   window.GRUPO_SUR_SUPABASE_CONFIG.url
   ```

   El resultado debe ser exactamente `https://lygtmfvmdyjfiosnfwbp.supabase.co`.
3. En DevTools > Network, filtrar por `supabase.co` y confirmar que todas las solicitudes CRM tienen host `lygtmfvmdyjfiosnfwbp.supabase.co` y que no aparece el host de Production.

La publishable/anon key es configuración pública del cliente, pero se inyecta desde el entorno Preview y no se agrega al repositorio.
