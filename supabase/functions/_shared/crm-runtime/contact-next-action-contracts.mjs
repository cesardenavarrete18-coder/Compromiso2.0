/** Closed M1-04B transport. Only PostgreSQL establishes authority, time and evidence quality. */
import { COMMAND_SCHEMA_VERSION, CommandContractError, canonicalJson } from './contracts.mjs';

export const CONTACT_NEXT_ACTION_COMMAND_TYPES = Object.freeze([
  'RecordContactOutcome', 'RecordContactTaskOmission', 'ScheduleNextAction',
  'RescheduleNextAction', 'CancelNextAction', 'EvaluateContactDeadlines',
]);
export const CONTACT_CHANNELS = Object.freeze(['call', 'whatsapp_personal']);
export const CONTACT_OUTCOMES = Object.freeze([
  'no_answer', 'sent', 'answered', 'invalid', 'no_interest', 'requested_no_contact',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUIRED = ['schema_version', 'command_id', 'command_type', 'idempotency_key',
  'scope', 'expected_versions', 'payload', 'policy_version_seen'];
const GATE_FIELDS = ['domain', 'scope_key', 'writer_epoch', 'revision', 'contract_version', 'policy_version'];
const COUNTERS = ['lead_aggregate_version', 'assignment_epoch', 'contact_revision',
  'next_action_revision', 'protocol_revision'];
const fail = (code = 'INVALID_PAYLOAD') => { throw new CommandContractError(code); };
const keys = (value, allowed, required = allowed, code = 'INVALID_PAYLOAD') => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))
    || required.some((key) => !Object.hasOwn(value, key))) fail(code);
};
const uuid = (value, code = 'INVALID_PAYLOAD') => {
  if (typeof value !== 'string' || value.length !== 36 || !UUID.test(value)) fail(code);
  return value.toLowerCase();
};
const version = (value, code = 'INVALID_VERSIONS') => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return Object.is(value, -0) ? 0 : value;
};
const label = (value, code) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128
    || /[^A-Za-z0-9._:-]/.test(value)) fail(code);
  return value;
};
const note = (value) => {
  if (typeof value !== 'string' || Array.from(value).length > 2000) fail();
  return value;
};
const reason = (value) => {
  if (typeof value !== 'string' || Array.from(value).length < 1 || Array.from(value).length > 1000
    || value.startsWith(' ') || value.endsWith(' ')) fail();
  return value;
};
const channel = (value) => {
  if (!CONTACT_CHANNELS.includes(value)) fail();
  return value;
};
const timestamp = (value) => {
  // An unambiguous UTC instant is required; preserve exact bytes in the signed intent.
  // Future/past/adoption/window decisions are made using the DB clock and durable state.
  if (typeof value !== 'string' || value.length !== 24
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value)
    || value.startsWith('0000')) fail();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail();
  return value;
};
const timezone = (value) => {
  // PostgreSQL additionally verifies pg_timezone_names. Do not infer a zone from local time.
  if (typeof value !== 'string' || value.length > 100
    || !/^(?:UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z][A-Za-z0-9_+-]*)+)$/.test(value)
    || /[\r\n]/.test(value)) fail();
  return value;
};
const actionRef = (value) => {
  keys(value, ['action_id', 'revision']);
  return { action_id: uuid(value.action_id), revision: version(value.revision, 'INVALID_PAYLOAD') };
};
const taskRef = (value) => {
  keys(value, ['task_id', 'sequence_id']);
  return { task_id: uuid(value.task_id), sequence_id: uuid(value.sequence_id) };
};
const newAction = (value) => {
  const fields = ['action_id', 'due_at', 'timezone', 'channel', 'note', 'reason'];
  keys(value, [...fields, 'replaces_action', 'protocol_replacement'], fields);
  const result = { action_id: uuid(value.action_id), due_at: timestamp(value.due_at),
    timezone: timezone(value.timezone), channel: channel(value.channel), note: note(value.note), reason: reason(value.reason) };
  if (Object.hasOwn(value, 'replaces_action')) result.replaces_action = actionRef(value.replaces_action);
  if (Object.hasOwn(value, 'protocol_replacement')) {
    keys(value.protocol_replacement, ['sequence_id', 'disposition']);
    if (value.protocol_replacement.disposition !== 'replace') fail();
    result.protocol_replacement = { sequence_id: uuid(value.protocol_replacement.sequence_id), disposition: 'replace' };
  }
  return result;
};
const fact = (value, recordVariant) => {
  const fields = ['fact_id', 'channel', 'fact_kind', 'outcome', 'occurred_at', 'note'];
  keys(value, [...fields, 'task_ref', 'action_ref', ...(recordVariant ? ['variant', 'replacement_next_action'] : [])],
    [...fields, ...(recordVariant ? ['variant'] : [])]);
  const selectedChannel = channel(value.channel);
  if (!['outbound_attempt', 'inbound_response'].includes(value.fact_kind)
    || !CONTACT_OUTCOMES.includes(value.outcome)) fail();
  if ((value.outcome === 'no_answer' && (selectedChannel !== 'call' || value.fact_kind !== 'outbound_attempt'))
    || (value.outcome === 'sent' && (selectedChannel !== 'whatsapp_personal' || value.fact_kind !== 'outbound_attempt'))
    || (value.outcome === 'invalid' && value.fact_kind !== 'outbound_attempt')) fail();
  const result = { ...(recordVariant ? { variant: 'record' } : {}), fact_id: uuid(value.fact_id),
    channel: selectedChannel, fact_kind: value.fact_kind, outcome: value.outcome,
    occurred_at: timestamp(value.occurred_at), note: note(value.note) };
  if (Object.hasOwn(value, 'task_ref')) result.task_ref = taskRef(value.task_ref);
  if (Object.hasOwn(value, 'action_ref')) result.action_ref = actionRef(value.action_ref);
  if (Object.hasOwn(value, 'replacement_next_action')) result.replacement_next_action = newAction(value.replacement_next_action);
  // DNC never authorizes fresh work, even when the general gate is authoritative.
  if (result.outcome === 'requested_no_contact' && Object.hasOwn(result, 'replacement_next_action')) fail();
  return result;
};

