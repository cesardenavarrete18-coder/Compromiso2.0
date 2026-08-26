import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import {
  assertProductionCredentialIsolation, assertVectorStoreScope, createEvalTransport, createVectorReadOnlyTransport,
  sanitizeDiagnosticText, sideEffectBlocked,
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

test("el preflight alcanza la comprobación del Vector Store congelado sin Responses", async () => {
  const requests = [];
  const vectorStoreId = "vs_6a80740821c081918bc10552428e6249";
  const transport = async (url, options) => {
    requests.push({ url, method: options.method });
    return new Response(JSON.stringify({ id: vectorStoreId, status: "completed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await assertVectorStoreScope(transport, vectorStoreId);
  assert.deepEqual(result, { id: vectorStoreId, status: "completed" });
  assert.deepEqual(requests, [{
    url: `https://api.openai.com/v1/vector_stores/${vectorStoreId}`,
    method: "GET",
  }]);
});

for (const [httpStatus, classification] of [
  [401, "credential_invalid_or_unauthenticated"],
  [403, "permission_or_policy_insufficient"],
  [404, "resource_not_visible_or_not_found"],
  [429, "other_http_error"],
]) {
  test(`el diagnóstico del Vector Store conserva HTTP ${httpStatus} y el error seguro`, async () => {
    const secret = ["sk", "proj", "EXAMPLESECRET123456789"].join("-");
    const transport = async () => new Response(JSON.stringify({
      error: {
        type: "access_error",
        code: `status_${httpStatus}`,
        message: `Request rejected. Authorization: Bearer ${secret}`,
      },
    }), { status: httpStatus, headers: { "Content-Type": "application/json" } });

    await assert.rejects(
      () => assertVectorStoreScope(transport, "vs_6a80740821c081918bc10552428e6249"),
      (error) => {
        assert.equal(error.code, "RAG_RESOURCE_SCOPE_MISMATCH");
        assert.equal(error.diagnostic.http_status, httpStatus);
        assert.equal(error.diagnostic.classification, classification);
        assert.equal(error.diagnostic.error.type, "access_error");
        assert.equal(error.diagnostic.error.code, `status_${httpStatus}`);
        assert.doesNotMatch(JSON.stringify(error.diagnostic), /EXAMPLESECRET|sk-proj-/);
        assert.match(error.diagnostic.error.message_sanitized, /\[REDACTED_AUTHORIZATION\]/);
        return true;
      },
    );
  });
}

test("el diagnóstico no registra bodies no JSON ni secretos", async () => {
  const secret = ["sk", "proj", "NOTFORLOGGING123456"].join("-");
  const transport = async () => new Response(`Authorization: Bearer ${secret}`, { status: 502 });
  await assert.rejects(
    () => assertVectorStoreScope(transport, "vs_6a80740821c081918bc10552428e6249"),
    (error) => {
      assert.deepEqual(error.diagnostic.error, {
        type: null,
        code: null,
        message_sanitized: "OpenAI request failed with HTTP 502",
      });
      assert.doesNotMatch(JSON.stringify(error), /NOTFORLOGGING|Authorization/);
      return true;
    },
  );
});

test("el sanitizador limita longitud y elimina credenciales", () => {
  const secret = ["sk", "proj", "SECRETSECRET123456"].join("-");
  const value = `Incorrect key ${secret} Authorization: Bearer token-value\n${"x".repeat(800)}`;
  const sanitized = sanitizeDiagnosticText(value);
  assert.ok(sanitized.length <= 500);
  assert.doesNotMatch(sanitized, /SECRETSECRET|token-value/);
});
