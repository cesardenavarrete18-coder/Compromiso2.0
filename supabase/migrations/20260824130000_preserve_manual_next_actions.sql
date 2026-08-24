-- Keep manually agreed contacts in lead_crm while automated protocol windows
-- remain exclusively in lead_contact_tasks.

alter table public.lead_crm
  add column next_contact_source text;

alter table public.lead_crm
  add constraint lead_crm_next_contact_source_check
  check (next_contact_source is null or next_contact_source = 'manual');

-- Automated deadlines were already removed in the previous migration, so any
-- contact currently present in the agenda was entered manually.
update public.lead_crm
set next_contact_source = 'manual'
where next_contact_at is not null;

comment on column public.lead_crm.next_contact_source
  is 'Identifies manually agreed contacts; protocol deadlines live only in lead_contact_tasks.';

create or replace function private.keep_protocol_deadlines_out_of_manual_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Public management RPCs mark the exact values chosen by the seller. Exact
  -- matching prevents a nested protocol update in the same transaction from
  -- inheriting the manual bypass.
  if current_setting('grupo_sur.manual_lead_id', true) = new.lead_id::text
    and current_setting('grupo_sur.manual_next_contact_at', true) = coalesce(new.next_contact_at::text, '')
    and current_setting('grupo_sur.manual_next_contact_note', true) = coalesce(new.next_contact_note, '')
  then
    new.next_contact_source := case when new.next_contact_at is null then null else 'manual' end;
    return new;
  end if;

  -- Legacy protocol functions still propose their next task through lead_crm.
  -- Discard it only when both the label and deadline match a real task.
  if private.is_automated_contact_note(new.next_contact_note)
    and exists (
      select 1
      from public.lead_contact_tasks task
      where task.lead_id = new.lead_id
        and task.status = 'pending'
        and task.due_start = new.next_contact_at
    )
  then
    if tg_op = 'UPDATE'
      and old.next_contact_at is not null
      and old.next_contact_source = 'manual'
    then
      new.next_contact_at := old.next_contact_at;
      new.next_contact_note := old.next_contact_note;
      new.next_contact_source := old.next_contact_source;
    else
      new.next_contact_at := null;
      new.next_contact_note := '';
      new.next_contact_source := null;
    end if;
  else
    new.next_contact_source := case when new.next_contact_at is null then null else 'manual' end;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_protocol_deadlines_out_of_manual_agenda() from public, anon, authenticated;

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
  if p_priority not in ('low', 'normal', 'high') then
    raise exception 'Prioridad inválida';
  end if;
  if p_status = 'no_contesta' and p_next_contact_at is null then
    raise exception 'Programá el próximo intento de contacto';
  end if;
  if p_status = 'entrevista' and p_interview_at is null then
    raise exception 'Indicá la fecha y hora de la entrevista';
  end if;
  if p_status = 'sena' and (p_deposit_amount is null or p_deposit_amount <= 0) then
    raise exception 'Indicá el importe de la seña';
  end if;
  if p_status in ('invalido', 'desistir') and char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Indicá el motivo para este estado';
  end if;

  select status into v_previous_status from public.lead_crm where lead_id = p_lead_id for update;
  if v_previous_status is null then
    raise exception 'No se encontró la ficha CRM del lead';
  end if;

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

  -- This explicit marker prevents the protocol trigger from interpreting a
  -- seller-entered reason (for example "Llamada 2 de 3") as automation.
  perform set_config('grupo_sur.manual_lead_id', p_lead_id::text, true);
  perform set_config('grupo_sur.manual_next_contact_at', coalesce(p_next_contact_at::text, ''), true);
  perform set_config('grupo_sur.manual_next_contact_note', trim(coalesce(p_next_contact_note, '')), true);

  update public.lead_crm set
    status = p_status,
    priority = case when p_status = 'cierre' then 'high' else p_priority end,
    status_reason = case when p_status in ('invalido', 'desistir') then trim(coalesce(p_note, '')) else status_reason end,
    next_contact_at = case when p_status in ('venta', 'desistir', 'invalido') then null else p_next_contact_at end,
    next_contact_note = case when p_status in ('venta', 'desistir', 'invalido') then '' else trim(coalesce(p_next_contact_note, '')) end,
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
      'next_contact_note', trim(coalesce(p_next_contact_note, '')),
      'interview_at', p_interview_at,
      'interview_location', trim(coalesce(p_interview_location, '')),
      'deposit_amount', p_deposit_amount
    )
  );
end;
$$;

comment on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text)
  is 'Registra una gestión y conserva siempre el próximo contacto acordado manualmente.';

revoke all on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) from public, anon;
grant execute on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) to authenticated;

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
begin
  if p_outcome = 'answered' then
    if p_next_contact_at is null or p_next_contact_at <= now() then
      raise exception 'Programá una fecha y hora futura para el próximo contacto';
    end if;
    if char_length(trim(coalesce(p_next_contact_note, ''))) < 3 then
      raise exception 'Indicá el motivo del próximo contacto';
    end if;
  end if;

  v_result := public.complete_contact_task(p_task_id, p_outcome, p_note);
  v_lead_id := (v_result ->> 'lead_id')::uuid;

  if p_outcome = 'answered' then
    perform set_config('grupo_sur.manual_lead_id', v_lead_id::text, true);
    perform set_config('grupo_sur.manual_next_contact_at', p_next_contact_at::text, true);
    perform set_config('grupo_sur.manual_next_contact_note', trim(p_next_contact_note), true);

    update public.lead_crm
    set next_contact_at = p_next_contact_at,
        next_contact_note = trim(p_next_contact_note),
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

-- Recover active manual contacts erased by the old text-only classifier. The
-- latest management must itself contain a non-null future step at save time.
with latest_management as (
  select distinct on (activity.lead_id)
    activity.lead_id,
    activity.created_at,
    nullif(activity.metadata ->> 'next_contact_at', '')::timestamptz as scheduled_at
  from public.lead_activities activity
  where activity.metadata ? 'next_contact_at'
  order by activity.lead_id, activity.created_at desc
), repaired as (
  update public.lead_crm crm
  set next_contact_at = latest.scheduled_at,
      next_contact_note = 'Próximo contacto recuperado del historial',
      next_contact_source = 'manual',
      updated_at = now()
  from latest_management latest
  where crm.lead_id = latest.lead_id
    and crm.status not in ('venta', 'desistir', 'invalido')
    and crm.next_contact_at is null
    and latest.scheduled_at is not null
    and latest.scheduled_at > latest.created_at
  returning crm.lead_id, latest.scheduled_at
)
insert into public.lead_activities (
  lead_id, actor_user_id, activity_type, title, detail, metadata
)
select
  repaired.lead_id,
  null,
  'follow_up',
  'Próxima acción recuperada',
  'El sistema restauró el próximo contacto eliminado por la clasificación anterior.',
  jsonb_build_object('next_contact_at', repaired.scheduled_at, 'repair', 'manual_agenda')
from repaired;
