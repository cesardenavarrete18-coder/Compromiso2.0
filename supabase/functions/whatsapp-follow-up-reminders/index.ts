import { createClient } from "@supabase/supabase-js";
import { reminderText } from "./reminder-copy.ts";

type Reminder = {
  reminder_id: string;
  lead_id: string;
  customer_phone: string;
  model_interest: string;
  attempts: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function sendWhatsAppText(to: string, body: string) {
  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const graphVersion = Deno.env.get("META_GRAPH_API_VERSION") ?? "v25.0";
  if (!accessToken || !phoneNumberId) return { ok: false, messageId: "", payload: { error: "WhatsApp configuration incomplete" } };
  const result = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const payload = await result.json().catch(() => ({}));
  const messageId = Array.isArray(payload?.messages) ? String(payload.messages[0]?.id ?? "") : "";
  return { ok: result.ok, messageId, payload };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = request.headers.get("x-cron-secret") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) return json({ error: "Unauthorized" }, 401);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const settings = await db.from("whatsapp_automation_settings").select("cron_secret_hash").eq("id", true).maybeSingle();
  const receivedHash = await sha256(cronSecret);
  if (settings.error || !settings.data?.cron_secret_hash || !safeEqual(receivedHash, settings.data.cron_secret_hash)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const claimed = await db.rpc("claim_due_whatsapp_follow_up_reminders", { p_limit: 50 });
  if (claimed.error) {
    console.error("Reminder claim failed", claimed.error.message);
    return json({ error: "Unable to claim reminders" }, 500);
  }

  let sent = 0;
  let cancelled = 0;
  let failed = 0;
  for (const reminder of (claimed.data || []) as Reminder[]) {
    try {
      const [row, laterInbound, humanMessage, control] = await Promise.all([
        db.from("whatsapp_follow_up_reminders").select("status").eq("id", reminder.reminder_id).single(),
        db.from("lead_messages").select("id", { count: "exact", head: true }).eq("lead_id", reminder.lead_id).eq("direction", "inbound"),
        db.from("lead_messages").select("id", { count: "exact", head: true }).eq("lead_id", reminder.lead_id).eq("origin", "human"),
        db.from("whatsapp_conversation_controls").select("mode").eq("lead_id", reminder.lead_id).maybeSingle(),
      ]);
      if (row.data?.status !== "processing" || (laterInbound.count || 0) !== 1 || (humanMessage.count || 0) > 0 || control.data?.mode === "human") {
        await db.from("whatsapp_follow_up_reminders").update({ status: "cancelled", last_error: "La conversación tuvo actividad posterior" }).eq("id", reminder.reminder_id).eq("status", "processing");
        cancelled += 1;
        continue;
      }

      const body = reminderText(reminder.model_interest);
      const outgoing = await sendWhatsAppText(reminder.customer_phone, body);
      if (!outgoing.ok) {
        const terminal = Number(reminder.attempts) >= 3;
        await db.from("whatsapp_follow_up_reminders").update({
          status: terminal ? "failed" : "pending",
          due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          last_error: JSON.stringify(outgoing.payload).slice(0, 1000),
        }).eq("id", reminder.reminder_id).eq("status", "processing");
        failed += 1;
        continue;
      }

      const now = new Date().toISOString();
      const persisted = await Promise.all([
        db.from("lead_messages").insert({
          lead_id: reminder.lead_id,
          whatsapp_message_id: outgoing.messageId || null,
          direction: "outbound",
          message_type: "text",
          body,
          raw_payload: { ...outgoing.payload, automated_follow_up: true },
          origin: "ai",
        }),
        db.from("whatsapp_follow_up_reminders").update({ status: "sent", sent_at: now, whatsapp_message_id: outgoing.messageId || null, last_error: "" }).eq("id", reminder.reminder_id).eq("status", "processing"),
        db.from("leads").update({ last_message_at: now }).eq("id", reminder.lead_id),
      ]);
      const persistenceError = persisted.find((result) => result.error)?.error;
      if (persistenceError) console.error("Reminder persistence failed", persistenceError.message);
      sent += 1;
    } catch (error) {
      const terminal = Number(reminder.attempts) >= 3;
      await db.from("whatsapp_follow_up_reminders").update({
        status: terminal ? "failed" : "pending",
        due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
      }).eq("id", reminder.reminder_id).eq("status", "processing");
      failed += 1;
    }
  }

  return json({ claimed: (claimed.data || []).length, sent, cancelled, failed });
});
