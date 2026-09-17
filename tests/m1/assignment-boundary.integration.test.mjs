import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PgSession, sqlLiteral as q, TIMEOUT_SCALE } from './harness/pg-session.mjs';

// PASS here means an incompatible CURRENT permission coupling was observed.
// This suite does not implement or accept AssignLead/TransferLead, call a mode
// RPC, execute Edge Functions, or contact a provider. The runner creates a fresh
// B cluster, then applies only the three certified foundation migrations.
const fixture = new URL('./fixtures/assignment-boundary/', import.meta.url);
const sourceBytes = await readFile(new URL('source.json', fixture));
const source = JSON.parse(sourceBytes);
const manifest = JSON.parse(await readFile(new URL('manifest.json', fixture)));
const A = 'a1040000-0000-4000-8000-000000000001';
const B = 'a1040000-0000-4000-8000-000000000002';
const TRANSFER = 'b1040000-0000-4000-8000-000000000001';
const INITIAL = 'b1040000-0000-4000-8000-000000000002';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(k => k !== 'captured_at').sort().map(k => [k, canonical(value[k])]));
  return value;
}

async function asSeller(db, id, callback) {
  await db.query('SET SESSION AUTHORIZATION authenticated');
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub',${q(id)},false),set_config('request.jwt.claims','',false)`);
    assert.deepEqual((await db.query('SELECT current_user,session_user,auth.uid()')).rows, [['authenticated', 'authenticated', id]]);
    return await callback();
  } finally {
    await db.query(`SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)`);
    await db.query('RESET SESSION AUTHORIZATION');
  }
}

async function capability(db, seller, lead) {
  return asSeller(db, seller, () => db.json(`SELECT jsonb_build_object(
    'can_manage_whatsapp',private.current_user_can_manage_whatsapp(${q(lead)}::uuid),
    'lead_count',(SELECT count(*) FROM public.leads WHERE id=${q(lead)}),
    'control_count',(SELECT count(*) FROM public.whatsapp_conversation_controls WHERE lead_id=${q(lead)}))`));
}

async function channelSnapshot(db, lead) {
  return db.json(`SELECT jsonb_build_object(
    'private_state',(SELECT to_jsonb(s) FROM private.crm_conversation_state s WHERE lead_id=${q(lead)}),
    'legacy_control',(SELECT to_jsonb(c) FROM public.whatsapp_conversation_controls c WHERE lead_id=${q(lead)}))`);
}

