import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hashCommandIntent } from '../../supabase/functions/_shared/crm-runtime/contracts.mjs';
import { hashAssignmentCommandIntent } from '../../supabase/functions/_shared/crm-runtime/assignment-contracts.mjs';
import { PgSession, sqlLiteral as q, sqlJson, TIMEOUT_SCALE } from './harness/pg-session.mjs';

// Actual PostgreSQL acceptance, on captured legacy bodies. The runner supplies a
// fresh schema-B database plus only the three certified foundation migrations.
// This suite installs captured overlays and candidate migrations verbatim. No
// assignment/contact business function, trigger or permission predicate is replaced
// by a probe. Separate foundation regressions temporarily install its existing
// test-only synthetic hook, after proving the product hook is closed, and restore it.
const A = 'a104a000-0000-4000-8000-000000000001';
const B = 'a104a000-0000-4000-8000-000000000002';
const C = 'a104a000-0000-4000-8000-000000000003';
const SUPERVISOR = 'a104a000-0000-4000-8000-000000000004';
const SUPERVISOR2 = 'a104a000-0000-4000-8000-000000000005';
const ADMIN = 'a104a000-0000-4000-8000-000000000006';
const POLICY = 'assignment-runtime-acceptance-v1';
const HISTORICAL_ASSIGNED_AT = '2026-09-15T12:00:00Z';
const sha = value => createHash('sha256').update(value).digest('hex');
const source = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
let syntheticPhone = 104000000000;
const CORE_FUNCTIONS = ['crm_execute_command', 'crm_normalize_command', 'crm_canonical_json',
  'crm_json_keys', 'crm_json_integer', 'crm_foundation_actor', 'crm_foundation_scope', 'crm_apply_foundation_probe'];

async function coreDefinitions(db) {
  return db.json(`SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname=ANY(ARRAY[${CORE_FUNCTIONS.map(q).join(',')}])`);
}

async function asPostgres(db, callback) {
  await db.query('SET SESSION AUTHORIZATION postgres');
  try { return await callback(); }
  finally {
    await db.query('ROLLBACK', { allowError: true });
    await db.query('RESET SESSION AUTHORIZATION');
  }
}

async function beginActor(db, actor, { readOnly = false } = {}) {
  await db.query('SET SESSION AUTHORIZATION authenticated');
  await db.query(`BEGIN${readOnly ? ' READ ONLY' : ''}; SELECT set_config('request.jwt.claim.sub',${q(actor)},true),set_config('request.jwt.claims','',true)`);
  assert.deepEqual((await db.query('SELECT current_user,session_user,auth.uid()')).rows,
    [['authenticated', 'authenticated', actor]]);
}

async function finishActor(db, commit = true) {
  try {
    if (commit) await db.query('COMMIT');
    else await db.query('ROLLBACK', { allowError: true });
  } finally {
    await db.query('RESET SESSION AUTHORIZATION');
  }
}

async function asActor(db, actor, callback) {
  await beginActor(db, actor);
  try { const result = await callback(); await finishActor(db); return result; }
  catch (error) { await finishActor(db, false); throw error; }
}

async function submit(db, command, actor = SUPERVISOR) {
  return asActor(db, actor, () => db.json(`SELECT public.crm_submit_command(${sqlJson(command)})`));
}

async function state(db, lead) {
  return db.json(`SELECT to_jsonb(r) FROM private.crm_lead_runtime r WHERE lead_id=${q(lead)}`);
}

async function command(db, lead, type, payload) {
  const versions = await state(db, lead);
  const gate = await db.json(`SELECT jsonb_build_object('domain',domain,'scope_key',scope_key,
    'writer_epoch',writer_epoch,'revision',revision,'contract_version',contract_version,'policy_version',policy_version)
    FROM private.crm_runtime_gates WHERE domain='command_owner' AND scope_key=${q(`lead:${lead}`)}`);
  return { schema_version: 1, command_id: randomUUID(), command_type: type,
    idempotency_key: `assignment-intent-${randomUUID()}`, scope: { lead_id: lead },
    expected_versions: { lead_aggregate_version: versions.aggregate_version,
      assignment_epoch: versions.assignment_epoch, gates: [gate] },
    policy_version_seen: POLICY, payload };
}

async function transferCommand(db, lead, from = A, to = B) {
  return command(db, lead, 'TransferLead', {
    from_seller_user_id: from, to_seller_user_id: to, reason: 'Synthetic responsibility transfer',
  });
}

async function counts(db, lead, commandId) {
  return db.json(`SELECT jsonb_build_object(
    'assignments',(SELECT count(*) FROM public.lead_assignments WHERE lead_id=${q(lead)}),
    'events',(SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)}),
    'command_events',(SELECT count(*) FROM private.crm_events WHERE command_id=${q(commandId ?? null)}::uuid),
    'receipts',(SELECT count(*) FROM private.crm_command_receipts WHERE scope_key=${q(`lead:${lead}`)}),
    'owner',(SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(lead)}),
    'runtime',(SELECT to_jsonb(r) FROM private.crm_lead_runtime r WHERE lead_id=${q(lead)}))`);
}

async function snapshot(db, lead) {
  // Complete rows make future accidental clearing or timestamp rewriting visible.
  // Only lead ownership/provenance/updated_at are excluded; assigned_at is kept.
  return db.json(`SELECT jsonb_build_object(
    'lead',(SELECT to_jsonb(l)-'assigned_seller_user_id'-'assigned_by_user_id'-'updated_at' FROM public.leads l WHERE id=${q(lead)}),
    'crm',(SELECT to_jsonb(c) FROM public.lead_crm c WHERE lead_id=${q(lead)}),
    'sequences',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') FROM public.lead_contact_sequences s WHERE lead_id=${q(lead)}),
    'tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM public.lead_contact_tasks t WHERE lead_id=${q(lead)}),
    'quotes',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.sales_quotes x WHERE lead_id=${q(lead)}),
    'applications',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.commercial_applications x WHERE lead_id=${q(lead)}),
    'appraisals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.vehicle_appraisals x WHERE lead_id=${q(lead)}),
    'sale_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.lead_sale_requests x WHERE lead_id=${q(lead)}),
    'sales_cases',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.sales_cases x WHERE lead_id=${q(lead)}),
    'playbook',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.item_key),'[]') FROM public.lead_management_playbook_items x WHERE lead_id=${q(lead)}),
    'playbook_events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.lead_management_playbook_events x WHERE lead_id=${q(lead)}),
    'recall',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.lead_recall_items x WHERE lead_id=${q(lead)}),
    'channel',(SELECT to_jsonb(x) FROM private.crm_conversation_state x WHERE lead_id=${q(lead)}),
    'channel_control',(SELECT to_jsonb(x) FROM public.whatsapp_conversation_controls x WHERE lead_id=${q(lead)}),
    'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.lead_messages x WHERE lead_id=${q(lead)}),
    'channel_events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.whatsapp_conversation_events x WHERE lead_id=${q(lead)}))`);
}

