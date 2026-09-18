-- M1-04B / PSQL-04B-01. Private structures only; no adoption, seed, API grant
-- or command handler is installed here. Existing Assignment semantics remain.
begin;
set local search_path = public, extensions;
do $preflight$
begin
  if current_setting('server_version_num')::integer < 170000
     or to_regclass('private.crm_assignment_adoptions') is null
     or to_regprocedure('private.crm_assignment_authorization(uuid)') is null
     or to_regclass('public.lead_contact_tasks') is null
     or to_regclass('public.lead_contact_sequences') is null
     or to_regclass('public.lead_crm') is null then
    raise exception 'CONTACT_FOUNDATION_BASELINE_REQUIRED';
  end if;
end;
$preflight$;
grant crm_runtime_owner to postgres with inherit true, set true;
grant usage, create on schema private to crm_runtime_owner;

alter table private.crm_runtime_gates drop constraint crm_runtime_gates_domain_check;
alter table private.crm_runtime_gates add constraint crm_runtime_gates_domain_check check (domain in (
  'inbox','command_owner','command_crm','command_contact_next_action','command_sales_legacy',
  'handoff','dialogue_policy','outbox','v1_adapter','sender.customer_ai_dialogue',
  'sender.customer_ai_recovery','sender.worker_internal_notification'
));
alter table private.crm_runtime_gates drop constraint crm_runtime_gates_foundation_closed;
alter table private.crm_runtime_gates add constraint crm_runtime_gates_foundation_closed check (
  mode in ('observe','ready','paused') or (
    mode='authoritative' and writer_epoch>0
    and scope_key ~ '^lead:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and ((domain='command_owner' and contract_version='assignment.v1')
      or (domain='command_contact_next_action' and contract_version='contact_next_action.v1'))
  )
);
alter table private.crm_runtime_gates add constraint crm_contact_gate_contract check (
  domain<>'command_contact_next_action' or (
    scope_key ~ '^lead:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and contract_version='contact_next_action.v1'
    and writer_epoch between 0 and 9007199254740991
    and revision between 0 and 9007199254740991
  )
);
alter table private.crm_command_receipts drop constraint crm_command_receipts_command_type_check;
alter table private.crm_command_receipts add constraint crm_command_receipts_command_type_check check (
  command_type in ('FoundationProbe','AssignLead','TransferLead','AcknowledgeLeadAssignment',
    'RecordContactOutcome','RecordContactTaskOmission','ScheduleNextAction','RescheduleNextAction',
    'CancelNextAction','EvaluateContactDeadlines')
);
alter table private.crm_command_receipts add column contact_effect_authorized boolean not null default false;
alter table private.crm_command_receipts add constraint crm_receipt_contact_effect_check check (
  not contact_effect_authorized or (
    not assignment_effect_authorized and status='evaluating'
    and command_type in ('RecordContactOutcome','RecordContactTaskOmission','ScheduleNextAction',
      'RescheduleNextAction','CancelNextAction','EvaluateContactDeadlines')
    and execution_xid is not null and execution_backend_pid is not null and execution_backend_pid>0
  )
);
create unique index crm_contact_one_effect_context_idx
  on private.crm_command_receipts(scope_key,execution_xid,execution_backend_pid)
  where contact_effect_authorized;
alter table private.crm_events drop constraint crm_events_event_type_check;
alter table private.crm_events add constraint crm_events_event_type_check check (event_type in (
  'FoundationProbeApplied','LeadAssigned','LeadTransferred','LeadAssignmentAcknowledged',
  'ContactOutcomeRecorded','ContactTaskCredited','ContactEvidenceReviewRequired','ContactEvidenceReviewed',
  'ContactFactAmended','ContactCreditRevoked','ContactTaskOmitted','ContactTaskDeadlineObserved','ContactTaskActivated',
  'NextActionCompleted','NextActionScheduled','NextActionRescheduled','NextActionCancelled',
  'NextActionSuperseded','NextActionOverdue','NextActionRequired','ProtocolClosed','ProtocolSuperseded',
  'ProtocolEvidenceRevised','ContactRestrictionRecorded','ContactWorkStateProjected'
));
alter table private.crm_events drop constraint crm_events_aggregate_kind_check;
alter table private.crm_events add constraint crm_events_aggregate_kind_check
  check (aggregate_kind in ('foundation_probe','lead_assignment','lead_contact'));

