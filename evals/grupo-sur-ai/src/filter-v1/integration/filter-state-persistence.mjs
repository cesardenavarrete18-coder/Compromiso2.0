import { createFilterState } from "../contracts.mjs";

export const FILTER_STATE_SCHEMA_VERSION = "filter-state/1.0";

export function serializeFilterState(state, { stateVersion = 0, updatedAt = new Date().toISOString() } = {}) {
  if (!Number.isInteger(stateVersion) || stateVersion < 0) throw new TypeError("INVALID_STATE_VERSION");
  return Object.freeze({ schema_version: FILTER_STATE_SCHEMA_VERSION, state_version: stateVersion, updated_at: updatedAt, state: structuredClone(state) });
}

export function deserializeFilterState(metadata = {}) {
  const snapshot = metadata?.filter_v1;
  if (!snapshot) return Object.freeze({ state: createFilterState(), state_version: 0, status: "absent" });
  if (snapshot.schema_version !== FILTER_STATE_SCHEMA_VERSION) return Object.freeze({ state: null, state_version: null, status: "upgrade_required", source_schema_version: snapshot.schema_version ?? null });
  if (!Number.isInteger(snapshot.state_version) || snapshot.state_version < 0 || !snapshot.state) throw new TypeError("INVALID_FILTER_STATE_SNAPSHOT");
  return Object.freeze({ state: structuredClone(snapshot.state), state_version: snapshot.state_version, updated_at: snapshot.updated_at ?? null, status: "loaded" });
}

export function advanceStateVersion({ currentStateVersion, expectedStateVersion }) {
  if (!Number.isInteger(currentStateVersion) || !Number.isInteger(expectedStateVersion)) throw new TypeError("INVALID_STATE_VERSION");
  if (currentStateVersion !== expectedStateVersion) return Object.freeze({ status: "state_conflict", current_state_version: currentStateVersion, expected_state_version: expectedStateVersion, next_state_version: null });
  return Object.freeze({ status: "ok", current_state_version: currentStateVersion, expected_state_version: expectedStateVersion, next_state_version: currentStateVersion + 1 });
}
