import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PgSession, sqlLiteral as q, sqlJson, TIMEOUT_SCALE } from './harness/pg-session.mjs';
import { normalizeContactNextActionCommandEnvelope, hashContactNextActionCommandIntent } from '../../supabase/functions/_shared/crm-runtime/contact-next-action-contracts.mjs';

// PostgreSQL acceptance only. The runner must provision a fresh, isolated schema-B
// database plus the three foundation migrations. Captured legacy functions are
// not replaced with success stubs. Every DB-B identifier executes actual SQL.
const A = 'b104b000-0000-4000-8000-000000000001';
const B = 'b104b000-0000-4000-8000-000000000002';
const C = 'b104b000-0000-4000-8000-000000000003';
const SUPERVISOR = 'b104b000-0000-4000-8000-000000000004';
const ADMIN = 'b104b000-0000-4000-8000-000000000005';
const POLICY = 'contact-acceptance-v1';
const DOMAIN = 'command_contact_next_action';
const TABLES = ['crm_contact_next_action_adoptions','crm_contact_runtime','crm_contact_facts','crm_next_actions','crm_contact_task_credits'];
let phone = 104100000000;
const sha = value => createHash('sha256').update(value).digest('hex');
const fixture = file => readFile(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');

async function postgres(db, fn) {
  await db.query('SET SESSION AUTHORIZATION postgres');
  try { return await fn(); }
  finally { await db.query('ROLLBACK', {allowError:true}); await db.query('RESET SESSION AUTHORIZATION'); }
}
async function begin(db, actor, isolation = '') {
  await db.query('SET SESSION AUTHORIZATION authenticated');
  await db.query(`BEGIN ${isolation}; SELECT set_config('request.jwt.claim.sub',${q(actor)},true),set_config('request.jwt.claims','',true)`);
  assert.equal(await db.scalar('SELECT auth.uid()'), actor);
}
async function finish(db, commit = true) {
  try { await db.query(commit ? 'COMMIT' : 'ROLLBACK', {allowError:!commit}); }
  finally { await db.query('RESET SESSION AUTHORIZATION'); }
}
async function actor(db, who, fn, isolation = '') {
  await begin(db,who,isolation);
  try { const value = await fn(); await finish(db); return value; }
  catch (error) { await finish(db,false); throw error; }
}
async function legacyDml(db,sql,who=A,{allowError=false}={}){
  return postgres(db,async()=>{
    await db.query(`BEGIN; SELECT set_config('request.jwt.claim.sub',${q(who)},true),set_config('request.jwt.claims','',true)`);
    const result=await db.query(sql,{allowError});
    await db.query(result.ok?'COMMIT':'ROLLBACK');return result;
  });
}
const submit = (db, command, who=A) => actor(db,who,()=>db.json(`SELECT public.crm_submit_command(${sqlJson(command)})`));
const executeOpen = (db, command) => db.json(`SELECT public.crm_submit_command(${sqlJson(command)})`);
const row = (db, table, lead) => db.json(`SELECT to_jsonb(x) FROM private.${table} x WHERE lead_id=${q(lead)}`);
const runtime = (db,lead) => row(db,'crm_lead_runtime',lead);
const contact = (db,lead) => row(db,'crm_contact_runtime',lead);
const applied = result => assert.equal(result.status,'applied',JSON.stringify(result));
function rejected(result, codes = null) {
  assert.notEqual(result.status,'applied',JSON.stringify(result));
  assert.notEqual(result.status,'replayed',JSON.stringify(result));
  assert.ok(result.error_code,JSON.stringify(result));
  if(codes) assert.ok([].concat(codes).includes(result.error_code),JSON.stringify(result));
}
function sqlDenied(result) {
  assert.equal(result.ok,false,JSON.stringify(result));
  assert.match(`${result.sqlstate} ${result.error}`,/42501|55000|23514|23503|P0001|FENCED|METADATA_REQUIRED|IMMUTABLE|APPEND_ONLY|FORBIDDEN|PROTECTED|BOUNDARY/);
}
async function gate(db, lead, domain=DOMAIN) {
  return db.json(`SELECT jsonb_build_object('domain',domain,'scope_key',scope_key,'writer_epoch',writer_epoch,
    'revision',revision,'contract_version',contract_version,'policy_version',policy_version)
    FROM private.crm_runtime_gates WHERE domain=${q(domain)} AND scope_key=${q(`lead:${lead}`)}`);
}
async function command(db,lead,type,payload) {
  const r=await runtime(db,lead), c=await contact(db,lead);
  return {schema_version:1,command_id:randomUUID(),command_type:type,idempotency_key:`contact-${randomUUID()}`,
    scope:{lead_id:lead},expected_versions:{lead_aggregate_version:r.aggregate_version,assignment_epoch:r.assignment_epoch,
      contact_revision:c?.contact_revision??0,next_action_revision:c?.next_action_revision??0,protocol_revision:c?.protocol_revision??0,
      gates:[await gate(db,lead)]},policy_version_seen:POLICY,payload};
}
async function assignment(db,lead,type='TransferLead',from=A,to=B) {
  const r=await runtime(db,lead);
  return {schema_version:1,command_id:randomUUID(),command_type:type,idempotency_key:`assignment-${randomUUID()}`,
    scope:{lead_id:lead},expected_versions:{lead_aggregate_version:r.aggregate_version,assignment_epoch:r.assignment_epoch,
      gates:[await gate(db,lead,'command_owner')]},policy_version_seen:POLICY,
    payload:type==='AcknowledgeLeadAssignment'?{}:{from_seller_user_id:from,to_seller_user_id:to,reason:'Synthetic transfer'}};
}
async function time(db, interval='0 seconds') {
  return db.scalar(`SELECT to_char(clock_timestamp()+${q(interval)}::interval,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
}
async function tasks(db,lead) {
  return db.json(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY sequence_order),'[]') FROM public.lead_contact_tasks t WHERE lead_id=${q(lead)}`);
}
async function counts(db,lead) {
  return db.json(`SELECT jsonb_build_object('facts',(SELECT count(*) FROM private.crm_contact_facts WHERE lead_id=${q(lead)}),
    'credits',(SELECT count(*) FROM private.crm_contact_task_credits WHERE lead_id=${q(lead)}),
    'actions',(SELECT count(*) FROM private.crm_next_actions WHERE lead_id=${q(lead)}),
    'events',(SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)}),
    'receipts',(SELECT count(*) FROM private.crm_command_receipts WHERE scope_key=${q(`lead:${lead}`)}),
    'activities',(SELECT count(*) FROM public.lead_activities WHERE lead_id=${q(lead)}),
    'runtime',(SELECT to_jsonb(x) FROM private.crm_lead_runtime x WHERE lead_id=${q(lead)}),
    'contact',(SELECT to_jsonb(x) FROM private.crm_contact_runtime x WHERE lead_id=${q(lead)}))`);
}
async function protectedSnapshot(db,lead) {
  return db.json(`SELECT jsonb_build_object(
    'lead',(SELECT to_jsonb(l)-'updated_at'-'do_not_contact'-'do_not_contact_at'-'do_not_contact_reason' FROM public.leads l WHERE id=${q(lead)}),
    'crm',(SELECT to_jsonb(c)-'next_contact_at'-'next_contact_note'-'next_contact_source'-'last_contact_at'-'last_contact_outcome'-'updated_at'-'updated_by' FROM public.lead_crm c WHERE lead_id=${q(lead)}),
    'channel',(SELECT to_jsonb(x) FROM private.crm_conversation_state x WHERE lead_id=${q(lead)}),
    'control',(SELECT to_jsonb(x) FROM public.whatsapp_conversation_controls x WHERE lead_id=${q(lead)}),
    'recall',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.lead_recall_items x WHERE lead_id=${q(lead)}),
    'sales',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.sales_cases x WHERE lead_id=${q(lead)}),
    'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.lead_messages x WHERE lead_id=${q(lead)}),
    'reminders',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.whatsapp_follow_up_reminders x WHERE lead_id=${q(lead)}))`);
}
async function newLead(db,{owner=A,phase='nuevo',windows='open',rich=false,unknown=false}={}) {
  const id=randomUUID();
  await db.query(`INSERT INTO public.leads(id,customer_phone,customer_name,assigned_seller_user_id,assigned_by_user_id,assigned_at,metadata)
    VALUES(${q(id)},${q(String(++phone))},'Synthetic B contact fixture',${q(owner)},${q(SUPERVISOR)},now()-interval '1 day','{"fixture":"contact-runtime","synthetic":true}');`);
  if(phase!=='nuevo'||rich) await db.query(`UPDATE public.lead_crm SET status=${q(phase)},
    next_contact_at=CASE WHEN ${q(phase)}='en_proceso' THEN now()+interval '2 days' ELSE null END,
    interview_at=${rich?"now()+interval '1 day'":"null"},interview_location=${q(rich?'Synthetic appointment':'')},
    deposit_amount=${rich?'50000':'null'},deposit_at=${rich?"now()-interval '1 day'":"null"},
    vehicle_sold=${q(rich?'Synthetic offer':'')},sale_amount=${rich?'30000000':'null'} WHERE lead_id=${q(id)}`);
  if(windows!=='original'&&phase!=='en_proceso') await db.query(`UPDATE public.lead_contact_sequences SET status='active',completed_at=null WHERE lead_id=${q(id)};
    UPDATE public.lead_contact_tasks SET due_start=now()-interval '10 minutes'+coalesce(floor((call_attempt-1)/2.0),0)*interval '1 second',
      due_end=now()+${q(windows==='expired'?'-1 minute':windows==='expiring'?'2 seconds':'1 hour')}::interval+coalesce(floor((call_attempt-1)/2.0),0)*interval '1 millisecond',
      status=CASE WHEN sequence_order=1 THEN 'pending' ELSE 'scheduled' END,outcome='',completed_at=null,completed_by=null,
      performed_at=null,recorded_at=null WHERE lead_id=${q(id)}`);
  if(unknown) await db.query(`UPDATE public.lead_contact_tasks SET status='completed',outcome='no_answer',completed_at=now()-interval '2 minutes',
    completed_by=${q(A)},performed_at=now()-interval '3 minutes',recorded_at=now()-interval '2 minutes'
    WHERE lead_id=${q(id)} AND sequence_order=1`);
  return id;
}
async function setupActors(db) {
  for(const [id,role,code] of [[A,'seller','B_SELL_A'],[B,'seller','B_SELL_B'],[C,'seller','B_SELL_C'],[SUPERVISOR,'supervisor','B_SUP'],[ADMIN,'admin','B_ADMIN']]){
    const email=`${code.toLowerCase()}@example.invalid`;
    await db.query(`INSERT INTO public.user_invites(email,role,seller_code,full_name) VALUES(${q(email)},${q(role)},${q(code)},${q(code)});
      INSERT INTO auth.users(id,email) VALUES(${q(id)},${q(email)})`);
  }
  await db.query(`INSERT INTO private.crm_runtime_policies(policy_version,policy_hash,snapshot,publisher_subject,baseline_manifest_id)
    SELECT ${q(POLICY)},encode(sha256(convert_to(s::text,'UTF8')),'hex'),s,'isolated-test','contact-schema-B'
    FROM (SELECT '{"project_ref":"isolated-contact-acceptance","paused_restriction":"contact_next_action.v1"}'::jsonb s) x`);
}
async function prepareA(db,lead,{adopt=true}={}) {
  await db.query(`INSERT INTO private.crm_lead_runtime(lead_id,policy_version) VALUES(${q(lead)},${q(POLICY)});
    INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
    VALUES('command_owner',${q(`lead:${lead}`)},'authoritative',7,3,'assignment.v1',${q(POLICY)},'isolated','Synthetic fixture','contact-schema-B');
    INSERT INTO private.crm_conversation_state(project_ref,provider,provider_account_id,channel_address_id,participant_key,lead_id,link_state,authority_epoch,policy_version)
    VALUES('isolated-contact-acceptance','synthetic','none','none',${q(lead)},${q(lead)},'linked',17,${q(POLICY)});
    INSERT INTO public.whatsapp_conversation_controls(lead_id,mode) VALUES(${q(lead)},'ai') ON CONFLICT DO NOTHING`);
  if(adopt) appliedAdoption(await postgres(db,()=>db.json(`SELECT private.crm_adopt_assignment_lead(${q(lead)},${q(randomUUID())},3,'Synthetic isolated A adoption')`)));
}
function appliedAdoption(value){ assert.equal(value.status,'adopted',JSON.stringify(value)); }
async function prepareB(db,lead,{adopt=true,mode='authoritative'}={}) {
  await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
    VALUES(${q(DOMAIN)},${q(`lead:${lead}`)},${q(mode)},11,5,'contact_next_action.v1',${q(POLICY)},'isolated','Synthetic fixture','contact-schema-B')`);
  if(adopt) appliedAdoption(await postgres(db,()=>db.json(`SELECT private.crm_adopt_contact_lead(${q(lead)},${q(randomUUID())},5,'Synthetic isolated B adoption')`)));
}
async function ready(db,options={}) {const lead=await newLead(db,options);await prepareA(db,lead);await prepareB(db,lead);return lead;}
async function lateContext(db){
  const lead=await ready(db,{windows:'expiring'}),task=(await tasks(db,lead))[0],occurred_at=await time(db);
  assert.ok(new Date(occurred_at)<new Date(task.due_end),'fixture must capture actual execution before its real deadline');
  await db.query(`SELECT pg_sleep(greatest(0,extract(epoch FROM (${q(task.due_end)}::timestamptz-clock_timestamp())))+0.025)`);
  return {lead,task,occurred_at};
}
async function fact(db,lead,{task=null,outcome='no_answer',channel='call',...extra}={}) {
  return {variant:'record',fact_id:randomUUID(),channel,fact_kind:'outbound_attempt',outcome,occurred_at:await time(db),note:'Synthetic manual attestation',
    ...(task?{task_ref:{task_id:task.id,sequence_id:task.sequence_id}}:{}),...extra};
}
async function nextAction(db,{sequence=null,...extra}={}) {
  return {action_id:randomUUID(),due_at:await time(db,'2 days'),timezone:'America/Argentina/Buenos_Aires',channel:'call',
    note:'Synthetic follow-up',reason:'Explicit client commitment',...(sequence?{protocol_replacement:{sequence_id:sequence,disposition:'replace'}}:{}),...extra};
}
async function schedule(db,lead,extra={}) {
  const pending=(await tasks(db,lead)).find(x=>['pending','scheduled'].includes(x.status));
  const payload=await nextAction(db,{sequence:pending?.sequence_id,...extra});
  applied(await submit(db,await command(db,lead,'ScheduleNextAction',payload)));
  return db.json(`SELECT to_jsonb(x) FROM private.crm_next_actions x WHERE action_id=${q(payload.action_id)}`);
}
const getContext=(db,lead,who=A)=>actor(db,who,()=>db.json(`SELECT public.crm_read_contact_work_context(${q(lead)})`),'READ ONLY');
async function waitLock(db,name){
  const deadline=Date.now()+12000*TIMEOUT_SCALE;
  while(Date.now()<deadline){
    if(await db.scalar(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${q(name)} AND wait_event_type='Lock')`)==='t')return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error(`No observed PostgreSQL lock wait for ${name}`);
}
async function migrate(db,file,{fail=false}={}){
  const bytes=await readFile(path.join(process.env.M1_TEST_MIGRATION_DIR,file));
  return postgres(db,async()=>{
    const result=await db.query(bytes.toString(),{allowError:true,timeout:60000*TIMEOUT_SCALE});
    if(fail){assert.equal(result.ok,false,`Expected dependency failure for ${file}`);await db.query('ROLLBACK');}
    else assert.equal(result.ok,true,`${file}: ${JSON.stringify(result)}`);
    return {file,sha256:sha(bytes),result};
  });
}

