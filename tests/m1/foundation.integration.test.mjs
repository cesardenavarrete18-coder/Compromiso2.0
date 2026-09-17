import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { hashCommandIntent } from '../../supabase/functions/_shared/crm-runtime/contracts.mjs';
import { PgSession, sqlJson, sqlLiteral as q } from './harness/pg-session.mjs';

const ACTOR = {
  seller: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  inactive: '00000000-0000-4000-8000-000000000003',
  supervisor: '00000000-0000-4000-8000-000000000004',
  admin: '00000000-0000-4000-8000-000000000005',
  salesAdmin: '00000000-0000-4000-8000-000000000006',
};
const TABLES = ['crm_runtime_policies', 'crm_runtime_gates', 'crm_conversation_state',
  'crm_lead_runtime', 'crm_command_receipts', 'crm_events'];

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

async function context(db, owner = ACTOR.seller, { defaultGate = false } = {}) {
  const lead = randomUUID();
  const scope = `lead:${lead}`;
  await db.query(`INSERT INTO public.leads(id,assigned_seller_user_id) VALUES(${q(lead)},${q(owner)});
    INSERT INTO private.crm_lead_runtime(lead_id,policy_version) VALUES(${q(lead)},'fixture-v1');`);
  const gates = [
    { domain: 'command_crm', scope_key: scope, writer_epoch: 9, revision: 2, contract_version: 'foundation-v1', policy_version: 'fixture-v1' },
    { domain: 'command_owner', scope_key: scope, writer_epoch: 17, revision: 4, contract_version: 'foundation-v1', policy_version: 'fixture-v1' },
  ];
  for (const gate of gates) {
    await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,${defaultGate ? '' : 'mode,'}writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
      VALUES(${q(gate.domain)},${q(scope)},${defaultGate ? '' : "'ready',"}${gate.writer_epoch},${gate.revision},'foundation-v1','fixture-v1','isolated-fixture','foundation probe only','m1-foundation-fixture/1');`);
  }
  return {
    schema_version: 1, command_id: randomUUID(), command_type: 'FoundationProbe',
    idempotency_key: `intent-${randomUUID()}`, scope: { lead_id: lead },
    expected_versions: { lead_aggregate_version: 0, assignment_epoch: 0, gates },
    payload: { operation_id: randomUUID(), value: 7 }, policy_version_seen: 'fixture-v1',
  };
}

async function actorTransaction(db, actor = ACTOR.seller) {
  await db.query(`BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub',${q(actor)},true);`);
}

async function submit(db, command, actor = ACTOR.seller) {
  await actorTransaction(db, actor);
  try {
    const result = await db.json(`SELECT public.crm_submit_command(${sqlJson(command)})`);
    // Deliberately COMMIT while current_role is authenticated, not postgres.
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK', { allowError: true });
    throw error;
  }
}

async function counts(db, lead) {
  return db.json(`SELECT jsonb_build_object(
    'effects',(SELECT count(*) FROM m1_fixture.probe_effects WHERE lead_id=${q(lead)}),
    'receipts',(SELECT count(*) FROM private.crm_command_receipts WHERE scope_key=${q(`lead:${lead}`)}),
    'events',(SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)}),
    'version',(SELECT aggregate_version FROM private.crm_lead_runtime WHERE lead_id=${q(lead)}))`);
}

async function expectWaiting(db, application) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await db.scalar(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE application_name=${q(application)} AND wait_event_type='Lock')`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`No real database lock wait observed for ${application}`);
}

test('M1-01/02/03: isolated PostgreSQL foundation', { timeout: 180000 }, async t => {
  const db = new PgSession('m1-observer');
  try {
    await t.test('ISOLATION: PostgreSQL17, Unix socket, restricted migrator and six private tables', async () => {
      const evidence = await db.json(`SELECT jsonb_build_object(
        'major',current_setting('server_version_num')::integer/10000,
        'listen',current_setting('listen_addresses'), 'unix',inet_server_addr() IS NULL,
        'migrator_super',(SELECT rolsuper FROM pg_roles WHERE rolname='postgres'),
        'migrator_createrole',(SELECT rolcreaterole FROM pg_roles WHERE rolname='postgres'),
        'migrator_bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname='postgres'),
        'tables',(SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='private' AND c.relkind='r'))`);
      assert.equal(evidence.major, 17);
      assert.equal(evidence.listen, '');
      assert.equal(evidence.unix, true);
      assert.equal(evidence.migrator_super, false);
      assert.equal(evidence.migrator_createrole, true);
      assert.equal(evidence.migrator_bypass, true);
      assert.deepEqual(evidence.tables, [...TABLES].sort());
      assert.deepEqual((await db.query(`SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql','pgcrypto')`)).rows, []);
    });

    await t.test('M14: no API role can directly read/write new tables or execute the installed gateway', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const table of TABLES) {
          assert.equal(await db.scalar(`SELECT has_table_privilege(${q(role)},${q(`private.${table}`)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`), 'f');
        }
        assert.equal(await db.scalar(`SELECT has_function_privilege(${q(role)},'public.crm_submit_command(jsonb)','EXECUTE')`), 'f');
        assert.equal(await db.scalar(`SELECT pg_has_role(${q(role)},'crm_runtime_owner','MEMBER')`), 'f');
      }
      assert.equal(await db.scalar(`SELECT has_table_privilege('crm_runtime_owner','public.leads','SELECT,INSERT,UPDATE,DELETE')`), 'f');
      await actorTransaction(db);
      const denied = await db.query('SELECT public.crm_submit_command(null)', { allowError: true });
      assert.equal(denied.sqlstate, '42501');
      await db.query('ROLLBACK');
      const rls = await db.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolname
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
        WHERE n.nspname='private' AND c.relkind='r'`);
      assert.equal(rls.rows.length, 6);
      for (const row of rls.rows) assert.deepEqual(row, ['t', 't', 'crm_runtime_owner']);
    });

    await db.query(await fixture('probe-support.sql'));

    await t.test('M12: default gates observe; no authoritative/quiescing state can be installed', async () => {
      const command = await context(db, ACTOR.seller, { defaultGate: true });
      const rows = await db.query(`SELECT mode FROM private.crm_runtime_gates WHERE scope_key=${q(`lead:${command.scope.lead_id}`)}`);
      assert.deepEqual(rows.rows, [['observe'], ['observe']]);
      for (const mode of ['authoritative', 'quiescing']) {
        const result = await db.query(`UPDATE private.crm_runtime_gates SET mode=${q(mode)} WHERE scope_key=${q(`lead:${command.scope.lead_id}`)}`, { allowError: true });
        assert.equal(result.sqlstate, '23514');
      }
    });

    await t.test('M13: future recovery/internal send purposes cannot become ready or authoritative', async () => {
      await db.query(`INSERT INTO private.crm_runtime_policies(policy_version,policy_hash,snapshot,publisher_subject,baseline_manifest_id)
        SELECT 'fixture-future-on',encode(sha256(convert_to(s::text,'UTF8')),'hex'),s,'fixture','fixture/1'
        FROM (SELECT '{"project_ref":"m1_fixture_local","recovery_enabled":true,"internal_notification_enabled":true}'::jsonb s) x`);
      for (const domain of ['sender.customer_ai_recovery', 'sender.worker_internal_notification']) {
        await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
          VALUES(${q(domain)},'global','foundation-v1','fixture-future-on','fixture','closed purpose','fixture/1')`);
        for (const mode of ['ready', 'authoritative']) {
          const result = await db.query(`UPDATE private.crm_runtime_gates SET mode=${q(mode)} WHERE domain=${q(domain)}`, { allowError: true });
          assert.equal(result.sqlstate, '23514');
        }
        assert.equal(await db.scalar(`SELECT mode FROM private.crm_runtime_gates WHERE domain=${q(domain)}`), 'observe');
      }
    });

    await t.test('M15: new conversation structure stays disabled/paused; seller cannot acquire channel authority', async () => {
      const id = await db.scalar(`INSERT INTO private.crm_conversation_state(project_ref,provider,provider_account_id,channel_address_id,participant_key,policy_version)
        VALUES('m1_fixture_local','synthetic','account-fixture','channel-fixture','participant-fixture','fixture-v1') RETURNING conversation_id`);
      assert.deepEqual((await db.query(`SELECT channel_authority,dialogue_policy FROM private.crm_conversation_state WHERE conversation_id=${q(id)}`)).rows, [['disabled', 'paused']]);
      const activation = await db.query(`UPDATE private.crm_conversation_state SET channel_authority='ai_service',dialogue_policy='ai_active' WHERE conversation_id=${q(id)}`, { allowError: true });
      assert.equal(activation.sqlstate, '23514');
      await actorTransaction(db);
      const denied = await db.query(`UPDATE private.crm_conversation_state SET channel_authority='ai_service' WHERE conversation_id=${q(id)}`, { allowError: true });
      assert.equal(denied.sqlstate, '42501');
      await db.query('ROLLBACK');
    });

    // This grant exists ONLY in this disposable test database. It is absent from all migrations.
    await db.query('GRANT EXECUTE ON FUNCTION public.crm_submit_command(jsonb) TO authenticated');
    await t.test('STOCK-HOOK: even fixture-ready gates cannot activate the installed handler', async () => {
      const command = await context(db);
      const response = await submit(db, command);
      assert.equal(response.error_code, 'COMMAND_NOT_IMPLEMENTED');
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 0, receipts: 1, events: 0, version: 0 });
      assert.equal(await db.scalar(`SELECT status FROM private.crm_command_receipts WHERE command_id=${q(command.command_id)}`), 'rejected');
    });
    await db.query(await fixture('probe-handler.sql'));

    await t.test('M01: same command_id and same intent have one logical result', async () => {
      const command = await context(db);
      const first = await submit(db, command);
      const second = await submit(db, command);
      assert.equal(first.status, 'applied');
      assert.equal(second.status, 'replayed');
      assert.equal(second.original_status, 'applied');
      assert.deepEqual(first.event_ids, second.event_ids);
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 1, receipts: 1, events: 1, version: 1 });
    });

    await t.test('M02: same idempotency key/hash with a new command UUID replays the original', async () => {
      const command = await context(db);
      const first = await submit(db, command);
      const second = await submit(db, { ...command, command_id: randomUUID(), correlation_id: randomUUID() });
      assert.equal(second.status, 'replayed');
      assert.equal(second.command_id, first.command_id);
      assert.deepEqual(second.event_ids, first.event_ids);
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 1, receipts: 1, events: 1, version: 1 });
    });

    await t.test('M03: a changed payload under the same key conflicts without another effect', async () => {
      const command = await context(db);
      await submit(db, command);
      const conflict = await submit(db, { ...command, command_id: randomUUID(), payload: { ...command.payload, value: 8 } });
      assert.equal(conflict.error_code, 'IDEMPOTENCY_KEY_REUSED');
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 1, receipts: 1, events: 1, version: 1 });
    });

    await t.test('M04: stale aggregate/assignment versions reject before applying', async () => {
      for (const column of ['assignment_epoch', 'aggregate_version']) {
        const command = await context(db);
        await db.query(`UPDATE private.crm_lead_runtime SET ${column}=1 WHERE lead_id=${q(command.scope.lead_id)}`);
        const result = await submit(db, command);
        assert.equal(result.error_code, 'VERSION_CONFLICT');
        assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 0, receipts: 1, events: 0, version: column === 'aggregate_version' ? 1 : 0 });
      }
    });

    await t.test('M05: caller actor/role cannot be supplied in envelope or payload', async () => {
      const command = await context(db);
      const forged = await submit(db, { ...command, actor: { user_id: ACTOR.admin, role: 'admin' } });
      assert.equal(forged.error_code, 'INVALID_ENVELOPE');
      const payload = await submit(db, { ...command, payload: { ...command.payload, actor_role: 'admin' } });
      assert.equal(payload.error_code, 'INVALID_PAYLOAD');
      const applied = await submit(db, command);
      assert.equal(applied.status, 'applied');
      assert.equal(await db.scalar(`SELECT actor_user_id FROM private.crm_events WHERE command_id=${q(command.command_id)}`), ACTOR.seller);
    });

    await t.test('M06: inactive user cannot apply a command or recover an old replay', async () => {
      const inactive = await context(db, ACTOR.inactive);
      assert.equal((await submit(db, inactive, ACTOR.inactive)).error_code, 'ACTOR_INACTIVE');
      assert.deepEqual(await counts(db, inactive.scope.lead_id), { effects: 0, receipts: 0, events: 0, version: 0 });
      const command = await context(db);
      await submit(db, command);
      await db.query(`UPDATE public.profiles SET active=false WHERE user_id=${q(ACTOR.seller)}`);
      try {
        const rejected = await submit(db, command);
        assert.equal(rejected.error_code, 'ACTOR_INACTIVE');
        assert.equal(rejected.event_ids, undefined);
      } finally {
        await db.query(`UPDATE public.profiles SET active=true WHERE user_id=${q(ACTOR.seller)}`);
      }
    });

    await t.test('M07: foreign, unassigned and formerly owned scopes are denied without receipt disclosure', async () => {
      for (const owner of [ACTOR.other, null]) {
        const command = await context(db, owner);
        assert.equal((await submit(db, command)).error_code, 'FORBIDDEN_SCOPE');
        assert.equal((await counts(db, command.scope.lead_id)).effects, 0);
      }
      const command = await context(db);
      await submit(db, command);
      await db.query(`UPDATE public.leads SET assigned_seller_user_id=${q(ACTOR.other)} WHERE id=${q(command.scope.lead_id)};
        UPDATE private.crm_lead_runtime SET assignment_epoch=assignment_epoch+1 WHERE lead_id=${q(command.scope.lead_id)}`);
      const oldOwner = await submit(db, command);
      assert.equal(oldOwner.error_code, 'FORBIDDEN_SCOPE');
      assert.equal(oldOwner.event_ids, undefined);
      const otherActorCollision = await submit(db, command, ACTOR.other);
      assert.equal(otherActorCollision.error_code, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal(otherActorCollision.event_ids, undefined);
    });

    await t.test('M08: effect/event/receipt/version commit atomically and SQL hash matches the actual JS contract', async () => {
      const command = await context(db);
      const result = await submit(db, command);
      assert.equal(result.status, 'applied');
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 1, receipts: 1, events: 1, version: 1 });
      assert.equal(await db.scalar(`SELECT request_hash FROM private.crm_command_receipts WHERE command_id=${q(command.command_id)}`), await hashCommandIntent(command, `user:${ACTOR.seller}`));
      const variant = {
        ...command, command_id: command.command_id.toUpperCase(), correlation_id: randomUUID(),
        scope: { lead_id: command.scope.lead_id.toUpperCase() },
        payload: { value: command.payload.value, operation_id: command.payload.operation_id.toUpperCase() },
        expected_versions: { ...command.expected_versions, gates: [...command.expected_versions.gates].reverse().map(gate => ({ ...gate, scope_key: `lead:${command.scope.lead_id.toUpperCase()}` })) },
      };
      assert.equal(await hashCommandIntent(variant, `user:${ACTOR.seller}`), await hashCommandIntent(command, `user:${ACTOR.seller}`));
      const normalizedReplay = await submit(db, variant);
      assert.equal(normalizedReplay.status, 'replayed');
      assert.deepEqual(normalizedReplay.event_ids, result.event_ids);
      assert.equal(await db.scalar(`SELECT correlation_id FROM private.crm_command_receipts WHERE command_id=${q(command.command_id)}`), command.command_id);
      const event = await db.json(`SELECT to_jsonb(e) FROM private.crm_events e WHERE command_id=${q(command.command_id)}`);
      assert.equal(event.responsible_user_id_at_event, ACTOR.seller);
      assert.equal(event.aggregate_version, 1);
      assert.deepEqual(event.payload, command.payload);
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(command.scope.lead_id)}`), ACTOR.seller);
    });

    await t.test('M09: backend crash before COMMIT leaves no partial receipt/event/effect', async () => {
      const command = await context(db);
      const interrupted = new PgSession('m1-crash-before-commit');
      try {
        const pid = await interrupted.scalar('SELECT pg_backend_pid()');
        await actorTransaction(interrupted);
        assert.equal((await interrupted.json(`SELECT public.crm_submit_command(${sqlJson(command)})`)).status, 'applied');
        assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 0, receipts: 0, events: 0, version: 0 });
        assert.equal(await db.scalar(`SELECT pg_terminate_backend(${Number(pid)})`), 't');
        assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 0, receipts: 0, events: 0, version: 0 });
      } finally { await interrupted.close(); }
      assert.equal((await submit(db, command)).status, 'applied');
    });

    await t.test('M10: retry after COMMIT from a fresh connection returns the committed result', async () => {
      const command = await context(db);
      const original = await submit(db, command);
      const retry = new PgSession('m1-retry-after-commit');
      try {
        const replay = await submit(retry, command);
        assert.equal(replay.status, 'replayed');
        assert.deepEqual(replay.event_ids, original.event_ids);
      } finally { await retry.close(); }
      assert.equal((await counts(db, command.scope.lead_id)).effects, 1);
    });

    await t.test('M11: two real sessions race on one command; observed lock wait, exactly one application', async () => {
      const command = await context(db);
      const a = new PgSession('m1-race-A');
      const b = new PgSession('m1-race-B');
      let waiting;
      try {
        await actorTransaction(a);
        const first = await a.json(`SELECT public.crm_submit_command(${sqlJson(command)})`);
        waiting = submit(b, command);
        await expectWaiting(db, 'm1-race-B');
        await a.query('COMMIT');
        const second = await waiting;
        assert.equal(first.status, 'applied');
        assert.equal(second.status, 'replayed');
        assert.deepEqual(first.event_ids, second.event_ids);
        assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 1, receipts: 1, events: 1, version: 1 });
      } finally {
        await a.query('ROLLBACK', { allowError: true });
        if (waiting) await waiting.catch(() => {});
        await a.close(); await b.close();
      }
    });

    await t.test('FAILPOINT: exception after synthetic DML rolls back every command effect', async () => {
      const command = await context(db);
      await db.query(`INSERT INTO m1_fixture.failpoints(operation_id,fail_after_effect) VALUES(${q(command.payload.operation_id)},true)`);
      await assert.rejects(submit(db, command), /P9999:.*FIXTURE_FAILURE_AFTER_EFFECT/s);
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 0, receipts: 0, events: 0, version: 0 });
    });

    await t.test('GATE-VECTOR: changing one domain epoch does not borrow authority from the other', async () => {
      const command = await context(db);
      command.expected_versions.gates[0].writer_epoch = command.expected_versions.gates[1].writer_epoch;
      assert.equal((await submit(db, command)).error_code, 'WRITER_FENCED');
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 0, receipts: 1, events: 0, version: 0 });
    });

    await t.test('VERSION-EXHAUSTED: safe integer ceiling cannot overflow into an imprecise JS version', async () => {
      const command = await context(db);
      command.expected_versions.lead_aggregate_version = Number.MAX_SAFE_INTEGER;
      await db.query(`UPDATE private.crm_lead_runtime SET aggregate_version=9007199254740991 WHERE lead_id=${q(command.scope.lead_id)}`);
      assert.equal((await submit(db, command)).error_code, 'VERSION_EXHAUSTED');
      assert.equal((await counts(db, command.scope.lead_id)).effects, 0);
    });

    await t.test('BUSINESS-DEDUPE: different keys cannot duplicate the synthetic operation identity', async () => {
      const command = await context(db);
      await submit(db, command);
      const duplicate = { ...command, command_id: randomUUID(), idempotency_key: `retry-${randomUUID()}`,
        expected_versions: { ...command.expected_versions, lead_aggregate_version: 1 } };
      assert.equal((await submit(db, duplicate)).error_code, 'DUPLICATE_INTENT');
      assert.deepEqual(await counts(db, command.scope.lead_id), { effects: 1, receipts: 2, events: 1, version: 1 });
    });

    await t.test('DEFERRED-GUARD: evaluating receipts cannot commit', async () => {
      const command = await context(db);
      await submit(db, command);
      const id = randomUUID();
      await db.query('BEGIN');
      await db.query(`INSERT INTO private.crm_command_receipts SELECT (jsonb_populate_record(null::private.crm_command_receipts,
        to_jsonb(r)||jsonb_build_object('command_id',${q(id)},'idempotency_key',${q(id)},'status','evaluating','result',null,'error_code',null,'decided_at',null))).*
        FROM private.crm_command_receipts r WHERE command_id=${q(command.command_id)}`);
      const failure = await db.query('COMMIT', { allowError: true });
      assert.equal(failure.sqlstate, '23514');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE command_id=${q(id)}`), '0');
    });

    await t.test('APPEND-ONLY: terminal receipts/events/policy reject mutation and TRUNCATE', async () => {
      const command = await context(db);
      await submit(db, command);
      for (const statement of [
        `UPDATE private.crm_command_receipts SET error_code='rewrite' WHERE command_id=${q(command.command_id)}`,
        `DELETE FROM private.crm_events WHERE command_id=${q(command.command_id)}`,
        'TRUNCATE private.crm_command_receipts, private.crm_events',
      ]) {
        assert.equal((await db.query(statement, { allowError: true })).sqlstate, '23514');
      }
      // The incoming causation FK may reject standalone TRUNCATE before its trigger.
      const singleTableTruncate = await db.query('TRUNCATE private.crm_events', { allowError: true });
      assert.equal(singleTableTruncate.ok, false);
      assert.ok(['0A000', '23514'].includes(singleTableTruncate.sqlstate));
      const immutable = await db.query(`UPDATE private.crm_runtime_policies SET publisher_subject='rewrite' WHERE policy_version='fixture-v1'`, { allowError: true });
      assert.equal(immutable.sqlstate, '55000');
    });

    await t.test('DEFERRED-EVENT: an event cannot later attach to a rejected receipt', async () => {
      const applied = await context(db);
      await submit(db, applied);
      const rejected = await context(db);
      rejected.expected_versions.assignment_epoch = 1;
      assert.equal((await submit(db, rejected)).error_code, 'VERSION_CONFLICT');
      await db.query('BEGIN');
      await db.query(`INSERT INTO private.crm_events SELECT (jsonb_populate_record(null::private.crm_events,
        to_jsonb(e)||jsonb_build_object('event_id',${q(randomUUID())},'command_id',${q(rejected.command_id)},
          'aggregate_id',${q(rejected.scope.lead_id)},'lead_id',${q(rejected.scope.lead_id)},'causation_event_id',null))).*
        FROM private.crm_events e WHERE command_id=${q(applied.command_id)}`);
      assert.equal((await db.query('COMMIT', { allowError: true })).sqlstate, '23514');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events WHERE command_id=${q(rejected.command_id)}`), '0');
    });

    await t.test('CONCURRENT-CAS: distinct intents at one version produce one effect and one conflict', async () => {
      const firstCommand = await context(db);
      const secondCommand = { ...firstCommand, command_id: randomUUID(), idempotency_key: `other-${randomUUID()}`,
        payload: { operation_id: randomUUID(), value: 11 } };
      const a = new PgSession('m1-cas-A');
      const b = new PgSession('m1-cas-B');
      let waiting;
      try {
        await actorTransaction(a);
        assert.equal((await a.json(`SELECT public.crm_submit_command(${sqlJson(firstCommand)})`)).status, 'applied');
        waiting = submit(b, secondCommand);
        await expectWaiting(db, 'm1-cas-B');
        await a.query('COMMIT');
        assert.equal((await waiting).error_code, 'VERSION_CONFLICT');
        assert.deepEqual(await counts(db, firstCommand.scope.lead_id), { effects: 1, receipts: 2, events: 1, version: 1 });
      } finally {
        await a.query('ROLLBACK', { allowError: true });
        if (waiting) await waiting.catch(() => {});
        await a.close(); await b.close();
      }
    });

    await t.test('FINAL-INVARIANTS: no evaluating receipt/orphan event; new channel authority remains closed', async () => {
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE status='evaluating'`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events e JOIN private.crm_command_receipts r USING(command_id) WHERE r.status<>'applied'`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts r WHERE status='applied' AND NOT EXISTS(SELECT 1 FROM private.crm_events e WHERE e.command_id=r.command_id)`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_conversation_state WHERE channel_authority<>'disabled' OR dialogue_policy<>'paused'`), '0');
    });
  } finally { await db.close(); }
});
