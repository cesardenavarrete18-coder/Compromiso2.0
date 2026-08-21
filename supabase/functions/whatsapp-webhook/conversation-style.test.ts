import assert from "node:assert/strict";
import test from "node:test";
import { firstName, handoffReply, hasKnownCommercialOperation, polishCommercialReply, qualifyAndHandoffReply, shouldForceHandoff } from "./conversation-style.ts";

test("uses only the first token as the given name", () => {
  assert.equal(firstName("Ricardo Daniel Irigoyen"), "Ricardo");
});

test("keeps the greeting on the first reply", () => {
  assert.equal(
    polishCommercialReply("¡Hola Ricardo! Gracias por tu consulta.", "Ricardo Daniel Irigoyen", true),
    "¡Hola Ricardo! Gracias por tu consulta.",
  );
});

test("removes a repeated full name from later replies", () => {
  assert.equal(
    polishCommercialReply("Ricardo Daniel, perfecto, te paso la información.", "Ricardo Daniel Irigoyen", false),
    "Perfecto, te paso la información.",
  );
});

test("removes a repeated first-name greeting from later replies", () => {
  assert.equal(
    polishCommercialReply("Hola Ricardo, claro que sí.", "Ricardo Daniel Irigoyen", false),
    "Claro que sí.",
  );
});

test("does not delete a name used naturally inside a sentence", () => {
  assert.equal(
    polishCommercialReply("La propuesta queda registrada a nombre de Ricardo.", "Ricardo Daniel Irigoyen", false),
    "La propuesta queda registrada a nombre de Ricardo.",
  );
});

test("handoff copy contains the known model and no new question", () => {
  const reply = handoffReply("Peugeot 208");
  assert.match(reply, /Peugeot 208/);
  assert.doesNotMatch(reply, /\?/);
});

test("forces a commercial handoff on the fifth AI reply", () => {
  assert.equal(shouldForceHandoff(3, "follow_up"), false);
  assert.equal(shouldForceHandoff(4, "follow_up"), true);
  assert.equal(shouldForceHandoff(8, "unqualified"), false);
});

test("recognizes a concrete purchase operation", () => {
  assert.equal(hasKnownCommercialOperation("Cliente: Sería de contado"), true);
  assert.equal(hasKnownCommercialOperation("Cliente: Quiero ver el Peugeot 208"), false);
});

test("removes the next questionnaire step when the lead is ready", () => {
  const reply = qualifyAndHandoffReply(
    "Perfecto, tengo registrada la compra al contado. ¿En qué plazo pensás avanzar?",
    "Peugeot 208",
  );
  assert.doesNotMatch(reply, /plazo/);
  assert.doesNotMatch(reply, /\?/);
  assert.match(reply, /asesor/);
});