create table private.crm_contact_next_action_adoptions (
  lead_id uuid primary key references private.crm_assignment_adoptions(lead_id) on delete restrict,
  operation_id uuid not null unique,
  adopted_at timestamptz not null,
  executor_principal text not null check (executor_principal='postgres'),
  gate_scope_key text not null,
  writer_epoch bigint not null check (writer_epoch between 1 and 9007199254740991),
  gate_revision bigint not null check (gate_revision between 0 and 9007199254740991),
  contract_version text not null check (contract_version='contact_next_action.v1'),
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  baseline_manifest_id text not null check (char_length(baseline_manifest_id) between 1 and 200 and baseline_manifest_id=btrim(baseline_manifest_id)),
  reason text not null check (char_length(reason) between 1 and 1000 and reason=btrim(reason)),
  baseline_snapshot jsonb not null check (jsonb_typeof(baseline_snapshot)='object'),
  check (gate_scope_key='lead:'||lead_id::text),
  foreign key (lead_id) references private.crm_lead_runtime(lead_id) on delete restrict
);
create table private.crm_contact_runtime (
  lead_id uuid primary key references private.crm_contact_next_action_adoptions(lead_id) on delete restrict,
  contact_revision bigint not null default 0 check (contact_revision between 0 and 9007199254740991),
  next_action_revision bigint not null default 0 check (next_action_revision between 0 and 9007199254740991),
  protocol_revision bigint not null default 0 check (protocol_revision between 0 and 9007199254740991),
  principal_action_id uuid,
  current_sequence_id uuid references public.lead_contact_sequences(id) on delete restrict,
  protocol_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(protocol_summary)='object'),
  next_action_required boolean not null default false,
  next_action_reason text,
  review_reasons text[] not null default '{}',
  last_contact_fact_id uuid,
  last_attempt_fact_id uuid,
  last_response_fact_id uuid,
  last_evaluated_at timestamptz,
  baseline_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(baseline_snapshot)='object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (not next_action_required or nullif(btrim(next_action_reason),'') is not null),
  check (updated_at>=created_at)
);
create table private.crm_contact_facts (
  fact_id uuid primary key,
  lead_id uuid not null references private.crm_contact_next_action_adoptions(lead_id) on delete restrict,
  command_id uuid not null references private.crm_command_receipts(command_id) on delete restrict,
  record_kind text not null default 'observation' check (record_kind in ('observation','amendment')),
  root_fact_id uuid not null,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  amends_fact_id uuid unique,
  recorded_by_user_id uuid not null references public.profiles(user_id) on delete restrict,
  performer_user_id uuid references public.profiles(user_id) on delete restrict,
  owner_user_id_at_record uuid references public.profiles(user_id) on delete restrict,
  assignment_epoch bigint not null check (assignment_epoch between 0 and 9007199254740991),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  channel text not null check (channel in ('call','whatsapp_personal')),
  fact_kind text not null check (fact_kind in ('outbound_attempt','inbound_response')),
  direction text not null check (direction in ('inbound','outbound')),
  outcome text not null,
  note text not null default '' check (char_length(note)<=4000),
  source_kind text not null check (source_kind in ('manual_attested','supervisor_attested')),
  evidence_quality text not null default 'manual_attestation' check (evidence_quality='manual_attestation'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16384),
  task_id uuid references public.lead_contact_tasks(id) on delete restrict,
  sequence_id uuid references public.lead_contact_sequences(id) on delete restrict,
  action_id uuid,
  historical_only boolean not null default false,
  unique (fact_id,lead_id),
  unique (root_fact_id,revision),
  foreign key (root_fact_id,lead_id) references private.crm_contact_facts(fact_id,lead_id) on delete restrict,
  foreign key (amends_fact_id,lead_id) references private.crm_contact_facts(fact_id,lead_id) on delete restrict,
  check (occurred_at<=recorded_at),
  check (performer_user_id is not null or historical_only),
  check ((record_kind='observation' and root_fact_id=fact_id and revision=0 and amends_fact_id is null)
    or (record_kind='amendment' and root_fact_id<>fact_id and revision>0 and amends_fact_id is not null and amends_fact_id<>fact_id)),
  check ((task_id is null) or sequence_id is not null),
  check ((fact_kind='inbound_response' and direction='inbound' and outcome in ('answered','no_interest','requested_no_contact'))
    or (fact_kind='outbound_attempt' and direction='outbound' and (
      (channel='call' and outcome in ('no_answer','answered','invalid','no_interest','requested_no_contact'))
      or (channel='whatsapp_personal' and outcome in ('sent','answered','invalid','no_interest','requested_no_contact')))))
);
create index crm_contact_facts_lead_time_idx on private.crm_contact_facts(lead_id,occurred_at,recorded_at,fact_id);
create index crm_contact_facts_task_idx on private.crm_contact_facts(task_id) where task_id is not null;
create index crm_contact_facts_receipt_idx on private.crm_contact_facts(command_id);
create table private.crm_next_actions (
  action_id uuid primary key,
  lead_id uuid not null references private.crm_contact_next_action_adoptions(lead_id) on delete restrict,
  kind text not null default 'manual_contact' check (kind='manual_contact'),
  due_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 100),
  channel text not null check (channel in ('call','whatsapp_personal','unspecified')),
  status text not null default 'open' check (status in ('open','completed','cancelled','superseded')),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_by_user_id uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  command_id uuid references private.crm_command_receipts(command_id) on delete restrict,
  last_command_id uuid references private.crm_command_receipts(command_id) on delete restrict,
  source_kind text not null default 'command' check (source_kind in ('command','adoption_snapshot')),
  adoption_operation_id uuid references private.crm_contact_next_action_adoptions(operation_id) on delete restrict,
  completed_by_fact_id uuid,
  overdue_observed_revision bigint check (overdue_observed_revision between 0 and 9007199254740991),
  reason text not null default '' check (char_length(reason)<=1000),
  note text not null default '' check (char_length(note)<=4000),
  unique (action_id,lead_id),
  foreign key (completed_by_fact_id,lead_id) references private.crm_contact_facts(fact_id,lead_id) on delete restrict,
  check ((source_kind='command' and command_id is not null and created_by_user_id is not null and channel<>'unspecified' and adoption_operation_id is null)
    or (source_kind='adoption_snapshot' and command_id is null and adoption_operation_id is not null)),
  check ((status='completed')=(completed_by_fact_id is not null)),
  check (overdue_observed_revision is null or overdue_observed_revision<=revision),
  check (updated_at>=created_at)
);
create unique index crm_next_actions_one_open_idx on private.crm_next_actions(lead_id) where status='open';
create index crm_next_actions_due_idx on private.crm_next_actions(due_at,lead_id) where status='open';
alter table private.crm_contact_facts add constraint crm_contact_facts_action_fk
  foreign key (action_id,lead_id) references private.crm_next_actions(action_id,lead_id) on delete restrict;
