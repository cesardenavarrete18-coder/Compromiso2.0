import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PgSession, TIMEOUT_SCALE, sqlJson, sqlLiteral as q } from './harness/pg-session.mjs';

// The launcher gives this FILE its own cluster and applies the three unchanged
// migrations. No test relies on foundation.integration.test.mjs having run.
const ACTOR = {
  seller: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000005',
};
const TABLES = ['crm_runtime_policies', 'crm_runtime_gates', 'crm_conversation_state',
  'crm_lead_runtime', 'crm_command_receipts', 'crm_events'];
const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

async function context(db, owner = ACTOR.seller) {
  const lead = randomUUID();
  const gates = ['command_crm', 'command_owner'].map((domain, index) => ({
    domain, scope_key: `lead:${lead}`, writer_epoch: 11 + index, revision: 2,
    contract_version: 'foundation-v1', policy_version: 'fixture-v1',
  }));
  await db.query(`INSERT INTO public.leads(id,assigned_seller_user_id) VALUES(${q(lead)},${q(owner)});
    INSERT INTO private.crm_lead_runtime(lead_id,policy_version) VALUES(${q(lead)},'fixture-v1')`);
  for (const gate of gates) {
    await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,
      policy_version,changer_subject,reason,baseline_manifest_id)
      VALUES(${q(gate.domain)},${q(gate.scope_key)},'ready',${gate.writer_epoch},2,
      'foundation-v1','fixture-v1','security-fixture','reserved probe only','security-fixture/1')`);
  }
  return { schema_version: 1, command_id: randomUUID(), command_type: 'FoundationProbe',
    idempotency_key: `security-${randomUUID()}`, scope: { lead_id: lead },
    expected_versions: { lead_aggregate_version: 0, assignment_epoch: 0, gates },
    payload: { operation_id: randomUUID(), value: 19 }, policy_version_seen: 'fixture-v1' };
}

async function actorTransaction(db, actor = ACTOR.seller) {
  await db.query(`BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub',${q(actor)},true)`);
}

async function submit(db, command, actor = ACTOR.seller) {
  await actorTransaction(db, actor);
  try {
    const result = await db.json(`SELECT public.crm_submit_command(${sqlJson(command)})`);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK', { allowError: true });
    throw error;
  }
}

async function counts(db, command) {
  const lead = command.scope.lead_id;
  return db.json(`SELECT jsonb_build_object(
    'effects',(SELECT count(*) FROM m1_fixture.probe_effects WHERE lead_id=${q(lead)}),
    'receipts',(SELECT count(*) FROM private.crm_command_receipts WHERE scope_key=${q(`lead:${lead}`)}),
    'events',(SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)}),
    'version',(SELECT aggregate_version FROM private.crm_lead_runtime WHERE lead_id=${q(lead)}))`);
}

