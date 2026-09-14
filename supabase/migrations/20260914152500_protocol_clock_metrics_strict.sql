-- Strict protocol clock and truthful Supervisor metrics.
--
-- Invariants:
-- 1) an unfinished protocol task becomes skipped as soon as its due_end expires;
-- 2) the next unfinished task becomes the visible recommendation immediately;
-- 3) automatic clock advancement is system activity, never seller management;
-- 4) skipped work never counts as "completed today";
-- 5) protocol performance exposes omissions separately from completions.

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

    -- Strict clock: once the commercial window ends, unfinished work is missed.
    -- There is intentionally no grace period and no dependency on a later band
    -- having started. This prevents expired work from blocking the next action.
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
      continue;
    end if;

    -- The earliest unfinished task is immediately the next visible action, even
    -- between commercial bands. Its contractual due_start/due_end never move.
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
    'tasks_skipped', v_skipped_total
  );
end;
$$;

revoke all on function public.refresh_due_contact_protocols() from public, anon;
grant execute on function public.refresh_due_contact_protocols() to authenticated;

comment on function public.refresh_due_contact_protocols()
  is 'Strictly advances active contact protocols by due_end. Expired unfinished work becomes skipped immediately and system-generated audit activity is never attributed to a seller.';

create or replace function public.get_supervisor_portfolio_followup()
returns table (
  lead_id uuid,
  management_count bigint,
  first_management_at timestamptz,
  first_effective_contact_at timestamptz,
  without_first_contact boolean,
  completed_today boolean,
  last_activity_at timestamptz,
  last_activity_type text,
  last_activity_title text,
  last_activity_detail text,
  last_activity_actor_user_id uuid,
  last_activity_actor_name text,
  last_activity_actor_role text,
  next_task_id uuid,
  next_task_due_start timestamptz,
  next_task_channel text,
  next_task_call_attempt integer,
  next_task_message_step integer
)
language sql
stable
set search_path = ''
as $$
  select
    lead.id,
    coalesce(activity.management_count, 0),
    activity.first_management_at,
    activity.first_effective_contact_at,
    coalesce(
      crm.status = 'no_contesta'
      and (crm.last_contact_at is not null or coalesce(activity.has_real_management, false))
      and not coalesce(activity.has_disqualifying_history, false)
      and lower(trim(coalesce(crm.last_contact_outcome, ''))) not in (
        'answered',
        'respuesta recibida por whatsapp'
      )
      and crm.interview_at is null
      and crm.deposit_at is null
      and crm.sale_requested_at is null
      and crm.sale_confirmed_at is null
      and crm.sale_confirmation_status = 'none',
      false
    ) as without_first_contact,
    coalesce(activity.completed_today, false) or coalesce(completed_task.completed_today, false),
    latest.created_at,
    latest.activity_type,
    latest.title,
    latest.detail,
    latest.actor_user_id,
    latest.actor_name,
    latest.actor_role,
    current_task.id,
    current_task.due_start,
    current_task.channel,
    current_task.call_attempt,
    current_task.message_step
  from public.leads lead
  left join public.lead_crm crm on crm.lead_id = lead.id
  left join lateral (
    select
      count(*) filter (
        where item.actor_user_id is not null
          and item.created_at >= lead.assigned_at
          and item.activity_type not in ('comment', 'assignment', 'manual_creation')
          and coalesce(item.metadata ->> 'origin', '') <> 'protocol_clock'
          and coalesce(item.metadata ->> 'reason', '') <> 'window_expired_without_recorded_attempt'
      )::bigint as management_count,
      min(item.created_at) filter (
        where item.actor_user_id is not null
          and item.created_at >= lead.assigned_at
          and item.activity_type not in ('comment', 'assignment', 'manual_creation')
          and coalesce(item.metadata ->> 'origin', '') <> 'protocol_clock'
          and coalesce(item.metadata ->> 'reason', '') <> 'window_expired_without_recorded_attempt'
      ) as first_management_at,
      min(item.created_at) filter (
        where item.activity_type <> 'comment'
          and (
            item.metadata ->> 'outcome' = 'answered'
            or item.activity_type in ('interview', 'sale_request', 'sale_confirmation')
            or (
              item.activity_type = 'contact'
              and item.metadata ->> 'status' in ('en_proceso', 'entrevista', 'cierre', 'sena', 'venta')
            )
          )
      ) as first_effective_contact_at,
      bool_or(
        item.actor_user_id is not null
        and item.activity_type not in ('comment', 'assignment', 'manual_creation')
        and coalesce(item.metadata ->> 'origin', '') <> 'protocol_clock'
        and coalesce(item.metadata ->> 'reason', '') <> 'window_expired_without_recorded_attempt'
      ) as has_real_management,
      bool_or(
        item.activity_type <> 'comment'
        and (
          (
            item.metadata ? 'outcome'
            and lower(trim(coalesce(item.metadata ->> 'outcome', '')))
              not in ('', 'no_answer', 'sent', 'skipped')
          )
          or (
            item.metadata ? 'status'
            and lower(trim(coalesce(item.metadata ->> 'status', '')))
              not in ('', 'nuevo', 'no_contesta')
          )
          or (
            item.metadata ? 'previous_status'
            and lower(trim(coalesce(item.metadata ->> 'previous_status', '')))
              not in ('', 'nuevo', 'no_contesta')
          )
          or item.activity_type in ('interview', 'sale_request', 'sale_confirmation')
          or lower(trim(coalesce(item.title, ''))) = 'respuesta recibida por whatsapp'
        )
      ) as has_disqualifying_history,
      bool_or(
        item.actor_user_id is not null
        and item.activity_type not in ('comment', 'assignment', 'manual_creation')
        and coalesce(item.metadata ->> 'origin', '') <> 'protocol_clock'
        and coalesce(item.metadata ->> 'reason', '') <> 'window_expired_without_recorded_attempt'
        and (item.created_at at time zone 'America/Argentina/Buenos_Aires')::date
          = (now() at time zone 'America/Argentina/Buenos_Aires')::date
      ) as completed_today
    from public.lead_activities item
    where item.lead_id = lead.id
  ) activity on true
  left join lateral (
    select
      item.created_at,
      item.activity_type,
      item.title,
      item.detail,
      item.actor_user_id,
      actor.full_name as actor_name,
      actor.role::text as actor_role
    from public.lead_activities item
    left join public.profiles actor on actor.user_id = item.actor_user_id
    where item.lead_id = lead.id
    order by item.created_at desc, item.id desc
    limit 1
  ) latest on true
  left join lateral (
    select task.id, task.due_start, task.channel, task.call_attempt, task.message_step
    from public.lead_contact_tasks task
    join public.lead_contact_sequences sequence
      on sequence.id = task.sequence_id
     and sequence.status = 'active'
    where task.lead_id = lead.id
      and task.status = 'pending'
    order by task.sequence_order
    limit 1
  ) current_task on true
  left join lateral (
    select bool_or(
      (task.completed_at at time zone 'America/Argentina/Buenos_Aires')::date
        = (now() at time zone 'America/Argentina/Buenos_Aires')::date
    ) as completed_today
    from public.lead_contact_tasks task
    where task.lead_id = lead.id
      and task.status = 'completed'
      and task.completed_at is not null
  ) completed_task on true
  where lead.assigned_seller_user_id is not null;
