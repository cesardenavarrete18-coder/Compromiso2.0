import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function openAI(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    const detail = (payload.error as JsonRecord | undefined)?.message;
    throw new Error(typeof detail === "string" ? detail : `OpenAI respondió ${response.status}`);
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const authorization = request.headers.get("Authorization") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !apiKey || !authorization) {
    return json({ error: "Configuración incompleta" }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userResult = await authClient.auth.getUser();
  const user = userResult.data.user;
  if (!user) return json({ error: "Sesión inválida" }, 401);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const profile = await db.from("profiles").select("role, active").eq("user_id", user.id).maybeSingle();
  if (profile.data?.role !== "admin" || !profile.data.active) return json({ error: "Acceso restringido" }, 403);

  const input = await request.json().catch(() => ({})) as JsonRecord;
  const documentId = typeof input.document_id === "string" ? input.document_id : "";
  const action = input.action === "delete" ? "delete" : input.action === "status" ? "status" : "ingest";
  if (!documentId) return json({ error: "Documento requerido" }, 400);

  const documentResult = await db.from("ai_knowledge_documents").select("*").eq("id", documentId).single();
  if (documentResult.error || !documentResult.data) return json({ error: "Documento inexistente" }, 404);
  const document = documentResult.data;

  if (action === "status") {
    if (!document.openai_file_id) return json({ ok: true, status: document.processing_status });
    try {
      const settingsResult = await db.from("ai_assistant_settings").select("vector_store_id").eq("id", true).single();
      const vectorStoreId = settingsResult.data?.vector_store_id || "";
      if (!vectorStoreId) throw new Error("No se encontró el índice documental");
      const indexed = await openAI(`/vector_stores/${vectorStoreId}/files/${document.openai_file_id}`, apiKey);
      const remoteStatus = String(indexed.status ?? "in_progress");
      const status = remoteStatus === "completed" ? "ready" : remoteStatus === "failed" || remoteStatus === "cancelled" ? "error" : "processing";
      await db.from("ai_knowledge_documents").update({ processing_status: status, processing_error: status === "error" ? "OpenAI no pudo indexar el PDF" : null }).eq("id", documentId);
      return json({ ok: true, status });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  if (action === "delete") {
    try {
      const settingsResult = await db.from("ai_assistant_settings").select("vector_store_id").eq("id", true).single();
      const vectorStoreId = settingsResult.data?.vector_store_id || "";
      if (vectorStoreId && document.openai_file_id) {
        await openAI(`/vector_stores/${vectorStoreId}/files/${document.openai_file_id}`, apiKey, { method: "DELETE" });
        await openAI(`/files/${document.openai_file_id}`, apiKey, { method: "DELETE" });
      }
      await db.storage.from("ai-commercial-knowledge").remove([document.storage_path]);
      await db.from("ai_knowledge_documents").delete().eq("id", documentId);
      return json({ ok: true });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  await db.from("ai_knowledge_documents").update({ processing_status: "processing", processing_error: null }).eq("id", documentId);

  try {
    const settingsResult = await db.from("ai_assistant_settings").select("vector_store_id").eq("id", true).single();
    let vectorStoreId = settingsResult.data?.vector_store_id || "";
    if (!vectorStoreId) {
      const vectorStore = await openAI("/vector_stores", apiKey, {
        method: "POST",
        body: JSON.stringify({ name: "Grupo Sur - Conocimiento comercial" }),
      });
      vectorStoreId = String(vectorStore.id ?? "");
      if (!vectorStoreId) throw new Error("No se pudo crear el índice documental");
      await db.from("ai_assistant_settings").update({ vector_store_id: vectorStoreId, updated_by: user.id }).eq("id", true);
    }

    const download = await db.storage.from("ai-commercial-knowledge").download(document.storage_path);
    if (download.error || !download.data) throw new Error(download.error?.message || "No se pudo leer el PDF");

    const form = new FormData();
    form.append("purpose", "assistants");
    form.append("file", new File([download.data], document.original_filename, { type: "application/pdf" }));
    const uploaded = await openAI("/files", apiKey, { method: "POST", body: form });
    const fileId = String(uploaded.id ?? "");
    if (!fileId) throw new Error("OpenAI no devolvió el identificador del archivo");

    await openAI(`/vector_stores/${vectorStoreId}/files`, apiKey, {
      method: "POST",
      body: JSON.stringify({
        file_id: fileId,
        attributes: { brand: document.brand, category: document.category, document_id: document.id },
      }),
    });

    let status = "processing";
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const indexed = await openAI(`/vector_stores/${vectorStoreId}/files/${fileId}`, apiKey);
      const remoteStatus = String(indexed.status ?? "in_progress");
      if (remoteStatus === "completed") { status = "ready"; break; }
      if (remoteStatus === "failed" || remoteStatus === "cancelled") throw new Error("OpenAI no pudo indexar el PDF");
    }

    await db.from("ai_knowledge_documents").update({
      openai_file_id: fileId,
      processing_status: status,
      processing_error: null,
    }).eq("id", documentId);
    return json({ ok: true, status, file_id: fileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("ai_knowledge_documents").update({ processing_status: "error", processing_error: message.slice(0, 1000) }).eq("id", documentId);
    return json({ error: message }, 500);
  }
});