alter table private.crm_contact_runtime add constraint crm_contact_runtime_action_fk
  foreign key (principal_action_id,lead_id) references private.crm_next_actions(action_id,lead_id) on delete restrict;
alter table private.crm_contact_runtime add constraint crm_contact_runtime_last_contact_fk
  foreign key (last_contact_fact_id,lead_id) references private.crm_contact_facts(fact_id,lead_id) on delete restrict;
alter table private.crm_contact_runtime add constraint crm_contact_runtime_last_attempt_fk
  foreign key (last_attempt_fact_id,lead_id) references private.crm_contact_facts(fact_id,lead_id) on delete restrict;
alter table private.crm_contact_runtime add constraint crm_contact_runtime_last_response_fk
  foreign key (last_response_fact_id,lead_id) references private.crm_contact_facts(fact_id,lead_id) on delete restrict;
create table private.crm_contact_task_credits (
  task_id uuid primary key references public.lead_contact_tasks(id) on delete restrict,
  lead_id uuid not null references private.crm_contact_next_action_adoptions(lead_id) on delete restrict,
  fact_id uuid not null,
  sequence_id uuid not null references public.lead_contact_sequences(id) on delete restrict,
  state text not null check (state in ('review_required','credited','denied','revoked')),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  decision_by_user_id uuid references public.profiles(user_id) on delete restrict,
  command_id uuid not null references private.crm_command_receipts(command_id) on delete restrict,
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  original_due_start timestamptz not null,
  original_due_end timestamptz not null,
  omission_observed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (fact_id,lead_id) references private.crm_contact_facts(fact_id,lead_id) on delete restrict,
  check (original_due_end>original_due_start),
  check (updated_at>=created_at)
);
create unique index crm_contact_credits_one_active_fact_idx on private.crm_contact_task_credits(fact_id) where state='credited';
create index crm_contact_credits_lead_idx on private.crm_contact_task_credits(lead_id,state);