$$;

drop function if exists public.get_supervisor_portfolio_followup_v2();

create function public.get_supervisor_portfolio_followup_v2()
returns table (
  lead_id uuid,
  seller_user_id uuid,
  management_count bigint,
  first_management_at timestamptz,
  first_effective_contact_at timestamptz,
  without_first_contact boolean,
  completed_today boolean,
  last_activity_at timestamptz,
  last_activity_type text,
  last_activity_title text,
  last_activity_detail text,
  last_activity_actor_user_id uuid,
  last_activity_actor_name text,
  last_activity_actor_role text,
  next_task_id uuid,
  next_task_due_start timestamptz,
  next_task_due_end timestamptz,
  next_task_channel text,
  next_task_call_attempt integer,
  next_task_message_step integer,
  operational_status text,
  manual_next_contact_at timestamptz,
  interview_at timestamptz,
  post_deposit_action_at timestamptz,
  protocol_sequence_id uuid,
  protocol_status text,
  protocol_started_at timestamptz,
  protocol_completed_at timestamptz,
  protocol_call_total bigint,
  protocol_call_due bigint,
  protocol_call_completed bigint,
  protocol_call_completed_on_time bigint,
  protocol_call_skipped bigint,
  protocol_call_skipped_today bigint,
  protocol_call_overdue bigint,
  protocol_current_call_attempt integer,
  protocol_current_day integer,
  protocol_current_band text,
  protocol_exhausted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.current_user_is_management() then
    raise exception 'Acceso no autorizado';
  end if;

  return query
  select
    base.lead_id,
    lead.assigned_seller_user_id,
    base.management_count,
    base.first_management_at,
    base.first_effective_contact_at,
    base.without_first_contact,
    base.completed_today,
    base.last_activity_at,
    base.last_activity_type,
    base.last_activity_title,
    base.last_activity_detail,
    base.last_activity_actor_user_id,
    base.last_activity_actor_name,
    base.last_activity_actor_role,
    base.next_task_id,
    base.next_task_due_start,
    current_task.due_end,
    base.next_task_channel,
    base.next_task_call_attempt,
    base.next_task_message_step,
    crm.status,
    case when crm.next_contact_source = 'manual' then crm.next_contact_at else null end,
    crm.interview_at,
    crm.post_deposit_action_at,
    sequence.id,
    sequence.status,
    sequence.started_at,
    sequence.completed_at,
    coalesce(task_stats.call_total, 0),
    coalesce(task_stats.call_due, 0),
    coalesce(task_stats.call_completed, 0),
    coalesce(task_stats.call_completed_on_time, 0),
    coalesce(task_stats.call_skipped, 0),
    coalesce(task_stats.call_skipped_today, 0),
    coalesce(task_stats.call_overdue, 0),
    current_task.call_attempt::integer,
    current_task.protocol_day::integer,
    current_task.protocol_band,
    coalesce(sequence.status = 'completed', false)
  from public.get_supervisor_portfolio_followup() base
  join public.leads lead on lead.id = base.lead_id
  left join public.lead_crm crm on crm.lead_id = base.lead_id
  left join lateral (
    select item.*
    from public.lead_contact_sequences item
    where item.lead_id = base.lead_id
    order by
      case when item.status = 'active' then 0 else 1 end,
      item.started_at desc,
      item.created_at desc
    limit 1
  ) sequence on true
  left join lateral (
    select
      count(*) filter (where task.channel = 'call')::bigint as call_total,
      count(*) filter (
        where task.channel = 'call'
          and task.due_end <= now()
          and (
            sequence.status = 'active'
            or task.due_end <= coalesce(sequence.completed_at, sequence.updated_at)
          )
      )::bigint as call_due,
      count(*) filter (
        where task.channel = 'call'
          and task.status = 'completed'
      )::bigint as call_completed,
      count(*) filter (
        where task.channel = 'call'
          and task.status = 'completed'
          and task.completed_at is not null
          and task.completed_at <= task.due_end
      )::bigint as call_completed_on_time,
      count(*) filter (
        where task.channel = 'call'
          and task.status = 'skipped'
      )::bigint as call_skipped,
      count(*) filter (
        where task.channel = 'call'
          and task.status = 'skipped'
          and task.completed_at is not null
          and (task.completed_at at time zone 'America/Argentina/Buenos_Aires')::date
            = (now() at time zone 'America/Argentina/Buenos_Aires')::date
      )::bigint as call_skipped_today,
      count(*) filter (
        where task.channel = 'call'
          and task.status in ('pending', 'scheduled')
          and task.due_end <= now()
          and sequence.status = 'active'
      )::bigint as call_overdue
    from public.lead_contact_tasks task
    where task.sequence_id = sequence.id
  ) task_stats on sequence.id is not null
  left join lateral (
    select task.due_end, task.call_attempt, task.protocol_day, task.protocol_band
    from public.lead_contact_tasks task
    where task.id = base.next_task_id
    limit 1
  ) current_task on true;
end;
$$;

revoke all on function public.get_supervisor_portfolio_followup_v2() from public, anon;
grant execute on function public.get_supervisor_portfolio_followup_v2() to authenticated;

drop function if exists public.get_supervisor_protocol_performance(date, date);

create function public.get_supervisor_protocol_performance(
  p_from date,
  p_to date
)
returns table (
  seller_user_id uuid,
  seller_name text,
  protocols_started bigint,
  protocols_finished bigint,
  protocols_exhausted bigint,
  due_calls bigint,
  completed_calls bigint,
  completed_on_time bigint,
  skipped_calls bigint,
  compliance_pct numeric,
  on_time_pct numeric,
  omitted_pct numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if not private.current_user_is_management() then
    raise exception 'Acceso no autorizado';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido';
  end if;

  v_from := (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires');
  v_to := ((p_to + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');

  return query
  with sequences as (
    select
      sequence.id,
      sequence.seller_user_id,
      sequence.status,
      sequence.started_at,
      sequence.completed_at,
      sequence.updated_at,
      coalesce(sequence.completed_at, sequence.updated_at, now()) as terminal_at
    from public.lead_contact_sequences sequence
  ), task_rollup as (
    select
      sequence.seller_user_id,
      count(distinct sequence.id) filter (
        where sequence.started_at >= v_from and sequence.started_at < v_to
      )::bigint as protocols_started,
      count(distinct sequence.id) filter (
        where sequence.status in ('completed', 'cancelled')
          and sequence.terminal_at >= v_from and sequence.terminal_at < v_to
      )::bigint as protocols_finished,
      count(distinct sequence.id) filter (
        where sequence.status = 'completed'
          and sequence.terminal_at >= v_from and sequence.terminal_at < v_to
      )::bigint as protocols_exhausted,
      count(task.id) filter (
        where task.channel = 'call'
          and task.due_end >= v_from and task.due_end < v_to
          and task.due_end <= now()
          and (
            sequence.status = 'active'
            or task.due_end <= sequence.terminal_at
          )
      )::bigint as due_calls,
      count(task.id) filter (
        where task.channel = 'call'
          and task.due_end >= v_from and task.due_end < v_to
          and task.due_end <= now()
          and (
            sequence.status = 'active'
            or task.due_end <= sequence.terminal_at
          )
          and task.status = 'completed'
      )::bigint as completed_calls,
      count(task.id) filter (
        where task.channel = 'call'
          and task.due_end >= v_from and task.due_end < v_to
          and task.due_end <= now()
          and (
            sequence.status = 'active'
            or task.due_end <= sequence.terminal_at
          )
          and task.status = 'completed'
          and task.completed_at is not null
          and task.completed_at <= task.due_end
      )::bigint as completed_on_time,
      count(task.id) filter (
        where task.channel = 'call'
          and task.due_end >= v_from and task.due_end < v_to
          and task.due_end <= now()
          and (
            sequence.status = 'active'
            or task.due_end <= sequence.terminal_at
          )
          and task.status = 'skipped'
      )::bigint as skipped_calls
    from sequences sequence
    left join public.lead_contact_tasks task on task.sequence_id = sequence.id
    group by sequence.seller_user_id
  )
  select
    seller.user_id,
    seller.full_name,
    coalesce(rollup.protocols_started, 0),
    coalesce(rollup.protocols_finished, 0),
    coalesce(rollup.protocols_exhausted, 0),
    coalesce(rollup.due_calls, 0),
    coalesce(rollup.completed_calls, 0),
    coalesce(rollup.completed_on_time, 0),
    coalesce(rollup.skipped_calls, 0),
    case
      when coalesce(rollup.due_calls, 0) = 0 then null
      else round(100.0 * rollup.completed_calls / rollup.due_calls, 1)
    end,
    case
      when coalesce(rollup.due_calls, 0) = 0 then null
      else round(100.0 * rollup.completed_on_time / rollup.due_calls, 1)
    end,
    case
      when coalesce(rollup.due_calls, 0) = 0 then null
      else round(100.0 * rollup.skipped_calls / rollup.due_calls, 1)
    end
  from public.profiles seller
  left join task_rollup rollup on rollup.seller_user_id = seller.user_id
  where seller.role::text = 'seller'
    and seller.active = true
  order by seller.full_name;
end;
$$;

revoke all on function public.get_supervisor_protocol_performance(date, date) from public, anon;
grant execute on function public.get_supervisor_protocol_performance(date, date) to authenticated;

notify pgrst, 'reload schema';
