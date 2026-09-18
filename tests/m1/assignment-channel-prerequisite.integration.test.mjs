import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PgSession, sqlLiteral as q, TIMEOUT_SCALE } from './harness/pg-session.mjs';
import {
  ACTORS as A, LEADS as L, POLICY, GATE_REVISION, WRITER_EPOCH,
  installChannelBaselineAndCandidates, seedChannelData, asActor, asMigrator,
  capability, modeRpc, snapshot, adopt, assertDenied,
} from './harness/assignment-channel-fixture.mjs';

// Candidate A prerequisites only. No AssignLead/TransferLead/Acknowledge
// implementation is installed, invoked or simulated in this suite. Passing
// these prerequisites is not passing the user's 23 full guard acceptance cases.
async function waitForLock(db, application) {
  const deadline = Date.now() + 15000 * TIMEOUT_SCALE;
  while (Date.now() < deadline) {
    if (await db.scalar(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${q(application)} AND wait_event_type='Lock')`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`No PostgreSQL lock wait observed for ${application}`);
}

test('Assignment channel prerequisite A: real legacy RPC/RLS, durable adoption and old SQL snapshots; NOT full 23-case acceptance', { timeout: 360000 * TIMEOUT_SCALE }, async t => {
  const db = new PgSession('assignment-channel-prerequisite-observer');
  let adoption;
  let adoptedConversation;
  try {
    await t.test('P01: captured legacy channel closure and candidate A install verbatim as non-superuser with zero adoption or authority seeds', async () => {
      const installed = await installChannelBaselineAndCandidates(db, 1);
      assert.match(installed.candidates[0], /_m1_assignment_adoption_guard\.sql$/);
      assert.equal(await db.scalar(`SELECT has_function_privilege('authenticated','public.crm_submit_command(jsonb)','EXECUTE')`), 'f');
      assert.equal(await db.scalar(`SELECT has_function_privilege('authenticated','private.crm_adopt_assignment_lead(uuid,uuid,bigint,text)','EXECUTE')`), 'f');
      assert.deepEqual((await db.query(`SELECT pg_get_userbyid(relowner),relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='private.crm_assignment_adoptions'::regclass`)).rows,
        [['crm_runtime_owner', 't', 't']]);
      await seedChannelData(db);
      t.diagnostic(JSON.stringify({ stage: 'A_PREREQUISITE_ONLY', candidate: installed.candidates[0], baseline: 'B_plus_observed_channel_and_assignment_schema', synthetic_leads: 10, network_provider_calls: 0 }));
    });

    await t.test('P02: legacy owner retains helper/control access and actual mode RPC; nonowner is denied atomically', async () => {
      assert.deepEqual(await capability(db, A.a, L.legacy), { can_manage: true, controls: 1, events: 0 });
      assert.equal((await modeRpc(db, A.a, L.legacy, 'human')).ok, true);
      const changed = await snapshot(db, L.legacy);
      assert.equal(changed.control.mode, 'human');
      assert.equal(changed.control.taken_by_user_id, A.a);
      assert.equal(changed.events.length, 1);
      await assertDenied(db, A.b, L.legacy);
    });

    await t.test('P03: active admin and supervisor retain actual legacy mode RPC behavior', async () => {
      for (const actor of [A.admin, A.supervisor]) {
        assert.equal((await capability(db, actor, L.legacy)).can_manage, true);
        assert.equal((await modeRpc(db, actor, L.legacy, 'ai')).ok, true);
        assert.equal((await snapshot(db, L.legacy)).events.at(-1).actor_user_id, actor);
      }
    });

    await t.test('P04: runtime metadata and even an authoritative gate alone are not durable adoption', async () => {
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_lead_runtime WHERE lead_id=${q(L.runtimeOnly)}`), '1');
      assert.equal(await db.scalar(`SELECT mode FROM private.crm_runtime_gates WHERE scope_key=${q(`lead:${L.runtimeOnly}`)}`), 'authoritative');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_assignment_adoptions WHERE lead_id=${q(L.runtimeOnly)}`), '0');
      assert.equal((await capability(db, A.a, L.runtimeOnly)).can_manage, true);
      assert.equal((await modeRpc(db, A.a, L.runtimeOnly, 'human')).ok, true);
    });

    await t.test('P05: controlled adoption records server-derived cutover provenance and denies owner through helper, RLS and the real legacy mode RPC', async () => {
      const before = await snapshot(db, L.adopted);
      adoptedConversation = before.conversation;
      assert.equal(adoptedConversation.channel_authority, 'disabled');
      assert.equal(adoptedConversation.dialogue_policy, 'paused');
      assert.equal(adoptedConversation.authority_epoch, 17);
      adoption = await adopt(db, L.adopted);
      assert.equal(adoption.value.status, 'adopted');
      const after = await snapshot(db, L.adopted);
      assert.equal(after.adoption.operation_id, adoption.operation);
      assert.equal(after.adoption.executor_principal, 'postgres');
      assert.equal(after.adoption.gate_scope_key, `lead:${L.adopted}`);
      assert.equal(after.adoption.writer_epoch, WRITER_EPOCH);
      assert.equal(after.adoption.gate_revision, GATE_REVISION);
      assert.equal(after.adoption.policy_version, POLICY);
      assert.equal(after.adoption.contract_version, 'assignment.v1');
      assert.ok(after.adoption.adopted_at);
      assert.deepEqual(after.conversation, before.conversation);
      assert.deepEqual(after.control, before.control);
      assert.deepEqual(after.events, before.events);
      await assertDenied(db, A.a, L.adopted);
      await assertDenied(db, A.b, L.adopted);
    });

    await t.test('P06: the restriction needs no conversation state row or channel authority mutation', async () => {
      assert.equal((await snapshot(db, L.noConversation)).conversation, null);
      await adopt(db, L.noConversation);
      await assertDenied(db, A.a, L.noConversation);
      assert.equal((await snapshot(db, L.noConversation)).conversation, null);
      assert.deepEqual((await snapshot(db, L.adopted)).conversation, adoptedConversation);
    });

    await t.test('P07: pausing the gate and retrying the same technical adoption cannot restore seller capability', async () => {
      const before = await snapshot(db, L.adopted);
      await db.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE domain='command_owner' AND scope_key=${q(`lead:${L.adopted}`)}`);
      const replay = await adopt(db, L.adopted, adoption);
      assert.equal(replay.value.status, 'replayed');
      assert.deepEqual((await snapshot(db, L.adopted)).adoption, before.adoption);
      await assertDenied(db, A.a, L.adopted);
      await assertDenied(db, A.b, L.adopted);
    });

    await t.test('P08: durable evidence rejects UPDATE/DELETE/TRUNCATE and survives rollback of a later gate transaction', async () => {
      const before = await snapshot(db, L.adopted);
      for (const statement of [
        `UPDATE private.crm_assignment_adoptions SET reason='rewrite' WHERE lead_id=${q(L.adopted)}`,
        `DELETE FROM private.crm_assignment_adoptions WHERE lead_id=${q(L.adopted)}`,
        'TRUNCATE private.crm_assignment_adoptions',
      ]) {
        const rejected = await db.query(statement, { allowError: true });
        assert.equal(rejected.sqlstate, '55000');
        assert.match(rejected.error, /ASSIGNMENT_ADOPTION_IMMUTABLE/);
      }
      await db.query(`BEGIN; UPDATE private.crm_runtime_gates SET mode='authoritative' WHERE domain='command_owner' AND scope_key=${q(`lead:${L.adopted}`)}; ROLLBACK`);
      assert.equal(await db.scalar(`SELECT mode FROM private.crm_runtime_gates WHERE domain='command_owner' AND scope_key=${q(`lead:${L.adopted}`)}`), 'paused');
      assert.deepEqual(await snapshot(db, L.adopted), before);
      for (const statement of [
        `UPDATE public.leads SET assigned_seller_user_id=${q(A.b)} WHERE id=${q(L.adopted)}`,
        `INSERT INTO public.lead_assignments(lead_id,seller_user_id,assignment_type) VALUES(${q(L.adopted)},${q(A.b)},'reassigned')`,
      ]) {
        const rejected = await db.query(statement, { allowError: true });
        assert.equal(rejected.sqlstate, '55000');
        assert.match(rejected.error, /WRITER_FENCED/);
      }
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.adopted)}`), A.a);
      await assertDenied(db, A.a, L.adopted);
    });

    await t.test('P09: authenticated seller cannot write adoption/runtime/gates, assume owner role or invoke the technical adoption capability', async () => {
      const before = await snapshot(db, L.adopted);
      await asActor(db, A.a, async () => {
        for (const statement of [
          `INSERT INTO private.crm_assignment_adoptions(lead_id) VALUES(${q(L.legacy)})`,
          `UPDATE private.crm_assignment_adoptions SET reason='forged' WHERE lead_id=${q(L.adopted)}`,
          `DELETE FROM private.crm_assignment_adoptions WHERE lead_id=${q(L.adopted)}`,
          `UPDATE private.crm_lead_runtime SET assignment_epoch=99 WHERE lead_id=${q(L.adopted)}`,
          `UPDATE private.crm_runtime_gates SET mode='observe' WHERE scope_key=${q(`lead:${L.adopted}`)}`,
          `SELECT private.crm_adopt_assignment_lead(${q(L.legacy)}::uuid,${q(randomUUID())}::uuid,${GATE_REVISION},'forged')`,
          'SET ROLE crm_runtime_owner',
        ]) assert.equal((await db.query(statement, { allowError: true })).sqlstate, '42501');
        // A intentionally has no business command handler and grants no user
        // gateway: this is a capability boundary, not full case16 payload proof.
        assert.equal((await db.query(`SELECT public.crm_submit_command('{"assignment_adopted":false,"actor_role":"admin"}'::jsonb)`, { allowError: true })).sqlstate, '42501');
      });
      assert.deepEqual(await snapshot(db, L.adopted), before);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_assignment_adoptions WHERE lead_id=${q(L.legacy)}`), '0');
    });

    await t.test('P10: actor metadata, arbitrary GUCs and request-header claims cannot remove the durable restriction', async () => {
      await asActor(db, A.a, async () => {
        try {
          await db.query(`SELECT set_config('crm.assignment_adopted','false',false),set_config('crm.actor_role','admin',false),
            set_config('request.jwt.claims','{"role":"service_role","actor_role":"admin","assignment_adopted":false}',false),
            set_config('request.headers','{"x-assignment-adopted":"false","x-actor-role":"admin"}',false)`);
          assert.equal(await db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.adopted)}::uuid)`), 'f');
          const rejected = await db.query(`SELECT public.set_whatsapp_conversation_mode(${q(L.adopted)}::uuid,'human')`, { allowError: true });
          assert.equal(rejected.sqlstate, 'P0001');
          assert.match(rejected.error, /No tenés permiso/);
        } finally {
          await db.query(`SELECT set_config('crm.assignment_adopted','',false),set_config('crm.actor_role','',false),set_config('request.headers','',false)`);
        }
      });
      await assertDenied(db, A.a, L.adopted);
    });

    await t.test('P11: inactive seller is denied on both legacy and adopted ownership', async () => {
      await assertDenied(db, A.inactive, L.inactiveLegacy);
      await adopt(db, L.inactiveRuntime);
      await assertDenied(db, A.inactive, L.inactiveRuntime);
    });

    await t.test('P12: adoption preserves active admin/supervisor behavior and does not touch M1 channel state or epoch', async () => {
      for (const actor of [A.admin, A.supervisor]) {
        assert.equal((await capability(db, actor, L.adopted)).can_manage, true);
        assert.equal((await modeRpc(db, actor, L.adopted, 'human')).ok, true);
        assert.equal((await snapshot(db, L.adopted)).events.at(-1).actor_user_id, actor);
      }
      assert.deepEqual((await snapshot(db, L.adopted)).conversation, adoptedConversation);
      await assertDenied(db, A.a, L.adopted);
    });

    await t.test('P13: real READ COMMITTED mode RPC holds the lead permission lock; technical adoption waits then revokes the old seller session', async () => {
      const seller = new PgSession('assignment-channel-rc-seller');
      const operator = new PgSession('assignment-channel-rc-adopter');
      let pending;
      try {
        await seller.query(`SET SESSION AUTHORIZATION authenticated; SELECT set_config('request.jwt.claim.sub',${q(A.a)},false)`);
        await seller.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        assert.equal((await seller.query(`SELECT public.set_whatsapp_conversation_mode(${q(L.readCommitted)}::uuid,'human')`)).ok, true);
        await operator.query('SET SESSION AUTHORIZATION postgres');
        pending = operator.query(`SELECT private.crm_adopt_assignment_lead(${q(L.readCommitted)}::uuid,${q(randomUUID())}::uuid,${GATE_REVISION},'RC serialized adoption')`, { allowError: true, timeout: 45000 * TIMEOUT_SCALE });
        await waitForLock(db, 'assignment-channel-rc-adopter');
        assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_assignment_adoptions WHERE lead_id=${q(L.readCommitted)}`), '0');
        await seller.query('COMMIT');
        const result = await pending;
        pending = null;
        assert.equal(result.ok, true, result.error);
        assert.equal(await seller.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.readCommitted)}::uuid)`), 'f');
        const rejected = await seller.query(`SELECT public.set_whatsapp_conversation_mode(${q(L.readCommitted)}::uuid,'ai')`, { allowError: true });
        assert.equal(rejected.sqlstate, 'P0001');
        assert.match(rejected.error, /No tenés permiso/);
        assert.equal((await snapshot(db, L.readCommitted)).control.mode, 'human');
      } finally {
        await seller.query('ROLLBACK', { allowError: true });
        if (pending) await pending;
        await seller.close();
        await operator.close();
      }
    });

    await t.test('P14: real old REPEATABLE READ snapshot cannot use the legacy mode RPC after adoption; serialization failure precedes channel writes', async () => {
      const seller = new PgSession('assignment-channel-rr-old-seller');
      try {
        await seller.query(`SET SESSION AUTHORIZATION authenticated; SELECT set_config('request.jwt.claim.sub',${q(A.a)},false)`);
        await seller.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        assert.equal(await seller.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.repeatable)}`), A.a);
        await adopt(db, L.repeatable);
        const before = await snapshot(db, L.repeatable);
        const rejected = await seller.query(`SELECT public.set_whatsapp_conversation_mode(${q(L.repeatable)}::uuid,'human')`, { allowError: true });
        assert.equal(rejected.sqlstate, '40001');
        await seller.query('ROLLBACK');
        assert.deepEqual(await snapshot(db, L.repeatable), before);
        assert.equal(await seller.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.repeatable)}::uuid)`), 'f');
        await assertDenied(db, A.a, L.repeatable);
        t.diagnostic(JSON.stringify({ stage: 'A_PREREQUISITE_ONLY', old_snapshot_isolation: 'repeatable read', actual_mode_rpc_sqlstate: rejected.sqlstate, provider_calls: 0, after_rollback_seller_denied: true }));
      } finally {
        await seller.query('ROLLBACK', { allowError: true });
        await seller.close();
      }
    });

    await t.test('P15: old REPEATABLE READ cannot truncate assignment history inserted and adopted after its snapshot', async () => {
      const stale = new PgSession('assignment-channel-rr-history-truncate');
      try {
        await stale.query('SET SESSION AUTHORIZATION postgres');
        await stale.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        assert.equal(await stale.scalar(`SELECT count(*) FROM public.lead_assignments WHERE lead_id=${q(L.transfer)}`), '0');
        await db.query(`INSERT INTO public.lead_assignments(lead_id,seller_user_id,assignment_type) VALUES(${q(L.transfer)},${q(A.a)},'manual')`);
        await adopt(db, L.transfer);
        assert.equal(await db.scalar(`SELECT count(*) FROM public.lead_assignments WHERE lead_id=${q(L.transfer)}`), '1');
        const rejected = await stale.query('TRUNCATE public.lead_assignments', { allowError: true });
        assert.equal(rejected.sqlstate, '55000');
        assert.match(rejected.error, /ASSIGNMENT_HISTORY_TRUNCATE_ISOLATION_UNSUPPORTED/);
        await stale.query('ROLLBACK');
        assert.equal(await db.scalar(`SELECT count(*) FROM public.lead_assignments WHERE lead_id=${q(L.transfer)}`), '1');
        await stale.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const serializable = await stale.query('TRUNCATE public.lead_assignments', { allowError: true });
        assert.equal(serializable.sqlstate, '55000');
        assert.match(serializable.error, /ASSIGNMENT_HISTORY_TRUNCATE_ISOLATION_UNSUPPORTED/);
      } finally {
        await stale.query('ROLLBACK', { allowError: true });
        await stale.close();
      }
    });

    await t.test('P16: PostgREST-style READ ONLY transaction can evaluate legacy and adopted helper/control SELECT policies', async () => {
      await asActor(db, A.a, async () => {
        await db.query('BEGIN READ ONLY');
        assert.equal(await db.scalar(`SELECT current_setting('transaction_read_only')`), 'on');
        assert.equal(await db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.legacy)}::uuid)`), 't');
        assert.equal(await db.scalar(`SELECT count(*) FROM public.whatsapp_conversation_controls WHERE lead_id=${q(L.legacy)}`), '1');
        assert.equal(await db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.adopted)}::uuid)`), 'f');
        assert.equal(await db.scalar(`SELECT count(*) FROM public.whatsapp_conversation_controls WHERE lead_id=${q(L.adopted)}`), '0');
        await db.query('COMMIT');
      });
    });
  } finally { await db.close(); }
});
