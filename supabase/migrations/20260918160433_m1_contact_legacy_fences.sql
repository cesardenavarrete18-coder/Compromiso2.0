begin;

-- Fail atomically before replacing any legacy function on baseline drift.
-- Hashes cover exact pg_proc.prosrc, paired with owner, definer and ACL.
DO $preflight$
declare r record; p record; v_acl text[];
begin
 if to_regclass('private.crm_contact_next_action_adoptions') is null
    or to_regclass('private.crm_contact_runtime') is null
    or to_regprocedure('private.crm_contact_is_adopted(uuid)') is null
    or to_regprocedure('private.crm_contact_authorization(uuid)') is null then
   raise exception 'M1_CONTACT_FOUNDATION_REQUIRED';
 end if;
 for r in select * from (values
('private.cancel_lead_contact_protocol(uuid,text)','35c8d8a86580a2bcb9010c6b546e3cf9','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('private.classify_completed_contact_protocol()','2b380d46640508dfcb0b6909fe5f27d0','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('private.classify_exhausted_contact_protocol(uuid,uuid,text)','535fd72fd7181f8214a6478f608b6d7c','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('private.create_lead_contact_sequence(uuid,uuid,timestamp with time zone)','4df2ba9ae29d71297f933e7c9ac66053','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('private.enforce_en_gestion_next_contact()','c516e81a1494060f6899759938c9a204','postgres',false,ARRAY['postgres=X/postgres']::text[]),
('private.ensure_lead_customer()','61336cb9e76a26a39f84f4f5c00b107b','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('private.keep_protocol_deadlines_out_of_manual_agenda()','50baad34e98737b87b77caedb4639f01','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('private.sync_contact_sequence_with_status()','1e146d77f5395a1663928b7014e7c4d2','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('private.sync_protocol_next_action(uuid,uuid)','ccbfedd011059c2550768bb93cd0891b','postgres',true,ARRAY['postgres=X/postgres']::text[]),
('public.complete_contact_task(uuid,text,text)','d552badd3ad44c9fcdcf49cecb3dcd00','postgres',true,ARRAY['postgres=X/postgres','service_role=X/postgres']::text[]),
('public.complete_contact_task_with_follow_up(uuid,text,text,timestamp with time zone,text)','d7b5f3b5164afad82e1cd0ce0b218c7d','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.record_contact_answer_with_transition(uuid,text,text,text,timestamp with time zone,text,text,timestamp with time zone,text,numeric,text,timestamp with time zone,text,text,text)','b29d080fc94a279f1b28d881322c9530','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.record_contact_answer_with_transition(uuid,text,text,timestamp with time zone,text,text,timestamp with time zone,text,numeric,text,timestamp with time zone,text,text,text)','4355de2adfe5b23e9326bf2e7601b400','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.record_contact_task_result(uuid,text,text,timestamp with time zone)','385b4b880f68aaa586cc6686910df08d','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.record_lead_follow_up(uuid,text,text,timestamp with time zone,text,text,timestamp with time zone,text,numeric,text,text,text,text,text)','4991b76f765a7570f7f65cb591c20b92','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.refresh_due_contact_protocols()','5ad7edd955935b946e7b2f642ac441ee','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.reconcile_lead_contact_protocol(uuid)','adb686286ed68a179e306d689128f2a6','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.record_recall_attempt(uuid,text,text,timestamp with time zone,text,timestamp with time zone,text)','df3bf63be03d363c287ed1c1ae601b66','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.restart_lead_contact_sequence(uuid)','b3ff1f1235718f514e3bf2e171ea896a','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.start_no_contact_protocol_from_future(uuid)','abeb15a817e3cc82da752efc42a54fb1','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('public.supervisor_manage_lead(uuid,text,text,text,text,timestamp with time zone,text,text,text)','1526945f104c3f95c90e2613cecef606','postgres',true,ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]),
('private.crm_assignment_guard_commercial_seller()','a1ea0b4a9425dfcce386e94db0d2728c','postgres',true,ARRAY['postgres=X/postgres']::text[])
 ) expected(signature,body_md5,owner_name,definer,acl) loop
   select prosrc,proowner,prosecdef,proacl into p from pg_proc where oid=to_regprocedure(r.signature);
   if not found then raise exception 'M1_CONTACT_BASELINE_MISSING: %',r.signature; end if;
   select coalesce(array_agg(a::text order by a::text),'{}'::text[]) into v_acl
     from unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a;
   if md5(p.prosrc)<>r.body_md5 or p.proowner::regrole::text<>r.owner_name
      or p.prosecdef is distinct from r.definer or v_acl is distinct from r.acl then
     raise exception 'M1_CONTACT_BASELINE_DRIFT: %',r.signature;
   end if;
 end loop;
 for r in select * from (values
 ('public.lead_crm','lead_crm_assignment_current_owner','private.crm_assignment_guard_commercial_seller()',31),
 ('public.lead_crm','lead_crm_en_gestion_next_contact','private.enforce_en_gestion_next_contact()',23),
 ('public.lead_crm','lead_crm_manual_agenda_on_update','private.keep_protocol_deadlines_out_of_manual_agenda()',19),
 ('public.lead_crm','lead_crm_manual_agenda_on_insert','private.keep_protocol_deadlines_out_of_manual_agenda()',7),
 ('public.lead_crm','lead_crm_sync_contact_sequence','private.sync_contact_sequence_with_status()',17),
 ('public.lead_contact_sequences','lead_contact_sequences_classify_exhausted','private.classify_completed_contact_protocol()',17),
 ('public.leads','leads_ensure_customer','private.ensure_lead_customer()',23)
 ) expected(table_name,trigger_name,function_name,trigger_type) loop
   if not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(r.table_name)
     and t.tgname=r.trigger_name and t.tgfoid=to_regprocedure(r.function_name)
     and t.tgtype=r.trigger_type and t.tgenabled='O' and not t.tgisinternal) then
     raise exception 'M1_CONTACT_TRIGGER_DRIFT: %',r.trigger_name;
   end if;
 end loop;
end;
$preflight$;

-- PSQL-04B-02. Restrictive coexistence fences. No adoption, gate activation,
-- producer, privilege expansion, or external effects are installed here.
-- The final row fences use NOWAIT parent locks: they never wait in inverse
-- CRM/task -> lead order. 55P03/40001 are technical retries, including legacy
-- interleavings during adoption; they must not be converted to business success.

create function private.crm_contact_parent_barrier(p_lead_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $function$
begin
  if p_lead_id is not null then
    perform id from public.leads where id=p_lead_id for share nowait;
  end if;
end;
$function$;
alter function private.crm_contact_parent_barrier(uuid) owner to postgres;
revoke all on function private.crm_contact_parent_barrier(uuid) from public,anon,authenticated,service_role;
grant execute on function private.crm_contact_parent_barrier(uuid) to crm_runtime_owner;

create function private.crm_contact_assert_legacy_writer(p_lead_id uuid,p_error text default 'COMMAND_METADATA_REQUIRED')
returns void language plpgsql volatile security definer set search_path='' as $function$
begin
  -- At RPC entry this is before CRM/task/sequence locks and side effects.
  perform id from public.leads where id=p_lead_id for share;
  if private.crm_contact_is_adopted(p_lead_id) then
    raise exception using errcode='42501',message=case when p_error='DOMAIN_BOUNDARY_REQUIRED'
      then 'DOMAIN_BOUNDARY_REQUIRED' else 'COMMAND_METADATA_REQUIRED' end;
  end if;
end;
$function$;
alter function private.crm_contact_assert_legacy_writer(uuid,text) owner to postgres;
revoke all on function private.crm_contact_assert_legacy_writer(uuid,text) from public,anon,authenticated,service_role;

create function private.crm_contact_guard_legacy_rows()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_lead uuid; v_resources uuid[]; v_context jsonb; v_old jsonb; v_new jsonb;
 v_crm_fields text[]:=array['next_contact_at','next_contact_note','next_contact_source','last_contact_at','last_contact_outcome'];
 v_task_fields text[]:=array['status','outcome','note','completed_at','completed_by','performed_at','recorded_at','updated_at'];
 v_sequence_fields text[]:=array['status','completed_at','stopped_reason','updated_at'];
begin
 if tg_op='INSERT' then v_resources:=array[new.lead_id];
 elsif tg_op='DELETE' then v_resources:=array[old.lead_id];
 else v_resources:=array[old.lead_id,new.lead_id]; end if;
 for v_lead in select distinct x from unnest(v_resources) x where x is not null order by x loop
   perform private.crm_contact_parent_barrier(v_lead);
   if not private.crm_contact_is_adopted(v_lead) then continue; end if;
   -- No creation/deletion/movement of adopted CRM or protocol history, even
   -- with a contact receipt. B mutates only existing obligations.
   if tg_op<>'UPDATE' or new.lead_id is distinct from old.lead_id then
     raise exception using errcode='42501',message='WRITER_FENCED';
   end if;
   v_context:=private.crm_contact_authorization(v_lead);
   v_old:=to_jsonb(old); v_new:=to_jsonb(new);
   if tg_table_name='lead_crm' then
     if v_context is null then
       if (v_new->'next_contact_at') is distinct from (v_old->'next_contact_at')
          or (v_new->'next_contact_note') is distinct from (v_old->'next_contact_note')
          or (v_new->'next_contact_source') is distinct from (v_old->'next_contact_source')
          or (v_new->'last_contact_at') is distinct from (v_old->'last_contact_at')
          or (v_new->'last_contact_outcome') is distinct from (v_old->'last_contact_outcome')
          or (v_new->'cold_base_at') is distinct from (v_old->'cold_base_at') then
         raise exception using errcode='42501',message='COMMAND_METADATA_REQUIRED';
       end if;
     elsif (v_new-(v_crm_fields||array['updated_at','updated_by']))
             is distinct from (v_old-(v_crm_fields||array['updated_at','updated_by'])) then
       raise exception using errcode='42501',message='DOMAIN_BOUNDARY_REQUIRED';
     end if;
   elsif tg_table_name='lead_contact_tasks' then
     if v_context is null then raise exception using errcode='42501',message='COMMAND_METADATA_REQUIRED'; end if;
     if (v_new-v_task_fields) is distinct from (v_old-v_task_fields) then
       raise exception using errcode='42501',message='DOMAIN_BOUNDARY_REQUIRED';
     end if;
   elsif tg_table_name='lead_contact_sequences' then
     if v_context is null then raise exception using errcode='42501',message='COMMAND_METADATA_REQUIRED'; end if;
     if (v_new-v_sequence_fields) is distinct from (v_old-v_sequence_fields) then
       raise exception using errcode='42501',message='DOMAIN_BOUNDARY_REQUIRED';
     end if;
   else raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$function$;
alter function private.crm_contact_guard_legacy_rows() owner to postgres;
revoke all on function private.crm_contact_guard_legacy_rows() from public,anon,authenticated,service_role;
create trigger a00_crm_contact_fence before insert or update or delete on public.lead_crm
 for each row execute function private.crm_contact_guard_legacy_rows();
create trigger a00_crm_contact_fence before insert or update or delete on public.lead_contact_tasks
 for each row execute function private.crm_contact_guard_legacy_rows();
create trigger a00_crm_contact_fence before insert or update or delete on public.lead_contact_sequences
 for each row execute function private.crm_contact_guard_legacy_rows();

create function private.crm_contact_guard_legacy_truncate()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_lead uuid;
begin
 -- TRUNCATE is whole-table. Enumerating the parent tuples detects RR snapshots
 -- predating adoption (its lead tuple is deliberately touched by adoption).
 -- NOWAIT avoids an access-exclusive child -> waiting-parent lock inversion.
 for v_lead in select id from public.leads order by id loop
   perform private.crm_contact_parent_barrier(v_lead);
   if private.crm_contact_is_adopted(v_lead) then
     raise exception using errcode='42501',message='WRITER_FENCED';
   end if;
 end loop;
 return null;
end;
$function$;
alter function private.crm_contact_guard_legacy_truncate() owner to postgres;
revoke all on function private.crm_contact_guard_legacy_truncate() from public,anon,authenticated,service_role;
create trigger a00_crm_contact_truncate before truncate on public.lead_crm
 for each statement execute function private.crm_contact_guard_legacy_truncate();
create trigger a00_crm_contact_truncate before truncate on public.lead_contact_tasks
 for each statement execute function private.crm_contact_guard_legacy_truncate();
create trigger a00_crm_contact_truncate before truncate on public.lead_contact_sequences
 for each statement execute function private.crm_contact_guard_legacy_truncate();
create trigger a00_crm_contact_truncate before truncate on public.leads
 for each statement execute function private.crm_contact_guard_legacy_truncate();

create function private.crm_contact_guard_lead_restriction()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_context jsonb;
begin
 if not private.crm_contact_is_adopted(old.id) then
   if tg_op='DELETE' then return old; end if;
   return new;
 end if;
 if tg_op='DELETE' then raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 if new.customer_id is distinct from old.customer_id then
   raise exception using errcode='42501',message='IDENTITY_RECONCILIATION_REQUIRED';
 end if;
 if row(new.do_not_contact,new.do_not_contact_at,new.do_not_contact_reason)
    is distinct from row(old.do_not_contact,old.do_not_contact_at,old.do_not_contact_reason) then
   v_context:=private.crm_contact_authorization(old.id);
   if v_context is null then raise exception using errcode='42501',message='COMMAND_METADATA_REQUIRED'; end if;
   if not new.do_not_contact or new.do_not_contact_at is null
       or (old.do_not_contact_at is not null and new.do_not_contact_at is distinct from old.do_not_contact_at)
       or (old.do_not_contact_reason<>'' and new.do_not_contact_reason is distinct from old.do_not_contact_reason) then
     raise exception using errcode='42501',message='CONTACT_RESTRICTED';
   end if;
   if v_context->>'command_type'<>'RecordContactOutcome'
       or coalesce(v_context#>>'{payload,outcome}',v_context#>>'{payload,replacement_fact,outcome}','')<>'requested_no_contact' then
     raise exception using errcode='42501',message='WRITER_FENCED';
   end if;
 end if;
 return new;
end;
$function$;
alter function private.crm_contact_guard_lead_restriction() owner to postgres;
revoke all on function private.crm_contact_guard_lead_restriction() from public,anon,authenticated,service_role;
create trigger a00_crm_contact_restriction before update or delete on public.leads
 for each row execute function private.crm_contact_guard_lead_restriction();

create function private.crm_contact_guard_customer_restriction()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_lead uuid; v_any boolean:=false; v_proof boolean:=false; v_context jsonb;
begin
 if tg_op='UPDATE' and row(new.do_not_contact,new.do_not_contact_at,new.do_not_contact_reason)
     is not distinct from row(old.do_not_contact,old.do_not_contact_at,old.do_not_contact_reason) then return new; end if;
 for v_lead in select id from public.leads where customer_id=old.id order by id loop
   perform private.crm_contact_parent_barrier(v_lead);
   if private.crm_contact_is_adopted(v_lead) then
     v_any:=true; v_context:=private.crm_contact_authorization(v_lead);
     if v_context->>'command_type'='RecordContactOutcome'
        and coalesce(v_context#>>'{payload,outcome}',v_context#>>'{payload,replacement_fact,outcome}','')='requested_no_contact' then v_proof:=true; end if;
   end if;
 end loop;
 if v_any then
   if tg_op='DELETE' then raise exception using errcode='42501',message='WRITER_FENCED'; end if;
   if not v_proof then raise exception using errcode='42501',message='COMMAND_METADATA_REQUIRED'; end if;
   if not new.do_not_contact or new.do_not_contact_at is null
       or (old.do_not_contact_at is not null and new.do_not_contact_at is distinct from old.do_not_contact_at)
       or (old.do_not_contact_reason<>'' and new.do_not_contact_reason is distinct from old.do_not_contact_reason) then
     raise exception using errcode='42501',message='CONTACT_RESTRICTED';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$function$;
alter function private.crm_contact_guard_customer_restriction() owner to postgres;
revoke all on function private.crm_contact_guard_customer_restriction() from public,anon,authenticated,service_role;
create trigger a00_crm_contact_customer_restriction before update or delete on public.customers
 for each row execute function private.crm_contact_guard_customer_restriction();
create trigger a00_crm_contact_truncate before truncate on public.customers
 for each statement execute function private.crm_contact_guard_legacy_truncate();

CREATE OR REPLACE FUNCTION private.enforce_en_gestion_next_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
declare v_context jsonb;
begin
 if new.status='en_proceso' and new.next_contact_at is null
    and (tg_op='INSERT' or old.status is distinct from new.status
         or old.next_contact_at is distinct from new.next_contact_at) then
   if private.crm_contact_is_adopted(new.lead_id) then
     v_context:=private.crm_contact_authorization(new.lead_id);
     if v_context is not null and tg_op='UPDATE' and old.status=new.status then
       if exists(select 1 from public.leads l where l.id=new.lead_id and l.do_not_contact) then
         return new;
       end if;
       if v_context->>'command_type'='RecordContactOutcome' and exists(
          select 1 from private.crm_contact_runtime r
          join private.crm_next_actions a on a.lead_id=r.lead_id
          join private.crm_contact_facts f on f.fact_id=a.completed_by_fact_id and f.lead_id=a.lead_id
          where r.lead_id=new.lead_id and r.next_action_required
            and a.status='completed' and a.last_command_id=(v_context->>'command_id')::uuid
            and f.command_id=(v_context->>'command_id')::uuid
            and not f.historical_only
       ) then return new; end if;
     end if;
     raise exception using errcode='23514',message='NEXT_ACTION_REQUIRED';
   end if;
   raise exception 'En gestión requiere un próximo contacto con fecha y hora';
 end if;
 return new;
end;
$function$;
alter function private.enforce_en_gestion_next_contact() owner to postgres;

-- This closed helper narrows the old mixed opt-out to the existing linked
-- customer. No identity upsert, stage, calendar, recall, sender or DNC removal.
create function private.crm_contact_apply_restriction(p_lead_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare v_context jsonb; v_lead public.leads%rowtype; v_customer public.customers%rowtype;
 v_reason text; v_now timestamptz:=clock_timestamp();
begin
 v_context:=private.crm_contact_authorization(p_lead_id);
 if v_context is null or v_context->>'command_type'<>'RecordContactOutcome'
    or coalesce(v_context#>>'{payload,outcome}',v_context#>>'{payload,replacement_fact,outcome}','')<>'requested_no_contact' then
   raise exception using errcode='42501',message='WRITER_FENCED';
 end if;
 select * into v_lead from public.leads where id=p_lead_id for update;
 if not found or v_lead.customer_id is null then
   raise exception using errcode='P0107',message='IDENTITY_RECONCILIATION_REQUIRED';
 end if;
 select * into v_customer from public.customers where id=v_lead.customer_id for update;
 if not found or v_customer.normalized_phone<>regexp_replace(v_lead.customer_phone,'[^0-9]','','g') then
   raise exception using errcode='P0107',message='IDENTITY_RECONCILIATION_REQUIRED';
 end if;
 v_reason:=left(coalesce(nullif(btrim(v_context#>>'{payload,note}'),''),'Solicitud explícita de no contacto'),1000);
 update public.leads set do_not_contact=true,do_not_contact_at=coalesce(do_not_contact_at,v_now),
   do_not_contact_reason=case when do_not_contact_reason='' then v_reason else do_not_contact_reason end
   where id=p_lead_id;
 update public.customers set do_not_contact=true,do_not_contact_at=coalesce(do_not_contact_at,v_now),
   do_not_contact_reason=case when do_not_contact_reason='' then v_reason else do_not_contact_reason end
   where id=v_lead.customer_id;
end;
$function$;
alter function private.crm_contact_apply_restriction(uuid) owner to postgres;
revoke all on function private.crm_contact_apply_restriction(uuid) from public,anon,authenticated,service_role;
grant execute on function private.crm_contact_apply_restriction(uuid) to crm_runtime_owner;

CREATE OR REPLACE FUNCTION private.ensure_lead_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text := regexp_replace(new.customer_phone, '[^0-9]', '', 'g');
  v_customer_id uuid;
begin
  if tg_op='UPDATE' and private.crm_contact_is_adopted(old.id)
      and private.crm_contact_authorization(old.id) is not null then
    -- The B opt-out updates only the already linked identity. The engine also
    -- updates its customer under lead -> customer locks; no upsert is allowed.
    if new.customer_id is distinct from old.customer_id
       or new.customer_phone is distinct from old.customer_phone
       or new.customer_name is distinct from old.customer_name
       or row(new.contact_consent_at,new.contact_consent_source,new.marketing_opt_in,
              new.marketing_opt_in_at,new.marketing_opt_in_source)
          is distinct from row(old.contact_consent_at,old.contact_consent_source,old.marketing_opt_in,
              old.marketing_opt_in_at,old.marketing_opt_in_source)
       or not new.do_not_contact or new.customer_id is null
       or not exists(select 1 from public.customers c where c.id=new.customer_id
                     and c.normalized_phone=v_phone) then
      raise exception using errcode='42501',message='IDENTITY_RECONCILIATION_REQUIRED';
    end if;
    return new;
  end if;
  if char_length(v_phone) < 6 then
    raise exception 'El teléfono del cliente no es válido';
  end if;

  insert into public.customers (
    normalized_phone, primary_phone, full_name, contact_consent_at, contact_consent_source,
    marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source,
    do_not_contact, do_not_contact_at, do_not_contact_reason
  ) values (
    v_phone,
    new.customer_phone,
    new.customer_name,
    new.contact_consent_at,
    new.contact_consent_source,
    new.marketing_opt_in,
    new.marketing_opt_in_at,
    new.marketing_opt_in_source,
    new.do_not_contact,
    new.do_not_contact_at,
    new.do_not_contact_reason
  )
  on conflict (normalized_phone) do update set
    primary_phone = excluded.primary_phone,
    full_name = coalesce(excluded.full_name, public.customers.full_name),
    contact_consent_at = coalesce(public.customers.contact_consent_at, excluded.contact_consent_at),
    contact_consent_source = case when public.customers.contact_consent_source = '' then excluded.contact_consent_source else public.customers.contact_consent_source end,
    marketing_opt_in = public.customers.marketing_opt_in or excluded.marketing_opt_in,
    marketing_opt_in_at = coalesce(public.customers.marketing_opt_in_at, excluded.marketing_opt_in_at),
    marketing_opt_in_source = case when public.customers.marketing_opt_in_source = '' then excluded.marketing_opt_in_source else public.customers.marketing_opt_in_source end,
    do_not_contact = public.customers.do_not_contact or excluded.do_not_contact,
    do_not_contact_at = coalesce(public.customers.do_not_contact_at, excluded.do_not_contact_at),
    do_not_contact_reason = case when public.customers.do_not_contact_reason = '' then excluded.do_not_contact_reason else public.customers.do_not_contact_reason end,
    updated_at = now()
  returning id into v_customer_id;

  new.customer_id := v_customer_id;
  return new;
end;
$function$

;







CREATE OR REPLACE FUNCTION private.keep_protocol_deadlines_out_of_manual_agenda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.crm_contact_is_adopted(new.lead_id) then
    if private.crm_contact_authorization(new.lead_id) is null then
      if tg_op='INSERT' or row(new.next_contact_at,new.next_contact_note,new.next_contact_source)
          is distinct from row(old.next_contact_at,old.next_contact_note,old.next_contact_source) then
        raise exception using errcode='42501',message='COMMAND_METADATA_REQUIRED';
      end if;
      return new;
    end if;
    if new.next_contact_at is null then
      new.next_contact_note:=''; new.next_contact_source:=null;
    else new.next_contact_source:='manual'; end if;
    -- Protocol substitution is an explicit command effect, never a side effect
    -- of writing the compatibility agenda projection.
    return new;
  end if;
  if new.next_contact_at is null then
    new.next_contact_note := '';
    new.next_contact_source := null;
  else
    new.next_contact_source := 'manual';
    if tg_op = 'INSERT'
      or old.next_contact_at is distinct from new.next_contact_at
      or old.next_contact_note is distinct from new.next_contact_note
      or old.next_contact_source is distinct from 'manual'
    then
      perform private.cancel_lead_contact_protocol(
        new.lead_id,
        'Próxima acción manual registrada'
      );
    end if;
  end if;
  return new;
end;
$function$

;



CREATE OR REPLACE FUNCTION private.crm_assignment_guard_commercial_seller()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_role text; v_lead_id uuid; v_resources uuid[]; v_owner uuid; v_active boolean;
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
      if tg_table_name='lead_crm' and private.crm_contact_is_adopted(v_lead_id) then
        -- Preserve A's exact current-owner/active check, but never wait for the
        -- parent after a CRM tuple lock. 55P03 remains a transaction retry.
        select assigned_seller_user_id into v_owner from public.leads
          where id=v_lead_id for share nowait;
        select active into v_active from public.profiles where user_id=v_uid;
        if v_uid is null or not found or v_active is distinct from true then
          raise exception using errcode='42501',message='ASSIGNMENT_ACTOR_INACTIVE';
        end if;
        if v_owner is distinct from v_uid then
          raise exception using errcode='42501',message='ASSIGNMENT_CURRENT_OWNER_REQUIRED';
        end if;
      else
        perform private.crm_assignment_assert_current_owner(v_lead_id);
      end if;
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_contact_task(p_task_id uuid, p_outcome text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_task public.lead_contact_tasks%rowtype; v_next public.lead_contact_tasks%rowtype; v_next_task_id uuid; v_previous_status text; v_sequence_finished boolean:=false;
begin
  perform private.crm_contact_assert_legacy_writer(task.lead_id)
    from public.lead_contact_tasks task where task.id=p_task_id;
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

CREATE OR REPLACE FUNCTION public.record_contact_task_result(p_task_id uuid, p_outcome text, p_note text DEFAULT ''::text, p_performed_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  perform private.crm_contact_assert_legacy_writer(task.lead_id)
    from public.lead_contact_tasks task where task.id=p_task_id;
  if p_outcome = 'answered' then
    raise exception 'Una respuesta requiere record_contact_answer_with_transition';
  end if;
  if p_performed_at is null or p_performed_at > now() + interval '5 minutes' then
    raise exception 'La hora efectiva del contacto no es válida';
  end if;

  v_result := public.complete_contact_task(p_task_id, p_outcome, p_note);

  update public.lead_contact_tasks
  set performed_at = p_performed_at,
      recorded_at = now()
  where id = p_task_id;

  return v_result;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.complete_contact_task_with_follow_up(p_task_id uuid, p_outcome text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.crm_contact_assert_legacy_writer(task.lead_id)
    from public.lead_contact_tasks task where task.id=p_task_id;
  if p_outcome = 'answered' then
    raise exception 'Una respuesta requiere record_contact_answer_with_transition';
  end if;
  return public.complete_contact_task(p_task_id, p_outcome, p_note);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.record_contact_answer_with_transition(p_task_id uuid, p_status text, p_interview_operational_status text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_interview_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_interview_location text DEFAULT ''::text, p_deposit_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_performed_at timestamp with time zone DEFAULT now(), p_interview_mode text DEFAULT NULL::text, p_deposit_validation text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.crm_contact_assert_legacy_writer(task.lead_id)
    from public.lead_contact_tasks task where task.id=p_task_id;
  if p_interview_operational_status is not null
     and p_interview_operational_status <> 'scheduled' then
    raise exception 'Estado operativo de entrevista inválido para una respuesta inicial';
  end if;

  perform public.record_contact_answer_with_transition(
    p_task_id => p_task_id,
    p_status => p_status,
    p_note => p_note,
    p_next_contact_at => p_next_contact_at,
    p_next_contact_note => p_next_contact_note,
    p_contact_outcome => p_contact_outcome,
    p_interview_at => p_interview_at,
    p_interview_location => p_interview_location,
    p_deposit_amount => p_deposit_amount,
    p_priority => p_priority,
    p_performed_at => p_performed_at,
    p_interview_mode => p_interview_mode,
    p_deposit_validation => p_deposit_validation,
    p_desist_reason => p_desist_reason
  );
end;
$function$

;

CREATE OR REPLACE FUNCTION public.record_contact_answer_with_transition(p_task_id uuid, p_status text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_interview_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_interview_location text DEFAULT ''::text, p_deposit_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_performed_at timestamp with time zone DEFAULT now(), p_interview_mode text DEFAULT NULL::text, p_deposit_validation text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_task public.lead_contact_tasks%rowtype; v_previous_status text; v_next_note text:=left(coalesce(nullif(trim(p_next_contact_note),''),trim(p_note)),1000); v_activity_type text:='status_change'; v_title text;
begin
  perform private.crm_contact_assert_legacy_writer(task.lead_id)
    from public.lead_contact_tasks task where task.id=p_task_id;
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
  perform private.crm_contact_assert_legacy_writer(p_lead_id);
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

CREATE OR REPLACE FUNCTION public.restart_lead_contact_sequence(p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_seller uuid;
  v_status text;
  v_next_contact_at timestamptz;
  v_do_not_contact boolean;
begin
  perform private.crm_contact_assert_legacy_writer(p_lead_id);
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select lead.assigned_seller_user_id, crm.status, crm.next_contact_at, coalesce(lead.do_not_contact, false)
  into v_seller, v_status, v_next_contact_at, v_do_not_contact
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  where lead.id = p_lead_id
  for update of lead, crm;

  if not found or v_seller is null then raise exception 'El lead todavía no tiene vendedor'; end if;
  if v_seller <> v_user_id and not private.current_user_is_management() then raise exception 'Acceso no autorizado'; end if;
  if v_do_not_contact or v_status not in ('nuevo', 'no_contesta') then
    raise exception 'El protocolo solo puede reiniciarse para Leads Nuevo o No contesta';
  end if;
  if v_next_contact_at is not null then
    raise exception 'El Lead tiene una próxima acción manual; no se puede reiniciar el protocolo';
  end if;

  perform private.cancel_lead_contact_protocol(p_lead_id, 'Secuencia recomendada reiniciada');
  return private.create_lead_contact_sequence(p_lead_id, v_seller, now());
end;
$function$

;

CREATE OR REPLACE FUNCTION public.reconcile_lead_contact_protocol(p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_seller uuid;
  v_crm_status text;
  v_sequence_id uuid;
  v_new_sequence_id uuid;
  v_recovery_without_active boolean := false;
begin
  perform private.crm_contact_assert_legacy_writer(p_lead_id);
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select lead.assigned_seller_user_id, crm.status
  into v_seller, v_crm_status
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  where lead.id = p_lead_id
  for update of lead, crm;

  if not found then raise exception 'No se encontró el Lead'; end if;
  if v_seller is null then raise exception 'El Lead todavía no tiene vendedor'; end if;
  if v_seller <> v_user_id and not private.current_user_is_management() then
    raise exception 'Acceso no autorizado';
  end if;

  select sequence.id
  into v_sequence_id
  from public.lead_contact_sequences sequence
  where sequence.lead_id = p_lead_id
    and sequence.status = 'active'
  order by sequence.created_at desc
  limit 1
  for update;

  if v_sequence_id is null then
    if v_crm_status <> 'no_contesta' then
      raise exception 'No existe un protocolo activo para reconciliar';
    end if;
    v_recovery_without_active := true;
  else
    if (
      select count(*) = 18
        and count(distinct (protocol_day, protocol_band)) = 9
        and count(distinct (protocol_day, protocol_band, band_attempt)) = 18
        and min(protocol_day) = 1 and max(protocol_day) between 3 and 4
        and bool_and(band_attempt between 1 and 2)
        and bool_and(due_end >= sequence.started_at)
        and bool_and(case protocol_band
          when '10-12' then (due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '10:00'
            and (due_end at time zone 'America/Argentina/Buenos_Aires')::time <= time '12:00'
          when '14-16' then (due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '14:00'
            and (due_end at time zone 'America/Argentina/Buenos_Aires')::time <= time '16:00'
          when '17-19' then (due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '17:00'
            and (due_end at time zone 'America/Argentina/Buenos_Aires')::time <= time '19:00'
          else false end)
      from public.lead_contact_tasks task
      join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
      where task.sequence_id = v_sequence_id and task.channel = 'call'
    ) then
      raise exception 'El protocolo activo ya cumple el contrato CRM V2';
    end if;

    update public.lead_contact_tasks
    set status = 'cancelled', updated_at = now()
    where sequence_id = v_sequence_id and status in ('pending', 'scheduled');

    update public.lead_contact_sequences
    set status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        stopped_reason = 'Reconciliación explícita a protocolo CRM V2',
        updated_at = now()
    where id = v_sequence_id;
  end if;

  -- Sin contacto never mixes a manual commitment with the protocol-driven
  -- next action. The historical manual agenda is cleared before creating the
  -- canonical sequence; create_lead_contact_sequence will set the protocol
  -- next action again.
  if v_crm_status = 'no_contesta' then
    update public.lead_crm
    set next_contact_at = null,
        next_contact_note = '',
        next_contact_source = null,
        updated_by = v_user_id,
        updated_at = now()
    where lead_id = p_lead_id;
  end if;

  insert into public.lead_activities (
    lead_id, actor_user_id, activity_type, title, detail, metadata
  ) values (
    p_lead_id,
    v_user_id,
    'follow_up',
    case when v_recovery_without_active
      then 'Protocolo CRM V2 iniciado'
      else 'Protocolo reconciliado a CRM V2'
    end,
    case when v_recovery_without_active
      then 'El Lead estaba en Sin contacto sin protocolo activo. Se preservó el historial anterior y se inició una secuencia CRM V2.'
      else 'Se conservaron los intentos históricos y se cancelaron únicamente tareas pendientes del protocolo anterior.'
    end,
    jsonb_build_object(
      'previous_sequence_id', v_sequence_id,
      'action', case when v_recovery_without_active
        then 'protocol_v2_recovery'
        else 'protocol_v2_reconciliation'
      end,
      'historical_tasks_preserved', true
    )
  );

  v_new_sequence_id := private.create_lead_contact_sequence(p_lead_id, v_seller, now());
  if v_new_sequence_id is null then
    raise exception 'No se pudo iniciar el protocolo CRM V2';
  end if;

  return v_new_sequence_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.start_no_contact_protocol_from_future(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_seller uuid;
begin
  perform private.crm_contact_assert_legacy_writer(p_lead_id);
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  if not private.current_user_is_management() and not exists (
    select 1 from public.leads where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then raise exception 'El Lead no está asignado a este vendedor'; end if;
  select assigned_seller_user_id into v_seller from public.leads where id = p_lead_id;
  if not exists (select 1 from public.lead_crm where lead_id = p_lead_id and status = 'contacto_futuro' for update) then
    raise exception 'El Lead ya no está en Pide contacto futuro';
  end if;

  update public.lead_crm set
    status = 'no_contesta',
    next_contact_at = null,
    next_contact_note = '',
    next_contact_source = null,
    last_contact_at = now(),
    last_contact_outcome = 'no_answer',
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  if private.create_lead_contact_sequence(p_lead_id, v_seller, now()) is null then
    raise exception 'No se pudo iniciar el protocolo CRM V2';
  end if;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (p_lead_id, v_user_id, 'contact', 'Contacto futuro intentado sin respuesta', '',
    jsonb_build_object('previous_status', 'contacto_futuro', 'status', 'no_contesta', 'performed_at', now(), 'recorded_at', now(), 'outcome', 'no_answer'));
end;
$function$

;

CREATE OR REPLACE FUNCTION public.supervisor_manage_lead(p_lead_id uuid, p_action text, p_status text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_crm public.lead_crm%rowtype;
  v_seller uuid;
  v_previous_status text;
  v_was_scheduled boolean;
  v_next_note text := left(coalesce(
    nullif(trim(coalesce(p_next_contact_note, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    'Próximo contacto programado'
  ), 1000);
begin
  perform private.crm_contact_assert_legacy_writer(p_lead_id,
    case when p_action='status' then 'DOMAIN_BOUNDARY_REQUIRED' else 'COMMAND_METADATA_REQUIRED' end);
  if v_user_id is null or not private.current_user_is_management() then raise exception 'Se requiere permiso de supervisión'; end if;
  if p_action not in ('schedule', 'status', 'management') then raise exception 'Acción de supervisión inválida'; end if;
  select assigned_seller_user_id into v_seller
  from public.leads where id = p_lead_id and assigned_seller_user_id is not null;
  if v_seller is null then raise exception 'No se encontró un Lead asignado'; end if;

  select * into v_crm from public.lead_crm where lead_id = p_lead_id for update;
  if not found then raise exception 'No se encontró la ficha CRM del Lead'; end if;
  if v_crm.status in ('venta', 'desistir', 'invalido') then raise exception 'El Lead ya no se encuentra activo'; end if;

  if p_action = 'schedule' then
    if v_crm.status in ('nuevo', 'no_contesta') then
      raise exception 'El Lead está en %: la próxima acción la define el protocolo, no se puede programar manualmente',
        case v_crm.status when 'nuevo' then 'Nuevo' else 'Sin contacto' end;
    end if;
    if p_next_contact_at is null or p_next_contact_at <= now() then raise exception 'Programá una fecha y hora futura'; end if;
    if char_length(trim(coalesce(p_next_contact_note, ''))) < 3 or char_length(trim(p_next_contact_note)) > 1000 then raise exception 'Indicá el motivo de la próxima acción'; end if;
    v_was_scheduled := v_crm.next_contact_at is not null;
    perform private.cancel_lead_contact_protocol(p_lead_id, 'Próxima acción manual programada por Supervisión');
    update public.lead_crm set
      next_contact_at = p_next_contact_at,
      next_contact_note = trim(p_next_contact_note),
      next_contact_source = 'manual',
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = p_lead_id;
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (p_lead_id, v_user_id, 'follow_up',
      case when v_was_scheduled then 'Próxima acción reprogramada' else 'Próxima acción programada' end,
      trim(p_next_contact_note),
      jsonb_build_object('origin', 'supervisor_portfolio', 'previous_next_contact_at', v_crm.next_contact_at,
        'next_contact_at', p_next_contact_at, 'next_contact_note', trim(p_next_contact_note), 'next_contact_source', 'manual'));
    return;
  end if;

  if p_action = 'status' then
    if p_status is null or p_status not in ('no_contesta', 'en_proceso', 'invalido', 'entrevista', 'cierre', 'sena', 'desistir') then raise exception 'Estado comercial inválido'; end if;
    if p_priority is null or p_priority not in ('low', 'normal', 'high') then raise exception 'Prioridad inválida'; end if;
    if char_length(trim(coalesce(p_note, ''))) > 2000 then raise exception 'La observación es demasiado extensa'; end if;
    if not private.crm_transition_allowed(v_crm.status, p_status) then
      raise exception 'Transición comercial no permitida: % → %', v_crm.status, p_status;
    end if;
    if p_status = 'entrevista' and v_crm.interview_at is null then raise exception 'La Entrevista debe programarse previamente desde la gestión comercial'; end if;
    if p_status = 'sena' and coalesce(v_crm.deposit_amount, 0) <= 0 then raise exception 'La Seña requiere un importe registrado en la gestión comercial'; end if;
    if p_status in ('invalido', 'desistir') and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Indicá el motivo del cambio de estado'; end if;
    if p_status = 'desistir' and p_desist_reason is null then
      raise exception 'Seleccioná el motivo del desistimiento';
    end if;
    if p_status = 'desistir' and p_desist_reason is not null and p_desist_reason not in (
      'no_interest', 'conditions_not_viable', 'chose_other_option',
      'postponed_without_date', 'requested_no_contact', 'other'
    ) then
      raise exception 'Motivo de desistimiento inválido';
    end if;

    v_previous_status := v_crm.status;
    if p_status in ('invalido', 'desistir') then perform private.cancel_lead_contact_protocol(p_lead_id, 'Lead terminal por Supervisión'); end if;

    update public.lead_crm set
      status = p_status,
      priority = case when p_status = 'cierre' then 'high' else p_priority end,
      status_reason = case when p_status in ('invalido', 'desistir') then trim(p_note) else status_reason end,
      desist_reason = case when p_status = 'desistir' then p_desist_reason else desist_reason end,
      next_contact_at = case when p_status in ('invalido', 'desistir', 'no_contesta') then null else next_contact_at end,
      next_contact_note = case when p_status in ('invalido', 'desistir', 'no_contesta') then '' else next_contact_note end,
      next_contact_source = case when p_status in ('invalido', 'desistir', 'no_contesta') then null else next_contact_source end,
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = p_lead_id;

    if p_status = 'desistir' and p_desist_reason = 'requested_no_contact' then
      perform private.apply_lead_opt_out(p_lead_id, trim(coalesce(p_note, '')));
    end if;

    if p_status = 'no_contesta' then
      if private.create_lead_contact_sequence(p_lead_id, v_seller, now()) is null then
        raise exception 'No se pudo iniciar el protocolo CRM V2';
      end if;
    end if;

    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (p_lead_id, v_user_id, 'status_change', 'Estado actualizado por Supervisión', trim(coalesce(p_note, '')),
      jsonb_build_object('origin', 'supervisor_portfolio', 'previous_status', v_previous_status, 'status', p_status,
        'priority', p_priority, 'desist_reason', case when p_status = 'desistir' then p_desist_reason else null end));
    return;
  end if;

  if p_contact_outcome not in ('answered', 'no_answer', 'sent') then raise exception 'Resultado de gestión inválido'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 2 or char_length(trim(p_note)) > 3000 then raise exception 'Describí la gestión realizada'; end if;
  if v_crm.status in ('nuevo', 'no_contesta') and p_contact_outcome = 'answered' then
    raise exception 'Un cliente que contestó desde Nuevo o Sin contacto requiere registrar la respuesta sobre la tarea real del protocolo (Cartera del vendedor o "Contestó" en Supervisión), no la gestión genérica';
  end if;
  if v_crm.status = 'no_contesta' and p_next_contact_at is not null then
    raise exception 'El Lead está en Sin contacto: la próxima acción la define el protocolo, no se puede programar manualmente';
  end if;
  if p_next_contact_at is not null and p_next_contact_at <= now() then raise exception 'La próxima acción debe ser futura'; end if;

  update public.lead_crm set
    last_contact_at = now(),
    last_contact_outcome = p_contact_outcome,
    next_contact_at = case when v_crm.status = 'no_contesta' then next_contact_at else p_next_contact_at end,
    next_contact_note = case when v_crm.status = 'no_contesta' then next_contact_note when p_next_contact_at is null then '' else v_next_note end,
    next_contact_source = case when v_crm.status = 'no_contesta' then next_contact_source when p_next_contact_at is null then null else 'manual' end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;
  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (p_lead_id, v_user_id, case when p_contact_outcome = 'sent' then 'follow_up' else 'contact' end,
    case p_contact_outcome when 'answered' then 'Contacto efectivo registrado por Supervisión'
      when 'no_answer' then 'Intento sin respuesta registrado por Supervisión'
      else 'WhatsApp registrado por Supervisión' end,
    trim(p_note), jsonb_build_object('origin', 'supervisor_portfolio', 'outcome', p_contact_outcome,
      'next_contact_at', p_next_contact_at, 'next_contact_note', case when p_next_contact_at is null then null else v_next_note end,
      'next_contact_source', case when p_next_contact_at is null then null else 'manual' end));
end;
$function$

;

CREATE OR REPLACE FUNCTION public.record_recall_attempt(p_item_id uuid, p_time_band text, p_outcome text, p_contacted_at timestamp with time zone, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_item public.lead_recall_items%rowtype;
  v_attempt smallint;
  v_crm_status text;
  v_lead_do_not_contact boolean;
  v_customer_do_not_contact boolean;
begin
  perform private.crm_contact_assert_legacy_writer(item.lead_id,'DOMAIN_BOUNDARY_REQUIRED')
    from public.lead_recall_items item where item.id=p_item_id;
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select * into v_item
  from public.lead_recall_items
  where id = p_item_id
  for update;

  if not found then raise exception 'No se encontró el rellamado'; end if;
  if v_item.assigned_seller_user_id <> v_user_id
     and not private.current_user_is_management() then
    raise exception 'Este rellamado no está asignado al usuario';
  end if;
  if v_item.status not in ('assigned', 'working') then
    raise exception 'El rellamado ya no admite gestiones';
  end if;
  if p_time_band not in ('10_12', '14_16', '17_19') then
    raise exception 'Franja horaria inválida';
  end if;
  if p_outcome not in ('no_answer', 'answered', 'invalid', 'not_interested') then
    raise exception 'Resultado inválido';
  end if;
  if p_contacted_at is null or p_contacted_at > now() + interval '5 minutes' then
    raise exception 'La fecha de la llamada no es válida';
  end if;
  if exists (
    select 1 from public.lead_recall_attempts
    where recall_item_id = p_item_id and time_band = p_time_band
  ) then
    raise exception 'El segundo llamado debe realizarse en otra franja horaria';
  end if;

  select
    crm.status,
    coalesce(lead.do_not_contact, false),
    coalesce(customer.do_not_contact, false)
  into v_crm_status, v_lead_do_not_contact, v_customer_do_not_contact
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  left join public.customers customer on customer.id = lead.customer_id
  where lead.id = v_item.lead_id
  for update of lead, crm;

  if v_crm_status is null then raise exception 'No se encontró la ficha CRM del Lead'; end if;
  if v_crm_status <> 'desistir' then
    raise exception 'El Lead ya no está en Desistir y no admite una gestión desde Rellamados';
  end if;
  if exists (select 1 from public.sales_cases where lead_id = v_item.lead_id) then
    raise exception 'El Lead ya está en el circuito administrativo';
  end if;

  v_attempt := v_item.attempt_count + 1;
  if v_attempt > 2 then raise exception 'Ya se registraron los dos llamados'; end if;

  insert into public.lead_recall_attempts (
    recall_item_id, seller_user_id, attempt_number, time_band, outcome, note, contacted_at
  ) values (
    p_item_id, v_user_id, v_attempt, p_time_band, p_outcome,
    left(trim(coalesce(p_note, '')), 3000), p_contacted_at
  );

  if p_outcome = 'answered' then
    if v_lead_do_not_contact or v_customer_do_not_contact then
      raise exception 'El cliente solicitó no ser contactado y no puede reactivarse desde Rellamados';
    end if;
    if p_next_contact_at is null or p_next_contact_at <= now() then
      raise exception 'Programá el próximo contacto antes de pasar el Lead a En Gestión';
    end if;

    update public.lead_recall_items
    set attempt_count = v_attempt,
        status = 'converted',
        answered_at = p_contacted_at,
        converted_at = now(),
        updated_at = now()
    where id = p_item_id;

    update public.leads
    set assigned_seller_user_id = v_user_id,
        assigned_by_user_id = v_user_id,
        assigned_at = now(),
        routing_status = 'assigned_manual',
        routing_reason = 'recall_reactivated',
        closed_at = null,
        last_message_at = greatest(last_message_at, p_contacted_at)
    where id = v_item.lead_id;

    select status into v_crm_status
    from public.lead_crm
    where lead_id = v_item.lead_id
    for update;

    if v_crm_status <> 'nuevo' then
      perform private.start_lead_crm_cycle(
        v_item.lead_id,
        v_user_id,
        'recall_reactivation',
        'Rellamado respondido',
        false
      );
    end if;

    perform public.record_lead_follow_up(
      p_lead_id => v_item.lead_id,
      p_status => 'en_proceso',
      p_note => coalesce(nullif(trim(p_note), ''), 'Rellamado respondido'),
      p_next_contact_at => p_next_contact_at,
      p_next_contact_note => coalesce(nullif(trim(p_next_contact_note), ''), 'Próximo contacto acordado'),
      p_contact_outcome => 'Rellamado respondido',
      p_priority => 'normal'
    );

    update public.lead_crm
    set last_contact_at = p_contacted_at,
        last_contact_outcome = 'Rellamado respondido',
        updated_by = v_user_id,
        updated_at = now()
    where lead_id = v_item.lead_id;

    insert into public.lead_assignments (
      lead_id, seller_user_id, assigned_by_user_id, assignment_type, reason
    ) values (
      v_item.lead_id, v_user_id, v_user_id, 'manual',
      'Rellamado respondido y reactivado en nuevo ciclo CRM V2'
    );

    insert into public.lead_activities (
      lead_id, actor_user_id, activity_type, title, detail, metadata
    ) values (
      v_item.lead_id,
      v_user_id,
      'follow_up',
      'Rellamado reactivado en nuevo ciclo',
      trim(coalesce(p_note, '')),
      jsonb_build_object(
        'recall_item_id', p_item_id,
        'attempt', v_attempt,
        'time_band', p_time_band,
        'contacted_at', p_contacted_at,
        'next_contact_at', p_next_contact_at,
        'status', 'en_proceso',
        'origin', 'recall'
      )
    );

  elsif p_outcome in ('invalid', 'not_interested') or v_attempt = 2 then
    update public.lead_recall_items
    set attempt_count = v_attempt,
        status = 'exhausted',
        exhausted_at = now(),
        updated_at = now()
    where id = p_item_id;

    update public.lead_crm
    set status = 'desistir',
        status_reason = case
          when p_outcome = 'invalid' then 'Contacto inválido en rellamado'
          when p_outcome = 'not_interested' then 'Sin interés en rellamado'
          else 'Dos llamados sin respuesta'
        end,
        desist_reason = case
          when p_outcome = 'not_interested' then 'no_interest'
          else 'other'
        end,
        next_contact_at = null,
        next_contact_note = '',
        next_contact_source = null,
        cold_base_at = null,
        updated_by = v_user_id,
        updated_at = now()
    where lead_id = v_item.lead_id;

    insert into public.lead_activities (
      lead_id, actor_user_id, activity_type, title, detail, metadata
    ) values (
      v_item.lead_id,
      v_user_id,
      'follow_up',
      'Rellamado cerrado',
      trim(coalesce(p_note, '')),
      jsonb_build_object(
        'recall_item_id', p_item_id,
        'attempts', v_attempt,
        'outcome', p_outcome,
        'base_fria', false
      )
    );

  else
    update public.lead_recall_items
    set attempt_count = v_attempt,
        status = 'working',
        updated_at = now()
    where id = p_item_id;

    insert into public.lead_activities (
      lead_id, actor_user_id, activity_type, title, detail, metadata
    ) values (
      v_item.lead_id,
      v_user_id,
      'follow_up',
      'Primer rellamado sin respuesta',
      trim(coalesce(p_note, '')),
      jsonb_build_object('recall_item_id', p_item_id, 'time_band', p_time_band)
    );
  end if;

  return jsonb_build_object(
    'status', (select status from public.lead_recall_items where id = p_item_id),
    'attempts', v_attempt,
    'lead_id', v_item.lead_id
  );
end;
$function$

;

CREATE OR REPLACE FUNCTION private.create_lead_contact_sequence(p_lead_id uuid, p_seller_user_id uuid, p_started_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sequence_id uuid;
  v_cursor timestamptz := greatest(coalesce(p_started_at, now()), now());
  v_started_at timestamptz := greatest(coalesce(p_started_at, now()), now());
  v_call_start timestamptz;
  v_call_end timestamptz;
  v_message_end timestamptz;
  v_window_day date;
  v_previous_day date;
  v_protocol_day integer := 0;
  v_band_number integer;
  v_band_attempt integer;
  v_call_attempt integer := 0;
  v_sequence_order integer := 0;
  v_message_step integer := 0;
  v_status text;
  v_manual_action timestamptz;
  v_band text;
begin
  perform private.crm_contact_assert_legacy_writer(p_lead_id,'DOMAIN_BOUNDARY_REQUIRED');
  if p_seller_user_id is null then return null; end if;

  select crm.status, crm.next_contact_at
  into v_status, v_manual_action
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  where lead.id = p_lead_id
    and lead.assigned_seller_user_id = p_seller_user_id
    and lead.closed_at is null
    and not coalesce(lead.do_not_contact, false)
  for update of lead, crm;

  if not found or v_status not in ('nuevo', 'no_contesta') or v_manual_action is not null then return null; end if;

  select id into v_sequence_id
  from public.lead_contact_sequences
  where lead_id = p_lead_id and status = 'active';
  if v_sequence_id is not null then return v_sequence_id; end if;

  insert into public.lead_contact_sequences (lead_id, seller_user_id, started_at)
  values (p_lead_id, p_seller_user_id, v_started_at)
  returning id into v_sequence_id;

  for v_band_number in 1..9 loop
    select w.due_start, w.due_end
    into v_call_start, v_call_end
    from private.next_protocol_call_window(v_cursor) w;

    v_window_day := (v_call_start at time zone 'America/Argentina/Buenos_Aires')::date;
    if v_previous_day is distinct from v_window_day then
      v_protocol_day := v_protocol_day + 1;
      v_previous_day := v_window_day;
    end if;
    v_band := case
      when (v_call_end at time zone 'America/Argentina/Buenos_Aires')::time = time '12:00' then '10-12'
      when (v_call_end at time zone 'America/Argentina/Buenos_Aires')::time = time '16:00' then '14-16'
      else '17-19'
    end;

    for v_band_attempt in 1..2 loop
      v_call_attempt := v_call_attempt + 1;
      v_sequence_order := v_sequence_order + 1;
      insert into public.lead_contact_tasks (
        sequence_id, lead_id, seller_user_id, sequence_order, channel,
        call_attempt, message_step, template_id, due_start, due_end, status,
        protocol_day, protocol_band, band_attempt
      ) values (
        v_sequence_id, p_lead_id, p_seller_user_id, v_sequence_order, 'call',
        v_call_attempt, null, null, v_call_start, v_call_end,
        case when v_call_attempt = 1 then 'pending' else 'scheduled' end,
        v_protocol_day, v_band, v_band_attempt
      );

      if v_call_attempt in (1, 4) then
        v_message_step := v_message_step + 1;
        v_sequence_order := v_sequence_order + 1;
        v_message_end := least(v_call_start + interval '2 hours', v_call_end);
        insert into public.lead_contact_tasks (
          sequence_id, lead_id, seller_user_id, sequence_order, channel,
          call_attempt, message_step, template_id, due_start, due_end, status,
          protocol_day, protocol_band, band_attempt
        ) values (
          v_sequence_id, p_lead_id, p_seller_user_id, v_sequence_order, 'whatsapp',
          null, v_message_step,
          (select id from public.contact_message_templates where step_number = v_message_step),
          v_call_start, greatest(v_call_start + interval '1 minute', v_message_end), 'scheduled',
          v_protocol_day, v_band, null
        );
      end if;
    end loop;
    v_cursor := v_call_end + interval '1 second';
  end loop;
  return v_sequence_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.cancel_lead_contact_protocol(p_lead_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.crm_contact_assert_legacy_writer(p_lead_id,'DOMAIN_BOUNDARY_REQUIRED');
  update public.lead_contact_sequences
  set status = 'cancelled',
      completed_at = coalesce(completed_at, now()),
      stopped_reason = left(coalesce(nullif(trim(p_reason), ''), 'Seguimiento reemplazado'), 1000),
      updated_at = now()
  where lead_id = p_lead_id
    and status = 'active';

  update public.lead_contact_tasks
  set status = 'cancelled',
      updated_at = now()
  where lead_id = p_lead_id
    and status in ('pending', 'scheduled');
end;
$function$

;

CREATE OR REPLACE FUNCTION private.sync_protocol_next_action(p_sequence_id uuid, p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_task public.lead_contact_tasks%rowtype;
begin
  perform private.crm_contact_assert_legacy_writer(p_lead_id,'DOMAIN_BOUNDARY_REQUIRED');
  select task.* into v_task
  from public.lead_contact_tasks task
  join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
  where task.sequence_id = p_sequence_id
    and task.lead_id = p_lead_id
    and task.status = 'pending'
    and sequence.status = 'active'
  order by task.sequence_order
  limit 1
  for update of task;

  if v_task.id is null then
    select task.* into v_task
    from public.lead_contact_tasks task
    join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
    where task.sequence_id = p_sequence_id
      and task.lead_id = p_lead_id
      and task.status = 'scheduled'
      and sequence.status = 'active'
    order by task.sequence_order
    limit 1
    for update of task;

    if v_task.id is null then return null; end if;

    update public.lead_contact_tasks
    set status = 'pending',
        updated_at = now()
    where id = v_task.id
    returning * into v_task;
  end if;

  return v_task.id;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.classify_completed_contact_protocol()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.crm_contact_is_adopted(new.lead_id) then return new; end if;
  if new.status = 'completed' and old.status is distinct from new.status then
    perform private.classify_exhausted_contact_protocol(
      new.lead_id,
      new.id,
      'protocol_sequence_completed'
    );
  end if;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.classify_exhausted_contact_protocol(p_lead_id uuid, p_sequence_id uuid, p_origin text DEFAULT 'protocol_exhaustion'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_previous_status text;
  v_completed_at timestamptz;
  v_classified_lead_id uuid;
begin
  perform private.crm_contact_parent_barrier(p_lead_id);
  if private.crm_contact_is_adopted(p_lead_id) then return false; end if;
  select crm.status
    into v_previous_status
  from public.lead_crm crm
  join public.leads lead on lead.id = crm.lead_id
  where crm.lead_id = p_lead_id
    and crm.status in ('nuevo', 'no_contesta')
    and crm.next_contact_at is null
    and crm.interview_at is null
    and crm.deposit_at is null
    and crm.sale_requested_at is null
    and crm.sale_confirmed_at is null
    and crm.sale_confirmation_status = 'none'
    and lower(trim(coalesce(crm.last_contact_outcome, ''))) not in (
      'answered',
      'respuesta recibida por whatsapp'
    )
    and lead.closed_at is null
    and not coalesce(lead.do_not_contact, false)
    and not exists (
      select 1 from public.sales_cases sales_case
      where sales_case.lead_id = p_lead_id
    )
  for update of crm;

  if not found then
    return false;
  end if;

  select sequence.completed_at
    into v_completed_at
  from public.lead_contact_sequences sequence
  where sequence.id = p_sequence_id
    and sequence.lead_id = p_lead_id
    and sequence.status = 'completed'
    and private.lead_has_canonical_cold_base_evidence(p_lead_id)
    and not exists (
      select 1
      from public.lead_contact_sequences newer_sequence
      where newer_sequence.lead_id = p_lead_id
        and newer_sequence.status <> 'cancelled'
        and (
          newer_sequence.started_at > sequence.started_at
          or (newer_sequence.started_at = sequence.started_at and newer_sequence.id > sequence.id)
        )
    );

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.lead_activities activity
    where activity.lead_id = p_lead_id
      and activity.created_at >= (
        select started_at
        from public.lead_contact_sequences
        where id = p_sequence_id
      )
      and lower(trim(coalesce(activity.metadata ->> 'outcome', ''))) in (
        'answered',
        'respuesta recibida por whatsapp'
      )
  ) then
    return false;
  end if;

  update public.lead_crm
  set status = 'desistir',
      status_reason = 'No contactado post protocolo',
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      cold_base_at = coalesce(v_completed_at, now()),
      previous_status = v_previous_status,
      terminal_at = coalesce(v_completed_at, now()),
      updated_at = now()
  where lead_id = p_lead_id
    and status = v_previous_status
    and status in ('nuevo', 'no_contesta')
    and next_contact_at is null
    and cold_base_at is null
  returning lead_id into v_classified_lead_id;

  if v_classified_lead_id is null then
    return false;
  end if;

  if to_regclass('public.lead_recall_items') is not null then
    execute $sql$
      update public.lead_recall_items
      set available_at = least(available_at, $1 + interval '15 days'),
          updated_at = now()
      where lead_id = $2
        and status in ('available', 'assigned', 'working')
    $sql$ using coalesce(v_completed_at, now()), p_lead_id;
  end if;

  insert into public.lead_activities (
    lead_id, actor_user_id, activity_type, title, detail, metadata
  ) values (
    p_lead_id,
    null,
    'status_change',
    'Lead clasificado como Base fría',
    'No contactado post protocolo',
    jsonb_build_object(
      'status', 'desistir',
      'segment', 'base_fria',
      'reason', 'No contactado post protocolo',
      'sequence_id', p_sequence_id,
      'origin', coalesce(nullif(trim(p_origin), ''), 'protocol_exhaustion'),
      'automatic', true,
      'protocol_completed_at', coalesce(v_completed_at, now())
    )
  );

  return true;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.sync_contact_sequence_with_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_seller uuid;
begin
  if private.crm_contact_is_adopted(new.lead_id) then
    raise exception using errcode='42501',message='DOMAIN_BOUNDARY_REQUIRED';
  end if;
  if new.status not in ('nuevo', 'no_contesta') then
    perform private.cancel_lead_contact_protocol(new.lead_id, 'Cambio de estado a ' || new.status);
  elsif old.status not in ('nuevo', 'no_contesta')
    and new.status in ('nuevo', 'no_contesta')
    and new.next_contact_at is null
  then
    select assigned_seller_user_id into v_seller
    from public.leads
    where id = new.lead_id;
    if v_seller is not null then
      perform private.create_lead_contact_sequence(new.lead_id, v_seller, now());
    end if;
  end if;
  return new;
end;
$function$

;

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
      and not private.crm_contact_is_adopted(sequence.lead_id)
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
    if private.crm_contact_is_adopted(v_sequence.lead_id) then continue; end if;
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

commit;
