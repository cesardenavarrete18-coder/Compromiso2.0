import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CommandContractError } from '../../supabase/functions/_shared/crm-runtime/contracts.mjs';
import { CONTACT_NEXT_ACTION_COMMAND_TYPES, CONTACT_CHANNELS, CONTACT_OUTCOMES,
  normalizeContactNextActionCommandEnvelope as normalize,
  canonicalContactNextActionCommandIntent as intent,
  hashContactNextActionCommandIntent as hash,
} from '../../supabase/functions/_shared/crm-runtime/contact-next-action-contracts.mjs';

// Pure transport checks. Actor rights, gate mode, deadlines, windows, attribution,
// immutable history, receipt atomicity and concurrency require the real PG suite.
const ID = { command: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  lead: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  fact: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  task: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  action: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  other: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };
const ACTOR = `user:${ID.other}`;
const AT = '2026-09-18T12:30:00.000Z';
const DUE = '2026-09-19T12:30:00.000Z';
function action() { return { action_id: ID.action, due_at: DUE,
  timezone: 'America/Argentina/Buenos_Aires', channel: 'call', note: '', reason: 'Acuerdo de contacto' }; }
function record() { return { variant: 'record', fact_id: ID.fact, channel: 'call',
  fact_kind: 'outbound_attempt', outcome: 'no_answer', occurred_at: AT, note: '' }; }
