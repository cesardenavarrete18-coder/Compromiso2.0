-- Close exhausted no-contact protocols into Base fria without inventing work.
--
-- Business invariant:
-- - protocol windows that expired without a recorded attempt remain `skipped`;
-- - once the whole recognized protocol is exhausted, a Lead that never answered
--   and has no manual next action leaves the active seller/supervisor portfolio;
-- - Base fria is represented by CRM V2 as Desistir + the canonical reason and
--   keeps the original seller/source history intact;
-- - both the current 18-call/9-band protocol and the immediately preceding
--   6-call advisory protocol are recognized for historical reconciliation.

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
    join public.leads lead on lead.id = sequence.lead_id
    join public.lead_crm crm on crm.lead_id = sequence.lead_id
    cross join lateral (
      select
        count(*) filter (where task.channel = 'call') as call_count,
        count(*) filter (where task.channel = 'whatsapp') as whatsapp_count,
        count(*) filter (
          where task.status in ('pending', 'scheduled')
        ) as unfinished_count,
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
      and lead.closed_at is null
      and not coalesce(lead.do_not_contact, false)
      and crm.status = 'desistir'
      and crm.status_reason = 'No contactado post protocolo'
      and crm.next_contact_at is null
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
  is 'True only when Base fria is backed by the latest completed recognized contact protocol, allowing truthful skipped windows but never an answered/cancelled task.';

create or replace function private.classify_exhausted_contact_protocol(
  p_lead_id uuid,
  p_sequence_id uuid,
  p_actor_user_id uuid default null,
  p_origin text default 'protocol_clock'
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
  v_terminal_at timestamptz;
begin
  -- Lock only a still-active commercial card. Human-agreed actions or later
  -- commercial progress always win over automatic protocol exhaustion.
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
  cross join lateral (
    select
      count(*) filter (where task.channel = 'call') as call_count,
      count(*) filter (where task.channel = 'whatsapp') as whatsapp_count,
      count(*) filter (
        where task.status in ('pending', 'scheduled')
      ) as unfinished_count,
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
  where sequence.id = p_sequence_id
    and sequence.lead_id = p_lead_id
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
      where active_sequence.lead_id = p_lead_id
        and active_sequence.status = 'active'
    )
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

  -- A task-level answer is authoritative even if a stale CRM card still says
  -- No contesta. Do not close such a Lead automatically.
  if exists (
    select 1
    from public.lead_activities activity
    where activity.lead_id = p_lead_id
      and lower(trim(coalesce(activity.metadata ->> 'outcome', ''))) in (
        'answered',
        'respuesta recibida por whatsapp'
      )
      and activity.created_at >= (
        select started_at from public.lead_contact_sequences where id = p_sequence_id
      )
  ) then
    return false;
  end if;

  v_terminal_at := coalesce(v_completed_at, now());

  update public.lead_crm
  set status = 'desistir',
      status_reason = 'No contactado post protocolo',
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      cold_base_at = v_terminal_at,
      previous_status = v_previous_status,
      terminal_at = v_terminal_at,
      updated_by = coalesce(p_actor_user_id, updated_by),
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

  -- The existing Desistir trigger creates the Recall item. Re-anchor its
  -- eligibility to the actual exhaustion time so a backfill does not restart
  -- the 15-day waiting period from deployment day.
  update public.lead_recall_items
  set available_at = least(available_at, v_terminal_at + interval '15 days'),
      updated_at = now()
  where lead_id = p_lead_id
    and status in ('available', 'assigned', 'working');

  insert into public.lead_activities (
    lead_id, actor_user_id, activity_type, title, detail, metadata
  ) values (
    p_lead_id,
    p_actor_user_id,
    'status_change',
    'Lead clasificado como Base fría',
    'No contactado post protocolo',
    jsonb_build_object(
      'status', 'desistir',
      'segment', 'base_fria',
      'reason', 'No contactado post protocolo',
      'sequence_id', p_sequence_id,
      'origin', coalesce(nullif(trim(p_origin), ''), 'protocol_clock'),
      'automatic', p_actor_user_id is null,
      'protocol_completed_at', v_terminal_at
    )
  );

  return true;
end;
$$;

revoke all on function private.classify_exhausted_contact_protocol(uuid, uuid, uuid, text)
  from public, anon, authenticated;

comment on function private.classify_exhausted_contact_protocol(uuid, uuid, uuid, text)
  is 'Atomically moves an exhausted unanswered recognized contact protocol to CRM V2 Base fria while preserving truthful skipped tasks and manual-agenda precedence.';

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
  v_sequence_id uuid;
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

  if coalesce((v_result ->> 'sequence_finished')::boolean, false) then
    select sequence_id into v_sequence_id
    from public.lead_contact_tasks
    where id = p_task_id;

    perform private.classify_exhausted_contact_protocol(
      (v_result ->> 'lead_id')::uuid,
      v_sequence_id,
      auth.uid(),
      'record_contact_task_result'
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.record_contact_task_result(uuid, text, text, timestamptz)
  from public, anon;
grant execute on function public.record_contact_task_result(uuid, text, text, timestamptz)
  to authenticated;

create or replace function public.refresh_due_contact_protocols()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_management boolean;
  v_sequence record;
  v_unfinished_exists boolean;
  v_next_task_id uuid;
  v_skipped integer;
  v_skipped_total integer := 0;
  v_sequences_touched integer := 0;
  v_leads_classified_cold integer := 0;
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
      and (v_is_management or sequence.seller_user_id = v_user_id)
    order by sequence.started_at, sequence.id
    for update of sequence
  loop
    v_next_task_id := null;
    v_skipped := 0;

    update public.lead_contact_tasks task
    set status = 'skipped',
        outcome = 'skipped',
        note = case
          when trim(coalesce(task.note, '')) = '' then 'No realizada: ventana vencida'
          else task.note
        end,
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

      insert into public.lead_activities (
        lead_id, actor_user_id, activity_type, title, detail, metadata
      ) values (
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
      select 1
      from public.lead_contact_tasks task
      where task.sequence_id = v_sequence.id
        and task.status in ('pending', 'scheduled')
    ) into v_unfinished_exists;

    if not v_unfinished_exists then
      update public.lead_contact_sequences
      set status = 'completed',
          completed_at = coalesce(completed_at, now()),
          stopped_reason = case
            when v_skipped > 0 then 'Calendario finalizado con intentos no realizados'
            else coalesce(stopped_reason, 'Protocolo finalizado')
          end,
          updated_at = now()
      where id = v_sequence.id
        and status = 'active';

      if private.classify_exhausted_contact_protocol(
        v_sequence.lead_id,
        v_sequence.id,
        null,
        'protocol_clock'
      ) then
        v_leads_classified_cold := v_leads_classified_cold + 1;
      end if;
      continue;
    end if;

    select task.id
      into v_next_task_id
    from public.lead_contact_tasks task
    where task.sequence_id = v_sequence.id
      and task.status in ('pending', 'scheduled')
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

  return jsonb_build_object(
    'sequences_touched', v_sequences_touched,
    'tasks_skipped', v_skipped_total,
    'leads_classified_cold', v_leads_classified_cold
  );
end;
$$;

revoke all on function public.refresh_due_contact_protocols() from public, anon;
grant execute on function public.refresh_due_contact_protocols() to authenticated;

comment on function public.refresh_due_contact_protocols()
  is 'Strictly advances protocol windows; when a recognized unanswered protocol is exhausted it moves the Lead to Base fria without attributing skipped work to a seller.';

-- Historical reconciliation: only recognized 6+2 or 18+2 completed protocols,
-- with no active replacement and no manual commercial action, are eligible.
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
      null,
      'protocol_exhaustion_backfill'
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
