-- Unify manual follow-up and the automated contact protocol behind one
-- canonical next action in lead_crm. New sequences use the next six available
-- business call windows (6 calls + 2 WhatsApp), with one operational task at a time.

alter table public.lead_crm
  drop constraint if exists lead_crm_next_contact_source_check;

alter table public.lead_crm
  add constraint lead_crm_next_contact_source_check
  check (next_contact_source is null or next_contact_source in ('manual', 'protocol'));

comment on column public.lead_crm.next_contact_source
  is 'Canonical next-action origin. manual and protocol share next_contact_at/next_contact_note.';

alter table public.lead_contact_tasks
  drop constraint if exists lead_contact_tasks_status;

alter table public.lead_contact_tasks
  add constraint lead_contact_tasks_status
  check (status in ('scheduled', 'pending', 'completed', 'skipped', 'cancelled'));

alter table public.lead_contact_tasks
  drop constraint if exists lead_contact_tasks_call;

-- message_step 3/4 remains accepted for historical 3-4-1 sequences. New
-- sequences created below use only message_step 1/2 and call_attempt 1..6.
alter table public.lead_contact_tasks
  add constraint lead_contact_tasks_call check (
    (channel = 'call' and call_attempt between 1 and 6 and message_step is null)
    or (channel = 'whatsapp' and message_step between 1 and 4 and call_attempt is null)
  );

