import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { sqlLiteral as q, TIMEOUT_SCALE } from './pg-session.mjs';

export const ACTORS = {
  a: 'ca040000-0000-4000-8000-000000000001',
  b: 'ca040000-0000-4000-8000-000000000002',
  admin: 'ca040000-0000-4000-8000-000000000003',
  supervisor: 'ca040000-0000-4000-8000-000000000004',
  inactive: 'ca040000-0000-4000-8000-000000000005',
};
export const LEADS = {
  legacy: 'cb040000-0000-4000-8000-000000000001',
  runtimeOnly: 'cb040000-0000-4000-8000-000000000002',
  adopted: 'cb040000-0000-4000-8000-000000000003',
  noConversation: 'cb040000-0000-4000-8000-000000000004',
  inactiveLegacy: 'cb040000-0000-4000-8000-000000000005',
  inactiveRuntime: 'cb040000-0000-4000-8000-000000000006',
  initial: 'cb040000-0000-4000-8000-000000000007',
  transfer: 'cb040000-0000-4000-8000-000000000008',
  readCommitted: 'cb040000-0000-4000-8000-000000000009',
  repeatable: 'cb040000-0000-4000-8000-00000000000a',
};
export const POLICY = 'assignment-channel-fixture-v1';
export const GATE_REVISION = 4;
export const WRITER_EPOCH = 11;
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const fixtureUrl = name => new URL(`../fixtures/${name}`, import.meta.url);

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(k => k !== 'captured_at').sort().map(k => [k,
    k === 'acl' && typeof value[k] === 'string'
      ? '{' + value[k].slice(1, -1).split(',').sort().join(',') + '}'
      : canonical(value[k]),
  ]));
  return value;
}

export async function asActor(db, actor, callback) {
  await db.query('SET SESSION AUTHORIZATION authenticated');
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub',${q(actor)},false),set_config('request.jwt.claims','',false)`);
    assert.deepEqual((await db.query('SELECT current_user,session_user,auth.uid()')).rows, [['authenticated', 'authenticated', actor]]);
    return await callback();
  } finally {
    await db.query('ROLLBACK', { allowError: true });
    await db.query(`SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)`);
    await db.query('RESET SESSION AUTHORIZATION');
  }
}

export async function asMigrator(db, callback) {
  await db.query('SET SESSION AUTHORIZATION postgres');
  try {
    assert.equal(await db.scalar(`SELECT rolsuper FROM pg_roles WHERE rolname=current_user`), 'f');
    return await callback();
  } finally {
    await db.query('ROLLBACK', { allowError: true });
    await db.query('RESET SESSION AUTHORIZATION');
  }
}

