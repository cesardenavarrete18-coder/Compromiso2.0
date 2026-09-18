/** Closed assignment transport contract. PostgreSQL owns authorization and receipts. */
import { COMMAND_SCHEMA_VERSION, CommandContractError, canonicalJson } from './contracts.mjs';

export const ASSIGNMENT_COMMAND_TYPES = Object.freeze([
  'AssignLead', 'TransferLead', 'AcknowledgeLeadAssignment',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NON_CODE_CHARACTER = /[^A-Za-z0-9._:-]/;
const MAX_BYTES = 65536;
const REQUIRED = ['schema_version', 'command_id', 'command_type', 'idempotency_key',
  'scope', 'expected_versions', 'payload', 'policy_version_seen'];
const GATE_FIELDS = ['domain', 'scope_key', 'writer_epoch', 'revision',
  'contract_version', 'policy_version'];

const fail = (code) => { throw new CommandContractError(code); };
const keys = (value, allowed, required, code) => {
  // canonicalJson has already rejected accessors, hidden/symbol properties,
  // inherited/custom objects and every non-JSON value in the input graph.
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(code);
  if (required.some((key) => !Object.hasOwn(value, key))) fail(code);
};
const uuid = (value, code) => {
  if (typeof value !== 'string' || value.length !== 36 || !UUID.test(value)) fail(code);
  return value.toLowerCase();
};
const label = (value, code) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128
    || NON_CODE_CHARACTER.test(value)) fail(code);
  return value;
};
const version = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_VERSIONS');
  return Object.is(value, -0) ? 0 : value;
};
const reason = (value) => {
  // SQL btrim(text) removes U+0020, not tabs/NBSP. Preserve the exact reason;
  // never silently trim or Unicode-normalize text that participates in a hash.
  if (typeof value !== 'string' || value.startsWith(' ') || value.endsWith(' ')) fail('INVALID_PAYLOAD');
  const length = Array.from(value).length;
  if (length < 1 || length > 1000) fail('INVALID_PAYLOAD');
  return value;
};

export function normalizeAssignmentCommandEnvelope(input) {
  // Validate the complete data graph before reading fields or invoking a getter.
  const canonical = canonicalJson(input);
  if (new TextEncoder().encode(canonical).length > MAX_BYTES) fail('INVALID_ENVELOPE');
  keys(input, [...REQUIRED, 'causation', 'correlation_id'], [], 'INVALID_ENVELOPE');
  if (REQUIRED.some((key) => !Object.hasOwn(input, key))) fail('COMMAND_METADATA_REQUIRED');
  if (input.schema_version !== COMMAND_SCHEMA_VERSION) fail('INVALID_ENVELOPE');
  if (!ASSIGNMENT_COMMAND_TYPES.includes(input.command_type)) fail('UNSUPPORTED_COMMAND');
  const command_id = uuid(input.command_id, 'INVALID_ENVELOPE');
  const idempotency_key = label(input.idempotency_key, 'INVALID_ENVELOPE');
  const policy_version_seen = label(input.policy_version_seen, 'INVALID_ENVELOPE');

  keys(input.scope, ['lead_id'], ['lead_id'], 'INVALID_SCOPE');
  const lead_id = uuid(input.scope.lead_id, 'INVALID_SCOPE');
  const versions = input.expected_versions;
  const versionFields = ['lead_aggregate_version', 'assignment_epoch', 'gates'];
  keys(versions, versionFields, versionFields, 'INVALID_VERSIONS');
  if (!Array.isArray(versions.gates) || versions.gates.length !== 1) fail('INVALID_VERSIONS');
  const gate = versions.gates[0];
  keys(gate, GATE_FIELDS, GATE_FIELDS, 'INVALID_VERSIONS');
  if (gate.domain !== 'command_owner' || typeof gate.scope_key !== 'string'
    || !gate.scope_key.startsWith('lead:')) fail('INVALID_VERSIONS');
  if (gate.contract_version !== 'assignment.v1') fail('INVALID_VERSIONS');
  const scope_key = `lead:${uuid(gate.scope_key.slice(5), 'INVALID_VERSIONS')}`;
  if (scope_key !== `lead:${lead_id}`) fail('INVALID_VERSIONS');
  const expected_versions = {
    lead_aggregate_version: version(versions.lead_aggregate_version),
    assignment_epoch: version(versions.assignment_epoch),
    gates: [{ domain: 'command_owner', scope_key,
      writer_epoch: version(gate.writer_epoch), revision: version(gate.revision),
      contract_version: label(gate.contract_version, 'INVALID_VERSIONS'),
      policy_version: label(gate.policy_version, 'INVALID_VERSIONS') }],
  };

  let payload;
  if (input.command_type === 'AssignLead') {
    const fields = ['seller_user_id', 'reason'];
    keys(input.payload, fields, fields, 'INVALID_PAYLOAD');
    payload = { seller_user_id: uuid(input.payload.seller_user_id, 'INVALID_PAYLOAD'),
      reason: reason(input.payload.reason) };
  } else if (input.command_type === 'TransferLead') {
    const fields = ['from_seller_user_id', 'to_seller_user_id', 'reason'];
    keys(input.payload, fields, fields, 'INVALID_PAYLOAD');
    payload = { from_seller_user_id: uuid(input.payload.from_seller_user_id, 'INVALID_PAYLOAD'),
      to_seller_user_id: uuid(input.payload.to_seller_user_id, 'INVALID_PAYLOAD'),
      reason: reason(input.payload.reason) };
  } else {
    keys(input.payload, [], [], 'INVALID_PAYLOAD');
    payload = {};
  }

  let causation = null;
  if (input.causation !== undefined && input.causation !== null) {
    keys(input.causation, ['event_id'], ['event_id'], 'INVALID_CAUSATION');
    causation = { event_id: uuid(input.causation.event_id, 'INVALID_CAUSATION') };
  }
  return { schema_version: COMMAND_SCHEMA_VERSION, command_id, command_type: input.command_type,
    idempotency_key, scope: { lead_id }, expected_versions, payload, causation,
    correlation_id: input.correlation_id === undefined ? command_id : uuid(input.correlation_id, 'INVALID_ENVELOPE'),
    policy_version_seen };
}

export function canonicalAssignmentCommandIntent(envelope, actorSubject) {
  const value = normalizeAssignmentCommandEnvelope(envelope);
  if (typeof actorSubject !== 'string' || !actorSubject.startsWith('user:')) fail('INVALID_ENVELOPE');
  const actor_subject = `user:${uuid(actorSubject.slice(5), 'INVALID_ENVELOPE')}`;
  return canonicalJson({ schema_version: value.schema_version, command_type: value.command_type,
    scope: value.scope, actor_subject, expected_versions: value.expected_versions,
    payload: value.payload, causation: value.causation, policy_version_seen: value.policy_version_seen });
}

/** Diagnostic only: never accept a caller-supplied actor/hash as server authority. */
export async function hashAssignmentCommandIntent(envelope, actorSubject) {
  const bytes = new TextEncoder().encode(canonicalAssignmentCommandIntent(envelope, actorSubject));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
