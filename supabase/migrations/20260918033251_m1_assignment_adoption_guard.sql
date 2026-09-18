-- M1-04A / candidate A: durable Assignment adoption and a restrictive channel
-- permission guard only. No assignment handler, gate seed, cutover or sender.
begin;
set local search_path = public, extensions;

do $preflight$
begin
  if current_setting('server_version_num')::integer < 170000
     or to_regclass('private.crm_lead_runtime') is null
     or to_regclass('private.crm_runtime_gates') is null
     or to_regclass('public.lead_assignments') is null
     or to_regprocedure('private.current_user_can_manage_whatsapp(uuid)') is null
     or to_regprocedure('public.set_whatsapp_conversation_mode(uuid,text)') is null then
    raise exception 'ASSIGNMENT_ADOPTION_BASELINE_REQUIRED';
  end if;
  -- Stop on an unreviewed legacy definition rather than overwrite local drift.
  if encode(sha256(convert_to(pg_get_functiondef(
      'private.current_user_can_manage_whatsapp(uuid)'::regprocedure), 'UTF8')), 'hex')
      <> '8d9b07f881593a1919c0d2d7e99d089b294e59e0a5cfa9d74313d4b68960c221' then
    raise exception 'ASSIGNMENT_ADOPTION_CHANNEL_BASELINE_DRIFT';
  end if;
  if encode(sha256(convert_to(pg_get_functiondef(
      'public.set_whatsapp_conversation_mode(uuid,text)'::regprocedure), 'UTF8')), 'hex')
      <> '90dab399dbe3f95ca539599ccaf6d1bbb78d751d6a0ac76c3d4a1a38694dfe62' then
    raise exception 'ASSIGNMENT_ADOPTION_MODE_BASELINE_DRIFT';
  end if;
  if (select jsonb_object_agg(tgname::text,
        encode(sha256(convert_to(pg_get_triggerdef(oid, true), 'UTF8')), 'hex')) from pg_trigger
      where tgrelid = 'public.leads'::regclass and not tgisinternal)
      is distinct from jsonb_build_object(
        'leads_ensure_customer', '75ccb1fbcb97a83a6baf39992c5a5470c95dec18a6909cd8810d39411550b52d',
        'leads_initialize_crm', '12750c8860bf662d5116fa463e110251db3680fafea5e0eb64c7044e227b3349',
        'leads_set_updated_at', '89c9cada4136ef1f1e007e9917de593b50c950af33a87d5c268e89ffb415d601',
        'leads_start_contact_sequence', '08e18643815a465bb8693814605e2d76dc742782dc66f9779264b8f89d4be10c'
      )
     or encode(sha256(convert_to(pg_get_functiondef('private.set_updated_at()'::regprocedure), 'UTF8')), 'hex')
      <> '28c9d300e064d5bcdb66c2cfbcc14546a29d5ff973a2e017ed837b55cbce6a7b' then
    raise exception 'ASSIGNMENT_ADOPTION_LEAD_TRIGGER_BASELINE_DRIFT';
  end if;
end;
$preflight$;

-- Same PostgreSQL 17 ownership pattern validated in M1-02/03. Do not regrant
-- ADMIN to the creator: its bootstrap grant already provides administration.
grant crm_runtime_owner to postgres with inherit true, set true;
grant usage, create on schema private to crm_runtime_owner;

-- Only this one domain and an explicit lead scope acquire a new internal mode.
-- All other domains/purposes remain under the certified closed constraints.
alter table private.crm_runtime_gates
  drop constraint crm_runtime_gates_foundation_closed;
alter table private.crm_runtime_gates
  add constraint crm_runtime_gates_foundation_closed check (
    mode in ('observe', 'ready', 'paused')
    or (
      mode = 'authoritative'
      and domain = 'command_owner'
      and scope_key ~ '^lead:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and writer_epoch > 0
      and contract_version = 'assignment.v1'
    )
  );

