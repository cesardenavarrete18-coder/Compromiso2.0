-- Keep the automated 6-call + 2-WhatsApp protocol as an advisory layer.
-- lead_crm.next_contact_* is reserved exclusively for human-agreed actions.

-- Legacy reconciliation is intentionally data-preserving. An unclassified
-- action is considered protocol-generated only when both its timestamp and
-- canonical system label match the current pending task. Every other dated
-- action is preserved as manual.
with unclassified as (
  select
    crm.lead_id,
    exists (
      select 1
      from public.lead_contact_tasks task
      join public.lead_contact_sequences sequence
        on sequence.id = task.sequence_id
       and sequence.status = 'active'
      where task.lead_id = crm.lead_id
        and task.status = 'pending'
        and task.due_start = crm.next_contact_at
        and trim(coalesce(crm.next_contact_note, '')) = trim(private.protocol_task_label(
          task.sequence_id, task.channel, task.call_attempt, task.message_step
        ))
    ) as exact_protocol_match
  from public.lead_crm crm
  where crm.next_contact_at is not null
    and crm.next_contact_source is null
)
update public.lead_crm crm
set next_contact_source = case when item.exact_protocol_match then 'protocol' else 'manual' end,
    updated_at = now()
from unclassified item
where crm.lead_id = item.lead_id;

-- Retire recommendations that are incompatible with the current commercial
-- state or that coexist with a real manual commitment. Completed history is
-- never deleted or rewritten.
with to_cancel as (
  select sequence.id
  from public.lead_contact_sequences sequence
  join public.leads lead on lead.id = sequence.lead_id
  left join public.lead_crm crm on crm.lead_id = sequence.lead_id
  where sequence.status = 'active'
    and (
      coalesce(crm.status, 'nuevo') not in ('nuevo', 'no_contesta')
      or coalesce(lead.do_not_contact, false)
      or lead.closed_at is not null
      or (crm.next_contact_source = 'manual' and crm.next_contact_at is not null)
    )
)
update public.lead_contact_sequences sequence
set status = 'cancelled',
    completed_at = coalesce(sequence.completed_at, now()),
    stopped_reason = 'Reconciliación: protocolo incompatible con agenda o estado comercial',
    updated_at = now()
from to_cancel item
where sequence.id = item.id;

update public.lead_contact_tasks task
set status = 'cancelled',
    updated_at = now()
from public.lead_contact_sequences sequence
where task.sequence_id = sequence.id
  and sequence.status = 'cancelled'
  and task.status in ('pending', 'scheduled');

-- Valid protocol rows keep their task recommendation, but stop occupying the
-- seller's commercial agenda.
update public.lead_crm
set next_contact_at = null,
    next_contact_note = '',
    next_contact_source = null,
    updated_at = now()
where next_contact_source = 'protocol';

-- Defensive normalization: an active protocol has one recommendation only.
with ranked as (
  select
    task.id,
    row_number() over (
      partition by task.lead_id
      order by task.sequence_order, task.due_start, task.id
    ) as position
  from public.lead_contact_tasks task
  join public.lead_contact_sequences sequence
    on sequence.id = task.sequence_id
   and sequence.status = 'active'
  where task.status = 'pending'
)
update public.lead_contact_tasks task
set status = 'scheduled',
    updated_at = now()
from ranked
where task.id = ranked.id
  and ranked.position > 1;

alter table public.lead_crm
  drop constraint if exists lead_crm_next_contact_source_check;

alter table public.lead_crm
  add constraint lead_crm_next_contact_source_check
  check (next_contact_source is null or next_contact_source = 'manual');

comment on column public.lead_crm.next_contact_source
  is 'Origin of the human-agreed commercial agenda. Only manual or NULL; protocol recommendations live in lead_contact_tasks.';