create or replace function private.next_protocol_call_window(p_after timestamptz)
returns table (due_start timestamptz, due_end timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_after timestamptz := greatest(coalesce(p_after, now()), now());
  v_local timestamp;
  v_day date;
  v_slot integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_local := v_after at time zone 'America/Argentina/Buenos_Aires';
  v_day := private.business_date(v_local::date, 0);

  if v_day <> v_local::date then
    v_slot := 1;
  elsif v_local::time < time '12:00' then
    v_slot := 1;
  elsif v_local::time < time '16:00' then
    v_slot := 2;
  elsif v_local::time < time '19:00' then
    v_slot := 3;
  else
    v_day := private.business_date(v_day, 1);
    v_slot := 1;
  end if;

  v_window_start := private.contact_window_start(v_day, v_slot);
  v_window_end := private.contact_window_end(v_day, v_slot);
  due_start := greatest(v_after, v_window_start);
  due_end := v_window_end;
  return next;
end;
$$;

create or replace function private.next_protocol_whatsapp_window(p_after timestamptz)
returns table (due_start timestamptz, due_end timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_after timestamptz := greatest(coalesce(p_after, now()), now());
  v_local timestamp;
  v_day date;
  v_end timestamptz;
begin
  v_local := v_after at time zone 'America/Argentina/Buenos_Aires';
  v_day := private.business_date(v_local::date, 0);

  if v_day <> v_local::date then
    due_start := (v_day + time '09:30') at time zone 'America/Argentina/Buenos_Aires';
  elsif v_local::time < time '09:30' then
    due_start := (v_day + time '09:30') at time zone 'America/Argentina/Buenos_Aires';
  elsif v_local::time < time '19:00' then
    due_start := v_after;
  else
    v_day := private.business_date(v_day, 1);
    due_start := (v_day + time '09:30') at time zone 'America/Argentina/Buenos_Aires';
  end if;

  v_end := (v_day + time '19:00') at time zone 'America/Argentina/Buenos_Aires';
  due_end := least(due_start + interval '2 hours', v_end);
  return next;
end;
$$;

create or replace function private.protocol_task_label(
  p_sequence_id uuid,
  p_channel text,
  p_call_attempt integer,
  p_message_step integer
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_channel = 'call' then 'Llamada ' || p_call_attempt || ' de ' || coalesce((
      select max(task.call_attempt)
      from public.lead_contact_tasks task
      where task.sequence_id = p_sequence_id and task.channel = 'call'
    ), p_call_attempt)
    when p_channel = 'whatsapp' then 'WhatsApp ' || p_message_step || ' de ' || coalesce((
      select max(task.message_step)
      from public.lead_contact_tasks task
      where task.sequence_id = p_sequence_id and task.channel = 'whatsapp'
    ), p_message_step)
    else 'Tarea de seguimiento'
  end;
$$;

create or replace function private.cancel_lead_contact_protocol(
  p_lead_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lead_contact_sequences
  set status = 'cancelled',
      completed_at = coalesce(completed_at, now()),
      stopped_reason = left(coalesce(nullif(trim(p_reason), ''), 'Seguimiento reemplazado'), 1000),
      updated_at = now()
  where lead_id = p_lead_id
    and status = 'active';

  update public.lead_contact_tasks
  set status = 'cancelled',
      updated_at = now()
  where lead_id = p_lead_id
    and status in ('pending', 'scheduled');
end;
$$;

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
  select * into v_task
  from public.lead_contact_tasks task
  where task.sequence_id = p_sequence_id
    and task.lead_id = p_lead_id
    and task.status = 'pending'
  order by task.sequence_order
  limit 1
  for update;

  if v_task.id is null then
    select * into v_task
    from public.lead_contact_tasks task
    where task.sequence_id = p_sequence_id
      and task.lead_id = p_lead_id
      and task.status = 'scheduled'
    order by task.sequence_order
    limit 1
    for update;

    if v_task.id is null then
      return null;
    end if;

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

  update public.lead_crm
  set next_contact_at = v_task.due_start,
      next_contact_note = private.protocol_task_label(v_task.sequence_id, v_task.channel, v_task.call_attempt, v_task.message_step),
      next_contact_source = 'protocol',
      updated_at = now()
  where lead_id = p_lead_id;

  return v_task.id;
end;
$$;

revoke all on function private.next_protocol_call_window(timestamptz) from public, anon, authenticated;
revoke all on function private.next_protocol_whatsapp_window(timestamptz) from public, anon, authenticated;
revoke all on function private.protocol_task_label(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function private.cancel_lead_contact_protocol(uuid, text) from public, anon, authenticated;
revoke all on function private.sync_protocol_next_action(uuid, uuid) from public, anon, authenticated;

create or replace function private.keep_protocol_deadlines_out_of_manual_agenda()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.next_contact_at is null then
    new.next_contact_note := '';
    new.next_contact_source := null;
  elsif new.next_contact_source not in ('manual', 'protocol') or new.next_contact_source is null then
    new.next_contact_source := case when exists (
      select 1
      from public.lead_contact_tasks task
      where task.lead_id = new.lead_id
        and task.status = 'pending'
        and task.due_start = new.next_contact_at
    ) then 'protocol' else 'manual' end;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_protocol_deadlines_out_of_manual_agenda() from public, anon, authenticated;

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
begin
  if p_seller_user_id is null then return null; end if;
  if exists (select 1 from public.leads where id = p_lead_id and do_not_contact) then return null; end if;
  if exists (
    select 1 from public.lead_crm
    where lead_id = p_lead_id and status in ('venta', 'desistir', 'invalido')
  ) then return null; end if;

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

  insert into public.lead_crm (
    lead_id, priority, next_contact_at, next_contact_note, next_contact_source
  )
  select
    p_lead_id,
    priority,
    first_task.due_start,
    private.protocol_task_label(first_task.sequence_id, first_task.channel, first_task.call_attempt, first_task.message_step),
    'protocol'
  from public.leads lead
  cross join lateral (
    select task.*
    from public.lead_contact_tasks task
    where task.sequence_id = v_sequence_id and task.status = 'pending'
    order by task.sequence_order
    limit 1
  ) first_task
  where lead.id = p_lead_id
  on conflict (lead_id) do update set
    next_contact_at = excluded.next_contact_at,
    next_contact_note = excluded.next_contact_note,
    next_contact_source = 'protocol',
    updated_at = now();

  return v_sequence_id;
end;
$$;

revoke all on function private.create_lead_contact_sequence(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Bring the legacy restart RPC into the canonical task model. A restart is
-- serialized on the Lead, retires every operational task from the prior
-- sequence, clears its canonical agenda and creates exactly one fresh sequence.
create or replace function public.restart_lead_contact_sequence(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_seller uuid;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select assigned_seller_user_id
  into v_seller
  from public.leads
  where id = p_lead_id
  for update;

  if v_seller is null then
    raise exception 'El lead todavía no tiene vendedor';
  end if;
  if v_seller <> v_user_id and not private.current_user_is_management() then
    raise exception 'Acceso no autorizado';
  end if;

  perform private.cancel_lead_contact_protocol(p_lead_id, 'Secuencia reiniciada');

  update public.lead_crm
  set status = 'nuevo',
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      updated_by = v_user_id,
      updated_at = now()
  where lead_id = p_lead_id;

  return private.create_lead_contact_sequence(p_lead_id, v_seller, now());
end;
$$;

revoke all on function public.restart_lead_contact_sequence(uuid) from public, anon;
grant execute on function public.restart_lead_contact_sequence(uuid) to authenticated;

-- Legacy reconciliation. It preserves completed history and never creates or
-- restarts a sequence. Manual actions win; later management without a new action
-- leaves the Lead unscheduled; only genuinely active legacy protocols retain one
-- current pending step.
update public.lead_contact_tasks task
set status = 'cancelled', updated_at = now()
from public.lead_contact_sequences sequence
where task.sequence_id = sequence.id
  and task.status = 'pending'
  and sequence.status <> 'active';

with sequence_state as (
  select
    sequence.id,
    coalesce(crm.status, 'nuevo') as crm_status,
    lead.do_not_contact,
    crm.next_contact_source,
    crm.next_contact_at,
    (
      select max(activity.created_at)
      from public.lead_activities activity
      where activity.lead_id = lead.id
        and activity.actor_user_id is not null
        and activity.activity_type not in ('comment', 'assignment', 'manual_creation')
    ) as latest_management_at,
    (
      select min(task.due_start)
      from public.lead_contact_tasks task
      where task.sequence_id = sequence.id and task.status = 'pending'
    ) as earliest_pending_at
  from public.lead_contact_sequences sequence
  join public.leads lead on lead.id = sequence.lead_id
  left join public.lead_crm crm on crm.lead_id = lead.id
  where sequence.status = 'active'
), to_cancel as (
  select *
  from sequence_state
  where crm_status in ('venta', 'desistir', 'invalido')
    or do_not_contact
    or (next_contact_source = 'manual' and next_contact_at is not null)
    or (next_contact_at is null and latest_management_at > earliest_pending_at)
)
update public.lead_contact_sequences sequence
set status = 'cancelled',
    completed_at = coalesce(sequence.completed_at, now()),
    stopped_reason = case
      when state.crm_status in ('venta', 'desistir', 'invalido') or state.do_not_contact
        then 'Reconciliación: Lead terminal o no contactar'
      when state.next_contact_source = 'manual' and state.next_contact_at is not null
        then 'Reconciliación: seguimiento manual vigente'
      else 'Reconciliación: gestión posterior sin próxima acción'
    end,
    updated_at = now()
from to_cancel state
where sequence.id = state.id;

update public.lead_contact_tasks task
set status = 'cancelled', updated_at = now()
from public.lead_contact_sequences sequence
where task.sequence_id = sequence.id
  and task.status = 'pending'
  and sequence.status = 'cancelled';

update public.lead_crm crm
set next_contact_at = null,
    next_contact_note = '',
    next_contact_source = null,
    updated_at = now()
from public.leads lead
where crm.lead_id = lead.id
  and (crm.status in ('venta', 'desistir', 'invalido') or lead.do_not_contact);

with ranked as (
  select
    task.id,
    row_number() over (
      partition by task.lead_id
      order by task.sequence_order, task.due_start, task.id
    ) as position
  from public.lead_contact_tasks task
  join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
  where task.status = 'pending' and sequence.status = 'active'
)
update public.lead_contact_tasks task
set status = 'scheduled', updated_at = now()
from ranked
where task.id = ranked.id and ranked.position > 1;

with current_task as (
  select distinct on (task.lead_id)
    task.lead_id,
    task.sequence_id,
    task.due_start,
    task.channel,
    task.call_attempt,
    task.message_step
  from public.lead_contact_tasks task
  join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
  where task.status = 'pending' and sequence.status = 'active'
  order by task.lead_id, task.sequence_order, task.due_start, task.id
)
update public.lead_crm crm
set next_contact_at = current_task.due_start,
    next_contact_note = private.protocol_task_label(
      current_task.sequence_id, current_task.channel, current_task.call_attempt, current_task.message_step
    ),
    next_contact_source = 'protocol',
    updated_at = now()
from current_task
where crm.lead_id = current_task.lead_id
  and not (crm.next_contact_source = 'manual' and crm.next_contact_at is not null);

create unique index if not exists lead_contact_tasks_one_pending_per_lead_idx
  on public.lead_contact_tasks (lead_id)
  where status = 'pending';

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
    if new.next_contact_source = 'protocol' then
      update public.lead_crm
      set next_contact_at = null, next_contact_note = '', next_contact_source = null, updated_at = now()
      where lead_id = new.lead_id;
    end if;
  elsif old.status not in ('nuevo', 'no_contesta')
    and new.status in ('nuevo', 'no_contesta')
    and new.next_contact_at is null
  then
    select assigned_seller_user_id into v_seller from public.leads where id = new.lead_id;
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

create or replace function public.record_lead_follow_up(
  p_lead_id uuid,
  p_status text,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default '',
  p_contact_outcome text default '',
  p_interview_at timestamptz default null,
  p_interview_location text default '',
  p_deposit_amount numeric default null,
  p_priority text default 'normal'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_management boolean;
  v_previous_status text;
  v_activity_type text := 'status_change';
  v_title text;
  v_next_note text := left(
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Próximo contacto programado'),
    1000
  );
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  v_is_management := private.current_user_is_management();
  if not v_is_management and not exists (
    select 1 from public.leads
    where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then
    raise exception 'El lead no está asignado a este vendedor';
  end if;

  if p_status = 'nuevo' then
    raise exception 'Nuevo es un estado de ingreso. Seleccioná el resultado de la gestión';
  end if;
  if p_status is null or p_status not in ('no_contesta', 'en_proceso', 'invalido', 'entrevista', 'cierre', 'sena', 'desistir') then
    raise exception 'Estado comercial inválido';
  end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'Prioridad inválida'; end if;
  if char_length(trim(coalesce(p_note, ''))) > 3000 then raise exception 'El detalle es demasiado extenso'; end if;
  if p_status = 'no_contesta' and p_next_contact_at is null then
    raise exception 'Programá el próximo intento de contacto';
  end if;
  if p_next_contact_at is not null and p_next_contact_at <= now() then
    raise exception 'El próximo contacto debe quedar programado a futuro';
  end if;
  if p_status = 'entrevista' and p_interview_at is null then raise exception 'Indicá la fecha y hora de la entrevista'; end if;
  if p_status = 'sena' and (p_deposit_amount is null or p_deposit_amount <= 0) then raise exception 'Indicá el importe de la seña'; end if;
  if p_status in ('invalido', 'desistir') and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Indicá el motivo para este estado'; end if;

  select status into v_previous_status
  from public.lead_crm
  where lead_id = p_lead_id
  for update;
  if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;

  if p_status = 'entrevista' then v_activity_type := 'interview'; end if;
  if p_status = 'no_contesta' or p_next_contact_at is not null then v_activity_type := 'follow_up'; end if;
  if p_status in ('en_proceso', 'invalido') then v_activity_type := 'contact'; end if;
  v_title := case p_status
    when 'no_contesta' then 'El cliente no respondió'
    when 'en_proceso' then 'Contacto en proceso'
    when 'invalido' then 'Contacto inválido o erróneo'
    when 'entrevista' then 'Entrevista programada'
    when 'cierre' then 'Oportunidad en cierre'
    when 'sena' then 'Seña registrada'
    when 'desistir' then 'Lead enviado a base fría'
  end;

  perform private.cancel_lead_contact_protocol(p_lead_id, 'Gestión manual registrada');

  update public.lead_crm set
    status = p_status,
    priority = case when p_status = 'cierre' then 'high' else p_priority end,
    status_reason = case when p_status in ('invalido', 'desistir') then trim(coalesce(p_note, '')) else status_reason end,
    next_contact_at = case when p_status in ('desistir', 'invalido') then null else p_next_contact_at end,
    next_contact_note = case when p_status in ('desistir', 'invalido') or p_next_contact_at is null then '' else v_next_note end,
    next_contact_source = case when p_status in ('desistir', 'invalido') or p_next_contact_at is null then null else 'manual' end,
    last_contact_at = now(),
    last_contact_outcome = trim(coalesce(p_contact_outcome, '')),
    interview_at = coalesce(p_interview_at, interview_at),
    interview_location = case when p_interview_at is not null then trim(coalesce(p_interview_location, '')) else interview_location end,
    deposit_amount = coalesce(p_deposit_amount, deposit_amount),
    deposit_at = case when p_status = 'sena' then now() else deposit_at end,
    cold_base_at = case when p_status = 'desistir' then now() else null end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    p_lead_id,
    v_user_id,
    v_activity_type,
    v_title,
    trim(coalesce(p_note, '')),
    jsonb_build_object(
      'previous_status', v_previous_status,
      'status', p_status,
      'next_contact_at', p_next_contact_at,
      'next_contact_note', case when p_next_contact_at is null then null else v_next_note end,
      'next_contact_source', case when p_next_contact_at is null then null else 'manual' end,
      'interview_at', p_interview_at,
      'interview_location', trim(coalesce(p_interview_location, '')),
      'deposit_amount', p_deposit_amount
    )
  );
end;
$$;

comment on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text)
  is 'Registra una gestión, reemplaza el protocolo y usa el comentario como nota de la próxima acción manual.';

revoke all on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) from public, anon;
grant execute on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) to authenticated;

create or replace function public.complete_contact_task(
  p_task_id uuid,
  p_outcome text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_task public.lead_contact_tasks%rowtype;
  v_next public.lead_contact_tasks%rowtype;
  v_next_task_id uuid;
  v_customer_id uuid;
  v_sequence_finished boolean := false;
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  if p_outcome not in ('no_answer', 'answered', 'sent', 'skipped', 'invalid', 'no_interest', 'requested_no_contact') then
    raise exception 'Resultado de contacto inválido';
  end if;
  if char_length(trim(coalesce(p_note, ''))) > 3000 then raise exception 'El detalle es demasiado extenso'; end if;

  select * into v_task
  from public.lead_contact_tasks
  where id = p_task_id
  for update;
  if v_task.id is null or v_task.status <> 'pending' then raise exception 'La tarea ya fue procesada o no existe'; end if;
  if v_task.seller_user_id <> v_user_id and not private.current_user_is_management() then raise exception 'La tarea no corresponde a este vendedor'; end if;
  if v_task.channel = 'call' and p_outcome = 'sent' then raise exception 'Resultado incompatible con una llamada'; end if;
  if v_task.channel = 'whatsapp' and p_outcome = 'no_answer' then raise exception 'Resultado incompatible con WhatsApp'; end if;

  update public.lead_contact_tasks set
    status = case when p_outcome = 'skipped' then 'skipped' else 'completed' end,
    outcome = p_outcome,
    note = trim(coalesce(p_note, '')),
    completed_at = now(),
    completed_by = v_user_id,
    updated_at = now()
  where id = p_task_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    v_task.lead_id,
    v_user_id,
    case when v_task.channel = 'call' then 'contact' else 'follow_up' end,
    case when v_task.channel = 'call'
      then 'Intento de llamada ' || v_task.call_attempt || ' registrado'
      else 'WhatsApp de seguimiento ' || v_task.message_step || ' registrado'
    end,
    trim(coalesce(p_note, '')),
    jsonb_build_object(
      'task_id', v_task.id,
      'channel', v_task.channel,
      'outcome', p_outcome,
      'call_attempt', v_task.call_attempt,
      'message_step', v_task.message_step
    )
  );

  if p_outcome in ('answered', 'invalid', 'no_interest', 'requested_no_contact') then
    perform private.cancel_lead_contact_protocol(v_task.lead_id, case p_outcome
      when 'answered' then 'El cliente respondió'
      when 'invalid' then 'Contacto inválido'
      when 'requested_no_contact' then 'Solicitó no ser contactado'
      else 'El cliente no desea continuar'
    end);

    update public.lead_crm set
      status = case when p_outcome = 'answered' then 'en_proceso' when p_outcome = 'invalid' then 'invalido' else 'desistir' end,
      status_reason = case when p_outcome = 'answered' then status_reason else coalesce(nullif(trim(p_note), ''),
        case when p_outcome = 'invalid' then 'Contacto inválido' when p_outcome = 'requested_no_contact' then 'Solicitó no ser contactado' else 'No desea continuar' end) end,
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      last_contact_at = now(),
      last_contact_outcome = p_outcome,
      cold_base_at = case when p_outcome in ('no_interest', 'requested_no_contact') then now() else cold_base_at end,
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = v_task.lead_id;

    if p_outcome = 'requested_no_contact' then
      select customer_id into v_customer_id from public.leads where id = v_task.lead_id;
      update public.leads set do_not_contact = true, do_not_contact_at = now(),
        do_not_contact_reason = coalesce(nullif(trim(p_note), ''), 'Solicitud individual')
      where customer_id = v_customer_id;
      update public.customers set do_not_contact = true, do_not_contact_at = now(),
        do_not_contact_reason = coalesce(nullif(trim(p_note), ''), 'Solicitud individual')
      where id = v_customer_id;
    end if;
  else
    v_next_task_id := private.sync_protocol_next_action(v_task.sequence_id, v_task.lead_id);
    if v_next_task_id is null then
      v_sequence_finished := true;
      update public.lead_contact_sequences set
        status = 'completed',
        completed_at = now(),
        stopped_reason = 'Protocolo 6 llamadas + 2 WhatsApp completado sin respuesta',
        updated_at = now()
      where id = v_task.sequence_id;
      update public.lead_crm set
        status = case when status in ('nuevo', 'no_contesta') then 'desistir' else status end,
        status_reason = case when status in ('nuevo', 'no_contesta') then 'Protocolo completado sin respuesta' else status_reason end,
        next_contact_at = null,
        next_contact_note = '',
        next_contact_source = null,
        cold_base_at = case when status in ('nuevo', 'no_contesta') then now() else cold_base_at end,
        updated_by = v_user_id,
        updated_at = now()
      where lead_id = v_task.lead_id;
    else
      select * into v_next from public.lead_contact_tasks where id = v_next_task_id;
      update public.lead_crm set
        status = case when p_outcome = 'no_answer' and status = 'nuevo' then 'no_contesta' else status end,
        last_contact_at = now(),
        last_contact_outcome = p_outcome,
        updated_by = v_user_id,
        updated_at = now()
      where lead_id = v_task.lead_id;
    end if;
  end if;

  return jsonb_build_object(
    'lead_id', v_task.lead_id,
    'sequence_finished', v_sequence_finished,
    'next_task_id', v_next.id,
    'next_due_at', v_next.due_start
  );
end;
$$;

revoke all on function public.complete_contact_task(uuid, text, text) from public, anon;
grant execute on function public.complete_contact_task(uuid, text, text) to authenticated;

create or replace function public.complete_contact_task_with_follow_up(
  p_task_id uuid,
  p_outcome text,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_lead_id uuid;
  v_next_note text := left(coalesce(
    nullif(trim(coalesce(p_next_contact_note, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    'Próximo contacto programado'
  ), 1000);
begin
  if p_outcome = 'answered' and (p_next_contact_at is null or p_next_contact_at <= now()) then
    raise exception 'Programá una fecha y hora futura para el próximo contacto';
  end if;

  v_result := public.complete_contact_task(p_task_id, p_outcome, p_note);
  v_lead_id := (v_result ->> 'lead_id')::uuid;

  if p_outcome = 'answered' then
    update public.lead_crm
    set next_contact_at = p_next_contact_at,
        next_contact_note = v_next_note,
        next_contact_source = 'manual',
        updated_at = now()
    where lead_id = v_lead_id;

    v_result := v_result || jsonb_build_object(
      'next_due_at', p_next_contact_at,
      'manual_follow_up', true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.complete_contact_task_with_follow_up(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.complete_contact_task_with_follow_up(uuid, text, text, timestamptz, text) to authenticated;

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
  v_next_note text := left(coalesce(
    nullif(trim(coalesce(p_next_contact_note, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    'Próximo contacto programado'
  ), 1000);
begin
  if v_user_id is null or not private.current_user_is_management() then raise exception 'Se requiere permiso de supervisión'; end if;
  if p_action not in ('schedule', 'status', 'management') then raise exception 'Acción de supervisión inválida'; end if;
  if not exists (select 1 from public.leads where id = p_lead_id and assigned_seller_user_id is not null) then raise exception 'No se encontró un Lead asignado'; end if;

  select * into v_crm from public.lead_crm where lead_id = p_lead_id for update;
  if not found then raise exception 'No se encontró la ficha CRM del Lead'; end if;
  if v_crm.status in ('venta', 'desistir', 'invalido') then raise exception 'El Lead ya no se encuentra activo'; end if;

  if p_action = 'schedule' then
    if p_next_contact_at is null or p_next_contact_at <= now() then raise exception 'Programá una fecha y hora futura'; end if;
    if char_length(trim(coalesce(p_next_contact_note, ''))) < 3 or char_length(trim(p_next_contact_note)) > 1000 then raise exception 'Indicá el motivo de la próxima acción'; end if;
    v_was_scheduled := v_crm.next_contact_at is not null;
    perform private.cancel_lead_contact_protocol(p_lead_id, 'Próxima acción manual programada por Supervisión');
    update public.lead_crm set
      next_contact_at = p_next_contact_at,
      next_contact_note = trim(p_next_contact_note),
      next_contact_source = 'manual',
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = p_lead_id;
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (p_lead_id, v_user_id, 'follow_up',
      case when v_was_scheduled then 'Próxima acción reprogramada' else 'Próxima acción programada' end,
      trim(p_next_contact_note),
      jsonb_build_object('origin', 'supervisor_portfolio', 'previous_next_contact_at', v_crm.next_contact_at,
        'next_contact_at', p_next_contact_at, 'next_contact_note', trim(p_next_contact_note), 'next_contact_source', 'manual'));
    return;
  end if;

  if p_action = 'status' then
    if p_status is null or p_status not in ('no_contesta', 'en_proceso', 'invalido', 'entrevista', 'cierre', 'sena', 'desistir') then raise exception 'Estado comercial inválido'; end if;
    if p_priority is null or p_priority not in ('low', 'normal', 'high') then raise exception 'Prioridad inválida'; end if;
    if char_length(trim(coalesce(p_note, ''))) > 2000 then raise exception 'La observación es demasiado extensa'; end if;
    if p_status = 'no_contesta' and v_crm.next_contact_at is null then raise exception 'Programá la próxima acción antes de marcar No contesta'; end if;
    if p_status = 'entrevista' and v_crm.interview_at is null then raise exception 'La Entrevista debe programarse previamente desde la gestión comercial'; end if;
    if p_status = 'sena' and coalesce(v_crm.deposit_amount, 0) <= 0 then raise exception 'La Seña requiere un importe registrado en la gestión comercial'; end if;
    if p_status in ('invalido', 'desistir') and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Indicá el motivo del cambio de estado'; end if;
    v_previous_status := v_crm.status;
    if p_status in ('invalido', 'desistir') then perform private.cancel_lead_contact_protocol(p_lead_id, 'Lead terminal por Supervisión'); end if;
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
    values (p_lead_id, v_user_id, 'status_change', 'Estado actualizado por Supervisión', trim(coalesce(p_note, '')),
      jsonb_build_object('origin', 'supervisor_portfolio', 'previous_status', v_previous_status, 'status', p_status, 'priority', p_priority));
    return;
  end if;

  if p_contact_outcome not in ('answered', 'no_answer', 'sent') then raise exception 'Resultado de gestión inválido'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 2 or char_length(trim(p_note)) > 3000 then raise exception 'Describí la gestión realizada'; end if;
  if p_next_contact_at is not null and p_next_contact_at <= now() then raise exception 'La próxima acción debe ser futura'; end if;

  perform private.cancel_lead_contact_protocol(p_lead_id, 'Gestión manual registrada por Supervisión');
  update public.lead_crm set
    status = case when p_contact_outcome = 'answered' and status in ('nuevo', 'no_contesta') then 'en_proceso' else status end,
    last_contact_at = now(),
    last_contact_outcome = p_contact_outcome,
    next_contact_at = p_next_contact_at,
    next_contact_note = case when p_next_contact_at is null then '' else v_next_note end,
    next_contact_source = case when p_next_contact_at is null then null else 'manual' end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;
  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (p_lead_id, v_user_id, case when p_contact_outcome = 'sent' then 'follow_up' else 'contact' end,
    case p_contact_outcome when 'answered' then 'Contacto efectivo registrado por Supervisión'
      when 'no_answer' then 'Intento sin respuesta registrado por Supervisión'
      else 'WhatsApp registrado por Supervisión' end,
    trim(p_note), jsonb_build_object('origin', 'supervisor_portfolio', 'outcome', p_contact_outcome,
      'next_contact_at', p_next_contact_at, 'next_contact_note', case when p_next_contact_at is null then null else v_next_note end,
      'next_contact_source', case when p_next_contact_at is null then null else 'manual' end));
end;
$$;

revoke all on function public.supervisor_manage_lead(uuid, text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.supervisor_manage_lead(uuid, text, text, text, text, timestamptz, text, text) to authenticated;

drop function if exists private.protocol_task_label(text, integer, integer);

notify pgrst, 'reload schema';