create table private.crm_assignment_adoptions (
  lead_id uuid primary key references private.crm_lead_runtime(lead_id) on delete restrict,
  operation_id uuid not null unique,
  adopted_at timestamptz not null,
  executor_principal text not null,
  gate_scope_key text not null,
  writer_epoch bigint not null,
  gate_revision bigint not null,
  contract_version text not null,
  policy_version text not null references private.crm_runtime_policies(policy_version) on delete restrict,
  baseline_manifest_id text not null,
  reason text not null,
  constraint crm_assignment_adoptions_scope_check check (gate_scope_key = 'lead:' || lead_id::text),
  constraint crm_assignment_adoptions_versions_check check (
    writer_epoch between 1 and 9007199254740991
    and gate_revision between 0 and 9007199254740991
  ),
  constraint crm_assignment_adoptions_contract_check check (contract_version = 'assignment.v1'),
  constraint crm_assignment_adoptions_executor_check check (executor_principal = 'postgres'),
  constraint crm_assignment_adoptions_manifest_check check (
    char_length(baseline_manifest_id) between 1 and 200
    and baseline_manifest_id = btrim(baseline_manifest_id)
  ),
  constraint crm_assignment_adoptions_reason_check check (
    char_length(reason) between 1 and 1000 and reason = btrim(reason)
  )
);
alter table private.crm_assignment_adoptions owner to crm_runtime_owner;
alter table private.crm_assignment_adoptions enable row level security;
alter table private.crm_assignment_adoptions force row level security;
create policy crm_assignment_adoptions_owner_only on private.crm_assignment_adoptions
  to crm_runtime_owner using (true) with check (true);
revoke all on private.crm_assignment_adoptions from public, anon, authenticated, service_role;

create function private.crm_reject_assignment_adoption_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $function$
begin
  raise exception using errcode = '55000', message = 'ASSIGNMENT_ADOPTION_IMMUTABLE';
end;
$function$;
alter function private.crm_reject_assignment_adoption_mutation() owner to crm_runtime_owner;
revoke all on function private.crm_reject_assignment_adoption_mutation()
  from public, anon, authenticated, service_role;

create trigger crm_assignment_adoptions_immutable
  before update or delete on private.crm_assignment_adoptions
  for each row execute function private.crm_reject_assignment_adoption_mutation();
create trigger crm_assignment_adoptions_no_truncate
  before truncate on private.crm_assignment_adoptions
  for each statement execute function private.crm_reject_assignment_adoption_mutation();

