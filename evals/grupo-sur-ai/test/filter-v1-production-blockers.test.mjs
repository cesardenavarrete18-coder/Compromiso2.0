import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createShadowRepository } from "../../../supabase/functions/_shared/ai-v2-shadow/repository.mjs";
import { RUNTIME_FINGERPRINT, shadowConfig } from "../../../supabase/functions/_shared/ai-v2-shadow/contracts.mjs";
import { runWhatsappV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/whatsapp-adapter.mjs";

// --- Family A: ai_v2_shadow_runs insert must satisfy the real NOT NULL contract ---
// The unit fakes elsewhere in this suite (memoryRepo in ai-v2-shadow.test.mjs) are a
// plain JS Map and never enforced the real Postgres schema. This test reads the actual
// migration text and rejects any INSERT that omits a NOT NULL column with no DEFAULT,
// exactly as Postgres itself would.
async function findMigration(fileNameFragment) {
  const migrationsDir = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
  const files = await readdir(migrationsDir);
  const match = files.find(name => name.includes(fileNameFragment));
  assert.ok(match, `expected a migration file matching ${fileNameFragment}`);
  return { path: migrationsDir + match, name: match };
}

function requiredColumnsWithoutDefault(sql) {
  const tableMatch = sql.match(/create table public\.ai_v2_shadow_runs \(([\s\S]*?)\n\);/);
  assert.ok(tableMatch, "expected to find the ai_v2_shadow_runs table definition");
  const body = tableMatch[1];
  const lines = body.split(",\n").map(line => line.trim()).filter(Boolean);
  const required = [];
  for (const line of lines) {
    const nameMatch = line.match(/^(\w+)\s+/);
    if (!nameMatch) continue;
    const isNotNull = /not null/i.test(line);
    const hasDefault = /default/i.test(line);
    if (isNotNull && !hasDefault) required.push(nameMatch[1]);
  }
  return required;
}

function pgLikeDb(recorder) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        lt() { return this; },
        lte() { return this; },
        gt() { return this; },
        order() { return this; },
        limit() { return this; },
        in() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
        async single() { return { data: null, error: null }; },
        insert(payload) {
          recorder.push({ table, payload });
          return {
            select() { return this; },
            async single() {
              if (table === "ai_v2_shadow_runs") {
                const required = recorder.requiredColumns;
                const missing = required.filter(col => payload[col] === undefined || payload[col] === null);
                if (missing.length) {
                  return { data: null, error: { code: "23502", message: `null value in column "${missing[0]}" of relation "ai_v2_shadow_runs" violates not-null constraint` } };
                }
              }
              return { data: { id: "run-1", ...payload }, error: null };
            },
          };
        },
        update(payload) {
          recorder.push({ table, updatePayload: payload });
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
}

test("Family A (red->green): claim() insert satisfies ai_v2_shadow_runs NOT NULL contract", async () => {
  const { path } = await findMigration("ai_v2_shadow_runs.sql");
  const sql = await readFile(path, "utf8");
  const required = requiredColumnsWithoutDefault(sql);
  assert.ok(required.includes("runtime_fingerprint"));
  assert.ok(required.includes("filter_model"));

  const recorder = [];
  recorder.requiredColumns = required;
  const db = pgLikeDb(recorder);
  const repository = createShadowRepository(db);
  const config = shadowConfig({ AI_V2_SHADOW_MODE: "true" });

  const claimed = await repository.claim("m1", "lead1", null, RUNTIME_FINGERPRINT, config.filterModel);
  assert.equal(claimed.created, true, "claim() must succeed against the real NOT NULL contract, not throw a 23502 violation");
  for (const column of required) {
    assert.notEqual(claimed.run[column], undefined, `expected claim() insert to populate required column "${column}"`);
    assert.notEqual(claimed.run[column], null, `expected claim() insert to populate required column "${column}"`);
  }
});

// --- Family B: migration ordering must sort after every migration already on main ---
// Applying a migration whose timestamp sorts BEFORE the latest one already applied to
// the real database is a real Supabase footgun: tooling assumes migration filenames are
// monotonically increasing. The historical branch's tip left this file dated
// 20260905120000, before main's own 20260905173149 rename migration.
test("Family B (red->green): ai_v2_shadow_runs migration sorts after every existing main migration", async () => {
  const migrationsDir = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
  const files = (await readdir(migrationsDir)).filter(name => name.endsWith(".sql")).sort();
  const shadowFile = files.find(name => name.includes("ai_v2_shadow_runs"));
  assert.ok(shadowFile, "expected the ai_v2_shadow_runs migration to be present");
  const others = files.filter(name => name !== shadowFile);
  const shadowTimestamp = shadowFile.split("_")[0];
  const laterOrEqual = others.filter(name => name.split("_")[0] >= shadowTimestamp);
  assert.deepEqual(laterOrEqual, [], `ai_v2_shadow_runs migration must sort after all pre-existing migrations, but sorts before: ${laterOrEqual.join(", ")}`);
});

// --- Family C: no sender/PII/token capability anywhere under ai-v2-shadow, not just pipeline.mjs ---
// The historical guard (ai-v2-shadow.test.mjs #29) only scanned pipeline.mjs. Widen the
// scan to the whole directory so a future file cannot silently reintroduce the sender or
// a Meta token without failing a test.
test("Family C: no file under ai-v2-shadow/ references WhatsApp sender or Meta token capability", async () => {
  const dir = fileURLToPath(new URL("../../../supabase/functions/_shared/ai-v2-shadow/", import.meta.url));
  const names = (await readdir(dir)).filter(name => name.endsWith(".mjs"));
  assert.ok(names.length > 0);
  for (const name of names) {
    const text = await readFile(dir + name, "utf8");
    assert.doesNotMatch(text, /sendWhatsAppText|META_ACCESS_TOKEN|customer_phone|customerPhone|whatsapp_message_id/i, `${name} must not reference sender/token/phone fields`);
  }
});

// --- Family D: shadow stays fail-closed and DB-inert unless explicitly enabled ---
// Confirms the flag check happens before any database access, so leaving
// AI_V2_SHADOW_MODE unset in production (today's actual state) never touches the DB.
test("Family D: disabled shadow performs zero database calls", async () => {
  const recorder = [];
  const db = pgLikeDb(recorder);
  const out = await runWhatsappV2Shadow({
    db,
    env: {},
    lead: { id: "lead1" },
    inboundMessage: { id: "m1", body: "hola", created_at: "2026-01-01T00:00:00Z" },
    conversationControl: null,
  });
  assert.equal(out.status, "disabled");
  assert.deepEqual(recorder, []);
});