async function activities(db, lead) {
  return db.json(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM public.lead_activities a WHERE lead_id=${q(lead)}`);
}

async function setupActors(db) {
  const roles = [[A, 'seller', 'M104A_A', 'TESTA1'], [B, 'seller', 'M104A_B', 'TESTB2'],
    [C, 'seller', 'M104A_C', 'TESTC3'], [SUPERVISOR, 'supervisor', 'M104A_S1', null],
    [SUPERVISOR2, 'supervisor', 'M104A_S2', null], [ADMIN, 'admin', 'M104A_AD', null]];
  for (const [id, role, code, tiktok] of roles) {
    const email = `${code.toLowerCase()}@example.invalid`;
    await db.query(`INSERT INTO public.user_invites(email,role,seller_code,tiktok_code,full_name)
      VALUES(${q(email)},${q(role)},${q(code)},${q(tiktok)},${q(`Synthetic ${code}`)});
      INSERT INTO auth.users(id,email) VALUES(${q(id)},${q(email)});`);
  }
  await db.query(`INSERT INTO private.crm_runtime_policies(policy_version,policy_hash,snapshot,publisher_subject,baseline_manifest_id)
    SELECT ${q(POLICY)},encode(sha256(convert_to(s::text,'UTF8')),'hex'),s,'isolated-acceptance','schema-B-plus-captured-assignment'
    FROM (SELECT '{"project_ref":"isolated-assignment-acceptance"}'::jsonb s) p`);
}

async function newLead(db, { owner = A, rich = false, phase = 'sena', financial = false } = {}) {
  const lead = randomUUID();
  await db.query(`INSERT INTO public.leads(id,customer_phone,customer_name,assigned_seller_user_id,assigned_by_user_id,assigned_at,metadata)
    VALUES(${q(lead)},${q(String(++syntheticPhone))},'Synthetic assignment lead',${q(owner)},${q(owner ? SUPERVISOR : null)},
      ${q(owner ? HISTORICAL_ASSIGNED_AT : null)}::timestamptz,'{"fixture":"assignment","facts":{"requested_model":"synthetic","evidence":"test-only"}}');`);
  if (rich) {
    // The acceptance fixture deliberately combines preserved commercial facts
    // with unfinished historical obligations. Real legacy CRM triggers cancel a
    // protocol when next_action/stage changes; establish the synthetic retained
    // obligations afterwards, without disabling or replacing those triggers.
    await db.query(`UPDATE public.lead_crm SET status=${q(phase)},priority='high',next_contact_at=now()+interval '2 days',
        next_contact_note='Keep the agreed follow-up',next_contact_source='manual',last_contact_at=now()-interval '1 day',last_contact_outcome='Historical conversation',
        interview_at=now()+interval '1 day',interview_location='Synthetic showroom',interview_mode='presencial',interview_operational_status='confirmed',
        interview_objective='Preserve appointment',final_objection='Historical closing objection',
        deposit_amount=125000,deposit_at=now()-interval '3 days',deposit_validation='Synthetic declared payment',
        post_deposit_action_at=now()+interval '3 days',post_deposit_action_status='scheduled',
        sale_confirmation_status='pending',sale_requested_at=now()-interval '1 hour',sale_requested_by=${q(A)},
        vehicle_sold='Synthetic retained offer',sale_amount=30000000,updated_by=${q(A)} WHERE lead_id=${q(lead)};
      INSERT INTO public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata)
      VALUES(${q(lead)},${q(A)},'contact','Historical activity by A','Must not become B history','{"synthetic":true}');
      UPDATE public.lead_contact_sequences SET status='active',completed_at=null,stopped_reason=''
      WHERE lead_id=${q(lead)};
      WITH ranked AS (SELECT id,row_number() OVER(ORDER BY sequence_order) n FROM public.lead_contact_tasks WHERE lead_id=${q(lead)})
      UPDATE public.lead_contact_tasks t SET status=CASE WHEN r.n=1 THEN 'completed' WHEN r.n=2 THEN 'skipped' WHEN r.n=3 THEN 'pending' ELSE 'scheduled' END,
        outcome=CASE WHEN r.n=1 THEN 'no_answer' WHEN r.n=2 THEN 'skipped' ELSE '' END,
        note=CASE WHEN r.n<3 THEN 'Synthetic historical task' ELSE '' END,
        completed_by=CASE WHEN r.n<3 THEN ${q(A)}::uuid ELSE null END,
        completed_at=CASE WHEN r.n<3 THEN now()-interval '2 hours' ELSE null END,
        performed_at=CASE WHEN r.n=1 THEN now()-interval '2 hours' ELSE null END,
        recorded_at=CASE WHEN r.n<3 THEN now()-interval '1 hour' ELSE null END
      FROM ranked r WHERE r.id=t.id;`);

    await asActor(db, owner, () => db.query(`INSERT INTO public.lead_management_playbook_items(lead_id,item_key,completed)
      VALUES(${q(lead)},'send_quote',true) ON CONFLICT(lead_id,item_key) DO UPDATE SET completed=true`));
  }
  if (financial) await seedFinancial(db, lead);
  return lead;
}

async function seedFinancial(db, lead) {
  const brand = randomUUID(), model = randomUUID(), campaign = randomUUID(), quote = randomUUID(), application = randomUUID();
  await db.query(`INSERT INTO public.brands(id,name,image_path) VALUES(${q(brand)},${q(`Synthetic ${brand}`)},'synthetic/no-egress.png');
    INSERT INTO public.models(id,brand_id,name,image_path,campaign_name) VALUES(${q(model)},${q(brand)},'Synthetic model','synthetic/no-egress.png','Synthetic campaign');
    INSERT INTO public.campaigns(id,model_id,plan_name,version_name,final_price,installment_count)
    VALUES(${q(campaign)},${q(model)},'Synthetic 70/30','Synthetic manual',30000000,84);
    INSERT INTO public.sales_quotes(id,quote_code,lead_id,seller_user_id,model_id,campaign_id,offer_type,customer_name,vehicle_version,sale_price,financed_amount,advance_amount,final_advance_amount,commercial_snapshot)
    VALUES(${q(quote)},${q(`GS-PRES-${quote.toUpperCase()}`)},${q(lead)},${q(A)},${q(model)},${q(campaign)},'savings_plan','Synthetic customer','Synthetic manual',30000000,21000000,9000000,9000000,
      '{"brand":"Synthetic","model":"Synthetic model","installmentCount":84,"accepted_price":30000000}');
    INSERT INTO public.commercial_applications(id,lead_id,campaign_id,seller_user_id,request_code,brand_name,model_name,campaign_name,
      first_name,last_name,document_type,document_number,cuil,birth_date,address,city_province,postal_code,marital_status,primary_phone,email,
      contact_schedule,employment_status,employer_name,employment_seniority,monthly_income,automatic_debit,deferred_installment,
      installments_paid,installments_to_pay,plan_type,agreed_price,terms_version,confirmed_at,commercial_snapshot)
    VALUES(${q(application)},${q(lead)},${q(campaign)},${q(A)},${q(`SYNTHETIC-${application}`)},'Synthetic','Synthetic model','Synthetic campaign',
      'Synthetic','Customer','DNI','12345678','20123456789','1990-01-01','Test address','Test city','0000','single','00000000001','fixture@example.invalid',
      'Synthetic hours','employed','Synthetic employer','2 years',1000000,false,false,1,83,'70/30',30000000,'synthetic-v1',now()-interval '1 hour','{"fixture":"preserved-datero"}');
    INSERT INTO public.lead_sale_requests(lead_id,seller_user_id,vehicle,sale_amount,notes,quote_id,provisional_application_id)
    VALUES(${q(lead)},${q(A)},'Synthetic vehicle',30000000,'Synthetic pending request',${q(quote)},${q(application)});`);
}

async function prepareRuntime(db, lead, { mode = 'authoritative', adopt = true, channel = true } = {}) {
  await db.query(`INSERT INTO private.crm_lead_runtime(lead_id,policy_version) VALUES(${q(lead)},${q(POLICY)});
    INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
    VALUES('command_owner',${q(`lead:${lead}`)},${q(mode)},7,3,'assignment.v1',${q(POLICY)},'isolated-test','Synthetic acceptance gate','isolated-assignment');`);
  if (channel) await db.query(`INSERT INTO private.crm_conversation_state(project_ref,provider,provider_account_id,channel_address_id,participant_key,lead_id,link_state,authority_epoch,policy_version)
    VALUES('isolated-assignment-acceptance','synthetic','no-provider','no-channel',${q(lead)},${q(lead)},'linked',17,${q(POLICY)});
    INSERT INTO public.whatsapp_conversation_controls(lead_id,mode) VALUES(${q(lead)},'ai') ON CONFLICT DO NOTHING;`);
  if (adopt) {
    const adoption = await asPostgres(db, () => db.json(`SELECT private.crm_adopt_assignment_lead(${q(lead)}::uuid,${q(randomUUID())}::uuid,3,'Synthetic isolated adoption')`));
    assert.equal(adoption.status, 'adopted');
  }
}

async function expectWaiting(db, application) {
  const deadline = Date.now() + 8000 * TIMEOUT_SCALE;
  while (Date.now() < deadline) {
    if (await db.scalar(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${q(application)} AND wait_event_type='Lock')`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Expected a real PostgreSQL lock wait: ${application}`);
}

function assertDenied(result, context) {
  assert.equal(result.ok, false, context);
  assert.match(`${result.sqlstate} ${result.error}`, /42501|FORBIDDEN|WRITER_FENCED|no (está asignado|corresponde)|Acceso no autorizado|No tenés permiso/i, context);
}

async function legacyTransferShape(db) {
  const lead = await newLead(db, { rich: true });
  const before = await snapshot(db, lead);
  await asActor(db, SUPERVISOR, () => db.query(`SELECT public.assign_lead_to_seller(${q(lead)}::uuid,${q(B)}::uuid)`));
  const after = await snapshot(db, lead);
  assert.equal(before.crm.status, 'sena');
  assert.equal(after.crm.status, 'nuevo');
  assert.equal(after.crm.deposit_amount, null);
  assert.equal(after.crm.next_contact_at, null);
  return { status: after.crm.status, priority: after.crm.priority, deposit_amount: after.crm.deposit_amount,
    next_contact_at: after.crm.next_contact_at, sequences: after.sequences.map(x => x.status).sort(),
    tasks: Object.fromEntries(['pending', 'scheduled', 'completed', 'skipped', 'cancelled'].map(status => [status, after.tasks.filter(x => x.status === status).length])) };
}

async function foundationContext(db) {
  const lead = await newLead(db);
  await db.query(`INSERT INTO private.crm_lead_runtime(lead_id,policy_version) VALUES(${q(lead)},${q(POLICY)})`);
  const gates = ['command_crm', 'command_owner'].map((domain, index) => ({ domain,
    scope_key: `lead:${lead}`, writer_epoch: 9 + index, revision: 2,
    contract_version: 'foundation-v1', policy_version: POLICY }));
  for (const gate of gates) await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
    VALUES(${q(gate.domain)},${q(gate.scope_key)},'ready',${gate.writer_epoch},2,'foundation-v1',${q(POLICY)},'isolated-test','Certified foundation compatibility','isolated-assignment')`);
  return { schema_version: 1, command_id: randomUUID(), command_type: 'FoundationProbe',
    idempotency_key: `post-candidate-foundation-${randomUUID()}`, scope: { lead_id: lead },
    expected_versions: { lead_aggregate_version: 0, assignment_epoch: 0, gates },
    payload: { operation_id: randomUUID(), value: 7 }, policy_version_seen: POLICY };
}

