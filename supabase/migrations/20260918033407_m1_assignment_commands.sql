-- M1-04A / candidate B. Closed installation; no seeds, grants to API users,
-- cutover, external effects, or other domain handlers.
begin;
set local search_path = public, extensions;

do $preflight$
begin
  if to_regclass('private.crm_assignment_adoptions') is null
     or to_regprocedure('private.crm_adopt_assignment_lead(uuid,uuid,bigint,text)') is null
     or to_regclass('public.vehicle_appraisals') is null then
    raise exception 'ASSIGNMENT_COMMAND_BASELINE_REQUIRED';
  end if;
end;
$preflight$;

grant crm_runtime_owner to postgres with inherit true, set true;
grant usage, create on schema private, public to crm_runtime_owner;

alter table private.crm_command_receipts drop constraint crm_command_receipts_command_type_check;
alter table private.crm_command_receipts add constraint crm_command_receipts_command_type_check
  check (command_type in ('FoundationProbe','AssignLead','TransferLead','AcknowledgeLeadAssignment'));
alter table private.crm_events drop constraint crm_events_event_type_check;
alter table private.crm_events add constraint crm_events_event_type_check
  check (event_type in ('FoundationProbeApplied','LeadAssigned','LeadTransferred','LeadAssignmentAcknowledged'));
alter table private.crm_events drop constraint crm_events_aggregate_kind_check;
alter table private.crm_events add constraint crm_events_aggregate_kind_check
  check (aggregate_kind in ('foundation_probe','lead_assignment'));

-- Historical terminal receipts keep NULL execution metadata: no invented
-- execution provenance or UPDATE/backfill of the existing immutable history.
alter table private.crm_command_receipts add column execution_xid xid8;
alter table private.crm_command_receipts alter column execution_xid set default pg_current_xact_id();
alter table private.crm_command_receipts add column execution_backend_pid integer;
alter table private.crm_command_receipts alter column execution_backend_pid set default pg_backend_pid();
alter table private.crm_command_receipts add column assignment_effect_authorized boolean not null default false;
alter table private.crm_command_receipts add constraint crm_receipt_assignment_effect_check check (
  not assignment_effect_authorized or (
    status='evaluating' and command_type in ('AssignLead','TransferLead','AcknowledgeLeadAssignment')
    and execution_xid is not null and execution_backend_pid is not null and execution_backend_pid>0
  )
);
create unique index crm_assignment_one_effect_context_idx
  on private.crm_command_receipts(scope_key,execution_xid,execution_backend_pid)
  where assignment_effect_authorized;

