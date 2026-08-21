import assert from "node:assert/strict";
import test from "node:test";
import { reminderText } from "./reminder-copy.ts";

test("mentions the known model without using a customer name", () => {
  const text = reminderText("Peugeot 208");
  assert.match(text, /Peugeot 208/);
  assert.doesNotMatch(text, /Ricardo/i);
});

test("uses a useful generic fallback when the model is unknown", () => {
  assert.match(reminderText(""), /consulta del 0 km/);
});
