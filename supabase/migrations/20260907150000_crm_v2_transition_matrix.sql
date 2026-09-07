-- CRM V2: taxonomía y matriz canónica de transiciones.

alter table public.lead_crm drop constraint if exists lead_crm_status;
alter table public.lead_crm add constraint lead_crm_status check (status in (
  'nuevo', 'no_contesta', 'contacto_futuro', 'en_proceso', 'invalido',
  'entrevista', 'cierre', 'sena', 'venta', 'desistir'
));

alter table public.lead_contact_tasks
  add column if not exists performed_at timestamptz,
  add column if not exists recorded_at timestamptz;

create or replace function private.crm_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'nuevo' then p_to in ('contacto_futuro','en_proceso','entrevista','cierre','sena','venta','desistir','no_contesta','invalido')
    when 'no_contesta' then p_to in ('contacto_futuro','en_proceso','entrevista','cierre','sena','venta','desistir','no_contesta','invalido')
    when 'contacto_futuro' then p_to in ('contacto_futuro','no_contesta','en_proceso','entrevista','cierre','sena','venta','desistir')
    when 'en_proceso' then p_to in ('en_proceso','entrevista','cierre','sena','venta','desistir')
    when 'entrevista' then p_to in ('en_proceso','entrevista','cierre','sena','venta','desistir')
    when 'cierre' then p_to in ('cierre','entrevista','en_proceso','sena','venta','desistir')
    when 'sena' then p_to in ('sena','venta','desistir')
    when 'venta' then p_to = 'venta'
    else false
  end;
$$;

revoke all on function private.crm_transition_allowed(text, text) from public, anon, authenticated;

-- Transfers and authorized reactivations are explicit new-cycle operations.
-- They deliberately bypass the commercial transition matrix while preserving
-- the previous cycle as an immutable activity snapshot.
create or replace function private.start_lead_crm_cycle(
  p_lead_id uuid,
  p_actor_user_id uuid,
  p_origin text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.lead_crm%rowtype;
  v_seller uuid;
begin
  select * into v_previous
  from public.lead_crm
  where lead_id = p_lead_id
  for update;
  if not found then raise exception 'No se encontró la ficha CRM del Lead'; end if;

  select assigned_seller_user_id into v_seller
  from public.leads
  where id = p_lead_id;
  if v_seller is null then raise exception 'El Lead todavía no tiene vendedor'; end if;

  perform private.cancel_lead_contact_protocol(p_lead_id, 'Inicio de nuevo ciclo: ' || p_origin);

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    p_lead_id,
    p_actor_user_id,
    'assignment',
    'Nuevo ciclo comercial iniciado',
    left(trim(coalesce(p_reason, 'Nuevo ciclo autorizado')), 5000),
    jsonb_build_object(
      'origin', p_origin,
      'previous_status', v_previous.status,
      'previous_priority', v_previous.priority,
      'previous_status_reason', v_previous.status_reason,
      'previous_next_contact_at', v_previous.next_contact_at,
      'previous_next_contact_note', v_previous.next_contact_note,
      'previous_last_contact_at', v_previous.last_contact_at,
      'previous_last_contact_outcome', v_previous.last_contact_outcome,
      'previous_interview_at', v_previous.interview_at,
      'previous_deposit_amount', v_previous.deposit_amount,
      'previous_deposit_at', v_previous.deposit_at
    )
  );

  update public.lead_crm set
    status = 'nuevo',
    priority = 'normal',
    status_reason = '',
    next_contact_at = null,
    next_contact_note = '',
    next_contact_source = null,
    last_contact_at = null,
    last_contact_outcome = '',
    interview_at = null,
    interview_location = '',
    deposit_amount = null,
    deposit_at = null,
    cold_base_at = null,
    updated_by = p_actor_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  -- A status change into Nuevo starts the protocol through the canonical CRM
  -- trigger. If the Lead was already Nuevo, start it explicitly instead.
  if v_previous.status = 'nuevo' then
    perform private.create_lead_contact_sequence(p_lead_id, v_seller, now());
  end if;
end;
$$;

