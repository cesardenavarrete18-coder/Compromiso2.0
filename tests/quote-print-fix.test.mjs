import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const printFix = fs.readFileSync(path.join(root, "vendedores", "quote-print-fix.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "vendedores", "supabase-config.js"), "utf8");

test("quote print preflight hydrates missing installment count from the persisted quote", () => {
  assert.match(printFix, /from\("sales_quotes"\)/);
  assert.match(printFix, /select\("term_months"\)/);
  assert.match(printFix, /eq\("quote_code", code\)/);
  assert.match(printFix, /cantidad de cuotas/);
  assert.match(printFix, /value\.textContent = String\(result\.data\.term_months\)/);
});

test("quote print preflight waits for vehicle and logo images before native print", () => {
  assert.match(printFix, /container\.querySelectorAll\("img"\)/);
  assert.match(printFix, /image\.complete && image\.naturalWidth > 0/);
  assert.match(printFix, /image\.addEventListener\("load"/);
  assert.match(printFix, /requestAnimationFrame/);
  assert.match(printFix, /nativePrint\(\)/);
});

test("print fix only intercepts commercial quote sheets and preserves other print flows", () => {
  assert.match(printFix, /querySelector\("\.commercial-quote-sheet"\)/);
  assert.match(printFix, /if \(!container\) return nativePrint\(\)/);
});

test("seller loads print preflight before the multi-model credit adapter", () => {
  const printFixIndex = loader.indexOf("quote-print-fix.js?v=20260911-1");
  const sellerIndex = loader.indexOf("credit-multi-vehicle-seller.js?v=20260911-1");
  assert.ok(printFixIndex >= 0);
  assert.ok(sellerIndex > printFixIndex);
});