async function foundationCounts(db, lead) {
  return db.json(`SELECT jsonb_build_object(
    'effects',(SELECT count(*) FROM m1_fixture.probe_effects WHERE lead_id=${q(lead)}),
    'receipts',(SELECT count(*) FROM private.crm_command_receipts WHERE scope_key=${q(`lead:${lead}`)}),
    'events',(SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)}),
    'version',(SELECT aggregate_version FROM private.crm_lead_runtime WHERE lead_id=${q(lead)}))`);
}

test('M1-04A: actual assignment/transfer command acceptance (27 required cases)', { timeout: 480000 * TIMEOUT_SCALE }, async t => {
  const db = new PgSession('m104a-assignment-observer');
  let lead, before, after, historyBefore, transfer, transferResult, initialLead, initialCommand, legacyShape, certifiedCore, historicalReceipt;
  try {
    await asPostgres(db, async () => {
      for (const file of ['assignment-boundary/overlay.sql', 'assignment-runtime/overlay.sql', 'assignment-runtime/channel-overlay.sql', 'assignment-runtime/appraisal-overlay.sql']) {
        await db.query(await source(file), { timeout: 60000 * TIMEOUT_SCALE });
      }
    });
    await db.query('SET search_path = public, extensions');
    await setupActors(db);
    legacyShape = await legacyTransferShape(db);
    certifiedCore = await coreDefinitions(db);
    // A real certified closed-hook receipt predating A+B proves that adding proof
    // columns does not fabricate transaction provenance for historical receipts.
    await db.query('GRANT EXECUTE ON FUNCTION public.crm_submit_command(jsonb) TO authenticated');
    const preCandidateProbe = await foundationContext(db);
    assert.equal((await submit(db, preCandidateProbe, A)).error_code, 'COMMAND_NOT_IMPLEMENTED');
    await db.query('REVOKE EXECUTE ON FUNCTION public.crm_submit_command(jsonb) FROM authenticated');
    historicalReceipt = await db.json(`SELECT to_jsonb(r) FROM private.crm_command_receipts r WHERE command_id=${q(preCandidateProbe.command_id)}`);

    await t.test('A27: installing candidates changes no business rows, activates no gate and grants no API access', async () => {
      const existingLead = await newLead(db, { rich: true, financial: true });
      const untouched = await snapshot(db, existingLead);
      const untouchedGates = await db.json(`SELECT jsonb_agg(to_jsonb(g) ORDER BY domain,scope_key) FROM private.crm_runtime_gates g`);
      const files = JSON.parse(process.env.M1_TEST_CANDIDATE_MIGRATIONS ?? 'null');
      assert.ok(Array.isArray(files) && files.length === 2, 'runner must supply exactly candidates A and B');
      for (const file of files) {
        assert.match(file, /^\d{14}_m1_assignment_[a-z_]+\.sql$/);
        const bytes = await readFile(path.join(process.env.M1_TEST_MIGRATION_DIR, file));
        await asPostgres(db, () => db.query(bytes.toString(), { timeout: 60000 * TIMEOUT_SCALE }));
        t.diagnostic(JSON.stringify({ candidate: file, sha256: sha(bytes), installed_as: 'postgres', isolated_only: true }));
      }
      assert.deepEqual(await snapshot(db, existingLead), untouched);
      assert.deepEqual(await db.json(`SELECT jsonb_agg(to_jsonb(g) ORDER BY domain,scope_key) FROM private.crm_runtime_gates g`), untouchedGates);
      assert.equal(await db.scalar('SELECT count(*) FROM private.crm_assignment_adoptions'), '0');
      assert.equal(await db.scalar('SELECT count(*) FROM private.crm_command_receipts'), '1');
      const preservedReceipt = await db.json(`SELECT to_jsonb(r) FROM private.crm_command_receipts r WHERE command_id=${q(preCandidateProbe.command_id)}`);
      assert.equal(preservedReceipt.execution_xid, null);
      assert.equal(preservedReceipt.execution_backend_pid, null);
      assert.equal(preservedReceipt.assignment_effect_authorized, false);
      const { execution_xid, execution_backend_pid, assignment_effect_authorized, ...oldColumns } = preservedReceipt;
      assert.deepEqual(oldColumns, historicalReceipt);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await db.scalar(`SELECT has_function_privilege(${q(role)},'public.crm_submit_command(jsonb)','EXECUTE')`), 'f');
      }
    });

    await t.test('A26: inactive installation retains characterized legacy transfer reset; runtime gate inactive rejects', async () => {
      assert.deepEqual(await legacyTransferShape(db), legacyShape);
      // Test-only gateway access, never supplied by a product migration.
      await db.query('GRANT EXECUTE ON FUNCTION public.crm_submit_command(jsonb) TO authenticated');
      const inactiveLead = await newLead(db);
      await prepareRuntime(db, inactiveLead, { mode: 'observe', adopt: false });
      const protectedBefore = await snapshot(db, inactiveLead);
      const rejected = await submit(db, await transferCommand(db, inactiveLead));
      assert.notEqual(rejected.status, 'applied');
      assert.equal(rejected.error_code, 'ASSIGNMENT_NOT_ADOPTED');
      assert.deepEqual(await snapshot(db, inactiveLead), protectedBefore);
      assert.equal((await counts(db, inactiveLead)).owner, A);
      await asActor(db, SUPERVISOR, () => db.query(`SELECT public.assign_lead_to_seller(${q(inactiveLead)}::uuid,${q(B)}::uuid)`));
      assert.equal((await counts(db, inactiveLead)).owner, B);
      assert.equal((await state(db, inactiveLead)).aggregate_version, 0);
      assert.equal((await state(db, inactiveLead)).assignment_epoch, 0);
    });

    await t.test('A01: genuine initial assignment succeeds without creating a protocol or acquiring a channel', async () => {
      initialLead = await newLead(db, { owner: null });
      await prepareRuntime(db, initialLead, { channel: false });
      initialCommand = await command(db, initialLead, 'AssignLead', { seller_user_id: A, reason: 'Initial synthetic assignment' });
      assert.equal((await submit(db, initialCommand)).status, 'applied');
      const row = await db.json(`SELECT to_jsonb(l) FROM public.leads l WHERE id=${q(initialLead)}`);
      assert.equal(row.assigned_seller_user_id, A);
      assert.equal(row.assigned_by_user_id, SUPERVISOR);
      assert.ok(row.assigned_at);
      assert.equal(await db.scalar(`SELECT count(*) FROM public.lead_contact_sequences WHERE lead_id=${q(initialLead)}`), '0');
      assert.equal((await state(db, initialLead)).assignment_epoch, 1);
    });

    await t.test('A02: TransferLead A→B changes future owner with a valid versioned command', async () => {
      lead = await newLead(db, { rich: true, financial: true });
      await prepareRuntime(db, lead);
      before = await snapshot(db, lead);
      historyBefore = await activities(db, lead);
      assert.ok(before.tasks.some(x => x.status === 'completed'));
      assert.ok(before.tasks.some(x => x.status === 'skipped'));
      assert.ok(before.tasks.some(x => x.status === 'pending'));
      assert.ok(before.quotes.length && before.applications.length && before.sale_requests.length);
      assert.ok(before.playbook.some(x => x.completed && x.completed_by === A));
      assert.ok(before.playbook_events.some(x => x.actor_user_id === A));
      transfer = await transferCommand(db, lead);
      transferResult = await submit(db, transfer);
      assert.equal(transferResult.status, 'applied');
      after = await snapshot(db, lead);
      assert.equal((await counts(db, lead)).owner, B);
      assert.equal(await db.scalar(`SELECT assigned_by_user_id FROM public.leads WHERE id=${q(lead)}`), SUPERVISOR);
      assert.deepEqual(after, before, 'all protected business rows and timestamps must remain byte-equivalent as JSON');
    });

    await t.test('A03: Seña and Cierre stages survive transfer without becoming Nuevo', async () => {
      assert.equal(after.crm.status, 'sena');
      const closing = await newLead(db, { rich: true, phase: 'cierre' });
      await prepareRuntime(db, closing);
      const previous = await snapshot(db, closing);
      assert.equal((await submit(db, await transferCommand(db, closing))).status, 'applied');
      assert.deepEqual(await snapshot(db, closing), previous);
    });
    await t.test('A04: next action, its source and post-deposit appointment are preserved', () => {
      for (const key of ['next_contact_at', 'next_contact_note', 'next_contact_source', 'post_deposit_action_at', 'post_deposit_action_status']) assert.deepEqual(after.crm[key], before.crm[key]);
      assert.ok(after.crm.next_contact_at && after.crm.post_deposit_action_at);
    });
    await t.test('A05: interview facts and historical timestamps are preserved', () => {
      for (const key of ['interview_at', 'interview_location', 'interview_mode', 'interview_operational_status', 'interview_objective', 'last_contact_at', 'created_at', 'updated_at']) assert.deepEqual(after.crm[key], before.crm[key]);
    });
    await t.test('A06: deposit amount, effective date and validation are unchanged', () => {
      assert.equal(after.crm.deposit_amount, 125000);
      for (const key of ['deposit_amount', 'deposit_at', 'deposit_validation']) assert.deepEqual(after.crm[key], before.crm[key]);
    });
    await t.test('A07: active protocol IDs, started_at and historical seller survive intact', () => {
      assert.ok(before.sequences.some(x => x.status === 'active'));
      assert.deepEqual(after.sequences, before.sequences);
      assert.ok(after.sequences.every(x => x.seller_user_id === A));
    });
    await t.test('A08: historical tasks, actors, performed_at and existing activity rows are not reattributed', async () => {
      assert.deepEqual(after.tasks, before.tasks);
      const currentHistory = await activities(db, lead);
      for (const original of historyBefore) assert.deepEqual(currentHistory.find(x => x.id === original.id), original);
      assert.deepEqual(after.quotes, before.quotes);
      assert.deepEqual(after.applications, before.applications);
      assert.deepEqual(after.sale_requests, before.sale_requests);
    });
    await t.test('A09: transfer creates no protocol and cancels no existing task', () => {
      assert.equal(after.sequences.length, before.sequences.length);
      assert.deepEqual(after.tasks.map(x => [x.id, x.status]), before.tasks.map(x => [x.id, x.status]));
    });
    await t.test('A10: transfer has no start_lead_crm_cycle semantics or new cycle activity', async () => {
      const oldIds = new Set(historyBefore.map(x => x.id));
      const appended = (await activities(db, lead)).filter(x => !oldIds.has(x.id));
      assert.ok(appended.length > 0);
      assert.ok(appended.every(x => x.activity_type === 'assignment'));
      assert.ok(appended.every(x => !/nuevo ciclo/i.test(x.title)));
      assert.deepEqual(after.crm, before.crm);
      assert.deepEqual(after.playbook, before.playbook);
    });
    await t.test('A11: assignment_epoch increments exactly once', async () => {
      assert.equal((await state(db, lead)).assignment_epoch, transfer.expected_versions.assignment_epoch + 1);
    });
    await t.test('A12: aggregate_version increments exactly once under the command contract', async () => {
      assert.equal((await state(db, lead)).aggregate_version, transfer.expected_versions.lead_aggregate_version + 1);
    });
    await t.test('A13: exactly one assignment history row and command event identify the actual supervisor', async () => {
      const result = await counts(db, lead, transfer.command_id);
      assert.equal(result.assignments, 1);
      assert.equal(result.command_events, 1);
      assert.equal(await db.scalar(`SELECT actor_user_id FROM private.crm_events WHERE command_id=${q(transfer.command_id)}`), SUPERVISOR);
      assert.equal(await db.scalar(`SELECT request_hash FROM private.crm_command_receipts WHERE command_id=${q(transfer.command_id)}`), await hashAssignmentCommandIntent(transfer, `user:${SUPERVISOR}`));
    });
    await t.test('A14: retries/double click preserve one Assign and Transfer effect; changed destination conflicts', async () => {
      const previous = await counts(db, lead, transfer.command_id);
      assert.equal((await submit(db, transfer)).status, 'replayed');
      assert.equal((await submit(db, { ...transfer, command_id: randomUUID() })).status, 'replayed');
      assert.deepEqual(await counts(db, lead, transfer.command_id), previous);
      assert.equal((await submit(db, initialCommand)).status, 'replayed');
      const changed = await submit(db, { ...transfer, command_id: randomUUID(), payload: { ...transfer.payload, to_seller_user_id: C } });
      assert.equal(changed.error_code, 'IDEMPOTENCY_KEY_REUSED');
      assert.deepEqual(await counts(db, lead, transfer.command_id), previous);
    });
    await t.test('A15: former owner using an authenticated old identity cannot mutate an inherited pending task', async () => {
      const pending = before.tasks.find(x => x.status === 'pending');
      const stable = await snapshot(db, lead);
      const denied = await asActor(db, A, () => db.query(`SELECT public.record_contact_task_result(${q(pending.id)}::uuid,'no_answer','Old owner must fail',now())`, { allowError: true }));
      assertDenied(denied, 'old owner real legacy contact resolver');
      for (const sql of [
        `SELECT public.record_contact_answer_with_transition(${q(pending.id)}::uuid,'cierre','Old owner'::text,now()+interval '2 days','note','outcome',null::timestamptz,''::text,null::numeric,'normal',now(),null::text,''::text,null::text)`,
        `SELECT public.record_contact_answer_with_transition(p_task_id=>${q(pending.id)}::uuid,p_status=>'cierre',p_interview_operational_status=>null::text,p_note=>'Old owner',p_next_contact_at=>now()+interval '2 days')`,
      ]) assertDenied(await asActor(db, A, () => db.query(sql, { allowError: true })), 'old owner answer overload');
      assert.deepEqual(await snapshot(db, lead), stable);
    });
    await t.test('A16: B resolves the original pending task through the real RPC without rewriting task or sequence provenance', async () => {
      const pending = before.tasks.find(x => x.status === 'pending');
      const result = await asActor(db, B, () => db.json(`SELECT public.record_contact_task_result(${q(pending.id)}::uuid,'no_answer','Synthetic B resolution',now())`));
      assert.equal(result.lead_id, lead);
      const task = await db.json(`SELECT to_jsonb(t) FROM public.lead_contact_tasks t WHERE id=${q(pending.id)}`);
      assert.equal(task.id, pending.id);
      assert.equal(task.seller_user_id, A);
      assert.equal(task.completed_by, B);
      assert.equal(task.status, 'completed');
      const current = await snapshot(db, lead);
      for (const historical of before.tasks.filter(x => ['completed', 'skipped'].includes(x.status))) assert.deepEqual(current.tasks.find(x => x.id === historical.id), historical);
      assert.ok(current.sequences.every(x => x.seller_user_id === A));
      const deniedTransfer = await submit(db, await transferCommand(db, lead, B, C), B);
      assert.equal(deniedTransfer.error_code, 'FORBIDDEN_COMMAND');
    });
    await t.test('A17: TransferLead leaves channel authority unchanged', () => {
      assert.equal(before.channel.channel_authority, 'disabled');
      assert.deepEqual(after.channel, before.channel);
      assert.deepEqual(after.channel_control, before.channel_control);
    });
    await t.test('A18: TransferLead changes no channel authority_epoch', () => {
      assert.equal(after.channel.authority_epoch, 17);
      assert.equal(after.channel.authority_epoch, before.channel.authority_epoch);
    });
    await t.test('A19: adopted assignment cannot grant seller WhatsApp capability or mode RPC access', async () => {
      for (const seller of [A, B]) {
        assert.equal(await asActor(db, seller, () => db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(lead)}::uuid)`)), 'f');
        const denied = await asActor(db, seller, () => db.query(`SELECT public.set_whatsapp_conversation_mode(${q(lead)}::uuid,'human')`, { allowError: true }));
        assertDenied(denied, 'seller must not take the IA channel');
      }
      assert.equal((await snapshot(db, lead)).channel_control.mode, 'ai');
    });
    await t.test('A20: acknowledge is versioned/idempotent and changes neither owner nor assigned_at', async () => {
      const stable = await snapshot(db, lead), oldRuntime = await state(db, lead);
      const ack = await command(db, lead, 'AcknowledgeLeadAssignment', {});
      assert.equal((await submit(db, ack, B)).status, 'applied');
      assert.equal((await submit(db, ack, B)).status, 'replayed');
      const updated = await state(db, lead);
      assert.equal(updated.assignment_received_by, B);
      assert.ok(updated.assignment_received_at);
      assert.equal(updated.assignment_epoch, oldRuntime.assignment_epoch);
      assert.equal(updated.aggregate_version, oldRuntime.aggregate_version + 1);
      assert.equal((await counts(db, lead)).owner, B);
      assert.deepEqual(await snapshot(db, lead), stable);
      assert.equal((await submit(db, await command(db, lead, 'AcknowledgeLeadAssignment', {}), B)).error_code, 'ASSIGNMENT_ALREADY_ACKNOWLEDGED');
      assert.equal((await state(db, lead)).aggregate_version, updated.aggregate_version);
    });
    await t.test('A21: acknowledge does not fabricate handoff/obligations or change dialogue policy', async () => {
      assert.equal(await db.scalar(`SELECT to_regclass('private.crm_commercial_handoffs')`), null);
      assert.equal(await db.scalar(`SELECT to_regclass('private.crm_attention_obligations')`), null);
      const current = await snapshot(db, lead);
      assert.deepEqual(current.channel, before.channel);
      assert.deepEqual(current.channel_control, before.channel_control);
      assert.equal((await counts(db, lead)).assignments, 1);
    });
    await t.test('A22: two supervisors A→B versus A→C serialize in real sessions with one actionable loser', async () => {
      const raced = await newLead(db, { rich: true });
      await prepareRuntime(db, raced);
      const one = await transferCommand(db, raced, A, B), two = await transferCommand(db, raced, A, C);
      const first = new PgSession('m104a-transfer-first'), second = new PgSession('m104a-transfer-second');
      let waiting;
      try {
        await beginActor(first, SUPERVISOR);
        assert.equal((await first.json(`SELECT public.crm_submit_command(${sqlJson(one)})`)).status, 'applied');
        await beginActor(second, SUPERVISOR2);
        waiting = second.json(`SELECT public.crm_submit_command(${sqlJson(two)})`);
        await expectWaiting(db, 'm104a-transfer-second');
        await finishActor(first);
        const loser = await waiting;
        await finishActor(second);
        assert.equal(loser.error_code, 'VERSION_CONFLICT');
        const final = await counts(db, raced);
        assert.equal(final.owner, B);
        assert.equal(final.assignments, 1);
        assert.equal(final.events, 1);
        assert.equal(final.runtime.assignment_epoch, 1);
      } finally {
        await finishActor(first, false).catch(() => {});
        if (waiting) await waiting.catch(() => {});
        await finishActor(second, false).catch(() => {});
        await first.close(); await second.close();
      }
    });
    await t.test('A23: an old-owner real follow-up racing an uncommitted transfer cannot overwrite B', async () => {
      const raced = await newLead(db, { rich: true });
      await prepareRuntime(db, raced);
      const stable = await snapshot(db, raced), intent = await transferCommand(db, raced);
      const first = new PgSession('m104a-owner-transfer'), second = new PgSession('m104a-old-owner-edit');
      let editing;
      try {
        await beginActor(first, SUPERVISOR);
        assert.equal((await first.json(`SELECT public.crm_submit_command(${sqlJson(intent)})`)).status, 'applied');
        await beginActor(second, A);
        editing = second.query(`SELECT public.record_lead_follow_up(${q(raced)}::uuid,'sena','Old owner concurrent edit',
          now()+interval '4 days','Do not overwrite B','old owner',null,null,999999,'high')`, { allowError: true });
        await expectWaiting(db, 'm104a-old-owner-edit');
        await finishActor(first);
        const denied = await editing;
        await finishActor(second, false);
        assertDenied(denied, 'former owner concurrent follow-up');
        assert.equal((await counts(db, raced)).owner, B);
        assert.deepEqual(await snapshot(db, raced), stable);
      } finally {
        await finishActor(first, false).catch(() => {});
        if (editing) await editing.catch(() => {});
        await finishActor(second, false).catch(() => {});
        await first.close(); await second.close();
      }
    });
    await t.test('A24: target becoming inactive concurrently rejects atomically after a real profile lock wait', async () => {
      const raced = await newLead(db, { rich: true });
      await prepareRuntime(db, raced);
      const stable = await snapshot(db, raced), intent = await transferCommand(db, raced, A, C);
      const administrator = new PgSession('m104a-target-deactivation'), worker = new PgSession('m104a-transfer-inactive-target');
      let waiting;
      try {
        await administrator.query(`BEGIN; UPDATE public.profiles SET active=false WHERE user_id=${q(C)}`);
        await beginActor(worker, SUPERVISOR);
        waiting = worker.json(`SELECT public.crm_submit_command(${sqlJson(intent)})`);
        await expectWaiting(db, 'm104a-transfer-inactive-target');
        await administrator.query('COMMIT');
        const rejected = await waiting;
        await finishActor(worker);
        assert.equal(rejected.error_code, 'TARGET_SELLER_INACTIVE');
        assert.deepEqual(await snapshot(db, raced), stable);
        assert.equal((await counts(db, raced)).owner, A);
        assert.equal((await counts(db, raced)).assignments, 0);
      } finally {
        await administrator.query('ROLLBACK', { allowError: true }).catch(() => {});
        if (waiting) await waiting.catch(() => {});
        await finishActor(worker, false).catch(() => {});
        await administrator.close(); await worker.close();
        await db.query(`UPDATE public.profiles SET active=true WHERE user_id=${q(C)}`);
      }
    });
    await t.test('A25: adopted-domain legacy RPC/direct owner writers are characterized and actually fenced', async () => {
      const protectedBefore = await snapshot(db, lead);
      const single = await asActor(db, SUPERVISOR, () => db.query(`SELECT public.assign_lead_to_seller(${q(lead)}::uuid,${q(C)}::uuid)`, { allowError: true }));
      assertDenied(single, 'legacy single assignment');
      const bulk = await asActor(db, SUPERVISOR, () => db.query(`SELECT public.reassign_leads_to_seller(ARRAY[${q(lead)}::uuid],${q(C)}::uuid,'Synthetic fenced bulk')`, { allowError: true }));
      assertDenied(bulk, 'legacy bulk assignment');
      const direct = await asPostgres(db, () => db.query(`UPDATE public.leads SET assigned_seller_user_id=${q(C)} WHERE id=${q(lead)}`, { allowError: true }));
      assertDenied(direct, 'privileged legacy owner DML without a command capability');
      assert.equal((await counts(db, lead)).owner, B);
      assert.deepEqual(await snapshot(db, lead), protectedBefore);
    });

    // Additional concurrency/security cases from the request, reported separately
    // from the numbered 27 acceptance cases and the existing certified suites.
    await t.test('X01: B acknowledging an assignment not yet committed loses with an actionable version conflict', async () => {
      const raced = await newLead(db);
      await prepareRuntime(db, raced);
      const transferIntent = await transferCommand(db, raced), ack = await command(db, raced, 'AcknowledgeLeadAssignment', {});
      const first = new PgSession('m104a-ack-transfer'), second = new PgSession('m104a-ack-before-owner');
      let waiting;
      try {
        await beginActor(first, SUPERVISOR);
        assert.equal((await first.json(`SELECT public.crm_submit_command(${sqlJson(transferIntent)})`)).status, 'applied');
        waiting = submit(second, ack, B);
        await expectWaiting(db, 'm104a-ack-before-owner');
        await finishActor(first);
        assert.equal((await waiting).error_code, 'VERSION_CONFLICT');
        const runtime = await state(db, raced);
        assert.equal(runtime.assignment_received_at, null);
        assert.equal(runtime.assignment_received_by, null);
        assert.equal(runtime.assignment_epoch, 1);
        assert.equal(runtime.aggregate_version, 1);
        assert.equal((await counts(db, raced)).events, 1);
      } finally {
        await finishActor(first, false).catch(() => {});
        if (waiting) await waiting.catch(() => {});
        await first.close(); await second.close();
      }
    });
    await t.test('X02: simultaneous supervisor double click serializes the same key into one effect and a replay', async () => {
      const raced = await newLead(db);
      await prepareRuntime(db, raced);
      const intent = await transferCommand(db, raced), first = new PgSession('m104a-double-first'), second = new PgSession('m104a-double-second');
      let waiting;
      try {
        await beginActor(first, SUPERVISOR);
        const applied = await first.json(`SELECT public.crm_submit_command(${sqlJson(intent)})`);
        assert.equal(applied.status, 'applied');
        waiting = submit(second, { ...intent, command_id: randomUUID() });
        await expectWaiting(db, 'm104a-double-second');
        await finishActor(first);
        const replay = await waiting;
        assert.equal(replay.status, 'replayed');
        assert.deepEqual(replay.event_ids, applied.event_ids);
        const final = await counts(db, raced);
        assert.equal(final.assignments, 1); assert.equal(final.events, 1); assert.equal(final.receipts, 1);
        assert.equal(final.runtime.assignment_epoch, 1);
      } finally {
        await finishActor(first, false).catch(() => {});
        if (waiting) await waiting.catch(() => {});
        await first.close(); await second.close();
      }
    });
    await t.test('X03: retry from a new session after a committed response is lost returns the durable prior result', async () => {
      const raced = await newLead(db);
      await prepareRuntime(db, raced);
      const intent = await transferCommand(db, raced), lostConnection = new PgSession('m104a-response-lost');
      try {
        // The transport timeout is represented by discarding a successfully
        // committed response and closing the connection, not by undoing its TX.
        await submit(lostConnection, intent);
      } finally { await lostConnection.close(); }
      const beforeRetry = await counts(db, raced), retryConnection = new PgSession('m104a-retry-new-session');
      try { assert.equal((await submit(retryConnection, intent)).status, 'replayed'); }
      finally { await retryConnection.close(); }
      assert.deepEqual(await counts(db, raced), beforeRetry);
    });
    await t.test('X04: seller cannot self-assign, transfer, forge actor/assigned_by/epoch or acknowledge another owner', async () => {
      const unowned = await newLead(db, { owner: null });
      await prepareRuntime(db, unowned);
      const assign = await command(db, unowned, 'AssignLead', { seller_user_id: A, reason: 'Self-assignment forbidden' });
      assert.equal((await submit(db, assign, A)).error_code, 'FORBIDDEN_COMMAND');
      const actorForgery = await submit(db, { ...assign, command_id: randomUUID(), actor: { user_id: ADMIN, role: 'admin' } }, A);
      assert.equal(actorForgery.error_code, 'INVALID_ENVELOPE');
      for (const forged of [{ assigned_by_user_id: ADMIN }, { assignment_epoch: 1 }, { actor_user_id: ADMIN }]) {
        const response = await submit(db, { ...assign, command_id: randomUUID(), payload: { ...assign.payload, ...forged } }, A);
        assert.equal(response.error_code, 'INVALID_PAYLOAD');
      }
      const owned = await newLead(db);
      await prepareRuntime(db, owned);
      assert.equal((await submit(db, await transferCommand(db, owned), A)).error_code, 'FORBIDDEN_COMMAND');
      assert.equal((await submit(db, await command(db, owned, 'AcknowledgeLeadAssignment', {}), B)).error_code, 'FORBIDDEN_COMMAND');
      assert.equal((await counts(db, unowned)).owner, null);
      assert.equal((await counts(db, owned)).owner, A);
      assert.equal((await state(db, unowned)).assignment_epoch, 0);
      assert.equal((await state(db, owned)).assignment_epoch, 0);
    });
    await t.test('X05: old owner refresh_due_contact_protocols does not advance an adopted protocol still bearing historical A', async () => {
      const inherited = await newLead(db);
      await db.query(`UPDATE public.lead_contact_tasks SET due_start=now()-interval '3 hours',due_end=now()-interval '2 hours' WHERE lead_id=${q(inherited)}`);
      await prepareRuntime(db, inherited);
      assert.equal((await submit(db, await transferCommand(db, inherited))).status, 'applied');
      const stable = await snapshot(db, inherited);
      await asActor(db, A, () => db.query('SELECT public.refresh_due_contact_protocols()'));
      assert.deepEqual(await snapshot(db, inherited), stable);
    });
    await t.test('X06: adopted current-owner task/sequence/assignment reads work in a genuine read-only authenticated transaction', async () => {
      for (const actor of [A, B]) {
        await beginActor(db, actor, { readOnly: true });
        try {
          const visible = await db.json(`SELECT jsonb_build_object(
            'tasks',(SELECT count(*) FROM public.lead_contact_tasks WHERE lead_id=${q(lead)}),
            'sequences',(SELECT count(*) FROM public.lead_contact_sequences WHERE lead_id=${q(lead)}),
            'assignments',(SELECT count(*) FROM public.lead_assignments WHERE lead_id=${q(lead)}))`);
          assert.equal(visible.tasks, before.tasks.length);
          assert.equal(visible.sequences, before.sequences.length);
          if (actor === B) assert.equal(visible.assignments, 1);
          await finishActor(db);
        } catch (error) { await finishActor(db, false); throw error; }
      }
    });
    await t.test('X07: historical quote ownership does not let A mutate an adopted opportunity after transfer', async () => {
      const quoted = await newLead(db, { financial: true });
      await db.query(`UPDATE public.sales_quotes SET status='draft' WHERE lead_id=${q(quoted)}`);
      await prepareRuntime(db, quoted);
      assert.equal((await submit(db, await transferCommand(db, quoted))).status, 'applied');
      const stable = await snapshot(db, quoted);
      const denied = await asActor(db, A, () => db.query(`UPDATE public.sales_quotes SET status='cancelled' WHERE lead_id=${q(quoted)}`, { allowError: true }));
      assertDenied(denied, 'historical quote writer fenced by current opportunity owner');
      assert.match(denied.error, /ASSIGNMENT_CURRENT_OWNER_REQUIRED/);
      assert.deepEqual(await snapshot(db, quoted), stable);
    });
    await t.test('X08: real appraisal RPC passes its old owner check, then a committed transfer makes its eventual write fail atomically', async () => {
      const appraised = await newLead(db);
      const appraisalSql = note => `SELECT public.save_lead_vehicle_appraisal(${q(appraised)}::uuid,'Synthetic brand','Synthetic used model','Synthetic version',2020,50000,'good',${q(note)})`;
      await asActor(db, A, () => db.query(appraisalSql('Original appraisal retained')));
      await prepareRuntime(db, appraised);
      const stable = await snapshot(db, appraised), oldActivities = await activities(db, appraised);
      const rpcHash = await db.scalar(`SELECT encode(sha256(convert_to(pg_get_functiondef('public.save_lead_vehicle_appraisal(uuid,text,text,text,integer,integer,text,text)'::regprocedure),'UTF8')),'hex')`);
      // Synchronization only, not a replacement handler: INSERT ON CONFLICT runs
      // BEFORE INSERT guards before obtaining the conflicting appraisal-row lock.
      // An advisory barrier ordered before that guard therefore pauses the real
      // RPC after its initial authorization and before the final ownership check.
      await db.query(`CREATE FUNCTION private.m104a_test_appraisal_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $barrier$
        BEGIN IF NEW.lead_id=${q(appraised)}::uuid THEN PERFORM pg_catalog.pg_advisory_xact_lock(104004,88); END IF; RETURN NEW; END; $barrier$;
        CREATE TRIGGER a_m104a_test_appraisal_barrier BEFORE INSERT ON public.vehicle_appraisals FOR EACH ROW EXECUTE FUNCTION private.m104a_test_appraisal_barrier()`);
      const barrier = new PgSession('m104a-appraisal-barrier'), oldSeller = new PgSession('m104a-appraisal-old-owner');
      let editing;
      try {
        await barrier.query('BEGIN; SELECT pg_advisory_xact_lock(104004,88)');
        await beginActor(oldSeller, A);
        editing = oldSeller.query(appraisalSql('Stale A overwrite must roll back'), { allowError: true });
        await expectWaiting(db, 'm104a-appraisal-old-owner');
        assert.equal((await submit(db, await transferCommand(db, appraised))).status, 'applied');
        await barrier.query('ROLLBACK');
        const denied = await editing;
        await finishActor(oldSeller, false);
        assertDenied(denied, 'late appraisal mutation after old authorization');
        assert.match(denied.error, /ASSIGNMENT_CURRENT_OWNER_REQUIRED/);
        assert.deepEqual(await snapshot(db, appraised), stable);
        const currentActivities = await activities(db, appraised), oldIds = new Set(oldActivities.map(x => x.id));
        for (const historical of oldActivities) assert.deepEqual(currentActivities.find(x => x.id === historical.id), historical);
        assert.ok(currentActivities.filter(x => !oldIds.has(x.id)).every(x => x.activity_type === 'assignment'));
      } finally {
        await barrier.query('ROLLBACK', { allowError: true }).catch(() => {});
        if (editing) await editing.catch(() => {});
        await finishActor(oldSeller, false).catch(() => {});
        await barrier.close(); await oldSeller.close();
        await db.query('DROP TRIGGER a_m104a_test_appraisal_barrier ON public.vehicle_appraisals; DROP FUNCTION private.m104a_test_appraisal_barrier()');
      }
      assert.equal(await db.scalar(`SELECT encode(sha256(convert_to(pg_get_functiondef('public.save_lead_vehicle_appraisal(uuid,text,text,text,integer,integer,text,text)'::regprocedure),'UTF8')),'hex')`), rpcHash);
      await asActor(db, B, () => db.query(appraisalSql('Current B allowed commercial update')));
      const updated = (await snapshot(db, appraised)).appraisals;
      assert.equal(updated.length, 1);
      assert.equal(updated[0].notes, 'Current B allowed commercial update');
      assert.equal(updated[0].created_by, B);
    });

    await t.test('X09: Assign rejects orphan opportunities with a prior agenda, contact or inherited protocol/history', async () => {
      for (const evidence of ['agenda', 'contact', 'inherited_protocol']) {
        const orphan = await newLead(db, { owner: evidence === 'inherited_protocol' ? A : null });
        if (evidence === 'agenda') await db.query(`UPDATE public.lead_crm SET next_contact_at=now()+interval '2 days',next_contact_note='Prior agreed action' WHERE lead_id=${q(orphan)}`);
        if (evidence === 'contact') await db.query(`UPDATE public.lead_crm SET last_contact_at=now()-interval '1 day',last_contact_outcome='Prior conversation' WHERE lead_id=${q(orphan)}`);
        if (evidence === 'inherited_protocol') {
          await db.query(`INSERT INTO public.lead_assignments(lead_id,seller_user_id,assigned_by_user_id,assignment_type,reason)
            VALUES(${q(orphan)},${q(A)},${q(SUPERVISOR)},'manual','Synthetic historical assignment');
            UPDATE public.leads SET assigned_seller_user_id=null,assigned_by_user_id=null,assigned_at=null WHERE id=${q(orphan)}`);
          assert.ok(Number(await db.scalar(`SELECT count(*) FROM public.lead_contact_tasks WHERE lead_id=${q(orphan)}`)) > 0);
        }
        await prepareRuntime(db, orphan);
        const stable = await snapshot(db, orphan), oldState = await state(db, orphan), oldActivities = await activities(db, orphan);
        const history = await db.json(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM public.lead_assignments a WHERE lead_id=${q(orphan)}`);
        const intent = await command(db, orphan, 'AssignLead', { seller_user_id: B, reason: 'Must not reactivate an orphan' });
        const rejected = await submit(db, intent);
        assert.equal(rejected.status, 'rejected', evidence);
        assert.equal(rejected.error_code, 'ASSIGNMENT_NOT_ELIGIBLE', evidence);
        assert.deepEqual(await snapshot(db, orphan), stable, evidence);
        assert.deepEqual(await state(db, orphan), oldState, evidence);
        assert.deepEqual(await activities(db, orphan), oldActivities, evidence);
        assert.deepEqual(await db.json(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM public.lead_assignments a WHERE lead_id=${q(orphan)}`), history, evidence);
        const result = await counts(db, orphan, intent.command_id);
        assert.equal(result.owner, null, evidence);
        assert.equal(result.events, 0, evidence);
        assert.equal(result.receipts, 1, evidence);
      }
    });
    await t.test('X10: Transfer rejects terminal CRM stages and an administrative sales case without altering historical facts', async () => {
      for (const evidence of ['venta', 'desistir', 'invalido', 'sales_case']) {
        const terminal = await newLead(db);
        if (evidence === 'sales_case') {
          const request = randomUUID();
          await db.query(`INSERT INTO public.lead_sale_requests(id,lead_id,seller_user_id,vehicle,sale_amount)
            VALUES(${q(request)},${q(terminal)},${q(A)},'Synthetic administratively confirmed vehicle',30000000);
            UPDATE public.lead_sale_requests SET status='confirmed',reviewed_by=${q(SUPERVISOR)},reviewed_at=now() WHERE id=${q(request)}`);
          assert.equal(await db.scalar(`SELECT count(*) FROM public.sales_cases WHERE lead_id=${q(terminal)}`), '1');
          assert.equal(await db.scalar(`SELECT status FROM public.lead_crm WHERE lead_id=${q(terminal)}`), 'nuevo');
        } else {
          await db.query(`UPDATE public.lead_crm SET status=${q(evidence)},
            sale_confirmation_status=${q(evidence === 'venta' ? 'confirmed' : 'none')}
            WHERE lead_id=${q(terminal)}`);
        }
        await prepareRuntime(db, terminal);
        const stable = await snapshot(db, terminal), oldState = await state(db, terminal), oldActivities = await activities(db, terminal);
        const intent = await transferCommand(db, terminal), rejected = await submit(db, intent);
        assert.equal(rejected.status, 'rejected', evidence);
        assert.equal(rejected.error_code, 'ASSIGNMENT_NOT_ELIGIBLE', evidence);
        assert.deepEqual(await snapshot(db, terminal), stable, evidence);
        assert.deepEqual(await state(db, terminal), oldState, evidence);
        assert.deepEqual(await activities(db, terminal), oldActivities, evidence);
        const result = await counts(db, terminal, intent.command_id);
        assert.equal(result.owner, A, evidence);
        assert.equal(result.assignments, 0, evidence);
        assert.equal(result.events, 0, evidence);
        assert.equal(result.receipts, 1, evidence);
      }
    });
    await t.test('X11: an actual assignment-history INSERT failure rolls back owner/history/activity/runtime/receipt/event and permits the same-key retry', async () => {
      const interrupted = await newLead(db, { rich: true, financial: true });
      await prepareRuntime(db, interrupted);
      const intent = await transferCommand(db, interrupted), stable = await snapshot(db, interrupted);
      const oldLead = await db.json(`SELECT to_jsonb(l) FROM public.leads l WHERE id=${q(interrupted)}`);
      const oldActivities = await activities(db, interrupted), beforeFailure = await counts(db, interrupted, intent.command_id);
      // Isolated failpoint only: every product function/trigger remains installed.
      // AFTER INSERT proves the canonical owner UPDATE and history INSERT both
      // ran before the exception; PostgreSQL must roll the complete command back.
      await db.query(`CREATE FUNCTION private.m104a_test_assignment_history_failure() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $failpoint$
        BEGIN
          IF NEW.lead_id=${q(interrupted)}::uuid THEN
            IF (SELECT assigned_seller_user_id FROM public.leads WHERE id=NEW.lead_id) IS DISTINCT FROM ${q(B)}::uuid THEN
              RAISE EXCEPTION USING ERRCODE='P9997',MESSAGE='FIXTURE_OWNER_UPDATE_NOT_REACHED';
            END IF;
            RAISE EXCEPTION USING ERRCODE='P9998',MESSAGE='FIXTURE_ASSIGNMENT_HISTORY_FAILURE_AFTER_OWNER_UPDATE';
          END IF;
          RETURN NEW;
        END; $failpoint$;
        CREATE TRIGGER z_m104a_test_assignment_history_failure AFTER INSERT ON public.lead_assignments FOR EACH ROW EXECUTE FUNCTION private.m104a_test_assignment_history_failure()`);
      try {
        await assert.rejects(submit(db, intent), /P9998:.*FIXTURE_ASSIGNMENT_HISTORY_FAILURE_AFTER_OWNER_UPDATE/s);
        assert.deepEqual(await snapshot(db, interrupted), stable);
        assert.deepEqual(await db.json(`SELECT to_jsonb(l) FROM public.leads l WHERE id=${q(interrupted)}`), oldLead);
        assert.deepEqual(await activities(db, interrupted), oldActivities);
        assert.deepEqual(await counts(db, interrupted, intent.command_id), beforeFailure);
      } finally {
        await db.query('DROP TRIGGER z_m104a_test_assignment_history_failure ON public.lead_assignments; DROP FUNCTION private.m104a_test_assignment_history_failure()');
      }
      assert.equal((await submit(db, intent)).status, 'applied');
      const committed = await counts(db, interrupted, intent.command_id);
      assert.equal(committed.owner, B);
      assert.equal(committed.assignments, beforeFailure.assignments + 1);
      assert.equal(committed.command_events, 1);
      assert.equal(committed.receipts, 1);
      assert.equal(committed.runtime.assignment_epoch, beforeFailure.runtime.assignment_epoch + 1);
      assert.equal(committed.runtime.aggregate_version, beforeFailure.runtime.aggregate_version + 1);
      assert.deepEqual(await snapshot(db, interrupted), stable);
    });

    await t.test('F01 extra foundation: certified execution, normalization and canonical hash SQL remain byte-identical after A+B', async () => {
      assert.equal(Object.keys(certifiedCore).length, CORE_FUNCTIONS.length);
      assert.deepEqual(await coreDefinitions(db), certifiedCore);
      t.diagnostic(JSON.stringify({ certified_core_sha256: sha(JSON.stringify(certifiedCore)), compared_functions: CORE_FUNCTIONS }));
    });
    await t.test('F02 extra foundation: added authority stays private and runtime gains no broad legacy DML', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const table of ['crm_runtime_policies', 'crm_runtime_gates', 'crm_conversation_state', 'crm_lead_runtime', 'crm_command_receipts', 'crm_events', 'crm_assignment_adoptions']) {
          assert.equal(await db.scalar(`SELECT has_table_privilege(${q(role)},${q(`private.${table}`)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`), 'f');
        }
        assert.equal(await db.scalar(`SELECT pg_has_role(${q(role)},'crm_runtime_owner','MEMBER')`), 'f');
      }
      for (const table of ['leads', 'lead_crm', 'lead_contact_tasks', 'lead_contact_sequences', 'sales_quotes', 'commercial_applications', 'lead_sale_requests', 'sales_cases', 'vehicle_appraisals']) {
        assert.equal(await db.scalar(`SELECT has_table_privilege('crm_runtime_owner',${q(`public.${table}`)},'INSERT,UPDATE,DELETE,TRUNCATE')`), 'f', table);
      }
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE status='evaluating'`), '0');
    });

    // Reuse only the existing synthetic effect/failpoint DDL. Its original actor
    // seeds target a minimal schema; the real captured Auth/profile triggers and
    // actor rows above remain in use on this full schema-B regression.
    await db.query((await source('probe-support.sql')).split('INSERT INTO auth.users')[0]);
    const originalHook = await db.scalar(`SELECT pg_get_functiondef('private.crm_apply_foundation_probe(uuid,uuid,jsonb,jsonb)'::regprocedure)`);
    await t.test('F03 extra foundation: stock FoundationProbe remains compiled closed through the new public gateway', async () => {
      const probe = await foundationContext(db), response = await submit(db, probe, A);
      assert.equal(response.error_code, 'COMMAND_NOT_IMPLEMENTED');
      assert.deepEqual(await foundationCounts(db, probe.scope.lead_id), { effects: 0, receipts: 1, events: 0, version: 0 });
    });
    try {
      await db.query(await source('probe-handler.sql'));
      await t.test('F04 extra foundation: actual probe commits one effect/event/receipt, replays, rejects key conflict, and retains SQL/JS hash parity', async () => {
        const probe = await foundationContext(db), first = await submit(db, probe, A);
        assert.equal(first.status, 'applied');
        assert.equal((await submit(db, probe, A)).status, 'replayed');
        const replay = await submit(db, { ...probe, command_id: randomUUID() }, A);
        assert.equal(replay.status, 'replayed');
        assert.deepEqual(replay.event_ids, first.event_ids);
        assert.equal((await submit(db, { ...probe, command_id: randomUUID(), payload: { ...probe.payload, value: 8 } }, A)).error_code, 'IDEMPOTENCY_KEY_REUSED');
        assert.deepEqual(await foundationCounts(db, probe.scope.lead_id), { effects: 1, receipts: 1, events: 1, version: 1 });
        assert.equal(await db.scalar(`SELECT request_hash FROM private.crm_command_receipts WHERE command_id=${q(probe.command_id)}`), await hashCommandIntent(probe, `user:${A}`));
      });
      await t.test('F05 extra foundation: stale aggregate and assignment versions reject without a synthetic effect', async () => {
        for (const column of ['aggregate_version', 'assignment_epoch']) {
          const probe = await foundationContext(db);
          await db.query(`UPDATE private.crm_lead_runtime SET ${column}=1 WHERE lead_id=${q(probe.scope.lead_id)}`);
          assert.equal((await submit(db, probe, A)).error_code, 'VERSION_CONFLICT');
          assert.deepEqual(await foundationCounts(db, probe.scope.lead_id), { effects: 0, receipts: 1, events: 0, version: column === 'aggregate_version' ? 1 : 0 });
        }
      });
      await t.test('F06 extra foundation: exception after real SQL effect rolls back effect, receipt, event and aggregate atomically', async () => {
        const probe = await foundationContext(db);
        await db.query(`INSERT INTO m1_fixture.failpoints(operation_id,fail_after_effect) VALUES(${q(probe.payload.operation_id)},true)`);
        await assert.rejects(submit(db, probe, A), /P9999:.*FIXTURE_FAILURE_AFTER_EFFECT/s);
        assert.deepEqual(await foundationCounts(db, probe.scope.lead_id), { effects: 0, receipts: 0, events: 0, version: 0 });
      });
    } finally { await db.query(originalHook); }
    await t.test('F07 extra foundation: test hook is restored closed and no evaluating receipt or orphan event remains', async () => {
      assert.deepEqual(await coreDefinitions(db), certifiedCore);
      const probe = await foundationContext(db);
      assert.equal((await submit(db, probe, A)).error_code, 'COMMAND_NOT_IMPLEMENTED');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE status='evaluating'`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events e JOIN private.crm_command_receipts r USING(command_id) WHERE r.status<>'applied'`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts r WHERE status='applied' AND NOT EXISTS(SELECT 1 FROM private.crm_events e WHERE e.command_id=r.command_id)`), '0');
    });
    await t.test('F08 extra foundation: receipt execution proof is server-derived, terminally disabled and cannot be supplied through the API', async () => {
      const receipt = await db.json(`SELECT to_jsonb(r) FROM private.crm_command_receipts r WHERE command_id=${q(transfer.command_id)}`);
      assert.ok(receipt.execution_xid);
      assert.ok(receipt.execution_backend_pid > 0);
      assert.equal(receipt.assignment_effect_authorized, false);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE assignment_effect_authorized`), '0');
      const owned = await newLead(db);
      await prepareRuntime(db, owned);
      const intent = await transferCommand(db, owned);
      for (const proof of [{ execution_xid: receipt.execution_xid }, { execution_backend_pid: receipt.execution_backend_pid }, { assignment_effect_authorized: true }]) {
        assert.equal((await submit(db, { ...intent, command_id: randomUUID(), ...proof })).error_code, 'INVALID_ENVELOPE');
        assert.equal((await submit(db, { ...intent, command_id: randomUUID(), payload: { ...intent.payload, ...proof } })).error_code, 'INVALID_PAYLOAD');
      }
      assert.equal((await counts(db, owned)).assignments, 0);
    });
    await t.test('F09 extra foundation: receipt proof constraints reject invalid proof, duplicate active proof and undecided COMMIT', async () => {
      // Privileged fixture DML verifies table constraints. It does not claim a
      // database administrator lacks the trusted ability to alter private data.
      const prototype = await db.json(`SELECT to_jsonb(r) FROM private.crm_command_receipts r WHERE command_id=${q(transfer.command_id)}`);
      const insert = overrides => {
        const row = { ...prototype, command_id: randomUUID(), idempotency_key: `proof-${randomUUID()}`,
          status: 'evaluating', result: null, error_code: null, decided_at: null,
          assignment_effect_authorized: true, ...overrides };
        return `INSERT INTO private.crm_command_receipts SELECT (jsonb_populate_record(NULL::private.crm_command_receipts,
          ${sqlJson(row)} || jsonb_build_object('execution_xid',pg_current_xact_id()::text,'execution_backend_pid',pg_backend_pid())
          || ${sqlJson(Object.fromEntries(Object.entries(overrides).filter(([key]) => ['execution_xid', 'execution_backend_pid'].includes(key))))})).*`;
      };
      for (const overrides of [{ execution_xid: null }, { execution_backend_pid: null }, { execution_backend_pid: 0 },
        { command_type: 'FoundationProbe' }, { status: 'rejected', result: {}, error_code: 'SYNTHETIC', decided_at: new Date().toISOString() }]) {
        await db.query('BEGIN');
        try { assert.equal((await db.query(insert(overrides), { allowError: true })).sqlstate, '23514'); }
        finally { await db.query('ROLLBACK', { allowError: true }); }
      }
      await db.query('BEGIN');
      try {
        await db.query(insert({}));
        assert.equal((await db.query(insert({}), { allowError: true })).sqlstate, '23505');
      } finally { await db.query('ROLLBACK', { allowError: true }); }
      await db.query('BEGIN');
      await db.query(insert({}));
      const deniedCommit = await db.query('COMMIT', { allowError: true });
      assert.equal(deniedCommit.sqlstate, '23514');
      assert.match(deniedCommit.error, /CRM_RECEIPT_NOT_DECIDED_AT_COMMIT/);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE status='evaluating' OR assignment_effect_authorized`), '0');
    });
  } finally {
    await db.close();
  }
});
