import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import {
  assertProductionCredentialIsolation, createEvalTransport, createVectorReadOnlyTransport,
  sideEffectBlocked,
} from "../src/safety.mjs";

test("bloquea todos los destinos salvo OpenAI Responses y lectura de Vector Store", async () => {
  const transport = createEvalTransport("test-key-never-sent");
  await assert.rejects(() => transport("https://graph.facebook.com/v25.0/messages", { method: "POST" }), /NETWORK_DESTINATION_BLOCKED/);
  await assert.rejects(() => transport("https://cdtvuovsqwwopktdahgj.supabase.co/rest/v1/leads", { method: "POST" }), /NETWORK_DESTINATION_BLOCKED/);
});

test("adaptadores productivos fallan cerrados", () => {
  assert.throws(() => sideEffectBlocked("send_whatsapp"), /SIDE_EFFECT_BLOCKED/);
  assert.throws(() => sideEffectBlocked("create_lead"), /SIDE_EFFECT_BLOCKED/);
  assert.throws(() => sideEffectBlocked("handoff"), /SIDE_EFFECT_BLOCKED/);
});

test("el código ejecutable no importa webhook, Supabase, Meta ni credencial productiva", async () => {
  const directory = new URL("../src/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".mjs"));
  const source = (await Promise.all(files.map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
  assert.doesNotMatch(source, /graph\.facebook\.com/);
  assert.doesNotMatch(source, /\.supabase\.co/);
  assert.doesNotMatch(source, /createClient\s*\(/);
  assert.doesNotMatch(source, /import\s+.*runtime_source\/index\.ts/);
});

test("el transporte de preflight sólo permite GET del Vector Store", async () => {
  const transport = createVectorReadOnlyTransport("test-only", { requests: [] });
  await assert.rejects(
    () => transport("https://api.openai.com/v1/responses", { method: "POST" }),
    /NETWORK_DESTINATION_BLOCKED/,
  );
  await assert.rejects(
    () => transport("https://example.supabase.co/rest/v1/leads", { method: "GET" }),
    /NETWORK_DESTINATION_BLOCKED/,
  );
});

test("el preflight falla si hereda una credencial productiva", () => {
  assert.throws(
    () => assertProductionCredentialIsolation({ OPENAI_API_KEY: "must-not-be-used" }),
    /PRODUCTION_CREDENTIAL_ISOLATION_FAILED/,
  );
  assert.deepEqual(assertProductionCredentialIsolation({ OPENAI_EVAL_API_KEY: "allowed" }), {
    isolated: true,
    forbidden_variables_present: [],
  });
});