export async function installChannelBaselineAndCandidates(db, expectedCandidateCount, extraOverlays = []) {
  assert.equal(await db.scalar(`SELECT current_setting('server_version_num')::integer/10000`), '17');
  assert.deepEqual((await db.query(`SELECT rolname,oid=10,rolsuper FROM pg_roles WHERE rolname IN ('supabase_admin','postgres') ORDER BY rolname`)).rows,
    [['postgres', 'f', 'f'], ['supabase_admin', 't', 't']]);
  assert.equal(await db.scalar(`SELECT current_setting('listen_addresses')`), '');
  assert.equal(await db.scalar('SELECT inet_server_addr() IS NULL'), 't');
  for (const name of ['profiles', 'leads']) assert.equal(await db.scalar(`SELECT count(*) FROM public.${name}`), '0');
  for (const overlay of ['assignment-boundary/overlay.sql', 'assignment-runtime/overlay.sql', 'assignment-runtime/channel-overlay.sql']) {
    await asMigrator(db, () => db.query(readFileSql(overlay), { timeout: 45000 * TIMEOUT_SCALE }));
  }
  for (const overlay of extraOverlays) {
    const sql = await readFile(fixtureUrl(overlay), 'utf8');
    await asMigrator(db, () => db.query(sql, { timeout: 45000 * TIMEOUT_SCALE }));
  }
  await db.query('SET search_path = public, extensions');
  const bytes = await readFile(fixtureUrl('assignment-runtime/channel-source.json'));
  const source = JSON.parse(bytes);
  const manifest = JSON.parse(await readFile(fixtureUrl('assignment-runtime/channel-manifest.json')));
  assert.equal(sha(bytes), manifest.source_sha256);
  assert.equal(sha(await readFile(fixtureUrl('assignment-runtime/channel-overlay.sql'))), manifest.overlay_sha256);
  assert.deepEqual(canonical(await db.json(source.query)), canonical(source.snapshot));
  const beforeGuard = await db.scalar(`SELECT pg_get_functiondef('private.current_user_can_manage_whatsapp(uuid)'::regprocedure)`);
  const modePropertiesSql = `SELECT jsonb_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,
    'definer',prosecdef,'arguments',pg_get_function_identity_arguments(oid),'result',pg_get_function_result(oid),'config',proconfig)
    FROM pg_proc WHERE oid='public.set_whatsapp_conversation_mode(uuid,text)'::regprocedure`;
  const modeProperties = canonical(await db.json(modePropertiesSql));
  const candidates = JSON.parse(process.env.M1_TEST_CANDIDATE_MIGRATIONS ?? '[]');
  assert.equal(candidates.length, expectedCandidateCount);
  assert.ok(process.env.M1_TEST_MIGRATION_DIR);
  for (const name of candidates) {
    assert.match(name, /^\d{14}_m1_assignment_[a-z_]+\.sql$/);
    const sql = await readFile(path.join(process.env.M1_TEST_MIGRATION_DIR, name), 'utf8');
    await asMigrator(db, () => db.query(sql, { timeout: 45000 * TIMEOUT_SCALE }));
  }
  assert.notEqual(await db.scalar(`SELECT pg_get_functiondef('private.current_user_can_manage_whatsapp(uuid)'::regprocedure)`), beforeGuard);
  // Candidate A adds a lead lock before the mode RPC's permission check while
  // retaining its signature, security context and observed effective grants.
  // The read-only helper remains usable in PostgREST GET transactions.
  assert.deepEqual(canonical(await db.json(modePropertiesSql)), modeProperties);
  for (const name of ['crm_assignment_adoptions', 'crm_runtime_gates', 'crm_lead_runtime', 'crm_conversation_state', 'crm_command_receipts', 'crm_events']) {
    assert.equal(await db.scalar(`SELECT count(*) FROM private.${name}`), '0', `${name} must be empty immediately after installation`);
  }
  return { source, candidates };
}

// Load SQL outside db.query: passing a Promise as SQL would invalidate the
// transport rather than exercise PostgreSQL.
const overlaySql = new Map();
for (const name of ['assignment-boundary/overlay.sql', 'assignment-runtime/overlay.sql', 'assignment-runtime/channel-overlay.sql']) {
  overlaySql.set(name, await readFile(fixtureUrl(name), 'utf8'));
}
function readFileSql(name) { return overlaySql.get(name); }

