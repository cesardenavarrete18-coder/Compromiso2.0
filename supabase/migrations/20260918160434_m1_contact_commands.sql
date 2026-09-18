-- M1-04B / PSQL-04B-03. Closed command authority and read contract.
-- Laboratory candidate only: no API grants, seeds, adoption or external effects.
begin;
set local search_path = public, extensions;
do $preflight$
begin
 if to_regclass('private.crm_contact_runtime') is null
    or to_regprocedure('private.crm_contact_apply_restriction(uuid)') is null
    or to_regprocedure('private.crm_execute_assignment_command(jsonb)') is null then
  raise exception 'CONTACT_COMMAND_DEPENDENCY_REQUIRED';
 end if;
end;
$preflight$;
grant crm_runtime_owner to postgres with inherit true, set true;
grant usage, create on schema private,public to crm_runtime_owner;

-- M1-04B closed transport normalization only. No actor, authorization, DB clock,
-- adoption, producer trust, credit or business state is supplied by this layer.
create function private.crm_contact_json_shape(p_value jsonb,p_allowed text[],p_required text[])
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_typeof(p_value)='object' and p_value ?& p_required and not exists(
    select 1 from jsonb_object_keys(case when jsonb_typeof(p_value)='object' then p_value else '{}'::jsonb end) k(key)
    where not key=any(p_allowed)),false);
$$;

