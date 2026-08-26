import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildExactDeveloperPrompt, deriveTikTokRouting, selectTrainingExamples, verifySnapshotSource } from "../src/runtime-replica.mjs";

test("carga conversation-style.ts con el loader TypeScript aislado", async () => {
  const snapshotModule = await import("../snapshot/runtime_source/conversation-style.ts");
  assert.equal(typeof snapshotModule.polishCommercialReply, "function");
  assert.equal(typeof snapshotModule.qualifyAndHandoffReply, "function");
  assert.equal(typeof snapshotModule.tiktokIdentifierReply, "function");
});

test("el snapshot conserva byte a byte el código desplegado verificado", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../snapshot/runtime_snapshot.json", import.meta.url)));
  await verifySnapshotSource(snapshot);
});

test("reproduce retrieval léxico actual incluso con score cero", () => {
  const examples = Array.from({ length: 6 }, (_, index) => ({ id: String(index), conversation: `texto ${index}` }));
  const selected = selectTrainingExamples(examples, "sin coincidencias semánticas", "");
  assert.equal(selected.length, 4);
});

test("extrae e interpola el developer prompt desplegado sin residuos", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../snapshot/runtime_snapshot.json", import.meta.url)));
  const prompt = await buildExactDeveloperPrompt(snapshot, "EJEMPLOS_CONTROLADOS");
  assert.match(prompt, /^Sos el asistente comercial de Grupo Sur Automotores/);
  assert.match(prompt, /EJEMPLOS_CONTROLADOS/);
  assert.match(prompt, new RegExp(snapshot.assistant_settings.qualification_rules.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(prompt, /\$\{/);
});

test("TikTok ausente queda detectado sin ejecutar routing", async () => {
  const routing = JSON.parse(await readFile(new URL("../snapshot/routing_snapshot.json", import.meta.url)));
  const result = deriveTikTokRouting({ history: [], text: "Vengo de TikTok", source_channel: "tiktok" }, routing);
  assert.equal(result.mentioned, true);
  assert.equal(result.resolution, "absent");
});
