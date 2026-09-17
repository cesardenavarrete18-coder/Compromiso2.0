begin;

-- M1-01/02 foundation only. This migration does not enable a writer or sender.
-- No seed rows, backfills, legacy triggers, or legacy permissions are changed.
-- PSQL-02 assigns the dedicated NOLOGIN owner after these objects are closed.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 170000 then
    raise exception 'M1 foundation requires PostgreSQL 17 or newer';
  end if;
  if to_regnamespace('private') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.leads') is null then
    raise exception 'M1 foundation requires the verified CRM baseline';
  end if;
end;
$preflight$;

create table private.crm_runtime_policies (
  policy_version text primary key,
  schema_version smallint not null default 1,
  policy_hash text not null,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by_user_id uuid references public.profiles(user_id) on delete restrict,
  publisher_subject text not null,
  baseline_manifest_id text not null,
  constraint crm_runtime_policies_version_check check (
    policy_version ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  constraint crm_runtime_policies_schema_check check (schema_version = 1),
  constraint crm_runtime_policies_snapshot_check check (
    jsonb_typeof(snapshot) = 'object'
    and snapshot ? 'project_ref'
    and jsonb_typeof(snapshot -> 'project_ref') = 'string'
    and (snapshot ->> 'project_ref') ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    and octet_length(snapshot::text) <= 1048576
  ),
  -- Policy identity uses the PostgreSQL jsonb text representation, in UTF-8.
  -- It is a server-checked digest, not a caller-supplied authorization token.
  constraint crm_runtime_policies_hash_check check (
    policy_hash ~ '^[0-9a-f]{64}$'
    and policy_hash = encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex')
  ),
  constraint crm_runtime_policies_publisher_check check (
    char_length(publisher_subject) between 1 and 200
    and publisher_subject = btrim(publisher_subject)
  ),
  constraint crm_runtime_policies_manifest_check check (
    char_length(baseline_manifest_id) between 1 and 200
    and baseline_manifest_id = btrim(baseline_manifest_id)
  ),
  constraint crm_runtime_policies_hash_schema_key unique (policy_hash, schema_version)
);

create function private.crm_reject_policy_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'RUNTIME_POLICY_IMMUTABLE';
end;
$function$;

revoke all on function private.crm_reject_policy_mutation()
  from public, anon, authenticated, service_role;

create trigger crm_runtime_policies_immutable
before update or delete on private.crm_runtime_policies
for each row execute function private.crm_reject_policy_mutation();

create trigger crm_runtime_policies_no_truncate
before truncate on private.crm_runtime_policies
for each statement execute function private.crm_reject_policy_mutation();

create table private.crm_runtime_gates (
  domain text not null,
  scope_key text not null,
  mode text not null default 'observe',
  writer_epoch bigint not null default 0,
  contract_version text not null,
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  revision bigint not null default 0,
  changed_by_user_id uuid references public.profiles(user_id) on delete restrict,
  changer_subject text not null,
  changed_at timestamptz not null default now(),
  reason text not null,
  baseline_manifest_id text not null,
  cutover_cursor bigint,
  primary key (domain, scope_key),
  constraint crm_runtime_gates_domain_check check (domain in (
    'inbox', 'command_owner', 'command_crm', 'command_sales_legacy',
    'handoff', 'dialogue_policy', 'outbox', 'v1_adapter',
    'sender.customer_ai_dialogue', 'sender.customer_ai_recovery',
    'sender.worker_internal_notification'
  )),
  constraint crm_runtime_gates_scope_check check (
    scope_key = 'global'
    or scope_key ~ '^lead:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or scope_key ~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or scope_key ~ '^account:[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
  ),
  -- M1-01/02/03 cannot activate production authority, even by changing a flag.
  -- A later authorized migration must explicitly replace this constraint.
  constraint crm_runtime_gates_foundation_closed check (mode in ('observe', 'ready', 'paused')),
  constraint crm_runtime_gates_future_purposes_closed check (
    domain not in ('sender.customer_ai_recovery', 'sender.worker_internal_notification')
    or mode in ('observe', 'paused')
  ),
  constraint crm_runtime_gates_versions_check check (writer_epoch >= 0 and revision >= 0),
  constraint crm_runtime_gates_contract_check check (
    contract_version ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  constraint crm_runtime_gates_actor_check check (
    char_length(changer_subject) between 1 and 200
    and changer_subject = btrim(changer_subject)
  ),
  constraint crm_runtime_gates_reason_check check (
    char_length(reason) between 1 and 1000 and reason = btrim(reason)
  ),
  constraint crm_runtime_gates_manifest_check check (
    char_length(baseline_manifest_id) between 1 and 200
    and baseline_manifest_id = btrim(baseline_manifest_id)
  ),
  constraint crm_runtime_gates_cursor_check check (cutover_cursor is null or cutover_cursor >= 0)
);

create index crm_runtime_gates_domain_mode_idx
  on private.crm_runtime_gates(domain, mode);

create table private.crm_conversation_state (
  conversation_id uuid primary key default gen_random_uuid(),
  project_ref text not null,
  provider text not null,
  provider_account_id text not null,
  channel_address_id text not null,
  participant_key text not null,
  lead_id uuid references public.leads(id) on delete restrict,
  link_state text not null default 'unlinked',
  channel_authority text not null default 'disabled',
  dialogue_policy text not null default 'paused',
  dialogue_reason text not null default 'foundation_not_activated',
  inbound_revision bigint not null default 0,
  context_revision bigint not null default 0,
  authority_epoch bigint not null default 0,
  dialogue_policy_revision bigint not null default 0,
  handoff_revision bigint not null default 0,
  producer_epoch bigint not null default 0,
  state_version bigint not null default 0,
  next_ingress_sequence bigint not null default 1,
  processed_cursor bigint not null default 0,
  active_turn_id uuid,
  turn_revision bigint not null default 0,
  processing_lease_token bigint not null default 0,
  processing_lease_owner text,
  processing_lease_expires_at timestamptz,
  turn_snapshot_cursor bigint,
  authoritative_producer text not null default 'v1_compatible',
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  legacy_control_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_conversation_state_identity_key
    unique (provider, provider_account_id, channel_address_id, participant_key),
  constraint crm_conversation_state_identity_check check (
    project_ref ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    and char_length(provider) between 1 and 64 and provider = btrim(provider)
    and char_length(provider_account_id) between 1 and 128 and provider_account_id = btrim(provider_account_id)
    and char_length(channel_address_id) between 1 and 128 and channel_address_id = btrim(channel_address_id)
    and char_length(participant_key) between 1 and 256 and participant_key = btrim(participant_key)
  ),
  constraint crm_conversation_state_link_check check (
    link_state in ('unlinked', 'linked', 'needs_review')
    and (link_state <> 'linked' or lead_id is not null)
    and (link_state <> 'unlinked' or lead_id is null)
  ),
  constraint crm_conversation_state_authority_check check (channel_authority in ('ai_service', 'disabled')),
  constraint crm_conversation_state_dialogue_check check (dialogue_policy in ('ai_active', 'ai_limited', 'paused')),
  constraint crm_conversation_state_disabled_check check (channel_authority <> 'disabled' or dialogue_policy = 'paused'),
  -- Producer identity is reserved metadata only; it is not permission to run.
  constraint crm_conversation_state_producer_check check (authoritative_producer = 'v1_compatible'),
  constraint crm_conversation_state_foundation_closed check (
    channel_authority = 'disabled' and dialogue_policy = 'paused' and active_turn_id is null
  ),
  constraint crm_conversation_state_reason_check check (
    char_length(dialogue_reason) between 1 and 1000 and dialogue_reason = btrim(dialogue_reason)
  ),
  constraint crm_conversation_state_versions_check check (
    inbound_revision >= 0 and context_revision >= 0 and authority_epoch >= 0
    and dialogue_policy_revision >= 0 and handoff_revision >= 0 and producer_epoch >= 0
    and state_version >= 0 and turn_revision >= 0 and processing_lease_token >= 0
  ),
  constraint crm_conversation_state_cursor_check check (
    next_ingress_sequence >= 1 and processed_cursor >= 0 and processed_cursor < next_ingress_sequence
    and (turn_snapshot_cursor is null or (turn_snapshot_cursor >= 0 and turn_snapshot_cursor < next_ingress_sequence))
  ),
  constraint crm_conversation_state_lease_check check (
    (active_turn_id is null and processing_lease_owner is null
      and processing_lease_expires_at is null and turn_snapshot_cursor is null)
    or (active_turn_id is not null and processing_lease_owner is not null
      and char_length(processing_lease_owner) between 1 and 200
      and processing_lease_expires_at is not null and turn_snapshot_cursor is not null
      and processing_lease_token > 0)
  ),
  constraint crm_conversation_state_legacy_snapshot_check check (
    legacy_control_snapshot is null or jsonb_typeof(legacy_control_snapshot) = 'object'
  ),
  constraint crm_conversation_state_timestamps_check check (updated_at >= created_at)
);

create index crm_conversation_state_lead_idx on private.crm_conversation_state(lead_id);
create index crm_conversation_state_link_updated_idx on private.crm_conversation_state(link_state, updated_at);
create index crm_conversation_state_lease_idx on private.crm_conversation_state(processing_lease_expires_at)
  where active_turn_id is not null;

create table private.crm_lead_runtime (
  lead_id uuid primary key references public.leads(id) on delete restrict,
  aggregate_version bigint not null default 0,
  assignment_epoch bigint not null default 0,
  assignment_received_at timestamptz,
  assignment_received_by uuid references public.profiles(user_id) on delete restrict,
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_runtime_versions_check check (aggregate_version >= 0 and assignment_epoch >= 0),
  constraint crm_lead_runtime_receipt_check check (
    (assignment_received_at is null) = (assignment_received_by is null)
  ),
  constraint crm_lead_runtime_timestamps_check check (updated_at >= created_at)
);

-- Close each object in its creation migration, not only in a later release.
alter table private.crm_runtime_policies enable row level security;
alter table private.crm_runtime_policies force row level security;
alter table private.crm_runtime_gates enable row level security;
alter table private.crm_runtime_gates force row level security;
alter table private.crm_conversation_state enable row level security;
alter table private.crm_conversation_state force row level security;
alter table private.crm_lead_runtime enable row level security;
alter table private.crm_lead_runtime force row level security;

revoke all on table private.crm_runtime_policies, private.crm_runtime_gates,
  private.crm_conversation_state, private.crm_lead_runtime
  from public, anon, authenticated, service_role;

comment on table private.crm_runtime_gates is
  'M1 foundation only: observe/ready/paused; no authoritative writer or future sender can be enabled.';
comment on table private.crm_conversation_state is
  'Inactive M1 foundation. Assignment and handoff never confer channel authority; disabled/paused until a later approved migration.';
comment on table private.crm_lead_runtime is
  'Versions only. No duplicate ownership field, no shared runtime_writer_epoch, no legacy mutation triggers.';

commit;
