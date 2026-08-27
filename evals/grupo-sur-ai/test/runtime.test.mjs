import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../src/golden-compiler.mjs";
import { adaptToProductionState } from "../src/production-state-adapter.mjs";
import { applyDeterministicPostprocessors, buildExactDeveloperPrompt, deriveTikTokRouting, runCurrentRuntimeCase, selectTrainingExamples, verifySnapshotSource } from "../src/runtime-replica.mjs";

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

test("registra scores y no utiliza ejemplos con score cero", () => {
  const examples = Array.from({ length: 6 }, (_, index) => ({ id: String(index), conversation: `texto modelo${index}` }));
  const selected = selectTrainingExamples(examples, "sin coincidencias semánticas", "");
  assert.equal(selected.length, 0);
  const matched = selectTrainingExamples(examples, "consulta texto modelo3", "");
  assert.equal(matched.length, 4);
  assert.ok(matched.every((item) => item.score > 0));
  assert.equal(matched[0].example.id, "3");
});

test("GSV1-001 entrega Peugeot 208 al runtime antes de Financiar y reproduce la regresión", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  const evalCase = dataset.cases.find((item) => item.eval_id === "GSV1-001");
  const productionState = adaptToProductionState(evalCase);
  assert.equal(productionState.existing_model_interest, "Peugeot 208");
  assert.equal(productionState.advertised_interest, "Peugeot 208");
  assert.match(productionState.text, /Financiar/);
  const observed = applyDeterministicPostprocessors({
    qualification_status: "follow_up", priority: "normal", intent_summary: "Financiación elegida",
    model_interest: "Peugeot 208", disqualify_reason: "",
    reply_text: "Perfecto, elegiste financiación. ¿Con cuánto efectivo contás para el anticipo?",
  }, productionState);
  assert.equal(observed.qualification_status, "qualified");
  assert.match(observed.reply_text, /asesor|gesti[oó]n/i);
});

test("takeover, DNC y calificación previa omiten Responses", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  const snapshot = JSON.parse(await readFile(new URL("../snapshot/runtime_snapshot.json", import.meta.url)));
  const routingSnapshot = JSON.parse(await readFile(new URL("../snapshot/routing_snapshot.json", import.meta.url)));
  let calls = 0;
  const transport = async () => { calls += 1; throw new Error("transport must not run"); };
  for (const id of ["GSV1-074", "GSV1-079", "GSV1-083", "GSV1-085", "GSV1-099"]) {
    const output = await runCurrentRuntimeCase({ evalCase: dataset.cases.find((item) => item.eval_id === id), snapshot, routingSnapshot, model: "offline", transport });
    assert.equal(output._shadow.responses_called, 0);
  }
  assert.equal(calls, 0);
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