test('M1-04B: 80 PostgreSQL acceptance scenarios, isolated synthetic data only',{timeout:1200000*TIMEOUT_SCALE},async t=>{
  const db=new PgSession('m104b-observer');
  const files=JSON.parse(process.env.M1_TEST_CANDIDATE_MIGRATIONS??'null');
  assert.ok(Array.isArray(files)&&files.length===5,'Runner must supply A2+B3 candidates');
  const bfiles=files.slice(2);
  let installationFailed=false;
  const caseTest=(id,title,fn)=>t.test(`DB-B${String(id).padStart(2,'0')}: ${title}`,async()=>{
    try { await fn(); }
    catch(error) { if(id<=5) installationFailed=true; throw error; }
  });
  try{
    await postgres(db,async()=>{
      for(const file of ['assignment-boundary/overlay.sql','assignment-runtime/overlay.sql','assignment-runtime/channel-overlay.sql','assignment-runtime/appraisal-overlay.sql','contact-runtime/legacy-writers-overlay.sql'])
        await db.query(await fixture(file),{timeout:60000*TIMEOUT_SCALE});
    });
    for(const file of files.slice(0,2)) await migrate(db,file);
    await db.query('SET search_path=public,extensions');
    await setupActors(db);

    // Installation scenarios intentionally run 02 and 03 before 01. IDs retain
    // the plan mapping; execution order demonstrates genuinely incomplete states.
    await caseTest(2,'missing dependencies and wrong order roll back without B authority',async()=>{
      for(const file of [bfiles[2],bfiles[1]]){
        await migrate(db,file,{fail:true});
        assert.equal(await db.scalar("SELECT to_regclass('private.crm_contact_next_action_adoptions')"),null);
      }
      await db.query('ALTER TABLE public.lead_crm RENAME TO fixture_held_crm');
      try{await migrate(db,bfiles[0],{fail:true});}
      finally{await db.query('ALTER TABLE public.fixture_held_crm RENAME TO lead_crm');}
      assert.equal(await db.scalar("SELECT to_regclass('private.crm_contact_next_action_adoptions')"),null);
    });
    await caseTest(3,'each installation prefix is closed and adopts no business row',async()=>{
      const legacy=await newLead(db),before=await protectedSnapshot(db,legacy);
      for(const file of bfiles){
        if(file===bfiles[1]){
          // A real wrong signature must fail the fenced-baseline preflight. The
          // captured body is restored by rename, never replaced with a test stub.
          await db.query('ALTER FUNCTION public.complete_contact_task(uuid,text,text) RENAME TO fixture_held_complete_contact_task');
          try{await migrate(db,file,{fail:true});}
          finally{await db.query('ALTER FUNCTION public.fixture_held_complete_contact_task(uuid,text,text) RENAME TO complete_contact_task');}
        }
        const evidence=await migrate(db,file);t.diagnostic(JSON.stringify({...evidence,result:undefined}));
        assert.equal(await db.scalar('SELECT count(*) FROM private.crm_contact_next_action_adoptions'),'0');
        assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_runtime_gates WHERE domain=${q(DOMAIN)} AND mode='authoritative'`),'0');
        for(const role of ['anon','authenticated','service_role']) assert.equal(await db.scalar(`SELECT has_function_privilege(${q(role)},'public.crm_submit_command(jsonb)','EXECUTE')`),'f');
        assert.deepEqual(await protectedSnapshot(db,legacy),before);
      }
    });
    await caseTest(1,'complete ordered installation has validated PostgreSQL catalogs',async()=>{
      assert.equal(await db.scalar("SELECT current_setting('server_version_num')::int/10000"),'17');
      for(const signature of ['private.crm_normalize_contact_command(jsonb)','private.crm_execute_contact_command(jsonb)','private.crm_apply_contact_command(uuid,uuid)','private.crm_adopt_contact_lead(uuid,uuid,bigint,text)','public.crm_read_contact_work_context(uuid)'])
        assert.equal(await db.scalar(`SELECT to_regprocedure(${q(signature)}) IS NOT NULL`),'t',signature);
      for(const table of TABLES){
        assert.equal(await db.scalar(`SELECT count(*) FROM pg_constraint WHERE conrelid=${q(`private.${table}`)}::regclass AND NOT convalidated`),'0');
        assert.equal(await db.scalar(`SELECT count(*) FROM pg_index WHERE indrelid=${q(`private.${table}`)}::regclass AND (NOT indisvalid OR NOT indisready)`),'0');
        assert.ok(Number(await db.scalar(`SELECT count(*) FROM pg_constraint WHERE conrelid=${q(`private.${table}`)}::regclass`))>0);
      }
      assert.ok(Number(await db.scalar("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'crm_%contact%'"))>=5);
    });
    await caseTest(4,'owner role, memberships, fixed search paths and closed definer functions',async()=>{
      assert.deepEqual((await db.query("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='crm_runtime_owner'")).rows,[['f','f','f']]);
      assert.equal(await db.scalar("SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname='crm_runtime_owner' AND (inherit_option OR set_option)"),'0');
      for(const table of TABLES) assert.equal(await db.scalar(`SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=${q(`private.${table}`)}::regclass`),'crm_runtime_owner');
      const functions=await db.json("SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definer',prosecdef,'config',proconfig)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'crm_%contact%'");
      assert.ok(functions.length>0);
      for(const f of functions.filter(x=>x.definer)) assert.ok(f.config?.some(x=>x.startsWith('search_path=')),f.name);
      const baseline=JSON.parse(await fixture('contact-runtime/fence-baseline-manifest.json'));
      const signatures=baseline.map(x=>x.signature);
      const catalog=await db.json(`SELECT jsonb_build_object(
        'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',n.nspname||'.'||p.proname,
          'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,
          'config',p.proconfig,'acl',coalesce(to_jsonb(p.proacl),'[]'::jsonb),'prosrc_md5',md5(p.prosrc)) ORDER BY p.oid::regprocedure::text)
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE (n.nspname IN ('private','public') AND p.proname LIKE 'crm_%')
             OR p.oid IN (SELECT value::regprocedure FROM jsonb_array_elements_text(${sqlJson(signatures)}))),
        'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),
          'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl) ORDER BY c.relname)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname=ANY(ARRAY[${TABLES.map(q).join(',')}])),
        'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE schemaname='private' AND tablename=ANY(ARRAY[${TABLES.map(q).join(',')}])),
        'triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,
          'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid::regclass::text,t.tgname)
          FROM pg_trigger t WHERE NOT t.tgisinternal AND (t.tgname LIKE '%contact%' OR t.tgrelid IN
            (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname=ANY(ARRAY[${TABLES.map(q).join(',')}])))
        ))`);
      for(const prior of baseline){
        const after=catalog.functions.find(x=>x.signature.replace(/^public\./,'')===prior.signature.replace(/^public\./,''));
        assert.ok(after,prior.signature);assert.equal(after.owner,prior.owner,prior.signature);
        assert.deepEqual([...after.acl].sort(),[...prior.acl].sort(),prior.signature);
        assert.equal(after.security_definer,prior.signature==='private.enforce_en_gestion_next_contact()'?true:prior.security_definer,prior.signature);
      }
      // TAP escapes backslashes in diagnostics; base64 preserves exact catalog
      // bytes (e.g. search_path="") for the retained evidence extractor.
      t.diagnostic('M1_CONTACT_CATALOG_BASE64='+Buffer.from(JSON.stringify(catalog)).toString('base64'));
      const lead=await ready(db),task=(await tasks(db,lead))[0],action=await nextAction(db,{sequence:task.sequence_id});
      for(const [type,payload] of [
        ['RecordContactOutcome',await fact(db,lead,{task})],
        ['RecordContactTaskOmission',{task_id:task.id,sequence_id:task.sequence_id,reason_code:'not_performed',note:''}],
        ['ScheduleNextAction',action],
        ['RescheduleNextAction',{action_id:action.action_id,expected_action_revision:0,due_at:action.due_at,timezone:'UTC',note:'',reason:'Change'}],
        ['CancelNextAction',{action_id:action.action_id,expected_action_revision:0,reason:'Cancel'}],
        ['EvaluateContactDeadlines',{}]]){
        const input=await command(db,lead,type,payload);
        assert.deepEqual(await db.json(`SELECT private.crm_normalize_contact_command(${sqlJson(input)})`),normalizeContactNextActionCommandEnvelope(input));
      }
    });
    await caseTest(5,'real API roles have no direct table access and FORCE RLS remains enabled',async()=>{
      for(const table of TABLES){
        assert.deepEqual((await db.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=${q(`private.${table}`)}::regclass`)).rows,[['t','t']]);
        for(const role of ['anon','authenticated','service_role']){
          assert.equal(await db.scalar(`SELECT has_table_privilege(${q(role)},${q(`private.${table}`)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')`),'f');
          await db.query(`SET SESSION AUTHORIZATION ${role}`);
          try{assert.equal((await db.query(`SELECT * FROM private.${table}`,{allowError:true})).sqlstate,'42501');}
          finally{await db.query('RESET SESSION AUTHORIZATION');}
        }
      }
      const lead=await ready(db);
      await db.query('BEGIN; SET LOCAL ROLE crm_runtime_owner');
      try{assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_runtime WHERE lead_id=${q(lead)}`),'1');}
      finally{await db.query('ROLLBACK');}
      // Real owner access depends on its explicit policy despite table ownership.
      // This test-only policy removal is rolled back; no deployed grant changes.
      await db.query('BEGIN; DROP POLICY crm_contact_runtime_owner_only ON private.crm_contact_runtime; SET LOCAL ROLE crm_runtime_owner');
      try{assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_runtime WHERE lead_id=${q(lead)}`),'0');}
      finally{await db.query('ROLLBACK');}
    });
    // Installation must be coherent before any functional acceptance scenario.
    if(installationFailed) return;
    // Test-only exposure. Product candidates must never contain these grants.
    await db.query('GRANT EXECUTE ON FUNCTION public.crm_submit_command(jsonb) TO authenticated; GRANT EXECUTE ON FUNCTION public.crm_read_contact_work_context(uuid) TO authenticated');

    await caseTest(6,'runtime rows, gate, JWT/header/GUC never constitute technical adoption',async()=>{
      const lead=await newLead(db);await prepareA(db,lead);await prepareB(db,lead,{adopt:false});
      const forgedCommand=await command(db,lead,'RecordContactOutcome',await fact(db,lead));
      await actor(db,A,async()=>{
        await db.query("SELECT set_config('crm.contact_adopted','true',true),set_config('request.headers','{\"x-runtime-adopted\":true}',true)");
        rejected(await executeOpen(db,forgedCommand));
      });
      for(const who of [A,SUPERVISOR]) sqlDenied(await actor(db,who,()=>db.query(`SELECT private.crm_adopt_contact_lead(${q(lead)},${q(randomUUID())},5,'forged')`,{allowError:true})));
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_next_action_adoptions WHERE lead_id=${q(lead)}`),'0');
    });
    await caseTest(7,'adoption requires durable Assignment and exact B gate, preserves baseline evidence',async()=>{
      const lead=await newLead(db,{unknown:true});await prepareA(db,lead,{adopt:false});await prepareB(db,lead,{adopt:false});
      sqlDenied(await postgres(db,()=>db.query(`SELECT private.crm_adopt_contact_lead(${q(lead)},${q(randomUUID())},5,'without A')`,{allowError:true})));
      await postgres(db,()=>db.query(`SELECT private.crm_adopt_assignment_lead(${q(lead)},${q(randomUUID())},3,'A before B')`));
      const before=await tasks(db,lead);
      const bad=await postgres(db,()=>db.query(`SELECT private.crm_adopt_contact_lead(${q(lead)},${q(randomUUID())},4,'stale B revision')`,{allowError:true}));assert.equal(bad.ok,false);
      await postgres(db,()=>db.query(`SELECT private.crm_adopt_contact_lead(${q(lead)},${q(randomUUID())},5,'valid B')`));
      assert.deepEqual(await tasks(db,lead),before);assert.equal((await counts(db,lead)).facts,0);
      assert.ok(await row(db,'crm_contact_next_action_adoptions',lead));assert.ok(await contact(db,lead));
    });
    await caseTest(8,'pause is sticky, keeps commercial/channel epochs and seller channel denial',async()=>{
      const lead=await ready(db),before=await runtime(db,lead),channel=await row(db,'crm_conversation_state',lead);
      await db.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE domain=${q(DOMAIN)} AND scope_key=${q(`lead:${lead}`)}`);
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead))));
      assert.ok(await row(db,'crm_contact_next_action_adoptions',lead));assert.deepEqual(await runtime(db,lead),before);assert.deepEqual(await row(db,'crm_conversation_state',lead),channel);
      assert.equal(await actor(db,A,()=>db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(lead)})`)),'f');
    });
    await caseTest(9,'durable facts, adoptions and terminal history cannot be updated/deleted/truncated',async()=>{
      const lead=await ready(db);applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead))));
      for(const table of ['crm_contact_next_action_adoptions','crm_contact_facts','crm_events','crm_command_receipts']){
        const predicate=table==='crm_command_receipts'?`scope_key=${q(`lead:${lead}`)}`:`lead_id=${q(lead)}`;
        for(const sql of [`DELETE FROM private.${table} WHERE ${predicate}`,`TRUNCATE private.${table} CASCADE`]) sqlDenied(await db.query(sql,{allowError:true}));
      }
      sqlDenied(await db.query(`UPDATE private.crm_contact_facts SET note='rewrite' WHERE lead_id=${q(lead)}`,{allowError:true}));
      assert.equal((await counts(db,lead)).facts,1);
    });
    await caseTest(10,'future gates and FoundationProbe remain non-authoritative',async()=>{
      const lead=await ready(db),before=await protectedSnapshot(db,lead);
      for(const domain of ['recovery_ai','internal_notifications','commercial_handoff','outbound_dispatcher']){
        const r=await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
          VALUES(${q(domain)},${q(`lead:${lead}`)},'authoritative',1,1,'contact_next_action.v1',${q(POLICY)},'test','forbidden future','test')`,{allowError:true});assert.equal(r.ok,false);
      }
      const probeLead=await newLead(db),gates=['command_crm','command_owner'].map(domain=>({domain,scope_key:`lead:${probeLead}`,writer_epoch:2,revision:1,contract_version:'foundation-v1',policy_version:POLICY}));
      await db.query(`INSERT INTO private.crm_lead_runtime(lead_id,policy_version) VALUES(${q(probeLead)},${q(POLICY)})`);
      for(const g of gates)await db.query(`INSERT INTO private.crm_runtime_gates(domain,scope_key,mode,writer_epoch,revision,contract_version,policy_version,changer_subject,reason,baseline_manifest_id)
        VALUES(${q(g.domain)},${q(g.scope_key)},'ready',2,1,'foundation-v1',${q(POLICY)},'isolated','Closed probe regression','contact-schema-B')`);
      const c={schema_version:1,command_id:randomUUID(),command_type:'FoundationProbe',idempotency_key:`probe-${randomUUID()}`,scope:{lead_id:probeLead},
        expected_versions:{lead_aggregate_version:0,assignment_epoch:0,gates},policy_version_seen:POLICY,payload:{operation_id:randomUUID(),value:1}};
      rejected(await submit(db,c),'COMMAND_NOT_IMPLEMENTED');
      assert.deepEqual(await protectedSnapshot(db,lead),before);
    });
    await caseTest(11,'current owner and management scope, never historical task ownership',async()=>{
      const lead=await ready(db);
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead)),B));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead)),A));
      for(const who of [SUPERVISOR,ADMIN]) applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead)),who));
      applied(await submit(db,await assignment(db,lead),SUPERVISOR));
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead)),A));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead)),B));
    });
    await caseTest(12,'actor, ownership and privileged provenance cannot be injected',async()=>{
      const lead=await ready(db);
      for(const [key,value] of Object.entries({actor_user_id:B,role:'admin',owner:B,source:'provider',evidence_level:'verified',capability:true})){
        const c=await command(db,lead,'RecordContactOutcome',{...await fact(db,lead),[key]:value});rejected(await submit(db,c));
      }
      const f=await fact(db,lead);applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      const stored=await db.json(`SELECT to_jsonb(f) FROM private.crm_contact_facts f WHERE fact_id=${q(f.fact_id)}`);
      assert.ok(Object.values(stored).includes(A));assert.equal((await counts(db,lead)).facts,1);
      assert.equal(await db.scalar(`SELECT actor_user_id FROM private.crm_command_receipts WHERE command_type='RecordContactOutcome' AND status='applied' AND scope_key=${q(`lead:${lead}`)}`),A);
    });
    await caseTest(13,'inactive actor and concurrent deactivation are rejected',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));
      await db.query(`UPDATE public.profiles SET active=false WHERE user_id=${q(A)}`);
      try{rejected(await submit(db,c));}finally{await db.query(`UPDATE public.profiles SET active=true WHERE user_id=${q(A)}`);}
      const blocker=new PgSession('b13-profile-holder'),worker=new PgSession('b13-contact');
      try{
        await blocker.query('BEGIN');await blocker.query(`UPDATE public.profiles SET active=false WHERE user_id=${q(A)}`);
        const pending=submit(worker,await command(db,lead,'RecordContactOutcome',await fact(db,lead)));
        await waitLock(db,'b13-contact');await blocker.query('COMMIT');rejected(await pending);
      }finally{await blocker.query('ROLLBACK',{allowError:true});await db.query(`UPDATE public.profiles SET active=true WHERE user_id=${q(A)}`);await blocker.close();await worker.close();}
      assert.equal((await counts(db,lead)).facts,0);
    });
    await caseTest(14,'foreign task, sequence, action and fact references fail closed',async()=>{
      const lead=await ready(db),other=await ready(db),foreign=(await tasks(db,other))[0];
      const f=await fact(db,lead,{task:foreign});rejected(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      const action=await schedule(db,other);
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{action_ref:{action_id:action.action_id,revision:action.revision}}))));
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',{variant:'review',fact_id:randomUUID(),expected_review_revision:0,decision:'deny_credit',reason:'foreign'}),SUPERVISOR));
      assert.equal((await counts(db,lead)).facts,0);
    });
    await caseTest(15,'same command ID and intent yield one effect and replay',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));const first=await submit(db,c);applied(first);
      const before=await counts(db,lead),second=await submit(db,c);assert.equal(second.status,'replayed');assert.deepEqual((({status,original_status,...rest})=>rest)(second),(({status,...rest})=>rest)(first));assert.deepEqual(await counts(db,lead),before);
      assert.equal(await db.scalar(`SELECT request_hash FROM private.crm_command_receipts WHERE command_id=${q(c.command_id)}`),await hashContactNextActionCommandIntent(c,`user:${A}`));
    });
    await caseTest(16,'same idempotency key replays only same hash',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));applied(await submit(db,c));
      assert.equal((await submit(db,{...c,command_id:randomUUID()})).status,'replayed');
      rejected(await submit(db,{...c,command_id:randomUUID(),payload:{...c.payload,note:'Different intention'}}),'IDEMPOTENCY_KEY_REUSED');
      rejected(await submit(db,{...c,idempotency_key:`other-${randomUUID()}`,payload:{...c.payload,note:'Different intention'}}));
      assert.equal((await counts(db,lead)).facts,1);
    });
    await caseTest(17,'new keys cannot duplicate or overwrite stable fact/action identities',async()=>{
      const lead=await ready(db),f=await fact(db,lead);applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',{...f,note:'overwrite'})));
      const a=await schedule(db,lead);rejected(await submit(db,await command(db,lead,'ScheduleNextAction',await nextAction(db,{action_id:a.action_id}))));
      assert.equal((await counts(db,lead)).facts,1);assert.equal((await counts(db,lead)).actions,1);
    });
    await caseTest(18,'stale aggregate, Assignment and B revisions never partially apply',async()=>{
      const lead=await ready(db);applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead))));
      for(const key of ['lead_aggregate_version','assignment_epoch','contact_revision','next_action_revision','protocol_revision']){
        const c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));c.expected_versions[key]+=1;
        rejected(await submit(db,c),'VERSION_CONFLICT');
      }
      const c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));c.expected_versions.gates[0].revision++;rejected(await submit(db,c));
      assert.equal((await counts(db,lead)).facts,1);
    });
    await caseTest(19,'replay reevaluates read rights but succeeds through pause for authorized actor',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));applied(await submit(db,c));
      await db.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE domain=${q(DOMAIN)} AND scope_key=${q(`lead:${lead}`)}`);
      assert.equal((await submit(db,c)).status,'replayed');applied(await submit(db,await assignment(db,lead),SUPERVISOR));rejected(await submit(db,c));
      await db.query(`UPDATE public.profiles SET active=false WHERE user_id=${q(B)}`);
      try{rejected(await submit(db,c,B));}finally{await db.query(`UPDATE public.profiles SET active=true WHERE user_id=${q(B)}`);}
    });
    await caseTest(20,'neither GUC nor another domain receipt grants Contact DML',async()=>{
      const lead=await ready(db),before=await tasks(db,lead);
      await actor(db,A,async()=>{
        await db.query("SELECT set_config('crm.command_id','00000000-0000-4000-8000-000000000000',true),set_config('crm.contact_effect_authorized','true',true)");
        const direct=await db.query(`UPDATE public.lead_contact_tasks SET status='completed',outcome='no_answer' WHERE lead_id=${q(lead)} RETURNING id`,{allowError:true});
        if(direct.ok)assert.deepEqual(direct.rows,[],'RLS may reject by hiding every writable row');else sqlDenied(direct);
      });
      assert.deepEqual(await tasks(db,lead),before);
      applied(await submit(db,await assignment(db,lead),SUPERVISOR));
      sqlDenied(await db.query(`UPDATE public.lead_crm SET last_contact_at=now() WHERE lead_id=${q(lead)}`,{allowError:true}));
      assert.equal((await counts(db,lead)).facts,0);
    });
    await caseTest(21,'no_answer records real declared attempt/credit without stage/channel mutation',async()=>{
      const lead=await ready(db),before=await protectedSnapshot(db,lead),task=(await tasks(db,lead))[0];
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task}))));
      assert.equal((await counts(db,lead)).facts,1);assert.equal((await counts(db,lead)).credits,1);
      assert.equal((await tasks(db,lead)).find(x=>x.id===task.id).outcome,'no_answer');assert.deepEqual(await protectedSnapshot(db,lead),before);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)} AND payload->>'commercial_work'='true'`),'1','derived events must not multiply productivity');
    });
    await caseTest(22,'personal WA sent is declared evidence, never delivery or corporate channel proof',async()=>{
      const lead=await ready(db);
      for(const payload of [await fact(db,lead,{outcome:'sent'}),await fact(db,lead,{channel:'whatsapp_personal'}),await fact(db,lead,{channel:'whatsapp_ai',outcome:'sent'}),{...await fact(db,lead,{channel:'whatsapp_personal',outcome:'sent'}),wa_me_clicked:true}])
        rejected(await submit(db,await command(db,lead,'RecordContactOutcome',payload)));
      const f=await fact(db,lead,{channel:'whatsapp_personal',outcome:'sent'});applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      const stored=await db.json(`SELECT to_jsonb(x) FROM private.crm_contact_facts x WHERE fact_id=${q(f.fact_id)}`);
      assert.match(JSON.stringify(stored),/manual|attest/);assert.doesNotMatch(JSON.stringify(stored),/provider_verified|delivered/);
      assert.equal((await counts(db,lead)).credits,0);
    });
    await caseTest(23,'answered plus explicit next action is atomic and preserves commercial stage',async()=>{
      const lead=await ready(db,{rich:true}),before=await protectedSnapshot(db,lead),action=await nextAction(db);
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{outcome:'answered',replacement_next_action:action}))));
      assert.equal((await counts(db,lead)).facts,1);assert.equal((await counts(db,lead)).actions,1);assert.deepEqual(await protectedSnapshot(db,lead),before);
      assert.equal((await tasks(db,lead)).filter(x=>['pending','scheduled'].includes(x.status)).length,0);
    });
    await caseTest(24,'manual skipped records omission, never attempt or last contact',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0],before=await db.scalar(`SELECT last_contact_at FROM public.lead_crm WHERE lead_id=${q(lead)}`);
      applied(await submit(db,await command(db,lead,'RecordContactTaskOmission',{task_id:task.id,sequence_id:task.sequence_id,reason_code:'not_performed',note:'Operational omission'})));
      const after=(await tasks(db,lead)).find(x=>x.id===task.id);assert.equal(after.status,'skipped');assert.equal(after.performed_at,null);
      assert.equal((await counts(db,lead)).facts,0);assert.equal((await counts(db,lead)).credits,0);assert.equal(await db.scalar(`SELECT last_contact_at FROM public.lead_crm WHERE lead_id=${q(lead)}`),before);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)} AND event_type='ContactTaskActivated'`),'1');
    });
    await caseTest(25,'deadline observation is clock work with no seller contact or productivity attribution',async()=>{
      const lead=await ready(db,{windows:'expired'}),before=await counts(db,lead);
      applied(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})));
      const after=await counts(db,lead);assert.equal(after.facts,0);assert.equal(after.credits,0);assert.equal(after.activities,before.activities);
      for(const task of await tasks(db,lead)){assert.equal(task.status,'skipped');assert.equal(task.completed_by,null);assert.equal(task.performed_at,null);}
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)} AND aggregate_kind='lead_contact' AND (payload->>'commercial_work' IS DISTINCT FROM 'false' OR payload->>'origin' IS DISTINCT FROM 'domain_clock')`),'0');
    });
    await caseTest(26,'future/ambiguous times and incompatible channels never receive silent normalization',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0];
      for(const occurred_at of [await time(db,'1 hour'),'2026-09-18T12:00:00','2026-09-18T12:00:00-03:00'])
        rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{occurred_at}))));
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task,channel:'whatsapp_personal',outcome:'sent'}))));
      assert.equal((await counts(db,lead)).credits,0);
    });
    await caseTest(27,'late evidence survives and only explicit supervisor review grants delayed credit',async()=>{
      const {lead,task,occurred_at}=await lateContext(db);
      applied(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})));
      const f=await fact(db,lead,{task,occurred_at});applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      let credit=await db.json(`SELECT to_jsonb(x) FROM private.crm_contact_task_credits x WHERE task_id=${q(task.id)}`);
      assert.equal(credit.state,'review_required');assert.ok(credit.omission_observed_at);
      const review={variant:'review',fact_id:f.fact_id,expected_review_revision:credit.revision,decision:'confirm_credit',reason:'Supervisor reviewed delayed manual evidence'};
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',review),A));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',review),SUPERVISOR));
      credit=await db.json(`SELECT to_jsonb(x) FROM private.crm_contact_task_credits x WHERE task_id=${q(task.id)}`);
      assert.equal(credit.state,'credited');assert.ok(credit.omission_observed_at);assert.equal(credit.original_due_start,task.due_start);assert.equal(credit.original_due_end,task.due_end);
      assert.equal(await db.scalar(`SELECT evidence_quality FROM private.crm_contact_facts WHERE fact_id=${q(f.fact_id)}`),'manual_attestation');
      assert.equal((await tasks(db,lead)).find(x=>x.id===task.id).status,'skipped');
    });
    await caseTest(28,'older occurrence does not replace latest contact and remains historical evidence',async()=>{
      const lead=await ready(db),fresh=await fact(db,lead);applied(await submit(db,await command(db,lead,'RecordContactOutcome',fresh)));
      const latest=await db.scalar(`SELECT last_contact_at FROM public.lead_crm WHERE lead_id=${q(lead)}`);
      const old=await fact(db,lead,{occurred_at:await time(db,'-1 day')});applied(await submit(db,await command(db,lead,'RecordContactOutcome',old),SUPERVISOR));
      assert.equal(await db.scalar(`SELECT last_contact_at FROM public.lead_crm WHERE lead_id=${q(lead)}`),latest);
      assert.equal(await db.scalar(`SELECT historical_only FROM private.crm_contact_facts WHERE fact_id=${q(old.fact_id)}`),'t');
      assert.equal(await db.scalar(`SELECT performer_user_id FROM private.crm_contact_facts WHERE fact_id=${q(old.fact_id)}`),null);
      assert.equal(await db.scalar(`SELECT recorded_by_user_id FROM private.crm_contact_facts WHERE fact_id=${q(old.fact_id)}`),SUPERVISOR);
      assert.equal((await contact(db,lead)).last_attempt_fact_id,fresh.fact_id);
    });
    await caseTest(29,'supervisor amendment is append-only, compensates credit and never reopens protocol',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0],f=await fact(db,lead,{task});applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      const original=await db.json(`SELECT to_jsonb(x) FROM private.crm_contact_facts x WHERE fact_id=${q(f.fact_id)}`);
      const replacement=await fact(db,lead,{task,outcome:'invalid'});delete replacement.variant;
      const review={variant:'review',fact_id:f.fact_id,expected_review_revision:0,decision:'amend',reason:'Correction of this B fact only',replacement_fact:replacement};
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',review)));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',review),SUPERVISOR));
      assert.deepEqual(await db.json(`SELECT to_jsonb(x) FROM private.crm_contact_facts x WHERE fact_id=${q(f.fact_id)}`),original);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_facts WHERE amends_fact_id=${q(f.fact_id)}`),'1');
      assert.equal(await db.scalar(`SELECT sequence_id FROM private.crm_contact_facts WHERE amends_fact_id=${q(f.fact_id)}`),task.sequence_id);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_task_credits WHERE lead_id=${q(lead)} AND state='credited'`),'0');
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',{...review,fact_id:randomUUID()}),SUPERVISOR));
      // Also exercise the no-task amendment branch after its original sequence
      // has been superseded: the current protocol cannot supply the old link.
      const unlinkedLead=await ready(db),unlinked=await fact(db,unlinkedLead);
      applied(await submit(db,await command(db,unlinkedLead,'RecordContactOutcome',unlinked)));
      const oldSequence=await db.scalar(`SELECT sequence_id FROM private.crm_contact_facts WHERE fact_id=${q(unlinked.fact_id)}`);
      assert.ok(oldSequence);await schedule(db,unlinkedLead);
      const corrected={...unlinked,fact_id:randomUUID(),note:'Historical note correction'};delete corrected.variant;
      applied(await submit(db,await command(db,unlinkedLead,'RecordContactOutcome',{variant:'review',fact_id:unlinked.fact_id,
        expected_review_revision:0,decision:'amend',reason:'Preserve unlinked sequence context',replacement_fact:corrected}),SUPERVISOR));
      assert.equal(await db.scalar(`SELECT sequence_id FROM private.crm_contact_facts WHERE fact_id=${q(corrected.fact_id)}`),oldSequence);
      assert.equal(await db.scalar(`SELECT status FROM public.lead_contact_sequences WHERE id=${q(oldSequence)}`),'cancelled');
    });
    await caseTest(30,'one task and fact have at most one credit; inbound response does not invent call credit',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0];
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task}))));
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task}))));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{channel:'whatsapp_personal',fact_kind:'inbound_response',outcome:'answered'}))));
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_task_credits WHERE lead_id=${q(lead)} AND state='credited'`),'1');
      assert.equal((await tasks(db,lead)).filter(x=>x.status==='completed').length,1);
    });
    await caseTest(31,'new action has stable identity, revision and explicit date without contact or stage',async()=>{
      const lead=await ready(db),before=await protectedSnapshot(db,lead),a=await schedule(db,lead);
      assert.ok(a.action_id);assert.equal(a.revision,0);assert.equal(a.status,'open');assert.equal(a.channel,'call');
      assert.equal((await counts(db,lead)).facts,0);assert.deepEqual(await protectedSnapshot(db,lead),before);
      assert.equal((await contact(db,lead)).principal_action_id,a.action_id);
    });
    await caseTest(32,'reschedule and note editing preserve action identity and protocol history',async()=>{
      const lead=await ready(db),a=await schedule(db,lead),before=await tasks(db,lead);
      for(const [due_at,note] of [[await time(db,'3 days'),'New date'],[await time(db,'3 days'),'Clarified note']]){
        const current=await db.json(`SELECT to_jsonb(x) FROM private.crm_next_actions x WHERE action_id=${q(a.action_id)}`);
        applied(await submit(db,await command(db,lead,'RescheduleNextAction',{action_id:a.action_id,expected_action_revision:current.revision,due_at,timezone:a.timezone,note,reason:'Explicit revision'})));
      }
      assert.equal((await counts(db,lead)).actions,1);assert.equal((await counts(db,lead)).facts,0);assert.deepEqual(await tasks(db,lead),before);
      assert.equal(await db.scalar(`SELECT revision FROM private.crm_next_actions WHERE action_id=${q(a.action_id)}`),'2');
    });
    await caseTest(33,'factual completion needs no invented date, but ordinary cancellation needs replacement',async()=>{
      const lead=await ready(db,{phase:'en_proceso'}),a=await db.json(`SELECT to_jsonb(x) FROM private.crm_next_actions x WHERE lead_id=${q(lead)} AND status='open'`);
      assert.ok(a);rejected(await submit(db,await command(db,lead,'CancelNextAction',{action_id:a.action_id,expected_action_revision:a.revision,reason:'Cannot erase follow-up'})));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{outcome:'answered',action_ref:{action_id:a.action_id,revision:a.revision}}))));
      assert.equal(await db.scalar(`SELECT status FROM private.crm_next_actions WHERE action_id=${q(a.action_id)}`),'completed');
      assert.equal(await db.scalar(`SELECT next_contact_at FROM public.lead_crm WHERE lead_id=${q(lead)}`),null);
      assert.equal((await contact(db,lead)).next_action_required,true);assert.ok((await contact(db,lead)).next_action_reason);
      assert.equal(await db.scalar(`SELECT status FROM public.lead_crm WHERE lead_id=${q(lead)}`),'en_proceso');
    });
    await caseTest(34,'explicit cancellation and replacement do not restart protocol or erase on omission',async()=>{
      const lead=await ready(db),a=await schedule(db,lead),before=await tasks(db,lead);
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead))));
      assert.equal((await contact(db,lead)).principal_action_id,a.action_id);
      applied(await submit(db,await command(db,lead,'CancelNextAction',{action_id:a.action_id,expected_action_revision:a.revision,reason:'Explicit administrative cancellation'})));
      assert.equal(await db.scalar(`SELECT status FROM private.crm_next_actions WHERE action_id=${q(a.action_id)}`),'cancelled');assert.deepEqual(await tasks(db,lead),before);
    });
    await caseTest(35,'server clock observes deadline once while getter performs zero writes',async()=>{
      const lead=await newLead(db,{phase:'en_proceso'});
      await db.query(`UPDATE public.lead_crm SET next_contact_at=now()-interval '1 minute' WHERE lead_id=${q(lead)}`);
      await prepareA(db,lead);await prepareB(db,lead);
      const before=await counts(db,lead);await getContext(db,lead);assert.deepEqual(await counts(db,lead),before);
      applied(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})));
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)} AND event_type='NextActionOverdue'`),'1');
      const next=await counts(db,lead);rejected(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})),'NO_STATE_CHANGE');
      const after=await counts(db,lead);assert.equal(after.events,next.events);assert.deepEqual(after.runtime,next.runtime);
    });
    await caseTest(36,'rescheduling an overdue action retains old observation and advances revision',async()=>{
      const lead=await newLead(db,{phase:'en_proceso'});await db.query(`UPDATE public.lead_crm SET next_contact_at=now()-interval '1 minute' WHERE lead_id=${q(lead)}`);await prepareA(db,lead);await prepareB(db,lead);
      applied(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})));
      const a=await db.json(`SELECT to_jsonb(x) FROM private.crm_next_actions x WHERE lead_id=${q(lead)} AND status='open'`);
      applied(await submit(db,await command(db,lead,'RescheduleNextAction',{action_id:a.action_id,expected_action_revision:a.revision,due_at:await time(db,'1 day'),timezone:'UTC',note:'New commitment',reason:'Client asked for later contact'})));
      rejected(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})),'NO_STATE_CHANGE');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events WHERE lead_id=${q(lead)} AND event_type='NextActionOverdue'`),'1');
    });
    await caseTest(37,'deep protected snapshot remains identical through contact/action/omission',async()=>{
      const lead=await ready(db,{rich:true}),before=await protectedSnapshot(db,lead),task=(await tasks(db,lead))[0];
      applied(await submit(db,await command(db,lead,'RecordContactTaskOmission',{task_id:task.id,sequence_id:task.sequence_id,reason_code:'operational_obstacle',note:'Synthetic'})));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead))));await schedule(db,lead);
      assert.deepEqual(await protectedSnapshot(db,lead),before);
    });
    await caseTest(38,'opt-out atomically restricts linked customer and removes future work without stage',async()=>{
      const lead=await ready(db),before=await protectedSnapshot(db,lead);await schedule(db,lead);
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{outcome:'requested_no_contact',fact_kind:'inbound_response'}))));
      assert.equal(await db.scalar(`SELECT do_not_contact FROM public.leads WHERE id=${q(lead)}`),'t');
      assert.equal(await db.scalar(`SELECT c.do_not_contact FROM public.customers c JOIN public.leads l ON l.customer_id=c.id WHERE l.id=${q(lead)}`),'t');
      assert.equal((await tasks(db,lead)).filter(x=>['pending','scheduled'].includes(x.status)).length,0);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_next_actions WHERE lead_id=${q(lead)} AND status='open'`),'0');
      assert.deepEqual(await protectedSnapshot(db,lead),before);
    });
    await caseTest(39,'paused gate only admits restrictive opt-out without credit or new schedule',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0];
      await db.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE domain=${q(DOMAIN)} AND scope_key=${q(`lead:${lead}`)}`);
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead))));
      rejected(await submit(db,await command(db,lead,'ScheduleNextAction',await nextAction(db))));
      const f=await fact(db,lead,{outcome:'requested_no_contact',fact_kind:'inbound_response',occurred_at:await time(db,'-1 day')});
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',{...f,replacement_next_action:await nextAction(db)})));
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      assert.equal(await db.scalar(`SELECT do_not_contact FROM public.leads WHERE id=${q(lead)}`),'t');assert.equal((await counts(db,lead)).credits,0);
      assert.equal((await counts(db,lead)).facts,1);assert.equal((await tasks(db,lead)).find(x=>x.id===task.id).status,'cancelled');
    });
    await caseTest(40,'incoherent customer identity fails without repair and no B operation lifts restriction',async()=>{
      const lead=await newLead(db),foreign=await newLead(db),wrongCustomer=await db.scalar(`SELECT customer_id FROM public.leads WHERE id=${q(foreign)}`);await db.query(`UPDATE public.leads SET customer_id=${q(wrongCustomer)} WHERE id=${q(lead)}`);await prepareA(db,lead);await prepareB(db,lead);
      rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{outcome:'requested_no_contact'}))),'IDENTITY_RECONCILIATION_REQUIRED');
      assert.equal(await db.scalar(`SELECT customer_id FROM public.leads WHERE id=${q(lead)}`),wrongCustomer);assert.equal((await counts(db,lead)).facts,0);
      const restricted=await ready(db);applied(await submit(db,await command(db,restricted,'RecordContactOutcome',await fact(db,restricted,{outcome:'requested_no_contact'}))));
      const restrictionFact=await db.scalar(`SELECT fact_id FROM private.crm_contact_facts WHERE lead_id=${q(restricted)}`),weaker=await fact(db,restricted,{outcome:'answered'});delete weaker.variant;
      rejected(await submit(db,await command(db,restricted,'RecordContactOutcome',{variant:'review',fact_id:restrictionFact,expected_review_revision:0,decision:'amend',reason:'Forbidden weakening',replacement_fact:weaker}),SUPERVISOR),'CONTACT_RESTRICTED');
      applied(await submit(db,await assignment(db,restricted),SUPERVISOR));
      rejected(await submit(db,await command(db,restricted,'ScheduleNextAction',await nextAction(db)),B));
      assert.equal(await db.scalar(`SELECT do_not_contact FROM public.leads WHERE id=${q(restricted)}`),'t');
      const customerOnly=await newLead(db);
      await db.query(`UPDATE public.customers SET do_not_contact=true,do_not_contact_at=now(),do_not_contact_reason='Synthetic pre-existing customer restriction'
        WHERE id=(SELECT customer_id FROM public.leads WHERE id=${q(customerOnly)})`);
      assert.equal(await db.scalar(`SELECT do_not_contact FROM public.leads WHERE id=${q(customerOnly)}`),'f');
      await prepareA(db,customerOnly);await prepareB(db,customerOnly);
      rejected(await submit(db,await command(db,customerOnly,'ScheduleNextAction',await nextAction(db))),'CONTACT_RESTRICTED');
      rejected(await submit(db,await command(db,customerOnly,'RecordContactOutcome',await fact(db,customerOnly))),'CONTACT_RESTRICTED');
      assert.equal((await counts(db,customerOnly)).facts,0);assert.equal((await counts(db,customerOnly)).actions,0);
    });
    await caseTest(41,'18+2 and historical 6+2 protocol IDs/windows survive adoption and transfer',async()=>{
      for(const historical of [false,true]){
        const lead=await newLead(db,{windows:'original'});
        if(historical) await db.query(`DELETE FROM public.lead_contact_tasks WHERE lead_id=${q(lead)} AND channel='call' AND call_attempt>6`);
        const before=await tasks(db,lead);assert.equal(before.filter(x=>x.channel==='call').length,historical?6:18);assert.equal(before.filter(x=>x.channel==='whatsapp').length,2);
        await prepareA(db,lead);await prepareB(db,lead);applied(await submit(db,await assignment(db,lead),SUPERVISOR));assert.deepEqual(await tasks(db,lead),before);
      }
    });
    await caseTest(42,'fully credited no-response protocol closes factually without cold/Recall/stage',async()=>{
      const lead=await ready(db),before=await protectedSnapshot(db,lead);
      for(const task of await tasks(db,lead)) applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task,channel:task.channel==='call'?'call':'whatsapp_personal',outcome:task.channel==='call'?'no_answer':'sent'}))));
      const summary=(await contact(db,lead)).protocol_summary;assert.equal(summary.classification,'executed_no_response');assert.equal(summary.N,20);assert.equal(summary.C,20);assert.equal(summary.R,0);assert.equal(summary.U,0);
      assert.deepEqual(await protectedSnapshot(db,lead),before);
    });
    await caseTest(43,'all omitted yields protocol_incomplete and visible zero registered attempts',async()=>{
      const lead=await ready(db,{windows:'expired'});applied(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})));
      const summary=(await contact(db,lead)).protocol_summary;assert.equal(summary.classification,'protocol_incomplete');assert.equal(summary.reason,'zero_effective_attempts');
      assert.equal(summary.F,0);assert.equal(summary.C,0);assert.equal(summary.O,20);assert.equal(summary.U,0);assert.equal(summary.review_required,true);
      const dto=await getContext(db,lead,SUPERVISOR);assert.match(JSON.stringify(dto),/zero_effective_attempts/);
    });
    await caseTest(44,'partial counts retain denominator and descriptive majority without future routing',async()=>{
      for(const omissions of [10,11]){
        const lead=await ready(db),all=await tasks(db,lead);
        for(let i=0;i<all.length;i++){
          const task=all[i];
          if(i<omissions) applied(await submit(db,await command(db,lead,'RecordContactTaskOmission',{task_id:task.id,sequence_id:task.sequence_id,reason_code:'not_performed',note:'Synthetic omission'})));
          else applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task,channel:task.channel==='call'?'call':'whatsapp_personal',outcome:task.channel==='call'?'no_answer':'sent'}))));
        }
        const summary=(await contact(db,lead)).protocol_summary;assert.equal(summary.N,20);assert.equal(summary.C,20-omissions);assert.equal(summary.O,omissions);assert.equal(summary.omissions_predominate,omissions>10);
        assert.equal(summary.classification,'protocol_incomplete');assert.equal(summary.reason,'partial_execution');assert.equal(summary.ratio,(20-omissions)/20);
        assert.equal(await db.scalar(`SELECT cold_base_at FROM public.lead_crm WHERE lead_id=${q(lead)}`),null);
      }
    });
    await caseTest(45,'unknown legacy work or empty/unrecognized plan cannot prove full or zero physical work',async()=>{
      const lead=await ready(db,{windows:'expired',unknown:true});applied(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})));
      const summary=(await contact(db,lead)).protocol_summary;assert.ok(summary.U>0);assert.equal(summary.classification,'evidence_incomplete');assert.equal(summary.review_required,true);
      const empty=await newLead(db);await db.query(`DELETE FROM public.lead_contact_tasks WHERE lead_id=${q(empty)}; DELETE FROM public.lead_contact_sequences WHERE lead_id=${q(empty)}`);await prepareA(db,empty);await prepareB(db,empty);
      const missing=(await contact(db,empty)).protocol_summary;assert.notEqual(missing.classification,'executed_no_response');assert.notEqual(missing.reason,'zero_effective_attempts');
    });
    await caseTest(46,'manual agenda explicitly supersedes only future work, preserving credited/omitted history',async()=>{
      const lead=await ready(db),all=await tasks(db,lead);
      applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task:all[0]}))));
      applied(await submit(db,await command(db,lead,'RecordContactTaskOmission',{task_id:all[1].id,sequence_id:all[1].sequence_id,reason_code:'not_performed',note:'Historical omission'})));
      const before=await tasks(db,lead);await schedule(db,lead);const after=await tasks(db,lead);
      assert.deepEqual(after.slice(0,2),before.slice(0,2));assert.ok(after.slice(2).every(x=>x.status==='cancelled'));
      assert.equal((await contact(db,lead)).protocol_summary.classification,'superseded');
    });
    await caseTest(47,'response, no_interest, invalid and restriction remain distinct operational causes',async()=>{
      const causes=new Set();
      for(const outcome of ['answered','no_interest','invalid','requested_no_contact']){
        const lead=await ready(db),before=await protectedSnapshot(db,lead);applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{outcome}))));
        const summary=(await contact(db,lead)).protocol_summary;causes.add(`${summary.classification}:${summary.cause??summary.reason??''}`);
        assert.deepEqual(await protectedSnapshot(db,lead),before);assert.equal((await tasks(db,lead)).filter(x=>['pending','scheduled'].includes(x.status)).length,0);
        if(outcome==='answered')assert.equal((await contact(db,lead)).next_action_required,true);
      }
      assert.equal(causes.size,4,'closure reasons must not collapse distinct evidence');
    });
    await caseTest(48,'legacy classifier trigger/direct call is contained only for adopted cohort',async()=>{
      const adopted=await ready(db,{windows:'expired'}),before=await protectedSnapshot(db,adopted);
      applied(await submit(db,await command(db,adopted,'EvaluateContactDeadlines',{})));
      await postgres(db,()=>db.query(`SELECT private.classify_exhausted_contact_protocol(${q(adopted)},(SELECT current_sequence_id FROM private.crm_contact_runtime WHERE lead_id=${q(adopted)}))`));assert.deepEqual(await protectedSnapshot(db,adopted),before);
      const legacy=await newLead(db,{windows:'expired'});
      await actor(db,A,()=>db.query('SELECT public.refresh_due_contact_protocols()'));
      assert.equal(await db.scalar(`SELECT status FROM public.lead_crm WHERE lead_id=${q(legacy)}`),'desistir');
      assert.notEqual(await db.scalar(`SELECT cold_base_at FROM public.lead_crm WHERE lead_id=${q(legacy)}`),null);
    });
    await caseTest(49,'no-change clock is terminal without events/version; future windows remain visible',async()=>{
      const lead=await ready(db,{windows:'original'}),before=await counts(db,lead);
      const result=await submit(db,await command(db,lead,'EvaluateContactDeadlines',{}));rejected(result,'NO_STATE_CHANGE');
      const after=await counts(db,lead);assert.equal(after.events,before.events);assert.deepEqual(after.runtime,before.runtime);assert.deepEqual(after.contact,before.contact);
      const dto=await getContext(db,lead);assert.match(JSON.stringify(dto),/not_yet_due|due_start/);
    });
    await caseTest(50,'operational getter is READ ONLY, scoped and exposes evidence/review/clock context',async()=>{
      const lead=await ready(db),f=await fact(db,lead);applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));await schedule(db,lead);
      const before=await counts(db,lead);for(const who of [A,SUPERVISOR,ADMIN]){
        const dto=await getContext(db,lead,who);assert.match(JSON.stringify(dto),new RegExp(f.fact_id));assert.match(JSON.stringify(dto),/manual_attestation/);assert.match(JSON.stringify(dto),/contact_revision/);
      }
      assert.deepEqual(await counts(db,lead),before);
      const denied=await getContext(db,lead,B);rejected(denied,'FORBIDDEN_SCOPE');assert.equal(denied.facts,undefined);
    });
    await caseTest(51,'legacy, A-only and A+B cohorts preserve distinct writer authority',async()=>{
      for(const cohort of ['legacy','A','AB']){
        const lead=await newLead(db);if(cohort!=='legacy')await prepareA(db,lead);if(cohort==='AB')await prepareB(db,lead);
        const task=(await tasks(db,lead))[0];const result=await actor(db,A,()=>db.query(`SELECT public.record_contact_task_result(${q(task.id)},'no_answer','Synthetic legacy call',now())`,{allowError:true}));
        if(cohort==='AB'){sqlDenied(result);assert.equal((await tasks(db,lead))[0].status,'pending');}
        else{assert.equal(result.ok,true,JSON.stringify(result));assert.equal((await tasks(db,lead))[0].status,'completed');}
      }
    });
    await caseTest(52,'every legacy result/answer/follow-up overload rejects before any side effect',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0],before=await counts(db,lead),taskBefore=await tasks(db,lead);
      const calls=[`public.complete_contact_task(${q(task.id)},'no_answer','x')`,
        `public.record_contact_task_result(${q(task.id)},'no_answer','x',now())`,
        `public.complete_contact_task_with_follow_up(${q(task.id)},'no_answer','x',now()+interval '1 day','next')`,
        `public.record_contact_answer_with_transition(${q(task.id)}::uuid,'en_proceso'::text,'x'::text,now()+interval '1 day','next','answered',null::timestamptz,''::text,null::numeric,'normal'::text,now(),null::text,''::text,null::text)`,
        `public.record_contact_answer_with_transition(${q(task.id)}::uuid,'en_proceso'::text,'scheduled'::text,'x'::text,now()+interval '1 day','next','answered',null::timestamptz,''::text,null::numeric,'normal'::text,now(),null::text,''::text,null::text)`,
        `public.record_lead_follow_up(${q(lead)},'en_proceso','x',now()+interval '1 day','next','no_answer')`];
      for(const call of calls){const result=await actor(db,A,()=>db.query(`SELECT ${call}`,{allowError:true}));sqlDenied(result);}
      const privileged=await legacyDml(db,`SELECT ${calls[0]}`,A,{allowError:true});sqlDenied(privileged);assert.match(privileged.error,/COMMAND_METADATA_REQUIRED/);
      assert.deepEqual(await counts(db,lead),before);assert.deepEqual(await tasks(db,lead),taskBefore);
    });
    await caseTest(53,'mixed supervisor scheduling/status/management cannot partially commit excluded domains',async()=>{
      const lead=await ready(db),before=await protectedSnapshot(db,lead),state=await counts(db,lead);
      for(const action of ['schedule','status','management']) sqlDenied(await actor(db,SUPERVISOR,()=>db.query(`SELECT public.supervisor_manage_lead(${q(lead)},${q(action)},'desistir','normal','Synthetic reason',now()+interval '1 day','next','answered','other')`,{allowError:true})));
      assert.deepEqual(await protectedSnapshot(db,lead),before);assert.deepEqual(await counts(db,lead),state);
    });
    await caseTest(54,'restart/reconcile/future/Recall writers cannot reset adopted work',async()=>{
      const lead=await ready(db),before=await tasks(db,lead);
      for(const fn of ['restart_lead_contact_sequence','reconcile_lead_contact_protocol','start_no_contact_protocol_from_future']) sqlDenied(await actor(db,A,()=>db.query(`SELECT public.${fn}(${q(lead)})`,{allowError:true})));
      const recall=randomUUID();
      // A synthetic existing Recall item is a referent only; B never creates or operates it.
      await db.query(`INSERT INTO public.lead_recall_items(id,lead_id,customer_name,customer_phone,original_inquiry_at,assigned_seller_user_id,assigned_at,status,available_at) VALUES(${q(recall)},${q(lead)},'Synthetic recall','000000104001',now(),${q(A)},now(),'assigned',now())`);
      sqlDenied(await actor(db,A,()=>db.query(`SELECT public.record_recall_attempt(${q(recall)},'10-12','no_answer',now(),'synthetic',null,'')`,{allowError:true})));
      assert.deepEqual(await tasks(db,lead),before);
    });
    await caseTest(55,'mixed-cohort legacy refresh processes only legacy and preserves B for explicit clock',async()=>{
      const legacy=await newLead(db,{windows:'expired'}),adopted=await ready(db,{windows:'expired'}),before=await tasks(db,adopted);
      await actor(db,A,()=>db.query('SELECT public.refresh_due_contact_protocols()'));
      assert.ok((await tasks(db,legacy)).every(x=>x.status==='skipped'));assert.deepEqual(await tasks(db,adopted),before);
      assert.ok(await getContext(db,adopted));applied(await submit(db,await command(db,adopted,'EvaluateContactDeadlines',{})));
    });
    await caseTest(56,'service/direct DML/definer do not bypass B fields; excluded notes retain permissions',async()=>{
      const lead=await ready(db),before=await tasks(db,lead);
      for(const role of ['postgres','service_role']){
        await db.query(`SET SESSION AUTHORIZATION ${role}`);
        try{for(const sql of [`UPDATE public.lead_crm SET next_contact_at=now()+interval '1 day' WHERE lead_id=${q(lead)}`,`UPDATE public.lead_contact_tasks SET status='skipped' WHERE lead_id=${q(lead)}`])sqlDenied(await db.query(sql,{allowError:true}));}
        finally{await db.query('RESET SESSION AUTHORIZATION');}
      }
      await legacyDml(db,`UPDATE public.lead_crm SET final_objection='Permitted excluded comment' WHERE lead_id=${q(lead)}`);
      assert.equal(await db.scalar(`SELECT final_objection FROM public.lead_crm WHERE lead_id=${q(lead)}`),'Permitted excluded comment');assert.deepEqual(await tasks(db,lead),before);
    });
    await caseTest(57,'insert/delete/cascade/truncate cannot erase or forge adopted CRM/protocol history',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0],before=await tasks(db,lead);
      for(const sql of [`DELETE FROM public.leads WHERE id=${q(lead)}`,`DELETE FROM public.lead_crm WHERE lead_id=${q(lead)}`,`DELETE FROM public.lead_contact_sequences WHERE lead_id=${q(lead)}`,`DELETE FROM public.lead_contact_tasks WHERE lead_id=${q(lead)}`,
        `INSERT INTO public.lead_contact_tasks SELECT (jsonb_populate_record(null::public.lead_contact_tasks,to_jsonb(t)||jsonb_build_object('id',${q(randomUUID())},'sequence_order',99))).* FROM public.lead_contact_tasks t WHERE id=${q(task.id)}`,
        'TRUNCATE public.lead_contact_tasks CASCADE','TRUNCATE public.lead_contact_sequences CASCADE','TRUNCATE public.lead_crm CASCADE']) sqlDenied(await db.query(sql,{allowError:true}));
      assert.equal((await db.query('TRUNCATE public.lead_contact_tasks',{allowError:true})).sqlstate,'0A000');
      assert.deepEqual(await tasks(db,lead),before);
    });
    await caseTest(58,'new legacy leads retain initialization without implicit adoption',async()=>{
      const lead=await newLead(db,{windows:'original'});assert.equal((await tasks(db,lead)).length,20);
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_next_action_adoptions WHERE lead_id=${q(lead)}`),'0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_assignment_adoptions WHERE lead_id=${q(lead)}`),'0');
      const task=(await tasks(db,lead))[0];assert.equal((await actor(db,A,()=>db.query(`SELECT public.record_contact_task_result(${q(task.id)},'no_answer','legacy',now())`))).ok,true);
    });
    await caseTest(59,'excluded appointment/deposit/document fields alone do not create B effects',async()=>{
      const lead=await ready(db),before=await counts(db,lead);
      await legacyDml(db,`UPDATE public.lead_crm SET interview_location='Synthetic location update',deposit_validation='Synthetic document note',final_objection='Synthetic objection' WHERE lead_id=${q(lead)}`);
      assert.deepEqual(await counts(db,lead),before);
    });
    await caseTest(60,'reproduced webhook/sales mixed DML is rejected atomically without external functions',async()=>{
      const lead=await ready(db),before=await protectedSnapshot(db,lead);
      for(const role of ['postgres','service_role']){
        await db.query(`SET SESSION AUTHORIZATION ${role}`);
        try{sqlDenied(await db.query(`UPDATE public.lead_crm SET status='desistir',last_contact_at=now(),last_contact_outcome='answered',next_contact_at=null WHERE lead_id=${q(lead)}`,{allowError:true}));}
        finally{await db.query('RESET SESSION AUTHORIZATION');}
      }
      assert.deepEqual(await protectedSnapshot(db,lead),before);
    });
    await caseTest(61,'two real sessions with same intent block then commit one logical result',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));
      const one=new PgSession('b61-first'),two=new PgSession('b61-second');
      try{
        await begin(one,A);const first=await executeOpen(one,c);applied(first);
        const pending=submit(two,c);await waitLock(db,'b61-second');await finish(one);
        const replay=await pending;assert.equal(replay.status,'replayed');assert.deepEqual((({status,original_status,...rest})=>rest)(replay),(({status,...rest})=>rest)(first));
        assert.equal((await counts(db,lead)).facts,1);assert.equal((await runtime(db,lead)).aggregate_version,1);
      }finally{await finish(one,false);await one.close();await two.close();}
    });
    await caseTest(62,'different simultaneous facts for same task produce one credit and stale loser',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0],c1=await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task})),c2=await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task}));
      const one=new PgSession('b62-first'),two=new PgSession('b62-second');
      try{await begin(one,A);applied(await executeOpen(one,c1));const pending=submit(two,c2);await waitLock(db,'b62-second');await finish(one);rejected(await pending,'VERSION_CONFLICT');
        assert.equal((await counts(db,lead)).facts,1);assert.equal((await counts(db,lead)).credits,1);
      }finally{await finish(one,false);await one.close();await two.close();}
    });
    await caseTest(63,'contact versus Transfer serializes both orders without owner/history confusion',async()=>{
      for(const contactFirst of [true,false]){
        const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead)),tr=await assignment(db,lead);
        const one=new PgSession('b63-first'),two=new PgSession('b63-second');
        try{
          await begin(one,contactFirst?A:SUPERVISOR);applied(await executeOpen(one,contactFirst?c:tr));
          const pending=submit(two,contactFirst?tr:c,contactFirst?SUPERVISOR:A);await waitLock(db,'b63-second');await finish(one);rejected(await pending);
          assert.equal((await counts(db,lead)).facts,contactFirst?1:0);
          assert.equal(await db.scalar(`SELECT assigned_seller_user_id FROM public.leads WHERE id=${q(lead)}`),contactFirst?A:B);
        }finally{await finish(one,false);await one.close();await two.close();}
      }
    });
    await caseTest(64,'contact/agenda and Acknowledge share aggregate CAS without changing epoch',async()=>{
      for(const type of ['RecordContactOutcome','ScheduleNextAction']){
        const lead=await ready(db),task=(await tasks(db,lead))[0],ack=await assignment(db,lead,'AcknowledgeLeadAssignment');
        const cmd=await command(db,lead,type,type==='RecordContactOutcome'?await fact(db,lead):await nextAction(db,{sequence:task.sequence_id}));
        const one=new PgSession('b64-first'),two=new PgSession('b64-second');
        try{await begin(one,A);applied(await executeOpen(one,ack));const pending=submit(two,cmd);await waitLock(db,'b64-second');await finish(one);rejected(await pending,'VERSION_CONFLICT');
          assert.equal((await runtime(db,lead)).assignment_epoch,0);assert.equal((await counts(db,lead)).facts,0);assert.equal((await counts(db,lead)).actions,0);
        }finally{await finish(one,false);await one.close();await two.close();}
      }
    });
    await caseTest(65,'reschedule/cancel replacement versus factual completion preserves one consistent outcome',async()=>{
      for(const contactFirst of [true,false]){
        const lead=await ready(db),a=await schedule(db,lead),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead,{outcome:'answered',action_ref:{action_id:a.action_id,revision:a.revision}}));
        const move=await command(db,lead,'RescheduleNextAction',{action_id:a.action_id,expected_action_revision:a.revision,due_at:await time(db,'4 days'),timezone:'UTC',note:'later',reason:'Reschedule'});
        const one=new PgSession('b65-first'),two=new PgSession('b65-second');
        try{await begin(one,A);applied(await executeOpen(one,contactFirst?c:move));const pending=submit(two,contactFirst?move:c);await waitLock(db,'b65-second');await finish(one);rejected(await pending,'VERSION_CONFLICT');
          assert.equal(await db.scalar(`SELECT status FROM private.crm_next_actions WHERE action_id=${q(a.action_id)}`),contactFirst?'completed':'open');
          assert.equal((await counts(db,lead)).facts,contactFirst?1:0);
        }finally{await finish(one,false);await one.close();await two.close();}
      }
    });
    await caseTest(66,'clock versus late evidence preserves deadline observation and review requirement',async()=>{
      const {lead,task,occurred_at}=await lateContext(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task,occurred_at})),clock=await command(db,lead,'EvaluateContactDeadlines',{});
      const one=new PgSession('b66-clock'),two=new PgSession('b66-contact');
      try{await begin(one,A);applied(await executeOpen(one,clock));const pending=submit(two,c);await waitLock(db,'b66-contact');await finish(one);rejected(await pending,'VERSION_CONFLICT');
        const refreshed=await command(db,lead,'RecordContactOutcome',c.payload);applied(await submit(db,refreshed));
        assert.equal(await db.scalar(`SELECT state FROM private.crm_contact_task_credits WHERE task_id=${q(task.id)}`),'review_required');
        assert.equal((await tasks(db,lead))[0].status,'skipped');assert.equal((await counts(db,lead)).facts,1);
      }finally{await finish(one,false);await one.close();await two.close();}
    });
    await caseTest(67,'gate pause serializes with command and cannot broaden the DNC exception',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));
      const one=new PgSession('b67-gate'),two=new PgSession('b67-contact');
      try{await one.query('BEGIN');await one.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE domain=${q(DOMAIN)} AND scope_key=${q(`lead:${lead}`)}`);
        const pending=submit(two,c);await waitLock(db,'b67-contact');await one.query('COMMIT');rejected(await pending);
        rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{outcome:'requested_no_contact'}))));
        const restricted=await command(db,lead,'RecordContactOutcome',await fact(db,lead,{fact_kind:'inbound_response',outcome:'requested_no_contact'}));applied(await submit(db,restricted));assert.equal((await submit(db,restricted)).status,'replayed');
      }finally{await one.query('ROLLBACK',{allowError:true});await one.close();await two.close();}
    });
    await caseTest(68,'adoption fences old snapshots and direct legacy writers without inverse-lock bypass',async()=>{
      for(const adoptionFirst of [false,true]){
        const raced=await newLead(db);await prepareA(db,raced);await prepareB(db,raced,{adopt:false});const task=(await tasks(db,raced))[0];
        const first=new PgSession('b68-first'),second=new PgSession('b68-second');
        try{
          if(adoptionFirst){
            await first.query('SET SESSION AUTHORIZATION postgres; BEGIN');
            await first.query(`SELECT private.crm_adopt_contact_lead(${q(raced)},${q(randomUUID())},5,'Adoption first')`);
            const pending=actor(second,A,()=>second.query(`SELECT public.record_contact_task_result(${q(task.id)},'no_answer','Concurrent legacy writer',now())`,{allowError:true}));
            await waitLock(db,'b68-second');await first.query('COMMIT; RESET SESSION AUTHORIZATION');sqlDenied(await pending);
            assert.equal((await tasks(db,raced))[0].status,'pending');
          }else{
            await begin(first,A);await first.query(`SELECT public.record_contact_task_result(${q(task.id)},'no_answer','Legacy writer before adoption',now())`);
            const pending=postgres(second,()=>second.query(`SELECT private.crm_adopt_contact_lead(${q(raced)},${q(randomUUID())},5,'Adoption after writer')`));
            await waitLock(db,'b68-second');await finish(first);assert.equal((await pending).ok,true);
            assert.equal((await tasks(db,raced))[0].status,'completed');assert.equal((await counts(db,raced)).facts,0);
          }
        }finally{await first.query('ROLLBACK; RESET SESSION AUTHORIZATION',{allowError:true});await second.query('ROLLBACK; RESET SESSION AUTHORIZATION',{allowError:true});await first.close();await second.close();}
      }
      const lead=await newLead(db);await prepareA(db,lead);await prepareB(db,lead,{adopt:false});
      const old=new PgSession('b68-old-snapshot');
      try{
        await old.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await old.query(`SELECT * FROM public.leads WHERE id=${q(lead)}`);
        await postgres(db,()=>db.query(`SELECT private.crm_adopt_contact_lead(${q(lead)},${q(randomUUID())},5,'Concurrent B adoption')`));
        const stale=await old.query(`UPDATE public.lead_crm SET last_contact_at=now() WHERE lead_id=${q(lead)}`,{allowError:true});assert.equal(stale.ok,false);assert.ok(['40001','42501','55P03'].includes(stale.sqlstate),JSON.stringify(stale));await old.query('ROLLBACK');
      }finally{await old.query('ROLLBACK',{allowError:true});await old.close();}
      // INSERT has no old child tuple. The parent barrier must also fence a
      // snapshot that predates adoption, without relying on child UPDATEs.
      const insertLead=await newLead(db);await prepareA(db,insertLead);await prepareB(db,insertLead,{adopt:false});
      const oldInsert=new PgSession('b68-old-insert');
      try{
        await oldInsert.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        const template=await oldInsert.json(`SELECT to_jsonb(t) FROM public.lead_contact_tasks t WHERE lead_id=${q(insertLead)} ORDER BY sequence_order LIMIT 1`);
        await postgres(db,()=>db.query(`SELECT private.crm_adopt_contact_lead(${q(insertLead)},${q(randomUUID())},5,'Insert barrier adoption')`));
        const forged={...template,id:randomUUID(),sequence_order:999};
        const denied=await oldInsert.query(`INSERT INTO public.lead_contact_tasks SELECT * FROM jsonb_populate_record(NULL::public.lead_contact_tasks,${sqlJson(forged)})`,{allowError:true});
        assert.equal(denied.sqlstate,'40001',JSON.stringify(denied));
      }finally{await oldInsert.query('ROLLBACK',{allowError:true});await oldInsert.close();}
      const writer=new PgSession('b68-owner-lock'),inverse=new PgSession('b68-inverse');
      try{await writer.query('BEGIN');await writer.query(`SELECT id FROM public.leads WHERE id=${q(lead)} FOR UPDATE`);
        const rejectedDml=await legacyDml(inverse,`UPDATE public.lead_crm SET final_objection='No lock inversion' WHERE lead_id=${q(lead)}`,A,{allowError:true});assert.equal(rejectedDml.sqlstate,'55P03');
      }finally{await writer.query('ROLLBACK');await writer.close();await inverse.close();}
    });
    await caseTest(69,'opt-out versus agenda and Transfer stays monotonic and scoped to linked identity',async()=>{
      for(const otherType of ['ScheduleNextAction','TransferLead']){
        const lead=await ready(db),untouched=await ready(db),task=(await tasks(db,lead))[0];
        const optout=await command(db,lead,'RecordContactOutcome',await fact(db,lead,{fact_kind:'inbound_response',outcome:'requested_no_contact'}));
        const other=otherType==='TransferLead'?await assignment(db,lead):await command(db,lead,'ScheduleNextAction',await nextAction(db,{sequence:task.sequence_id}));
        const one=new PgSession('b69-optout'),two=new PgSession('b69-second');
        try{await begin(one,A);applied(await executeOpen(one,optout));const pending=submit(two,other,otherType==='TransferLead'?SUPERVISOR:A);await waitLock(db,'b69-second');await finish(one);rejected(await pending);
          assert.equal(await db.scalar(`SELECT do_not_contact FROM public.leads WHERE id=${q(lead)}`),'t');assert.equal(await db.scalar(`SELECT do_not_contact FROM public.leads WHERE id=${q(untouched)}`),'f');
          assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_next_actions WHERE lead_id=${q(lead)} AND status='open'`),'0');
        }finally{await finish(one,false);await one.close();await two.close();}
      }
    });
    await caseTest(70,'concurrent supervisor decisions produce one credit/review revision',async()=>{
      const {lead,task,occurred_at}=await lateContext(db);applied(await submit(db,await command(db,lead,'EvaluateContactDeadlines',{})));
      const f=await fact(db,lead,{task,occurred_at});applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      const review={variant:'review',fact_id:f.fact_id,expected_review_revision:0,decision:'confirm_credit',reason:'Explicit late-credit review'};
      const c1=await command(db,lead,'RecordContactOutcome',review),c2=await command(db,lead,'RecordContactOutcome',{...review,decision:'deny_credit'});
      const one=new PgSession('b70-review'),two=new PgSession('b70-second');
      try{await begin(one,SUPERVISOR);applied(await executeOpen(one,c1));const pending=submit(two,c2,ADMIN);await waitLock(db,'b70-second');await finish(one);rejected(await pending,'VERSION_CONFLICT');
        assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_contact_task_credits WHERE task_id=${q(task.id)} AND state='credited'`),'1');assert.equal(await db.scalar(`SELECT revision FROM private.crm_contact_task_credits WHERE task_id=${q(task.id)}`),'1');
      }finally{await finish(one,false);await one.close();await two.close();}
    });
    await caseTest(71,'failures after fact, credit and agenda roll back the complete command transaction',async()=>{
      await db.query(`CREATE SCHEMA contact_fault; CREATE FUNCTION contact_fault.fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_ATOMICITY_FAILURE'; END $$`);
      for(const table of ['crm_contact_facts','crm_contact_task_credits','crm_next_actions']){
        const lead=await ready(db),task=(await tasks(db,lead))[0],payload=table==='crm_next_actions'?await nextAction(db,{sequence:task.sequence_id}):await fact(db,lead,{task});
        const type=table==='crm_next_actions'?'ScheduleNextAction':'RecordContactOutcome',c=await command(db,lead,type,payload),before=await counts(db,lead),taskBefore=await tasks(db,lead);
        await db.query(`CREATE TRIGGER contact_test_failure AFTER INSERT ON private.${table} FOR EACH ROW EXECUTE FUNCTION contact_fault.fail()`);
        try{await assert.rejects(()=>submit(db,c),/SYNTHETIC_ATOMICITY_FAILURE/);}finally{await db.query(`DROP TRIGGER contact_test_failure ON private.${table}`);}
        assert.deepEqual(await counts(db,lead),before);assert.deepEqual(await tasks(db,lead),taskBefore);
        applied(await submit(db,c));
      }
    });
    await caseTest(72,'backend termination before commit leaves zero partial effects and same intent retries',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead)),before=await counts(db,lead),worker=new PgSession('b72-crash');
      try{await begin(worker,A);applied(await executeOpen(worker,c));
        const pid=await db.scalar("SELECT pid FROM pg_stat_activity WHERE application_name='b72-crash'");assert.ok(pid);assert.equal(await db.scalar(`SELECT pg_terminate_backend(${Number(pid)})`),'t');
        await worker.close();assert.deepEqual(await counts(db,lead),before);applied(await submit(db,c));assert.equal((await counts(db,lead)).facts,1);
      }finally{await worker.close();}
    });
    await caseTest(73,'commit with lost response is recovered exactly without duplicate timestamps or work',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead)),worker=new PgSession('b73-lost-response');
      let original;
      try{await begin(worker,A);original=await executeOpen(worker,c);applied(original);await finish(worker);}
      finally{await worker.close();}
      const before=await counts(db,lead),stored=await db.json(`SELECT to_jsonb(f) FROM private.crm_contact_facts f WHERE fact_id=${q(c.payload.fact_id)}`),retry=await submit(db,c);
      assert.equal(retry.status,'replayed');const {status,original_status,...replayed}=retry;
      assert.deepEqual(replayed,(({status,...rest})=>rest)(original));assert.deepEqual(await counts(db,lead),before);
      assert.deepEqual(await db.json(`SELECT to_jsonb(f) FROM private.crm_contact_facts f WHERE fact_id=${q(c.payload.fact_id)}`),stored);
    });
    await caseTest(74,'real 55P03, 40001 and deadlock rollback never create a duplicate intention',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));
      const held=new PgSession('b74-holder'),timed=new PgSession('b74-timeout');
      try{await held.query('BEGIN');await held.query(`SELECT * FROM private.crm_lead_runtime WHERE lead_id=${q(lead)} FOR UPDATE`);
        await begin(timed,A);await timed.query("SET LOCAL lock_timeout='100ms'");const timeout=await timed.query(`SELECT public.crm_submit_command(${sqlJson(c)})`,{allowError:true});assert.equal(timeout.sqlstate,'55P03');await finish(timed,false);await held.query('ROLLBACK');
        assert.equal((await counts(db,lead)).facts,0);applied(await submit(db,c));
      }finally{await held.query('ROLLBACK',{allowError:true});await finish(timed,false);await held.close();await timed.close();}
      const rrlead=await ready(db),rrIntent=await command(db,rrlead,'RecordContactOutcome',await fact(db,rrlead)),rr=new PgSession('b74-repeatable');
      try{await begin(rr,A,'ISOLATION LEVEL REPEATABLE READ');
        await rr.query(`SELECT public.crm_read_contact_work_context(${q(rrlead)})`);
        applied(await submit(db,await command(db,rrlead,'RecordContactOutcome',await fact(db,rrlead))));
        // An actual authenticated command (including its receipt INSERT) meets
        // a runtime tuple changed since this transaction's snapshot.
        assert.equal((await rr.query(`SELECT public.crm_submit_command(${sqlJson(rrIntent)})`,{allowError:true})).sqlstate,'40001');
      }finally{await finish(rr,false);await rr.close();}
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE command_id=${q(rrIntent.command_id)}`),'0');
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_events WHERE command_id=${q(rrIntent.command_id)}`),'0');
      rejected(await submit(db,rrIntent),'VERSION_CONFLICT');
      const staleReplay=await submit(db,rrIntent);assert.equal(staleReplay.status,'replayed');assert.equal(staleReplay.original_status,'rejected');assert.equal(staleReplay.error_code,'VERSION_CONFLICT');
      assert.equal((await counts(db,rrlead)).facts,1);assert.equal((await runtime(db,rrlead)).aggregate_version,1);
      const l1=await ready(db),l2=await ready(db),c1=await command(db,l1,'RecordContactOutcome',await fact(db,l1)),c2=await command(db,l2,'RecordContactOutcome',await fact(db,l2));
      const one=new PgSession('b74-deadlock-1'),two=new PgSession('b74-deadlock-2');
      try{await begin(one,A);await begin(two,A);applied(await executeOpen(one,c1));applied(await executeOpen(two,c2));
        // Each authenticated transaction holds one actual command receipt and
        // effect. Submitting the opposite intent creates a real receipt-lock
        // deadlock without granting either actor direct access to private rows.
        const p1=one.query(`SELECT public.crm_submit_command(${sqlJson(c2)})`,{allowError:true});
        await waitLock(db,'b74-deadlock-1');const p2=two.query(`SELECT public.crm_submit_command(${sqlJson(c1)})`,{allowError:true});
        const results=await Promise.all([p1,p2]);assert.equal(results.filter(r=>r.sqlstate==='40P01').length,1);
        const victim=results[0].sqlstate==='40P01'?one:two;await finish(victim,false);
        const survivorResult=results.find(r=>r.ok);applied(JSON.parse(survivorResult.rows[0][0]));
        await finish(victim===one?two:one);
        // The surviving transaction applied both logical intents after the
        // victim rolled back. Retrying either must recover those two results.
        assert.equal((await submit(db,c1)).status,'replayed');assert.equal((await submit(db,c2)).status,'replayed');
        assert.equal((await counts(db,l1)).facts,1);assert.equal((await counts(db,l2)).facts,1);
      }finally{await finish(one,false);await finish(two,false);await one.close();await two.close();}
    });
    await caseTest(75,'projection/helper failure cannot leak a live evaluating capability into session',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));
      await db.query('CREATE TRIGGER contact_test_failure AFTER UPDATE ON private.crm_contact_runtime FOR EACH ROW EXECUTE FUNCTION contact_fault.fail()');
      try{await assert.rejects(()=>submit(db,c),/SYNTHETIC_ATOMICITY_FAILURE/);}finally{await db.query('DROP TRIGGER contact_test_failure ON private.crm_contact_runtime');}
      assert.equal(await db.scalar(`SELECT count(*) FROM private.crm_command_receipts WHERE scope_key=${q(`lead:${lead}`)} AND contact_effect_authorized`),'0');
      sqlDenied(await db.query(`UPDATE public.lead_crm SET last_contact_at=now() WHERE lead_id=${q(lead)}`,{allowError:true}));
      applied(await submit(db,c));
    });
    await caseTest(76,'version exhaustion, missing references and uniqueness fail without mutilating history',async()=>{
      const lead=await ready(db);await db.query(`UPDATE private.crm_lead_runtime SET aggregate_version=9007199254740991 WHERE lead_id=${q(lead)}`);
      const before=await runtime(db,lead);rejected(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead))));assert.deepEqual(await runtime(db,lead),before);assert.equal((await counts(db,lead)).facts,0);
      const safe=await ready(db),f=await fact(db,safe,{task:{id:randomUUID(),sequence_id:randomUUID()}});rejected(await submit(db,await command(db,safe,'RecordContactOutcome',f)));
      sqlDenied(await db.query(`DELETE FROM private.crm_assignment_adoptions WHERE lead_id=${q(safe)}`,{allowError:true}));assert.ok(await contact(db,safe));
    });
    await caseTest(77,'event replay reconstructs disposable projections without invoking commands or legacy effects',async()=>{
      const lead=await ready(db),task=(await tasks(db,lead))[0];applied(await submit(db,await command(db,lead,'RecordContactOutcome',await fact(db,lead,{task}))));
      const a=await schedule(db,lead);applied(await submit(db,await command(db,lead,'RescheduleNextAction',{action_id:a.action_id,expected_action_revision:a.revision,due_at:await time(db,'3 days'),timezone:'UTC',note:'Replay value',reason:'Replay test'})));
      const before=await counts(db,lead);
      await db.query(`CREATE TEMP TABLE b77_replay(kind text,id text,value jsonb,PRIMARY KEY(kind,id));
        DO $replay$ DECLARE e record; x jsonb; p jsonb; BEGIN
          FOR e IN SELECT payload FROM private.crm_events WHERE lead_id=${q(lead)} AND event_type='ContactWorkStateProjected' ORDER BY aggregate_version,event_index LOOP
            p:=e.payload->'projection_after';
            IF p IS NULL THEN RAISE EXCEPTION 'MISSING_REPLAY_PAYLOAD'; END IF;
            INSERT INTO b77_replay VALUES('runtime',${q(lead)},p->'runtime') ON CONFLICT(kind,id) DO UPDATE SET value=EXCLUDED.value;
            FOR x IN SELECT value FROM jsonb_array_elements(p->'facts') LOOP INSERT INTO b77_replay VALUES('fact',x->>'fact_id',x) ON CONFLICT(kind,id) DO UPDATE SET value=EXCLUDED.value; END LOOP;
            FOR x IN SELECT value FROM jsonb_array_elements(p->'actions') LOOP INSERT INTO b77_replay VALUES('action',x->>'action_id',x) ON CONFLICT(kind,id) DO UPDATE SET value=EXCLUDED.value; END LOOP;
            FOR x IN SELECT value FROM jsonb_array_elements(p->'credits') LOOP INSERT INTO b77_replay VALUES('credit',x->>'task_id',x) ON CONFLICT(kind,id) DO UPDATE SET value=EXCLUDED.value; END LOOP;
          END LOOP;
        END $replay$`);
      assert.deepEqual(await db.json(`SELECT value FROM b77_replay WHERE kind='runtime' AND id=${q(lead)}`),await contact(db,lead));
      for(const [kind,table,id] of [['fact','crm_contact_facts','fact_id'],['action','crm_next_actions','action_id'],['credit','crm_contact_task_credits','task_id']]){
        assert.deepEqual(await db.json(`SELECT coalesce(jsonb_agg(value ORDER BY id),'[]') FROM b77_replay WHERE kind=${q(kind)}`),await db.json(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY ${id}),'[]') FROM private.${table} x WHERE lead_id=${q(lead)}`));
      }
      assert.deepEqual(await counts(db,lead),before);await db.query('DROP TABLE b77_replay');
    });
    await caseTest(78,'compatible technical pause retains adoption/fences/epochs/history and seller channel denial',async()=>{
      const lead=await ready(db),f=await fact(db,lead);applied(await submit(db,await command(db,lead,'RecordContactOutcome',f)));
      const before=await counts(db,lead),task=(await tasks(db,lead))[0];
      await db.query(`UPDATE private.crm_runtime_gates SET mode='paused',revision=revision+1 WHERE scope_key=${q(`lead:${lead}`)}`);
      sqlDenied(await actor(db,A,()=>db.query(`SELECT public.complete_contact_task(${q(task.id)},'no_answer','fallback prohibited')`,{allowError:true})));
      assert.equal(await actor(db,A,()=>db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(lead)})`)),'f');assert.deepEqual(await counts(db,lead),before);
      assert.ok(await row(db,'crm_contact_next_action_adoptions',lead));assert.ok(await row(db,'crm_assignment_adoptions',lead));
    });
    await caseTest(79,'Assignment regression boundary remains valid with B installed',async()=>{
      const lead=await ready(db),before=await tasks(db,lead),commercial=await protectedSnapshot(db,lead),channel=await row(db,'crm_conversation_state',lead),c=await assignment(db,lead);
      applied(await submit(db,c,SUPERVISOR));assert.equal((await submit(db,c,SUPERVISOR)).status,'replayed');assert.deepEqual(await tasks(db,lead),before);
      for(const who of [A,B]){
        assert.equal(await actor(db,who,()=>db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(lead)})`)),'f');
        sqlDenied(await actor(db,who,()=>db.query(`SELECT public.set_whatsapp_conversation_mode(${q(lead)},'human')`,{allowError:true})));
      }
      applied(await submit(db,await assignment(db,lead,'AcknowledgeLeadAssignment'),B));assert.equal((await runtime(db,lead)).assignment_epoch,1);
      assert.deepEqual(await row(db,'crm_conversation_state',lead),channel);
      const after=await protectedSnapshot(db,lead);assert.deepEqual(after.crm,commercial.crm);assert.deepEqual(after.sales,commercial.sales);assert.deepEqual(after.recall,commercial.recall);
      for(const who of [SUPERVISOR,ADMIN])assert.equal(await actor(db,who,()=>db.scalar(`SELECT private.current_user_can_manage_whatsapp(${q(lead)})`)),'t');
      t.diagnostic('Original146 DB IDs executed separately; this scenario is a post-B authority assertion, not a duplicate count.');
    });
    await caseTest(80,'foundation history/closed purposes and private privileges remain protected after B',async()=>{
      const lead=await ready(db),c=await command(db,lead,'RecordContactOutcome',await fact(db,lead));applied(await submit(db,c));
      sqlDenied(await db.query(`UPDATE private.crm_command_receipts SET result='{}' WHERE command_id=${q(c.command_id)}`,{allowError:true}));
      sqlDenied(await db.query(`DELETE FROM private.crm_events WHERE command_id=${q(c.command_id)}`,{allowError:true}));
      for(const table of TABLES)assert.equal(await db.scalar(`SELECT has_table_privilege('authenticated',${q(`private.${table}`)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`),'f');
      assert.equal(await db.scalar("SELECT count(*) FROM private.crm_command_receipts WHERE assignment_effect_authorized OR contact_effect_authorized"),'0');
      assert.equal(await db.scalar("SELECT count(*) FROM private.crm_runtime_gates WHERE mode='authoritative' AND domain NOT IN ('command_owner','command_contact_next_action')"),'0');
      t.diagnostic('Certified foundation oracle remains separately executed, unchanged.');
    });
  }finally{await db.close();}
});
