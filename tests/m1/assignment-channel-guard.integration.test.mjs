import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PgSession, sqlLiteral as q, TIMEOUT_SCALE } from './harness/pg-session.mjs';
import {
  ACTORS as A, LEADS as L, GATE_REVISION,
  installChannelBaselineAndCandidates, seedChannelData, asActor,
  capability, modeRpc, snapshot, adopt, assertDenied,
} from './harness/assignment-channel-fixture.mjs';

// The 23 requested channel cases require BOTH actual candidates A and B.
// Owner changes below go exclusively through crm_submit_command. They are not
// privileged UPDATE observations, fixture handler replacements or provider sends.
async function command(db, type, lead, payload) {
  const versions = await db.json(`SELECT jsonb_build_object(
    'lead_aggregate_version',r.aggregate_version,'assignment_epoch',r.assignment_epoch,
    'gates',(SELECT jsonb_agg(jsonb_build_object('domain',g.domain,'scope_key',g.scope_key,
      'writer_epoch',g.writer_epoch,'revision',g.revision,'contract_version',g.contract_version,'policy_version',g.policy_version))
      FROM private.crm_runtime_gates g WHERE g.domain='command_owner' AND g.scope_key=${q(`lead:${lead}`)}))
    FROM private.crm_lead_runtime r WHERE r.lead_id=${q(lead)}`);
  assert.ok(versions);
  assert.equal(versions.gates.length, 1);
  return {
    schema_version: 1, command_id: randomUUID(), command_type: type,
    idempotency_key: `guard-${randomUUID()}`, scope: { lead_id: lead },
    expected_versions: versions, payload,
    policy_version_seen: versions.gates[0].policy_version,
  };
}

async function submit(db, actor, envelope, allowError = false) {
  const result = await asActor(db, actor, () => db.query(`SELECT public.crm_submit_command(${q(JSON.stringify(envelope))}::jsonb)`, { allowError }));
  return { ...result, application: result.ok ? JSON.parse(result.rows[0][0]) : null };
}

