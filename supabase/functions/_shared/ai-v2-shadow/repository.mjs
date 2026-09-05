export function createShadowRepository(db) {
  return Object.freeze({
    async claim(inboundMessageId, leadId, previousShadowRunId = null) {
      const existing = await db.from("ai_v2_shadow_runs").select("*").eq("inbound_message_id", inboundMessageId).maybeSingle();
      if (existing.data) return { created: false, run: existing.data };
      const result = await db.from("ai_v2_shadow_runs").insert({ lead_id: leadId, inbound_message_id: inboundMessageId, previous_shadow_run_id: previousShadowRunId, status: "processing", candidate_reply_status: "pending" }).select("*").single();
      if (result.error?.code === "23505") {
        const retry = await db.from("ai_v2_shadow_runs").select("*").eq("inbound_message_id", inboundMessageId).single();
        return { created: false, run: retry.data };
      }
      if (result.error) throw result.error;
      return { created: true, run: result.data };
    },
    async previous(leadId, before) {
      const result = await db.from("ai_v2_shadow_runs").select("id, next_state, created_at").eq("lead_id", leadId).eq("status", "completed").lt("created_at", before).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async complete(id, record, inboundCreatedAt, leadId) {
      // Promote only if this inbound is still temporally current. Historical rows remain auditable.
      const newer = await db.from("lead_messages").select("id").eq("lead_id", leadId).eq("direction", "inbound").gt("created_at", inboundCreatedAt).limit(1);
      const safeRecord = newer.data?.length ? { ...record, status: "superseded", candidate_reply_status: "stale" } : record;
      const result = await db.from("ai_v2_shadow_runs").update(safeRecord).eq("id", id);
      if (result.error) throw result.error;
    },
    async fail(id, failure) { const result = await db.from("ai_v2_shadow_runs").update(failure).eq("id", id); if (result.error) throw result.error; },
  });
}