alter table private.crm_contact_next_action_adoptions owner to crm_runtime_owner;
alter table private.crm_contact_runtime owner to crm_runtime_owner;
alter table private.crm_contact_facts owner to crm_runtime_owner;
alter table private.crm_next_actions owner to crm_runtime_owner;
alter table private.crm_contact_task_credits owner to crm_runtime_owner;
alter table private.crm_contact_next_action_adoptions enable row level security;
alter table private.crm_contact_next_action_adoptions force row level security;
alter table private.crm_contact_runtime enable row level security;
alter table private.crm_contact_runtime force row level security;
alter table private.crm_contact_facts enable row level security;
alter table private.crm_contact_facts force row level security;
alter table private.crm_next_actions enable row level security;
alter table private.crm_next_actions force row level security;
alter table private.crm_contact_task_credits enable row level security;
alter table private.crm_contact_task_credits force row level security;
create policy crm_contact_adoptions_owner_only on private.crm_contact_next_action_adoptions to crm_runtime_owner using(true) with check(true);
create policy crm_contact_runtime_owner_only on private.crm_contact_runtime to crm_runtime_owner using(true) with check(true);
create policy crm_contact_facts_owner_only on private.crm_contact_facts to crm_runtime_owner using(true) with check(true);
create policy crm_next_actions_owner_only on private.crm_next_actions to crm_runtime_owner using(true) with check(true);
create policy crm_contact_task_credits_owner_only on private.crm_contact_task_credits to crm_runtime_owner using(true) with check(true);
revoke all on private.crm_contact_next_action_adoptions,private.crm_contact_runtime,private.crm_contact_facts,
  private.crm_next_actions,private.crm_contact_task_credits from public,anon,authenticated,service_role;

