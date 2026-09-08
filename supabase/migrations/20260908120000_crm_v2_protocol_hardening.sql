-- CRM V2 pre-main backend hardening.
-- Base fria is exclusively classified after verified exhaustion in
-- record_contact_task_result. Generic helpers cannot record an answer.

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
  v_previous_status text;
  v_sequence_finished boolean := false;
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  if p_outcome = 'answered' then
    raise exception 'Una respuesta requiere record_contact_answer_with_transition';
  end if;
  if p_outcome not in ('no_answer', 'sent', 'skipped', 'invalid', 'no_interest', 'requested_no_contact') then
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

  if p_outcome in ('invalid', 'no_interest', 'requested_no_contact') then
    select status into v_previous_status
    from public.lead_crm
    where lead_id = v_task.lead_id
    for update;
    if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;

    perform private.cancel_lead_contact_protocol(v_task.lead_id, case p_outcome
      when 'invalid' then 'Contacto inválido'
      when 'requested_no_contact' then 'Solicitó no ser contactado'
      else 'El cliente no desea continuar'
    end);

    update public.lead_crm set
      status = case when p_outcome = 'invalid' then 'invalido' else 'desistir' end,
      status_reason = coalesce(nullif(trim(p_note), ''),
        case when p_outcome = 'invalid' then 'Contacto inválido' when p_outcome = 'requested_no_contact' then 'Solicitó no ser contactado' else 'No desea continuar' end),
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      last_contact_at = now(),
      last_contact_outcome = p_outcome,
      cold_base_at = null,
      previous_status = v_previous_status,
      terminal_at = now(),
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
        stopped_reason = 'Protocolo CRM V2 procesado por completo',
        updated_at = now()
      where id = v_task.sequence_id;
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

revoke all on function public.complete_contact_task(uuid, text, text) from public, anon, authenticated;

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
begin
  if p_outcome = 'answered' then
    raise exception 'Una respuesta requiere record_contact_answer_with_transition';
  end if;

  -- Signature retained for the legacy frontend fallback. Its only active
  -- caller passes null/empty follow-up values, which are intentionally ignored.
  return public.complete_contact_task(p_task_id, p_outcome, p_note);
end;
$$;