revoke all on function private.start_lead_crm_cycle(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function private.start_contact_sequence_after_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_seller_user_id is not null
    and tg_op = 'INSERT'
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id) then
    perform private.create_lead_contact_sequence(new.id, new.assigned_seller_user_id, greatest(coalesce(new.assigned_at, now()), now()));
  elsif new.assigned_seller_user_id is not null
    and old.assigned_seller_user_id is distinct from new.assigned_seller_user_id
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id) then
    perform private.start_lead_crm_cycle(
      new.id,
      coalesce(new.assigned_by_user_id, new.assigned_seller_user_id),
      case when new.routing_reason = 'authorized_reactivation' then 'reactivation' when old.assigned_seller_user_id is null then 'assignment' else 'transfer' end,
      case when new.routing_reason = 'authorized_reactivation' then 'Lead reactivado con autorización' when old.assigned_seller_user_id is null then 'Lead asignado' else 'Lead transferido a otro vendedor' end
    );
  end if;
  return new;
end;
$$;

revoke all on function private.start_contact_sequence_after_assignment() from public, anon, authenticated;

create or replace function public.reactivate_lead_cycle(
  p_lead_id uuid,
  p_seller_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_previous_seller uuid;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'Indicá un motivo válido para la reactivación';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = p_seller_user_id and role::text = 'seller' and active = true
  ) then raise exception 'El vendedor seleccionado no está activo'; end if;
  if exists (select 1 from public.sales_cases where lead_id = p_lead_id) then
    raise exception 'Una Venta no puede reactivarse como oportunidad nueva';
  end if;

  select assigned_seller_user_id into v_previous_seller
  from public.leads where id = p_lead_id for update;
  if not found then raise exception 'No se encontró el Lead'; end if;

  update public.leads set
    assigned_seller_user_id = p_seller_user_id,
    assigned_by_user_id = v_user_id,
    assigned_at = now(),
    routing_status = 'assigned_manual',
    routing_reason = 'authorized_reactivation',
    closed_at = null
  where id = p_lead_id;

  insert into public.lead_assignments (lead_id, seller_user_id, assigned_by_user_id, assignment_type, reason)
  values (p_lead_id, p_seller_user_id, v_user_id, 'reassigned', v_reason);

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (p_lead_id, v_user_id, 'assignment', 'Reactivación autorizada', v_reason,
    jsonb_build_object('origin', 'reactivation', 'previous_seller_user_id', v_previous_seller, 'seller_user_id', p_seller_user_id));

  if v_previous_seller is not distinct from p_seller_user_id then
    perform private.start_lead_crm_cycle(p_lead_id, v_user_id, 'reactivation', v_reason);
  end if;
end;
$$;

revoke all on function public.reactivate_lead_cycle(uuid, uuid, text) from public, anon;
grant execute on function public.reactivate_lead_cycle(uuid, uuid, text) to authenticated;

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
  if p_performed_at is null or p_performed_at > now() + interval '5 minutes' then
    raise exception 'La hora efectiva del contacto no es válida';
  end if;

  v_result := public.complete_contact_task(p_task_id, p_outcome, p_note);

  update public.lead_contact_tasks set
    performed_at = p_performed_at,
    recorded_at = now()
  where id = p_task_id;

  if coalesce((v_result ->> 'sequence_finished')::boolean, false) then
    update public.lead_crm set
      status = 'desistir',
      status_reason = 'No contactado post protocolo',
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      cold_base_at = now(),
      updated_at = now()
    where lead_id = (v_result ->> 'lead_id')::uuid;

    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values ((v_result ->> 'lead_id')::uuid, auth.uid(), 'status_change', 'Lead clasificado como Base fría',
      'No contactado post protocolo', jsonb_build_object('status', 'desistir', 'segment', 'base_fria', 'reason', 'No contactado post protocolo'));
  end if;

  return v_result;
end;
$$;