export async function seedChannelData(db) {
  const specs = [
    ['a', 'seller', 'TESTA1'], ['b', 'seller', 'TESTB2'], ['admin', 'admin', null],
    ['supervisor', 'supervisor', null], ['inactive', 'seller', 'TESTI3'],
  ];
  for (const [key, role, tiktok] of specs) {
    await db.query(`INSERT INTO public.user_invites(email,role,seller_code,tiktok_code,full_name)
      VALUES(${q(`channel-${key}@example.invalid`)},${q(role)},${q(`CHAN_${key.toUpperCase()}`)},${q(tiktok)},${q(`Synthetic channel ${key}`)});
      INSERT INTO auth.users(id,email) VALUES(${q(ACTORS[key])},${q(`channel-${key}@example.invalid`)});`);
  }
  let index = 0;
  for (const [key, id] of Object.entries(LEADS)) {
    const owner = key === 'initial' ? null : key.startsWith('inactive') ? ACTORS.inactive : ACTORS.a;
    await db.query(`INSERT INTO public.leads(id,customer_phone,customer_name,assigned_seller_user_id,assigned_at)
      VALUES(${q(id)},${q(`000000204${String(++index).padStart(3, '0')}`)},${q(`Synthetic channel lead ${key}`)},${q(owner)},${owner ? "'2026-09-17T12:00:00Z'" : 'null'});
      INSERT INTO public.whatsapp_conversation_controls(lead_id,mode) VALUES(${q(id)},'ai');`);
  }
  await db.query(`UPDATE public.profiles SET active=false WHERE user_id=${q(ACTORS.inactive)};
    INSERT INTO private.crm_runtime_policies(policy_version,policy_hash,snapshot,publisher_subject,baseline_manifest_id)
    SELECT ${q(POLICY)},encode(sha256(convert_to(s::text,'UTF8')),'hex'),s,'isolated-channel-test','assignment-channel-fixture/1'
    FROM (SELECT '{"project_ref":"isolated-assignment-channel"}'::jsonb s) policy;`);
  for (const [key, id] of Object.entries(LEADS)) {
    if (['legacy', 'inactiveLegacy'].includes(key)) continue;
    await db.query(`INSERT INTO private.crm_lead_runtime(lead_id,policy_version) VALUES(${q(id)},${q(POLICY)});
      INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
      VALUES('command_owner',${q(`lead:${id}`)},'authoritative',${WRITER_EPOCH},${GATE_REVISION},'assignment.v1',${q(POLICY)},'isolated-test','synthetic adoption gate','assignment-channel-fixture/1');`);
    if (key === 'noConversation') continue;
    await db.query(`INSERT INTO private.crm_conversation_state(project_ref,provider,provider_account_id,channel_address_id,participant_key,lead_id,link_state,authority_epoch,policy_version)
      VALUES('isolated-assignment-channel','synthetic','no-provider','no-channel',${q(`synthetic-${key}`)},${q(id)},'linked',17,${q(POLICY)});`);
  }
  assert.equal(await db.scalar(`SELECT count(*) FROM public.profiles`), '5');
  assert.equal(await db.scalar(`SELECT count(*) FROM public.leads`), '10');
  assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_assignment_adoptions`), '0');
}

export async function capability(db, actor, lead) {
  return asActor(db, actor, () => db.json(`SELECT jsonb_build_object(
    'can_manage',private.current_user_can_manage_whatsapp(${q(lead)}::uuid),
    'controls',(SELECT count(*) FROM public.whatsapp_conversation_controls WHERE lead_id=${q(lead)}),
    'events',(SELECT count(*) FROM public.whatsapp_conversation_events WHERE lead_id=${q(lead)}))`));
}

export async function modeRpc(db, actor, lead, mode, allowError = false) {
  return asActor(db, actor, () => db.query(`SELECT public.set_whatsapp_conversation_mode(${q(lead)}::uuid,${q(mode)})`, { allowError }));
}

export async function snapshot(db, lead) {
  return db.json(`SELECT jsonb_build_object(
    'control',(SELECT to_jsonb(c) FROM public.whatsapp_conversation_controls c WHERE lead_id=${q(lead)}),
    'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.whatsapp_conversation_events e WHERE lead_id=${q(lead)}),
    'conversation',(SELECT to_jsonb(c) FROM private.crm_conversation_state c WHERE lead_id=${q(lead)}),
    'adoption',(SELECT to_jsonb(a) FROM private.crm_assignment_adoptions a WHERE lead_id=${q(lead)}))`);
}

export async function adopt(db, lead, { operation = randomUUID(), revision = GATE_REVISION, reason = 'isolated controlled assignment adoption' } = {}) {
  const value = await asMigrator(db, () => db.json(`SELECT private.crm_adopt_assignment_lead(${q(lead)}::uuid,${q(operation)}::uuid,${revision},${q(reason)})`));
  return { value, operation, revision, reason };
}

export async function assertDenied(db, actor, lead) {
  const before = await snapshot(db, lead);
  assert.deepEqual(await capability(db, actor, lead), { can_manage: false, controls: 0, events: 0 });
  for (const mode of ['human', 'ai']) {
    const denied = await modeRpc(db, actor, lead, mode, true);
    assert.equal(denied.ok, false);
    assert.equal(denied.sqlstate, 'P0001');
    assert.match(denied.error, /No tenés permiso para intervenir esta conversación/);
  }
  assert.deepEqual(await snapshot(db, lead), before, 'rejected RPC must not modify controls, events, conversation or adoption');
}
