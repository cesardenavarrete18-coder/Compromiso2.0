import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../vendedores/supervisor/followup-model.js", import.meta.url), "utf8");
const context = { Intl, Date, globalThis: null };
context.globalThis = context;
runInNewContext(source, context);
const model = context.grupoSurFollowUpModel;

function lead() {
  return {
    id: "lead-1",
    assigned_seller_user_id: "seller-1",
    crm: {
      status: "no_contesta",
      priority: "normal"
    }
  };
}

function summary(overrides = {}) {
  return {
    management_count: 1,
    next_task_id: "task-3",
    next_task_channel: "call",
    next_task_call_attempt: 3,
    next_task_due_start: "2026-09-14T10:00:00-03:00",
    next_task_due_end: "2026-09-14T12:00:00-03:00",
    ...overrides
  };
}

test("protocol task stays HOY while its commercial window is still open", () => {
  const derived = model.deriveFollowUpStatus(lead(), summary(), "2026-09-14T11:08:00-03:00");
  assert.equal(derived.key, "today");
  assert.equal(derived.label, "HOY");
  assert.equal(derived.overdueAt, "2026-09-14T12:00:00-03:00");
});

test("protocol task becomes VENCIDA only after due_end", () => {
  const derived = model.deriveFollowUpStatus(lead(), summary(), "2026-09-14T12:01:00-03:00");
  assert.equal(derived.key, "overdue");
  assert.equal(derived.label, "VENCIDA");
});

test("legacy summaries without due_end use the known two-hour protocol window", () => {
  const beforeEnd = model.deriveFollowUpStatus(lead(), summary({ next_task_due_end: undefined }), "2026-09-14T11:59:00-03:00");
  const afterEnd = model.deriveFollowUpStatus(lead(), summary({ next_task_due_end: undefined }), "2026-09-14T12:01:00-03:00");
  assert.equal(beforeEnd.key, "today");
  assert.equal(afterEnd.key, "overdue");
});