async function transfer(db, lead, from, to) {
  const envelope = await command(db, 'TransferLead', lead, {
    from_seller_user_id: from, to_seller_user_id: to, reason: 'synthetic channel boundary transfer',
  });
  assert.equal((await submit(db, A.supervisor, envelope)).application.status, 'applied');
  assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(lead)}`), to);
  return envelope;
}

async function counts(db, lead) {
  return db.json(`SELECT jsonb_build_object(
    'assignments',(SELECT count(*) FROM public.lead_assignments WHERE lead_id=${q(lead)}),
    'events',(SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)}),
    'receipts',(SELECT count(*) FROM private.crm_command_receipts WHERE scope_key=${q(`lead:${lead}`)}),
    'owner',(SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(lead)}),
    'runtime',(SELECT to_jsonb(r) FROM private.crm_lead_runtime r WHERE lead_id=${q(lead)}))`);
}

test('Assignment channel guard: 23 real PostgreSQL cases using actual A+B commands, legacy mode RPC and control RLS', { timeout: 360000 * TIMEOUT_SCALE }, async t => {
  const db = new PgSession('assignment-channel-guard-observer');
  let initialBefore;
  let transferBefore;
  let adoptedBefore;
  let lastAck;
  try {
    await installChannelBaselineAndCandidates(db, 2, ['assignment-runtime/appraisal-overlay.sql']);
    assert.equal(await db.scalar(`SELECT has_function_privilege('authenticated','public.crm_submit_command(jsonb)','EXECUTE')`), 'f');
    await seedChannelData(db);
    // Explicit local test capability only. Installed product remains closed.
    await db.query('GRANT EXECUTE ON FUNCTION public.crm_submit_command(jsonb) TO authenticated');

    await t.test('G01: precutover legacy seller-owner retains real permission and mode RPC', async () => {
      assert.equal((await capability(db, A.a, L.legacy)).can_manage, true);
      assert.equal((await modeRpc(db, A.a, L.legacy, 'human')).ok, true);
      const observed = await snapshot(db, L.legacy);
      assert.equal(observed.control.mode, 'human');
      assert.equal(observed.control.taken_by_user_id, A.a);
      assert.equal(observed.events.length, 1);
      assert.equal(observed.adoption, null);
    });

    await t.test('G02: precutover seller-nonowner is denied by helper, actual control RLS and both mode RPC requests', async () => {
      await assertDenied(db, A.b, L.legacy);
    });

    await t.test('G03: active admin retains legacy mode RPC behavior', async () => {
      assert.equal((await capability(db, A.admin, L.legacy)).can_manage, true);
      assert.equal((await modeRpc(db, A.admin, L.legacy, 'ai')).ok, true);
      assert.equal((await snapshot(db, L.legacy)).events.at(-1).actor_user_id, A.admin);
    });

    await t.test('G04: active supervisor retains legacy mode RPC behavior', async () => {
      assert.equal((await capability(db, A.supervisor, L.legacy)).can_manage, true);
      assert.equal((await modeRpc(db, A.supervisor, L.legacy, 'human')).ok, true);
      assert.equal((await snapshot(db, L.legacy)).events.at(-1).actor_user_id, A.supervisor);
    });

    await t.test('G05: durable adopted seller-owner is denied even though ownership is unchanged', async () => {
      const prior = await snapshot(db, L.adopted);
      await adopt(db, L.adopted);
      adoptedBefore = await snapshot(db, L.adopted);
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.adopted)}`), A.a);
      assert.deepEqual(adoptedBefore.conversation, prior.conversation);
      assert.deepEqual(adoptedBefore.control, prior.control);
      await assertDenied(db, A.a, L.adopted);
    });

    await t.test('G06: real runtime AssignLead null→B grants commercial ownership without channel capability', async () => {
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.initial)}`), null);
      await adopt(db, L.initial);
      initialBefore = await snapshot(db, L.initial);
      const assign = await command(db, 'AssignLead', L.initial, { seller_user_id: A.b, reason: 'synthetic channel boundary initial assignment' });
      assert.equal((await submit(db, A.supervisor, assign)).application.status, 'applied');
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.initial)}`), A.b);
      await assertDenied(db, A.b, L.initial);
      assert.deepEqual(await snapshot(db, L.initial), initialBefore);
    });

    await t.test('G07: real runtime TransferLead A→B leaves new owner without channel capability', async () => {
      await adopt(db, L.transfer);
      transferBefore = await snapshot(db, L.transfer);
      await transfer(db, L.transfer, A.a, A.b);
      await assertDenied(db, A.b, L.transfer);
      assert.deepEqual(await snapshot(db, L.transfer), transferBefore);
    });

    await t.test('G08: old owner A remains unable to intervene after A→B', async () => {
      await assertDenied(db, A.a, L.transfer);
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.transfer)}`), A.b);
    });

    await t.test('G09: real B→A return transfer cannot restore A channel permission', async () => {
      await transfer(db, L.transfer, A.b, A.a);
      await assertDenied(db, A.a, L.transfer);
      await assertDenied(db, A.b, L.transfer);
      assert.deepEqual(await snapshot(db, L.transfer), transferBefore);
    });

    await t.test('G10: real AcknowledgeLeadAssignment cannot grant channel access or rewrite ownership', async () => {
      const owner = await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.transfer)}`);
      lastAck = await command(db, 'AcknowledgeLeadAssignment', L.transfer, {});
      assert.equal((await submit(db, A.a, lastAck)).application.status, 'applied');
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.transfer)}`), owner);
      await assertDenied(db, A.a, L.transfer);
      assert.deepEqual(await snapshot(db, L.transfer), transferBefore);
    });

    await t.test('G11: real commands preserve channel_authority; the restriction also works without a conversation-state row', async () => {
      for (const [lead, before] of [[L.initial, initialBefore], [L.transfer, transferBefore]]) {
        const after = await snapshot(db, lead);
        assert.equal(after.conversation.channel_authority, 'disabled');
        assert.deepEqual(after.conversation, before.conversation);
      }
      assert.equal((await snapshot(db, L.noConversation)).conversation, null);
      await adopt(db, L.noConversation);
      await assertDenied(db, A.a, L.noConversation);
      assert.equal((await snapshot(db, L.noConversation)).conversation, null);
    });

    await t.test('G12: authority_epoch remains exactly unchanged across Assign, Transfer, return Transfer and Acknowledge', async () => {
      for (const [lead, before] of [[L.initial, initialBefore], [L.transfer, transferBefore]]) {
        assert.equal(before.conversation.authority_epoch, 17);
        assert.equal((await snapshot(db, lead)).conversation.authority_epoch, before.conversation.authority_epoch);
      }
    });

    await t.test('G13: paused assignment gate cannot restore the seller capability of an adopted lead', async () => {
      await db.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE domain='command_owner' AND scope_key=${q(`lead:${L.transfer}`)}`);
      await assertDenied(db, A.a, L.transfer);
      await assertDenied(db, A.b, L.transfer);
      assert.deepEqual((await snapshot(db, L.transfer)).adoption, transferBefore.adoption);
    });

    await t.test('G14: real command retry and rollback preserve durable adoption without duplicate or leaked command effects', async () => {
      const before = await counts(db, L.transfer);
      const replay = (await submit(db, A.a, lastAck)).application;
      assert.equal(replay.status, 'replayed');
      assert.equal(replay.original_status, 'applied');
      assert.deepEqual(await counts(db, L.transfer), before);
      await db.query(`UPDATE private.crm_runtime_gates SET mode='authoritative',revision=revision+1 WHERE domain='command_owner' AND scope_key=${q(`lead:${L.transfer}`)}`);
      const rolledBack = await command(db, 'TransferLead', L.transfer, {
        from_seller_user_id: A.a, to_seller_user_id: A.b, reason: 'synthetic rollback after real command effects',
      });
      await asActor(db, A.supervisor, async () => {
        await db.query('BEGIN');
        assert.equal((await db.json(`SELECT public.crm_submit_command(${q(JSON.stringify(rolledBack))}::jsonb)`)).status, 'applied');
        assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.transfer)}`), A.b);
        await db.query('ROLLBACK');
      });
      assert.deepEqual(await counts(db, L.transfer), before, 'rolled back command must leave no owner/version/assignment/event/receipt effect');
      await db.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE domain='command_owner' AND scope_key=${q(`lead:${L.transfer}`)}`);
      assert.equal(await db.scalar(`SELECT mode FROM private.crm_runtime_gates WHERE domain='command_owner' AND scope_key=${q(`lead:${L.transfer}`)}`), 'paused');
      assert.deepEqual((await snapshot(db, L.transfer)).adoption, transferBefore.adoption);
      await assertDenied(db, A.a, L.transfer);
    });

    await t.test('G15: crm_lead_runtime row without adoption keeps legacy channel behavior despite gate metadata', async () => {
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_lead_runtime WHERE lead_id=${q(L.runtimeOnly)}`), '1');
      assert.equal((await snapshot(db, L.runtimeOnly)).adoption, null);
      assert.equal((await capability(db, A.a, L.runtimeOnly)).can_manage, true);
      assert.equal((await modeRpc(db, A.a, L.runtimeOnly, 'human')).ok, true);
    });

    await t.test('G16: real gateway rejects caller payloads that forge adoption or actor authority', async () => {
      const fakeAdopt = await command(db, 'TransferLead', L.runtimeOnly, {
        from_seller_user_id: A.a, to_seller_user_id: A.b, reason: 'forged adoption', assignment_adopted: true,
      });
      const before = await counts(db, L.runtimeOnly);
      const rejected = await submit(db, A.supervisor, fakeAdopt, true);
      assert.equal(rejected.application.status, 'rejected');
      assert.equal(rejected.application.error_code, 'INVALID_PAYLOAD');
      assert.deepEqual(await counts(db, L.runtimeOnly), before);
      assert.equal((await snapshot(db, L.runtimeOnly)).adoption, null);
      const fakeRemoval = await command(db, 'AcknowledgeLeadAssignment', L.transfer, { assignment_adopted: false, actor_role: 'admin' });
      const removal = (await submit(db, A.a, fakeRemoval, true)).application;
      assert.equal(removal.status, 'rejected');
      assert.equal(removal.error_code, 'INVALID_PAYLOAD');
      assert.deepEqual((await snapshot(db, L.transfer)).adoption, transferBefore.adoption);
      await assertDenied(db, A.a, L.transfer);
    });

    await t.test('G17: GUCs, forged JWT metadata and request headers cannot remove server-side adoption or forge role', async () => {
      await asActor(db, A.a, async () => {
        try {
          await db.query(`SELECT set_config('crm.assignment_adopted','false',false),set_config('crm.actor_role','admin',false),
            set_config('request.jwt.claims','{"role":"service_role","actor_role":"admin","assignment_adopted":false}',false),
            set_config('request.headers','{"x-assignment-adopted":"false","x-actor-role":"admin"}',false)`);
          assert.equal(await db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.transfer)}::uuid)`), 'f');
          assert.equal(await db.scalar(`SELECT count(*) FROM public.whatsapp_conversation_controls WHERE lead_id=${q(L.transfer)}`), '0');
          const denied = await db.query(`SELECT public.set_whatsapp_conversation_mode(${q(L.transfer)}::uuid,'human')`, { allowError: true });
          assert.equal(denied.sqlstate, 'P0001');
          assert.match(denied.error, /No tenés permiso/);
        } finally { await db.query(`SELECT set_config('crm.assignment_adopted','',false),set_config('crm.actor_role','',false),set_config('request.headers','',false)`); }
      });
    });

    await t.test('G18: real authenticated seller cannot mutate adoption, gate, assignment epochs or technical adoption capability', async () => {
      await asActor(db, A.a, async () => {
        for (const statement of [
          `INSERT INTO private.crm_assignment_adoptions(lead_id) VALUES(${q(L.legacy)})`,
          `UPDATE private.crm_assignment_adoptions SET reason='forged' WHERE lead_id=${q(L.transfer)}`,
          `DELETE FROM private.crm_assignment_adoptions WHERE lead_id=${q(L.transfer)}`,
          `UPDATE private.crm_lead_runtime SET assignment_epoch=99 WHERE lead_id=${q(L.transfer)}`,
          `UPDATE private.crm_runtime_gates SET mode='observe' WHERE scope_key=${q(`lead:${L.transfer}`)}`,
          `SELECT private.crm_adopt_assignment_lead(${q(L.legacy)}::uuid,${q(randomUUID())}::uuid,${GATE_REVISION},'forged')`,
          'SET ROLE crm_runtime_owner',
        ]) assert.equal((await db.query(statement, { allowError: true })).sqlstate, '42501');
      });
      assert.deepEqual((await snapshot(db, L.transfer)).adoption, transferBefore.adoption);
      await assertDenied(db, A.a, L.transfer);
    });

    await t.test('G19: active admin and supervisor preserve actual legacy management capability on adopted leads', async () => {
      for (const actor of [A.admin, A.supervisor]) {
        assert.equal((await capability(db, actor, L.adopted)).can_manage, true);
        assert.equal((await modeRpc(db, actor, L.adopted, 'human')).ok, true);
        assert.equal((await snapshot(db, L.adopted)).events.at(-1).actor_user_id, actor);
      }
      assert.deepEqual((await snapshot(db, L.adopted)).conversation, adoptedBefore.conversation);
      assert.deepEqual((await snapshot(db, L.adopted)).adoption, adoptedBefore.adoption);
      await assertDenied(db, A.a, L.adopted);
    });

    await t.test('G20: inactive seller remains denied on both legacy and adopted assigned leads', async () => {
      await assertDenied(db, A.inactive, L.inactiveLegacy);
      await adopt(db, L.inactiveRuntime);
      await assertDenied(db, A.inactive, L.inactiveRuntime);
    });

    await t.test('G21: an old authenticated seller session cannot intervene after a real ownership transfer commits', async () => {
      const oldSeller = new PgSession('assignment-channel-old-seller');
      try {
        await oldSeller.query(`SET SESSION AUTHORIZATION authenticated; SELECT set_config('request.jwt.claim.sub',${q(A.a)},false)`);
        assert.equal(await oldSeller.scalar('SELECT auth.uid()'), A.a);
        await db.query(`UPDATE private.crm_runtime_gates SET mode='authoritative',revision=revision+1 WHERE domain='command_owner' AND scope_key=${q(`lead:${L.transfer}`)}`);
        await transfer(db, L.transfer, A.a, A.b);
        assert.equal(await oldSeller.scalar('SELECT auth.uid()'), A.a);
        assert.equal(await oldSeller.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.transfer)}::uuid)`), 'f');
        assert.equal(await oldSeller.scalar(`SELECT count(*) FROM public.whatsapp_conversation_controls WHERE lead_id=${q(L.transfer)}`), '0');
        assert.equal((await oldSeller.query(`SELECT public.set_whatsapp_conversation_mode(${q(L.transfer)}::uuid,'human')`, { allowError: true })).sqlstate, 'P0001');
      } finally { await oldSeller.close(); }
    });

    await t.test('G22: direct legacy set_whatsapp_conversation_mode fails for adopted current owner without channel/control/event side effects', async () => {
      assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(L.transfer)}`), A.b);
      await assertDenied(db, A.b, L.transfer);
      assert.deepEqual(await snapshot(db, L.transfer), transferBefore);
    });

    await t.test('G23: helper and actual control/event RLS remain denied across repeated real owner changes; no field or permission silently regrants access', async () => {
      for (const [from, to] of [[A.b, A.a], [A.a, A.b]]) {
        await transfer(db, L.transfer, from, to);
        for (const actor of [A.a, A.b]) await assertDenied(db, actor, L.transfer);
        assert.deepEqual(await snapshot(db, L.transfer), transferBefore);
      }
      for (const actor of [A.a, A.b, A.admin, A.supervisor]) {
        await asActor(db, actor, async () => {
          await db.query('BEGIN READ ONLY');
          const management = [A.admin, A.supervisor].includes(actor);
          assert.equal(await db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(L.transfer)}::uuid)`), management ? 't' : 'f');
          assert.equal(await db.scalar(`SELECT count(*) FROM public.whatsapp_conversation_controls WHERE lead_id=${q(L.transfer)}`), management ? '1' : '0');
          await db.query('COMMIT');
        });
      }
      t.diagnostic(JSON.stringify({ cases: 23, assignment_path: 'actual public.crm_submit_command with candidates A+B', seller_channel_capability_after_owner_changes: false, actual_control_RLS_rows: 0, channel_authority: transferBefore.conversation.channel_authority, authority_epoch: transferBefore.conversation.authority_epoch, channel_state_unchanged: true, provider_calls: 0 }));
    });
  } finally { await db.close(); }
});
