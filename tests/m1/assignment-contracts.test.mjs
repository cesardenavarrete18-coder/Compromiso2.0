import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CommandContractError } from '../../supabase/functions/_shared/crm-runtime/contracts.mjs';
import {
  ASSIGNMENT_COMMAND_TYPES, normalizeAssignmentCommandEnvelope,
  canonicalAssignmentCommandIntent, hashAssignmentCommandIntent,
} from '../../supabase/functions/_shared/crm-runtime/assignment-contracts.mjs';

// Transport tests only. PostgreSQL must establish authorization, gates, receipts,
// preservation, old-owner fencing, target activity and actual race outcomes.
const ID = {
  command: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  lead: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  from: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  to: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  actor: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  other: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};
const ACTOR = `user:${ID.actor}`;
function envelope(command_type = 'AssignLead') {
  const payload = command_type === 'AssignLead' ? { seller_user_id: ID.to, reason: 'Cartera asignada' }
    : command_type === 'TransferLead' ? { from_seller_user_id: ID.from, to_seller_user_id: ID.to, reason: 'Cambio de responsable' } : {};
  return { schema_version: 1, command_id: ID.command, command_type,
    idempotency_key: 'assignment.1', scope: { lead_id: ID.lead },
    expected_versions: { lead_aggregate_version: 3, assignment_epoch: 2,
      gates: [{ domain: 'command_owner', scope_key: `lead:${ID.lead}`, writer_epoch: 1,
        revision: 2, contract_version: 'assignment.v1', policy_version: 'assignment.policy.1' }] },
    payload, policy_version_seen: 'assignment.policy.1' };
}
function rejects(input, code) {
  assert.throws(() => normalizeAssignmentCommandEnvelope(input), (error) => {
    assert.ok(error instanceof CommandContractError);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

test('assignment contract admits exactly three immutable command types and their payloads', () => {
  assert.deepEqual(ASSIGNMENT_COMMAND_TYPES, ['AssignLead', 'TransferLead', 'AcknowledgeLeadAssignment']);
  assert.ok(Object.isFrozen(ASSIGNMENT_COMMAND_TYPES));
  for (const type of ASSIGNMENT_COMMAND_TYPES) {
    const input = envelope(type);
    const result = normalizeAssignmentCommandEnvelope(input);
    assert.equal(result.command_type, type);
    assert.deepEqual(result.payload, input.payload);
    assert.equal(result.causation, null);
    assert.equal(result.correlation_id, ID.command);
  }
});

test('unknown commands cannot select a business handler or channel capability', () => {
  for (const type of ['FoundationProbe', 'AcceptCommercialHandoff', 'SetChannelAuthority',
    'SendMessage', 'AssignLead ', 'assignlead', '', null]) {
    rejects({ ...envelope(), command_type: type }, 'UNSUPPORTED_COMMAND');
  }
});

test('required envelope metadata has no inferred or latest-state defaults', () => {
  for (const key of ['schema_version', 'command_id', 'command_type', 'idempotency_key',
    'scope', 'expected_versions', 'payload', 'policy_version_seen']) {
    const input = envelope();
    delete input[key];
    rejects(input, 'COMMAND_METADATA_REQUIRED');
  }
  for (const value of [0, 2, '1', null]) rejects({ ...envelope(), schema_version: value }, 'INVALID_ENVELOPE');
});

test('actor, adoption, desired epochs, result and authority cannot enter the envelope', () => {
  for (const field of ['actor', 'actor_subject', 'actor_user_id', 'assigned_by_user_id', 'role',
    'adopted', 'assignment_epoch', 'authority_epoch', 'channel_authority', 'request_hash', 'result']) {
    rejects({ ...envelope(), [field]: 'forged' }, 'INVALID_ENVELOPE');
  }
});

test('each payload is closed and rejects actor, epoch, adoption and cross-command fields', () => {
  for (const type of ASSIGNMENT_COMMAND_TYPES) {
    for (const field of ['actor_user_id', 'assigned_by_user_id', 'assignment_epoch', 'authority_epoch',
      'adopted', 'assignment_received_at', 'channel_authority', 'restart_protocol', 'handoff_id']) {
      const input = envelope(type);
      input.payload[field] = 'forged';
      rejects(input, 'INVALID_PAYLOAD');
    }
  }
  const assign = envelope(); assign.payload.to_seller_user_id = ID.to;
  rejects(assign, 'INVALID_PAYLOAD');
  const transfer = envelope('TransferLead'); transfer.payload.seller_user_id = ID.to;
  rejects(transfer, 'INVALID_PAYLOAD');
  const ack = envelope('AcknowledgeLeadAssignment'); ack.payload.reason = 'Recibida';
  rejects(ack, 'INVALID_PAYLOAD');
});

test('payload requires every field with typed seller UUIDs and an object for acknowledgement', () => {
  for (const type of ['AssignLead', 'TransferLead']) {
    for (const key of Object.keys(envelope(type).payload)) {
      const input = envelope(type); delete input.payload[key];
      rejects(input, 'INVALID_PAYLOAD');
    }
    for (const key of Object.keys(envelope(type).payload).filter((key) => key !== 'reason')) {
      for (const value of [null, '*', ID.to + '\n', ID.to + ' ', 7]) {
        const input = envelope(type); input.payload[key] = value;
        rejects(input, 'INVALID_PAYLOAD');
      }
    }
  }
  for (const payload of [null, [], '', 0]) rejects({ ...envelope('AcknowledgeLeadAssignment'), payload }, 'INVALID_PAYLOAD');
});

test('scope is exactly one lead and all normalized UUIDs are lowercase', () => {
  for (const scope of [null, [], {}, { lead_id: '*' }, { lead_id: ID.lead, owner: ID.to }, { conversation_id: ID.other }]) {
    rejects({ ...envelope(), scope }, 'INVALID_SCOPE');
  }
  const input = envelope('TransferLead');
  input.command_id = ID.command.toUpperCase(); input.scope.lead_id = ID.lead.toUpperCase();
  input.payload.from_seller_user_id = ID.from.toUpperCase(); input.payload.to_seller_user_id = ID.to.toUpperCase();
  input.expected_versions.gates[0].scope_key = `lead:${ID.lead.toUpperCase()}`;
  input.causation = { event_id: ID.other.toUpperCase() }; input.correlation_id = ID.from.toUpperCase();
  const result = normalizeAssignmentCommandEnvelope(input);
  assert.equal(result.command_id, ID.command); assert.equal(result.scope.lead_id, ID.lead);
  assert.equal(result.payload.from_seller_user_id, ID.from); assert.equal(result.payload.to_seller_user_id, ID.to);
  assert.equal(result.expected_versions.gates[0].scope_key, `lead:${ID.lead}`);
  assert.deepEqual(result.causation, { event_id: ID.other }); assert.equal(result.correlation_id, ID.from);
});

test('exactly one lead-specific owner gate is required, with no global or foreign scope fallback', () => {
  const mutations = [
    (x) => { x.expected_versions.gates = []; },
    (x) => { x.expected_versions.gates.push(structuredClone(x.expected_versions.gates[0])); },
    (x) => { x.expected_versions.gates[0].domain = 'command_crm'; },
    (x) => { x.expected_versions.gates[0].domain = 'sender.customer_ai_dialogue'; },
    (x) => { x.expected_versions.gates[0].scope_key = 'global'; },
    (x) => { x.expected_versions.gates[0].scope_key = `lead:${ID.other}`; },
    (x) => { x.expected_versions.gates[0].scope_key = `LEAD:${ID.lead}`; },
    (x) => { x.expected_versions.gates[0].scope_key = `lead:${ID.lead}\n`; },
    (x) => { x.expected_versions.gates[0].mode = 'authoritative'; },
    (x) => { x.expected_versions.gates[0].contract_version = 'assignment.v2'; },
    (x) => { x.expected_versions.gates[0].contract_version = 'foundation.1'; },
  ];
  for (const mutate of mutations) { const input = envelope(); mutate(input); rejects(input, 'INVALID_VERSIONS'); }
  for (const key of Object.keys(envelope().expected_versions.gates[0])) {
    const input = envelope(); delete input.expected_versions.gates[0][key]; rejects(input, 'INVALID_VERSIONS');
  }
});

test('expected version shape and every counter reject coercion and unsafe integers', () => {
  for (const key of ['lead_aggregate_version', 'assignment_epoch', 'gates']) {
    const input = envelope(); delete input.expected_versions[key]; rejects(input, 'INVALID_VERSIONS');
  }
  const extra = envelope(); extra.expected_versions.authority_epoch = 1; rejects(extra, 'INVALID_VERSIONS');
  for (const field of ['lead_aggregate_version', 'assignment_epoch', 'writer_epoch', 'revision']) {
    for (const value of [-1, 0.5, '1', true, null, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
      const input = envelope();
      const target = ['writer_epoch', 'revision'].includes(field) ? input.expected_versions.gates[0] : input.expected_versions;
      target[field] = value; rejects(input);
    }
    const input = envelope();
    const target = ['writer_epoch', 'revision'].includes(field) ? input.expected_versions.gates[0] : input.expected_versions;
    target[field] = Number.MAX_SAFE_INTEGER;
    assert.doesNotThrow(() => normalizeAssignmentCommandEnvelope(input));
    target[field] = -0;
    const normalized = normalizeAssignmentCommandEnvelope(input).expected_versions;
    assert.equal(Object.is((['writer_epoch', 'revision'].includes(field) ? normalized.gates[0] : normalized)[field], -0), false);
  }
});

test('labels are bounded ASCII codes and cannot carry final newlines or paths', () => {
  for (const bad of ['', ' ', 'á', '../policy', 'p\n', 'p\r', 'x'.repeat(129)]) {
    for (const field of ['idempotency_key', 'policy_version_seen']) rejects({ ...envelope(), [field]: bad }, 'INVALID_ENVELOPE');
    for (const field of ['contract_version', 'policy_version']) {
      const input = envelope(); input.expected_versions.gates[0][field] = bad; rejects(input, 'INVALID_VERSIONS');
    }
  }
  assert.doesNotThrow(() => normalizeAssignmentCommandEnvelope({ ...envelope(), idempotency_key: 'x'.repeat(128) }));
});

test('reason uses Unicode code points, preserves exact text and allows the 1000 boundary', () => {
  for (const text of ['ñ', '🚙'.repeat(1000), 'e\u0301'.repeat(500), '\tMotivo\n', '\u00a0Motivo\u00a0', 'Motivo  interno']) {
    const input = envelope(); input.payload.reason = text;
    assert.equal(normalizeAssignmentCommandEnvelope(input).payload.reason, text);
  }
  for (const text of ['', ' ', ' Motivo', 'Motivo ', '🚙'.repeat(1001), 'e\u0301'.repeat(501), null, 5]) {
    const input = envelope('TransferLead'); input.payload.reason = text;
    rejects(input, 'INVALID_PAYLOAD');
  }
});

test('malformed Unicode, NUL and non-JSON graph values fail before field normalization', () => {
  for (const value of ['\u0000', '\ud800', '\udfff', undefined, 1n, new Date(0), new Map(), () => 1]) {
    const input = envelope(); input.payload.reason = value;
    rejects(input, 'INVALID_ENVELOPE');
  }
  const cycle = envelope(); cycle.payload.reason = cycle;
  rejects(cycle, 'INVALID_ENVELOPE');
});

test('data-only upfront validation rejects getters, hidden fields, symbols and sparse gate arrays', () => {
  let calls = 0;
  const getter = envelope();
  Object.defineProperty(getter.payload, 'reason', { enumerable: true, get() { calls += 1; return 'Motivo'; } });
  rejects(getter, 'INVALID_ENVELOPE'); assert.equal(calls, 0);
  const hidden = envelope(); Object.defineProperty(hidden, 'actor', { value: ID.actor }); rejects(hidden, 'INVALID_ENVELOPE');
  const symbol = envelope(); symbol[Symbol('actor')] = ID.actor; rejects(symbol, 'INVALID_ENVELOPE');
  rejects(Object.assign(Object.create({ inherited: true }), envelope()), 'INVALID_ENVELOPE');
  const sparse = envelope(); sparse.expected_versions.gates = Array(1); rejects(sparse, 'INVALID_ENVELOPE');
  const gateGetter = envelope();
  Object.defineProperty(gateGetter.expected_versions.gates, '0', { enumerable: true, get() { calls += 1; return {}; } });
  rejects(gateGetter, 'INVALID_ENVELOPE'); assert.equal(calls, 0);
});

test('transport size bound is checked before unexpected payload content can be ignored', () => {
  const input = envelope(); input.payload.unexpected = 'x'.repeat(65537);
  rejects(input, 'INVALID_ENVELOPE');
});

test('normalization is immutable and produces detached nested data', () => {
  const input = envelope('TransferLead'); const before = structuredClone(input);
  const result = normalizeAssignmentCommandEnvelope(input);
  assert.deepEqual(input, before); assert.notEqual(result, input);
  result.payload.reason = 'Otro'; result.expected_versions.gates[0].revision = 999;
  result.scope.lead_id = ID.other;
  assert.deepEqual(input, before);
});

test('causation and correlation stay typed with explicit null causation equivalent to omission', async () => {
  for (const causation of [[], {}, 'event', { event_id: '*' }, { event_id: ID.other, lead_id: ID.lead }]) {
    rejects({ ...envelope(), causation }, 'INVALID_CAUSATION');
  }
  rejects({ ...envelope(), correlation_id: null }, 'INVALID_ENVELOPE');
  rejects({ ...envelope(), correlation_id: ID.other + '\n' }, 'INVALID_ENVELOPE');
  assert.equal(await hashAssignmentCommandIntent(envelope(), ACTOR),
    await hashAssignmentCommandIntent({ ...envelope(), causation: null }, ACTOR));
});

test('UUID case and object key ordering do not change canonical assignment intent', async () => {
  const original = envelope('TransferLead');
  const changed = Object.fromEntries(Object.entries(structuredClone(original)).reverse());
  changed.scope.lead_id = ID.lead.toUpperCase();
  changed.payload = { reason: original.payload.reason, to_seller_user_id: ID.to.toUpperCase(), from_seller_user_id: ID.from.toUpperCase() };
  changed.expected_versions.gates[0].scope_key = `lead:${ID.lead.toUpperCase()}`;
  changed.expected_versions.gates[0] = Object.fromEntries(Object.entries(changed.expected_versions.gates[0]).reverse());
  assert.equal(await hashAssignmentCommandIntent(original, ACTOR),
    await hashAssignmentCommandIntent(changed, `user:${ID.actor.toUpperCase()}`));
});

test('command ID, idempotency key and correlation are transport metadata, not intent', async () => {
  const original = envelope('TransferLead');
  const changed = { ...original, command_id: ID.other, idempotency_key: 'retry.2', correlation_id: ID.from };
  assert.equal(await hashAssignmentCommandIntent(original, ACTOR), await hashAssignmentCommandIntent(changed, ACTOR));
  const intent = JSON.parse(canonicalAssignmentCommandIntent(changed, ACTOR));
  for (const key of ['command_id', 'idempotency_key', 'correlation_id']) assert.equal(Object.hasOwn(intent, key), false);
});

test('same retry key with a different destination is a different intent for database conflict detection', async () => {
  for (const type of ['AssignLead', 'TransferLead']) {
    const original = envelope(type); const changed = structuredClone(original);
    changed.payload[type === 'AssignLead' ? 'seller_user_id' : 'to_seller_user_id'] = ID.other;
    assert.equal(changed.idempotency_key, original.idempotency_key);
    assert.notEqual(await hashAssignmentCommandIntent(original, ACTOR), await hashAssignmentCommandIntent(changed, ACTOR));
  }
});

test('actor binds intent independently and must be a separate identified user subject', async () => {
  assert.notEqual(await hashAssignmentCommandIntent(envelope(), ACTOR),
    await hashAssignmentCommandIntent(envelope(), `user:${ID.other}`));
  for (const actor of [null, ID.actor, 'admin', 'service:worker', 'USER:' + ID.actor, `user:${ID.actor}\n`]) {
    assert.throws(() => canonicalAssignmentCommandIntent(envelope(), actor),
      (error) => error instanceof CommandContractError && error.code === 'INVALID_ENVELOPE');
  }
});

test('every expected counter, policy, causal event, lead and transfer source binds intent', async () => {
  const original = envelope('TransferLead'); const hash = await hashAssignmentCommandIntent(original, ACTOR);
  const mutations = [
    (x) => { x.payload.from_seller_user_id = ID.other; },
    (x) => { x.payload.reason = 'Otro motivo'; },
    (x) => { x.scope.lead_id = ID.other; x.expected_versions.gates[0].scope_key = `lead:${ID.other}`; },
    (x) => { x.expected_versions.lead_aggregate_version += 1; },
    (x) => { x.expected_versions.assignment_epoch += 1; },
    (x) => { x.expected_versions.gates[0].writer_epoch += 1; },
    (x) => { x.expected_versions.gates[0].revision += 1; },
    (x) => { x.expected_versions.gates[0].policy_version = 'assignment.policy.2'; },
    (x) => { x.policy_version_seen = 'assignment.policy.2'; },
    (x) => { x.causation = { event_id: ID.other }; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original); mutate(changed);
    assert.notEqual(await hashAssignmentCommandIntent(changed, ACTOR), hash);
  }
});

test('canon preserves composed versus decomposed reasons as distinct signed intentions', async () => {
  const first = envelope(); first.payload.reason = 'Gestión';
  const second = envelope(); second.payload.reason = 'Gestio\u0301n';
  assert.notEqual(await hashAssignmentCommandIntent(first, ACTOR), await hashAssignmentCommandIntent(second, ACTOR));
});

test('assignment hash agrees with independent SHA-256 and the explicit normalized intent', async () => {
  const input = envelope('AcknowledgeLeadAssignment');
  const canonical = canonicalAssignmentCommandIntent(input, ACTOR);
  assert.deepEqual(JSON.parse(canonical), {
    schema_version: 1, command_type: 'AcknowledgeLeadAssignment', actor_subject: ACTOR,
    scope: input.scope, expected_versions: input.expected_versions, payload: {},
    causation: null, policy_version_seen: input.policy_version_seen,
  });
  assert.equal(await hashAssignmentCommandIntent(input, ACTOR), createHash('sha256').update(canonical, 'utf8').digest('hex'));
});