create function private.crm_contact_normalize_uuid(p_value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string' or char_length(p_value#>>'{}')<>36
    or (p_value#>>'{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end if;
  return to_jsonb((p_value#>>'{}')::uuid);
end;
$$;

create function private.crm_contact_validate_text(p_value jsonb,p_reason boolean default false)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_text text:=p_value#>>'{}';
begin
  if jsonb_typeof(p_value) is distinct from 'string' or char_length(v_text)>(case when p_reason then 1000 else 2000 end)
    or (p_reason and (char_length(v_text)<1 or v_text is distinct from btrim(v_text,' '))) then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end if;
  return p_value;
end;
$$;

create function private.crm_contact_validate_timestamp(p_value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_text text:=p_value#>>'{}'; v_at timestamptz;
begin
  if jsonb_typeof(p_value) is distinct from 'string' or char_length(v_text)<>24 or left(v_text,4)='0000'
    or v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end if;
  begin
    v_at:=v_text::timestamptz;
    if to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>v_text then
      raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end;
  return p_value;
end;
$$;

create function private.crm_contact_validate_timezone(p_value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_text text:=p_value#>>'{}';
begin
  -- Shape only: executor additionally checks pg_timezone_names under server policy.
  if jsonb_typeof(p_value) is distinct from 'string' or char_length(v_text)>100
    or v_text ~ '[^A-Za-z0-9_+/-]'
    or v_text !~ '^(UTC|[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z][A-Za-z0-9_+-]*)+)$' then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end if;
  return p_value;
end;
$$;

create function private.crm_contact_normalize_action_ref(p_value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
begin
  if not private.crm_json_keys(p_value,array['action_id','revision'])
    or not private.crm_json_integer(p_value->'revision') then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end if;
  return jsonb_build_object('action_id',private.crm_contact_normalize_uuid(p_value->'action_id'),'revision',p_value->'revision');
end;
$$;

create function private.crm_contact_normalize_new_action(p_value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
  v_fields text[]:=array['action_id','due_at','timezone','channel','note','reason']; v_result jsonb;
begin
  if not private.crm_contact_json_shape(p_value,v_fields||array['replaces_action','protocol_replacement'],v_fields)
    or coalesce(p_value->>'channel','') not in ('call','whatsapp_personal') then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end if;
  v_result:=jsonb_build_object('action_id',private.crm_contact_normalize_uuid(p_value->'action_id'),
    'due_at',private.crm_contact_validate_timestamp(p_value->'due_at'),'timezone',private.crm_contact_validate_timezone(p_value->'timezone'),
    'channel',p_value->'channel','note',private.crm_contact_validate_text(p_value->'note'),
    'reason',private.crm_contact_validate_text(p_value->'reason',true));
  if p_value ? 'replaces_action' then
    v_result:=v_result||jsonb_build_object('replaces_action',private.crm_contact_normalize_action_ref(p_value->'replaces_action'));
  end if;
  if p_value ? 'protocol_replacement' then
    if not private.crm_json_keys(p_value->'protocol_replacement',array['sequence_id','disposition'])
      or p_value#>>'{protocol_replacement,disposition}' is distinct from 'replace' then
      raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
    v_result:=v_result||jsonb_build_object('protocol_replacement',jsonb_build_object(
      'sequence_id',private.crm_contact_normalize_uuid(p_value#>'{protocol_replacement,sequence_id}'),'disposition','replace'));
  end if;
  return v_result;
end;
$$;

create function private.crm_contact_normalize_fact(p_value jsonb,p_record_variant boolean)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
  v_fields text[]:=array['fact_id','channel','fact_kind','outcome','occurred_at','note']; v_allowed text[];
  v_kind text:=p_value->>'fact_kind'; v_channel text:=p_value->>'channel'; v_outcome text:=p_value->>'outcome'; v_result jsonb;
begin
  v_allowed:=v_fields||array['task_ref','action_ref'];
  if p_record_variant then v_allowed:=v_allowed||array['variant','replacement_next_action']; v_fields:=v_fields||array['variant']; end if;
  if not private.crm_contact_json_shape(p_value,v_allowed,v_fields)
    or coalesce(v_channel,'') not in ('call','whatsapp_personal')
    or coalesce(v_kind,'') not in ('outbound_attempt','inbound_response')
    or coalesce(v_outcome,'') not in ('no_answer','sent','answered','invalid','no_interest','requested_no_contact')
    or (p_record_variant and p_value->>'variant' is distinct from 'record')
    or (v_outcome='no_answer' and (v_channel<>'call' or v_kind<>'outbound_attempt'))
    or (v_outcome='sent' and (v_channel<>'whatsapp_personal' or v_kind<>'outbound_attempt'))
    or (v_outcome='invalid' and v_kind<>'outbound_attempt') then
    raise exception using errcode='22023',message='INVALID_PAYLOAD';
  end if;
  v_result:=jsonb_build_object('fact_id',private.crm_contact_normalize_uuid(p_value->'fact_id'),'channel',v_channel,
    'fact_kind',v_kind,'outcome',v_outcome,'occurred_at',private.crm_contact_validate_timestamp(p_value->'occurred_at'),
    'note',private.crm_contact_validate_text(p_value->'note'));
  if p_record_variant then v_result:=v_result||jsonb_build_object('variant','record'); end if;
  if p_value ? 'task_ref' then
    if not private.crm_json_keys(p_value->'task_ref',array['task_id','sequence_id']) then
      raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
    v_result:=v_result||jsonb_build_object('task_ref',jsonb_build_object(
      'task_id',private.crm_contact_normalize_uuid(p_value#>'{task_ref,task_id}'),
      'sequence_id',private.crm_contact_normalize_uuid(p_value#>'{task_ref,sequence_id}')));
  end if;
  if p_value ? 'action_ref' then
    v_result:=v_result||jsonb_build_object('action_ref',private.crm_contact_normalize_action_ref(p_value->'action_ref'));
  end if;
  if p_value ? 'replacement_next_action' then
    if v_outcome='requested_no_contact' then raise exception using errcode='22023',message='INVALID_PAYLOAD'; end if;
    v_result:=v_result||jsonb_build_object('replacement_next_action',private.crm_contact_normalize_new_action(p_value->'replacement_next_action'));
  end if;
  return v_result;
end;
$$;

create function private.crm_contact_normalize_payload(p_type text,p_value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_fields text[]; v_result jsonb;
begin
  if p_type='RecordContactOutcome' then
    if p_value->>'variant'='record' then return private.crm_contact_normalize_fact(p_value,true); end if;
    v_fields:=array['variant','fact_id','expected_review_revision','decision','reason'];
    if not private.crm_contact_json_shape(p_value,v_fields||array['replacement_fact'],v_fields)
      or p_value->>'variant' is distinct from 'review'
      or coalesce(p_value->>'decision','') not in ('confirm_credit','deny_credit','amend')
      or not private.crm_json_integer(p_value->'expected_review_revision') then
      raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
    v_result:=jsonb_build_object('variant','review','fact_id',private.crm_contact_normalize_uuid(p_value->'fact_id'),
      'expected_review_revision',p_value->'expected_review_revision','decision',p_value->'decision',
      'reason',private.crm_contact_validate_text(p_value->'reason',true));
    if p_value->>'decision'='amend' then
      if not p_value ? 'replacement_fact' then raise exception using errcode='22023',message='INVALID_PAYLOAD'; end if;
      v_result:=v_result||jsonb_build_object('replacement_fact',private.crm_contact_normalize_fact(p_value->'replacement_fact',false));
      if v_result#>>'{replacement_fact,fact_id}'=v_result->>'fact_id' then
        raise exception using errcode='22023',message='INVALID_PAYLOAD';
      end if;
    elsif p_value ? 'replacement_fact' then raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
    return v_result;
  elsif p_type='RecordContactTaskOmission' then
    if not private.crm_json_keys(p_value,array['task_id','sequence_id','reason_code','note'])
      or coalesce(p_value->>'reason_code','') not in ('not_performed','operational_obstacle') then
      raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
    return jsonb_build_object('task_id',private.crm_contact_normalize_uuid(p_value->'task_id'),
      'sequence_id',private.crm_contact_normalize_uuid(p_value->'sequence_id'),
      'reason_code',p_value->'reason_code','note',private.crm_contact_validate_text(p_value->'note'));
  elsif p_type='ScheduleNextAction' then return private.crm_contact_normalize_new_action(p_value);
  elsif p_type='RescheduleNextAction' then
    if not private.crm_json_keys(p_value,array['action_id','expected_action_revision','due_at','timezone','note','reason'])
      or not private.crm_json_integer(p_value->'expected_action_revision') then
      raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
    return jsonb_build_object('action_id',private.crm_contact_normalize_uuid(p_value->'action_id'),
      'expected_action_revision',p_value->'expected_action_revision','due_at',private.crm_contact_validate_timestamp(p_value->'due_at'),
      'timezone',private.crm_contact_validate_timezone(p_value->'timezone'),'note',private.crm_contact_validate_text(p_value->'note'),
      'reason',private.crm_contact_validate_text(p_value->'reason',true));
  elsif p_type='CancelNextAction' then
    v_fields:=array['action_id','expected_action_revision','reason'];
    if not private.crm_contact_json_shape(p_value,v_fields||array['replacement_next_action'],v_fields)
      or not private.crm_json_integer(p_value->'expected_action_revision') then
      raise exception using errcode='22023',message='INVALID_PAYLOAD';
    end if;
    v_result:=jsonb_build_object('action_id',private.crm_contact_normalize_uuid(p_value->'action_id'),
      'expected_action_revision',p_value->'expected_action_revision','reason',private.crm_contact_validate_text(p_value->'reason',true));
    if p_value ? 'replacement_next_action' then
      v_result:=v_result||jsonb_build_object('replacement_next_action',private.crm_contact_normalize_new_action(p_value->'replacement_next_action'));
    end if;
    return v_result;
  elsif p_type='EvaluateContactDeadlines' then
    if not private.crm_json_keys(p_value,array[]::text[]) then raise exception using errcode='22023',message='INVALID_PAYLOAD'; end if;
    return '{}'::jsonb;
  end if;
  raise exception using errcode='22023',message='UNSUPPORTED_COMMAND';
end;
$$;

create function private.crm_normalize_contact_command(p_envelope jsonb)
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
  if v_type is null or v_type not in ('RecordContactOutcome','RecordContactTaskOmission','ScheduleNextAction','RescheduleNextAction','CancelNextAction','EvaluateContactDeadlines') then
    raise exception using errcode='22023', message='UNSUPPORTED_COMMAND';
  end if;
  if jsonb_typeof(p_envelope->'command_id') <> 'string'
     or char_length(p_envelope->>'command_id') <> 36 or not (p_envelope->>'command_id' ~ v_uuid)
     or jsonb_typeof(p_envelope->'idempotency_key') <> 'string'
     or not (p_envelope->>'idempotency_key' ~ v_label) or p_envelope->>'idempotency_key' ~ '[^A-Za-z0-9._:-]'
     or jsonb_typeof(p_envelope->'policy_version_seen') <> 'string'
     or not (p_envelope->>'policy_version_seen' ~ v_label) or p_envelope->>'policy_version_seen' ~ '[^A-Za-z0-9._:-]' then
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
  if not private.crm_json_keys(v_versions,array['lead_aggregate_version','assignment_epoch','contact_revision','next_action_revision','protocol_revision','gates'])
     or not private.crm_json_integer(v_versions->'lead_aggregate_version')
     or not private.crm_json_integer(v_versions->'assignment_epoch')
     or not private.crm_json_integer(v_versions->'contact_revision')
     or not private.crm_json_integer(v_versions->'next_action_revision')
     or not private.crm_json_integer(v_versions->'protocol_revision')
     or jsonb_typeof(v_versions->'gates') is distinct from 'array' then
    raise exception using errcode='22023', message='INVALID_VERSIONS';
  end if;
  if jsonb_array_length(v_versions->'gates') <> 1 then
    raise exception using errcode='22023', message='INVALID_VERSIONS';
  end if;
  v_gate := v_versions#>'{gates,0}';
  if not private.crm_json_keys(v_gate,array['domain','scope_key','writer_epoch','revision','contract_version','policy_version'])
     or v_gate->>'domain' is distinct from 'command_contact_next_action'
     or v_gate->>'contract_version' is distinct from 'contact_next_action.v1'
     or not private.crm_json_integer(v_gate->'writer_epoch')
     or not private.crm_json_integer(v_gate->'revision')
     or jsonb_typeof(v_gate->'scope_key') <> 'string'
     or jsonb_typeof(v_gate->'policy_version') <> 'string'
     or not (v_gate->>'policy_version' ~ v_label) or v_gate->>'policy_version' ~ '[^A-Za-z0-9._:-]' then
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

  v_payload := private.crm_contact_normalize_payload(v_type,p_envelope->'payload');
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

alter function private.crm_contact_json_shape(jsonb,text[],text[]) owner to crm_runtime_owner;
revoke all on function private.crm_contact_json_shape(jsonb,text[],text[]) from public,anon,authenticated,service_role;
alter function private.crm_contact_normalize_uuid(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_contact_normalize_uuid(jsonb) from public,anon,authenticated,service_role;
alter function private.crm_contact_validate_text(jsonb,boolean) owner to crm_runtime_owner;
revoke all on function private.crm_contact_validate_text(jsonb,boolean) from public,anon,authenticated,service_role;
alter function private.crm_contact_validate_timestamp(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_contact_validate_timestamp(jsonb) from public,anon,authenticated,service_role;
alter function private.crm_contact_validate_timezone(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_contact_validate_timezone(jsonb) from public,anon,authenticated,service_role;
alter function private.crm_contact_normalize_action_ref(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_contact_normalize_action_ref(jsonb) from public,anon,authenticated,service_role;
alter function private.crm_contact_normalize_new_action(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_contact_normalize_new_action(jsonb) from public,anon,authenticated,service_role;
alter function private.crm_contact_normalize_fact(jsonb,boolean) owner to crm_runtime_owner;
revoke all on function private.crm_contact_normalize_fact(jsonb,boolean) from public,anon,authenticated,service_role;
alter function private.crm_contact_normalize_payload(text,jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_contact_normalize_payload(text,jsonb) from public,anon,authenticated,service_role;
alter function private.crm_normalize_contact_command(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_normalize_contact_command(jsonb) from public,anon,authenticated,service_role;


-- Fixed projection writer. Caller has already taken the ordered B command locks.
-- A receipt/xid/backend capability is required even for the SECURITY DEFINER.
-- No stage, agenda, task, sequence, metrics, activity or external effects here.
create function private.crm_contact_refresh_projection(p_command_id uuid,p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_authorization jsonb;
  v_runtime private.crm_contact_runtime%rowtype;
  v_last private.crm_contact_facts%rowtype;
  v_last_attempt uuid;
  v_last_response uuid;
  v_snapshot jsonb;
  v_required jsonb;
  v_unknown jsonb;
  v_plan_known boolean;
  v_sequence_status text;
  v_cause text;
  v_classification text;
  v_reason text;
  v_disposition text;
  v_review boolean:=false;
  v_summary jsonb;
  v_channels jsonb;
  v_counts jsonb;
  v_n integer:=0; v_c integer:=0; v_f integer:=0;
  v_r integer:=0; v_o integer:=0; v_u integer:=0;
  v_cancelled integer:=0; v_observed_omissions integer:=0;
  v_review_pending integer:=0;
  v_legacy_at timestamptz;
  v_legacy_outcome text;
  v_contact_at timestamptz;
  v_contact_outcome text;
  v_old_contact_at timestamptz;
  v_old_contact_outcome text;
  v_reviews text[];
  v_changed boolean:=false;
begin
  v_authorization:=private.crm_contact_authorization(p_lead_id);
  if v_authorization is null
     or v_authorization->>'command_id' is distinct from p_command_id::text then
    raise exception using errcode='42501',message='CONTACT_EFFECT_NOT_AUTHORIZED';
  end if;
  select * into v_runtime from private.crm_contact_runtime where lead_id=p_lead_id for update;
  if not found then
    raise exception using errcode='55000',message='CONTACT_RUNTIME_NOT_ADOPTED';
  end if;
  v_snapshot:=v_runtime.baseline_snapshot;
  v_required:=case when jsonb_typeof(v_snapshot->'required_task_ids')='array'
    then v_snapshot->'required_task_ids' else '[]'::jsonb end;
  v_unknown:=case when jsonb_typeof(v_snapshot->'unknown_task_ids')='array'
    then v_snapshot->'unknown_task_ids' else '[]'::jsonb end;
  v_plan_known:=coalesce(v_snapshot->'plan_known'='true'::jsonb,false)
    and jsonb_typeof(v_snapshot->'required_task_ids')='array';
  v_cause:=nullif(v_runtime.protocol_summary->>'cause','');
  select status into v_sequence_status from public.lead_contact_sequences
    where id=v_runtime.current_sequence_id and lead_id=p_lead_id;

  -- Factual pointers are occurrence ordered, not insertion ordered. Historical
  -- reconciliation never replaces the current lead's factual context.
  select f.* into v_last from private.crm_contact_facts f
    where f.lead_id=p_lead_id and not f.historical_only
      and not exists(select 1 from private.crm_contact_facts n where n.amends_fact_id=f.fact_id)
    order by f.occurred_at desc,f.recorded_at desc,f.fact_id desc limit 1;
  select f.fact_id into v_last_attempt from private.crm_contact_facts f
    where f.lead_id=p_lead_id and not f.historical_only and f.fact_kind='outbound_attempt'
      and not exists(select 1 from private.crm_contact_facts n where n.amends_fact_id=f.fact_id)
    order by f.occurred_at desc,f.recorded_at desc,f.fact_id desc limit 1;
  select f.fact_id into v_last_response from private.crm_contact_facts f
    where f.lead_id=p_lead_id and not f.historical_only
      and f.outcome in ('answered','no_interest','requested_no_contact')
      and not exists(select 1 from private.crm_contact_facts n where n.amends_fact_id=f.fact_id)
    order by f.occurred_at desc,f.recorded_at desc,f.fact_id desc limit 1;

  -- Unknown historical work cannot become known merely because a task happens
  -- to be completed/skipped. Only a factual, explicit supervisor review can
  -- resolve an unknown slot. Its authority is proven by the original receipt;
  -- the reviewing actor's later role is irrelevant to that historical decision.
  with required as materialized (
    select distinct value as task_key from jsonb_array_elements_text(v_required)
  ), effective_facts as materialized (
    select f.* from private.crm_contact_facts f
    where f.lead_id=p_lead_id and f.sequence_id=v_runtime.current_sequence_id
      and not exists(select 1 from private.crm_contact_facts n where n.amends_fact_id=f.fact_id)
  ), valid_credits as materialized (
    select c.*,coalesce(r.command_type='RecordContactOutcome'
      and r.request_payload#>>'{payload,variant}'='review'
      and r.request_payload#>>'{payload,decision}'='confirm_credit'
      and r.actor_user_id=c.decision_by_user_id
      and (r.status='applied' or (r.status='evaluating' and r.command_id=p_command_id)),false) as reviewed
    from private.crm_contact_task_credits c
    join effective_facts f on f.fact_id=c.fact_id and f.task_id=c.task_id
      and f.sequence_id=c.sequence_id and f.lead_id=c.lead_id
    join private.crm_command_receipts r on r.command_id=c.command_id
    where c.lead_id=p_lead_id and c.sequence_id=v_runtime.current_sequence_id and c.state='credited'
  ), slots as materialized (
    select x.task_key,t.id,t.status,
      case when t.channel='whatsapp' then 'whatsapp_personal' else coalesce(t.channel,'unknown') end as channel,
      c.task_id is not null as credited,
      (v_unknown ? x.task_key or t.id is null) and not coalesce(c.reviewed,false) as unknown,
      t.status='skipped' or existing.omission_observed_at is not null as omission_observed,
      existing.state='review_required' as review_pending
    from required x
    left join public.lead_contact_tasks t on t.id::text=x.task_key
      and t.lead_id=p_lead_id and t.sequence_id=v_runtime.current_sequence_id
    left join valid_credits c on c.task_id=t.id
    left join private.crm_contact_task_credits existing on existing.task_id=t.id and existing.lead_id=p_lead_id
  ), admissible_facts as materialized (
    select f.* from effective_facts f
    where not f.historical_only or exists(select 1 from valid_credits c where c.fact_id=f.fact_id and c.reviewed)
  ), channels as (
    select channel from slots union select channel from admissible_facts
    union select 'call' union select 'whatsapp_personal'
  ), channel_counts as (
    select h.channel,jsonb_build_object(
      'N',(select count(*) from slots s where s.channel=h.channel),
      'C',(select count(*) from slots s where s.channel=h.channel and s.credited),
      'F',(select count(*) from admissible_facts f where f.channel=h.channel and f.fact_kind='outbound_attempt'),
      'R',(select count(*) from admissible_facts f where f.channel=h.channel and f.outcome in ('answered','no_interest','requested_no_contact')),
      'O',(select count(*) from slots s where s.channel=h.channel and not s.credited and s.omission_observed),
      'U',(select count(*) from slots s where s.channel=h.channel and s.unknown),
      'manual_attestation_facts',(select count(*) from admissible_facts f where f.channel=h.channel),
      'manual_attestation_credits',(select count(*) from slots s where s.channel=h.channel and s.credited),
      'provider_corroborated_facts',0,'provider_corroborated_credits',0
    ) as counts from channels h
  )
  select jsonb_build_object(
    'N',(select count(*) from slots),'C',(select count(*) from slots where credited),
    'F',(select count(*) from admissible_facts where fact_kind='outbound_attempt'),
    'R',(select count(*) from admissible_facts where outcome in ('answered','no_interest','requested_no_contact')),
    'O',(select count(*) from slots where not credited and omission_observed),
    'U',(select count(*) from slots where unknown),
    'cancelled',(select count(*) from slots where status='cancelled'),
    'omissions_observed',(select count(*) from slots where omission_observed),
    'review_pending',(select count(*) from slots where review_pending),
    'manual_facts',(select count(*) from admissible_facts),
    'by_channel',(select jsonb_object_agg(channel,counts) from channel_counts)
  ) into v_counts;
  v_n:=(v_counts->>'N')::integer; v_c:=(v_counts->>'C')::integer;
  v_f:=(v_counts->>'F')::integer; v_r:=(v_counts->>'R')::integer;
  v_o:=(v_counts->>'O')::integer; v_u:=(v_counts->>'U')::integer;
  v_cancelled:=(v_counts->>'cancelled')::integer;
  v_observed_omissions:=(v_counts->>'omissions_observed')::integer;
  v_review_pending:=(v_counts->>'review_pending')::integer;
  v_channels:=v_counts->'by_channel';

  -- Classification precedence is intentional. More than 50% omissions is
  -- descriptive only: it neither implements nor replaces the future 40% rule.
  if v_cause='requested_no_contact' then
    v_classification:='restricted'; v_reason:='requested_no_contact';
  elsif v_cause='superseded' then
    v_classification:='superseded'; v_reason:='manual_agenda';
  elsif v_cause in ('no_interest','invalid','review') then
    v_classification:='review_required'; v_reason:=v_cause; v_review:=true;
  elsif v_cause='answered' and v_r=0 then
    v_classification:='review_required'; v_reason:='response_evidence_revised'; v_review:=true;
  elsif v_cause='answered' or v_r>0 then
    v_classification:='responded'; v_reason:='response_recorded';
  elsif v_runtime.current_sequence_id is null and v_n=0 then
    v_classification:='not_applicable'; v_reason:='no_protocol';
  elsif not coalesce(v_plan_known,false) or v_n=0 or v_u>0 then
    v_classification:='evidence_incomplete'; v_reason:='review_required'; v_review:=true;
  elsif v_sequence_status='active' and v_cause is distinct from 'exhausted' then
    v_classification:='active'; v_reason:=null;
  elsif v_cause='exhausted' or v_sequence_status='completed' then
    if v_c=v_n then
      v_classification:='executed_no_response'; v_reason:='required_slots_credited';
    elsif v_f=0 then
      v_classification:='protocol_incomplete'; v_reason:='zero_effective_attempts';
      v_disposition:='protocol_incomplete'; v_review:=true;
    else
      v_classification:='protocol_incomplete'; v_reason:='partial_execution';
      v_disposition:='protocol_incomplete'; v_review:=true;
    end if;
  else
    v_classification:='review_required'; v_reason:='unclassified_protocol_closure'; v_review:=true;
  end if;

  -- N remains the immutable required-slot snapshot. Cancellation has its own
  -- count and an explicit closure is never given an exhaustion denominator.
  -- Ratios are descriptive evidence, not a cold-base/recovery routing policy.
  v_summary:=jsonb_build_object(
    'schema_version',1,'sequence_id',v_runtime.current_sequence_id,'cause',v_cause,
    'classification',v_classification,'reason',v_reason,'disposition',v_disposition,
    'review_required',v_review or v_review_pending>0,'plan_known',coalesce(v_plan_known,false),
    'N',v_n,'C',v_c,'F',v_f,'R',v_r,'O',v_o,'U',v_u,'required_slot_count',v_n,
    'ratio',case when v_n>0 then v_c::numeric/v_n else null end,
    'coverage_ratio',case when v_n>0 then v_c::numeric/v_n else null end,
    'exhausted_denominator',case when v_cause='exhausted' or (v_cause is null and v_sequence_status='completed') then v_n else null end,
    'cancelled_slots',v_cancelled,'omissions_observed_count',v_observed_omissions,
    'pending_credit_reviews',v_review_pending,'omissions_predominate',v_o>v_n::numeric/2,
    'by_channel',v_channels,
    'evidence_quality',jsonb_build_object('manual_attestation_facts',(v_counts->>'manual_facts')::integer,
      'manual_attestation_credits',v_c,'provider_corroborated_facts',0,'provider_corroborated_credits',0,
      'unknown_slots',v_u),
    'zero_attempts_meaning','zero recorded admissible attempts in available evidence; not proof that no physical call occurred'
  );

  select coalesce(array_agg(reason order by reason),'{}'::text[]) into v_reviews
    from (select distinct reason from unnest(v_runtime.review_reasons) x(reason)
      where reason not in ('protocol_incomplete','protocol_evidence_incomplete','protocol_review_required')
      union select 'protocol_incomplete' where v_classification='protocol_incomplete'
      union select 'protocol_evidence_incomplete' where v_classification='evidence_incomplete'
      union select 'protocol_review_required' where v_classification='review_required') reasons;

  if v_runtime.protocol_summary is distinct from v_summary
     or v_runtime.last_contact_fact_id is distinct from v_last.fact_id
     or v_runtime.last_attempt_fact_id is distinct from v_last_attempt
     or v_runtime.last_response_fact_id is distinct from v_last_response
     or v_runtime.review_reasons is distinct from v_reviews then
    update private.crm_contact_runtime set protocol_summary=v_summary,
      last_contact_fact_id=v_last.fact_id,last_attempt_fact_id=v_last_attempt,
      last_response_fact_id=v_last_response,review_reasons=v_reviews,updated_at=clock_timestamp()
      where lead_id=p_lead_id;
    v_changed:=true;
  end if;

  -- Preserve the adopted legacy last-contact baseline if no newer canonical
  -- observation exists. A late record cannot move factual time backwards.
  v_legacy_at:=nullif(v_snapshot#>>'{legacy_crm,last_contact_at}','')::timestamptz;
  v_legacy_outcome:=coalesce(v_snapshot#>>'{legacy_crm,last_contact_outcome}','');
  if v_last.fact_id is not null and (v_legacy_at is null or v_last.occurred_at>=v_legacy_at) then
    v_contact_at:=v_last.occurred_at; v_contact_outcome:=v_last.outcome;
  else
    v_contact_at:=v_legacy_at; v_contact_outcome:=v_legacy_outcome;
  end if;
  if v_last.fact_id is not null or v_runtime.last_contact_fact_id is not null then
    select last_contact_at,last_contact_outcome into v_old_contact_at,v_old_contact_outcome
      from public.lead_crm where lead_id=p_lead_id;
    if found and (v_old_contact_at is distinct from v_contact_at or v_old_contact_outcome is distinct from v_contact_outcome) then
      update public.lead_crm set last_contact_at=v_contact_at,last_contact_outcome=v_contact_outcome
        where lead_id=p_lead_id;
      v_changed:=true;
    end if;
  end if;
  return jsonb_build_object('summary',v_summary,'changed',v_changed,
    'last_contact_fact_id',v_last.fact_id,'last_attempt_fact_id',v_last_attempt,
    'last_response_fact_id',v_last_response);
end;
$function$;
alter function private.crm_contact_refresh_projection(uuid,uuid) owner to postgres;
revoke all on function private.crm_contact_refresh_projection(uuid,uuid) from public,anon,authenticated,service_role;


-- Fixed Contact effect helpers. Only the closed engine grants an in-transaction
-- receipt capability. No helper accepts a caller-supplied actor or arbitrary DML.
create function private.crm_contact_emit(p_command uuid,p_lead uuid,p_type text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r private.crm_command_receipts%rowtype; c jsonb; v_id uuid:=gen_random_uuid(); v_index smallint;
 v_owner uuid; v_version bigint; v_manifest text;
begin
 c:=private.crm_contact_authorization(p_lead);
 if c is null or (c->>'command_id')::uuid<>p_command then raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 select * into strict r from private.crm_command_receipts where command_id=p_command;
 select aggregate_version+1 into strict v_version from private.crm_lead_runtime where lead_id=p_lead;
 select assigned_seller_user_id into v_owner from public.leads where id=p_lead;
 select baseline_manifest_id into v_manifest from private.crm_runtime_policies where policy_version=r.policy_version;
 select coalesce(max(event_index),-1)+1 into v_index from private.crm_events where command_id=p_command;
 insert into private.crm_events(event_id,command_id,event_index,event_type,schema_version,aggregate_kind,
  aggregate_id,aggregate_version,project_ref,lead_id,actor_user_id,actor_subject,responsible_user_id_at_event,
  responsible_subject_at_event,occurred_at,correlation_id,causation_event_id,policy_version,manifest_id,payload)
 values(v_id,p_command,v_index,p_type,1,'lead_contact',p_lead,v_version,r.project_ref,p_lead,r.actor_user_id,r.actor_subject,
  v_owner,case when v_owner is not null then 'user:'||v_owner::text end,clock_timestamp(),r.correlation_id,
  r.causation_event_id,r.policy_version,v_manifest,p_payload||jsonb_build_object(
   'commercial_work',p_type='ContactOutcomeRecorded' and r.request_payload#>>'{payload,variant}'='record'
     and coalesce((p_payload->>'historical_only')::boolean,false)=false
     and r.request_payload#>>'{payload,outcome}'<>'requested_no_contact',
   'origin',case when r.command_type='EvaluateContactDeadlines' then 'domain_clock' else 'contact_command' end));
 return v_id;
end; $$;

create function private.crm_contact_close_protocol(p_command uuid,p_lead uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare c jsonb; v_seq uuid; v_status text;
begin
 c:=private.crm_contact_authorization(p_lead);
 if c is null or (c->>'command_id')::uuid<>p_command then raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 if p_reason not in ('answered','no_interest','invalid','requested_no_contact','superseded','exhausted') then
   raise exception using errcode='P0107',message='PROTOCOL_STATE_CONFLICT'; end if;
 select current_sequence_id into v_seq from private.crm_contact_runtime where lead_id=p_lead;
 if v_seq is null then return false; end if;
 select status into v_status from public.lead_contact_sequences where id=v_seq;
 if v_status<>'active' then return false; end if;
 if p_reason='exhausted' then
   if exists(select 1 from public.lead_contact_tasks t where sequence_id=v_seq and status in ('pending','scheduled')
      and not exists(select 1 from private.crm_contact_task_credits k where k.task_id=t.id and k.state='credited')) then return false; end if;
   update public.lead_contact_sequences set status='completed',completed_at=clock_timestamp(),stopped_reason=''
      where id=v_seq;
 else
   update public.lead_contact_tasks set status='cancelled',note=case when note='' then 'Runtime: '||p_reason else note end
      where sequence_id=v_seq and status in ('pending','scheduled');
   update public.lead_contact_sequences set status='cancelled',completed_at=clock_timestamp(),stopped_reason='Runtime: '||p_reason
      where id=v_seq;
 end if;
 update private.crm_contact_runtime set protocol_summary=protocol_summary||jsonb_build_object('cause',p_reason),updated_at=clock_timestamp() where lead_id=p_lead;
 perform private.crm_contact_emit(p_command,p_lead,case when p_reason='superseded' then 'ProtocolSuperseded' else 'ProtocolClosed' end,
   jsonb_build_object('sequence_id',v_seq,'cause',p_reason));
 return true;
end; $$;

create function private.crm_contact_schedule_action(p_command uuid,p_lead uuid,p_action jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare c jsonb; v_runtime private.crm_contact_runtime%rowtype; a private.crm_next_actions%rowtype;
 v_id uuid:=(p_action->>'action_id')::uuid; v_due timestamptz:=(p_action->>'due_at')::timestamptz; v_now timestamptz:=clock_timestamp();
 v_lead public.leads%rowtype; v_status text;
begin
 c:=private.crm_contact_authorization(p_lead);
 if c is null or (c->>'command_id')::uuid<>p_command or not (
   (c->>'command_type'='ScheduleNextAction' and p_action=c->'payload')
   or (c->>'command_type' in ('RecordContactOutcome','CancelNextAction') and p_action=c#>'{payload,replacement_next_action}')) then
   raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 select * into strict v_lead from public.leads where id=p_lead;
 if v_lead.do_not_contact or exists(select 1 from public.customers where id=v_lead.customer_id and do_not_contact) then
   raise exception using errcode='P0107',message='CONTACT_RESTRICTED'; end if;
 if v_due<=v_now or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_action->>'timezone') then
   raise exception using errcode='P0107',message='CONTACT_TIME_INVALID'; end if;
 if exists(select 1 from private.crm_next_actions where action_id=v_id) then
   raise exception using errcode='P0107',message='NEXT_ACTION_CONFLICT'; end if;
 select * into strict v_runtime from private.crm_contact_runtime where lead_id=p_lead;
 if v_runtime.principal_action_id is not null then
   select * into strict a from private.crm_next_actions where action_id=v_runtime.principal_action_id;
   if not (p_action ? 'replaces_action') or (p_action#>>'{replaces_action,action_id}')::uuid<>a.action_id
      or (p_action#>>'{replaces_action,revision}')::bigint<>a.revision or a.status<>'open' then
     raise exception using errcode='P0107',message='NEXT_ACTION_CONFLICT'; end if;
   if a.revision>=9007199254740991 then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
   update private.crm_next_actions set status='superseded',revision=revision+1,last_command_id=p_command,updated_at=v_now where action_id=a.action_id;
   perform private.crm_contact_emit(p_command,p_lead,'NextActionSuperseded',jsonb_build_object('action_id',a.action_id,'replacement_id',v_id));
 elsif p_action ? 'replaces_action' then
   -- A record/cancel may already have closed the expected old action in this
   -- same transaction. It must belong to this exact command, not old history.
   if not exists(select 1 from private.crm_next_actions where action_id=(p_action#>>'{replaces_action,action_id}')::uuid
      and lead_id=p_lead and last_command_id=p_command and status in ('completed','cancelled')
      and revision=(p_action#>>'{replaces_action,revision}')::bigint+1) then
     raise exception using errcode='P0107',message='NEXT_ACTION_CONFLICT'; end if;
 end if;
 select status into v_status from public.lead_contact_sequences where id=v_runtime.current_sequence_id;
 if v_status='active' then
   if not (p_action ? 'protocol_replacement') or (p_action#>>'{protocol_replacement,sequence_id}')::uuid<>v_runtime.current_sequence_id then
     raise exception using errcode='P0107',message='PROTOCOL_STATE_CONFLICT'; end if;
   perform private.crm_contact_close_protocol(p_command,p_lead,'superseded');
 elsif p_action ? 'protocol_replacement' then
   raise exception using errcode='P0107',message='PROTOCOL_STATE_CONFLICT';
 end if;
 insert into private.crm_next_actions(action_id,lead_id,due_at,timezone,channel,created_by_user_id,command_id,last_command_id,reason,note)
 values(v_id,p_lead,v_due,p_action->>'timezone',p_action->>'channel',(c->>'actor_user_id')::uuid,p_command,p_command,p_action->>'reason',p_action->>'note');
 update private.crm_contact_runtime set principal_action_id=v_id,next_action_required=false,next_action_reason=null,
   review_reasons=array_remove(review_reasons,'next_action_required'),updated_at=v_now where lead_id=p_lead;
 update public.lead_crm set next_contact_at=v_due,next_contact_note=p_action->>'note',next_contact_source='manual',updated_by=(c->>'actor_user_id')::uuid where lead_id=p_lead;
 perform private.crm_contact_emit(p_command,p_lead,'NextActionScheduled',jsonb_build_object('action_id',v_id,'due_at',v_due,'channel',p_action->>'channel','revision',0));
 return v_id;
end; $$;

create function private.crm_contact_review_revision(p_root uuid)
returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from private.crm_events where aggregate_kind='lead_contact'
  and event_type in ('ContactEvidenceReviewed','ContactFactAmended') and payload->>'root_fact_id'=p_root::text;
$$;

create function private.crm_contact_credit_fact(p_command uuid,p_lead uuid,p_fact uuid,p_supervised boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare c jsonb; f private.crm_contact_facts%rowtype; t public.lead_contact_tasks%rowtype;
 k private.crm_contact_task_credits%rowtype; v_state text; v_now timestamptz:=clock_timestamp(); v_role text;
begin
 c:=private.crm_contact_authorization(p_lead);
 if c is null or (c->>'command_id')::uuid<>p_command or c->>'command_type'<>'RecordContactOutcome' then
  raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 if p_supervised then
  select role::text into v_role from public.profiles where user_id=(c->>'actor_user_id')::uuid and active;
  if v_role not in ('admin','supervisor') or c#>>'{payload,variant}'<>'review' or c#>>'{payload,decision}'<>'confirm_credit' then
   raise exception using errcode='42501',message='FORBIDDEN_COMMAND'; end if;
 end if;
 if p_fact is distinct from (c#>>'{payload,fact_id}')::uuid then raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 select * into strict f from private.crm_contact_facts where fact_id=p_fact and lead_id=p_lead;
 if exists(select 1 from private.crm_contact_facts where amends_fact_id=p_fact) then raise exception using errcode='P0107',message='CONTACT_FACT_ALREADY_AMENDED'; end if;
 if f.task_id is null or f.fact_kind<>'outbound_attempt' then return 'not_applicable'; end if;
 select * into strict t from public.lead_contact_tasks where id=f.task_id and lead_id=p_lead;
 if exists(select 1 from public.leads l where l.id=p_lead and ((l.do_not_contact and (l.do_not_contact_at is null or f.occurred_at>l.do_not_contact_at))
    or exists(select 1 from public.customers u where u.id=l.customer_id and u.do_not_contact and (u.do_not_contact_at is null or f.occurred_at>u.do_not_contact_at)))) then
  if p_supervised then raise exception using errcode='P0107',message='CONTACT_EVIDENCE_NOT_ELIGIBLE';end if;
  return 'outside_requirements';
 end if;
 if f.occurred_at<t.due_start or f.occurred_at>t.due_end or
    (case when f.channel='whatsapp_personal' then 'whatsapp' else f.channel end)<>t.channel then
   if p_supervised then raise exception using errcode='P0107',message='CONTACT_EVIDENCE_NOT_ELIGIBLE'; end if;
   return 'outside_requirements';
 end if;
 select * into k from private.crm_contact_task_credits where task_id=t.id;
 if found and k.state='credited' then raise exception using errcode='P0107',message='TASK_ALREADY_CREDITED'; end if;
 v_state:=case when p_supervised then 'credited' when f.historical_only or f.recorded_at>t.due_end or t.status in ('skipped','cancelled','completed') then 'review_required' else 'credited' end;
 if k.revision>=9007199254740991 then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
 insert into private.crm_contact_task_credits(task_id,lead_id,fact_id,sequence_id,state,revision,decision_by_user_id,command_id,policy_version,original_due_start,original_due_end,omission_observed_at)
 values(t.id,p_lead,f.fact_id,t.sequence_id,v_state,0,(c->>'actor_user_id')::uuid,p_command,c->>'policy_version',t.due_start,t.due_end,case when t.status='skipped' then t.completed_at end)
 on conflict(task_id) do update set fact_id=excluded.fact_id,state=excluded.state,revision=private.crm_contact_task_credits.revision+1,
  decision_by_user_id=excluded.decision_by_user_id,command_id=p_command,policy_version=excluded.policy_version,
  omission_observed_at=coalesce(private.crm_contact_task_credits.omission_observed_at,excluded.omission_observed_at),updated_at=v_now;
 if v_state='credited' and not f.historical_only and t.status in ('pending','scheduled') then
  update public.lead_contact_tasks set status='completed',outcome=f.outcome,note=f.note,completed_at=v_now,
    completed_by=f.performer_user_id,performed_at=f.occurred_at,recorded_at=f.recorded_at where id=t.id;
 end if;
 perform private.crm_contact_emit(p_command,p_lead,case when v_state='credited' then 'ContactTaskCredited' else 'ContactEvidenceReviewRequired' end,
  jsonb_build_object('fact_id',f.fact_id,'root_fact_id',f.root_fact_id,'task_id',t.id,'sequence_id',t.sequence_id,'state',v_state,
   'supervised',p_supervised,'evidence_quality',f.evidence_quality,'occurred_at',f.occurred_at,'recorded_at',f.recorded_at));
 return v_state;
end; $$;

create function private.crm_apply_contact_command(p_command uuid,p_lead uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c jsonb; p jsonb; v_type text; v_actor uuid; v_role text; v_now timestamptz;
 l public.leads%rowtype; cr public.lead_crm%rowtype; t public.lead_contact_tasks%rowtype;
 rt private.crm_contact_runtime%rowtype; v_before jsonb; v_after jsonb;
 f private.crm_contact_facts%rowtype; prior private.crm_contact_facts%rowtype;
 a private.crm_next_actions%rowtype; k private.crm_contact_task_credits%rowtype;
 v_fact uuid; v_action uuid; v_root uuid; v_amend uuid; v_fact_revision bigint:=0; v_review bigint;
 v_assignment_epoch bigint; v_epoch_start timestamptz; v_adopted_at timestamptz; v_record jsonb;
 v_historical boolean; v_paused boolean; v_restriction boolean; v_credit text; v_kind text;
 v_sequence uuid; v_task uuid; v_action_ref uuid; v_any integer:=0; v_row record;
 v_contact_changed boolean:=false; v_action_changed boolean:=false; v_protocol_changed boolean:=false;
 v_effect jsonb; v_summary jsonb; v_projection jsonb; v_event_count integer;
begin
 c:=private.crm_contact_authorization(p_lead);
 if c is null or (c->>'command_id')::uuid<>p_command then raise exception using errcode='42501',message='WRITER_FENCED'; end if;
 p:=c->'payload'; v_type:=c->>'command_type'; v_actor:=(c->>'actor_user_id')::uuid;
 select role::text into v_role from public.profiles where user_id=v_actor and active;
 if v_role is null then raise exception using errcode='P0107',message='ACTOR_INACTIVE'; end if;
 select * into strict l from public.leads where id=p_lead for update;
 select * into strict rt from private.crm_contact_runtime where lead_id=p_lead for update;
 select aggregate_version,assignment_epoch into v_row from private.crm_lead_runtime where lead_id=p_lead;
 v_assignment_epoch:=v_row.assignment_epoch;
 select adopted_at into v_adopted_at from private.crm_contact_next_action_adoptions where lead_id=p_lead;
 select max(recorded_at) into v_epoch_start from private.crm_events where lead_id=p_lead
  and event_type in ('LeadAssigned','LeadTransferred') and (payload->>'assignment_epoch')::bigint=v_assignment_epoch;
 v_epoch_start:=greatest(v_adopted_at,coalesce(v_epoch_start,v_adopted_at));
 select mode='paused' into v_paused from private.crm_runtime_gates where domain='command_contact_next_action' and scope_key='lead:'||p_lead::text;
 v_restriction:=v_type='RecordContactOutcome' and coalesce(p->>'outcome',p#>>'{replacement_fact,outcome}')='requested_no_contact';
 if v_restriction then
  -- Customer lock is before CRM/protocol/action; no identity creation occurs.
  if l.customer_id is null then raise exception using errcode='P0107',message='IDENTITY_RECONCILIATION_REQUIRED'; end if;
  perform id from public.customers where id=l.customer_id for update;
 end if;
 select * into strict cr from public.lead_crm where lead_id=p_lead for update;
 perform id from public.lead_contact_sequences where lead_id=p_lead order by id for update;
 perform id from public.lead_contact_tasks where lead_id=p_lead order by id for update;
 perform action_id from private.crm_next_actions where lead_id=p_lead order by action_id for update;
 perform task_id from private.crm_contact_task_credits where lead_id=p_lead order by task_id for update;
 v_now:=clock_timestamp(); v_before:=to_jsonb(rt);
 if v_type<>'RecordContactOutcome' and (l.do_not_contact or exists(select 1 from public.customers where id=l.customer_id and do_not_contact))
    and v_type in ('ScheduleNextAction','RescheduleNextAction') then
  raise exception using errcode='P0107',message='CONTACT_RESTRICTED'; end if;
 if v_type='RecordContactOutcome' then
  if p->>'variant'='review' then
   if v_role not in ('admin','supervisor') then raise exception using errcode='P0107',message='FORBIDDEN_COMMAND'; end if;
   select * into prior from private.crm_contact_facts where fact_id=(p->>'fact_id')::uuid and lead_id=p_lead;
   if not found then raise exception using errcode='P0107',message='FORBIDDEN_SCOPE'; end if;
   if exists(select 1 from private.crm_contact_facts where amends_fact_id=prior.fact_id) then
     raise exception using errcode='P0107',message='CONTACT_FACT_ALREADY_AMENDED'; end if;
   v_review:=private.crm_contact_review_revision(prior.root_fact_id);
   if v_review<>(p->>'expected_review_revision')::bigint then raise exception using errcode='P0107',message='VERSION_CONFLICT'; end if;
   if p->>'decision'='confirm_credit' then
    if prior.task_id is null or prior.fact_kind<>'outbound_attempt' then raise exception using errcode='P0107',message='CONTACT_EVIDENCE_NOT_ELIGIBLE'; end if;
    v_credit:=private.crm_contact_credit_fact(p_command,p_lead,prior.fact_id,true);
    perform private.crm_contact_emit(p_command,p_lead,'ContactEvidenceReviewed',jsonb_build_object('fact_id',prior.fact_id,
      'root_fact_id',prior.root_fact_id,'review_revision',v_review+1,'decision','confirm_credit','reason',p->>'reason','evidence_quality','manual_attestation'));
    v_contact_changed:=true; v_protocol_changed:=true;
   elsif p->>'decision'='deny_credit' then
    select * into k from private.crm_contact_task_credits where fact_id=prior.fact_id and lead_id=p_lead;
    if not found or k.state not in ('review_required','credited') then raise exception using errcode='P0107',message='NO_STATE_CHANGE'; end if;
    if k.revision>=9007199254740991 then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
    update private.crm_contact_task_credits set state=case when state='credited' then 'revoked' else 'denied' end,
      revision=revision+1,decision_by_user_id=v_actor,command_id=p_command,updated_at=v_now where task_id=k.task_id;
    if k.state='credited' then perform private.crm_contact_emit(p_command,p_lead,'ContactCreditRevoked',jsonb_build_object('fact_id',prior.fact_id,'task_id',k.task_id,'reason',p->>'reason')); end if;
    perform private.crm_contact_emit(p_command,p_lead,'ContactEvidenceReviewed',jsonb_build_object('fact_id',prior.fact_id,
      'root_fact_id',prior.root_fact_id,'review_revision',v_review+1,'decision','deny_credit','reason',p->>'reason','evidence_quality','manual_attestation'));
    v_contact_changed:=true; v_protocol_changed:=true;
   else
    v_record:=p->'replacement_fact'; v_root:=prior.root_fact_id; v_amend:=prior.fact_id; v_fact_revision:=prior.revision+1;
    if prior.revision>=9007199254740991 then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
    -- An amendment does not erase a known opt-out, nor move evidence to another
    -- task/action/sequence in order to rewrite obligations from a past command.
    if prior.outcome='requested_no_contact' and v_record->>'outcome'<>'requested_no_contact' then raise exception using errcode='P0107',message='CONTACT_RESTRICTED'; end if;
    if (v_record#>>'{task_ref,task_id}')::uuid is distinct from prior.task_id
       or (prior.task_id is not null and (v_record#>>'{task_ref,sequence_id}')::uuid is distinct from prior.sequence_id)
       or (v_record#>>'{action_ref,action_id}')::uuid is distinct from prior.action_id then
      raise exception using errcode='P0107',message='DOMAIN_BOUNDARY_REQUIRED'; end if;
   end if;
  else
   v_record:=p; v_root:=(p->>'fact_id')::uuid;
  end if;
  if v_record is not null then
   v_fact:=(v_record->>'fact_id')::uuid;
   if exists(select 1 from private.crm_contact_facts where fact_id=v_fact) then raise exception using errcode='P0107',message='CONTACT_FACT_ID_REUSED'; end if;
   if (v_record->>'occurred_at')::timestamptz>v_now then raise exception using errcode='P0107',message='CONTACT_TIME_INVALID'; end if;
   v_task:=(v_record#>>'{task_ref,task_id}')::uuid; v_sequence:=(v_record#>>'{task_ref,sequence_id}')::uuid;
   v_action_ref:=(v_record#>>'{action_ref,action_id}')::uuid;
   if v_task is not null then
    select * into t from public.lead_contact_tasks where id=v_task and lead_id=p_lead and sequence_id=v_sequence;
    if not found then raise exception using errcode='P0107',message='TASK_SCOPE_MISMATCH'; end if;
    if (case when v_record->>'channel'='whatsapp_personal' then 'whatsapp' else v_record->>'channel' end)<>t.channel then
     raise exception using errcode='P0107',message='TASK_SCOPE_MISMATCH'; end if;
   else
    -- A response can relate to the ongoing search without pretending that it
    -- was an outbound task attempt; unlinked attempts also keep sequence context.
    v_sequence:=case when v_amend is not null then prior.sequence_id
      when v_action_ref is null and exists(select 1 from public.lead_contact_sequences where id=rt.current_sequence_id and status='active') then rt.current_sequence_id else null end;
   end if;
   v_historical:=(v_record->>'occurred_at')::timestamptz<v_epoch_start
      or (v_sequence is not null and v_sequence is distinct from rt.current_sequence_id);
   if v_sequence is not null and exists(select 1 from public.lead_contact_sequences where id=v_sequence and status='cancelled') then v_historical:=true; end if;
   if v_amend is not null then v_historical:=prior.historical_only or v_historical; end if;
   if v_historical and not v_restriction and v_role='seller' and (v_record->>'occurred_at')::timestamptz<v_epoch_start then
    -- A current seller cannot claim work from a previous owner or adoption.
    -- Supervisor reconciliation is available without restoring exowner rights.
    raise exception using errcode='P0107',message='HISTORICAL_ATTRIBUTION_REVIEW_REQUIRED'; end if;
   if not v_restriction and v_record->>'fact_kind'='outbound_attempt'
      and (l.do_not_contact or exists(select 1 from public.customers where id=l.customer_id and do_not_contact))
      and not coalesce(v_amend is not null
        and prior.occurred_at <= (select min(d) from (select l.do_not_contact_at as d where l.do_not_contact union all select do_not_contact_at from public.customers where id=l.customer_id and do_not_contact) x)
        and (v_record->>'occurred_at')::timestamptz <= (select min(d) from (select l.do_not_contact_at as d where l.do_not_contact union all select do_not_contact_at from public.customers where id=l.customer_id and do_not_contact) x),false) then
    raise exception using errcode='P0107',message='CONTACT_RESTRICTED'; end if;
   if v_action_ref is not null then
    select * into a from private.crm_next_actions where action_id=v_action_ref and lead_id=p_lead;
    if not found then raise exception using errcode='P0107',message='FORBIDDEN_SCOPE'; end if;
    if v_amend is null and not v_historical and (a.status<>'open' or a.action_id is distinct from rt.principal_action_id
       or a.revision<>(v_record#>>'{action_ref,revision}')::bigint) then
     raise exception using errcode='P0107',message='NEXT_ACTION_CONFLICT'; end if;
   end if;
   insert into private.crm_contact_facts(fact_id,lead_id,command_id,record_kind,root_fact_id,revision,amends_fact_id,
    recorded_by_user_id,performer_user_id,owner_user_id_at_record,assignment_epoch,occurred_at,recorded_at,channel,fact_kind,direction,
    outcome,note,source_kind,evidence_quality,evidence,task_id,sequence_id,action_id,historical_only)
   values(v_fact,p_lead,p_command,case when v_amend is null then 'observation' else 'amendment' end,v_root,v_fact_revision,v_amend,
    v_actor,case when v_amend is not null then prior.performer_user_id when v_historical and v_role in ('admin','supervisor') then null else v_actor end,l.assigned_seller_user_id,v_assignment_epoch,
    (v_record->>'occurred_at')::timestamptz,v_now,v_record->>'channel',v_record->>'fact_kind',
    case when v_record->>'fact_kind'='inbound_response' then 'inbound' else 'outbound' end,v_record->>'outcome',v_record->>'note',
    case when v_role in ('admin','supervisor') then 'supervisor_attested' else 'manual_attested' end,'manual_attestation',
    jsonb_build_object('declaration','manual','review_reason',p->>'reason'),v_task,v_sequence,v_action_ref,v_historical);
   v_contact_changed:=true;
   if v_amend is not null then
    if exists(select 1 from private.crm_contact_task_credits where fact_id=prior.fact_id and state in ('credited','review_required') and revision>=9007199254740991) then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
    update private.crm_contact_task_credits set state='revoked',revision=revision+1,decision_by_user_id=v_actor,command_id=p_command,updated_at=v_now
      where fact_id=prior.fact_id and state in ('credited','review_required');
    if found then
     v_protocol_changed:=true;
     perform private.crm_contact_emit(p_command,p_lead,'ContactCreditRevoked',jsonb_build_object('fact_id',prior.fact_id,'replacement_fact_id',v_fact,'reason',p->>'reason'));
    end if;
    perform private.crm_contact_emit(p_command,p_lead,'ContactFactAmended',jsonb_build_object('fact_id',v_fact,'root_fact_id',v_root,
      'amends_fact_id',v_amend,'review_revision',v_review+1,'reason',p->>'reason'));
   else
    perform private.crm_contact_emit(p_command,p_lead,'ContactOutcomeRecorded',jsonb_build_object('fact_id',v_fact,'root_fact_id',v_root,
      'fact_kind',v_record->>'fact_kind','outcome',v_record->>'outcome','channel',v_record->>'channel','occurred_at',v_record->'occurred_at',
      'recorded_at',v_now,'historical_only',v_historical,'evidence_quality','manual_attestation'));
    if not v_paused then
      v_credit:=private.crm_contact_credit_fact(p_command,p_lead,v_fact,false);
      v_protocol_changed:=v_credit in ('credited','review_required');
    end if;
   end if;
   if v_restriction then
    perform private.crm_contact_apply_restriction(p_lead);
    if private.crm_contact_close_protocol(p_command,p_lead,'requested_no_contact') then v_protocol_changed:=true; end if;
    for a in select * from private.crm_next_actions where lead_id=p_lead and status='open' loop
     if a.revision>=9007199254740991 then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
     update private.crm_next_actions set status='cancelled',revision=revision+1,last_command_id=p_command,updated_at=v_now where action_id=a.action_id;
     perform private.crm_contact_emit(p_command,p_lead,'NextActionCancelled',jsonb_build_object('action_id',a.action_id,'reason','requested_no_contact'));
     v_action_changed:=true;
    end loop;
    update private.crm_contact_runtime set principal_action_id=null,next_action_required=false,next_action_reason=null,
      review_reasons=array_remove(review_reasons,'next_action_required'),updated_at=v_now where lead_id=p_lead;
    update public.lead_crm set next_contact_at=null,next_contact_note='',next_contact_source=null,updated_by=v_actor where lead_id=p_lead;
    perform private.crm_contact_emit(p_command,p_lead,'ContactRestrictionRecorded',jsonb_build_object('fact_id',v_fact,'known_at',v_now,'requested_at',v_record->'occurred_at','monotonic',true));
   elsif v_amend is null and not v_historical then
    if v_record->>'outcome' in ('answered','no_interest','invalid') then
     if private.crm_contact_close_protocol(p_command,p_lead,v_record->>'outcome') then v_protocol_changed:=true; end if;
     if v_record->>'outcome' in ('no_interest','invalid') then
      update private.crm_contact_runtime set review_reasons=array_append(array_remove(review_reasons,v_record->>'outcome'),v_record->>'outcome') where lead_id=p_lead;
     end if;
    end if;
    if v_action_ref is not null then
     if a.revision>=9007199254740991 then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
     -- Completion requires an actual outbound attempt matching this action's
     -- channel, or an inbound response (never a click or clock observation).
     if a.channel<>'unspecified' and a.channel<>v_record->>'channel' then raise exception using errcode='P0107',message='NEXT_ACTION_CONFLICT'; end if;
     update private.crm_next_actions set status='completed',revision=revision+1,completed_by_fact_id=v_fact,last_command_id=p_command,updated_at=v_now where action_id=v_action_ref;
     update private.crm_contact_runtime set principal_action_id=null,next_action_required=true,next_action_reason='completed_without_next_commitment',
       review_reasons=array_append(array_remove(review_reasons,'next_action_required'),'next_action_required'),updated_at=v_now where lead_id=p_lead;
     perform private.crm_contact_emit(p_command,p_lead,'NextActionCompleted',jsonb_build_object('action_id',v_action_ref,'fact_id',v_fact));
     v_action_changed:=true;
     if not (p ? 'replacement_next_action') then
      update public.lead_crm set next_contact_at=null,next_contact_note='',next_contact_source=null,updated_by=v_actor where lead_id=p_lead;
      perform private.crm_contact_emit(p_command,p_lead,'NextActionRequired',jsonb_build_object('cause','completed_without_next_commitment','completed_action_id',v_action_ref));
     end if;
    end if;
    if v_record->>'outcome'='answered' and v_action_ref is null and not (p ? 'replacement_next_action')
       and not exists(select 1 from private.crm_next_actions where lead_id=p_lead and status='open') then
     update private.crm_contact_runtime set next_action_required=true,next_action_reason='response_without_next_commitment',
       review_reasons=array_append(array_remove(review_reasons,'next_action_required'),'next_action_required'),updated_at=v_now where lead_id=p_lead;
     perform private.crm_contact_emit(p_command,p_lead,'NextActionRequired',jsonb_build_object('cause','response_without_next_commitment','fact_id',v_fact));
     v_action_changed:=true;
    end if;
    if p ? 'replacement_next_action' then v_action:=private.crm_contact_schedule_action(p_command,p_lead,p->'replacement_next_action');v_action_changed:=true;end if;
   elsif p ? 'replacement_next_action' then
    raise exception using errcode='P0107',message='DOMAIN_BOUNDARY_REQUIRED';
   end if;
  end if;
 elsif v_type='RecordContactTaskOmission' then
  select * into t from public.lead_contact_tasks where id=(p->>'task_id')::uuid and lead_id=p_lead and sequence_id=(p->>'sequence_id')::uuid;
  if not found then raise exception using errcode='P0107',message='TASK_SCOPE_MISMATCH'; end if;
  if t.status<>'pending' or t.sequence_id is distinct from rt.current_sequence_id
     or not exists(select 1 from public.lead_contact_sequences where id=t.sequence_id and status='active') then raise exception using errcode='P0107',message='PROTOCOL_STATE_CONFLICT'; end if;
  if exists(select 1 from private.crm_contact_task_credits where task_id=t.id and state='credited') then raise exception using errcode='P0107',message='TASK_ALREADY_CREDITED'; end if;
  update public.lead_contact_tasks set status='skipped',outcome='skipped',note=p->>'note',completed_at=v_now,completed_by=v_actor,performed_at=null,recorded_at=v_now where id=t.id;
  perform private.crm_contact_emit(p_command,p_lead,'ContactTaskOmitted',jsonb_build_object('task_id',t.id,'sequence_id',t.sequence_id,'reason_code',p->>'reason_code','note',p->>'note','performed',false));
  v_protocol_changed:=true;
 elsif v_type='ScheduleNextAction' then
  v_action:=private.crm_contact_schedule_action(p_command,p_lead,p);v_action_changed:=true;
 elsif v_type in ('RescheduleNextAction','CancelNextAction') then
  select * into a from private.crm_next_actions where action_id=(p->>'action_id')::uuid and lead_id=p_lead;
  if not found or a.status<>'open' or a.action_id is distinct from rt.principal_action_id
     or a.revision<>(p->>'expected_action_revision')::bigint then raise exception using errcode='P0107',message='NEXT_ACTION_CONFLICT'; end if;
  if a.revision>=9007199254740991 then raise exception using errcode='P0107',message='VERSION_EXHAUSTED'; end if;
  if v_type='RescheduleNextAction' then
   if (p->>'due_at')::timestamptz<=v_now or not exists(select 1 from pg_catalog.pg_timezone_names where name=p->>'timezone') then raise exception using errcode='P0107',message='CONTACT_TIME_INVALID'; end if;
   if exists(select 1 from public.lead_contact_sequences where lead_id=p_lead and status='active') then raise exception using errcode='P0107',message='PROTOCOL_STATE_CONFLICT'; end if;
   update private.crm_next_actions set due_at=(p->>'due_at')::timestamptz,timezone=p->>'timezone',note=p->>'note',reason=p->>'reason',
     revision=revision+1,last_command_id=p_command,updated_at=v_now where action_id=a.action_id;
   update public.lead_crm set next_contact_at=(p->>'due_at')::timestamptz,next_contact_note=p->>'note',next_contact_source='manual',updated_by=v_actor where lead_id=p_lead;
   perform private.crm_contact_emit(p_command,p_lead,'NextActionRescheduled',jsonb_build_object('action_id',a.action_id,'revision',a.revision+1,'previous_due_at',a.due_at,'due_at',p->'due_at','reason',p->>'reason'));
  else
   if cr.status in ('en_proceso','cierre') and not (p ? 'replacement_next_action') and not l.do_not_contact then
     raise exception using errcode='P0107',message='NEXT_ACTION_REQUIRED'; end if;
   update private.crm_next_actions set status='cancelled',revision=revision+1,last_command_id=p_command,updated_at=v_now where action_id=a.action_id;
   update private.crm_contact_runtime set principal_action_id=null,updated_at=v_now where lead_id=p_lead;
   perform private.crm_contact_emit(p_command,p_lead,'NextActionCancelled',jsonb_build_object('action_id',a.action_id,'reason',p->>'reason'));
   if p ? 'replacement_next_action' then v_action:=private.crm_contact_schedule_action(p_command,p_lead,p->'replacement_next_action');
   else update public.lead_crm set next_contact_at=null,next_contact_note='',next_contact_source=null,updated_by=v_actor where lead_id=p_lead;end if;
  end if;
  v_action_changed:=true;
 elsif v_type='EvaluateContactDeadlines' then
  if rt.current_sequence_id is not null and exists(select 1 from public.lead_contact_sequences where id=rt.current_sequence_id and status='active') then
   for t in select * from public.lead_contact_tasks x where sequence_id=rt.current_sequence_id and status in ('pending','scheduled') and due_end<=v_now
      and not exists(select 1 from private.crm_contact_task_credits slot_credit where slot_credit.task_id=x.id and slot_credit.state='credited') order by sequence_order,id loop
    update public.lead_contact_tasks set status='skipped',outcome='skipped',note='No execution recorded at domain cutoff',completed_at=v_now,completed_by=null,performed_at=null,recorded_at=v_now where id=t.id;
    update private.crm_contact_task_credits set omission_observed_at=coalesce(omission_observed_at,v_now),updated_at=v_now where task_id=t.id;
    perform private.crm_contact_emit(p_command,p_lead,'ContactTaskDeadlineObserved',jsonb_build_object('task_id',t.id,'sequence_id',t.sequence_id,'cutoff',v_now,'observation','no_execution_recorded','commercial_work',false));
    v_protocol_changed:=true;
   end loop;
  end if;
  for a in select * from private.crm_next_actions where lead_id=p_lead and status='open' and due_at<=v_now
     and overdue_observed_revision is distinct from revision loop
   update private.crm_next_actions set overdue_observed_revision=revision,last_command_id=p_command,updated_at=v_now where action_id=a.action_id;
   perform private.crm_contact_emit(p_command,p_lead,'NextActionOverdue',jsonb_build_object('action_id',a.action_id,'action_revision',a.revision,'due_at',a.due_at,'cutoff',v_now,'commercial_work',false));
   v_action_changed:=true;
  end loop;
  if v_protocol_changed or v_action_changed then update private.crm_contact_runtime set last_evaluated_at=v_now,updated_at=v_now where lead_id=p_lead;end if;
 else raise exception using errcode='P0107',message='UNSUPPORTED_COMMAND';end if;

 -- Only advance existing obligations. No create/restart function is called.
 if rt.current_sequence_id is not null and exists(select 1 from public.lead_contact_sequences where id=rt.current_sequence_id and status='active') then
  if not exists(select 1 from public.lead_contact_tasks where sequence_id=rt.current_sequence_id and status='pending') then
   select id into v_task from public.lead_contact_tasks x where sequence_id=rt.current_sequence_id and status='scheduled'
    and not exists(select 1 from private.crm_contact_task_credits slot_credit where slot_credit.task_id=x.id and slot_credit.state='credited') order by sequence_order,id limit 1;
   if v_task is not null then
    update public.lead_contact_tasks set status='pending' where id=v_task;v_protocol_changed:=true;
    perform private.crm_contact_emit(p_command,p_lead,'ContactTaskActivated',jsonb_build_object('task_id',v_task,'sequence_id',rt.current_sequence_id));
   end if;
  end if;
  if private.crm_contact_close_protocol(p_command,p_lead,'exhausted') then v_protocol_changed:=true;end if;
 end if;
 v_projection:=private.crm_contact_refresh_projection(p_command,p_lead);
 select to_jsonb(r) into v_after from private.crm_contact_runtime r where lead_id=p_lead;
 if v_after->'protocol_summary' is distinct from v_before->'protocol_summary' then
  v_protocol_changed:=true;
  if v_type='RecordContactOutcome' and p->>'variant'='review' then
   perform private.crm_contact_emit(p_command,p_lead,'ProtocolEvidenceRevised',jsonb_build_object('summary',v_after->'protocol_summary'));
  end if;
 end if;
 -- Schedule may have superseded a protocol while returning only its action ID.
 if exists(select 1 from private.crm_events where command_id=p_command and event_type in ('ProtocolClosed','ProtocolSuperseded')) then v_protocol_changed:=true;end if;
 select count(*) into v_event_count from private.crm_events where command_id=p_command;
 if v_event_count=0 then raise exception using errcode='P0107',message='NO_STATE_CHANGE';end if;
 if (v_contact_changed and rt.contact_revision>=9007199254740991)
    or (v_action_changed and rt.next_action_revision>=9007199254740991)
    or (v_protocol_changed and rt.protocol_revision>=9007199254740991) then raise exception using errcode='P0107',message='VERSION_EXHAUSTED';end if;
 update private.crm_contact_runtime set contact_revision=contact_revision+v_contact_changed::integer,
  next_action_revision=next_action_revision+v_action_changed::integer,protocol_revision=protocol_revision+v_protocol_changed::integer,
  updated_at=clock_timestamp() where lead_id=p_lead;
 -- Canonical projection delta for deterministic local replay. Facts are emitted
 -- once; mutable rows touched by this command are upserts. The legacy protocol
 -- snapshot is bounded by the adopted sequence, not every historical cycle.
 perform private.crm_contact_emit(p_command,p_lead,'ContactWorkStateProjected',jsonb_build_object('projection_version',1,
  'projection_after',jsonb_build_object(
   'runtime',(select to_jsonb(x) from private.crm_contact_runtime x where lead_id=p_lead),
   'facts',(select coalesce(jsonb_agg(to_jsonb(x) order by fact_id),'[]'::jsonb) from private.crm_contact_facts x where command_id=p_command),
   'actions',(select coalesce(jsonb_agg(to_jsonb(x) order by action_id),'[]'::jsonb) from private.crm_next_actions x where lead_id=p_lead and (last_command_id=p_command or source_kind='adoption_snapshot')),
   'credits',(select coalesce(jsonb_agg(to_jsonb(x) order by task_id),'[]'::jsonb) from private.crm_contact_task_credits x where command_id=p_command),
   'sequence',(select to_jsonb(x) from public.lead_contact_sequences x where id=rt.current_sequence_id),
   'protocol_tasks',(select coalesce(jsonb_agg(to_jsonb(x) order by sequence_order,id),'[]'::jsonb) from public.lead_contact_tasks x where sequence_id=rt.current_sequence_id),
   'crm_projection',(select jsonb_build_object('last_contact_at',last_contact_at,'last_contact_outcome',last_contact_outcome,
      'next_contact_at',next_contact_at,'next_contact_note',next_contact_note,'next_contact_source',next_contact_source) from public.lead_crm where lead_id=p_lead))));
 return jsonb_build_object('fact_id',coalesce(v_fact,prior.fact_id),'action_id',coalesce(v_action,v_action_ref),
   'contact_changed',v_contact_changed,'action_changed',v_action_changed,'protocol_changed',v_protocol_changed,
   'credit_state',v_credit,'summary',v_after->'protocol_summary');
end; $$;

create function private.crm_execute_contact_command(p_envelope jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 e jsonb; actor jsonb; scope jsonb; v_intent jsonb; v_hash text; v_uid uuid; v_lead uuid; v_command uuid;
 v_scope_key text; v_project text; v_subject text; v_type text; v_role text; v_owner uuid;
 pol private.crm_runtime_policies%rowtype; r private.crm_command_receipts%rowtype;
 rt private.crm_lead_runtime%rowtype; ct private.crm_contact_runtime%rowtype;
 ad private.crm_contact_next_action_adoptions%rowtype; g private.crm_runtime_gates%rowtype;
 v_new boolean; v_error text; v_scope_error text; v_gate_vector jsonb:='[]'::jsonb;
 v_restrict_only boolean; v_cause uuid; v_effect jsonb; v_result jsonb; v_events jsonb;
begin
 begin e:=private.crm_normalize_contact_command(p_envelope);
 exception when sqlstate '22023' or invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('status','rejected','error_code',case when sqlstate='22023' then sqlerrm else 'INVALID_ENVELOPE' end);
 end;
 actor:=private.crm_foundation_actor(false);
 if actor ? 'error_code' then return jsonb_build_object('status','rejected','error_code',actor->>'error_code');end if;
 v_uid:=(actor->>'user_id')::uuid;v_subject:=actor->>'actor_subject';
 v_command:=(e->>'command_id')::uuid;v_type:=e->>'command_type';v_lead:=(e#>>'{scope,lead_id}')::uuid;v_scope_key:='lead:'||v_lead::text;
 select * into pol from private.crm_runtime_policies where policy_version=e->>'policy_version_seen';
 if not found then return jsonb_build_object('status','rejected','command_id',v_command,'error_code','POLICY_VERSION_CONFLICT');end if;
 select p.snapshot->>'project_ref' into v_project from private.crm_lead_runtime x join private.crm_runtime_policies p on p.policy_version=x.policy_version where x.lead_id=v_lead;
 if not found then v_project:=pol.snapshot->>'project_ref';end if;
 if v_project is null or v_project is distinct from pol.snapshot->>'project_ref' then return jsonb_build_object('status','rejected','command_id',v_command,'error_code','POLICY_VERSION_CONFLICT');end if;
 v_intent:=jsonb_build_object('schema_version',1,'command_type',v_type,'scope',e->'scope','actor_subject',v_subject,
   'expected_versions',e->'expected_versions','payload',e->'payload','causation',e->'causation','policy_version_seen',e->>'policy_version_seen');
 v_hash:=encode(sha256(convert_to(private.crm_canonical_json(v_intent),'UTF8')),'hex');
 insert into private.crm_command_receipts(command_id,schema_version,command_type,project_ref,scope_key,idempotency_key,
  actor_kind,actor_subject,actor_user_id,executor_principal,expected_versions,request_hash,request_payload,correlation_id,policy_version,status)
 values(v_command,1,v_type,v_project,v_scope_key,e->>'idempotency_key','user',v_subject,v_uid,session_user,e->'expected_versions',v_hash,e,
   (e->>'correlation_id')::uuid,pol.policy_version,'evaluating') on conflict do nothing returning * into r;
 v_new:=found;
 if not v_new then
  select * into r from private.crm_command_receipts where command_id=v_command for update;
  if not found then select * into r from private.crm_command_receipts where project_ref=v_project and actor_subject=v_subject
    and command_type=v_type and scope_key=v_scope_key and idempotency_key=e->>'idempotency_key' for update;end if;
  if not found then raise exception using errcode='40001',message='CRM_RECEIPT_RETRY';end if;
  if r.actor_subject<>v_subject or r.project_ref<>v_project or r.command_type<>v_type or r.scope_key<>v_scope_key
    or r.idempotency_key<>e->>'idempotency_key' or r.request_hash<>v_hash then
   return jsonb_build_object('status','rejected','command_id',v_command,'error_code','IDEMPOTENCY_KEY_REUSED');end if;
 end if;
 lock table private.crm_runtime_gates in share mode;
 actor:=private.crm_foundation_actor(true);
 if actor ? 'error_code' then
  if v_new then delete from private.crm_command_receipts where command_id=v_command;end if;
  return jsonb_build_object('status','rejected','error_code',actor->>'error_code');
 end if;
 v_role:=actor->>'role';
 select * into rt from private.crm_lead_runtime where lead_id=v_lead for update;
 if not found then v_error:='RUNTIME_STATE_REQUIRED';end if;
 scope:=private.crm_assignment_lock_lead(v_lead);
 if scope ? 'error_code' then v_scope_error:=scope->>'error_code';
 else
  v_owner:=(scope->>'owner_user_id')::uuid;
  if not (v_role in ('admin','supervisor') or (v_role='seller' and v_owner is not distinct from v_uid)) then v_scope_error:='FORBIDDEN_SCOPE';end if;
 end if;
 if v_type='RecordContactOutcome' and e#>>'{payload,variant}'='review' and v_role not in ('admin','supervisor') then v_scope_error:='FORBIDDEN_COMMAND';end if;
 if not v_new then
  if v_scope_error is not null then return jsonb_build_object('status','rejected','command_id',v_command,'error_code',v_scope_error);end if;
  if v_error is not null then return jsonb_build_object('status','rejected','command_id',v_command,'error_code',v_error);end if;
  if r.status='evaluating' then raise exception using errcode='40001',message='CRM_RECEIPT_RETRY';end if;
  return r.result||jsonb_build_object('status','replayed','original_status',r.status,'command_id',r.command_id);
 end if;
 if v_scope_error is not null then v_error:=v_scope_error;end if;
 if v_error is null then
  select * into ad from private.crm_contact_next_action_adoptions where lead_id=v_lead;
  if not found or not exists(select 1 from private.crm_assignment_adoptions where lead_id=v_lead) then v_error:='CONTACT_DOMAIN_NOT_ADOPTED';end if;
 end if;
 if v_error is null then
  select * into ct from private.crm_contact_runtime where lead_id=v_lead for update;
  if not found then v_error:='RUNTIME_STATE_REQUIRED';end if;
 end if;
 v_restrict_only:=v_type='RecordContactOutcome' and e#>>'{payload,variant}'='record'
   and e#>>'{payload,fact_kind}'='inbound_response' and e#>>'{payload,outcome}'='requested_no_contact'
   and not ((e->'payload') ?| array['task_ref','action_ref','replacement_next_action']);
 if v_error is null then
  select * into g from private.crm_runtime_gates where domain='command_contact_next_action' and scope_key=v_scope_key for share;
  if not found then v_error:='WRITER_FENCED';
  else
   v_gate_vector:=jsonb_build_array(jsonb_build_object('domain',g.domain,'scope_key',g.scope_key,'writer_epoch',g.writer_epoch,
      'revision',g.revision,'contract_version',g.contract_version,'policy_version',g.policy_version));
   if (g.mode<>'authoritative' and not (g.mode='paused' and v_restrict_only)) or g.contract_version<>'contact_next_action.v1'
      or g.writer_epoch<ad.writer_epoch or g.revision<ad.gate_revision or v_gate_vector is distinct from e#>'{expected_versions,gates}' then v_error:='WRITER_FENCED';
   elsif g.policy_version<>pol.policy_version or rt.policy_version<>pol.policy_version then v_error:='POLICY_VERSION_CONFLICT';
   elsif rt.aggregate_version<>(e#>>'{expected_versions,lead_aggregate_version}')::bigint
      or rt.assignment_epoch<>(e#>>'{expected_versions,assignment_epoch}')::bigint
      or ct.contact_revision<>(e#>>'{expected_versions,contact_revision}')::bigint
      or ct.next_action_revision<>(e#>>'{expected_versions,next_action_revision}')::bigint
      or ct.protocol_revision<>(e#>>'{expected_versions,protocol_revision}')::bigint then v_error:='VERSION_CONFLICT';
   elsif rt.aggregate_version>=9007199254740991 then v_error:='VERSION_EXHAUSTED';end if;
  end if;
 end if;
 if v_error is null and e->'causation'<>'null'::jsonb then
  v_cause:=(e#>>'{causation,event_id}')::uuid;
  if not exists(select 1 from private.crm_events where event_id=v_cause and lead_id=v_lead and project_ref=v_project) then v_error:='INVALID_CAUSATION';v_cause:=null;end if;
 end if;
 if v_error is null then
  begin
   update private.crm_command_receipts set contact_effect_authorized=true,gate_dependencies=v_gate_vector,causation_event_id=v_cause where command_id=r.command_id;
   v_effect:=private.crm_apply_contact_command(r.command_id,v_lead);
   if v_effect ? 'error_code' then raise exception using errcode='P0107',message=v_effect->>'error_code';end if;
  exception when sqlstate 'P0107' then v_error:=sqlerrm;
  end;
 end if;
 if v_error is null then
  update private.crm_lead_runtime set aggregate_version=aggregate_version+1,updated_at=clock_timestamp() where lead_id=v_lead;
  select * into ct from private.crm_contact_runtime where lead_id=v_lead;
  select coalesce(jsonb_agg(event_id order by event_index),'[]'::jsonb) into v_events from private.crm_events where command_id=r.command_id;
  if jsonb_array_length(v_events)=0 then raise exception using errcode='23514',message='CRM_HANDLER_CONTRACT_VIOLATION';end if;
  v_result:=jsonb_build_object('status','applied','command_id',r.command_id,'resource_ids',jsonb_build_object('lead_id',v_lead,'fact_id',v_effect->'fact_id','action_id',v_effect->'action_id'),
   'event_ids',v_events,'versions',jsonb_build_object('lead_aggregate_version',rt.aggregate_version+1,'assignment_epoch',rt.assignment_epoch,
    'contact_revision',ct.contact_revision,'next_action_revision',ct.next_action_revision,'protocol_revision',ct.protocol_revision,'gates',v_gate_vector),
   'credit_state',v_effect->'credit_state','protocol_summary',v_effect->'summary','effects','[]'::jsonb,'obligations','[]'::jsonb);
  update private.crm_command_receipts set status='applied',result=v_result,decided_at=clock_timestamp(),contact_effect_authorized=false where command_id=r.command_id;
 else
  v_result:=jsonb_build_object('status','rejected','command_id',r.command_id,'error_code',v_error);
  if v_error='VERSION_CONFLICT' and v_scope_error is null then
   v_result:=v_result||jsonb_build_object('current_versions',jsonb_build_object('lead_aggregate_version',rt.aggregate_version,
    'assignment_epoch',rt.assignment_epoch,'contact_revision',ct.contact_revision,'next_action_revision',ct.next_action_revision,'protocol_revision',ct.protocol_revision,'gates',v_gate_vector));
  end if;
  update private.crm_command_receipts set status='rejected',result=v_result,error_code=v_error,decided_at=clock_timestamp(),gate_dependencies=v_gate_vector,contact_effect_authorized=false where command_id=r.command_id;
 end if;
 return v_result;
end; $$;

create or replace function public.crm_submit_command(p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_envelope)='object' and p_envelope->>'command_type' in
   ('RecordContactOutcome','RecordContactTaskOmission','ScheduleNextAction','RescheduleNextAction','CancelNextAction','EvaluateContactDeadlines') then
  return private.crm_execute_contact_command(p_envelope);
 elsif jsonb_typeof(p_envelope)='object' and p_envelope->>'command_type' in ('AssignLead','TransferLead','AcknowledgeLeadAssignment') then
  return private.crm_execute_assignment_command(p_envelope);
 end if;
 return private.crm_execute_command(p_envelope);
end; $$;

alter function private.crm_contact_emit(uuid,uuid,text,jsonb) owner to postgres;
alter function private.crm_contact_close_protocol(uuid,uuid,text) owner to postgres;
alter function private.crm_contact_schedule_action(uuid,uuid,jsonb) owner to postgres;
alter function private.crm_contact_review_revision(uuid) owner to crm_runtime_owner;
alter function private.crm_contact_credit_fact(uuid,uuid,uuid,boolean) owner to postgres;
alter function private.crm_apply_contact_command(uuid,uuid) owner to postgres;
alter function private.crm_execute_contact_command(jsonb) owner to crm_runtime_owner;
grant execute on function private.crm_contact_review_revision(uuid) to postgres;
alter function public.crm_submit_command(jsonb) owner to crm_runtime_owner;
revoke all on function private.crm_contact_emit(uuid,uuid,text,jsonb),private.crm_contact_close_protocol(uuid,uuid,text),
 private.crm_contact_schedule_action(uuid,uuid,jsonb),private.crm_contact_review_revision(uuid),private.crm_contact_credit_fact(uuid,uuid,uuid,boolean),
 private.crm_apply_contact_command(uuid,uuid),private.crm_execute_contact_command(jsonb),public.crm_submit_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.crm_contact_emit(uuid,uuid,text,jsonb),private.crm_contact_close_protocol(uuid,uuid,text),
 private.crm_contact_schedule_action(uuid,uuid,jsonb),private.crm_contact_credit_fact(uuid,uuid,uuid,boolean),private.crm_apply_contact_command(uuid,uuid) to crm_runtime_owner;


-- Include at the END of PSQL-04B-03, after the complete executor and fences.
-- No grants to API roles and no adoption calls/seeds belong to this migration.
create function private.crm_contact_adoption_snapshot(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_lead public.leads%rowtype; v_crm public.lead_crm%rowtype;
  v_sequence public.lead_contact_sequences%rowtype; v_tasks jsonb; v_required jsonb;
  v_unknown jsonb; v_calls integer; v_messages integer; v_bands integer; v_active integer;
begin
  if session_user<>'postgres' then
    raise exception using errcode='42501',message='CONTACT_ADOPTION_FORBIDDEN';
  end if;
  -- ROW SHARE conflicts with table-wide TRUNCATE's ACCESS EXCLUSIVE. Row
  -- mutations are serialized by the explicit lead lock and B's NOWAIT fences.
  lock table public.lead_crm,public.lead_contact_sequences,public.lead_contact_tasks in row share mode;
  select * into v_lead from public.leads where id=p_lead_id for update;
  if not found then raise exception using errcode='55000',message='CONTACT_ADOPTION_LEAD_REQUIRED'; end if;
  select * into v_crm from public.lead_crm where lead_id=p_lead_id for update;
  if not found then raise exception using errcode='55000',message='CONTACT_ADOPTION_CRM_REQUIRED'; end if;
  perform id from public.lead_contact_sequences where lead_id=p_lead_id order by id for update;
  perform id from public.lead_contact_tasks where lead_id=p_lead_id order by id for update;
  select count(*) into v_active from public.lead_contact_sequences where lead_id=p_lead_id and status='active';
  if v_active>1 or (v_active>0 and v_crm.next_contact_at is not null) then
    raise exception using errcode='55000',message='CONTACT_ADOPTION_AMBIGUOUS_WORK';
  end if;
  select * into v_sequence from public.lead_contact_sequences where lead_id=p_lead_id
    order by (status='active') desc,started_at desc,id desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('task_id',id,'sequence_id',sequence_id,'channel',channel,
      'sequence_order',sequence_order,'due_start',due_start,'due_end',due_end,'status',status,'outcome',outcome,
      'completed_at',completed_at,'completed_by',completed_by,'performed_at',performed_at,'recorded_at',recorded_at)
      order by sequence_order,id),'[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(id) order by sequence_order,id) filter(where status<>'cancelled'),'[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(id) order by sequence_order,id) filter(where status='completed'
      or (status='skipped' and (performed_at is not null or outcome<>'skipped'))),'[]'::jsonb),
    count(*) filter(where channel='call' and status<>'cancelled'),
    count(*) filter(where channel='whatsapp' and status<>'cancelled'),
    count(distinct (due_start,due_end)) filter(where channel='call' and status<>'cancelled')
  into v_tasks,v_required,v_unknown,v_calls,v_messages,v_bands
  from public.lead_contact_tasks where lead_id=p_lead_id and sequence_id=v_sequence.id;
  -- Touch only the canonical parent. Every child fence takes SHARE NOWAIT on
  -- this tuple before adoption lookup, including INSERT under old RR. Do not
  -- touch child rows: their legacy updated_at triggers would rewrite history.
  update public.leads set updated_at=updated_at where id=p_lead_id;
  return jsonb_build_object('schema_version',1,'captured_at',clock_timestamp(),
    'owner_user_id',v_lead.assigned_seller_user_id,'current_sequence_id',v_sequence.id,
    'sequence_status',v_sequence.status,'required_task_ids',v_required,'unknown_task_ids',v_unknown,
    'plan_known',((v_calls=18 and v_messages=2 and v_bands=9) or (v_calls=6 and v_messages=2)),
    'tasks',v_tasks,'legacy_crm',jsonb_build_object('status',v_crm.status,
      'next_contact_at',v_crm.next_contact_at,'next_contact_note',v_crm.next_contact_note,
      'next_contact_source',v_crm.next_contact_source,'updated_by',v_crm.updated_by,
      'last_contact_at',v_crm.last_contact_at,'last_contact_outcome',v_crm.last_contact_outcome),
    'restriction',jsonb_build_object('do_not_contact',v_lead.do_not_contact),
    'evidence_note','Legacy completed slots are unknown evidence, not imported attempts or credits');
end;
$function$;
alter function private.crm_contact_adoption_snapshot(uuid) owner to postgres;
revoke all on function private.crm_contact_adoption_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function private.crm_contact_adoption_snapshot(uuid) to crm_runtime_owner;

create function private.crm_adopt_contact_lead(
  p_lead_id uuid,p_operation_id uuid,p_expected_gate_revision bigint,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_runtime private.crm_lead_runtime%rowtype; v_gate private.crm_runtime_gates%rowtype;
  v_policy private.crm_runtime_policies%rowtype; v_adoption private.crm_contact_next_action_adoptions%rowtype;
  v_snapshot jsonb; v_action uuid; v_status text:='adopted'; v_now timestamptz;
begin
  if session_user<>'postgres' then raise exception using errcode='42501',message='CONTACT_ADOPTION_FORBIDDEN'; end if;
  if p_lead_id is null or p_operation_id is null or p_expected_gate_revision is null
    or p_expected_gate_revision not between 0 and 9007199254740991
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception using errcode='22023',message='CONTACT_ADOPTION_INVALID_ARGUMENT';
  end if;
  if to_regprocedure('private.crm_execute_contact_command(jsonb)') is null
    or to_regprocedure('private.crm_apply_contact_command(uuid,uuid)') is null
    or to_regprocedure('public.crm_read_contact_work_context(uuid)') is null
    or (select count(*) from pg_catalog.pg_trigger where tgrelid in ('public.lead_crm'::regclass,
      'public.lead_contact_sequences'::regclass,'public.lead_contact_tasks'::regclass)
      and tgname='a00_crm_contact_fence' and not tgisinternal and tgenabled='O')<>3 then
    raise exception using errcode='55000',message='CONTACT_ADOPTION_INSTALLATION_INCOMPLETE';
  end if;
  lock table private.crm_runtime_gates in share mode;
  select * into v_runtime from private.crm_lead_runtime where lead_id=p_lead_id for update;
  if not found or not private.crm_assignment_is_adopted(p_lead_id) then
    raise exception using errcode='55000',message='CONTACT_ADOPTION_ASSIGNMENT_REQUIRED';
  end if;
  select * into v_adoption from private.crm_contact_next_action_adoptions
    where lead_id=p_lead_id or operation_id=p_operation_id;
  if found then
    if v_adoption.lead_id<>p_lead_id or v_adoption.operation_id<>p_operation_id
      or v_adoption.gate_revision<>p_expected_gate_revision or v_adoption.reason<>btrim(p_reason) then
      raise exception using errcode='23505',message='CONTACT_ADOPTION_CONFLICT';
    end if;
    v_status:='replayed';
  else
    select * into v_gate from private.crm_runtime_gates where domain='command_contact_next_action'
      and scope_key='lead:'||p_lead_id::text for share;
    if not found or v_gate.mode<>'authoritative' or v_gate.writer_epoch<=0
      or v_gate.contract_version<>'contact_next_action.v1' then
      raise exception using errcode='55000',message='CONTACT_ADOPTION_GATE_REQUIRED';
    end if;
    if v_gate.revision<>p_expected_gate_revision then
      raise exception using errcode='40001',message='CONTACT_ADOPTION_GATE_CONFLICT';
    end if;
    select * into v_policy from private.crm_runtime_policies where policy_version=v_gate.policy_version;
    if not found or v_runtime.policy_version<>v_gate.policy_version then
      raise exception using errcode='55000',message='CONTACT_ADOPTION_POLICY_CONFLICT';
    end if;
    v_snapshot:=private.crm_contact_adoption_snapshot(p_lead_id);
    v_now:=clock_timestamp();
    insert into private.crm_contact_next_action_adoptions(lead_id,operation_id,adopted_at,executor_principal,
      gate_scope_key,writer_epoch,gate_revision,contract_version,policy_version,baseline_manifest_id,reason,baseline_snapshot)
    values(p_lead_id,p_operation_id,v_now,session_user,v_gate.scope_key,v_gate.writer_epoch,v_gate.revision,
      v_gate.contract_version,v_gate.policy_version,v_gate.baseline_manifest_id,btrim(p_reason),v_snapshot)
    returning * into v_adoption;
    insert into private.crm_contact_runtime(lead_id,current_sequence_id,baseline_snapshot,protocol_summary,
      next_action_required,next_action_reason,review_reasons,created_at,updated_at)
    values(p_lead_id,(v_snapshot->>'current_sequence_id')::uuid,v_snapshot,
      jsonb_build_object('N',jsonb_array_length(v_snapshot->'required_task_ids'),'C',0,'F',0,'R',0,'O',0,
        'U',jsonb_array_length(v_snapshot->'unknown_task_ids'),'classification','not_evaluated',
        'plan_known',(v_snapshot->>'plan_known')::boolean),
      coalesce(v_snapshot#>>'{legacy_crm,status}' in ('en_proceso','cierre')
        and v_snapshot#>>'{legacy_crm,next_contact_at}' is null
        and v_snapshot->>'sequence_status' is distinct from 'active'
        and (v_snapshot#>>'{restriction,do_not_contact}')::boolean is distinct from true,false),
      case when v_snapshot#>>'{legacy_crm,status}' in ('en_proceso','cierre')
        and v_snapshot#>>'{legacy_crm,next_contact_at}' is null
        and v_snapshot->>'sequence_status' is distinct from 'active'
        and (v_snapshot#>>'{restriction,do_not_contact}')::boolean is distinct from true
        then 'adopted_missing_contact_commitment' end,
      case when v_snapshot#>>'{legacy_crm,status}' in ('en_proceso','cierre')
        and v_snapshot#>>'{legacy_crm,next_contact_at}' is null
        and v_snapshot->>'sequence_status' is distinct from 'active'
        and (v_snapshot#>>'{restriction,do_not_contact}')::boolean is distinct from true
        then array['next_action_required']::text[] else '{}'::text[] end,v_now,v_now);
    if v_snapshot#>>'{legacy_crm,next_contact_at}' is not null then
      v_action:=gen_random_uuid();
      insert into private.crm_next_actions(action_id,lead_id,due_at,timezone,channel,status,revision,
        created_by_user_id,created_at,updated_at,source_kind,adoption_operation_id,reason,note)
      values(v_action,p_lead_id,(v_snapshot#>>'{legacy_crm,next_contact_at}')::timestamptz,
        'UTC','unspecified','open',0,(v_snapshot#>>'{legacy_crm,updated_by}')::uuid,v_now,v_now,
        'adoption_snapshot',p_operation_id,'Existing manual agenda snapshot; channel unspecified',
        coalesce(v_snapshot#>>'{legacy_crm,next_contact_note}',''));
      update private.crm_contact_runtime set principal_action_id=v_action where lead_id=p_lead_id;
    end if;
  end if;
  return jsonb_build_object('status',v_status,'lead_id',v_adoption.lead_id,'operation_id',v_adoption.operation_id,
    'adopted_at',v_adoption.adopted_at,'gate_scope_key',v_adoption.gate_scope_key,
    'writer_epoch',v_adoption.writer_epoch,'gate_revision',v_adoption.gate_revision,'policy_version',v_adoption.policy_version);
end;
$function$;
alter function private.crm_adopt_contact_lead(uuid,uuid,bigint,text) owner to crm_runtime_owner;
revoke all on function private.crm_adopt_contact_lead(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function private.crm_adopt_contact_lead(uuid,uuid,bigint,text) to postgres;

create function private.crm_contact_read_legacy(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_lead public.leads%rowtype; v_crm public.lead_crm%rowtype;
begin
  if v_uid is null then return jsonb_build_object('error_code','AUTHENTICATION_REQUIRED'); end if;
  select role::text into v_role from public.profiles where user_id=v_uid and active;
  if not found then return jsonb_build_object('error_code','ACTOR_INACTIVE'); end if;
  select * into v_lead from public.leads where id=p_lead_id;
  if not found or not coalesce(v_role in ('admin','supervisor')
      or (v_role='seller' and v_lead.assigned_seller_user_id=v_uid),false) then
    return jsonb_build_object('error_code','FORBIDDEN_SCOPE');
  end if;
  select * into v_crm from public.lead_crm where lead_id=p_lead_id;
  return jsonb_build_object('lead_id',p_lead_id,'owner_user_id',v_lead.assigned_seller_user_id,
    'actor_user_id',v_uid,'actor_role',v_role,'stage',v_crm.status,
    'do_not_contact',v_lead.do_not_contact,'customer_id',v_lead.customer_id,
    'legacy_last_contact',jsonb_build_object('occurred_at',v_crm.last_contact_at,'outcome',v_crm.last_contact_outcome),
    'excluded_commitments',jsonb_build_object('interview_at',v_crm.interview_at,'deposit_at',v_crm.deposit_at,
      'post_deposit_action_at',v_crm.post_deposit_action_at),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('task_id',id,'sequence_id',sequence_id,
      'historical_seller_user_id',seller_user_id,'sequence_order',sequence_order,'channel',channel,
      'due_start',due_start,'due_end',due_end,'status',status,'outcome',outcome,'performed_at',performed_at,
      'recorded_at',recorded_at,'completed_by',completed_by,
      'not_yet_due',due_start>statement_timestamp()) order by sequence_id,sequence_order,id)
      from public.lead_contact_tasks where lead_id=p_lead_id),'[]'::jsonb));
end;
$function$;
alter function private.crm_contact_read_legacy(uuid) owner to postgres;
revoke all on function private.crm_contact_read_legacy(uuid) from public,anon,authenticated,service_role;
grant execute on function private.crm_contact_read_legacy(uuid) to crm_runtime_owner;

create function public.crm_read_contact_work_context(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_legacy jsonb; v_runtime private.crm_lead_runtime%rowtype;
  v_contact private.crm_contact_runtime%rowtype; v_action jsonb; v_gates jsonb; v_now timestamptz:=statement_timestamp();
begin
  v_legacy:=private.crm_contact_read_legacy(p_lead_id);
  if v_legacy ? 'error_code' then return v_legacy||jsonb_build_object('status','rejected'); end if;
  select * into v_runtime from private.crm_lead_runtime where lead_id=p_lead_id;
  select * into v_contact from private.crm_contact_runtime where lead_id=p_lead_id;
  if not found or not private.crm_contact_is_adopted(p_lead_id) then
    return jsonb_build_object('status','rejected','error_code','CONTACT_DOMAIN_NOT_ADOPTED');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('domain',domain,'scope_key',scope_key,
    'writer_epoch',writer_epoch,'revision',revision,'contract_version',contract_version,'policy_version',policy_version)
    order by domain,scope_key),'[]'::jsonb) into v_gates from private.crm_runtime_gates
    where domain='command_contact_next_action' and scope_key='lead:'||p_lead_id::text;
  select to_jsonb(a)||jsonb_build_object('overdue',a.status='open' and a.due_at<=v_now)
    into v_action from private.crm_next_actions a where a.action_id=v_contact.principal_action_id and a.lead_id=p_lead_id;
  return v_legacy||jsonb_build_object('status','ok','as_of_server',v_now,
    'versions',jsonb_build_object('lead_aggregate_version',v_runtime.aggregate_version,
      'assignment_epoch',v_runtime.assignment_epoch,'contact_revision',v_contact.contact_revision,
      'next_action_revision',v_contact.next_action_revision,'protocol_revision',v_contact.protocol_revision,'gates',v_gates),
    'policy_version',v_runtime.policy_version,'gate',
      (select jsonb_build_object('mode',mode,'contract_version',contract_version,'writer_epoch',writer_epoch,
        'revision',revision,'policy_version',policy_version) from private.crm_runtime_gates
        where domain='command_contact_next_action' and scope_key='lead:'||p_lead_id::text),
    'principal_action',v_action,'next_action_required',v_contact.next_action_required,
    'next_action_reason',v_contact.next_action_reason,'review_reasons',to_jsonb(v_contact.review_reasons),
    'protocol_summary',v_contact.protocol_summary,'current_sequence_id',v_contact.current_sequence_id,
    'last_evaluated_at',v_contact.last_evaluated_at,'baseline_snapshot',v_contact.baseline_snapshot,
    'facts',coalesce((select jsonb_agg(to_jsonb(f) order by f.recorded_at,f.fact_id)
      from private.crm_contact_facts f where f.lead_id=p_lead_id),'[]'::jsonb),
    'credits',coalesce((select jsonb_agg(to_jsonb(c) order by c.task_id)
      from private.crm_contact_task_credits c where c.lead_id=p_lead_id),'[]'::jsonb),
    'action_history',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.action_id)
      from private.crm_next_actions a where a.lead_id=p_lead_id),'[]'::jsonb),
    'last_contact_fact_id',v_contact.last_contact_fact_id,'last_attempt_fact_id',v_contact.last_attempt_fact_id,
    'last_response_fact_id',v_contact.last_response_fact_id,'effects','[]'::jsonb,'obligations','[]'::jsonb);
end;
$function$;
alter function public.crm_read_contact_work_context(uuid) owner to crm_runtime_owner;
revoke all on function public.crm_read_contact_work_context(uuid) from public,anon,authenticated,service_role;
comment on function public.crm_read_contact_work_context(uuid) is
  'M1-04B ReadContactWorkContext. Stable/read-only; derives active current scope; never evaluates deadlines or executes commands. Closed installation.';

revoke create on schema private,public from crm_runtime_owner;
grant crm_runtime_owner to postgres with inherit false, set false;
commit;