async function waitForBlock(db, waiterPid, blockerPid) {
  const deadline = Date.now() + 5000 * TIMEOUT_SCALE;
  while (Date.now() < deadline) {
    if (await db.scalar(`SELECT ${Number(blockerPid)}=ANY(pg_blocking_pids(${Number(waiterPid)}))`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`No PostgreSQL blocking edge ${waiterPid} -> ${blockerPid} observed`);
}

async function sessionIdentity(db, role, body) {
  // SET ROLE alone from a superuser session would give a false-positive SET ROLE
  // escape test. Set the SESSION identity too, then restore the bootstrap user.
  await db.query(`SET SESSION AUTHORIZATION ${role}`);
  try { return await body(); }
  finally {
    await db.query('ROLLBACK', { allowError: true });
    await db.query('RESET SESSION AUTHORIZATION');
  }
}

test('M1 security: real roles, forced RLS and transactional locks', { timeout: 180000 * TIMEOUT_SCALE }, async t => {
  const db = new PgSession('m1-security-observer');
  try {
    await t.test('S16/S19: installed owners, membership options and real API denials', async () => {
      assert.deepEqual(await db.json(`SELECT to_jsonb(r) FROM (
        SELECT rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolinherit,rolreplication,rolbypassrls
        FROM pg_roles WHERE rolname='crm_runtime_owner') r`), {
        rolcanlogin: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false,
        rolinherit: false, rolreplication: false, rolbypassrls: false,
      });
      assert.deepEqual((await db.query(`SELECT member.rolname,bool_or(m.admin_option),bool_or(m.inherit_option),bool_or(m.set_option)
        FROM pg_auth_members m JOIN pg_roles owner ON owner.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
        WHERE owner.rolname='crm_runtime_owner' GROUP BY member.rolname ORDER BY member.rolname`)).rows,
      [['postgres', 't', 'f', 'f']]);
      // PG17 can store both the automatic bootstrap ADMIN grant and a separate
      // self-grant for SET/INHERIT. No row may retain either runtime capability.
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
        WHERE r.rolname='crm_runtime_owner' AND (m.inherit_option OR m.set_option)`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
        WHERE r.rolname='crm_runtime_owner'`), '0');
      for (const schema of ['private', 'public']) {
        assert.equal(await db.scalar(`SELECT has_schema_privilege('crm_runtime_owner',${q(schema)},'CREATE')`), 'f');
      }
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await sessionIdentity(db, role, async () => {
          assert.equal(await db.scalar('SELECT current_user'), role);
          for (const table of TABLES) {
            for (const statement of [`SELECT * FROM private.${table}`, `DELETE FROM private.${table}`]) {
              assert.equal((await db.query(statement, { allowError: true })).sqlstate, '42501');
            }
          }
          assert.equal((await db.query('SELECT public.crm_submit_command(null)', { allowError: true })).sqlstate, '42501');
          assert.equal((await db.query('SET ROLE crm_runtime_owner', { allowError: true })).sqlstate, '42501');
          assert.equal(await db.scalar('SELECT current_user'), role);
        });
      }
      await sessionIdentity(db, 'postgres', async () => {
        assert.equal((await db.query('SET ROLE crm_runtime_owner', { allowError: true })).sqlstate, '42501');
        assert.equal((await db.query('SELECT * FROM private.crm_runtime_policies', { allowError: true })).sqlstate, '42501');
      });
    });

    await t.test('S18: definer/invoker ownership and private helper EXECUTE are explicit', async () => {
      const functions = await db.query(`SELECT n.nspname,p.proname,p.prosecdef,r.rolname,p.proconfig=ARRAY['search_path=""']
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
        WHERE (n.nspname='private' AND p.proname LIKE 'crm_%') OR (n.nspname='public' AND p.proname='crm_submit_command')
        ORDER BY n.nspname,p.proname`);
      assert.equal(functions.rows.length, 14);
      const definers = new Set(['crm_foundation_actor', 'crm_foundation_scope', 'crm_receipt_decided_guard', 'crm_submit_command']);
      for (const [schema, name, definer, owner, config] of functions.rows) {
        assert.equal(definer, definers.has(name) ? 't' : 'f', `${schema}.${name} security mode`);
        assert.equal(owner, ['crm_foundation_actor', 'crm_foundation_scope'].includes(name) ? 'postgres' : 'crm_runtime_owner');
        assert.equal(config, 't');
      }
      for (const signature of ['private.crm_foundation_actor(boolean)', 'private.crm_foundation_scope(uuid)']) {
        assert.equal(await db.scalar(`SELECT has_function_privilege('crm_runtime_owner',${q(signature)},'EXECUTE')`), 't');
        for (const role of ['anon', 'authenticated', 'service_role']) {
          assert.equal(await db.scalar(`SELECT has_function_privilege(${q(role)},${q(signature)},'EXECUTE')`), 'f');
        }
      }
    });

    await db.query(await fixture('probe-support.sql'));
    // This disposable cluster grant is deliberately absent from all migrations.
    await db.query('GRANT EXECUTE ON FUNCTION public.crm_submit_command(jsonb) TO authenticated');

    await t.test('S18/S26: installed probe derives actor through read/lock helpers and cannot mutate legacy', async () => {
      const command = await context(db);
      await db.query('BEGIN');
      try {
        await db.query(`CREATE FUNCTION m1_fixture.deny_legacy_dml() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION USING ERRCODE='P9901',MESSAGE='FIXTURE_LEGACY_DML_FORBIDDEN'; END $$;
          CREATE TRIGGER m1_security_no_lead_dml BEFORE INSERT OR UPDATE OR DELETE ON public.leads
          FOR EACH STATEMENT EXECUTE FUNCTION m1_fixture.deny_legacy_dml();
          CREATE TRIGGER m1_security_no_profile_dml BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
          FOR EACH STATEMENT EXECUTE FUNCTION m1_fixture.deny_legacy_dml();
          SET LOCAL ROLE authenticated;
          SELECT set_config('request.jwt.claim.sub',${q(ACTOR.seller)},true)`);
        const result = await db.json(`SELECT public.crm_submit_command(${sqlJson(command)})`);
        assert.equal(result.error_code, 'COMMAND_NOT_IMPLEMENTED');
        await db.query('RESET ROLE');
        assert.deepEqual(await counts(db, command), { effects: 0, receipts: 1, events: 0, version: 0 });
        assert.equal(await db.scalar(`SELECT actor_user_id FROM private.crm_command_receipts WHERE command_id=${q(command.command_id)}`), ACTOR.seller);
        assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(command.scope.lead_id)}`), ACTOR.seller);
      } finally { await db.query('ROLLBACK', { allowError: true }); }
      await sessionIdentity(db, 'crm_runtime_owner', async () => {
        await db.query(`SELECT set_config('request.jwt.claim.sub',${q(ACTOR.seller)},false)`);
        const actor = await db.json('SELECT private.crm_foundation_actor(true)');
        assert.equal(actor.user_id, ACTOR.seller);
        assert.equal(actor.role, 'seller');
        assert.equal((await db.json(`SELECT private.crm_foundation_scope(${q(command.scope.lead_id)})`)).owner_user_id, ACTOR.seller);
        for (const table of ['profiles', 'leads']) {
          assert.equal((await db.query(`SELECT * FROM public.${table}`, { allowError: true })).sqlstate, '42501');
          assert.equal((await db.query(`DELETE FROM public.${table} WHERE false`, { allowError: true })).sqlstate, '42501');
        }
      });
    });

    await db.query(await fixture('probe-handler.sql'));

    await t.test('S20/S21/S22: UPDATE, DELETE and TRUNCATE cannot rewrite or remove committed history', async () => {
      const command = await context(db);
      assert.equal((await submit(db, command)).status, 'applied');
      const before = await db.json(`SELECT jsonb_build_object(
        'receipt',(SELECT to_jsonb(r) FROM private.crm_command_receipts r WHERE command_id=${q(command.command_id)}),
        'event',(SELECT to_jsonb(e) FROM private.crm_events e WHERE command_id=${q(command.command_id)}),
        'policy',(SELECT to_jsonb(p) FROM private.crm_runtime_policies p WHERE policy_version='fixture-v1'))`);
      for (const statement of [
        `UPDATE private.crm_command_receipts SET request_hash=repeat('0',64) WHERE command_id=${q(command.command_id)}`,
        `DELETE FROM private.crm_command_receipts WHERE command_id=${q(command.command_id)}`,
        `UPDATE private.crm_events SET actor_subject='forged' WHERE command_id=${q(command.command_id)}`,
        `DELETE FROM private.crm_events WHERE command_id=${q(command.command_id)}`,
        'TRUNCATE private.crm_command_receipts,private.crm_events',
      ]) {
        assert.equal((await db.query(statement, { allowError: true })).sqlstate, '23514');
      }
      for (const statement of [
        `UPDATE private.crm_runtime_policies SET publisher_subject='forged' WHERE policy_version='fixture-v1'`,
        `DELETE FROM private.crm_runtime_policies WHERE policy_version='fixture-v1'`,
        'TRUNCATE private.crm_runtime_policies CASCADE',
      ]) {
        const denied = await db.query(statement, { allowError: true });
        assert.equal(denied.ok, false);
        // CASCADE can reach either the policy or history truncate trigger first;
        // both prohibit the entire statement, rather than clearing child tables.
        assert.ok(['55000', '23514'].includes(denied.sqlstate));
      }
      assert.deepEqual(await db.json(`SELECT jsonb_build_object(
        'receipt',(SELECT to_jsonb(r) FROM private.crm_command_receipts r WHERE command_id=${q(command.command_id)}),
        'event',(SELECT to_jsonb(e) FROM private.crm_events e WHERE command_id=${q(command.command_id)}),
        'policy',(SELECT to_jsonb(p) FROM private.crm_runtime_policies p WHERE policy_version='fixture-v1'))`), before);
      assert.deepEqual(await counts(db, command), { effects: 1, receipts: 1, events: 1, version: 1 });
    });

    await t.test('S17: FORCE RLS filters the NOLOGIN table owner; disabling FORCE changes the result', async () => {
      const command = await context(db);
      assert.equal((await submit(db, command)).status, 'applied');
      await db.query(`INSERT INTO private.crm_conversation_state(project_ref,provider,provider_account_id,channel_address_id,participant_key,policy_version)
        VALUES('m1_fixture_local','synthetic','security-account','security-channel',${q(randomUUID())},'fixture-v1')`);
      await db.query('BEGIN');
      try {
        for (const table of TABLES) {
          assert.ok(Number(await db.scalar(`SELECT count(*) FROM private.${table}`)) > 0);
          await db.query(`CREATE POLICY m1_security_deny ON private.${table} AS RESTRICTIVE
            FOR ALL TO crm_runtime_owner USING(false) WITH CHECK(false)`);
        }
        await db.query('SET LOCAL ROLE crm_runtime_owner');
        assert.equal(await db.scalar('SELECT current_user'), 'crm_runtime_owner');
        for (const table of TABLES) {
          assert.equal(await db.scalar(`SELECT count(*) FROM private.${table}`), '0');
          await db.query(`ALTER TABLE private.${table} NO FORCE ROW LEVEL SECURITY`);
          assert.ok(Number(await db.scalar(`SELECT count(*) FROM private.${table}`)) > 0);
          await db.query(`ALTER TABLE private.${table} FORCE ROW LEVEL SECURITY`);
          assert.equal(await db.scalar(`SELECT count(*) FROM private.${table}`), '0');
        }
        const denied = await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
          VALUES('command_crm','global','foundation-v1','fixture-v1','fixture','RLS check','fixture/1')`, { allowError: true });
        assert.equal(denied.sqlstate, '42501');
      } finally { await db.query('ROLLBACK', { allowError: true }); }
    });

    await t.test('S16/S17: RLS still denies an ordinary role with fixture SELECT; BYPASSRLS is not falsely certified', async () => {
      await db.query('BEGIN');
      try {
        await db.query(`GRANT USAGE ON SCHEMA private TO authenticated,service_role;
          GRANT SELECT ON private.crm_runtime_policies TO authenticated,service_role;
          SET LOCAL ROLE authenticated`);
        assert.equal(await db.scalar('SELECT count(*) FROM private.crm_runtime_policies'), '0');
        await db.query('RESET ROLE; SET LOCAL ROLE service_role');
        assert.ok(Number(await db.scalar('SELECT count(*) FROM private.crm_runtime_policies')) > 0);
      } finally { await db.query('ROLLBACK', { allowError: true }); }
      assert.equal(await db.scalar(`SELECT has_table_privilege('service_role','private.crm_runtime_policies','SELECT')`), 'f');
    });

    await t.test('S18/S25: spoofed auxiliary claims do not replace the active profile or current owner', async () => {
      const command = await context(db, ACTOR.other);
      await actorTransaction(db);
      try {
        await db.query(`SELECT set_config('request.jwt.claim.role','service_role',true),
          set_config('request.jwt.claims',${q(JSON.stringify({ role: 'admin', user_metadata: { role: 'admin', user_id: ACTOR.admin } }))},true),
          set_config('crm.actor_role','admin',true),set_config('crm.actor_user_id',${q(ACTOR.admin)},true)`);
        assert.equal((await db.json(`SELECT public.crm_submit_command(${sqlJson(command)})`)).error_code, 'FORBIDDEN_SCOPE');
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK', { allowError: true }); throw error; }
      assert.deepEqual(await counts(db, command), { effects: 0, receipts: 1, events: 0, version: 0 });
      assert.equal(await db.scalar(`SELECT actor_user_id FROM private.crm_command_receipts WHERE command_id=${q(command.command_id)}`), ACTOR.seller);
    });

    await t.test('S23-GATE: an in-flight gate change is awaited and rechecked before any effect', async () => {
      const command = await context(db);
      const blocker = new PgSession('m1-security-gate-holder');
      const caller = new PgSession('m1-security-gate-caller');
      let pending;
      try {
        const blockerPid = await blocker.scalar('SELECT pg_backend_pid()');
        const callerPid = await caller.scalar('SELECT pg_backend_pid()');
        await blocker.query(`BEGIN; UPDATE private.crm_runtime_gates SET mode='paused',writer_epoch=writer_epoch+1
          WHERE domain='command_crm' AND scope_key=${q(`lead:${command.scope.lead_id}`)}`);
        pending = submit(caller, command);
        await waitForBlock(db, callerPid, blockerPid);
        assert.equal(await db.scalar(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=${Number(callerPid)}
          AND relation='private.crm_runtime_gates'::regclass AND mode='ShareLock' AND NOT granted)`), 't');
        assert.deepEqual(await counts(db, command), { effects: 0, receipts: 0, events: 0, version: 0 });
        await blocker.query('COMMIT');
        assert.equal((await pending).error_code, 'WRITER_FENCED');
        assert.deepEqual(await counts(db, command), { effects: 0, receipts: 1, events: 0, version: 0 });
      } finally {
        await blocker.query('ROLLBACK', { allowError: true });
        if (pending) await pending.catch(() => {});
        await caller.close(); await blocker.close();
      }
    });

    await t.test('S23-LEAD/S25: current ownership is read under a real lead lock after waiting', async () => {
      const command = await context(db);
      const blocker = new PgSession('m1-security-lead-holder');
      const caller = new PgSession('m1-security-lead-caller');
      let pending;
      try {
        const blockerPid = await blocker.scalar('SELECT pg_backend_pid()');
        const callerPid = await caller.scalar('SELECT pg_backend_pid()');
        await blocker.query(`BEGIN; UPDATE public.leads SET assigned_seller_user_id=${q(ACTOR.other)} WHERE id=${q(command.scope.lead_id)}`);
        pending = submit(caller, command);
        await waitForBlock(db, callerPid, blockerPid);
        assert.deepEqual(await counts(db, command), { effects: 0, receipts: 0, events: 0, version: 0 });
        await blocker.query('COMMIT');
        const response = await pending;
        assert.equal(response.error_code, 'FORBIDDEN_SCOPE');
        assert.equal(response.event_ids, undefined);
        assert.deepEqual(await counts(db, command), { effects: 0, receipts: 1, events: 0, version: 0 });
      } finally {
        await blocker.query('ROLLBACK', { allowError: true });
        if (pending) await pending.catch(() => {});
        await caller.close(); await blocker.close();
      }
    });

    await t.test('S24: a real PostgreSQL deadlock and full transaction retry cannot duplicate an intent', async () => {
      const command = await context(db);
      const blocker = new PgSession('m1-security-deadlock-holder');
      const caller = new PgSession('m1-security-deadlock-caller');
      let pending;
      try {
        const blockerPid = await blocker.scalar('SELECT pg_backend_pid()');
        const callerPid = await caller.scalar('SELECT pg_backend_pid()');
        await blocker.query(`BEGIN; SET LOCAL deadlock_timeout='50ms';
          SELECT id FROM public.leads WHERE id=${q(command.scope.lead_id)} FOR UPDATE`);
        await caller.query(`SET deadlock_timeout='5s'`);
        await actorTransaction(caller);
        pending = caller.query(`SELECT public.crm_submit_command(${sqlJson(command)})`, { allowError: true });
        await waitForBlock(db, callerPid, blockerPid);
        // Deliberately invert the application's order in this TEST-ONLY actor:
        // it holds the legacy lead while the gateway holds the runtime row.
        const inverted = await blocker.query(`UPDATE private.crm_lead_runtime SET aggregate_version=aggregate_version
          WHERE lead_id=${q(command.scope.lead_id)}`, { allowError: true });
        await blocker.query('ROLLBACK', { allowError: true });
        const result = await pending;
        assert.ok([inverted.sqlstate, result.sqlstate].includes('40P01'), 'PostgreSQL must detect a real deadlock');
        if (result.ok) {
          assert.equal(JSON.parse(result.rows[0][0]).status, 'applied');
          await caller.query('COMMIT');
        } else {
          assert.equal(result.sqlstate, '40P01');
          await caller.query('ROLLBACK');
          assert.deepEqual(await counts(db, command), { effects: 0, receipts: 0, events: 0, version: 0 });
        }
        const retried = await submit(db, command);
        assert.equal(retried.status, result.ok ? 'replayed' : 'applied');
        assert.equal((await submit(db, command)).status, 'replayed');
        assert.deepEqual(await counts(db, command), { effects: 1, receipts: 1, events: 1, version: 1 });
      } finally {
        await blocker.query('ROLLBACK', { allowError: true });
        if (pending) await pending.catch(() => {});
        await caller.query('ROLLBACK', { allowError: true });
        await caller.close(); await blocker.close();
      }
    });
  } finally { await db.close(); }
});