create or replace function private.keep_protocol_deadlines_out_of_manual_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.next_contact_at is null then
    new.next_contact_note := '';
    new.next_contact_source := null;
  else
    new.next_contact_source := 'manual';
    if tg_op = 'INSERT'
      or old.next_contact_at is distinct from new.next_contact_at
      or old.next_contact_note is distinct from new.next_contact_note
      or old.next_contact_source is distinct from 'manual'
    then
      perform private.cancel_lead_contact_protocol(
        new.lead_id,
        'Próxima acción manual registrada'
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_protocol_deadlines_out_of_manual_agenda() from public, anon, authenticated;

create or replace function private.sync_protocol_next_action(
  p_sequence_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.lead_contact_tasks%rowtype;
  v_due_start timestamptz;
  v_due_end timestamptz;
begin
  select task.* into v_task
  from public.lead_contact_tasks task
  join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
  where task.sequence_id = p_sequence_id
    and task.lead_id = p_lead_id
    and task.status = 'pending'
    and sequence.status = 'active'
  order by task.sequence_order
  limit 1
  for update of task;

  if v_task.id is null then
    select task.* into v_task
    from public.lead_contact_tasks task
    join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
    where task.sequence_id = p_sequence_id
      and task.lead_id = p_lead_id
      and task.status = 'scheduled'
      and sequence.status = 'active'
    order by task.sequence_order
    limit 1
    for update of task;

    if v_task.id is null then return null; end if;

    if v_task.channel = 'call' and v_task.due_start <= now() then
      select w.due_start, w.due_end
      into v_due_start, v_due_end
      from private.next_protocol_call_window(now()) w;
    elsif v_task.channel = 'whatsapp' and v_task.due_start <= now() then
      select w.due_start, w.due_end
      into v_due_start, v_due_end
      from private.next_protocol_whatsapp_window(now()) w;
    else
      v_due_start := v_task.due_start;
      v_due_end := v_task.due_end;
    end if;

    update public.lead_contact_tasks
    set status = 'pending',
        due_start = v_due_start,
        due_end = v_due_end,
        updated_at = now()
    where id = v_task.id
    returning * into v_task;
  end if;

  -- Deliberately do not write lead_crm.next_contact_* here. This timestamp is
  -- a recommended attempt window, not a commitment agreed with the customer.
  return v_task.id;
end;
$$;

revoke all on function private.sync_protocol_next_action(uuid, uuid) from public, anon, authenticated;

create or replace function private.create_lead_contact_sequence(
  p_lead_id uuid,
  p_seller_user_id uuid,
  p_started_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence_id uuid;
  v_cursor timestamptz := greatest(coalesce(p_started_at, now()), now());
  v_call_start timestamptz;
  v_call_end timestamptz;
  v_message_end timestamptz;
  v_call_attempt integer;
  v_message_step integer := 0;
  v_sequence_order integer := 0;
  v_status text;
  v_manual_action timestamptz;
begin
  if p_seller_user_id is null then return null; end if;

  select crm.status, crm.next_contact_at
  into v_status, v_manual_action
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  where lead.id = p_lead_id
    and lead.assigned_seller_user_id = p_seller_user_id
    and lead.closed_at is null
    and not coalesce(lead.do_not_contact, false)
  for update of lead, crm;

  if not found or v_status not in ('nuevo', 'no_contesta') or v_manual_action is not null then
    return null;
  end if;

  select id into v_sequence_id
  from public.lead_contact_sequences
  where lead_id = p_lead_id and status = 'active';
  if v_sequence_id is not null then return v_sequence_id; end if;

  insert into public.lead_contact_sequences (lead_id, seller_user_id, started_at)
  values (p_lead_id, p_seller_user_id, v_cursor)
  returning id into v_sequence_id;

  for v_call_attempt in 1..6 loop
    select w.due_start, w.due_end
    into v_call_start, v_call_end
    from private.next_protocol_call_window(v_cursor) w;

    v_sequence_order := v_sequence_order + 1;
    insert into public.lead_contact_tasks (
      sequence_id, lead_id, seller_user_id, sequence_order, channel,
      call_attempt, message_step, template_id, due_start, due_end, status
    ) values (
      v_sequence_id, p_lead_id, p_seller_user_id, v_sequence_order, 'call',
      v_call_attempt, null, null, v_call_start, v_call_end,
      case when v_call_attempt = 1 then 'pending' else 'scheduled' end
    );

    if v_call_attempt in (1, 4) then
      v_message_step := v_message_step + 1;
      v_sequence_order := v_sequence_order + 1;
      v_message_end := least(
        v_call_start + interval '2 hours',
        (((v_call_start at time zone 'America/Argentina/Buenos_Aires')::date + time '19:00')
          at time zone 'America/Argentina/Buenos_Aires')
      );
      insert into public.lead_contact_tasks (
        sequence_id, lead_id, seller_user_id, sequence_order, channel,
        call_attempt, message_step, template_id, due_start, due_end, status
      ) values (
        v_sequence_id, p_lead_id, p_seller_user_id, v_sequence_order, 'whatsapp',
        null, v_message_step,
        (select id from public.contact_message_templates where step_number = v_message_step),
        v_call_start, greatest(v_call_start + interval '1 minute', v_message_end), 'scheduled'
      );
    end if;

    v_cursor := v_call_end + interval '1 second';
  end loop;

  return v_sequence_id;
end;
$$;

revoke all on function private.create_lead_contact_sequence(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.restart_lead_contact_sequence(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_seller uuid;
  v_status text;
  v_next_contact_at timestamptz;
  v_do_not_contact boolean;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select lead.assigned_seller_user_id, crm.status, crm.next_contact_at, coalesce(lead.do_not_contact, false)
  into v_seller, v_status, v_next_contact_at, v_do_not_contact
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  where lead.id = p_lead_id
  for update of lead, crm;

  if not found or v_seller is null then raise exception 'El lead todavía no tiene vendedor'; end if;
  if v_seller <> v_user_id and not private.current_user_is_management() then raise exception 'Acceso no autorizado'; end if;
  if v_do_not_contact or v_status not in ('nuevo', 'no_contesta') then
    raise exception 'El protocolo solo puede reiniciarse para Leads Nuevo o No contesta';
  end if;
  if v_next_contact_at is not null then
    raise exception 'El Lead tiene una próxima acción manual; no se puede reiniciar el protocolo';
  end if;

  perform private.cancel_lead_contact_protocol(p_lead_id, 'Secuencia recomendada reiniciada');
  return private.create_lead_contact_sequence(p_lead_id, v_seller, now());
end;
$$;

revoke all on function public.restart_lead_contact_sequence(uuid) from public, anon;
grant execute on function public.restart_lead_contact_sequence(uuid) to authenticated;

comment on function public.restart_lead_contact_sequence(uuid)
  is 'Reinicia solo las recomendaciones del protocolo para un Lead Nuevo/No contesta sin agenda manual.';

create or replace function private.sync_contact_sequence_with_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
begin
  if new.status not in ('nuevo', 'no_contesta') then
    perform private.cancel_lead_contact_protocol(new.lead_id, 'Cambio de estado a ' || new.status);
  elsif old.status not in ('nuevo', 'no_contesta')
    and new.status in ('nuevo', 'no_contesta')
    and new.next_contact_at is null
  then
    select assigned_seller_user_id into v_seller
    from public.leads
    where id = new.lead_id;
    if v_seller is not null then
      perform private.create_lead_contact_sequence(new.lead_id, v_seller, now());
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_contact_sequence_with_status() from public, anon, authenticated;

create or replace function private.start_contact_sequence_after_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_seller_user_id is not null
    and (tg_op = 'INSERT' or old.assigned_seller_user_id is distinct from new.assigned_seller_user_id)
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.cancel_lead_contact_protocol(new.id, 'Lead reasignado a otro vendedor');
    -- The creator itself enforces Nuevo/No contesta and absence of a manual
    -- commitment, so reassignment never overwrites the seller's real agenda.
    perform private.create_lead_contact_sequence(
      new.id,
      new.assigned_seller_user_id,
      greatest(coalesce(new.assigned_at, now()), now())
    );
  end if;
  return new;
end;
$$;

revoke all on function private.start_contact_sequence_after_assignment() from public, anon, authenticated;

-- Keep the complete-history definition of Sin primer contacto, while exposing
-- the pending protocol task independently from lead_crm.
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
      and task.status in ('completed', 'skipped')
      and task.completed_at is not null
  ) completed_task on true
  where lead.assigned_seller_user_id is not null;
$$;

comment on function public.get_supervisor_portfolio_followup()
  is 'Supervisor portfolio: manual agenda in lead_crm and independent advisory protocol context, preserving complete-history first-contact classification.';

revoke all on function public.get_supervisor_portfolio_followup() from public, anon;
grant execute on function public.get_supervisor_portfolio_followup() to authenticated;

notify pgrst, 'reload schema';