function envelope(type = 'RecordContactOutcome') {
  const payload = {
    RecordContactOutcome: record(),
    RecordContactTaskOmission: { task_id: ID.task, sequence_id: ID.other, reason_code: 'not_performed', note: '' },
    ScheduleNextAction: action(),
    RescheduleNextAction: { action_id: ID.action, expected_action_revision: 1, due_at: DUE,
      timezone: 'America/Argentina/Buenos_Aires', note: 'Nueva franja', reason: 'A pedido del cliente' },
    CancelNextAction: { action_id: ID.action, expected_action_revision: 1, reason: 'Revisión administrativa' },
    EvaluateContactDeadlines: {},
  }[type];
  return { schema_version: 1, command_id: ID.command, command_type: type,
    idempotency_key: 'contact.1', scope: { lead_id: ID.lead },
    expected_versions: { lead_aggregate_version: 4, assignment_epoch: 1,
      contact_revision: 1, next_action_revision: 2, protocol_revision: 3,
      gates: [{ domain: 'command_contact_next_action', scope_key: `lead:${ID.lead}`,
        writer_epoch: 1, revision: 1, contract_version: 'contact_next_action.v1', policy_version: 'contact.policy.1' }] },
    payload, policy_version_seen: 'contact.policy.1' };
}
function review(decision = 'confirm_credit') {
  const value = envelope();
  value.payload = { variant: 'review', fact_id: ID.fact, expected_review_revision: 0, decision, reason: 'Revisión de evidencia tardía' };
  if (decision === 'amend') {
    const { variant, ...body } = record();
    value.payload.replacement_fact = { ...body, fact_id: ID.other, note: 'Enmienda explícita' };
  }
  return value;
}
function rejects(value, code = 'INVALID_PAYLOAD') {
  assert.throws(() => normalize(value), (error) => {
    assert.ok(error instanceof CommandContractError);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

// Count is intentional and reported independently from the certified 23 + 23 suites.
test('B01 exactly six command types with no getter or generic mutation dispatcher', () => {
  assert.deepEqual(CONTACT_NEXT_ACTION_COMMAND_TYPES, ['RecordContactOutcome', 'RecordContactTaskOmission',
    'ScheduleNextAction', 'RescheduleNextAction', 'CancelNextAction', 'EvaluateContactDeadlines']);
  assert.ok(Object.isFrozen(CONTACT_NEXT_ACTION_COMMAND_TYPES));
  for (const type of CONTACT_NEXT_ACTION_COMMAND_TYPES) assert.equal(normalize(envelope(type)).command_type, type);
  for (const type of ['ReadContactWorkContext', 'CompleteTask', 'RecordInterview', 'SetStage', 'RecordDeposit',
    'Reactivate', 'AcceptCommercialHandoff', 'SendMessage', 'FoundationProbe', 'AssignLead']) {
    rejects({ ...envelope(), command_type: type }, 'UNSUPPORTED_COMMAND');
  }
});

test('B02 all metadata is mandatory and schema version is exact', () => {
  for (const key of ['schema_version', 'command_id', 'command_type', 'idempotency_key', 'scope', 'expected_versions', 'payload', 'policy_version_seen']) {
    const value = envelope(); delete value[key]; rejects(value, 'COMMAND_METADATA_REQUIRED');
  }
  for (const schema_version of [null, 2, '1', true]) rejects({ ...envelope(), schema_version }, 'INVALID_ENVELOPE');
});

test('B03 every envelope and payload rejects caller authority, provenance and commercial transitions', () => {
  for (const field of ['actor', 'role', 'actor_subject', 'source_kind', 'evidence_quality', 'provider_verified',
    'channel_authority', 'authority_epoch', 'adopted', 'stage', 'customer_id', 'request_hash', 'result']) {
    rejects({ ...envelope(), [field]: 'forged' }, 'INVALID_ENVELOPE');
    for (const type of CONTACT_NEXT_ACTION_COMMAND_TYPES) {
      const value = envelope(type); value.payload[field] = 'forged'; rejects(value);
    }
  }
});

test('B04 scope is a single UUID lead with no project, seller or conversation widening', () => {
  for (const scope of [null, [], {}, { lead_id: '*' }, { lead_id: ID.lead, seller_id: ID.other }, { conversation_id: ID.lead }]) {
    rejects({ ...envelope(), scope }, 'INVALID_SCOPE');
  }
});

test('B05 all five expected domain counters and the gate are mandatory', () => {
  for (const field of ['lead_aggregate_version', 'assignment_epoch', 'contact_revision', 'next_action_revision', 'protocol_revision', 'gates']) {
    const value = envelope(); delete value.expected_versions[field]; rejects(value, 'INVALID_VERSIONS');
  }
  const value = envelope(); value.expected_versions.authority_epoch = 0; rejects(value, 'INVALID_VERSIONS');
});

test('B06 counters reject coercion, negative and unsafe values; safe maximum is representable', () => {
  for (const field of ['lead_aggregate_version', 'assignment_epoch', 'contact_revision', 'next_action_revision', 'protocol_revision']) {
    for (const invalid of [-1, null, true, '1', 0.5, 9007199254740992]) {
      const value = envelope(); value.expected_versions[field] = invalid; rejects(value, null);
    }
    const value = envelope(); value.expected_versions[field] = Number.MAX_SAFE_INTEGER;
    assert.equal(normalize(value).expected_versions[field], Number.MAX_SAFE_INTEGER);
    value.expected_versions[field] = -0;
    assert.equal(Object.is(normalize(value).expected_versions[field], -0), false);
  }
});

test('B07 only the exact lead gate and contact_next_action.v1 contract are admitted', () => {
  const changes = [
    (v) => { v.gates = []; }, (v) => { v.gates.push(structuredClone(v.gates[0])); },
    (v) => { v.gates[0].domain = 'command_owner'; }, (v) => { v.gates[0].domain = 'command_crm'; },
    (v) => { v.gates[0].scope_key = 'global'; }, (v) => { v.gates[0].scope_key = `lead:${ID.other}`; },
    (v) => { v.gates[0].contract_version = 'contact_next_action.v2'; }, (v) => { v.gates[0].mode = 'authoritative'; },
    (v) => { v.gates[0].writer_epoch = '1'; }, (v) => { v.gates[0].revision = -1; },
  ];
  for (const change of changes) { const value = envelope(); change(value.expected_versions); rejects(value, 'INVALID_VERSIONS'); }
  for (const key of Object.keys(envelope().expected_versions.gates[0])) {
    const value = envelope(); delete value.expected_versions.gates[0][key]; rejects(value, 'INVALID_VERSIONS');
  }
});

test('B08 labels are bounded ASCII code strings including at trailing whitespace boundaries', () => {
  for (const invalid of ['', 'p\n', 'p\r', ' p', 'p ', 'é', '../policy', 'x'.repeat(129)]) {
    for (const field of ['idempotency_key', 'policy_version_seen']) rejects({ ...envelope(), [field]: invalid }, 'INVALID_ENVELOPE');
    const value = envelope(); value.expected_versions.gates[0].policy_version = invalid; rejects(value, 'INVALID_VERSIONS');
  }
});

test('B09 valid outbound outcome matrix is explicit for each personal channel', () => {
  assert.ok(Object.isFrozen(CONTACT_CHANNELS)); assert.ok(Object.isFrozen(CONTACT_OUTCOMES));
  for (const channel of CONTACT_CHANNELS) {
    for (const outcome of CONTACT_OUTCOMES) {
      const value = envelope(); Object.assign(value.payload, { channel, outcome });
      if ((channel === 'call' && outcome === 'sent') || (channel === 'whatsapp_personal' && outcome === 'no_answer')) rejects(value);
      else assert.equal(normalize(value).payload.outcome, outcome);
    }
  }
});

test('B10 inbound responses cannot be no_answer, sent or invalid attempts', () => {
  for (const channel of CONTACT_CHANNELS) {
    for (const outcome of CONTACT_OUTCOMES) {
      const value = envelope(); Object.assign(value.payload, { channel, outcome, fact_kind: 'inbound_response' });
      if (['answered', 'no_interest', 'requested_no_contact'].includes(outcome)) assert.equal(normalize(value).payload.outcome, outcome);
      else rejects(value);
    }
  }
});

test('B11 skipped, click and personal-to-corporate channel impersonation cannot become a contact fact', () => {
  for (const outcome of ['skipped', 'clicked', 'delivered', 'read', 'verified', '', null]) {
    const value = envelope(); value.payload.outcome = outcome; rejects(value);
  }
  for (const channel of ['whatsapp', 'whatsapp_ai', 'whatsapp_corporate', 'phone', '', null]) {
    const value = envelope(); value.payload.channel = channel; rejects(value);
  }
  for (const fact_kind of ['amendment', 'void', 'outbound', 'inbound', '', null]) {
    const value = envelope(); value.payload.fact_kind = fact_kind; rejects(value);
  }
});

test('B12 record payload has no inferred fact identity, timestamp or result', () => {
  for (const field of Object.keys(record())) { const value = envelope(); delete value.payload[field]; rejects(value); }
  for (const payload of [null, [], '', {}, { variant: 'record' }, { variant: 'unknown' }]) rejects({ ...envelope(), payload });
});

test('B13 UUID normalization includes nested references, replacements, scope and causation', () => {
  const value = envelope();
  value.command_id = ID.command.toUpperCase(); value.scope.lead_id = ID.lead.toUpperCase();
  value.expected_versions.gates[0].scope_key = `lead:${ID.lead.toUpperCase()}`;
  value.payload.fact_id = ID.fact.toUpperCase();
  value.payload.task_ref = { task_id: ID.task.toUpperCase(), sequence_id: ID.other.toUpperCase() };
  value.payload.action_ref = { action_id: ID.action.toUpperCase(), revision: 1 };
  value.payload.replacement_next_action = { ...action(), action_id: ID.other.toUpperCase(),
    replaces_action: { action_id: ID.action.toUpperCase(), revision: 1 },
    protocol_replacement: { sequence_id: ID.other.toUpperCase(), disposition: 'replace' } };
  value.causation = { event_id: ID.other.toUpperCase() };
  const normalized = normalize(value);
  assert.equal(normalized.command_id, ID.command); assert.equal(normalized.scope.lead_id, ID.lead);
  assert.equal(normalized.payload.fact_id, ID.fact); assert.equal(normalized.payload.task_ref.task_id, ID.task);
  assert.equal(normalized.payload.action_ref.action_id, ID.action);
  assert.equal(normalized.payload.replacement_next_action.action_id, ID.other);
  assert.equal(normalized.payload.replacement_next_action.replaces_action.action_id, ID.action);
  assert.equal(normalized.payload.replacement_next_action.protocol_replacement.sequence_id, ID.other);
  assert.deepEqual(normalized.causation, { event_id: ID.other });
});

test('B14 optional absent references remain absent and explicit null is rejected', () => {
  assert.equal(Object.hasOwn(normalize(envelope()).payload, 'task_ref'), false);
  for (const field of ['task_ref', 'action_ref', 'replacement_next_action']) {
    const value = envelope(); value.payload[field] = null; rejects(value);
  }
  for (const field of ['replaces_action', 'protocol_replacement']) {
    const value = envelope('ScheduleNextAction'); value.payload[field] = null; rejects(value);
  }
});

test('B15 task references require task and sequence while action references require identity and revision', () => {
  for (const task_ref of [{ task_id: ID.task }, { sequence_id: ID.other }, { task_id: ID.task, sequence_id: ID.other, completed: true },
    { task_id: ID.task + '\n', sequence_id: ID.other }]) rejects({ ...envelope(), payload: { ...record(), task_ref } });
  for (const action_ref of [{ action_id: ID.action }, { action_id: ID.action, revision: '1' }, { action_id: ID.action, revision: 1, owner: ID.other }]) {
    rejects({ ...envelope(), payload: { ...record(), action_ref } });
  }
});

test('B16 UTC timestamps reject ambiguous local time, lossy precision, invalid dates and normalization rollover', () => {
  for (const timestamp of ['2026-09-18', '2026-09-18T12:30:00', '2026-09-18T12:30:00Z',
    '2026-09-18T09:30:00.000-03:00', '2026-09-18T12:30:00.0001Z', '2026-02-29T12:30:00.000Z',
    '2026-09-18T24:00:00.000Z', '2026-09-18T12:30:60.000Z', '0000-01-01T00:00:00.000Z',
    AT + '\n', 0, null]) {
    const value = envelope(); value.payload.occurred_at = timestamp; rejects(value);
  }
  for (const timestamp of ['2024-02-29T00:00:00.000Z', '0001-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z']) {
    const value = envelope(); value.payload.occurred_at = timestamp; assert.equal(normalize(value).payload.occurred_at, timestamp);
  }
});

test('B17 zone format is explicit; actual timezone catalogue and DB current time are server decisions', () => {
  for (const timezone of ['UTC', 'America/Argentina/Buenos_Aires', 'America/New_York', 'Etc/GMT+3']) {
    const value = envelope('ScheduleNextAction'); value.payload.timezone = timezone; assert.equal(normalize(value).payload.timezone, timezone);
  }
  for (const timezone of ['ART', '-03:00', 'UTC\n', '', null, 'America//Argentina', '/America/Argentina']) {
    const value = envelope('ScheduleNextAction'); value.payload.timezone = timezone; rejects(value);
  }
});

test('B18 note and reason preserve Unicode with separate bounded lengths and no hidden trim', () => {
  for (const note of ['', '  Nota  ', '\tNota\n', '🚙'.repeat(2000)]) {
    const value = envelope(); value.payload.note = note; assert.equal(normalize(value).payload.note, note);
  }
  for (const note of [null, 5, '🚙'.repeat(2001)]) { const value = envelope(); value.payload.note = note; rejects(value); }
  for (const reason of ['Motivo', '🚙'.repeat(1000), '\tMotivo\n']) {
    const value = envelope('CancelNextAction'); value.payload.reason = reason; assert.equal(normalize(value).payload.reason, reason);
  }
  for (const reason of ['', ' Motivo', 'Motivo ', '🚙'.repeat(1001), null]) {
    const value = envelope('CancelNextAction'); value.payload.reason = reason; rejects(value);
  }
});

test('B19 manual omission is a separate closed intention and cannot carry performed_at or credit', () => {
  for (const reason_code of ['not_performed', 'operational_obstacle']) {
    const value = envelope('RecordContactTaskOmission'); value.payload.reason_code = reason_code; assert.equal(normalize(value).payload.reason_code, reason_code);
  }
  for (const reason_code of ['window_expired', 'called', 'sent', null, '']) {
    const value = envelope('RecordContactTaskOmission'); value.payload.reason_code = reason_code; rejects(value);
  }
  for (const key of ['performed_at', 'outcome', 'occurred_at', 'fact_id', 'completed_by', 'credit']) {
    const value = envelope('RecordContactTaskOmission'); value.payload[key] = AT; rejects(value);
  }
});

test('B20 no-contact fact cannot ask for new agenda', () => {
  const value = envelope(); value.payload.outcome = 'requested_no_contact';
  assert.equal(normalize(value).payload.outcome, 'requested_no_contact');
  value.payload.replacement_next_action = action(); rejects(value);
});

test('B21 review supports exactly confirm_credit, deny_credit and closed append-only amend', () => {
  for (const decision of ['confirm_credit', 'deny_credit', 'amend']) assert.equal(normalize(review(decision)).payload.decision, decision);
  for (const decision of ['delete', 'void', 'rewrite_history', 'set_verified', 'clear_dnc', '', null]) {
    const value = review(); value.payload.decision = decision; rejects(value);
  }
});

test('B22 review requires target, expected revision and reason with no caller reviewer attribution', () => {
  for (const key of Object.keys(review().payload)) { const value = review(); delete value.payload[key]; rejects(value); }
  for (const field of ['reviewer_id', 'reviewer_role', 'confirmed_by', 'source_kind', 'provider_verified', 'credit_task_id']) {
    const value = review(); value.payload[field] = ID.other; rejects(value);
  }
  for (const expected_review_revision of ['0', -1, null]) {
    const value = review(); value.payload.expected_review_revision = expected_review_revision; rejects(value);
  }
});

test('B23 amend requires a different fact identity and no replacement agenda or nested review', () => {
  const absent = review('amend'); delete absent.payload.replacement_fact; rejects(absent);
  const same = review('amend'); same.payload.replacement_fact.fact_id = ID.fact; rejects(same);
  for (const replacement_fact of [null, {}, { ...record(), fact_id: ID.other },
    { ...review('amend').payload.replacement_fact, replacement_next_action: action() }]) {
    const value = review('amend'); value.payload.replacement_fact = replacement_fact; rejects(value);
  }
  for (const decision of ['confirm_credit', 'deny_credit']) {
    const value = review(decision); value.payload.replacement_fact = review('amend').payload.replacement_fact; rejects(value);
  }
});

test('B24 scheduling requires action identity and explicit protocol replacement semantics', () => {
  for (const field of Object.keys(action())) { const value = envelope('ScheduleNextAction'); delete value.payload[field]; rejects(value); }
  const good = envelope('ScheduleNextAction');
  good.payload.protocol_replacement = { sequence_id: ID.other, disposition: 'replace' };
  assert.deepEqual(normalize(good).payload.protocol_replacement, good.payload.protocol_replacement);
  for (const protocol_replacement of [true, { sequence_id: ID.other }, { sequence_id: ID.other, disposition: 'ignore' },
    { sequence_id: ID.other, disposition: 'replace', restart: true }]) {
    const value = envelope('ScheduleNextAction'); value.payload.protocol_replacement = protocol_replacement; rejects(value);
  }
});

test('B25 reschedule preserves action identity and cannot rewrite channel or original due date', () => {
  const value = envelope('RescheduleNextAction'); assert.equal(normalize(value).payload.action_id, ID.action);
  for (const field of ['channel', 'original_due_at', 'completed', 'stage', 'contact_fact_id', 'new_action_id']) {
    const bad = envelope('RescheduleNextAction'); bad.payload[field] = 'forged'; rejects(bad);
  }
  for (const key of Object.keys(value.payload)) { const bad = envelope('RescheduleNextAction'); delete bad.payload[key]; rejects(bad); }
});

test('B26 cancel replacement is optional but never implicit null, and contains a complete schedule', () => {
  const value = envelope('CancelNextAction'); value.payload.replacement_next_action = action();
  assert.deepEqual(normalize(value).payload.replacement_next_action, action());
  for (const replacement_next_action of [null, {}, { action_id: ID.other }]) {
    const bad = envelope('CancelNextAction'); bad.payload.replacement_next_action = replacement_next_action; rejects(bad);
  }
});

test('B27 deadline evaluation accepts no caller cutoff, clock, stage or bulk task selection', () => {
  assert.deepEqual(normalize(envelope('EvaluateContactDeadlines')).payload, {});
  for (const field of ['cutoff', 'now', 'as_of', 'occurred_at', 'task_ids', 'performed_by', 'reason']) {
    const value = envelope('EvaluateContactDeadlines'); value.payload[field] = AT; rejects(value);
  }
});

test('B28 malformed Unicode and non-data graph values are rejected before reading fields', () => {
  for (const note of ['\u0000', '\ud800', '\udfff', undefined, 1n, new Date(), new Map(), () => 1]) {
    const value = envelope(); value.payload.note = note; rejects(value, 'INVALID_ENVELOPE');
  }
  const cyclic = envelope(); cyclic.payload.note = cyclic; rejects(cyclic, 'INVALID_ENVELOPE');
});

test('B29 no getters, hidden or symbol authority fields, inherited objects or sparse arrays', () => {
  let calls = 0;
  const getter = envelope(); Object.defineProperty(getter.payload, 'note', { enumerable: true, get() { calls += 1; return ''; } });
  rejects(getter, 'INVALID_ENVELOPE'); assert.equal(calls, 0);
  const hidden = envelope(); Object.defineProperty(hidden, 'actor', { value: ID.other }); rejects(hidden, 'INVALID_ENVELOPE');
  const symbol = envelope(); symbol[Symbol('actor')] = ID.other; rejects(symbol, 'INVALID_ENVELOPE');
  const sparse = envelope(); sparse.expected_versions.gates = Array(1); rejects(sparse, 'INVALID_ENVELOPE');
  rejects(Object.assign(Object.create({ role: 'admin' }), envelope()), 'INVALID_ENVELOPE');
});

test('B30 payload byte limit applies before unknown fields can be discarded', () => {
  const value = envelope(); value.payload.extra = 'x'.repeat(65537); rejects(value, 'INVALID_ENVELOPE');
});

test('B31 normalization is detached and does not mutate command graph', () => {
  const value = envelope(); value.payload.replacement_next_action = action();
  const before = structuredClone(value); const result = normalize(value);
  result.payload.replacement_next_action.note = 'Changed'; result.expected_versions.gates[0].revision = 500;
  assert.deepEqual(value, before);
});

test('B32 absent and null causation agree while correlation remains a UUID', async () => {
  assert.equal(await hash(envelope(), ACTOR), await hash({ ...envelope(), causation: null }, ACTOR));
  for (const causation of [[], {}, 'event', { event_id: ID.other, actor: ID.other }]) rejects({ ...envelope(), causation }, 'INVALID_CAUSATION');
  rejects({ ...envelope(), correlation_id: null }, 'INVALID_ENVELOPE');
  assert.equal(normalize(envelope()).correlation_id, ID.command);
});

test('B33 command ID, idempotency key and correlation are excluded from logical intent', async () => {
  const changed = { ...envelope(), command_id: ID.other, idempotency_key: 'retry.2', correlation_id: ID.fact };
  assert.equal(await hash(envelope(), ACTOR), await hash(changed, ACTOR));
  const canonical = JSON.parse(intent(changed, ACTOR));
  for (const key of ['command_id', 'idempotency_key', 'correlation_id']) assert.equal(Object.hasOwn(canonical, key), false);
});

test('B34 each domain counter, causal event, policy and fact meaning binds the hash', async () => {
  const original = envelope(); const originalHash = await hash(original, ACTOR);
  const changes = [
    ...['lead_aggregate_version', 'assignment_epoch', 'contact_revision', 'next_action_revision', 'protocol_revision']
      .map((key) => (v) => { v.expected_versions[key] += 1; }),
    (v) => { v.expected_versions.gates[0].revision += 1; },
    (v) => { v.expected_versions.gates[0].writer_epoch += 1; },
    (v) => { v.expected_versions.gates[0].policy_version = 'contact.policy.2'; },
    (v) => { v.policy_version_seen = 'contact.policy.2'; },
    (v) => { v.causation = { event_id: ID.other }; },
    (v) => { v.payload.fact_id = ID.other; },
    (v) => { v.payload.note = 'Otra evidencia'; },
    (v) => { v.payload.outcome = 'answered'; },
    (v) => { v.payload.occurred_at = '2026-09-18T12:30:00.001Z'; },
    (v) => { v.payload.task_ref = { task_id: ID.task, sequence_id: ID.other }; },
  ];
  for (const change of changes) { const value = structuredClone(original); change(value); assert.notEqual(await hash(value, ACTOR), originalHash); }
});

test('B35 actual actor binds intent and cannot be a declared service, role or malformed UUID', async () => {
  assert.notEqual(await hash(envelope(), ACTOR), await hash(envelope(), `user:${ID.fact}`));
  for (const subject of [null, 'admin', 'service:worker', ID.other, `user:${ID.other}\n`]) {
    assert.throws(() => intent(envelope(), subject), (e) => e instanceof CommandContractError && e.code === 'INVALID_ENVELOPE');
  }
});

test('B36 object ordering and UUID case normalize consistently; Unicode text is not rewritten', async () => {
  const original = envelope(); const changed = Object.fromEntries(Object.entries(structuredClone(original)).reverse());
  changed.payload = Object.fromEntries(Object.entries(changed.payload).reverse()); changed.payload.fact_id = ID.fact.toUpperCase();
  assert.equal(await hash(original, ACTOR), await hash(changed, `user:${ID.other.toUpperCase()}`));
  const first = envelope(); first.payload.note = 'Gestión';
  const second = envelope(); second.payload.note = 'Gestio\u0301n';
  assert.notEqual(await hash(first, ACTOR), await hash(second, ACTOR));
});

test('B37 every valid command hash agrees with independent SHA-256', async () => {
  for (const value of [...CONTACT_NEXT_ACTION_COMMAND_TYPES.map(envelope), review('confirm_credit'), review('deny_credit'), review('amend')]) {
    assert.equal(await hash(value, ACTOR), createHash('sha256').update(intent(value, ACTOR), 'utf8').digest('hex'));
  }
});
