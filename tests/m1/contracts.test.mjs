import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  COMMAND_SCHEMA_VERSION,
  FOUNDATION_COMMAND_TYPE,
  CommandContractError,
  normalizeCommandEnvelope,
  canonicalJson,
  canonicalCommandIntent,
  hashCommandIntent,
} from '../../supabase/functions/_shared/crm-runtime/contracts.mjs';

// These are transport/normalization tests. They do not claim to establish DB
// authorization, atomicity, concurrency, gate resolution, RLS or delivery.
const IDS = {
  command: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  lead: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  operation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  user: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  other: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};
const ACTOR = `user:${IDS.user}`;
const clone = (value) => structuredClone(value);

function envelope() {
  return {
    schema_version: 1,
    command_id: IDS.command,
    command_type: 'FoundationProbe',
    idempotency_key: 'foundation-probe.1',
    scope: { lead_id: IDS.lead },
    expected_versions: {
      lead_aggregate_version: 0,
      assignment_epoch: 0,
      gates: [
        { domain: 'command_owner', scope_key: 'global', writer_epoch: 0, revision: 0,
          contract_version: 'foundation.1', policy_version: 'foundation.policy.1' },
        { domain: 'command_crm', scope_key: `lead:${IDS.lead}`, writer_epoch: 0, revision: 0,
          contract_version: 'foundation.1', policy_version: 'foundation.policy.1' },
      ],
    },
    payload: { operation_id: IDS.operation, value: 17 },
    policy_version_seen: 'foundation.policy.1',
  };
}

function rejects(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof CommandContractError, 'returns a stable contract error');
    if (code) assert.equal(error.code, code);
    else assert.match(error.code, /^INVALID_|^COMMAND_METADATA_REQUIRED$/);
    return true;
  });
}

test('foundation contract is versioned and accepts only the inert probe shape', () => {
  assert.equal(COMMAND_SCHEMA_VERSION, 1);
  assert.equal(FOUNDATION_COMMAND_TYPE, 'FoundationProbe');
  const value = normalizeCommandEnvelope(envelope());
  assert.equal(value.command_type, FOUNDATION_COMMAND_TYPE);
  assert.equal(value.correlation_id, IDS.command);
  assert.equal(value.causation, null);
  assert.deepEqual(value.scope, { lead_id: IDS.lead });
  assert.deepEqual(value.payload, { operation_id: IDS.operation, value: 17 });
});

test('normalization is immutable and orders gate identities, not business payloads', () => {
  const input = envelope();
  const before = clone(input);
  const normalized = normalizeCommandEnvelope(input);
  assert.deepEqual(input, before);
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.expected_versions, input.expected_versions);
  assert.deepEqual(normalized.expected_versions.gates.map((gate) => gate.domain),
    ['command_crm', 'command_owner']);
  normalized.payload.value = 1;
  assert.equal(input.payload.value, 17);
});

test('required metadata cannot be fabricated or defaulted from current state', () => {
  for (const key of ['schema_version', 'command_id', 'command_type', 'idempotency_key',
    'scope', 'expected_versions', 'payload', 'policy_version_seen']) {
    const input = envelope();
    delete input[key];
    rejects(() => normalizeCommandEnvelope(input), 'COMMAND_METADATA_REQUIRED');
  }
});

test('actor, role, result, hash and authority never enter through envelope fields', () => {
  for (const key of ['actor', 'actor_user_id', 'actor_subject', 'role', 'executor_principal',
    'request_hash', 'result', 'status', 'channel_authority', 'trusted', 'function_name']) {
    const input = { ...envelope(), [key]: 'forged' };
    rejects(() => normalizeCommandEnvelope(input), 'INVALID_ENVELOPE');
  }
});

test('closed payload prevents caller-supplied actor, owner, channel and operational handlers', () => {
  for (const key of ['actor_user_id', 'role', 'assigned_seller_user_id', 'authority_epoch',
    'channel_authority', 'command_type', 'function_name', 'sql', 'test_mode']) {
    const input = envelope();
    input.payload[key] = 'forged';
    rejects(() => normalizeCommandEnvelope(input), 'INVALID_PAYLOAD');
  }
});

test('business and future sending commands are not enabled by the foundation contract', () => {
  for (const commandType of ['AssignLead', 'TransferLead', 'AcceptCommercialHandoff',
    'SetChannelAuthority', 'SetDialoguePolicy', 'SendMessage', 'ReactivateRecovery',
    'SendWorkerNotification', 'RecordLegacyInstallmentUpdate']) {
    const input = envelope();
    input.command_type = commandType;
    rejects(() => normalizeCommandEnvelope(input), 'UNSUPPORTED_COMMAND');
  }
});

