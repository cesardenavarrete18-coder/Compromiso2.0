-- Move exhausted unanswered contact protocols out of the active CRM portfolio.
-- Expired windows remain truthful `skipped` tasks; skipping work never becomes
-- a fabricated contact. When the recognized protocol itself is exhausted,
-- however, an untouched Nuevo/No contesta lead belongs in Base fria.

create or replace function private.lead_has_canonical_cold_base_evidence(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lead_contact_sequences sequence
    cross join lateral (
      select
        count(*) filter (where task.channel = 'call') as call_count,
        count(*) filter (where task.channel = 'whatsapp') as whatsapp_count,
        count(*) filter (where task.status in ('pending', 'scheduled')) as unfinished_count,
        count(*) filter (where task.status = 'cancelled') as cancelled_count,
        count(*) filter (where task.outcome = 'answered') as answered_count,
        count(*) filter (
          where task.channel = 'call'
            and not (
              (task.status = 'completed' and task.outcome = 'no_answer')
              or (task.status = 'skipped' and task.outcome = 'skipped')
            )
        ) as invalid_call_result_count,
        count(*) filter (
          where task.channel = 'whatsapp'
            and not (
              (task.status = 'completed' and task.outcome = 'sent')
              or (task.status = 'skipped' and task.outcome = 'skipped')
            )
        ) as invalid_whatsapp_result_count,
        count(distinct (task.protocol_day, task.protocol_band))
          filter (where task.channel = 'call') as protocol_band_count
      from public.lead_contact_tasks task
      where task.sequence_id = sequence.id
    ) evidence
    where sequence.lead_id = p_lead_id
      and sequence.status = 'completed'
      and evidence.unfinished_count = 0
      and evidence.cancelled_count = 0
      and evidence.answered_count = 0
      and evidence.invalid_call_result_count = 0
      and evidence.invalid_whatsapp_result_count = 0
      and (
        (evidence.call_count = 18
          and evidence.whatsapp_count = 2
          and evidence.protocol_band_count = 9)
        or
        (evidence.call_count = 6
          and evidence.whatsapp_count = 2)
      )
      and not exists (
        select 1
        from public.lead_contact_sequences active_sequence
        where active_sequence.lead_id = sequence.lead_id
          and active_sequence.status = 'active'
      )
      and not exists (
        select 1
        from public.lead_contact_sequences newer_sequence
        where newer_sequence.lead_id = sequence.lead_id
          and newer_sequence.status <> 'cancelled'
          and (
            newer_sequence.started_at > sequence.started_at
            or (newer_sequence.started_at = sequence.started_at and newer_sequence.id > sequence.id)
          )
      )
  );
$$;

revoke all on function private.lead_has_canonical_cold_base_evidence(uuid)
  from public, anon, authenticated;

comment on function private.lead_has_canonical_cold_base_evidence(uuid)
  is 'Recognizes the latest completed 18+2/9-band or legacy 6+2 unanswered protocol. Truthful skipped windows are valid exhaustion evidence; answered/cancelled/unfinished tasks are not.';

create or replace function private.classify_exhausted_contact_protocol(
  p_lead_id uuid,
  p_sequence_id uuid,
  p_origin text default 'protocol_exhaustion'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_completed_at timestamptz;
  v_classified_lead_id uuid;
begin
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

  -- Production has the recall queue; lightweight validation environments may
  -- not. The existing Desistir trigger creates the item when the table exists.
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
$$;

revoke all on function private.classify_exhausted_contact_protocol(uuid, uuid, text)
  from public, anon, authenticated;

comment on function private.classify_exhausted_contact_protocol(uuid, uuid, text)
  is 'Moves an exhausted unanswered recognized protocol from Nuevo/No contesta to CRM V2 Base fria without fabricating skipped contacts or overriding human-agreed actions.';

create or replace function private.classify_completed_contact_protocol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    perform private.classify_exhausted_contact_protocol(
      new.lead_id,
      new.id,
      'protocol_sequence_completed'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.classify_completed_contact_protocol()
  from public, anon, authenticated;

drop trigger if exists lead_contact_sequences_classify_exhausted on public.lead_contact_sequences;
create trigger lead_contact_sequences_classify_exhausted
  after update of status on public.lead_contact_sequences
  for each row
  when (old.status is distinct from new.status and new.status = 'completed')
  execute function private.classify_completed_contact_protocol();

-- record_contact_task_result used to reject a completed sequence containing
-- truthful skipped windows. Sequence completion is now classified centrally by
-- the trigger above, so this RPC only records the factual task result.
create or replace function public.record_contact_task_result(
  p_task_id uuid,
  p_outcome text,
  p_note text default '',
  p_performed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
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
$$;

revoke all on function public.record_contact_task_result(uuid, text, text, timestamptz)
  from public, anon;
grant execute on function public.record_contact_task_result(uuid, text, text, timestamptz)
  to authenticated;

-- Reconcile rows already showing PROTOCOLO AGOTADO before this migration.
-- Only the latest recognized 18+2 or legacy 6+2 sequence can qualify.
do $$
declare
  v_candidate record;
begin
  for v_candidate in
    select sequence.lead_id, sequence.id as sequence_id
    from public.lead_contact_sequences sequence
    join public.lead_crm crm on crm.lead_id = sequence.lead_id
    join public.leads lead on lead.id = sequence.lead_id
    where sequence.status = 'completed'
      and crm.status in ('nuevo', 'no_contesta')
      and crm.next_contact_at is null
      and lead.closed_at is null
      and not coalesce(lead.do_not_contact, false)
    order by sequence.started_at desc, sequence.id desc
  loop
    perform private.classify_exhausted_contact_protocol(
      v_candidate.lead_id,
      v_candidate.sequence_id,
      'protocol_exhaustion_backfill'
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