-- An in-transaction, closed receipt is the capability. It cannot be carried by
-- a JWT, GUC, header or payload, reused by another backend/transaction, or survive
-- commit in evaluating state. There is no general-purpose privileged DML API.
create function private.crm_assignment_authorization(p_lead_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $function$
  select jsonb_build_object('command_id',r.command_id,'command_type',r.command_type,
    'actor_user_id',r.actor_user_id,'created_at',r.created_at,'payload',r.request_payload->'payload',
    'expected_versions',r.expected_versions)
  from private.crm_command_receipts r
  where r.scope_key='lead:'||p_lead_id::text and r.status='evaluating' and r.assignment_effect_authorized
    and r.execution_xid=pg_current_xact_id() and r.execution_backend_pid=pg_backend_pid()
    and r.command_type in ('AssignLead','TransferLead','AcknowledgeLeadAssignment');
$function$;
alter function private.crm_assignment_authorization(uuid) owner to crm_runtime_owner;
revoke all on function private.crm_assignment_authorization(uuid) from public, anon, authenticated, service_role;
grant execute on function private.crm_assignment_authorization(uuid) to postgres;

create function private.crm_assignment_lock_target(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_profile record;
begin
  select user_id,active,role::text role into v_profile from public.profiles where user_id=p_user_id for share;
  if not found or v_profile.active is distinct from true or v_profile.role<>'seller' then
    return jsonb_build_object('error_code','TARGET_SELLER_INACTIVE');
  end if;
  return jsonb_build_object('user_id',v_profile.user_id);
end;
$function$;
create function private.crm_assignment_lock_lead(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_lead public.leads%rowtype; v_status text;
begin
  select * into v_lead from public.leads where id=p_lead_id for update;
  if not found then return jsonb_build_object('error_code','FORBIDDEN_SCOPE'); end if;
  select status into v_status from public.lead_crm where lead_id=p_lead_id;
  return jsonb_build_object('lead_id',v_lead.id,'owner_user_id',v_lead.assigned_seller_user_id,
    'assigned_at',v_lead.assigned_at,'do_not_contact',v_lead.do_not_contact,'status',v_status);
end;
$function$;
alter function private.crm_assignment_lock_target(uuid) owner to postgres;
alter function private.crm_assignment_lock_lead(uuid) owner to postgres;
revoke all on function private.crm_assignment_lock_target(uuid), private.crm_assignment_lock_lead(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.crm_assignment_lock_target(uuid), private.crm_assignment_lock_lead(uuid) to crm_runtime_owner;

create or replace function private.crm_fence_assignment_owner_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_context jsonb; v_type text; v_destination uuid; v_from uuid;
begin
  if old.assigned_seller_user_id is not distinct from new.assigned_seller_user_id
     and old.assigned_by_user_id is not distinct from new.assigned_by_user_id
     and old.assigned_at is not distinct from new.assigned_at then return new; end if;
  if not private.crm_assignment_is_adopted(old.id) then return new; end if;
  v_context := private.crm_assignment_authorization(old.id);
  v_type := v_context->>'command_type';
  if v_type='AssignLead' then
    v_destination := (v_context#>>'{payload,seller_user_id}')::uuid;
    if old.assigned_seller_user_id is not null
       or new.assigned_at is distinct from (v_context->>'created_at')::timestamptz then
      raise exception using errcode='55000',message='WRITER_FENCED';
    end if;
  elsif v_type='TransferLead' then
    v_destination := (v_context#>>'{payload,to_seller_user_id}')::uuid;
    v_from := (v_context#>>'{payload,from_seller_user_id}')::uuid;
    if old.assigned_seller_user_id is distinct from v_from
       or old.assigned_at is distinct from new.assigned_at then
      raise exception using errcode='55000',message='WRITER_FENCED';
    end if;
  else raise exception using errcode='55000',message='WRITER_FENCED'; end if;
  if new.id is distinct from old.id or v_destination is null
     or new.assigned_seller_user_id is distinct from v_destination
     or new.assigned_by_user_id is distinct from (v_context->>'actor_user_id')::uuid
     or new.assigned_seller_user_id is not distinct from old.assigned_seller_user_id then
    raise exception using errcode='55000',message='WRITER_FENCED';
  end if;
  return new;
end;
$function$;

create or replace function private.crm_fence_assignment_history_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_lead_id uuid; v_resources uuid[]; v_context jsonb; v_type text; v_destination uuid;
begin
  if tg_op='INSERT' then v_resources:=array[new.lead_id];
  elsif tg_op='DELETE' then v_resources:=array[old.lead_id];
  else v_resources:=array[old.lead_id,new.lead_id]; end if;
  for v_lead_id in select distinct lead_id from unnest(v_resources) r(lead_id) where lead_id is not null order by lead_id loop
    perform id from public.leads where id=v_lead_id for share;
    if not private.crm_assignment_is_adopted(v_lead_id) then continue; end if;
    if tg_op<>'INSERT' then raise exception using errcode='55000',message='WRITER_FENCED'; end if;
    v_context:=private.crm_assignment_authorization(v_lead_id);
    v_type:=v_context->>'command_type';
    if v_type='AssignLead' then
      v_destination:=(v_context#>>'{payload,seller_user_id}')::uuid;
      if new.assignment_type<>'manual' then raise exception using errcode='55000',message='WRITER_FENCED'; end if;
    elsif v_type='TransferLead' then
      v_destination:=(v_context#>>'{payload,to_seller_user_id}')::uuid;
      if new.assignment_type<>'reassigned' then raise exception using errcode='55000',message='WRITER_FENCED'; end if;
    else raise exception using errcode='55000',message='WRITER_FENCED'; end if;
    if v_destination is null or new.seller_user_id is distinct from v_destination
       or new.assigned_by_user_id is distinct from (v_context->>'actor_user_id')::uuid
       or new.reason is distinct from (v_context#>>'{payload,reason}')
       or new.created_at is distinct from (v_context->>'created_at')::timestamptz then
      raise exception using errcode='55000',message='WRITER_FENCED';
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

create function private.crm_apply_assignment_command(p_command_id uuid,p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_context jsonb; v_lead public.leads%rowtype; v_crm public.lead_crm%rowtype;
  v_actor uuid; v_role text; v_destination uuid; v_type text; v_reason text; v_time timestamptz; v_assignment bigint;
begin
  v_context:=private.crm_assignment_authorization(p_lead_id);
  if v_context is null or (v_context->>'command_id')::uuid is distinct from p_command_id
     or not private.crm_assignment_is_adopted(p_lead_id) then
    raise exception using errcode='55000',message='WRITER_FENCED';
  end if;
  v_actor:=(v_context->>'actor_user_id')::uuid;
  v_type:=v_context->>'command_type';
  v_reason:=v_context#>>'{payload,reason}';
  v_time:=(v_context->>'created_at')::timestamptz;
  select role::text into v_role from public.profiles where user_id=v_actor and active for share;
  if not found then return jsonb_build_object('error_code','ACTOR_INACTIVE'); end if;
  select * into v_lead from public.leads where id=p_lead_id for update;
  if not found then return jsonb_build_object('error_code','FORBIDDEN_SCOPE'); end if;
  if v_type='AcknowledgeLeadAssignment' then
    if v_role<>'seller' or v_lead.assigned_seller_user_id is distinct from v_actor then
      return jsonb_build_object('error_code','FORBIDDEN_SCOPE');
    end if;
    return jsonb_build_object('owner_before',v_actor,'owner_after',v_actor,'assignment_id',null,
      'assigned_at',v_lead.assigned_at,'occurred_at',clock_timestamp(),'reason',null);
  end if;
  if v_role not in ('admin','supervisor') then return jsonb_build_object('error_code','FORBIDDEN_COMMAND'); end if;
  select * into v_crm from public.lead_crm where lead_id=p_lead_id;
  if not found then return jsonb_build_object('error_code','ASSIGNMENT_NOT_ELIGIBLE'); end if;
  if v_crm.status in ('venta','desistir','invalido')
     or exists(select 1 from public.sales_cases where lead_id=p_lead_id) then
    return jsonb_build_object('error_code','ASSIGNMENT_NOT_ELIGIBLE');
  end if;
  if v_type='AssignLead' then
    v_destination:=(v_context#>>'{payload,seller_user_id}')::uuid;
    if v_lead.assigned_seller_user_id is not null then return jsonb_build_object('error_code','OWNER_CONFLICT'); end if;
    -- NULL owner alone does not make a prior opportunity new. This command
    -- composes no protocol/cycle and cannot be used as implicit reactivation.
    if v_crm.status<>'nuevo' or coalesce(v_lead.do_not_contact,false)
       or exists(select 1 from public.lead_assignments where lead_id=p_lead_id)
       or exists(select 1 from public.lead_contact_sequences where lead_id=p_lead_id)
       or exists(select 1 from public.lead_sale_requests where lead_id=p_lead_id)
       or exists(select 1 from public.lead_contact_tasks where lead_id=p_lead_id)
       or exists(select 1 from public.sales_quotes where lead_id=p_lead_id)
       or exists(select 1 from public.commercial_applications where lead_id=p_lead_id)
       or exists(select 1 from public.vehicle_appraisals where lead_id=p_lead_id)
       or v_lead.closed_at is not null or v_crm.next_contact_at is not null or v_crm.last_contact_at is not null
       or coalesce(v_crm.deposit_amount,0)<>0 or v_crm.deposit_at is not null
       or v_crm.interview_at is not null or v_crm.sale_requested_at is not null then
      return jsonb_build_object('error_code','ASSIGNMENT_NOT_ELIGIBLE');
    end if;
  elsif v_type='TransferLead' then
    v_destination:=(v_context#>>'{payload,to_seller_user_id}')::uuid;
    if v_lead.assigned_seller_user_id is null
       or v_lead.assigned_seller_user_id is distinct from (v_context#>>'{payload,from_seller_user_id}')::uuid
       or v_lead.assigned_seller_user_id is not distinct from v_destination then
      return jsonb_build_object('error_code','OWNER_CONFLICT');
    end if;
  else raise exception using errcode='55000',message='WRITER_FENCED'; end if;
  perform user_id from public.profiles where user_id=v_destination and active and role::text='seller' for share;
  if not found then return jsonb_build_object('error_code','TARGET_SELLER_INACTIVE'); end if;

  -- Deliberately no lead_crm, protocol, task, playbook, Recall, sale, quote,
  -- application, appraisal or channel writes. The adoption-aware assignment
  -- trigger below returns without invoking the legacy start-cycle helper.
  update public.leads set assigned_seller_user_id=v_destination,assigned_by_user_id=v_actor,
    assigned_at=case when v_type='AssignLead' then v_time else assigned_at end
    where id=p_lead_id;
  insert into public.lead_assignments(lead_id,seller_user_id,assigned_by_user_id,assignment_type,reason,created_at)
    values(p_lead_id,v_destination,v_actor,case when v_type='AssignLead' then 'manual' else 'reassigned' end,v_reason,v_time)
    returning id into v_assignment;
  insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata)
    values(p_lead_id,v_actor,'assignment',case when v_type='AssignLead' then 'Asignación runtime' else 'Transferencia runtime' end,
      v_reason,jsonb_build_object('command_id',p_command_id,'previous_seller_user_id',v_lead.assigned_seller_user_id,
        'seller_user_id',v_destination,'preserved_commercial_state',true));
  return jsonb_build_object('owner_before',v_lead.assigned_seller_user_id,'owner_after',v_destination,
    'assignment_id',v_assignment::text,'reason',v_reason,
    'assigned_at',case when v_type='AssignLead' then v_time else v_lead.assigned_at end,
    'occurred_at',clock_timestamp());
end;
$function$;
alter function private.crm_apply_assignment_command(uuid,uuid) owner to postgres;
revoke all on function private.crm_apply_assignment_command(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.crm_apply_assignment_command(uuid,uuid) to crm_runtime_owner;


-- Fail on an unreviewed legacy trigger helper before replacing its body.
do $baseline$
begin
  if encode(sha256(convert_to(pg_get_functiondef('private.start_contact_sequence_after_assignment()'::regprocedure),'UTF8')),'hex')
      <> '782b94c2dbcb1b7ff426fc037ef022b53c9bdcc308cdbfd861f00d0ca0157eb5' then raise exception 'ASSIGNMENT_CYCLE_HELPER_BASELINE_DRIFT'; end if;
end;
$baseline$;

CREATE OR REPLACE FUNCTION private.start_contact_sequence_after_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_context jsonb;
begin
  -- A durable adoption closes the legacy automatic reset. Only a validated
  -- Assignment receipt can reach this branch; no routing_reason/GUC bypass.
  if private.crm_assignment_is_adopted(new.id) then
    if tg_op='UPDATE' and old.assigned_seller_user_id is not distinct from new.assigned_seller_user_id then
      return new;
    end if;
    v_context:=private.crm_assignment_authorization(new.id);
    if v_context is null or v_context->>'command_type' not in ('AssignLead','TransferLead') then
      raise exception using errcode='55000',message='WRITER_FENCED';
    end if;
    return new;
  end if;
  if new.assigned_seller_user_id is not null
    and tg_op = 'INSERT'
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.create_lead_contact_sequence(
      new.id,
      new.assigned_seller_user_id,
      greatest(coalesce(new.assigned_at, now()), now())
    );

  elsif new.assigned_seller_user_id is not null
    and old.assigned_seller_user_id is distinct from new.assigned_seller_user_id
    and coalesce(new.routing_reason, '') <> 'recall_reactivated'
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.start_lead_crm_cycle(
      new.id,
      coalesce(new.assigned_by_user_id, new.assigned_seller_user_id),
      case
        when new.routing_reason = 'authorized_reactivation' then 'reactivation'
        when old.assigned_seller_user_id is null then 'assignment'
        else 'transfer'
      end,
      case
        when new.routing_reason = 'authorized_reactivation' then 'Lead reactivado con autorización'
        when old.assigned_seller_user_id is null then 'Lead asignado'
        else 'Lead transferido a otro vendedor'
      end
    );
  end if;

  return new;
end;
$function$;


-- M1-04A B fragment: ownership authorization/resolver adaptations only.
-- Assemble inside the candidate migration transaction, after candidate A.
-- Source: exact captured M0 definitions; no business-result logic is changed.
-- Mutation locks are unconditional, including before adoption, so an in-flight
-- legacy mutation serializes with the first adoption. Read policies do not lock.
-- This does not version legacy commercial edits or certify general CRM CAS.
do $assignment_access_preflight$
declare v_proc regprocedure; v_acl text[];
begin
  if to_regprocedure('private.crm_assignment_is_adopted(uuid)') is null then
    raise exception 'ASSIGNMENT_ACCESS_ADOPTION_REQUIRED';
  end if;

  v_proc := to_regprocedure('public.complete_contact_task(uuid, text, text)');
  if v_proc is null or encode(sha256(convert_to(pg_get_functiondef(v_proc), 'UTF8')), 'hex')
       <> '1fa03660a0d5bcbc4decadb41c91a07a13916663ef1ff13750625db5d039bbc8' then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_BASELINE_DRIFT: %', 'public.complete_contact_task(uuid, text, text)';
  end if;
  select array_agg(a::text order by a::text) into v_acl
    from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = v_proc;
  if (select proowner from pg_proc where oid = v_proc) <> 'postgres'::regrole
     or v_acl is distinct from array['postgres=X/postgres', 'service_role=X/postgres']::text[] then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_ACL_DRIFT: %', 'public.complete_contact_task(uuid, text, text)';
  end if;

  v_proc := to_regprocedure('public.record_contact_answer_with_transition(uuid, text, text, timestamp with time zone, text, text, timestamp with time zone, text, numeric, text, timestamp with time zone, text, text, text)');
  if v_proc is null or encode(sha256(convert_to(pg_get_functiondef(v_proc), 'UTF8')), 'hex')
       <> 'd5698692879313b264637d5e3a702d69619aa77c548602aac6fddfee1ba6a0c1' then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_BASELINE_DRIFT: %', 'public.record_contact_answer_with_transition(uuid, text, text, timestamp with time zone, text, text, timestamp with time zone, text, numeric, text, timestamp with time zone, text, text, text)';
  end if;
  select array_agg(a::text order by a::text) into v_acl
    from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = v_proc;
  if (select proowner from pg_proc where oid = v_proc) <> 'postgres'::regrole
     or v_acl is distinct from array['authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres']::text[] then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_ACL_DRIFT: %', 'public.record_contact_answer_with_transition(uuid, text, text, timestamp with time zone, text, text, timestamp with time zone, text, numeric, text, timestamp with time zone, text, text, text)';
  end if;

  v_proc := to_regprocedure('public.record_lead_follow_up(uuid, text, text, timestamp with time zone, text, text, timestamp with time zone, text, numeric, text, text, text, text, text)');
  if v_proc is null or encode(sha256(convert_to(pg_get_functiondef(v_proc), 'UTF8')), 'hex')
       <> '19804c2875930510189e74972ee81a78aa4460386fd657082449aff353d4e99d' then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_BASELINE_DRIFT: %', 'public.record_lead_follow_up(uuid, text, text, timestamp with time zone, text, text, timestamp with time zone, text, numeric, text, text, text, text, text)';
  end if;
  select array_agg(a::text order by a::text) into v_acl
    from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = v_proc;
  if (select proowner from pg_proc where oid = v_proc) <> 'postgres'::regrole
     or v_acl is distinct from array['authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres']::text[] then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_ACL_DRIFT: %', 'public.record_lead_follow_up(uuid, text, text, timestamp with time zone, text, text, timestamp with time zone, text, numeric, text, text, text, text, text)';
  end if;

  v_proc := to_regprocedure('public.refresh_due_contact_protocols()');
  if v_proc is null or encode(sha256(convert_to(pg_get_functiondef(v_proc), 'UTF8')), 'hex')
       <> 'e3cf722ebcafefee14eefd350aa80a8fdf68fec300dcb131c541fd68cd9c7bfc' then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_BASELINE_DRIFT: %', 'public.refresh_due_contact_protocols()';
  end if;
  select array_agg(a::text order by a::text) into v_acl
    from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = v_proc;
  if (select proowner from pg_proc where oid = v_proc) <> 'postgres'::regrole
     or v_acl is distinct from array['authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres']::text[] then
    raise exception 'ASSIGNMENT_ACCESS_FUNCTION_ACL_DRIFT: %', 'public.refresh_due_contact_protocols()';
  end if;

  if not exists (
    select 1 from pg_policy p where p.polrelid = 'public.lead_assignments'::regclass
      and p.polname = 'lead_assignments_read_management_or_owner' and p.polcmd = 'r'
      and p.polpermissive and p.polroles = array['authenticated'::regrole::oid]
      and pg_get_expr(p.polqual, p.polrelid) = '(private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management()))'
  ) then raise exception 'ASSIGNMENT_ACCESS_POLICY_BASELINE_DRIFT: %', 'lead_assignments_read_management_or_owner'; end if;

  if not exists (
    select 1 from pg_policy p where p.polrelid = 'public.lead_contact_sequences'::regclass
      and p.polname = 'lead_contact_sequences_read_management_or_owner' and p.polcmd = 'r'
      and p.polpermissive and p.polroles = array['authenticated'::regrole::oid]
      and pg_get_expr(p.polqual, p.polrelid) = '(private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management()))'
  ) then raise exception 'ASSIGNMENT_ACCESS_POLICY_BASELINE_DRIFT: %', 'lead_contact_sequences_read_management_or_owner'; end if;

  if not exists (
    select 1 from pg_policy p where p.polrelid = 'public.lead_contact_tasks'::regclass
      and p.polname = 'lead_contact_tasks_read_management_or_owner' and p.polcmd = 'r'
      and p.polpermissive and p.polroles = array['authenticated'::regrole::oid]
      and pg_get_expr(p.polqual, p.polrelid) = '(private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management()))'
  ) then raise exception 'ASSIGNMENT_ACCESS_POLICY_BASELINE_DRIFT: %', 'lead_contact_tasks_read_management_or_owner'; end if;

end;
$assignment_access_preflight$;

create function private.crm_assignment_assert_current_owner(p_lead_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare v_owner uuid; v_uid uuid; v_role text; v_active boolean;
begin
  if p_lead_id is null then return; end if;
  -- No runtime lock here: the command gateway takes runtime -> lead, while
  -- legacy callers take lead -> task/CRM. A stale RR lead fails on the tuple
  -- touched at adoption/ownership change before trusting an old marker snapshot.
  select assigned_seller_user_id into v_owner
    from public.leads where id = p_lead_id for share;
  if not found then return; end if;
  if not private.crm_assignment_is_adopted(p_lead_id) then return; end if;
  v_uid := auth.uid();
  select role::text, active into v_role, v_active
    from public.profiles where user_id = v_uid;
  if v_uid is null or not found or v_active is distinct from true then
    raise exception using errcode = '42501', message = 'ASSIGNMENT_ACTOR_INACTIVE';
  end if;
  if v_role in ('admin', 'supervisor') then return; end if;
  if v_role <> 'seller' or v_owner is distinct from v_uid then
    raise exception using errcode = '42501', message = 'ASSIGNMENT_CURRENT_OWNER_REQUIRED';
  end if;
end;
$function$;
alter function private.crm_assignment_assert_current_owner(uuid) owner to postgres;
revoke all on function private.crm_assignment_assert_current_owner(uuid)
  from public, anon, authenticated, service_role;

create function private.crm_assignment_current_owner_read(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select private.crm_assignment_is_adopted(p_lead_id) and exists (
    select 1 from public.leads l join public.profiles p
      on p.user_id = l.assigned_seller_user_id
    where l.id = p_lead_id and p.user_id = auth.uid()
      and p.active = true and p.role::text = 'seller'
      and not exists (select 1 from public.sales_cases sc where sc.lead_id = l.id)
  );
$function$;
alter function private.crm_assignment_current_owner_read(uuid) owner to postgres;
revoke all on function private.crm_assignment_current_owner_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.crm_assignment_current_owner_read(uuid) to authenticated;

-- A read capability only: retain legacy historical read attribution for A,
-- and let the current seller B see adopted-lead tasks/sequences/assignments.
-- No row locks: GET/read-only transactions keep working on these policies.

alter policy lead_assignments_read_management_or_owner on public.lead_assignments
  using (((private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management()))) or private.crm_assignment_current_owner_read(lead_id));

alter policy lead_contact_sequences_read_management_or_owner on public.lead_contact_sequences
  using (((private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management()))) or private.crm_assignment_current_owner_read(lead_id));

alter policy lead_contact_tasks_read_management_or_owner on public.lead_contact_tasks
  using (((private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management()))) or private.crm_assignment_current_owner_read(lead_id));

CREATE OR REPLACE FUNCTION public.complete_contact_task(p_task_id uuid, p_outcome text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_task public.lead_contact_tasks%rowtype; v_next public.lead_contact_tasks%rowtype; v_next_task_id uuid; v_previous_status text; v_sequence_finished boolean:=false;
begin
 if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
 if p_outcome='answered' then raise exception 'Una respuesta requiere record_contact_answer_with_transition'; end if;
 if p_outcome not in('no_answer','sent','skipped','invalid','no_interest','requested_no_contact') then raise exception 'Resultado de contacto inválido'; end if;
 if char_length(trim(coalesce(p_note,'')))>3000 then raise exception 'El detalle es demasiado extenso'; end if;
 -- Resolve and lock the canonical lead before taking the task lock.
 perform private.crm_assignment_assert_current_owner(task.lead_id)
   from public.lead_contact_tasks task where task.id=p_task_id;
 select * into v_task from public.lead_contact_tasks where id=p_task_id for update;
 if v_task.id is null or v_task.status<>'pending' then raise exception 'La tarea ya fue procesada o no existe'; end if;
 -- Recheck the row actually locked; historical seller remains provenance.
 perform private.crm_assignment_assert_current_owner(v_task.lead_id);
 if not private.crm_assignment_is_adopted(v_task.lead_id) and v_task.seller_user_id<>v_user_id and not private.current_user_is_management() then raise exception 'La tarea no corresponde a este vendedor'; end if;
 if v_task.channel='call' and p_outcome='sent' then raise exception 'Resultado incompatible con una llamada'; end if;
 if v_task.channel='whatsapp' and p_outcome='no_answer' then raise exception 'Resultado incompatible con WhatsApp'; end if;
 update public.lead_contact_tasks set status=case when p_outcome='skipped' then 'skipped' else 'completed' end,outcome=p_outcome,note=trim(coalesce(p_note,'')),completed_at=now(),completed_by=v_user_id,updated_at=now() where id=p_task_id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(v_task.lead_id,v_user_id,case when v_task.channel='call' then 'contact' else 'follow_up' end,case when v_task.channel='call' then 'Intento de llamada '||v_task.call_attempt||' registrado' else 'WhatsApp de seguimiento '||v_task.message_step||' registrado' end,trim(coalesce(p_note,'')),jsonb_build_object('task_id',v_task.id,'channel',v_task.channel,'outcome',p_outcome,'call_attempt',v_task.call_attempt,'message_step',v_task.message_step));
 if p_outcome in('invalid','no_interest','requested_no_contact') then
  select status into v_previous_status from public.lead_crm where lead_id=v_task.lead_id for update; if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;
  perform private.cancel_lead_contact_protocol(v_task.lead_id,case p_outcome when 'invalid' then 'Contacto inválido' when 'requested_no_contact' then 'Solicitó no ser contactado' else 'El cliente no desea continuar' end);
  update public.lead_crm set status=case when p_outcome='invalid' then 'invalido' else 'desistir' end,status_reason=coalesce(nullif(trim(p_note),''),case when p_outcome='invalid' then 'Contacto inválido' when p_outcome='requested_no_contact' then 'Solicitó no ser contactado' else 'No desea continuar' end),desist_reason=case when p_outcome='no_interest' then 'no_interest' when p_outcome='requested_no_contact' then 'requested_no_contact' else desist_reason end,next_contact_at=null,next_contact_note='',next_contact_source=null,last_contact_at=now(),last_contact_outcome=p_outcome,cold_base_at=null,previous_status=v_previous_status,terminal_at=now(),updated_by=v_user_id,updated_at=now() where lead_id=v_task.lead_id;
  if p_outcome='requested_no_contact' then perform private.apply_lead_opt_out(v_task.lead_id,trim(coalesce(p_note,''))); end if;
 else
  v_next_task_id:=private.sync_protocol_next_action(v_task.sequence_id,v_task.lead_id);
  if v_next_task_id is null then v_sequence_finished:=true; update public.lead_contact_sequences set status='completed',completed_at=now(),stopped_reason='Protocolo CRM V2 procesado por completo',updated_at=now() where id=v_task.sequence_id;
  else select * into v_next from public.lead_contact_tasks where id=v_next_task_id; update public.lead_crm set status=case when p_outcome='no_answer' and status='nuevo' then 'no_contesta' else status end,last_contact_at=now(),last_contact_outcome=p_outcome,updated_by=v_user_id,updated_at=now() where lead_id=v_task.lead_id; end if;
 end if;
 return jsonb_build_object('lead_id',v_task.lead_id,'sequence_finished',v_sequence_finished,'next_task_id',v_next.id,'next_due_at',v_next.due_start);
end; $function$;

CREATE OR REPLACE FUNCTION public.record_contact_answer_with_transition(p_task_id uuid, p_status text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_interview_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_interview_location text DEFAULT ''::text, p_deposit_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_performed_at timestamp with time zone DEFAULT now(), p_interview_mode text DEFAULT NULL::text, p_deposit_validation text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_task public.lead_contact_tasks%rowtype; v_previous_status text; v_next_note text:=left(coalesce(nullif(trim(p_next_contact_note),''),trim(p_note)),1000); v_activity_type text:='status_change'; v_title text;
begin
 if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
 if p_performed_at is null or p_performed_at>now()+interval '5 minutes' then raise exception 'La hora efectiva del contacto no es válida'; end if;
 if char_length(trim(coalesce(p_note,'')))>3000 then raise exception 'El detalle es demasiado extenso'; end if;
 if p_priority not in('low','normal','high') then raise exception 'Prioridad inválida'; end if;
 if p_status not in('contacto_futuro','en_proceso','entrevista','cierre','sena','desistir') then raise exception 'Resultado comercial no permitido después de una respuesta'; end if;
 if p_status='desistir' and p_desist_reason is null then raise exception 'Seleccioná el motivo del desistimiento'; end if;
 if p_status='desistir' and p_desist_reason is not null and p_desist_reason not in('no_interest','conditions_not_viable','chose_other_option','postponed_without_date','requested_no_contact','other') then raise exception 'Motivo de desistimiento inválido'; end if;
 -- Resolve and lock the canonical lead before taking the task lock.
 perform private.crm_assignment_assert_current_owner(task.lead_id)
   from public.lead_contact_tasks task where task.id=p_task_id;
 select * into v_task from public.lead_contact_tasks where id=p_task_id for update;
 if v_task.id is null or v_task.status<>'pending' then raise exception 'La tarea ya fue procesada o no existe'; end if;
 -- Recheck the row actually locked; historical seller remains provenance.
 perform private.crm_assignment_assert_current_owner(v_task.lead_id);
 if not private.crm_assignment_is_adopted(v_task.lead_id) and v_task.seller_user_id<>v_user_id and not private.current_user_is_management() then raise exception 'La tarea no corresponde a este vendedor'; end if;
 select status into v_previous_status from public.lead_crm where lead_id=v_task.lead_id for update;
 if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;
 if v_previous_status not in('nuevo','no_contesta') then raise exception 'El Lead ya no está en Nuevo ni en Sin contacto'; end if;
 if not private.crm_transition_allowed(v_previous_status,p_status) then raise exception 'Transición comercial no permitida: % → %',v_previous_status,p_status; end if;
 if p_status in('contacto_futuro','en_proceso') and(p_next_contact_at is null or p_next_contact_at<=now()) then if p_status='en_proceso' then raise exception 'En gestión requiere un próximo contacto con fecha y hora'; else raise exception 'Programá el contacto solicitado'; end if; end if;
 if p_status='entrevista' and(p_interview_at is null or p_interview_at<=now()) then raise exception 'Indicá la fecha y hora futura de la entrevista'; end if;
 if p_status='entrevista' and p_interview_mode not in('presencial','videollamada') then raise exception 'La entrevista debe ser Presencial o Videollamada'; end if;
 if p_status='sena' and(p_deposit_amount is null or p_deposit_amount<=0) then raise exception 'Indicá el importe de la seña'; end if;
 if p_status='desistir' and char_length(trim(coalesce(p_note,'')))<3 then raise exception 'Indicá el motivo para este estado'; end if;
 update public.lead_contact_tasks set status='completed',outcome='answered',note=trim(coalesce(p_note,'')),completed_at=now(),performed_at=p_performed_at,recorded_at=now(),completed_by=v_user_id,updated_at=now() where id=v_task.id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(v_task.lead_id,v_user_id,case when v_task.channel='call' then 'contact' else 'follow_up' end,case when v_task.channel='call' then 'Intento de llamada '||v_task.call_attempt||' contestado' else 'WhatsApp de seguimiento '||v_task.message_step||' contestado' end,trim(coalesce(p_note,'')),jsonb_build_object('task_id',v_task.id,'channel',v_task.channel,'outcome','answered','call_attempt',v_task.call_attempt,'message_step',v_task.message_step,'performed_at',p_performed_at,'recorded_at',now()));
 perform private.cancel_lead_contact_protocol(v_task.lead_id,'El cliente respondió');
 if p_status='entrevista' then v_activity_type:='interview'; end if; if p_status in('contacto_futuro','en_proceso') then v_activity_type:='follow_up'; end if; if p_status='en_proceso' then v_activity_type:='contact'; end if;
 v_title:=case p_status when 'contacto_futuro' then 'El cliente pidió contacto futuro' when 'en_proceso' then 'Contacto en proceso' when 'entrevista' then 'Entrevista programada' when 'cierre' then 'Oportunidad en cierre' when 'sena' then 'Seña registrada' when 'desistir' then 'Oportunidad desistida' end;
 update public.lead_crm set status=p_status,priority=case when p_status='cierre' then 'high' else p_priority end,status_reason=case when p_status='desistir' then trim(coalesce(p_note,'')) else status_reason end,desist_reason=case when p_status='desistir' then p_desist_reason else desist_reason end,next_contact_at=case when p_status in('contacto_futuro','en_proceso') then p_next_contact_at else null end,next_contact_note=case when p_status in('contacto_futuro','en_proceso') then v_next_note else '' end,next_contact_source=case when p_status in('contacto_futuro','en_proceso') then 'manual' else null end,last_contact_at=p_performed_at,last_contact_outcome='answered',interview_at=case when p_status='entrevista' then p_interview_at else interview_at end,interview_location=case when p_status='entrevista' then trim(coalesce(p_interview_location,'')) else interview_location end,interview_mode=case when p_status='entrevista' then p_interview_mode else interview_mode end,interview_operational_status=case when p_status='entrevista' then 'scheduled' else interview_operational_status end,interview_objective=case when p_status='entrevista' then trim(coalesce(p_note,'')) else interview_objective end,final_objection=case when p_status='cierre' then trim(coalesce(p_note,'')) else final_objection end,deposit_amount=case when p_status='sena' then p_deposit_amount else deposit_amount end,deposit_at=case when p_status='sena' then now() else deposit_at end,deposit_validation=case when p_status='sena' then trim(coalesce(p_deposit_validation,'')) else deposit_validation end,cold_base_at=null,previous_status=case when p_status='desistir' then v_previous_status else previous_status end,terminal_at=case when p_status='desistir' then now() else null end,updated_by=v_user_id,updated_at=now() where lead_id=v_task.lead_id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(v_task.lead_id,v_user_id,v_activity_type,v_title,trim(coalesce(p_note,'')),jsonb_build_object('previous_status',v_previous_status,'status',p_status,'desist_reason',case when p_status='desistir' then p_desist_reason else null end,'next_contact_at',case when p_status in('contacto_futuro','en_proceso') then p_next_contact_at else null end,'next_contact_note',case when p_status in('contacto_futuro','en_proceso') then v_next_note else null end,'next_contact_source',case when p_status in('contacto_futuro','en_proceso') then 'manual' else null end,'interview_at',p_interview_at,'interview_location',trim(coalesce(p_interview_location,'')),'deposit_amount',p_deposit_amount,'performed_at',p_performed_at));
 if p_status='desistir' and p_desist_reason='requested_no_contact' then perform private.apply_lead_opt_out(v_task.lead_id,trim(coalesce(p_note,''))); end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.record_lead_follow_up(p_lead_id uuid, p_status text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_interview_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_interview_location text DEFAULT ''::text, p_deposit_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_interview_mode text DEFAULT NULL::text, p_interview_operational_status text DEFAULT NULL::text, p_deposit_validation text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_is_management boolean; v_previous_status text; v_seller uuid; v_activity_type text:='status_change'; v_title text; v_next_note text:=left(coalesce(nullif(trim(coalesce(p_note,'')),''),'Próximo contacto programado'),1000);
begin
 if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
 perform private.crm_assignment_assert_current_owner(p_lead_id);
 v_is_management:=private.current_user_is_management();
 if not v_is_management and not exists(select 1 from public.leads where id=p_lead_id and assigned_seller_user_id=v_user_id) then raise exception 'El lead no está asignado a este vendedor'; end if;
 if p_status='nuevo' then raise exception 'Nuevo es un estado de ingreso. Seleccioná el resultado de la gestión'; end if;
 if p_status is null or p_status not in('no_contesta','contacto_futuro','en_proceso','invalido','entrevista','cierre','sena','desistir') then raise exception 'Estado comercial inválido'; end if;
 if p_priority not in('low','normal','high') then raise exception 'Prioridad inválida'; end if;
 if char_length(trim(coalesce(p_note,'')))>3000 then raise exception 'El detalle es demasiado extenso'; end if;
 if p_status in('contacto_futuro','en_proceso','cierre','sena') and p_next_contact_at is null then raise exception 'Programá el próximo contacto'; end if;
 if p_status<>'no_contesta' and p_next_contact_at is not null and p_next_contact_at<=now() then raise exception 'El próximo contacto debe quedar programado a futuro'; end if;
 if p_status='entrevista' and p_interview_at is null then raise exception 'Indicá la fecha y hora de la entrevista'; end if;
 if p_status='entrevista' and p_interview_mode not in('presencial','videollamada') then raise exception 'La entrevista debe ser Presencial o Videollamada'; end if;
 if p_status='sena' and(p_deposit_amount is null or p_deposit_amount<=0) then raise exception 'Indicá el importe de la seña'; end if;
 if p_status in('invalido','desistir') and char_length(trim(coalesce(p_note,'')))<3 then raise exception 'Indicá el motivo para este estado'; end if;
 if p_status='desistir' and p_desist_reason is null then raise exception 'Seleccioná el motivo del desistimiento'; end if;
 if p_status='desistir' and p_desist_reason is not null and p_desist_reason not in('no_interest','conditions_not_viable','chose_other_option','postponed_without_date','requested_no_contact','other') then raise exception 'Motivo de desistimiento inválido'; end if;
 select status into v_previous_status from public.lead_crm where lead_id=p_lead_id for update;
 if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;
 if not private.crm_transition_allowed(v_previous_status,p_status) then raise exception 'Transición comercial no permitida: % → %',v_previous_status,p_status; end if;
 if p_status='entrevista' then v_activity_type:='interview'; end if;
 if p_status in('no_contesta','contacto_futuro') or p_next_contact_at is not null then v_activity_type:='follow_up'; end if;
 if p_status in('en_proceso','invalido') then v_activity_type:='contact'; end if;
 v_title:=case p_status when 'no_contesta' then 'El cliente no respondió' when 'contacto_futuro' then 'El cliente pidió contacto futuro' when 'en_proceso' then 'Contacto en proceso' when 'invalido' then 'Contacto inválido o erróneo' when 'entrevista' then 'Entrevista programada' when 'cierre' then 'Oportunidad en cierre' when 'sena' then 'Seña registrada' when 'desistir' then 'Oportunidad desistida' end;
 if p_status<>'no_contesta' then perform private.cancel_lead_contact_protocol(p_lead_id,'Gestión manual registrada'); end if;
 update public.lead_crm set status=p_status,priority=case when p_status='cierre' then 'high' else p_priority end,status_reason=case when p_status in('invalido','desistir') then trim(coalesce(p_note,'')) else status_reason end,desist_reason=case when p_status='desistir' then p_desist_reason else desist_reason end,next_contact_at=case when p_status in('no_contesta','desistir','invalido') then null else p_next_contact_at end,next_contact_note=case when p_status in('no_contesta','desistir','invalido') or p_next_contact_at is null then '' else v_next_note end,next_contact_source=case when p_status in('no_contesta','desistir','invalido') or p_next_contact_at is null then null else 'manual' end,last_contact_at=now(),last_contact_outcome=trim(coalesce(p_contact_outcome,'')),interview_at=coalesce(p_interview_at,interview_at),interview_location=case when p_interview_at is not null then trim(coalesce(p_interview_location,'')) else interview_location end,interview_mode=case when p_status='entrevista' then p_interview_mode else interview_mode end,interview_operational_status=case when p_status='entrevista' then coalesce(p_interview_operational_status,'scheduled') when v_previous_status='entrevista' then 'completed' else interview_operational_status end,interview_objective=case when p_status='entrevista' then trim(coalesce(p_note,'')) else interview_objective end,final_objection=case when p_status='cierre' then trim(coalesce(p_note,'')) else final_objection end,deposit_amount=coalesce(p_deposit_amount,deposit_amount),deposit_at=case when p_status='sena' then now() else deposit_at end,deposit_validation=case when p_status='sena' then trim(coalesce(p_deposit_validation,'')) else deposit_validation end,cold_base_at=null,previous_status=case when p_status in('desistir','invalido') then v_previous_status else previous_status end,terminal_at=case when p_status in('desistir','invalido') then now() else null end,updated_by=v_user_id,updated_at=now() where lead_id=p_lead_id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(p_lead_id,v_user_id,v_activity_type,v_title,trim(coalesce(p_note,'')),jsonb_build_object('previous_status',v_previous_status,'status',p_status,'desist_reason',case when p_status='desistir' then p_desist_reason else null end,'next_contact_at',case when p_status='no_contesta' then null else p_next_contact_at end,'next_contact_note',case when p_status='no_contesta' or p_next_contact_at is null then null else v_next_note end,'next_contact_source',case when p_status='no_contesta' or p_next_contact_at is null then null else 'manual' end,'interview_at',p_interview_at,'interview_location',trim(coalesce(p_interview_location,'')),'interview_mode',p_interview_mode,'deposit_amount',p_deposit_amount));
 if p_status='desistir' and p_desist_reason='requested_no_contact' then perform private.apply_lead_opt_out(p_lead_id,trim(coalesce(p_note,''))); end if;
 if p_status='no_contesta' then select assigned_seller_user_id into v_seller from public.leads where id=p_lead_id; if private.create_lead_contact_sequence(p_lead_id,v_seller,now()) is null then raise exception 'No se pudo iniciar el protocolo CRM V2'; end if; end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.refresh_due_contact_protocols()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_management boolean;
  v_sequence record;
  v_unfinished_exists boolean;
  v_next_task_id uuid;
  v_skipped integer;
  v_skipped_total integer := 0;
  v_sequences_touched integer := 0;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;
  v_is_management := private.current_user_is_management();
  for v_sequence in
    select sequence.id, sequence.lead_id
    from public.lead_contact_sequences sequence
    join public.leads lead on lead.id = sequence.lead_id
    join public.lead_crm crm on crm.lead_id = sequence.lead_id
    where sequence.status = 'active'
      and crm.status in ('nuevo', 'no_contesta')
      and lead.closed_at is null
      and not coalesce(lead.do_not_contact, false)
      and (v_is_management or case
        when private.crm_assignment_is_adopted(sequence.lead_id)
          then lead.assigned_seller_user_id = v_user_id
        else sequence.seller_user_id = v_user_id end)
    order by sequence.started_at, sequence.id
  loop
    -- Lock lead before sequence. Recheck both scope and pending eligibility
    -- after waiting; the outer scan may have preceded a transfer/other update.
    perform private.crm_assignment_assert_current_owner(v_sequence.lead_id);
    perform sequence.id
    from public.lead_contact_sequences sequence
    join public.leads lead on lead.id = sequence.lead_id
    join public.lead_crm crm on crm.lead_id = sequence.lead_id
    where sequence.id = v_sequence.id and sequence.lead_id = v_sequence.lead_id
      and sequence.status = 'active'
      and crm.status in ('nuevo', 'no_contesta')
      and lead.closed_at is null
      and not coalesce(lead.do_not_contact, false)
      and (v_is_management or case
        when private.crm_assignment_is_adopted(sequence.lead_id)
          then lead.assigned_seller_user_id = v_user_id
        else sequence.seller_user_id = v_user_id end)
    for update of sequence;
    if not found then continue; end if;
    v_next_task_id := null;
    v_skipped := 0;
    update public.lead_contact_tasks task
    set status = 'skipped',
        outcome = 'skipped',
        note = case when trim(coalesce(task.note, '')) = '' then 'No realizada: ventana vencida' else task.note end,
        completed_at = coalesce(task.completed_at, now()),
        completed_by = null,
        performed_at = null,
        recorded_at = coalesce(task.recorded_at, now()),
        updated_at = now()
    where task.sequence_id = v_sequence.id
      and task.status in ('pending', 'scheduled')
      and task.due_end <= now();
    get diagnostics v_skipped = row_count;
    if v_skipped > 0 then
      v_skipped_total := v_skipped_total + v_skipped;
      v_sequences_touched := v_sequences_touched + 1;
      insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
      values (
        v_sequence.lead_id,
        null,
        'follow_up',
        'Intentos vencidos registrados como no realizados',
        v_skipped || ' tarea(s) vencida(s) se omitieron sin inventar un contacto.',
        jsonb_build_object(
          'sequence_id', v_sequence.id,
          'skipped_count', v_skipped,
          'reason', 'window_expired_without_recorded_attempt',
          'origin', 'protocol_clock'
        )
      );
    end if;
    select exists (
      select 1 from public.lead_contact_tasks task
      where task.sequence_id = v_sequence.id and task.status in ('pending', 'scheduled')
    ) into v_unfinished_exists;
    if not v_unfinished_exists then
      update public.lead_contact_sequences
      set status = 'completed',
          completed_at = coalesce(completed_at, now()),
          stopped_reason = case when v_skipped > 0 then 'Calendario finalizado con intentos no realizados' else coalesce(stopped_reason, 'Protocolo finalizado') end,
          updated_at = now()
      where id = v_sequence.id and status = 'active';
      continue;
    end if;
    select task.id into v_next_task_id
    from public.lead_contact_tasks task
    where task.sequence_id = v_sequence.id and task.status in ('pending', 'scheduled')
    order by task.sequence_order
    limit 1
    for update;
    if v_next_task_id is not null then
      update public.lead_contact_tasks
      set status = 'pending',
          updated_at = case when status <> 'pending' then now() else updated_at end
      where id = v_next_task_id;
    end if;
  end loop;
  return jsonb_build_object('sequences_touched', v_sequences_touched, 'tasks_skipped', v_skipped_total);
end;
$function$;


-- Final restrictive check for the three demonstrated bypass/TOCTOU surfaces.
-- Existing permissions still govern management, sales-admin and system work;
-- this trigger grants no capability and never changes business results.
create function private.crm_assignment_guard_commercial_seller()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_role text; v_lead_id uuid; v_resources uuid[];
begin
  select role::text into v_role from public.profiles where user_id = v_uid;
  if v_role = 'seller' then
    if tg_op = 'INSERT' then v_resources := array[new.lead_id];
    elsif tg_op = 'DELETE' then v_resources := array[old.lead_id];
    else v_resources := array[old.lead_id, new.lead_id]; end if;
    for v_lead_id in
      select distinct lead_id from unnest(v_resources) as resources(lead_id)
        where lead_id is not null order by lead_id
    loop
      perform private.crm_assignment_assert_current_owner(v_lead_id);
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
alter function private.crm_assignment_guard_commercial_seller() owner to postgres;
revoke all on function private.crm_assignment_guard_commercial_seller()
  from public, anon, authenticated, service_role;

create trigger lead_crm_assignment_current_owner
  before insert or update or delete on public.lead_crm
  for each row execute function private.crm_assignment_guard_commercial_seller();
create trigger sales_quotes_assignment_current_owner
  before insert or update or delete on public.sales_quotes
  for each row execute function private.crm_assignment_guard_commercial_seller();
create trigger vehicle_appraisals_assignment_current_owner
  before insert or update or delete on public.vehicle_appraisals
  for each row execute function private.crm_assignment_guard_commercial_seller();

comment on function private.crm_assignment_assert_current_owner(uuid) is
  'M1-04A ownership check only. Locks canonical lead before checking durable adoption and active current seller; no runtime writes/locks and no commercial-result redesign.';
comment on function private.crm_assignment_current_owner_read(uuid) is
  'Read-only added access for the active current seller of an adopted lead. Historical read policies remain; mutation authorization is separately locked.';
comment on function private.crm_assignment_guard_commercial_seller() is
  'Restrictive current-owner recheck on lead_crm, sales_quotes and vehicle_appraisals only. Closes demonstrated historical-owner/TOCTOU paths; other authority rules remain in force.';


-- Candidate B engine fragment. Assemble inside the candidate transaction after
-- its receipt/event DDL and closed privileged assignment helpers. Foundation
-- normalization/execution functions are intentionally not replaced.

create function private.crm_normalize_assignment_command(p_envelope jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_required text[] := array['schema_version','command_id','command_type','idempotency_key','scope','expected_versions','payload','policy_version_seen'];
  v_allowed text[] := array['schema_version','command_id','command_type','idempotency_key','scope','expected_versions','payload','policy_version_seen','causation','correlation_id'];
  v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_label text := '^[A-Za-z0-9._:-]{1,128}$';
  v_type text; v_command uuid; v_lead uuid; v_versions jsonb; v_gate jsonb;
  v_scope text; v_payload jsonb; v_reason text; v_key text; v_cause jsonb := 'null'::jsonb;
begin
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  if octet_length(private.crm_canonical_json(p_envelope)) > 65536 then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  if exists(select 1 from jsonb_object_keys(p_envelope) k(key) where not key=any(v_allowed)) then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  if not p_envelope ?& v_required then
    raise exception using errcode='22023', message='COMMAND_METADATA_REQUIRED';
  end if;
  if p_envelope->'schema_version' <> '1'::jsonb then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  v_type := p_envelope->>'command_type';
  if v_type is null or v_type not in ('AssignLead','TransferLead','AcknowledgeLeadAssignment') then
    raise exception using errcode='22023', message='UNSUPPORTED_COMMAND';
  end if;
  if jsonb_typeof(p_envelope->'command_id') <> 'string'
     or char_length(p_envelope->>'command_id') <> 36 or not (p_envelope->>'command_id' ~ v_uuid)
     or jsonb_typeof(p_envelope->'idempotency_key') <> 'string'
     or not (p_envelope->>'idempotency_key' ~ v_label)
     or jsonb_typeof(p_envelope->'policy_version_seen') <> 'string'
     or not (p_envelope->>'policy_version_seen' ~ v_label) then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  v_command := (p_envelope->>'command_id')::uuid;
  if not private.crm_json_keys(p_envelope->'scope',array['lead_id'])
     or jsonb_typeof(p_envelope#>'{scope,lead_id}') <> 'string'
     or char_length(p_envelope#>>'{scope,lead_id}') <> 36
     or not (p_envelope#>>'{scope,lead_id}' ~ v_uuid) then
    raise exception using errcode='22023', message='INVALID_SCOPE';
  end if;
  v_lead := (p_envelope#>>'{scope,lead_id}')::uuid;
  v_versions := p_envelope->'expected_versions';
  if not private.crm_json_keys(v_versions,array['lead_aggregate_version','assignment_epoch','gates'])
     or not private.crm_json_integer(v_versions->'lead_aggregate_version')
     or not private.crm_json_integer(v_versions->'assignment_epoch')
     or jsonb_typeof(v_versions->'gates') is distinct from 'array' then
    raise exception using errcode='22023', message='INVALID_VERSIONS';
  end if;
  if jsonb_array_length(v_versions->'gates') <> 1 then
    raise exception using errcode='22023', message='INVALID_VERSIONS';
  end if;
  v_gate := v_versions#>'{gates,0}';
  if not private.crm_json_keys(v_gate,array['domain','scope_key','writer_epoch','revision','contract_version','policy_version'])
     or v_gate->>'domain' is distinct from 'command_owner'
     or v_gate->>'contract_version' is distinct from 'assignment.v1'
     or not private.crm_json_integer(v_gate->'writer_epoch')
     or not private.crm_json_integer(v_gate->'revision')
     or jsonb_typeof(v_gate->'scope_key') <> 'string'
     or jsonb_typeof(v_gate->'policy_version') <> 'string'
     or not (v_gate->>'policy_version' ~ v_label) then
    raise exception using errcode='22023', message='INVALID_VERSIONS';
  end if;
  v_scope := v_gate->>'scope_key';
  if char_length(v_scope) <> 41 or left(v_scope,5) <> 'lead:'
     or not (substring(v_scope from 6) ~ v_uuid) then
    raise exception using errcode='22023', message='INVALID_VERSIONS';
  end if;
  v_scope := 'lead:' || (substring(v_scope from 6)::uuid)::text;
  if v_scope <> 'lead:' || v_lead::text then
    raise exception using errcode='22023', message='INVALID_VERSIONS';
  end if;
  v_gate := v_gate || jsonb_build_object('scope_key',v_scope);

  v_payload := p_envelope->'payload';
  if v_type='AcknowledgeLeadAssignment' then
    if not private.crm_json_keys(v_payload,array[]::text[]) then
      raise exception using errcode='22023', message='INVALID_PAYLOAD';
    end if;
  else
    if (v_type='AssignLead' and not private.crm_json_keys(v_payload,array['seller_user_id','reason']))
       or (v_type='TransferLead' and not private.crm_json_keys(v_payload,array['from_seller_user_id','to_seller_user_id','reason'])) then
      raise exception using errcode='22023', message='INVALID_PAYLOAD';
    end if;
    v_reason := v_payload->>'reason';
    if jsonb_typeof(v_payload->'reason') <> 'string' or char_length(v_reason) not between 1 and 1000
       or v_reason is distinct from btrim(v_reason,' ') then
      raise exception using errcode='22023', message='INVALID_PAYLOAD';
    end if;
    foreach v_key in array case when v_type='AssignLead' then array['seller_user_id']
      else array['from_seller_user_id','to_seller_user_id'] end loop
      if jsonb_typeof(v_payload->v_key) <> 'string' or char_length(v_payload->>v_key) <> 36
         or not (v_payload->>v_key ~ v_uuid) then
        raise exception using errcode='22023', message='INVALID_PAYLOAD';
      end if;
      v_payload := v_payload || jsonb_build_object(v_key,(v_payload->>v_key)::uuid);
    end loop;
  end if;
  if p_envelope ? 'causation' and p_envelope->'causation' <> 'null'::jsonb then
    if not private.crm_json_keys(p_envelope->'causation',array['event_id'])
       or jsonb_typeof(p_envelope#>'{causation,event_id}') <> 'string'
       or char_length(p_envelope#>>'{causation,event_id}') <> 36
       or not (p_envelope#>>'{causation,event_id}' ~ v_uuid) then
      raise exception using errcode='22023', message='INVALID_CAUSATION';
    end if;
    v_cause := jsonb_build_object('event_id',(p_envelope#>>'{causation,event_id}')::uuid);
  end if;
  if p_envelope ? 'correlation_id' and (
    jsonb_typeof(p_envelope->'correlation_id') <> 'string'
    or char_length(p_envelope->>'correlation_id') <> 36
    or not (p_envelope->>'correlation_id' ~ v_uuid)) then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  return jsonb_build_object(
    'schema_version',1,'command_id',v_command,'command_type',v_type,
    'idempotency_key',p_envelope->>'idempotency_key','scope',jsonb_build_object('lead_id',v_lead),
    'expected_versions',v_versions||jsonb_build_object('gates',jsonb_build_array(v_gate)),
    'payload',v_payload,'causation',v_cause,
    'correlation_id',coalesce((p_envelope->>'correlation_id')::uuid,v_command),
    'policy_version_seen',p_envelope->>'policy_version_seen'
  );
end;
$function$;

create function private.crm_execute_assignment_command(p_envelope jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_env jsonb; v_actor jsonb; v_scope jsonb; v_target jsonb; v_intent jsonb; v_hash text;
  v_command uuid; v_lead uuid; v_uid uuid; v_owner uuid; v_destination uuid; v_subject text;
  v_type text; v_project text; v_scope_key text; v_role text; v_scope_error text; v_target_error text;
  v_policy private.crm_runtime_policies%rowtype;
  v_receipt private.crm_command_receipts%rowtype;
  v_runtime private.crm_lead_runtime%rowtype;
  v_gate private.crm_runtime_gates%rowtype;
  v_adoption private.crm_assignment_adoptions%rowtype;
  v_gate_vector jsonb := '[]'::jsonb; v_error text; v_new boolean := false;
  v_result jsonb; v_effect jsonb; v_event uuid; v_cause uuid; v_occurred timestamptz;
  v_next_aggregate bigint; v_next_epoch bigint; v_event_type text;
begin
  begin
    v_env := private.crm_normalize_assignment_command(p_envelope);
  exception when sqlstate '22023' or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('status','rejected','error_code',case when sqlstate='22023' then sqlerrm else 'INVALID_ENVELOPE' end);
  end;
  v_actor := private.crm_foundation_actor(false);
  if v_actor ? 'error_code' then
    return jsonb_build_object('status','rejected','error_code',v_actor->>'error_code');
  end if;
  v_subject := v_actor->>'actor_subject'; v_uid := (v_actor->>'user_id')::uuid;
  v_command := (v_env->>'command_id')::uuid; v_type := v_env->>'command_type';
  v_lead := (v_env#>>'{scope,lead_id}')::uuid; v_scope_key := 'lead:' || v_lead::text;
  select * into v_policy from private.crm_runtime_policies where policy_version=v_env->>'policy_version_seen';
  if not found then
    return jsonb_build_object('status','rejected','command_id',v_command,'error_code','POLICY_VERSION_CONFLICT');
  end if;
  select p.snapshot->>'project_ref' into v_project from private.crm_lead_runtime r
    join private.crm_runtime_policies p on p.policy_version=r.policy_version where r.lead_id=v_lead;
  if not found then v_project := v_policy.snapshot->>'project_ref'; end if;
  if v_project is null or v_project is distinct from v_policy.snapshot->>'project_ref' then
    return jsonb_build_object('status','rejected','command_id',v_command,'error_code','POLICY_VERSION_CONFLICT');
  end if;
  v_intent := jsonb_build_object('schema_version',1,'command_type',v_type,'scope',v_env->'scope',
    'actor_subject',v_subject,'expected_versions',v_env->'expected_versions','payload',v_env->'payload',
    'causation',v_env->'causation','policy_version_seen',v_env->>'policy_version_seen');
  v_hash := encode(sha256(convert_to(private.crm_canonical_json(v_intent),'UTF8')),'hex');
  insert into private.crm_command_receipts (
    command_id,schema_version,command_type,project_ref,scope_key,idempotency_key,
    actor_kind,actor_subject,actor_user_id,executor_principal,expected_versions,request_hash,
    request_payload,correlation_id,policy_version,status
  ) values (
    v_command,1,v_type,v_project,v_scope_key,v_env->>'idempotency_key','user',v_subject,v_uid,
    session_user,v_env->'expected_versions',v_hash,v_env,(v_env->>'correlation_id')::uuid,v_policy.policy_version,'evaluating'
  ) on conflict do nothing returning * into v_receipt;
  v_new := found;
  if not v_new then
    select * into v_receipt from private.crm_command_receipts where command_id=v_command for update;
    if not found then
      select * into v_receipt from private.crm_command_receipts
        where project_ref=v_project and actor_subject=v_subject and command_type=v_type
          and scope_key=v_scope_key and idempotency_key=v_env->>'idempotency_key' for update;
    end if;
    if not found then raise exception using errcode='40001',message='CRM_RECEIPT_RETRY'; end if;
    if v_receipt.actor_subject<>v_subject or v_receipt.project_ref<>v_project or v_receipt.command_type<>v_type
       or v_receipt.scope_key<>v_scope_key or v_receipt.idempotency_key<>v_env->>'idempotency_key'
       or v_receipt.request_hash<>v_hash then
      return jsonb_build_object('status','rejected','command_id',v_command,'error_code','IDEMPOTENCY_KEY_REUSED');
    end if;
  end if;

  -- Order: receipt, frozen gate resolution, actor, new target, runtime, lead.
  -- Current authorization precedes replay; gate/CAS/business re-evaluation does
  -- not turn a completed intent into a second execution after timeout or pause.
  lock table private.crm_runtime_gates in share mode;
  v_actor := private.crm_foundation_actor(true);
  if v_actor ? 'error_code' then
    if v_new then delete from private.crm_command_receipts where command_id=v_command; end if;
    return jsonb_build_object('status','rejected','error_code',v_actor->>'error_code');
  end if;
  v_role := v_actor->>'role';
  if (v_type in ('AssignLead','TransferLead') and v_role not in ('admin','supervisor'))
     or (v_type='AcknowledgeLeadAssignment' and v_role<>'seller') then
    v_scope_error := 'FORBIDDEN_COMMAND';
  end if;
  if v_new and v_scope_error is null and v_type in ('AssignLead','TransferLead') then
    v_destination := case when v_type='AssignLead' then (v_env#>>'{payload,seller_user_id}')::uuid
      else (v_env#>>'{payload,to_seller_user_id}')::uuid end;
    v_target := private.crm_assignment_lock_target(v_destination);
    v_target_error := v_target->>'error_code';
  end if;
  select * into v_runtime from private.crm_lead_runtime where lead_id=v_lead for update;
  if not found then v_error := 'RUNTIME_STATE_REQUIRED'; end if;
  v_scope := private.crm_assignment_lock_lead(v_lead);
  if v_scope ? 'error_code' then
    v_scope_error := coalesce(v_scope_error,v_scope->>'error_code');
  else
    v_owner := (v_scope->>'owner_user_id')::uuid;
    if v_type='AcknowledgeLeadAssignment' and v_owner is distinct from v_uid then
      v_scope_error := 'FORBIDDEN_COMMAND';
    end if;
  end if;
  if not v_new then
    if v_scope_error is not null then
      return jsonb_build_object('status','rejected','command_id',v_command,'error_code',v_scope_error);
    end if;
    if v_error is not null then
      return jsonb_build_object('status','rejected','command_id',v_command,'error_code',v_error);
    end if;
    if v_receipt.status='evaluating' then raise exception using errcode='40001',message='CRM_RECEIPT_RETRY'; end if;
    return v_receipt.result || jsonb_build_object('status','replayed','original_status',v_receipt.status,'command_id',v_receipt.command_id);
  end if;
  if v_scope_error is not null then v_error := v_scope_error; end if;

  if v_error is null then
    select * into v_adoption from private.crm_assignment_adoptions where lead_id=v_lead;
    if not found then v_error := 'ASSIGNMENT_NOT_ADOPTED'; end if;
  end if;
  if v_error is null then
    select * into v_gate from private.crm_runtime_gates
      where domain='command_owner' and scope_key=v_scope_key for share;
    if not found then v_error := 'WRITER_FENCED';
    else
      v_gate_vector := jsonb_build_array(jsonb_build_object(
        'domain',v_gate.domain,'scope_key',v_gate.scope_key,'writer_epoch',v_gate.writer_epoch,
        'revision',v_gate.revision,'contract_version',v_gate.contract_version,'policy_version',v_gate.policy_version
      ));
      if v_gate.mode<>'authoritative' or v_gate.contract_version<>'assignment.v1'
         or v_gate.writer_epoch<v_adoption.writer_epoch or v_gate.revision<v_adoption.gate_revision
         or v_gate_vector is distinct from v_env#>'{expected_versions,gates}' then
        v_error := 'WRITER_FENCED';
      elsif v_gate.policy_version<>v_policy.policy_version or v_runtime.policy_version<>v_policy.policy_version then
        v_error := 'POLICY_VERSION_CONFLICT';
      elsif v_runtime.aggregate_version<>(v_env#>>'{expected_versions,lead_aggregate_version}')::bigint
         or v_runtime.assignment_epoch<>(v_env#>>'{expected_versions,assignment_epoch}')::bigint then
        v_error := 'VERSION_CONFLICT';
      elsif v_runtime.aggregate_version>=9007199254740991
         or (v_type in ('AssignLead','TransferLead') and v_runtime.assignment_epoch>=9007199254740991) then
        v_error := 'VERSION_EXHAUSTED';
      elsif v_target_error is not null then v_error := v_target_error;
      elsif v_type='AcknowledgeLeadAssignment' and v_runtime.assignment_received_at is not null then
        v_error := 'ASSIGNMENT_ALREADY_ACKNOWLEDGED';
      end if;
    end if;
  end if;
  if v_error is null and v_env->'causation'<>'null'::jsonb then
    v_cause := (v_env#>>'{causation,event_id}')::uuid;
    if not exists(select 1 from private.crm_events where event_id=v_cause and lead_id=v_lead and project_ref=v_project) then
      v_error := 'INVALID_CAUSATION'; v_cause := null;
    end if;
  end if;

  if v_error is null then
    begin
      update private.crm_command_receipts set assignment_effect_authorized=true,gate_dependencies=v_gate_vector
        where command_id=v_receipt.command_id;
      v_effect := private.crm_apply_assignment_command(v_receipt.command_id,v_lead);
      if v_effect ? 'error_code' then
        -- Roll back all helper effects before recording a business rejection,
        -- even if a future helper accidentally returns an error after DML.
        raise exception using errcode='P0106',message=v_effect->>'error_code';
      end if;
      if not private.crm_json_keys(v_effect,array['owner_before','owner_after','reason','assignment_id','assigned_at','occurred_at'])
         or (v_effect->>'owner_before')::uuid is distinct from v_owner
         or (v_effect->>'owner_after')::uuid is distinct from coalesce(v_destination,v_owner)
         or jsonb_typeof(v_effect->'occurred_at')<>'string'
         or (v_type in ('AssignLead','TransferLead') and (
           jsonb_typeof(v_effect->'assignment_id')<>'string'
           or v_effect->>'reason' is distinct from v_env#>>'{payload,reason}'))
         or (v_type='AcknowledgeLeadAssignment' and (
           v_effect->'assignment_id'<>'null'::jsonb or v_effect->'reason'<>'null'::jsonb)) then
        raise exception using errcode='23514',message='CRM_HANDLER_CONTRACT_VIOLATION';
      end if;
      v_occurred := (v_effect->>'occurred_at')::timestamptz;
      if (v_type='AssignLead' and (v_effect->>'assigned_at')::timestamptz is distinct from v_receipt.created_at)
         or (v_type<>'AssignLead' and (v_effect->>'assigned_at')::timestamptz
           is distinct from (v_scope->>'assigned_at')::timestamptz) then
        raise exception using errcode='23514',message='CRM_HANDLER_CONTRACT_VIOLATION';
      end if;
    exception when sqlstate 'P0106' then v_error := sqlerrm;
    end;
  end if;

  if v_error is null then
    v_next_aggregate := v_runtime.aggregate_version+1;
    v_next_epoch := v_runtime.assignment_epoch+case when v_type='AcknowledgeLeadAssignment' then 0 else 1 end;
    update private.crm_lead_runtime set aggregate_version=v_next_aggregate,assignment_epoch=v_next_epoch,
      assignment_received_at=case when v_type='AcknowledgeLeadAssignment' then v_occurred else null end,
      assignment_received_by=case when v_type='AcknowledgeLeadAssignment' then v_uid else null end,
      updated_at=clock_timestamp() where lead_id=v_lead;
    v_event := gen_random_uuid();
    v_event_type := case v_type when 'AssignLead' then 'LeadAssigned'
      when 'TransferLead' then 'LeadTransferred' else 'LeadAssignmentAcknowledged' end;
    v_destination := (v_effect->>'owner_after')::uuid;
    insert into private.crm_events (
      event_id,command_id,event_index,event_type,schema_version,aggregate_kind,aggregate_id,aggregate_version,
      project_ref,lead_id,actor_user_id,actor_subject,responsible_user_id_at_event,responsible_subject_at_event,
      occurred_at,correlation_id,causation_event_id,policy_version,manifest_id,payload,evidence_refs
    ) values (
      v_event,v_receipt.command_id,0,v_event_type,1,'lead_assignment',v_lead,v_next_aggregate,
      v_project,v_lead,v_uid,v_subject,v_destination,'user:'||v_destination::text,
      v_occurred,v_receipt.correlation_id,v_cause,v_policy.policy_version,v_policy.baseline_manifest_id,
      v_effect||jsonb_build_object('assignment_epoch',v_next_epoch),'[]'::jsonb
    );
    v_result := jsonb_build_object('status','applied','command_id',v_receipt.command_id,
      'resource_ids',jsonb_build_object('lead_id',v_lead,'assignment_id',v_effect->'assignment_id'),
      'event_ids',jsonb_build_array(v_event),
      'versions',jsonb_build_object('lead_aggregate_version',v_next_aggregate,'assignment_epoch',v_next_epoch),
      'obligations','[]'::jsonb,'effects','[]'::jsonb);
    update private.crm_command_receipts set status='applied',result=v_result,decided_at=clock_timestamp(),
      gate_dependencies=v_gate_vector,causation_event_id=v_cause,assignment_effect_authorized=false
      where command_id=v_receipt.command_id;
  else
    v_result := jsonb_build_object('status','rejected','command_id',v_receipt.command_id,'error_code',v_error);
    if v_error='VERSION_CONFLICT' then
      v_result := v_result||jsonb_build_object('current_versions',jsonb_build_object(
        'lead_aggregate_version',v_runtime.aggregate_version,'assignment_epoch',v_runtime.assignment_epoch));
    end if;
    update private.crm_command_receipts set status='rejected',result=v_result,error_code=v_error,
      decided_at=clock_timestamp(),gate_dependencies=v_gate_vector,assignment_effect_authorized=false
      where command_id=v_receipt.command_id;
  end if;
  return v_result;
end;
$function$;

create or replace function public.crm_submit_command(p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
begin
  if jsonb_typeof(p_envelope)='object'
     and p_envelope->>'command_type' in ('AssignLead','TransferLead','AcknowledgeLeadAssignment') then
    return private.crm_execute_assignment_command(p_envelope);
  end if;
  return private.crm_execute_command(p_envelope);
end;
$function$;

alter function private.crm_normalize_assignment_command(jsonb) owner to crm_runtime_owner;
alter function private.crm_execute_assignment_command(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_normalize_assignment_command(jsonb),private.crm_execute_assignment_command(jsonb)
  from public,anon,authenticated,service_role;
-- CREATE OR REPLACE preserves the already-closed gateway ACL. Revoke explicitly
-- as well: installing candidate B never grants the application its new writer.
revoke all on function public.crm_submit_command(jsonb) from public,anon,authenticated,service_role;


comment on function public.crm_submit_command(jsonb) is
  'Closed M1-04A gateway. Assignment handlers require durable adoption and explicit authoritative per-lead gate. FoundationProbe stays non-commercial. No API EXECUTE is installed.';
revoke create on schema private, public from crm_runtime_owner;
grant crm_runtime_owner to postgres with inherit false, set false;
commit;