revoke all on function public.record_contact_task_result(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.record_contact_task_result(uuid, text, text, timestamptz) to authenticated;

create or replace function public.start_no_contact_protocol_from_future(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  if not private.current_user_is_management() and not exists (
    select 1 from public.leads where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then raise exception 'El Lead no está asignado a este vendedor'; end if;
  if not exists (select 1 from public.lead_crm where lead_id = p_lead_id and status = 'contacto_futuro' for update) then
    raise exception 'El Lead ya no está en Pide contacto futuro';
  end if;

  update public.lead_crm set
    status = 'no_contesta',
    next_contact_at = null,
    next_contact_note = '',
    next_contact_source = null,
    last_contact_at = now(),
    last_contact_outcome = 'no_answer',
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (p_lead_id, v_user_id, 'contact', 'Contacto futuro intentado sin respuesta', '',
    jsonb_build_object('previous_status', 'contacto_futuro', 'status', 'no_contesta', 'performed_at', now(), 'recorded_at', now(), 'outcome', 'no_answer'));
end;
$$;

revoke all on function public.start_no_contact_protocol_from_future(uuid) from public, anon;
grant execute on function public.start_no_contact_protocol_from_future(uuid) to authenticated;

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
  if p_status is null or p_status not in ('no_contesta', 'contacto_futuro', 'en_proceso', 'invalido', 'entrevista', 'cierre', 'sena', 'desistir') then
    raise exception 'Estado comercial inválido';
  end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'Prioridad inválida'; end if;
  if char_length(trim(coalesce(p_note, ''))) > 3000 then raise exception 'El detalle es demasiado extenso'; end if;
  if p_status in ('no_contesta', 'contacto_futuro') and p_next_contact_at is null then
    raise exception 'Programá el próximo contacto';
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
  if not private.crm_transition_allowed(v_previous_status, p_status) then
    raise exception 'Transición comercial no permitida: % → %', v_previous_status, p_status;
  end if;

  if p_status = 'entrevista' then v_activity_type := 'interview'; end if;
  if p_status in ('no_contesta', 'contacto_futuro') or p_next_contact_at is not null then v_activity_type := 'follow_up'; end if;
  if p_status in ('en_proceso', 'invalido') then v_activity_type := 'contact'; end if;
  v_title := case p_status
    when 'no_contesta' then 'El cliente no respondió'
    when 'contacto_futuro' then 'El cliente pidió contacto futuro'
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

create or replace function public.record_contact_answer_with_transition(
  p_task_id uuid,
  p_status text,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default '',
  p_contact_outcome text default '',
  p_interview_at timestamptz default null,
  p_interview_location text default '',
  p_deposit_amount numeric default null,
  p_priority text default 'normal',
  p_performed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
begin
  select lead_id into v_lead_id from public.lead_contact_tasks where id = p_task_id for update;
  if v_lead_id is null then raise exception 'No se encontró el intento de contacto'; end if;
  if p_status not in ('contacto_futuro', 'en_proceso', 'entrevista', 'cierre', 'sena', 'desistir') then
    raise exception 'Resultado comercial no permitido después de una respuesta';
  end if;

  perform public.record_contact_task_result(p_task_id, 'answered', p_note, p_performed_at);

  if p_status = 'contacto_futuro' then
    if p_next_contact_at is null or p_next_contact_at <= now() then raise exception 'Programá el contacto solicitado'; end if;
    update public.lead_crm set
      status = 'contacto_futuro',
      next_contact_at = p_next_contact_at,
      next_contact_note = left(coalesce(nullif(trim(p_next_contact_note), ''), trim(p_note)), 1000),
      next_contact_source = 'manual',
      last_contact_at = p_performed_at,
      last_contact_outcome = 'answered',
      updated_by = auth.uid(),
      updated_at = now()
    where lead_id = v_lead_id;
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (v_lead_id, auth.uid(), 'follow_up', 'El cliente pidió contacto futuro', trim(p_note),
      jsonb_build_object('previous_status', 'no_contesta', 'status', 'contacto_futuro', 'next_contact_at', p_next_contact_at, 'performed_at', p_performed_at, 'recorded_at', now()));
  else
    perform public.record_lead_follow_up(v_lead_id, p_status, p_note, p_next_contact_at, p_next_contact_note,
      coalesce(nullif(p_contact_outcome, ''), 'answered'), p_interview_at, p_interview_location, p_deposit_amount, p_priority);
  end if;
end;
$$;

revoke all on function public.record_contact_answer_with_transition(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, timestamptz) from public, anon;
grant execute on function public.record_contact_answer_with_transition(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, timestamptz) to authenticated;
