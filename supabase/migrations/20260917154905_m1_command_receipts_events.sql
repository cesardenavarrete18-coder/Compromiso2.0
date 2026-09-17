-- M1-03: additive, closed command foundation. No commercial handler or activation.
-- The only installed handler is a compiled rejection. Local isolated tests replace
-- that one handler with a synthetic aggregate; no payload/GUC/setting enables it.
begin;

-- Temporary DDL membership only for the existing trusted migration executor.
-- REFERENCES/ALTER OWNER require actual ACL, not merely BYPASSRLS.
grant crm_runtime_owner to postgres with admin true, inherit true, set true;
grant usage, create on schema private, public to crm_runtime_owner;

create table private.crm_command_receipts (
  command_id uuid primary key,
  schema_version smallint not null check (schema_version = 1),
  command_type text not null check (command_type = 'FoundationProbe'),
  project_ref text not null check (length(project_ref) between 1 and 128),
  scope_key text not null check (scope_key ~ '^lead:[0-9a-f-]{36}$'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
  actor_kind text not null check (actor_kind in ('user', 'service')),
  actor_subject text not null,
  actor_user_id uuid references public.profiles(user_id) on delete restrict,
  executor_principal text not null,
  expected_versions jsonb not null check (jsonb_typeof(expected_versions) = 'object'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  causation_event_id uuid,
  correlation_id uuid not null,
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  gate_dependencies jsonb not null default '[]'::jsonb check (jsonb_typeof(gate_dependencies) = 'array'),
  status text not null check (status in ('evaluating', 'applied', 'rejected')),
  result jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  unique (project_ref, actor_subject, command_type, scope_key, idempotency_key),
  check ((status = 'evaluating' and result is null and error_code is null and decided_at is null)
    or (status = 'applied' and jsonb_typeof(result) = 'object' and result is not null and error_code is null and decided_at is not null)
    or (status = 'rejected' and jsonb_typeof(result) = 'object' and result is not null and error_code is not null and length(error_code) > 0 and decided_at is not null))
);
create index crm_command_receipts_correlation_idx on private.crm_command_receipts(correlation_id);
create index crm_command_receipts_scope_created_idx on private.crm_command_receipts(scope_key, created_at);
create index crm_command_receipts_status_created_idx on private.crm_command_receipts(status, created_at);

create table private.crm_events (
  event_id uuid primary key,
  command_id uuid not null references private.crm_command_receipts(command_id) on delete restrict,
  event_index smallint not null check (event_index >= 0),
  event_type text not null check (event_type = 'FoundationProbeApplied'),
  schema_version smallint not null check (schema_version = 1),
  aggregate_kind text not null check (aggregate_kind = 'foundation_probe'),
  aggregate_id uuid not null,
  aggregate_version bigint not null check (aggregate_version >= 0),
  project_ref text not null,
  lead_id uuid references public.leads(id) on delete restrict,
  conversation_id uuid references private.crm_conversation_state(conversation_id) on delete restrict,
  actor_user_id uuid references public.profiles(user_id) on delete restrict,
  actor_subject text not null,
  responsible_user_id_at_event uuid references public.profiles(user_id) on delete restrict,
  responsible_subject_at_event text,
  occurred_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  correlation_id uuid not null,
  causation_event_id uuid references private.crm_events(event_id) on delete restrict,
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  manifest_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  unique (command_id, event_index),
  unique (aggregate_kind, aggregate_id, aggregate_version, event_index)
);
alter table private.crm_command_receipts add constraint crm_command_receipts_causation_fk
  foreign key (causation_event_id) references private.crm_events(event_id) on delete restrict;
create index crm_events_aggregate_idx on private.crm_events(aggregate_kind, aggregate_id, aggregate_version);
create index crm_events_lead_recorded_idx on private.crm_events(lead_id, recorded_at);
create index crm_events_conversation_recorded_idx on private.crm_events(conversation_id, recorded_at);
create index crm_events_correlation_idx on private.crm_events(correlation_id);

alter table private.crm_command_receipts owner to crm_runtime_owner;
alter table private.crm_events owner to crm_runtime_owner;
alter table private.crm_command_receipts enable row level security;
alter table private.crm_command_receipts force row level security;
alter table private.crm_events enable row level security;
alter table private.crm_events force row level security;
create policy crm_command_receipts_owner_only on private.crm_command_receipts
  to crm_runtime_owner using (true) with check (true);
create policy crm_events_owner_only on private.crm_events
  to crm_runtime_owner using (true) with check (true);
revoke all on private.crm_command_receipts, private.crm_events from public, anon, authenticated, service_role;

create function private.crm_receipt_terminal_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status <> 'evaluating' then
    raise exception using errcode = '23514', message = 'CRM_RECEIPT_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger crm_receipt_terminal_guard before update or delete on private.crm_command_receipts
  for each row execute function private.crm_receipt_terminal_guard();

create function private.crm_receipt_decided_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_has_event boolean;
begin
  select status into v_status from private.crm_command_receipts where command_id = new.command_id;
  if not found then return null; end if;
  select exists(select 1 from private.crm_events where command_id = new.command_id) into v_has_event;
  if v_status = 'evaluating' or (v_status = 'applied' and not v_has_event)
     or (v_status = 'rejected' and v_has_event) then
    raise exception using errcode = '23514', message = 'CRM_RECEIPT_NOT_DECIDED_AT_COMMIT';
  end if;
  return null;
end;
$$;
-- Deferred checks may run after the gateway's definer frame has returned. This
-- trigger reads ONLY its new private receipt/event tables as crm_runtime_owner.
create constraint trigger crm_receipt_decided_guard after insert or update on private.crm_command_receipts
  deferrable initially deferred for each row execute function private.crm_receipt_decided_guard();
create constraint trigger crm_event_receipt_decided_guard after insert on private.crm_events
  deferrable initially deferred for each row execute function private.crm_receipt_decided_guard();

create function private.crm_event_append_only_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'CRM_EVENT_APPEND_ONLY';
end;
$$;
create trigger crm_event_append_only_guard before update or delete on private.crm_events
  for each row execute function private.crm_event_append_only_guard();

create function private.crm_history_no_truncate()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'CRM_HISTORY_TRUNCATE_FORBIDDEN';
end;
$$;
create trigger crm_events_no_truncate before truncate on private.crm_events
  for each statement execute function private.crm_history_no_truncate();
create trigger crm_receipts_no_truncate before truncate on private.crm_command_receipts
  for each statement execute function private.crm_history_no_truncate();

-- Canonical JSON v1: keys in C order, arrays retain order, numbers have no trailing
-- decimal zeros. The closed command contract permits only exact safe integers.
create function private.crm_canonical_json(p_value jsonb, p_depth integer default 0)
returns text language plpgsql immutable strict security invoker set search_path = '' as $$
declare v_result text;
begin
  if p_depth > 32 then raise exception using errcode='22023', message='INVALID_ENVELOPE'; end if;
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(to_jsonb(key)::text || ':' || private.crm_canonical_json(value,p_depth+1), ',' order by key collate "C"), '') || '}'
        into v_result from jsonb_each(p_value);
    when 'array' then
      if jsonb_array_length(p_value) > 128 then raise exception using errcode='22023', message='INVALID_ENVELOPE'; end if;
      select '[' || coalesce(string_agg(private.crm_canonical_json(value,p_depth+1), ',' order by ord), '') || ']'
        into v_result from jsonb_array_elements(p_value) with ordinality as entries(value,ord);
    when 'number' then v_result := trim_scale((p_value #>> '{}')::numeric)::text;
    else v_result := p_value::text;
  end case;
  return v_result;
end;
$$;

create function private.crm_json_keys(p_value jsonb, p_keys text[])
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_typeof(p_value) = 'object' and p_value ?& p_keys
    and (select count(*) from jsonb_object_keys(case when jsonb_typeof(p_value)='object' then p_value else '{}'::jsonb end)) = cardinality(p_keys), false);
$$;

create function private.crm_json_integer(p_value jsonb, p_nonnegative boolean default true)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(p_value) <> 'number' or p_value is null then false
    else (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
      and (p_value #>> '{}')::numeric between (case when p_nonnegative then 0 else -9007199254740991 end) and 9007199254740991 end;
$$;

create function private.crm_normalize_command(p_envelope jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  v_required text[] := array['schema_version','command_id','command_type','idempotency_key','scope','expected_versions','payload','policy_version_seen'];
  v_allowed text[] := array['schema_version','command_id','command_type','idempotency_key','scope','expected_versions','payload','policy_version_seen','causation','correlation_id'];
  v_uuid_pattern text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_command uuid; v_lead uuid; v_gate jsonb; v_gates jsonb := '[]'::jsonb; v_versions jsonb; v_scope text; v_cause jsonb := 'null'::jsonb;
begin
  if p_envelope is null or jsonb_typeof(p_envelope)<>'object' or octet_length(p_envelope::text)>65536 then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  if exists(select 1 from jsonb_object_keys(p_envelope) as k(key) where not key=any(v_allowed)) then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  if not p_envelope ?& v_required then raise exception using errcode='22023', message='COMMAND_METADATA_REQUIRED'; end if;
  if p_envelope->'schema_version' <> '1'::jsonb then raise exception using errcode='22023', message='INVALID_ENVELOPE'; end if;
  if p_envelope->>'command_type' is distinct from 'FoundationProbe' then raise exception using errcode='22023', message='UNSUPPORTED_COMMAND'; end if;
  if jsonb_typeof(p_envelope->'command_id') <> 'string' or not (p_envelope->>'command_id' ~ v_uuid_pattern)
    or jsonb_typeof(p_envelope->'idempotency_key') <> 'string' or not (p_envelope->>'idempotency_key' ~ '^[A-Za-z0-9._:-]{1,128}$')
    or jsonb_typeof(p_envelope->'policy_version_seen') <> 'string' or not (p_envelope->>'policy_version_seen' ~ '^[A-Za-z0-9._:-]{1,128}$') then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  v_command := (p_envelope->>'command_id')::uuid;
  if not private.crm_json_keys(p_envelope->'scope',array['lead_id']) or jsonb_typeof(p_envelope#>'{scope,lead_id}') <> 'string'
    or not (p_envelope#>>'{scope,lead_id}' ~ v_uuid_pattern) then raise exception using errcode='22023', message='INVALID_SCOPE'; end if;
  v_lead := (p_envelope#>>'{scope,lead_id}')::uuid;
  v_versions := p_envelope->'expected_versions';
  if not private.crm_json_keys(v_versions,array['lead_aggregate_version','assignment_epoch','gates'])
    or not private.crm_json_integer(v_versions->'lead_aggregate_version') or not private.crm_json_integer(v_versions->'assignment_epoch')
    or jsonb_typeof(v_versions->'gates') is distinct from 'array' then raise exception using errcode='22023', message='INVALID_VERSIONS'; end if;
  if jsonb_array_length(v_versions->'gates')<>2 then raise exception using errcode='22023', message='INVALID_VERSIONS'; end if;
  for v_gate in select value from jsonb_array_elements(v_versions->'gates') loop
    if not private.crm_json_keys(v_gate,array['domain','scope_key','writer_epoch','revision','contract_version','policy_version'])
      or v_gate->>'domain' not in ('command_crm','command_owner') or jsonb_typeof(v_gate->'domain')<>'string'
      or not private.crm_json_integer(v_gate->'writer_epoch') or not private.crm_json_integer(v_gate->'revision')
      or jsonb_typeof(v_gate->'scope_key')<>'string' or jsonb_typeof(v_gate->'contract_version')<>'string' or jsonb_typeof(v_gate->'policy_version')<>'string'
      or not (v_gate->>'contract_version' ~ '^[A-Za-z0-9._:-]{1,128}$') or not (v_gate->>'policy_version' ~ '^[A-Za-z0-9._:-]{1,128}$') then
      raise exception using errcode='22023', message='INVALID_VERSIONS';
    end if;
    v_scope := v_gate->>'scope_key';
    if left(v_scope,5)='lead:' and substring(v_scope from 6) ~ v_uuid_pattern then v_scope := 'lead:' || (substring(v_scope from 6)::uuid)::text; end if;
    if v_scope not in ('global','lead:'||v_lead::text) then raise exception using errcode='22023', message='INVALID_VERSIONS'; end if;
    v_gates := v_gates || jsonb_build_array(v_gate || jsonb_build_object('scope_key',v_scope));
  end loop;
  if (select count(distinct value->>'domain') from jsonb_array_elements(v_gates))<>2 then raise exception using errcode='22023', message='INVALID_VERSIONS'; end if;
  select jsonb_agg(value order by value->>'domain',value->>'scope_key') into v_gates from jsonb_array_elements(v_gates);
  if not private.crm_json_keys(p_envelope->'payload',array['operation_id','value'])
    or jsonb_typeof(p_envelope#>'{payload,operation_id}')<>'string' or not (p_envelope#>>'{payload,operation_id}' ~ v_uuid_pattern)
    or not private.crm_json_integer(p_envelope#>'{payload,value}',false) then raise exception using errcode='22023', message='INVALID_PAYLOAD'; end if;
  if p_envelope ? 'causation' and p_envelope->'causation'<>'null'::jsonb then
    if not private.crm_json_keys(p_envelope->'causation',array['event_id']) or jsonb_typeof(p_envelope#>'{causation,event_id}')<>'string'
      or not (p_envelope#>>'{causation,event_id}' ~ v_uuid_pattern) then raise exception using errcode='22023', message='INVALID_CAUSATION'; end if;
    v_cause := jsonb_build_object('event_id',(p_envelope#>>'{causation,event_id}')::uuid);
  end if;
  if p_envelope ? 'correlation_id' and (jsonb_typeof(p_envelope->'correlation_id')<>'string' or not (p_envelope->>'correlation_id' ~ v_uuid_pattern)) then
    raise exception using errcode='22023', message='INVALID_ENVELOPE';
  end if;
  return jsonb_build_object('schema_version',1,'command_id',v_command,'command_type','FoundationProbe','idempotency_key',p_envelope->>'idempotency_key',
    'scope',jsonb_build_object('lead_id',v_lead),'expected_versions',v_versions||jsonb_build_object('gates',v_gates),
    'payload',jsonb_build_object('operation_id',(p_envelope#>>'{payload,operation_id}')::uuid,'value',(p_envelope#>>'{payload,value}')::bigint),
    'causation',v_cause,'correlation_id',coalesce((p_envelope->>'correlation_id')::uuid,v_command),'policy_version_seen',p_envelope->>'policy_version_seen');
end;
$$;

-- Only these two fixed, read-only helpers retain the migrator owner (postgres).
-- FOR SHARE needs privileges that must NOT be granted on legacy tables to the
-- runtime role. They derive identity internally and disclose only authorized IDs.
create function private.crm_foundation_actor(p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_profile record;
begin
  if v_uid is null then return jsonb_build_object('error_code','AUTHENTICATION_REQUIRED'); end if;
  if p_lock then
    select user_id, active, role::text as role into v_profile from public.profiles where user_id=v_uid for share;
  else
    select user_id, active, role::text as role into v_profile from public.profiles where user_id=v_uid;
  end if;
  if not found or v_profile.active is distinct from true then return jsonb_build_object('error_code','ACTOR_INACTIVE'); end if;
  return jsonb_build_object('user_id',v_uid,'actor_subject','user:'||v_uid::text,'role',v_profile.role);
end;
$$;
alter function private.crm_foundation_actor(boolean) owner to postgres;

create function private.crm_foundation_scope(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_role text; v_owner uuid;
begin
  if v_uid is null then return jsonb_build_object('error_code','AUTHENTICATION_REQUIRED'); end if;
  select role::text into v_role from public.profiles where user_id=v_uid and active;
  if not found then return jsonb_build_object('error_code','ACTOR_INACTIVE'); end if;
  select assigned_seller_user_id into v_owner from public.leads where id=p_lead_id for share;
  if not found or not coalesce(v_role in ('admin','supervisor') or (v_role='seller' and v_owner is not distinct from v_uid),false) then
    return jsonb_build_object('error_code','FORBIDDEN_SCOPE');
  end if;
  return jsonb_build_object('lead_id',p_lead_id,'owner_user_id',v_owner);
end;
$$;
alter function private.crm_foundation_scope(uuid) owner to postgres;
revoke all on function private.crm_foundation_actor(boolean), private.crm_foundation_scope(uuid) from public, anon, authenticated, service_role;
grant execute on function private.crm_foundation_actor(boolean), private.crm_foundation_scope(uuid) to crm_runtime_owner;

create function private.crm_apply_foundation_probe(p_command_id uuid, p_lead_id uuid, p_payload jsonb, p_context jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  -- Permanently closed in the installed migration. This function performs no DML.
  raise exception using errcode='P0103', message='COMMAND_NOT_IMPLEMENTED';
end;
$$;

create function private.crm_execute_command(p_envelope jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_env jsonb; v_actor jsonb; v_scope jsonb; v_intent jsonb; v_hash text;
  v_command uuid; v_lead uuid; v_subject text; v_project text; v_scope_key text;
  v_policy private.crm_runtime_policies%rowtype; v_receipt private.crm_command_receipts%rowtype;
  v_runtime private.crm_lead_runtime%rowtype; v_gate private.crm_runtime_gates%rowtype;
  v_domain text; v_gate_vector jsonb := '[]'::jsonb; v_gate_error text; v_error text;
  v_new boolean := false; v_result jsonb; v_effect jsonb; v_event uuid; v_cause uuid; v_owner uuid;
begin
  begin v_env := private.crm_normalize_command(p_envelope);
  exception when sqlstate '22023' or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('status','rejected','error_code',case when sqlstate='22023' then sqlerrm else 'INVALID_ENVELOPE' end);
  end;
  v_actor := private.crm_foundation_actor(false);
  if v_actor ? 'error_code' then return jsonb_build_object('status','rejected','error_code',v_actor->>'error_code'); end if;
  v_subject := v_actor->>'actor_subject'; v_command := (v_env->>'command_id')::uuid;
  v_lead := (v_env#>>'{scope,lead_id}')::uuid; v_scope_key := 'lead:'||v_lead::text;
  select * into v_policy from private.crm_runtime_policies where policy_version=v_env->>'policy_version_seen';
  if not found then return jsonb_build_object('status','rejected','command_id',v_command,'error_code','POLICY_VERSION_CONFLICT'); end if;
  -- Namespace comes from the resource's server policy, never the caller's choice
  -- of an observed policy. A missing runtime can only produce a rejected receipt.
  select p.snapshot->>'project_ref' into v_project
    from private.crm_lead_runtime r join private.crm_runtime_policies p on p.policy_version=r.policy_version
    where r.lead_id=v_lead;
  if not found then v_project := v_policy.snapshot->>'project_ref'; end if;
  if v_project is null or length(v_project) not between 1 and 128
    or v_project is distinct from v_policy.snapshot->>'project_ref' then
    return jsonb_build_object('status','rejected','command_id',v_command,'error_code','POLICY_VERSION_CONFLICT');
  end if;
  v_intent := jsonb_build_object('schema_version',1,'command_type',v_env->>'command_type','scope',v_env->'scope','actor_subject',v_subject,
    'expected_versions',v_env->'expected_versions','payload',v_env->'payload','causation',v_env->'causation','policy_version_seen',v_env->>'policy_version_seen');
  v_hash := encode(sha256(convert_to(private.crm_canonical_json(v_intent),'UTF8')),'hex');
  insert into private.crm_command_receipts(command_id,schema_version,command_type,project_ref,scope_key,idempotency_key,
    actor_kind,actor_subject,actor_user_id,executor_principal,expected_versions,request_hash,request_payload,correlation_id,policy_version,status)
  values(v_command,1,'FoundationProbe',v_project,v_scope_key,v_env->>'idempotency_key','user',v_subject,(v_actor->>'user_id')::uuid,
    session_user,v_env->'expected_versions',v_hash,v_env,(v_env->>'correlation_id')::uuid,v_policy.policy_version,'evaluating')
  on conflict do nothing returning * into v_receipt;
  v_new := found;
  if not v_new then
    select * into v_receipt from private.crm_command_receipts where command_id=v_command for update;
    if not found then
      select * into v_receipt from private.crm_command_receipts where project_ref=v_project and actor_subject=v_subject
        and command_type='FoundationProbe' and scope_key=v_scope_key and idempotency_key=v_env->>'idempotency_key' for update;
    end if;
    if not found then raise exception using errcode='40001', message='CRM_RECEIPT_RETRY'; end if;
    if v_receipt.actor_subject<>v_subject or v_receipt.project_ref<>v_project or v_receipt.command_type<>'FoundationProbe'
      or v_receipt.scope_key<>v_scope_key or v_receipt.idempotency_key<>v_env->>'idempotency_key' or v_receipt.request_hash<>v_hash then
      return jsonb_build_object('status','rejected','command_id',v_command,'error_code','IDEMPOTENCY_KEY_REUSED');
    end if;
  end if;
  -- Conservatively freeze the resolution set, including absent more-specific rows.
  -- Foundation only: no active writers/cutover; future refinements need own tests.
  lock table private.crm_runtime_gates in share mode;
  foreach v_domain in array array['command_crm','command_owner'] loop
    select * into v_gate from private.crm_runtime_gates where domain=v_domain and scope_key in ('global',v_scope_key)
      order by case when scope_key=v_scope_key then 0 else 1 end limit 1 for share;
    if not found then v_gate_error := 'WRITER_FENCED';
    else
      v_gate_vector := v_gate_vector||jsonb_build_array(jsonb_build_object('domain',v_gate.domain,'scope_key',v_gate.scope_key,
        'writer_epoch',v_gate.writer_epoch,'revision',v_gate.revision,'contract_version',v_gate.contract_version,'policy_version',v_gate.policy_version));
      -- ready is admission of a RESERVED PROBE, never business authority.
      if v_gate.mode<>'ready' then v_gate_error := 'WRITER_FENCED'; end if;
      if v_gate.policy_version<>v_policy.policy_version then v_gate_error := 'POLICY_VERSION_CONFLICT'; end if;
    end if;
  end loop;
  v_actor := private.crm_foundation_actor(true);
  if v_actor ? 'error_code' then
    if v_new then delete from private.crm_command_receipts where command_id=v_command; end if;
    return jsonb_build_object('status','rejected','error_code',v_actor->>'error_code');
  end if;
  select * into v_runtime from private.crm_lead_runtime where lead_id=v_lead for update;
  if not found then v_error := 'RUNTIME_STATE_REQUIRED'; end if;
  v_scope := private.crm_foundation_scope(v_lead);
  if v_scope ? 'error_code' then
    if not v_new then return jsonb_build_object('status','rejected','command_id',v_command,'error_code',v_scope->>'error_code'); end if;
    v_error := v_scope->>'error_code';
  end if;
  -- Replay is authorized against CURRENT scope, but preserves the old decision;
  -- a later gate/version change must not cause the same intent to execute again.
  if not v_new then
    if v_receipt.status='evaluating' then raise exception using errcode='40001', message='CRM_RECEIPT_RETRY'; end if;
    return v_receipt.result || jsonb_build_object('status','replayed','original_status',v_receipt.status,'command_id',v_receipt.command_id);
  end if;
  v_owner := (v_scope->>'owner_user_id')::uuid;
  if v_error is null then
    if v_gate_error is not null then v_error := v_gate_error;
    elsif v_gate_vector is distinct from v_env#>'{expected_versions,gates}' then v_error := 'WRITER_FENCED';
    elsif v_runtime.policy_version<>v_policy.policy_version then v_error := 'POLICY_VERSION_CONFLICT';
    elsif v_runtime.aggregate_version<>(v_env#>>'{expected_versions,lead_aggregate_version}')::bigint
      or v_runtime.assignment_epoch<>(v_env#>>'{expected_versions,assignment_epoch}')::bigint then v_error := 'VERSION_CONFLICT';
    elsif v_runtime.aggregate_version>=9007199254740991 then v_error := 'VERSION_EXHAUSTED'; end if;
  end if;
  if v_error is null and v_env->'causation'<>'null'::jsonb then
    v_cause := (v_env#>>'{causation,event_id}')::uuid;
    if not exists(select 1 from private.crm_events where event_id=v_cause and lead_id=v_lead and project_ref=v_project) then
      v_error := 'INVALID_CAUSATION'; v_cause := null;
    end if;
  end if;
  if v_error is null then
    begin
      v_effect := private.crm_apply_foundation_probe(v_receipt.command_id,v_lead,v_env->'payload',
        jsonb_build_object('actor_subject',v_subject,'aggregate_version',v_runtime.aggregate_version,'policy_version',v_policy.policy_version));
    exception when sqlstate 'P0103' then v_error := 'COMMAND_NOT_IMPLEMENTED';
      when sqlstate 'P0104' then v_error := 'DUPLICATE_INTENT';
    end;
  end if;
  if v_error is null then
    if v_effect is distinct from v_env->'payload' then raise exception using errcode='23514', message='CRM_HANDLER_CONTRACT_VIOLATION'; end if;
    update private.crm_lead_runtime set aggregate_version=aggregate_version+1,updated_at=clock_timestamp() where lead_id=v_lead;
    v_event := gen_random_uuid();
    insert into private.crm_events(event_id,command_id,event_index,event_type,schema_version,aggregate_kind,aggregate_id,aggregate_version,
      project_ref,lead_id,actor_user_id,actor_subject,responsible_user_id_at_event,responsible_subject_at_event,occurred_at,
      correlation_id,causation_event_id,policy_version,manifest_id,payload,evidence_refs)
    values(v_event,v_receipt.command_id,0,'FoundationProbeApplied',1,'foundation_probe',v_lead,v_runtime.aggregate_version+1,
      v_project,v_lead,(v_actor->>'user_id')::uuid,v_subject,v_owner,case when v_owner is not null then 'user:'||v_owner::text end,clock_timestamp(),
      v_receipt.correlation_id,v_cause,v_policy.policy_version,v_policy.baseline_manifest_id,v_effect,'[]'::jsonb);
    v_result := jsonb_build_object('status','applied','command_id',v_receipt.command_id,'resource_ids',jsonb_build_object('lead_id',v_lead),
      'event_ids',jsonb_build_array(v_event),'versions',jsonb_build_object('lead_aggregate_version',v_runtime.aggregate_version+1,'assignment_epoch',v_runtime.assignment_epoch),
      'obligations','[]'::jsonb,'effects','[]'::jsonb);
    update private.crm_command_receipts set status='applied',result=v_result,decided_at=clock_timestamp(),gate_dependencies=v_gate_vector,causation_event_id=v_cause
      where command_id=v_receipt.command_id;
  else
    v_result := jsonb_build_object('status','rejected','command_id',v_receipt.command_id,'error_code',v_error);
    update private.crm_command_receipts set status='rejected',result=v_result,error_code=v_error,decided_at=clock_timestamp(),gate_dependencies=v_gate_vector
      where command_id=v_receipt.command_id;
  end if;
  return v_result;
end;
$$;

create function public.crm_submit_command(p_envelope jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select private.crm_execute_command(p_envelope);
$$;

alter function private.crm_receipt_terminal_guard() owner to crm_runtime_owner;
alter function private.crm_receipt_decided_guard() owner to crm_runtime_owner;
alter function private.crm_event_append_only_guard() owner to crm_runtime_owner;
alter function private.crm_history_no_truncate() owner to crm_runtime_owner;
alter function private.crm_canonical_json(jsonb,integer) owner to crm_runtime_owner;
alter function private.crm_json_keys(jsonb,text[]) owner to crm_runtime_owner;
alter function private.crm_json_integer(jsonb,boolean) owner to crm_runtime_owner;
alter function private.crm_normalize_command(jsonb) owner to crm_runtime_owner;
alter function private.crm_apply_foundation_probe(uuid,uuid,jsonb,jsonb) owner to crm_runtime_owner;
alter function private.crm_execute_command(jsonb) owner to crm_runtime_owner;
alter function public.crm_submit_command(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_receipt_terminal_guard(), private.crm_receipt_decided_guard(), private.crm_event_append_only_guard(),
  private.crm_history_no_truncate(),
  private.crm_canonical_json(jsonb,integer), private.crm_json_keys(jsonb,text[]), private.crm_json_integer(jsonb,boolean),
  private.crm_normalize_command(jsonb), private.crm_apply_foundation_probe(uuid,uuid,jsonb,jsonb), private.crm_execute_command(jsonb),
  public.crm_submit_command(jsonb) from public, anon, authenticated, service_role;

comment on function public.crm_submit_command(jsonb) is
  'M1 foundation only. No EXECUTE grant, no installed business handler, no cutover or channel authority. FoundationProbe is compiled closed.';

revoke create on schema private, public from crm_runtime_owner;
grant crm_runtime_owner to postgres with admin true, inherit false, set false;
commit;