function normalizePayload(type, value) {
  if (type === 'RecordContactOutcome') {
    if (value?.variant === 'record') return fact(value, true);
    if (value?.variant !== 'review') fail();
    const fields = ['variant', 'fact_id', 'expected_review_revision', 'decision', 'reason'];
    keys(value, [...fields, 'replacement_fact'], fields);
    if (!['confirm_credit', 'deny_credit', 'amend'].includes(value.decision)) fail();
    const result = { variant: 'review', fact_id: uuid(value.fact_id),
      expected_review_revision: version(value.expected_review_revision, 'INVALID_PAYLOAD'),
      decision: value.decision, reason: reason(value.reason) };
    if (value.decision === 'amend') {
      if (!Object.hasOwn(value, 'replacement_fact')) fail();
      result.replacement_fact = fact(value.replacement_fact, false);
      if (result.replacement_fact.fact_id === result.fact_id) fail();
    } else if (Object.hasOwn(value, 'replacement_fact')) fail();
    return result;
  }
  if (type === 'RecordContactTaskOmission') {
    keys(value, ['task_id', 'sequence_id', 'reason_code', 'note']);
    if (!['not_performed', 'operational_obstacle'].includes(value.reason_code)) fail();
    return { task_id: uuid(value.task_id), sequence_id: uuid(value.sequence_id),
      reason_code: value.reason_code, note: note(value.note) };
  }
  if (type === 'ScheduleNextAction') return newAction(value);
  if (type === 'RescheduleNextAction') {
    keys(value, ['action_id', 'expected_action_revision', 'due_at', 'timezone', 'note', 'reason']);
    return { action_id: uuid(value.action_id), expected_action_revision: version(value.expected_action_revision, 'INVALID_PAYLOAD'),
      due_at: timestamp(value.due_at), timezone: timezone(value.timezone), note: note(value.note), reason: reason(value.reason) };
  }
  if (type === 'CancelNextAction') {
    const fields = ['action_id', 'expected_action_revision', 'reason'];
    keys(value, [...fields, 'replacement_next_action'], fields);
    const result = { action_id: uuid(value.action_id), expected_action_revision: version(value.expected_action_revision, 'INVALID_PAYLOAD'), reason: reason(value.reason) };
    if (Object.hasOwn(value, 'replacement_next_action')) result.replacement_next_action = newAction(value.replacement_next_action);
    return result;
  }
  keys(value, []);
  return {};
}

