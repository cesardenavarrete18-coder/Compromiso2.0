-- Consolidate the existing CRM, activity history and contact protocol for the
-- Supervisor portfolio without duplicating operational data.

create or replace function public.get_supervisor_portfolio_followup()
returns table (
  lead_id uuid,
  management_count bigint,
  first_management_at timestamptz,
  first_effective_contact_at timestamptz,
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
    coalesce(activity.completed_today, false) or coalesce(completed_task.completed_today, false),
    latest.created_at,
    latest.activity_type,
    latest.title,
    latest.detail,
    latest.actor_user_id,
    latest.actor_name,
    latest.actor_role,
    pending_task.id,
    pending_task.due_start,
    pending_task.channel,
    pending_task.call_attempt,
    pending_task.message_step
  from public.leads lead
  left join lateral (
    select
      count(*) filter (
        where item.actor_user_id is not null
          and item.created_at >= lead.assigned_at
          and item.activity_type not in ('assignment', 'manual_creation')
      )::bigint as management_count,
      min(item.created_at) filter (
        where item.actor_user_id is not null
          and item.created_at >= lead.assigned_at
          and item.activity_type not in ('assignment', 'manual_creation')
      ) as first_management_at,
      min(item.created_at) filter (
        where (
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
        and item.activity_type not in ('assignment', 'manual_creation')
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
    where task.lead_id = lead.id and task.status = 'pending'
    order by task.due_start, task.sequence_order
    limit 1
  ) pending_task on true
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

revoke all on function public.get_supervisor_portfolio_followup() from public, anon;
grant execute on function public.get_supervisor_portfolio_followup() to authenticated;

create or replace function public.supervisor_manage_lead(
  p_lead_id uuid,
  p_action text,
  p_status text default null,
  p_priority text default null,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default '',
  p_contact_outcome text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_crm public.lead_crm%rowtype;
  v_previous_status text;
  v_was_scheduled boolean;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if p_action not in ('schedule', 'status', 'management') then
    raise exception 'Acción de supervisión inválida';
  end if;
  if not exists (
    select 1 from public.leads lead
    where lead.id = p_lead_id and lead.assigned_seller_user_id is not null
  ) then
    raise exception 'No se encontró un Lead asignado';
  end if;

  select * into v_crm
  from public.lead_crm crm
  where crm.lead_id = p_lead_id
  for update;
  if not found then raise exception 'No se encontró la ficha CRM del Lead'; end if;
  if v_crm.status in ('venta', 'desistir', 'invalido') then
    raise exception 'El Lead ya no se encuentra activo';
  end if;

  if p_action = 'schedule' then
    if p_next_contact_at is null or p_next_contact_at <= now() then
      raise exception 'Programá una fecha y hora futura';
    end if;
    if char_length(trim(coalesce(p_next_contact_note, ''))) < 3
      or char_length(trim(p_next_contact_note)) > 1000 then
      raise exception 'Indicá el motivo de la próxima acción';
    end if;
    v_was_scheduled := v_crm.next_contact_at is not null;
    perform set_config('grupo_sur.manual_lead_id', p_lead_id::text, true);
    perform set_config('grupo_sur.manual_next_contact_at', p_next_contact_at::text, true);
    perform set_config('grupo_sur.manual_next_contact_note', trim(p_next_contact_note), true);

    update public.lead_crm set
      next_contact_at = p_next_contact_at,
      next_contact_note = trim(p_next_contact_note),
      next_contact_source = 'manual',
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = p_lead_id;

    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (
      p_lead_id,
      v_user_id,
      'follow_up',
      case when v_was_scheduled then 'Próxima acción reprogramada' else 'Próxima acción programada' end,
      trim(p_next_contact_note),
      jsonb_build_object(
        'origin', 'supervisor_portfolio',
        'previous_next_contact_at', v_crm.next_contact_at,
        'next_contact_at', p_next_contact_at,
        'next_contact_note', trim(p_next_contact_note)
      )
    );
    return;
  end if;

  if p_action = 'status' then
    if p_status is null or p_status not in ('no_contesta', 'en_proceso', 'invalido', 'entrevista', 'cierre', 'sena', 'desistir') then
      raise exception 'Estado comercial inválido';
    end if;
    if p_priority is null or p_priority not in ('low', 'normal', 'high') then
      raise exception 'Prioridad inválida';
    end if;
    if char_length(trim(coalesce(p_note, ''))) > 2000 then
      raise exception 'La observación es demasiado extensa';
    end if;
    if p_status = 'no_contesta' and v_crm.next_contact_at is null and not exists (
      select 1 from public.lead_contact_tasks task
      where task.lead_id = p_lead_id and task.status = 'pending'
    ) then
      raise exception 'Programá la próxima acción antes de marcar No contesta';
    end if;
    if p_status = 'entrevista' and v_crm.interview_at is null then
      raise exception 'La Entrevista debe programarse previamente desde la gestión comercial';
    end if;
    if p_status = 'sena' and coalesce(v_crm.deposit_amount, 0) <= 0 then
      raise exception 'La Seña requiere un importe registrado en la gestión comercial';
    end if;
    if p_status in ('invalido', 'desistir') and char_length(trim(coalesce(p_note, ''))) < 3 then
      raise exception 'Indicá el motivo del cambio de estado';
    end if;
    v_previous_status := v_crm.status;

    update public.lead_crm set
      status = p_status,
      priority = case when p_status = 'cierre' then 'high' else p_priority end,
      status_reason = case when p_status in ('invalido', 'desistir') then trim(p_note) else status_reason end,
      next_contact_at = case when p_status in ('invalido', 'desistir') then null else next_contact_at end,
      next_contact_note = case when p_status in ('invalido', 'desistir') then '' else next_contact_note end,
      next_contact_source = case when p_status in ('invalido', 'desistir') then null else next_contact_source end,
      cold_base_at = case when p_status = 'desistir' then now() else cold_base_at end,
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = p_lead_id;

    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (
      p_lead_id,
      v_user_id,
      'status_change',
      'Estado actualizado por Supervisión',
      trim(coalesce(p_note, '')),
      jsonb_build_object('origin', 'supervisor_portfolio', 'previous_status', v_previous_status, 'status', p_status, 'priority', p_priority)
    );
    return;
  end if;

  if p_contact_outcome not in ('answered', 'no_answer', 'sent') then
    raise exception 'Resultado de gestión inválido';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 2 or char_length(trim(p_note)) > 3000 then
    raise exception 'Describí la gestión realizada';
  end if;
  if p_next_contact_at is not null then
    if p_next_contact_at <= now() or char_length(trim(coalesce(p_next_contact_note, ''))) < 3 then
      raise exception 'La próxima acción debe ser futura e indicar un motivo';
    end if;
    perform set_config('grupo_sur.manual_lead_id', p_lead_id::text, true);
    perform set_config('grupo_sur.manual_next_contact_at', p_next_contact_at::text, true);
    perform set_config('grupo_sur.manual_next_contact_note', trim(p_next_contact_note), true);
  end if;

  update public.lead_crm set
    status = case when p_contact_outcome = 'answered' and status in ('nuevo', 'no_contesta') then 'en_proceso' else status end,
    last_contact_at = now(),
    last_contact_outcome = p_contact_outcome,
    next_contact_at = coalesce(p_next_contact_at, next_contact_at),
    next_contact_note = case when p_next_contact_at is null then next_contact_note else trim(p_next_contact_note) end,
    next_contact_source = case when p_next_contact_at is null then next_contact_source else 'manual' end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    p_lead_id,
    v_user_id,
    case when p_contact_outcome = 'sent' then 'follow_up' else 'contact' end,
    case p_contact_outcome
      when 'answered' then 'Contacto efectivo registrado por Supervisión'
      when 'no_answer' then 'Intento sin respuesta registrado por Supervisión'
      else 'WhatsApp registrado por Supervisión'
    end,
    trim(p_note),
    jsonb_build_object(
      'origin', 'supervisor_portfolio',
      'outcome', p_contact_outcome,
      'next_contact_at', p_next_contact_at,
      'next_contact_note', nullif(trim(coalesce(p_next_contact_note, '')), '')
    )
  );
end;
$$;

revoke all on function public.supervisor_manage_lead(uuid, text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.supervisor_manage_lead(uuid, text, text, text, text, timestamptz, text, text) to authenticated;

notify pgrst, 'reload schema';