revoke all on function public.complete_contact_task_with_follow_up(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.complete_contact_task_with_follow_up(uuid, text, text, timestamptz, text) to authenticated;

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
  v_is_canonical_exhaustion boolean;
  v_classified_lead_id uuid;
begin
  if p_outcome = 'answered' then
    raise exception 'Una respuesta requiere record_contact_answer_with_transition';
  end if;

  if p_performed_at is null or p_performed_at > now() + interval '5 minutes' then
    raise exception 'La hora efectiva del contacto no es válida';
  end if;

  v_result := public.complete_contact_task(p_task_id, p_outcome, p_note);

  update public.lead_contact_tasks set
    performed_at = p_performed_at,
    recorded_at = now()
  where id = p_task_id;

  if coalesce((v_result ->> 'sequence_finished')::boolean, false) then
    select sequence_id into v_sequence_id from public.lead_contact_tasks where id = p_task_id;
    select count(*) filter (where channel = 'call') = 18
      and count(*) filter (where channel = 'call' and status = 'completed' and outcome = 'no_answer') = 18
      and count(distinct (protocol_day, protocol_band)) filter (where channel = 'call') = 9
      and count(*) filter (where outcome = 'answered') = 0
    into v_is_canonical_exhaustion
    from public.lead_contact_tasks where sequence_id = v_sequence_id;

    if not coalesce(v_is_canonical_exhaustion, false) then
      raise exception 'La secuencia finalizada no cumple el protocolo canónico de 18 llamadas / 9 franjas';
    end if;

    update public.lead_crm set
      status = 'desistir',
      status_reason = 'No contactado post protocolo',
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      cold_base_at = now(),
      previous_status = 'no_contesta',
      terminal_at = now(),
      updated_at = now()
    where lead_id = (v_result ->> 'lead_id')::uuid
      and status in ('nuevo', 'no_contesta')
      and cold_base_at is null
    returning lead_id into v_classified_lead_id;

    if v_classified_lead_id is not null then
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values ((v_result ->> 'lead_id')::uuid, auth.uid(), 'status_change', 'Lead clasificado como Base fría',
      'No contactado post protocolo', jsonb_build_object('status', 'desistir', 'segment', 'base_fria', 'reason', 'No contactado post protocolo'));
    end if;
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
  v_seller uuid;
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  if not private.current_user_is_management() and not exists (
    select 1 from public.leads where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then raise exception 'El Lead no está asignado a este vendedor'; end if;
  select assigned_seller_user_id into v_seller from public.leads where id = p_lead_id;
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

  if private.create_lead_contact_sequence(p_lead_id, v_seller, now()) is null then
    raise exception 'No se pudo iniciar el protocolo CRM V2';
  end if;

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
  p_priority text default 'normal',
  p_interview_mode text default null,
  p_interview_operational_status text default null,
  p_deposit_validation text default ''
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
  v_seller uuid;
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
  if p_status in ('contacto_futuro', 'en_proceso', 'cierre', 'sena') and p_next_contact_at is null then
    raise exception 'Programá el próximo contacto';
  end if;
  if p_status <> 'no_contesta' and p_next_contact_at is not null and p_next_contact_at <= now() then
    raise exception 'El próximo contacto debe quedar programado a futuro';
  end if;
  if p_status = 'entrevista' and p_interview_at is null then raise exception 'Indicá la fecha y hora de la entrevista'; end if;
  if p_status = 'entrevista' and p_interview_mode not in ('presencial', 'videollamada') then raise exception 'La entrevista debe ser Presencial o Videollamada'; end if;
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
    when 'desistir' then 'Oportunidad desistida'
  end;

  if p_status <> 'no_contesta' then
    perform private.cancel_lead_contact_protocol(p_lead_id, 'Gestión manual registrada');
  end if;

  update public.lead_crm set
    status = p_status,
    priority = case when p_status = 'cierre' then 'high' else p_priority end,
    status_reason = case when p_status in ('invalido', 'desistir') then trim(coalesce(p_note, '')) else status_reason end,
    next_contact_at = case when p_status in ('no_contesta', 'desistir', 'invalido') then null else p_next_contact_at end,
    next_contact_note = case when p_status in ('no_contesta', 'desistir', 'invalido') or p_next_contact_at is null then '' else v_next_note end,
    next_contact_source = case when p_status in ('no_contesta', 'desistir', 'invalido') or p_next_contact_at is null then null else 'manual' end,
    last_contact_at = now(),
    last_contact_outcome = trim(coalesce(p_contact_outcome, '')),
    interview_at = coalesce(p_interview_at, interview_at),
    interview_location = case when p_interview_at is not null then trim(coalesce(p_interview_location, '')) else interview_location end,
    interview_mode = case when p_status = 'entrevista' then p_interview_mode else interview_mode end,
    interview_operational_status = case when p_status = 'entrevista' then coalesce(p_interview_operational_status, 'scheduled') when v_previous_status = 'entrevista' then 'completed' else interview_operational_status end,
    interview_objective = case when p_status = 'entrevista' then trim(coalesce(p_note, '')) else interview_objective end,
    final_objection = case when p_status = 'cierre' then trim(coalesce(p_note, '')) else final_objection end,
    deposit_amount = coalesce(p_deposit_amount, deposit_amount),
    deposit_at = case when p_status = 'sena' then now() else deposit_at end,
    deposit_validation = case when p_status = 'sena' then trim(coalesce(p_deposit_validation, '')) else deposit_validation end,
    cold_base_at = null,
    previous_status = case when p_status in ('desistir', 'invalido') then v_previous_status else previous_status end,
    terminal_at = case when p_status in ('desistir', 'invalido') then now() else null end,
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
      'next_contact_at', case when p_status = 'no_contesta' then null else p_next_contact_at end,
      'next_contact_note', case when p_status = 'no_contesta' or p_next_contact_at is null then null else v_next_note end,
      'next_contact_source', case when p_status = 'no_contesta' or p_next_contact_at is null then null else 'manual' end,
      'interview_at', p_interview_at,
      'interview_location', trim(coalesce(p_interview_location, '')),
      'interview_mode', p_interview_mode,
      'deposit_amount', p_deposit_amount
    )
  );

  if p_status = 'no_contesta' then
    select assigned_seller_user_id into v_seller from public.leads where id = p_lead_id;
    if private.create_lead_contact_sequence(p_lead_id, v_seller, now()) is null then
      raise exception 'No se pudo iniciar el protocolo CRM V2';
    end if;
  end if;
end;
$$;

comment on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, text, text, text)
  is 'Registra una gestión; Sin contacto limpia la agenda manual y garantiza un único protocolo CRM V2.';

revoke all on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, text, text, text) from public, anon;
grant execute on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, text, text, text) to authenticated;