create function private.crm_contact_is_adopted(p_lead_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from private.crm_contact_next_action_adoptions where lead_id=p_lead_id);
$function$;
create function private.crm_contact_authorization(p_lead_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $function$
  select jsonb_build_object('command_id',r.command_id,'command_type',r.command_type,
    'actor_user_id',r.actor_user_id,'created_at',r.created_at,'payload',r.request_payload->'payload',
    'expected_versions',r.expected_versions,'policy_version',r.policy_version)
  from private.crm_command_receipts r
  where r.scope_key='lead:'||p_lead_id::text and r.status='evaluating' and r.contact_effect_authorized
    and not r.assignment_effect_authorized
    and r.execution_xid=pg_current_xact_id() and r.execution_backend_pid=pg_backend_pid()
    and r.command_type in ('RecordContactOutcome','RecordContactTaskOmission','ScheduleNextAction',
      'RescheduleNextAction','CancelNextAction','EvaluateContactDeadlines');
$function$;
alter function private.crm_contact_is_adopted(uuid) owner to crm_runtime_owner;
alter function private.crm_contact_authorization(uuid) owner to crm_runtime_owner;
revoke all on function private.crm_contact_is_adopted(uuid),private.crm_contact_authorization(uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.crm_contact_is_adopted(uuid),private.crm_contact_authorization(uuid) to postgres;

create function private.crm_contact_reject_immutable()
returns trigger language plpgsql security invoker set search_path='' as $function$
begin
  raise exception using errcode='55000',message='CONTACT_HISTORY_IMMUTABLE';
end;
$function$;
alter function private.crm_contact_reject_immutable() owner to crm_runtime_owner;
revoke all on function private.crm_contact_reject_immutable() from public,anon,authenticated,service_role;
create trigger crm_contact_adoptions_immutable before update or delete on private.crm_contact_next_action_adoptions
  for each row execute function private.crm_contact_reject_immutable();
create trigger crm_contact_adoptions_no_truncate before truncate on private.crm_contact_next_action_adoptions
  for each statement execute function private.crm_contact_reject_immutable();
create trigger crm_contact_facts_immutable before update or delete on private.crm_contact_facts
  for each row execute function private.crm_contact_reject_immutable();
create trigger crm_contact_facts_no_truncate before truncate on private.crm_contact_facts
  for each statement execute function private.crm_contact_reject_immutable();
create trigger crm_contact_runtime_no_delete before delete on private.crm_contact_runtime
  for each row execute function private.crm_contact_reject_immutable();
create trigger crm_contact_runtime_no_truncate before truncate on private.crm_contact_runtime
  for each statement execute function private.crm_contact_reject_immutable();
create trigger crm_next_actions_no_delete before delete on private.crm_next_actions
  for each row execute function private.crm_contact_reject_immutable();
create trigger crm_next_actions_no_truncate before truncate on private.crm_next_actions
  for each statement execute function private.crm_contact_reject_immutable();
create trigger crm_contact_credits_no_delete before delete on private.crm_contact_task_credits
  for each row execute function private.crm_contact_reject_immutable();
create trigger crm_contact_credits_no_truncate before truncate on private.crm_contact_task_credits
  for each statement execute function private.crm_contact_reject_immutable();

-- Cross-table legacy references need no new legacy unique keys. This fixed
-- definer validates parentage only; it grants no DML on those legacy tables.
create function private.crm_contact_validate_references()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_parent record; v_receipt private.crm_command_receipts%rowtype;
begin
  if tg_table_name='crm_contact_facts' then
    select * into v_receipt from private.crm_command_receipts where command_id=new.command_id;
    if not found or v_receipt.scope_key<>'lead:'||new.lead_id::text
       or v_receipt.actor_user_id is distinct from new.recorded_by_user_id then
      raise exception using errcode='23514',message='CONTACT_FACT_RECEIPT_MISMATCH';
    end if;
    if new.amends_fact_id is not null then
      select * into v_parent from private.crm_contact_facts where fact_id=new.amends_fact_id;
      if not found or v_parent.lead_id<>new.lead_id or v_parent.root_fact_id<>new.root_fact_id
         or v_parent.revision+1<>new.revision then
        raise exception using errcode='23514',message='CONTACT_AMENDMENT_CHAIN_INVALID';
      end if;
    end if;
    if new.sequence_id is not null and not exists(select 1 from public.lead_contact_sequences where id=new.sequence_id and lead_id=new.lead_id) then
      raise exception using errcode='23514',message='TASK_SCOPE_MISMATCH';
    end if;
    if new.task_id is not null and not exists(select 1 from public.lead_contact_tasks where id=new.task_id and lead_id=new.lead_id and sequence_id=new.sequence_id) then
      raise exception using errcode='23514',message='TASK_SCOPE_MISMATCH';
    end if;
  elsif tg_table_name='crm_contact_task_credits' then
    if not exists(select 1 from public.lead_contact_tasks where id=new.task_id and lead_id=new.lead_id
      and sequence_id=new.sequence_id and due_start=new.original_due_start and due_end=new.original_due_end) then
      raise exception using errcode='23514',message='TASK_SCOPE_MISMATCH';
    end if;
  elsif tg_table_name='crm_contact_runtime' then
    if new.current_sequence_id is not null and not exists(select 1 from public.lead_contact_sequences where id=new.current_sequence_id and lead_id=new.lead_id) then
      raise exception using errcode='23514',message='TASK_SCOPE_MISMATCH';
    end if;
  end if;
  return new;
end;
$function$;
alter function private.crm_contact_validate_references() owner to postgres;
revoke all on function private.crm_contact_validate_references() from public,anon,authenticated,service_role;
create trigger crm_contact_facts_references before insert on private.crm_contact_facts
  for each row execute function private.crm_contact_validate_references();
create trigger crm_contact_credits_references before insert or update on private.crm_contact_task_credits
  for each row execute function private.crm_contact_validate_references();
create trigger crm_contact_runtime_references before insert or update on private.crm_contact_runtime
  for each row execute function private.crm_contact_validate_references();

comment on table private.crm_contact_facts is 'M1-04B append-only manual attestations. No provider verification, IA-channel authority or inferred attempt from omission.';
comment on table private.crm_contact_task_credits is 'Mutable controlled credit projection. Immutable receipt/events retain every grant, review and revocation.';
comment on table private.crm_contact_next_action_adoptions is 'Sticky technical adoption of contact_next_action.v1. Assignment adoption, a runtime row or a paused gate never substitutes this fact.';
-- Fixed SECURITY DEFINER effect helpers execute as the existing non-superuser
-- postgres principal. Explicit internal ACLs do not imply role inheritance or
-- any API privilege. No DELETE/TRUNCATE/DDL and no runtime/receipt UPDATE grant.
grant select on private.crm_contact_next_action_adoptions,private.crm_contact_runtime,
 private.crm_contact_facts,private.crm_next_actions,private.crm_contact_task_credits to postgres;
grant insert on private.crm_contact_facts,private.crm_next_actions,private.crm_contact_task_credits to postgres;
grant update on private.crm_contact_runtime,private.crm_next_actions,private.crm_contact_task_credits to postgres;
grant select on private.crm_lead_runtime,private.crm_runtime_gates,private.crm_runtime_policies,
 private.crm_command_receipts,private.crm_events to postgres;
grant insert on private.crm_events to postgres;
revoke create on schema private from crm_runtime_owner;
grant crm_runtime_owner to postgres with inherit false, set false;
commit;
