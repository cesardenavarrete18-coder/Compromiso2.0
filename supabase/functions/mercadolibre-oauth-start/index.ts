import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Sesión requerida." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const clientId = Deno.env.get("MELI_CLIENT_ID") ?? "";
  const redirectUri = Deno.env.get("MELI_REDIRECT_URI") ?? "";
  if (!supabaseUrl || !anonKey || !clientId || !redirectUri) return jsonResponse({ error: "La conexión con Mercado Libre todavía no está configurada." }, 500);

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.replace("Bearer ", "");
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse({ error: "Sesión inválida o vencida." }, 401);

  const random = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(random).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const stateHash = await sha256(state);
  const saved = await client.rpc("create_mercadolibre_oauth_state", { p_state_hash: stateHash });
  if (saved.error) return jsonResponse({ error: saved.error.message }, 403);

  const authorizationUrl = new URL("https://auth.mercadolibre.com.ar/authorization");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);
  return jsonResponse({ authorizationUrl: authorizationUrl.toString() });
});
