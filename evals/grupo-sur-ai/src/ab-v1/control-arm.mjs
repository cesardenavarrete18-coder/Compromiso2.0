import { runCurrentRuntimeCase } from "../runtime-replica.mjs";

export function executeControlCase({ evalCase, snapshot, routingSnapshot, model, transport }) {
  return runCurrentRuntimeCase({ evalCase, snapshot, routingSnapshot, model, transport });
}