-- Fixed technical cutover marker. The verified leads_set_updated_at trigger
-- creates a new tuple, so a pre-adoption repeatable-read snapshot cannot later
-- acquire a seller authorization lock without a serialization failure.
-- No historical/commercial field is changed and no legacy UPDATE is granted.
create function private.crm_lock_assignment_adoption_lead(p_lead_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
begin
  -- Serialize against table-wide history truncation without blocking ordinary
  -- history INSERT/UPDATE/DELETE solely because of this table lock.
  lock table public.lead_assignments in row share mode;
  update public.leads set updated_at = updated_at where id = p_lead_id;
  return found;
end;
$function$;
alter function private.crm_lock_assignment_adoption_lead(uuid) owner to postgres;
revoke all on function private.crm_lock_assignment_adoption_lead(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.crm_lock_assignment_adoption_lead(uuid) to crm_runtime_owner;

create function private.crm_adopt_assignment_lead(
  p_lead_id uuid,
  p_operation_id uuid,
  p_expected_gate_revision bigint,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_runtime private.crm_lead_runtime%rowtype;
  v_gate private.crm_runtime_gates%rowtype;
  v_policy private.crm_runtime_policies%rowtype;
  v_adoption private.crm_assignment_adoptions%rowtype;
  v_reason text := btrim(p_reason);
  v_status text := 'adopted';
begin
  -- This is a deployment operation, not a commercial-user capability. Derive
  -- the executor from the actual session, never a JWT claim/header/payload.
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'ASSIGNMENT_ADOPTION_FORBIDDEN';
  end if;
  if p_lead_id is null or p_operation_id is null or p_expected_gate_revision is null
     or p_expected_gate_revision not between 0 and 9007199254740991
     or v_reason is null or char_length(v_reason) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'ASSIGNMENT_ADOPTION_INVALID_ARGUMENT';
  end if;

  -- Freeze gate resolution before aggregate/legacy locks. No table grant to
  -- callers and no ambient GUC is used as proof of adoption.
  lock table private.crm_runtime_gates in share mode;
  select * into v_runtime from private.crm_lead_runtime where lead_id = p_lead_id for update;
  if not found then
    raise exception using errcode = '55000', message = 'ASSIGNMENT_ADOPTION_RUNTIME_REQUIRED';
  end if;
  select * into v_adoption from private.crm_assignment_adoptions
    where lead_id = p_lead_id or operation_id = p_operation_id;
  if found then
    if v_adoption.lead_id <> p_lead_id or v_adoption.operation_id <> p_operation_id
       or v_adoption.gate_revision <> p_expected_gate_revision or v_adoption.reason <> v_reason then
      raise exception using errcode = '23505', message = 'ASSIGNMENT_ADOPTION_CONFLICT';
    end if;
    -- A replay reports the original durable adoption even after pause or
    -- later gate/policy changes; it never reactivates a writer or changes it.
    v_status := 'replayed';
  else
    select * into v_gate from private.crm_runtime_gates
      where domain = 'command_owner' and scope_key = 'lead:' || p_lead_id::text for share;
    if not found or v_gate.mode <> 'authoritative' or v_gate.writer_epoch <= 0
       or v_gate.writer_epoch > 9007199254740991 or v_gate.contract_version <> 'assignment.v1' then
      raise exception using errcode = '55000', message = 'ASSIGNMENT_ADOPTION_GATE_REQUIRED';
    end if;
    if v_gate.revision <> p_expected_gate_revision then
      raise exception using errcode = '40001', message = 'ASSIGNMENT_ADOPTION_GATE_CONFLICT';
    end if;
    select * into v_policy from private.crm_runtime_policies where policy_version = v_gate.policy_version;
    if not found or v_runtime.policy_version <> v_gate.policy_version then
      raise exception using errcode = '55000', message = 'ASSIGNMENT_ADOPTION_POLICY_CONFLICT';
    end if;
    -- First adoption only: an idempotent replay must not refresh even the
    -- technical leads.updated_at timestamp or create another tuple.
    if not private.crm_lock_assignment_adoption_lead(p_lead_id) then
      raise exception using errcode = '55000', message = 'ASSIGNMENT_ADOPTION_LEAD_REQUIRED';
    end if;
    begin
      insert into private.crm_assignment_adoptions (
        lead_id, operation_id, adopted_at, executor_principal, gate_scope_key,
        writer_epoch, gate_revision, contract_version, policy_version, baseline_manifest_id, reason
      ) values (
        p_lead_id, p_operation_id, clock_timestamp(), session_user, v_gate.scope_key,
        v_gate.writer_epoch, v_gate.revision, v_gate.contract_version, v_policy.policy_version,
        v_gate.baseline_manifest_id, v_reason
      ) returning * into v_adoption;
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'ASSIGNMENT_ADOPTION_CONFLICT';
    end;
  end if;

  return jsonb_build_object(
    'status', v_status, 'lead_id', v_adoption.lead_id, 'operation_id', v_adoption.operation_id,
    'adopted_at', v_adoption.adopted_at, 'gate_scope_key', v_adoption.gate_scope_key,
    'writer_epoch', v_adoption.writer_epoch, 'gate_revision', v_adoption.gate_revision,
    'policy_version', v_adoption.policy_version
  );
end;
$function$;
alter function private.crm_adopt_assignment_lead(uuid, uuid, bigint, text) owner to crm_runtime_owner;
revoke all on function private.crm_adopt_assignment_lead(uuid, uuid, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function private.crm_adopt_assignment_lead(uuid, uuid, bigint, text) to postgres;

create function private.crm_assignment_is_adopted(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (select 1 from private.crm_assignment_adoptions where lead_id = p_lead_id);
$function$;
alter function private.crm_assignment_is_adopted(uuid) owner to crm_runtime_owner;
revoke all on function private.crm_assignment_is_adopted(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.crm_assignment_is_adopted(uuid) to postgres;

-- Candidate A owns no assignment handler yet. Adoption therefore closes the
-- old ownership and history writers completely. Candidate B may only admit a
-- matching trusted transaction/receipt, never an ambient GUC or actor claim.
create function private.crm_fence_assignment_owner_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if (old.assigned_seller_user_id is distinct from new.assigned_seller_user_id
      or old.assigned_by_user_id is distinct from new.assigned_by_user_id
      or old.assigned_at is distinct from new.assigned_at)
     and private.crm_assignment_is_adopted(old.id) then
    raise exception using errcode = '55000', message = 'WRITER_FENCED';
  end if;
  return new;
end;
$function$;
alter function private.crm_fence_assignment_owner_write() owner to postgres;
revoke all on function private.crm_fence_assignment_owner_write()
  from public, anon, authenticated, service_role;
create trigger leads_assignment_owner_fence
  before update of assigned_seller_user_id, assigned_by_user_id, assigned_at on public.leads
  for each row execute function private.crm_fence_assignment_owner_write();

create function private.crm_fence_assignment_history_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_lead_id uuid; v_resources uuid[];
begin
  -- Lock both old/new resources in deterministic order. A stale repeatable-read
  -- snapshot meets the cutover tuple marker before consulting the adoption fact.
  if tg_op = 'INSERT' then v_resources := array[new.lead_id];
  elsif tg_op = 'DELETE' then v_resources := array[old.lead_id];
  else v_resources := array[old.lead_id, new.lead_id]; end if;
  for v_lead_id in
    select distinct lead_id from unnest(v_resources) as resources(lead_id)
      where lead_id is not null order by lead_id
  loop
    perform id from public.leads where id = v_lead_id for share;
    if private.crm_assignment_is_adopted(v_lead_id) then
      raise exception using errcode = '55000', message = 'WRITER_FENCED';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
alter function private.crm_fence_assignment_history_write() owner to postgres;
revoke all on function private.crm_fence_assignment_history_write()
  from public, anon, authenticated, service_role;
create trigger lead_assignments_runtime_fence
  before insert or update or delete on public.lead_assignments
  for each row execute function private.crm_fence_assignment_history_write();

create function private.crm_fence_assignment_history_truncate()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_lead_id uuid;
begin
  -- A fixed snapshot could omit history inserted after it began, including
  -- references to an adopted lead. TRUNCATE ignores row visibility, so this
  -- destructive statement requires READ COMMITTED rather than a stale scan.
  if current_setting('transaction_isolation') in ('repeatable read', 'serializable') then
    raise exception using errcode = '55000', message = 'ASSIGNMENT_HISTORY_TRUNCATE_ISOLATION_UNSUPPORTED';
  end if;
  -- TRUNCATE already holds ACCESS EXCLUSIVE on history. NOWAIT avoids a lock
  -- inversion against a writer holding a lead and waiting to append history.
  -- A conflict is visible (55P03), never a silent permission bypass.
  for v_lead_id in select distinct lead_id from public.lead_assignments order by lead_id
  loop
    perform id from public.leads where id = v_lead_id for share nowait;
    if private.crm_assignment_is_adopted(v_lead_id) then
      raise exception using errcode = '55000', message = 'WRITER_FENCED';
    end if;
  end loop;
  return null;
end;
$function$;
alter function private.crm_fence_assignment_history_truncate() owner to postgres;
revoke all on function private.crm_fence_assignment_history_truncate()
  from public, anon, authenticated, service_role;
create trigger lead_assignments_runtime_truncate_fence
  before truncate on public.lead_assignments
  for each statement execute function private.crm_fence_assignment_history_truncate();

-- Preserve every legacy branch and the existing owner/ACL. Only seller access
-- for a durably adopted lead is removed, regardless of current gate/owner/mode.
create or replace function private.current_user_can_manage_whatsapp(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1
    from public.profiles p
    left join public.leads l on l.id = p_lead_id
    where p.user_id = (select auth.uid())
      and p.active = true
      and (
        p.role::text in ('admin', 'supervisor')
        or (p.role::text = 'seller' and l.assigned_seller_user_id = p.user_id
          and not private.crm_assignment_is_adopted(p_lead_id))
      )
  );
$function$;

-- PostgREST GET/HEAD uses read-only transactions. The RLS permission predicate
-- above must remain read-only; mutation synchronization belongs at this write
-- entrypoint. Signature, return shape, owner, grants and mode behavior stay the
-- same. A prior RR snapshot fails against the technical cutover tuple marker.
create or replace function public.set_whatsapp_conversation_mode(p_lead_id uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_control public.whatsapp_conversation_controls%rowtype;
begin
  perform id from public.leads where id = p_lead_id for share;
  if v_user_id is null or not private.current_user_can_manage_whatsapp(p_lead_id) then
    raise exception 'No tenés permiso para intervenir esta conversación';
  end if;
  if p_mode not in ('ai', 'human') then
    raise exception 'El modo de conversación no es válido';
  end if;

  insert into public.whatsapp_conversation_controls (
    lead_id,
    mode,
    taken_by_user_id,
    taken_at,
    released_by_user_id,
    released_at
  ) values (
    p_lead_id,
    p_mode,
    case when p_mode = 'human' then v_user_id else null end,
    case when p_mode = 'human' then now() else null end,
    case when p_mode = 'ai' then v_user_id else null end,
    case when p_mode = 'ai' then now() else null end
  )
  on conflict (lead_id) do update set
    mode = excluded.mode,
    taken_by_user_id = excluded.taken_by_user_id,
    taken_at = excluded.taken_at,
    released_by_user_id = excluded.released_by_user_id,
    released_at = excluded.released_at
  returning * into v_control;

  insert into public.whatsapp_conversation_events (lead_id, actor_user_id, event_type)
  values (p_lead_id, v_user_id, case when p_mode = 'human' then 'taken' else 'released' end);

  return jsonb_build_object(
    'lead_id', v_control.lead_id,
    'mode', v_control.mode,
    'taken_by_user_id', v_control.taken_by_user_id,
    'taken_at', v_control.taken_at,
    'released_at', v_control.released_at,
    'updated_at', v_control.updated_at
  );
end;
$function$;

comment on table private.crm_assignment_adoptions is
  'Immutable per-lead fact of explicit trusted Assignment adoption. Runtime existence/gate mode alone is not adoption. Pause/rollback never clears the fact or restores seller channel permission.';
comment on function private.crm_adopt_assignment_lead(uuid, uuid, bigint, text) is
  'Closed technical operation: explicit per-lead Assignment gate/revision/current policy; immutable snapshot and technical leads.updated_at tuple marker only. No owner/CRM/protocol/channel-state mutation. Replay makes no changes.';
comment on table private.crm_runtime_gates is
  'M1-04A adds authoritative only for command_owner at explicit lead scope, positive epoch and assignment.v1. No seeds or activation; all other domains and future senders stay closed.';

revoke create on schema private from crm_runtime_owner;
grant crm_runtime_owner to postgres with inherit false, set false;

commit;
