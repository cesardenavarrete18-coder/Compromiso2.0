import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeSellerCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function sellerEmail(code: string) {
  return `${code.toLowerCase()}@acceso.compromisomi0km.com.ar`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sesión requerida." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Configuración del servidor incompleta." }, 500);
  }

  const token = authorization.replace("Bearer ", "");
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "Sesión inválida o vencida." }, 401);
  }

  const { data: caller, error: callerError } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("user_id", authData.user.id)
    .single();
  if (callerError || !caller || caller.role !== "admin" || caller.active !== true) {
    return jsonResponse({ error: "Acceso reservado a administradores." }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Solicitud inválida." }, 400);
  }

  const action = String(payload.action ?? "");

  if (action === "list") {
    const { data, error } = await adminClient
      .from("profiles")
      .select("user_id, seller_code, full_name, phone, role, active, created_at")
      .order("role")
      .order("full_name");
    if (error) {
      return jsonResponse({ error: "No se pudieron obtener los usuarios." }, 500);
    }
    return jsonResponse({ users: data });
  }

  if (action === "create_seller") {
    const sellerCode = normalizeSellerCode(payload.sellerCode);
    const fullName = String(payload.fullName ?? "").trim().replace(/\s+/g, " ");
    const phone = String(payload.phone ?? "").trim();
    const password = String(payload.password ?? "");

    if (!/^[A-Z0-9_-]{3,20}$/.test(sellerCode)) {
      return jsonResponse({ error: "El código debe tener entre 3 y 20 letras o números." }, 400);
    }
    if (fullName.length < 5 || !fullName.includes(" ")) {
      return jsonResponse({ error: "Ingresá nombre y apellido completos." }, 400);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
    }

    const email = sellerEmail(sellerCode);
    const { error: inviteError } = await adminClient.from("user_invites").insert({
      email,
      role: "seller",
      seller_code: sellerCode,
      full_name: fullName,
      phone: phone || null,
    });
    if (inviteError) {
      const duplicate = inviteError.code === "23505";
      return jsonResponse({ error: duplicate ? "Ese código de vendedor ya existe." : "No se pudo preparar el acceso." }, duplicate ? 409 : 500);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      await adminClient.from("user_invites").delete().eq("email", email).is("accepted_at", null);
      return jsonResponse({ error: createError?.message || "No se pudo crear el vendedor." }, 400);
    }

    return jsonResponse({
      user: {
        user_id: created.user.id,
        seller_code: sellerCode,
        full_name: fullName,
        phone: phone || null,
        role: "seller",
        active: true,
      },
    }, 201);
  }

  if (action === "set_active") {
    const userId = String(payload.userId ?? "");
    const active = payload.active === true;
    if (!/^[0-9a-f-]{36}$/i.test(userId) || userId === authData.user.id) {
      return jsonResponse({ error: "No podés modificar el estado de esta cuenta." }, 400);
    }
    const { error } = await adminClient.from("profiles").update({ active }).eq("user_id", userId).eq("role", "seller");
    if (error) {
      return jsonResponse({ error: "No se pudo actualizar el vendedor." }, 500);
    }
    return jsonResponse({ success: true });
  }

  if (action === "reset_password") {
    const userId = String(payload.userId ?? "");
    const password = String(payload.password ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(userId) || password.length < 8) {
      return jsonResponse({ error: "Datos de contraseña inválidos." }, 400);
    }
    const { data: target } = await adminClient.from("profiles").select("role").eq("user_id", userId).single();
    if (!target || target.role !== "seller") {
      return jsonResponse({ error: "Solamente se pueden restablecer vendedores." }, 400);
    }
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (error) {
      return jsonResponse({ error: "No se pudo actualizar la contraseña." }, 500);
    }
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "Acción desconocida." }, 400);
});