async function observation(db, lead) {
  return {
    owner: await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(lead)}`),
    seller_b: await capability(db, B, lead),
    channel: await db.json(`SELECT jsonb_build_object('channel_authority',channel_authority,'dialogue_policy',dialogue_policy,'authority_epoch',authority_epoch) FROM private.crm_conversation_state WHERE lead_id=${q(lead)}`),
  };
}

test('DIAGNOSTIC: assignment grants existing WhatsApp capability despite unchanged disabled runtime channel (NOT M1-04A acceptance)', { timeout: 180000 * TIMEOUT_SCALE }, async t => {
  const db = new PgSession('m104a-assignment-boundary-diagnostic');
  let transferBefore;
  let initialBefore;
  let transferChannel;
  let initialChannel;
  try {
    await t.test('D00: captured helper, controls structure/ACL/RLS/triggers and real B identity are reproduced', async () => {
      assert.equal(sha(sourceBytes), manifest.source_sha256);
      const overlay = await readFile(new URL('overlay.sql', fixture));
      assert.equal(sha(overlay), manifest.overlay_sha256);
      assert.deepEqual((await db.query(`SELECT rolname,oid=10,rolsuper FROM pg_roles WHERE rolname IN ('supabase_admin','postgres') ORDER BY rolname`)).rows,
        [['postgres', 'f', 'f'], ['supabase_admin', 't', 't']]);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_conversation_state`), '0');
      assert.equal(await db.scalar(`SELECT to_regclass('public.whatsapp_conversation_controls')`), null);
      await db.query('SET SESSION AUTHORIZATION postgres');
      try {
        await db.query(overlay.toString(), { timeout: 45000 * TIMEOUT_SCALE });
      } finally {
        await db.query('ROLLBACK', { allowError: true });
        await db.query('RESET SESSION AUTHORIZATION');
      }
      await db.query('SET search_path = public, extensions');
      assert.deepEqual(canonical(await db.json(source.query)), canonical(source.snapshot));
      assert.deepEqual(canonical(await db.json(source.dependencies.query)), canonical(source.dependencies.snapshot));
      assert.equal(await db.scalar(`SELECT count(*) FROM public.whatsapp_conversation_controls`), '0');
    });

    await t.test('D01: synthetic invitations/users/leads and two actual disabled conversation rows are installed with legacy triggers enabled', async () => {
      await db.query(`INSERT INTO public.user_invites(email,role,seller_code,tiktok_code,full_name) VALUES
        ('m104a-a@example.invalid','seller','M104A_A','TESTA1','Synthetic Boundary A'),
        ('m104a-b@example.invalid','seller','M104A_B','TESTB2','Synthetic Boundary B');
        INSERT INTO auth.users(id,email) VALUES
        (${q(A)},'m104a-a@example.invalid'),(${q(B)},'m104a-b@example.invalid');
        INSERT INTO public.leads(id,customer_phone,customer_name,assigned_seller_user_id,assigned_at) VALUES
        (${q(TRANSFER)},'000000104001','Synthetic transfer lead',${q(A)},'2026-09-17T12:00:00Z'),
        (${q(INITIAL)},'000000104002','Synthetic initial assignment lead',null,null);
        INSERT INTO public.whatsapp_conversation_controls(lead_id,mode) VALUES (${q(TRANSFER)},'ai'),(${q(INITIAL)},'ai');
        INSERT INTO private.crm_runtime_policies(policy_version,policy_hash,snapshot,publisher_subject,baseline_manifest_id)
        SELECT 'assignment-boundary-v1',encode(sha256(convert_to(s::text,'UTF8')),'hex'),s,'isolated-diagnostic','B_plus_synthetic_boundary_data'
        FROM (SELECT '{"project_ref":"isolated-assignment-boundary"}'::jsonb s) policy;
        INSERT INTO private.crm_conversation_state(project_ref,provider,provider_account_id,channel_address_id,participant_key,lead_id,link_state,authority_epoch,policy_version)
        VALUES ('isolated-assignment-boundary','synthetic','no-provider','no-channel','synthetic-transfer',${q(TRANSFER)},'linked',17,'assignment-boundary-v1'),
        ('isolated-assignment-boundary','synthetic','no-provider','no-channel','synthetic-initial',${q(INITIAL)},'linked',23,'assignment-boundary-v1');`);
      assert.deepEqual((await db.query(`SELECT user_id,role,active FROM public.profiles ORDER BY user_id`)).rows,
        [[A, 'seller', 't'], [B, 'seller', 't']]);
      assert.equal(await db.scalar(`SELECT count(*) FROM public.lead_crm`), '2');
      assert.equal(await db.scalar(`SELECT count(*) FROM public.sales_cases`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_conversation_state WHERE channel_authority='disabled' AND dialogue_policy='paused'`), '2');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_trigger WHERE tgrelid='public.leads'::regclass AND NOT tgisinternal AND tgenabled<>'O'`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_trigger WHERE tgrelid='public.leads'::regclass AND tgname='leads_start_contact_sequence' AND tgenabled='O'`), '1');
      transferChannel = await channelSnapshot(db, TRANSFER);
      initialChannel = await channelSnapshot(db, INITIAL);
    });

    await t.test('D02: before owner change, target B has neither WhatsApp capability nor lead/control visibility', async () => {
      transferBefore = await observation(db, TRANSFER);
      initialBefore = await observation(db, INITIAL);
      assert.equal(transferBefore.owner, A);
      assert.equal(initialBefore.owner, null);
      for (const before of [transferBefore, initialBefore]) {
        assert.deepEqual(before.seller_b, { can_manage_whatsapp: false, lead_count: 0, control_count: 0 });
        assert.equal(before.channel.channel_authority, 'disabled');
        assert.equal(before.channel.dialogue_policy, 'paused');
      }
      assert.deepEqual(await capability(db, A, TRANSFER), { can_manage_whatsapp: true, lead_count: 1, control_count: 1 });
    });

    await t.test('D03: PASS_DIAGNOSTIC_OBSERVED_CONFLICT — A→B owner UPDATE grants B capability while actual channel row/epoch stay identical', async () => {
      // Privileged isolated observation of the existing owner field. This is
      // NOT TransferLead and deliberately retains the legacy cycle trigger.
      await db.query('SET SESSION AUTHORIZATION postgres');
      try {
        await db.query(`UPDATE public.leads SET assigned_seller_user_id=${q(B)} WHERE id=${q(TRANSFER)}`);
      } finally { await db.query('RESET SESSION AUTHORIZATION'); }
      const after = await observation(db, TRANSFER);
      assert.equal(after.owner, B);
      assert.deepEqual(after.seller_b, { can_manage_whatsapp: true, lead_count: 1, control_count: 1 });
      assert.deepEqual(after.channel, transferBefore.channel);
      assert.deepEqual(await channelSnapshot(db, TRANSFER), transferChannel);
      assert.deepEqual(await capability(db, A, TRANSFER), { can_manage_whatsapp: false, lead_count: 0, control_count: 0 });
      t.diagnostic(JSON.stringify({ classification: 'PASS_DIAGNOSTIC_OBSERVED_CONFLICT', operation: 'privileged_local_owner_update_A_to_B_NOT_TransferLead', before: transferBefore, after, actual_channel_row_unchanged: true, mode_rpc_called: false, provider_called: false }));
    });

    await t.test('D04: PASS_DIAGNOSTIC_OBSERVED_CONFLICT — null→B initial owner UPDATE has the same independent channel-permission coupling', async () => {
      await db.query('SET SESSION AUTHORIZATION postgres');
      try {
        await db.query(`UPDATE public.leads SET assigned_seller_user_id=${q(B)},assigned_at=now() WHERE id=${q(INITIAL)}`);
      } finally { await db.query('RESET SESSION AUTHORIZATION'); }
      const after = await observation(db, INITIAL);
      assert.equal(after.owner, B);
      assert.deepEqual(after.seller_b, { can_manage_whatsapp: true, lead_count: 1, control_count: 1 });
      assert.deepEqual(after.channel, initialBefore.channel);
      assert.deepEqual(await channelSnapshot(db, INITIAL), initialChannel);
      t.diagnostic(JSON.stringify({ classification: 'PASS_DIAGNOSTIC_OBSERVED_CONFLICT', operation: 'privileged_local_owner_update_null_to_B_NOT_AssignLead', before: initialBefore, after, actual_channel_row_unchanged: true, mode_rpc_called: false, provider_called: false }));
    });

    await t.test('D05: real authenticated role remains unable to access private runtime or activate the installed gateway', async () => {
      await asSeller(db, B, async () => {
        assert.equal((await db.query('SELECT * FROM private.crm_conversation_state', { allowError: true })).sqlstate, '42501');
        assert.equal((await db.query('SELECT public.crm_submit_command(null)', { allowError: true })).sqlstate, '42501');
      });
      for (const table of ['crm_runtime_gates', 'crm_command_receipts', 'crm_events']) {
        assert.equal(await db.scalar(`SELECT count(*) FROM private.${table}`), '0');
      }
      assert.equal(await db.scalar(`SELECT to_regprocedure('public.set_whatsapp_conversation_mode(uuid,text)')`), null);
      assert.equal(await db.scalar(`SELECT to_regclass('public.whatsapp_conversation_events')`), null);
      assert.equal(await db.scalar(`SELECT to_regclass('public.whatsapp_follow_up_reminders')`), null);
      assert.deepEqual(await channelSnapshot(db, TRANSFER), transferChannel);
      assert.deepEqual(await channelSnapshot(db, INITIAL), initialChannel);
    });
  } finally { await db.close(); }
});
