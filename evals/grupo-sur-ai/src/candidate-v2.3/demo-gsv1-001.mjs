import assert from "node:assert/strict";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../golden-compiler.mjs";
import { emptyExtraction, knownField } from "./extraction-schema.mjs";
import { evaluateCandidateOffline } from "./candidate-runtime.mjs";

const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../../golden_dataset_ia_comercial_grupo_sur_v1.md"));
const evalCase = dataset.cases.find((item) => item.eval_id === "GSV1-001");
assert.ok(evalCase, "GSV1-001_NOT_FOUND");
assert.equal(evalCase.runtime_input.existing_model_interest, "Peugeot 208");
assert.match(evalCase.runtime_input.inbound_message.text, /Financiar/i);

const extraction = emptyExtraction();
extraction.purchase_modality = knownField("financing", { message_id: "GSV1-001:last", quote: "Financiar" });
extraction.commercial_intent = knownField("exploratory", { message_id: "GSV1-001:last", quote: "Financiar" });

const observed = evaluateCandidateOffline({ runtimeInput: evalCase.runtime_input, extraction });
assert.equal(observed.model_interest, "Peugeot 208");
assert.equal(observed.qualification_status, "follow_up");
assert.equal(observed.commercial_temperature, "warm");
assert.equal(observed.handoff_status, "continue_ai");
assert.equal(observed.commercial_profile_complete, false);
assert.deepEqual(observed.missing_commercial_fields, ["cash_available", "target_installment"]);
assert.equal(observed.next_action, "obtain_cash_available");
assert.equal(observed._shadow.responses_called, 0);

process.stdout.write(`${JSON.stringify({
  eval_id: evalCase.eval_id,
  runtime_input_before_message: {
    existing_model_interest: evalCase.runtime_input.existing_model_interest,
    inbound_message: evalCase.runtime_input.inbound_message.text,
  },
  observed: {
    qualification_status: observed.qualification_status,
    commercial_temperature: observed.commercial_temperature,
    handoff_status: observed.handoff_status,
    commercial_profile_complete: observed.commercial_profile_complete,
    missing_commercial_fields: observed.missing_commercial_fields,
    next_action: observed.next_action,
    responses_called: observed._shadow.responses_called,
  },
}, null, 2)}\n`);