test('scope requires exactly one identified lead and rejects arbitrary or wildcard scope', () => {
  for (const scope of [null, [], {}, { lead_id: '*' }, { lead_id: 'global' },
    { lead_id: IDS.lead, tenant_id: IDS.other }, { lead_id: IDS.lead, actor: IDS.user },
    { conversation_id: IDS.other }, { lead_id: IDS.lead, seller_user_id: IDS.user }]) {
    const input = envelope();
    input.scope = scope;
    rejects(() => normalizeCommandEnvelope(input), 'INVALID_SCOPE');
  }
});

test('expected revisions are exact safe nonnegative integers with a closed shape', () => {
  for (const key of ['lead_aggregate_version', 'assignment_epoch']) {
    for (const value of [-1, 0.5, '0', null, true, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
      const input = envelope();
      input.expected_versions[key] = value;
      rejects(() => normalizeCommandEnvelope(input));
    }
  }
  const input = envelope();
  input.expected_versions.authority_epoch = 0;
  rejects(() => normalizeCommandEnvelope(input), 'INVALID_VERSIONS');
});

test('safe integer boundary and negative zero have an unambiguous representation', () => {
  const input = envelope();
  input.expected_versions.lead_aggregate_version = Number.MAX_SAFE_INTEGER;
  input.expected_versions.assignment_epoch = -0;
  input.payload.value = -Number.MAX_SAFE_INTEGER;
  const value = normalizeCommandEnvelope(input);
  assert.equal(value.expected_versions.lead_aggregate_version, 9007199254740991);
  assert.equal(Object.is(value.expected_versions.assignment_epoch, -0), false);
  assert.equal(value.payload.value, -9007199254740991);
  assert.equal(canonicalJson(-0), '0');
});

test('missing, duplicated and foreign gate identities cannot satisfy dependencies', () => {
  const variants = [
    (input) => { input.expected_versions.gates.pop(); },
    (input) => { input.expected_versions.gates.push(clone(input.expected_versions.gates[0])); },
    (input) => { input.expected_versions.gates[1] = clone(input.expected_versions.gates[0]); },
    (input) => { input.expected_versions.gates[0].scope_key = `lead:${IDS.other}`; },
    (input) => { input.expected_versions.gates[0].scope_key = 'account:*'; },
    (input) => { input.expected_versions.gates[0].domain = 'sender.customer_ai_recovery'; },
    (input) => { input.expected_versions.gates[0].domain = 'sender.worker_internal_notification'; },
    (input) => { input.expected_versions.gates[0].mode = 'authoritative'; },
  ];
  for (const mutate of variants) {
    const input = envelope();
    mutate(input);
    rejects(() => normalizeCommandEnvelope(input), 'INVALID_VERSIONS');
  }
});

test('gate revision and epoch reject type coercion and negative versions', () => {
  for (const key of ['writer_epoch', 'revision']) {
    for (const value of [-1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
      const input = envelope();
      input.expected_versions.gates[0][key] = value;
      rejects(() => normalizeCommandEnvelope(input));
    }
  }
});

test('labels cannot become arbitrary SQL, paths or unbounded metadata', () => {
  for (const value of ['', ' ', 'drop table leads;', '../scope', 'ñ', 'x'.repeat(129)]) {
    const input = envelope();
    input.idempotency_key = value;
    rejects(() => normalizeCommandEnvelope(input), 'INVALID_ENVELOPE');
    input.idempotency_key = 'valid.1';
    input.expected_versions.gates[0].contract_version = value;
    rejects(() => normalizeCommandEnvelope(input), 'INVALID_VERSIONS');
  }
});

test('causation is a typed event reference, never arbitrary data or another scope override', () => {
  for (const causation of ['event', [], {}, { event_id: 'invalid' },
    { event_id: IDS.other, lead_id: IDS.other }, { event_id: IDS.other, actor: IDS.user }]) {
    const input = envelope();
    input.causation = causation;
    rejects(() => normalizeCommandEnvelope(input), 'INVALID_CAUSATION');
  }
});

test('UUID casing and input key order do not change the logical intent', async () => {
  const original = envelope();
  const changed = Object.fromEntries(Object.entries(clone(original)).reverse());
  changed.command_id = IDS.command.toUpperCase();
  changed.scope.lead_id = IDS.lead.toUpperCase();
  changed.payload.operation_id = IDS.operation.toUpperCase();
  changed.expected_versions.gates[1].scope_key = `lead:${IDS.lead.toUpperCase()}`;
  changed.expected_versions.gates.reverse();
  assert.equal(await hashCommandIntent(changed, ACTOR.toUpperCase().replace('USER:', 'user:')),
    await hashCommandIntent(original, ACTOR));
});

test('command ID, retry key and correlation do not alter the intent hash', async () => {
  const input = envelope();
  const hash = await hashCommandIntent(input, ACTOR);
  const retry = clone(input);
  retry.command_id = IDS.other;
  retry.idempotency_key = 'another.transport.key';
  retry.correlation_id = IDS.operation;
  assert.equal(await hashCommandIntent(retry, ACTOR), hash);
  // Only PostgreSQL decides whether that key/ID may replay a receipt.
  assert.equal(normalizeCommandEnvelope(retry).command_id, IDS.other);
});

test('actor is part of the hash and must be supplied separately as an identified user', async () => {
  const input = envelope();
  assert.notEqual(await hashCommandIntent(input, ACTOR),
    await hashCommandIntent(input, `user:${IDS.other}`));
  for (const subject of [IDS.user, 'service:worker', 'user:*', 'admin', null]) {
    rejects(() => canonicalCommandIntent(input, subject), 'INVALID_ENVELOPE');
  }
});

test('payload, scope, causation, policy and every expected version bind the hash', async () => {
  const original = envelope();
  const hash = await hashCommandIntent(original, ACTOR);
  const mutations = [
    (input) => { input.payload.operation_id = IDS.other; },
    (input) => { input.payload.value += 1; },
    (input) => { input.scope.lead_id = IDS.other; input.expected_versions.gates[1].scope_key = `lead:${IDS.other}`; },
    (input) => { input.causation = { event_id: IDS.other }; },
    (input) => { input.policy_version_seen = 'foundation.policy.2'; },
    (input) => { input.expected_versions.lead_aggregate_version += 1; },
    (input) => { input.expected_versions.assignment_epoch += 1; },
    (input) => { input.expected_versions.gates[0].writer_epoch += 1; },
    (input) => { input.expected_versions.gates[0].revision += 1; },
    (input) => { input.expected_versions.gates[0].scope_key = `lead:${IDS.lead}`; },
    (input) => { input.expected_versions.gates[0].contract_version = 'foundation.2'; },
    (input) => { input.expected_versions.gates[0].policy_version = 'foundation.policy.2'; },
  ];
  for (const mutate of mutations) {
    const changed = clone(original);
    mutate(changed);
    assert.notEqual(await hashCommandIntent(changed, ACTOR), hash);
  }
});

test('canonical JSON sorts object keys while preserving array order and exact escaping', () => {
  assert.equal(canonicalJson({ z: [2, 1], a: { y: false, x: null }, s: 'línea\n"\\' }),
    '{"a":{"x":null,"y":false},"s":"línea\\n\\\"\\\\","z":[2,1]}');
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.equal(canonicalJson({ value: 9007199254740991 }), '{"value":9007199254740991}');
});

test('hash helper agrees with an independent SHA-256 implementation', async () => {
  const input = envelope();
  const expected = createHash('sha256').update(canonicalCommandIntent(input, ACTOR), 'utf8').digest('hex');
  const actual = await hashCommandIntent(input, ACTOR);
  assert.match(actual, /^[0-9a-f]{64}$/);
  assert.equal(actual, expected);
});

test('non-JSON values and malformed Unicode cannot acquire a divergent hash', () => {
  for (const value of [undefined, BigInt(1), NaN, Infinity, 0.25, '\u0000', '\ud800',
    new Date(0), new Map(), () => 1, [, 1]]) {
    rejects(() => canonicalJson(value), 'INVALID_ENVELOPE');
  }
});

test('getters, hidden properties, symbols and inherited envelopes are rejected without evaluating them', () => {
  let getterCalls = 0;
  const accessor = envelope();
  Object.defineProperty(accessor, 'actor', { enumerable: true, get() { getterCalls += 1; return IDS.user; } });
  rejects(() => normalizeCommandEnvelope(accessor), 'INVALID_ENVELOPE');
  assert.equal(getterCalls, 0);
  const hidden = envelope();
  Object.defineProperty(hidden, 'actor', { value: IDS.user });
  rejects(() => normalizeCommandEnvelope(hidden), 'INVALID_ENVELOPE');
  const symbol = envelope();
  symbol[Symbol('actor')] = IDS.user;
  rejects(() => normalizeCommandEnvelope(symbol), 'INVALID_ENVELOPE');
  rejects(() => normalizeCommandEnvelope(Object.create(envelope())), 'INVALID_ENVELOPE');
});

test('prototype-like JSON fields are rejected and cannot change allowed scope or actor', () => {
  const input = JSON.parse(JSON.stringify(envelope()).replace('{', '{"__proto__":{"actor":"forged"},'));
  rejects(() => normalizeCommandEnvelope(input), 'INVALID_ENVELOPE');
  const nested = envelope();
  nested.scope = JSON.parse(`{"lead_id":"${IDS.lead}","constructor":{"role":"admin"}}`);
  rejects(() => normalizeCommandEnvelope(nested), 'INVALID_SCOPE');
});

test('oversized and recursively nested data fail as contract errors instead of being silently truncated', () => {
  const input = envelope();
  input.idempotency_key = 'x'.repeat(65537);
  rejects(() => normalizeCommandEnvelope(input), 'INVALID_ENVELOPE');
  let nested = null;
  for (let i = 0; i < 34; i += 1) nested = { nested };
  rejects(() => canonicalJson(nested), 'INVALID_ENVELOPE');
});
