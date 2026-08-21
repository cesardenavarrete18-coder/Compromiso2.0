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

function normalizeTikTokCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function validTikTokCode(value: string) {
  return /^[A-Z]{2,}[A-Z0-9_-]*\d[A-Z0-9_-]*$/.test(value) && value.length <= 20;
}

function sellerEmail(code: string) {
  return `${code.toLowerCase()}@acceso.compromisomi0km.com.ar`;
}

function normalizeCommercialRole(value: unknown) {
  const role = String(value ?? "seller");
  return ["seller", "supervisor", "admventas"].includes(role) ? role : "seller";
}

function normalizeContactEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function validContactEmail(value: string) {
  return value.length <= 254 && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
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
      .select("user_id, seller_code, tiktok_code, full_name, phone, contact_email, role, active, created_at")
      .order("role")
      .order("full_name");
    if (error) {
      return jsonResponse({ error: "No se pudieron obtener los usuarios." }, 500);
    }
    return jsonResponse({ users: data });
  }

  if (action === "create_seller" || action === "create_user") {
    const role = normalizeCommercialRole(payload.role);
    const sellerCode = normalizeSellerCode(payload.sellerCode);
    const tiktokCode = role === "seller" ? normalizeTikTokCode(payload.tiktokCode) : null;
    const fullName = String(payload.fullName ?? "").trim().replace(/\s+/g, " ");
    const phone = normalizePhone(payload.phone);
    const contactEmail = normalizeContactEmail(payload.contactEmail);
    const password = String(payload.password ?? "");

    if (!/^[A-Z0-9_-]{3,20}$/.test(sellerCode)) {
      return jsonResponse({ error: "El código debe tener entre 3 y 20 letras o números." }, 400);
    }
    if (role === "seller" && !validTikTokCode(tiktokCode || "")) {
      return jsonResponse({ error: "El código TikTok debe comenzar con dos letras, incluir un número y tener hasta 20 caracteres." }, 400);
    }
    if (fullName.length < 5 || !fullName.includes(" ")) {
      return jsonResponse({ error: "Ingresá nombre y apellido completos." }, 400);
    }
    if (phone.length < 6 || phone.length > 30) {
      return jsonResponse({ error: "Ingresá un teléfono de contacto válido." }, 400);
    }
    if (!validContactEmail(contactEmail)) {
      return jsonResponse({ error: "Ingresá un correo de contacto válido." }, 400);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
    }

    if (tiktokCode) {
      const { data: existingTikTokCode, error: tiktokLookupError } = await adminClient
        .from("profiles")
        .select("user_id")
        .eq("tiktok_code", tiktokCode)
        .maybeSingle();
      if (tiktokLookupError) {
        return jsonResponse({ error: "No se pudo verificar el código TikTok." }, 500);
      }
      if (existingTikTokCode) {
        return jsonResponse({ error: "Ese código TikTok ya pertenece a otro vendedor." }, 409);
      }
    }

    const email = role === "seller" ? sellerEmail(sellerCode) : contactEmail;
    const { error: inviteError } = await adminClient.from("user_invites").insert({
      email,
      role,
      seller_code: sellerCode,
      tiktok_code: tiktokCode,
      full_name: fullName,
      phone,
      contact_email: contactEmail,
    });
    if (inviteError) {
      const duplicate = inviteError.code === "23505";
      return jsonResponse({ error: duplicate ? "Ese código o correo ya existe." : "No se pudo preparar el acceso." }, duplicate ? 409 : 500);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role,
        seller_code: sellerCode,
        ...(tiktokCode ? { tiktok_code: tiktokCode } : {}),
      },
    });
    if (createError || !created.user) {
      await adminClient.from("user_invites").delete().eq("email", email).is("accepted_at", null);
      return jsonResponse({ error: createError?.message || "No se pudo crear el vendedor." }, 400);
    }

    return jsonResponse({
      user: {
        user_id: created.user.id,
        seller_code: sellerCode,
        tiktok_code: tiktokCode,
        full_name: fullName,
        phone,
        contact_email: contactEmail,
        role,
        active: true,
      },
    }, 201);
  }

  if (action === "update_seller") {
    const userId = String(payload.userId ?? "");
    const sellerCode = normalizeSellerCode(payload.sellerCode);
    const tiktokCode = normalizeTikTokCode(payload.tiktokCode);
    const fullName = String(payload.fullName ?? "").trim().replace(/\s+/g, " ");
    const phone = normalizePhone(payload.phone);
    const contactEmail = normalizeContactEmail(payload.contactEmail);
    if (!/^[0-9a-f-]{36}$/i.test(userId) || userId === authData.user.id) {
      return jsonResponse({ error: "No podés editar esta cuenta." }, 400);
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(sellerCode)) {
      return jsonResponse({ error: "El código debe tener entre 3 y 20 letras o números." }, 400);
    }
    if (!validTikTokCode(tiktokCode)) {
      return jsonResponse({ error: "El código TikTok debe comenzar con dos letras, incluir un número y tener hasta 20 caracteres." }, 400);
    }
    if (fullName.length < 5 || !fullName.includes(" ")) {
      return jsonResponse({ error: "Ingresá nombre y apellido completos." }, 400);
    }
    if (phone.length < 6 || phone.length > 30) {
      return jsonResponse({ error: "Ingresá un teléfono de contacto válido." }, 400);
    }
    if (!validContactEmail(contactEmail)) {
      return jsonResponse({ error: "Ingresá un correo de contacto válido." }, 400);
    }

    const { data: current, error: currentError } = await adminClient
      .from("profiles")
      .select("user_id, email, seller_code, tiktok_code, role")
      .eq("user_id", userId)
      .single();
    if (currentError || !current || current.role !== "seller") {
      return jsonResponse({ error: "No se encontró el vendedor." }, 404);
    }

    const [codeLookup, tiktokCodeLookup, emailLookup] = await Promise.all([
      adminClient.from("profiles").select("user_id").eq("seller_code", sellerCode).neq("user_id", userId).maybeSingle(),
      adminClient.from("profiles").select("user_id").eq("tiktok_code", tiktokCode).neq("user_id", userId).maybeSingle(),
      adminClient.from("profiles").select("user_id").eq("contact_email", contactEmail).neq("user_id", userId).maybeSingle(),
    ]);
    if (codeLookup.error || tiktokCodeLookup.error || emailLookup.error) {
      return jsonResponse({ error: "No se pudo verificar la disponibilidad de los códigos y el correo." }, 500);
    }
    if (codeLookup.data) {
      return jsonResponse({ error: "Ese código de acceso ya existe." }, 409);
    }
    if (tiktokCodeLookup.data) {
      return jsonResponse({ error: "Ese código TikTok ya pertenece a otro vendedor." }, 409);
    }
    if (emailLookup.data) {
      return jsonResponse({ error: "Ese correo ya pertenece a otro vendedor." }, 409);
    }

    const loginEmail = sellerEmail(sellerCode);
    const { data: authTarget, error: authTargetError } = await adminClient.auth.admin.getUserById(userId);
    if (authTargetError || !authTarget.user) {
      return jsonResponse({ error: "No se pudo verificar el acceso del vendedor." }, 500);
    }
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
      email: loginEmail,
      email_confirm: true,
      app_metadata: {
        ...(authTarget.user.app_metadata ?? {}),
        role: "seller",
        seller_code: sellerCode,
        tiktok_code: tiktokCode,
      },
    });
    if (authUpdateError) {
      return jsonResponse({ error: authUpdateError.message || "No se pudo actualizar el código de acceso." }, 400);
    }

    const { error: profileUpdateError } = await adminClient.from("profiles").update({
      email: loginEmail,
      seller_code: sellerCode,
      tiktok_code: tiktokCode,
      full_name: fullName,
      phone,
      contact_email: contactEmail,
    }).eq("user_id", userId).eq("role", "seller");
    if (profileUpdateError) {
      await adminClient.auth.admin.updateUserById(userId, {
        email: current.email,
        email_confirm: true,
        app_metadata: {
          ...(authTarget.user.app_metadata ?? {}),
          role: "seller",
          seller_code: current.seller_code,
          tiktok_code: current.tiktok_code,
        },
      });
      const duplicate = profileUpdateError.code === "23505";
      return jsonResponse({ error: duplicate ? "El código de acceso, código TikTok o correo ya pertenece a otro vendedor." : "No se pudo guardar la edición." }, duplicate ? 409 : 500);
    }
    return jsonResponse({ success: true });
  }

  if (action === "set_active") {
    const userId = String(payload.userId ?? "");
    const active = payload.active === true;
    if (!/^[0-9a-f-]{36}$/i.test(userId) || userId === authData.user.id) {
      return jsonResponse({ error: "No podés modificar el estado de esta cuenta." }, 400);
    }
    const { error } = await adminClient.from("profiles").update({ active }).eq("user_id", userId).in("role", ["seller", "supervisor", "admventas"]);
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
    if (!target || !["seller", "supervisor", "admventas"].includes(target.role)) {
      return jsonResponse({ error: "Solamente se pueden restablecer accesos comerciales." }, 400);
    }
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (error) {
      return jsonResponse({ error: "No se pudo actualizar la contraseña." }, 500);
    }
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "Acción desconocida." }, 400);
});
