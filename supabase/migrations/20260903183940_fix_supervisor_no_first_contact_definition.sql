-- Define Sin primer contacto from the complete commercial history of the Lead.
-- Untouched Leads remain exclusively in Sin gestion. Reassignments never reset
-- evidence of a prior response or of progress beyond the no-answer circuit.

drop function if exists public.get_supervisor_portfolio_followup();

create function public.get_supervisor_portfolio_followup()
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
security invoker
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
      )::bigint as management_count,
      min(item.created_at) filter (
        where item.actor_user_id is not null
          and item.created_at >= lead.assigned_at
          and item.activity_type not in ('comment', 'assignment', 'manual_creation')
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
    where crm.next_contact_source = 'protocol'
      and task.lead_id = lead.id
      and task.status = 'pending'
      and task.due_start = crm.next_contact_at
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
      and task.status in ('completed', 'skipped')
      and task.completed_at is not null
  ) completed_task on true
  where lead.assigned_seller_user_id is not null;
$$;

comment on function public.get_supervisor_portfolio_followup()
  is 'Seguimiento Supervisor con Sin primer contacto derivado de toda la historia comercial; Nuevo y reasignaciones no reinician la clasificacion.';

revoke all on function public.get_supervisor_portfolio_followup() from public, anon;
grant execute on function public.get_supervisor_portfolio_followup() to authenticated;

notify pgrst, 'reload schema';
