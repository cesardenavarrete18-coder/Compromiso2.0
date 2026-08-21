import assert from "node:assert/strict";
import test from "node:test";
import { candidateAdvisorName, candidateCodes, knownAdvisorName, mentionsTikTok, normalizedPersonName } from "./routing-identifiers.ts";

test("detects a TikTok origin with either spelling", () => {
  assert.equal(mentionsTikTok("Hola, vengo del TikTok"), true);
  assert.equal(mentionsTikTok("Vengo de Tik tok"), true);
  assert.equal(mentionsTikTok("Consulta desde la web"), false);
});

test("keeps detecting explicit seller codes", () => {
  assert.deepEqual(candidateCodes("Código gs-01cdn"), ["GS-01CDN"]);
});

test("detects the labeled advisor format", () => {
  assert.equal(candidateAdvisorName("Asesor: Malena Rojas"), "Malena Rojas");
});

test("matches an active advisor written as a plain full name", () => {
  assert.equal(
    knownAdvisorName("malena rojas", ["Juan Castro", "Malena Rojas"]),
    "Malena Rojas",
  );
});

test("does not guess when more than one advisor name matches", () => {
  assert.equal(
    knownAdvisorName("Hablé con Juan Castro y Malena Rojas", ["Juan Castro", "Malena Rojas"]),
    "",
  );
});

test("normalizes accents and punctuation in names", () => {
  assert.equal(normalizedPersonName("Joaquín Vera"), "joaquin vera");
});
