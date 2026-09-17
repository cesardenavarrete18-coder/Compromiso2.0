/** Closed, non-operational M1 foundation contract. PostgreSQL owns authorization/hash. */
export const COMMAND_SCHEMA_VERSION = 1;
export const FOUNDATION_COMMAND_TYPE = 'FoundationProbe';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_BYTES = 65536;

export class CommandContractError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'CommandContractError';
    this.code = code;
  }
}
const fail = (code) => { throw new CommandContractError(code); };
const object = (value, code) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code);
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string'
    || !Object.getOwnPropertyDescriptor(value, key)?.enumerable
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail(code);
  return value;
};
const keys = (value, allowed, required, code) => {
  object(value, code);
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(code);
  if (required.some((key) => !Object.hasOwn(value, key))) fail(code);
};
const uuid = (value, code) => {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code);
  return value.toLowerCase();
};
const label = (value, code) => {
  if (typeof value !== 'string' || !CODE.test(value)) fail(code);
  return value;
};
const integer = (value, code, nonnegative = true) => {
  if (!Number.isSafeInteger(value) || (nonnegative && value < 0)) fail(code);
  return Object.is(value, -0) ? 0 : value;
};

/** Canon for this version's JSON subset: exact safe integers, object keys sorted, array order kept. */
export function canonicalJson(value, depth = 0) {
  if (depth > 32) fail('INVALID_ENVELOPE');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    // PostgreSQL jsonb rejects NUL and unpaired UTF-16 surrogates.
    if (value.includes('\u0000') || !value.isWellFormed()) fail('INVALID_ENVELOPE');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return String(integer(value, 'INVALID_ENVELOPE', false));
  if (Array.isArray(value)) {
    if (value.length > 128 || Reflect.ownKeys(value).length !== value.length + 1) fail('INVALID_ENVELOPE');
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_ENVELOPE');
      items.push(canonicalJson(descriptor.value, depth + 1));
    }
    return `[${items.join(',')}]`;
  }
  object(value, 'INVALID_ENVELOPE');
  return `{${Object.keys(value).sort().map((key) => `${canonicalJson(key, depth + 1)}:${canonicalJson(value[key], depth + 1)}`).join(',')}}`;
}

export function normalizeCommandEnvelope(input) {
  const required = ['schema_version', 'command_id', 'command_type', 'idempotency_key', 'scope', 'expected_versions', 'payload', 'policy_version_seen'];
  keys(input, [...required, 'causation', 'correlation_id'], [], 'INVALID_ENVELOPE');
  if (required.some((key) => !Object.hasOwn(input, key))) fail('COMMAND_METADATA_REQUIRED');
  if (new TextEncoder().encode(canonicalJson(input)).length > MAX_BYTES) fail('INVALID_ENVELOPE');
  if (input.schema_version !== COMMAND_SCHEMA_VERSION) fail('INVALID_ENVELOPE');
  if (input.command_type !== FOUNDATION_COMMAND_TYPE) fail('UNSUPPORTED_COMMAND');
  const command_id = uuid(input.command_id, 'INVALID_ENVELOPE');
  const idempotency_key = label(input.idempotency_key, 'INVALID_ENVELOPE');
  const policy_version_seen = label(input.policy_version_seen, 'INVALID_ENVELOPE');
  keys(input.scope, ['lead_id'], ['lead_id'], 'INVALID_SCOPE');
  const lead_id = uuid(input.scope.lead_id, 'INVALID_SCOPE');
  const versions = input.expected_versions;
  keys(versions, ['lead_aggregate_version', 'assignment_epoch', 'gates'], ['lead_aggregate_version', 'assignment_epoch', 'gates'], 'INVALID_VERSIONS');
  if (!Array.isArray(versions.gates) || versions.gates.length !== 2) fail('INVALID_VERSIONS');
  const gates = versions.gates.map((gate) => {
    const fields = ['domain', 'scope_key', 'writer_epoch', 'revision', 'contract_version', 'policy_version'];
    keys(gate, fields, fields, 'INVALID_VERSIONS');
    if (!['command_crm', 'command_owner'].includes(gate.domain)) fail('INVALID_VERSIONS');
    let scope_key = gate.scope_key;
    if (typeof scope_key !== 'string') fail('INVALID_VERSIONS');
    if (scope_key.startsWith('lead:')) scope_key = `lead:${uuid(scope_key.slice(5), 'INVALID_VERSIONS')}`;
    if (!['global', `lead:${lead_id}`].includes(scope_key)) fail('INVALID_VERSIONS');
    return { domain: gate.domain, scope_key,
      writer_epoch: integer(gate.writer_epoch, 'INVALID_VERSIONS'),
      revision: integer(gate.revision, 'INVALID_VERSIONS'),
      contract_version: label(gate.contract_version, 'INVALID_VERSIONS'),
      policy_version: label(gate.policy_version, 'INVALID_VERSIONS') };
  }).sort((a, b) => a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : a.scope_key.localeCompare(b.scope_key));
  if (gates[0].domain === gates[1].domain) fail('INVALID_VERSIONS');
  keys(input.payload, ['operation_id', 'value'], ['operation_id', 'value'], 'INVALID_PAYLOAD');
  const payload = { operation_id: uuid(input.payload.operation_id, 'INVALID_PAYLOAD'), value: integer(input.payload.value, 'INVALID_PAYLOAD', false) };
  let causation = null;
  if (input.causation !== undefined && input.causation !== null) {
    keys(input.causation, ['event_id'], ['event_id'], 'INVALID_CAUSATION');
    causation = { event_id: uuid(input.causation.event_id, 'INVALID_CAUSATION') };
  }
  return { schema_version: COMMAND_SCHEMA_VERSION, command_id, command_type: FOUNDATION_COMMAND_TYPE,
    idempotency_key, scope: { lead_id },
    expected_versions: { lead_aggregate_version: integer(versions.lead_aggregate_version, 'INVALID_VERSIONS'), assignment_epoch: integer(versions.assignment_epoch, 'INVALID_VERSIONS'), gates },
    payload, causation, correlation_id: input.correlation_id === undefined ? command_id : uuid(input.correlation_id, 'INVALID_ENVELOPE'), policy_version_seen };
}

export function canonicalCommandIntent(envelope, actorSubject) {
  const value = normalizeCommandEnvelope(envelope);
  if (typeof actorSubject !== 'string' || !actorSubject.startsWith('user:')) fail('INVALID_ENVELOPE');
  const actor_subject = `user:${uuid(actorSubject.slice(5), 'INVALID_ENVELOPE')}`;
  return canonicalJson({ schema_version: value.schema_version, command_type: value.command_type,
    scope: value.scope, actor_subject, expected_versions: value.expected_versions,
    payload: value.payload, causation: value.causation, policy_version_seen: value.policy_version_seen });
}

/** Diagnostic parity only. The gateway never accepts a caller-supplied hash. */
export async function hashCommandIntent(envelope, actorSubject) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalCommandIntent(envelope, actorSubject)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
