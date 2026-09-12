-- Supervisor V2 operational metrics.
-- Additive only: keep the current Supervisor RPC untouched and expose a V2
-- read model plus seller protocol-performance metrics.

create or replace function public.get_supervisor_portfolio_followup_v2()
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
          and (
            task.status = 'completed'
            or task.due_end <= coalesce(sequence.completed_at, sequence.updated_at, now())
          )
      )::bigint as call_due,
      count(*) filter (
        where task.channel = 'call' and task.status = 'completed'
      )::bigint as call_completed,
      count(*) filter (
        where task.channel = 'call'
          and task.status = 'completed'
          and task.completed_at is not null
          and task.completed_at <= task.due_end
      )::bigint as call_completed_on_time,
      count(*) filter (
        where task.channel = 'call'
          and task.status in ('pending', 'scheduled')
          and task.due_end < now()
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

create or replace function public.get_supervisor_protocol_performance(
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
  compliance_pct numeric,
  on_time_pct numeric
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
          and task.due_start >= v_from and task.due_start < v_to
          and (
            task.status = 'completed'
            or task.due_end <= least(sequence.terminal_at, now())
          )
      )::bigint as due_calls,
      count(task.id) filter (
        where task.channel = 'call'
          and task.due_start >= v_from and task.due_start < v_to
          and task.status = 'completed'
      )::bigint as completed_calls,
      count(task.id) filter (
        where task.channel = 'call'
          and task.due_start >= v_from and task.due_start < v_to
          and task.status = 'completed'
          and task.completed_at is not null
          and task.completed_at <= task.due_end
      )::bigint as completed_on_time
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
    case
      when coalesce(rollup.due_calls, 0) = 0 then null
      else round(100.0 * rollup.completed_calls / rollup.due_calls, 1)
    end,
    case
      when coalesce(rollup.due_calls, 0) = 0 then null
      else round(100.0 * rollup.completed_on_time / rollup.due_calls, 1)
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
