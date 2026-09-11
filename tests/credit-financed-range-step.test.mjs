import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const coreSource = fs.readFileSync(path.join(root, "vendedores", "credit-applicability-core.js"), "utf8");
const sandbox = { globalThis: {}, Intl, Date, Set, Number, Math };
vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox);
const core = sandbox.globalThis.grupoSurCreditApplicability;

test("financed range can reach the exact configured maximum", () => {
  const minimum = 1_000;
  const maximum = 20_000_000;
  const step = core.financedRangeStep(minimum, maximum, 100_000);

  assert.equal(step, 1_000);
  assert.equal((maximum - minimum) % step, 0);
  assert.equal(core.snapFinancedAmount(maximum, minimum, maximum, step), maximum);
});

test("preferred 100k step is preserved whenever both endpoints support it", () => {
  assert.equal(core.financedRangeStep(0, 20_000_000, 100_000), 100_000);
  assert.equal(core.financedRangeStep(500_000, 20_000_000, 100_000), 100_000);
});

test("arbitrary cent bounds still produce a step that reaches both endpoints", () => {
  const minimum = 1_234.56;
  const maximum = 20_000_000.12;
  const step = core.financedRangeStep(minimum, maximum, 100_000);
  const distanceCents = Math.round((maximum - minimum) * 100);
  const stepCents = Math.round(step * 100);

  assert.ok(step > 0);
  assert.equal(distanceCents % stepCents, 0);
  assert.equal(core.snapFinancedAmount(maximum, minimum, maximum, step), maximum);
});

test("seller applies the same compatible step to slider and numeric input", () => {
  const seller = fs.readFileSync(path.join(root, "vendedores", "credit-multi-vehicle-seller.js"), "utf8");
  assert.match(seller, /core\.financedRangeStep\(minimum, maximum, 100000\)/);
  assert.match(seller, /core\.snapFinancedAmount\(current, minimum, maximum, step\)/);
  assert.match(seller, /range\.min = minimum; range\.max = maximum; range\.step = step/);
  assert.match(seller, /financedAmount\.step = step/);
  assert.doesNotMatch(seller, /range\.step = 100000/);
});