export function normalizeContactNextActionCommandEnvelope(input) {
  // Validate data-only JSON before reading any caller-provided field/getter.
  if (new TextEncoder().encode(canonicalJson(input)).length > 65536) fail('INVALID_ENVELOPE');
  keys(input, [...REQUIRED, 'causation', 'correlation_id'], [], 'INVALID_ENVELOPE');
  if (REQUIRED.some((key) => !Object.hasOwn(input, key))) fail('COMMAND_METADATA_REQUIRED');
  if (input.schema_version !== COMMAND_SCHEMA_VERSION) fail('INVALID_ENVELOPE');
  if (!CONTACT_NEXT_ACTION_COMMAND_TYPES.includes(input.command_type)) fail('UNSUPPORTED_COMMAND');
  const command_id = uuid(input.command_id, 'INVALID_ENVELOPE');
  const idempotency_key = label(input.idempotency_key, 'INVALID_ENVELOPE');
  const policy_version_seen = label(input.policy_version_seen, 'INVALID_ENVELOPE');
  keys(input.scope, ['lead_id'], ['lead_id'], 'INVALID_SCOPE');
  const lead_id = uuid(input.scope.lead_id, 'INVALID_SCOPE');
  const versions = input.expected_versions;
  keys(versions, [...COUNTERS, 'gates'], [...COUNTERS, 'gates'], 'INVALID_VERSIONS');
  const expected_versions = Object.fromEntries(COUNTERS.map((key) => [key, version(versions[key])]));
  if (!Array.isArray(versions.gates) || versions.gates.length !== 1) fail('INVALID_VERSIONS');
  const gate = versions.gates[0];
  keys(gate, GATE_FIELDS, GATE_FIELDS, 'INVALID_VERSIONS');
  if (gate.domain !== 'command_contact_next_action' || gate.contract_version !== 'contact_next_action.v1'
    || typeof gate.scope_key !== 'string' || !gate.scope_key.startsWith('lead:')) fail('INVALID_VERSIONS');
  const scope_key = `lead:${uuid(gate.scope_key.slice(5), 'INVALID_VERSIONS')}`;
  if (scope_key !== `lead:${lead_id}`) fail('INVALID_VERSIONS');
  expected_versions.gates = [{ domain: gate.domain, scope_key,
    writer_epoch: version(gate.writer_epoch), revision: version(gate.revision),
    contract_version: gate.contract_version, policy_version: label(gate.policy_version, 'INVALID_VERSIONS') }];
  const payload = normalizePayload(input.command_type, input.payload);
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

export function canonicalContactNextActionCommandIntent(envelope, actorSubject) {
  const value = normalizeContactNextActionCommandEnvelope(envelope);
  if (typeof actorSubject !== 'string' || !actorSubject.startsWith('user:')) fail('INVALID_ENVELOPE');
  const actor_subject = `user:${uuid(actorSubject.slice(5), 'INVALID_ENVELOPE')}`;
  return canonicalJson({ schema_version: value.schema_version, command_type: value.command_type,
    scope: value.scope, actor_subject, expected_versions: value.expected_versions, payload: value.payload,
    causation: value.causation, policy_version_seen: value.policy_version_seen });
}

/** Diagnostic parity only; a caller-supplied subject/hash grants no database capability. */
export async function hashContactNextActionCommandIntent(envelope, actorSubject) {
  const bytes = new TextEncoder().encode(canonicalContactNextActionCommandIntent(envelope, actorSubject));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
