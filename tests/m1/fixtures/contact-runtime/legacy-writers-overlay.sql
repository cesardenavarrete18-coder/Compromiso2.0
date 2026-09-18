BEGIN;
SET LOCAL check_function_bodies=off;
-- Schema-only captured function definitions, 2026-09-17 M0 evidence.
-- Source m01-current-sql-definitions.md; no data or credentials.
-- These legacy bodies are unchanged and run only in the isolated harness.
CREATE OR REPLACE FUNCTION public.supervisor_manage_lead(p_lead_id uuid, p_action text, p_status text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_crm public.lead_crm%rowtype;
  v_seller uuid;
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
  select assigned_seller_user_id into v_seller
  from public.leads where id = p_lead_id and assigned_seller_user_id is not null;
  if v_seller is null then raise exception 'No se encontró un Lead asignado'; end if;

  select * into v_crm from public.lead_crm where lead_id = p_lead_id for update;
  if not found then raise exception 'No se encontró la ficha CRM del Lead'; end if;
  if v_crm.status in ('venta', 'desistir', 'invalido') then raise exception 'El Lead ya no se encuentra activo'; end if;

  if p_action = 'schedule' then
    if v_crm.status in ('nuevo', 'no_contesta') then
      raise exception 'El Lead está en %: la próxima acción la define el protocolo, no se puede programar manualmente',
        case v_crm.status when 'nuevo' then 'Nuevo' else 'Sin contacto' end;
    end if;
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
    if not private.crm_transition_allowed(v_crm.status, p_status) then
      raise exception 'Transición comercial no permitida: % → %', v_crm.status, p_status;
    end if;
    if p_status = 'entrevista' and v_crm.interview_at is null then raise exception 'La Entrevista debe programarse previamente desde la gestión comercial'; end if;
    if p_status = 'sena' and coalesce(v_crm.deposit_amount, 0) <= 0 then raise exception 'La Seña requiere un importe registrado en la gestión comercial'; end if;
    if p_status in ('invalido', 'desistir') and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Indicá el motivo del cambio de estado'; end if;
    if p_status = 'desistir' and p_desist_reason is null then
      raise exception 'Seleccioná el motivo del desistimiento';
    end if;
    if p_status = 'desistir' and p_desist_reason is not null and p_desist_reason not in (
      'no_interest', 'conditions_not_viable', 'chose_other_option',
      'postponed_without_date', 'requested_no_contact', 'other'
    ) then
      raise exception 'Motivo de desistimiento inválido';
    end if;

    v_previous_status := v_crm.status;
    if p_status in ('invalido', 'desistir') then perform private.cancel_lead_contact_protocol(p_lead_id, 'Lead terminal por Supervisión'); end if;

    update public.lead_crm set
      status = p_status,
      priority = case when p_status = 'cierre' then 'high' else p_priority end,
      status_reason = case when p_status in ('invalido', 'desistir') then trim(p_note) else status_reason end,
      desist_reason = case when p_status = 'desistir' then p_desist_reason else desist_reason end,
      next_contact_at = case when p_status in ('invalido', 'desistir', 'no_contesta') then null else next_contact_at end,
      next_contact_note = case when p_status in ('invalido', 'desistir', 'no_contesta') then '' else next_contact_note end,
      next_contact_source = case when p_status in ('invalido', 'desistir', 'no_contesta') then null else next_contact_source end,
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = p_lead_id;

    if p_status = 'desistir' and p_desist_reason = 'requested_no_contact' then
      perform private.apply_lead_opt_out(p_lead_id, trim(coalesce(p_note, '')));
    end if;

    if p_status = 'no_contesta' then
      if private.create_lead_contact_sequence(p_lead_id, v_seller, now()) is null then
        raise exception 'No se pudo iniciar el protocolo CRM V2';
      end if;
    end if;

    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (p_lead_id, v_user_id, 'status_change', 'Estado actualizado por Supervisión', trim(coalesce(p_note, '')),
      jsonb_build_object('origin', 'supervisor_portfolio', 'previous_status', v_previous_status, 'status', p_status,
        'priority', p_priority, 'desist_reason', case when p_status = 'desistir' then p_desist_reason else null end));
    return;
  end if;

  if p_contact_outcome not in ('answered', 'no_answer', 'sent') then raise exception 'Resultado de gestión inválido'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 2 or char_length(trim(p_note)) > 3000 then raise exception 'Describí la gestión realizada'; end if;
  if v_crm.status in ('nuevo', 'no_contesta') and p_contact_outcome = 'answered' then
    raise exception 'Un cliente que contestó desde Nuevo o Sin contacto requiere registrar la respuesta sobre la tarea real del protocolo (Cartera del vendedor o "Contestó" en Supervisión), no la gestión genérica';
  end if;
  if v_crm.status = 'no_contesta' and p_next_contact_at is not null then
    raise exception 'El Lead está en Sin contacto: la próxima acción la define el protocolo, no se puede programar manualmente';
  end if;
  if p_next_contact_at is not null and p_next_contact_at <= now() then raise exception 'La próxima acción debe ser futura'; end if;

  update public.lead_crm set
    last_contact_at = now(),
    last_contact_outcome = p_contact_outcome,
    next_contact_at = case when v_crm.status = 'no_contesta' then next_contact_at else p_next_contact_at end,
    next_contact_note = case when v_crm.status = 'no_contesta' then next_contact_note when p_next_contact_at is null then '' else v_next_note end,
    next_contact_source = case when v_crm.status = 'no_contesta' then next_contact_source when p_next_contact_at is null then null else 'manual' end,
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
$function$

;

CREATE OR REPLACE FUNCTION public.restart_lead_contact_sequence(p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION public.reconcile_lead_contact_protocol(p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_seller uuid;
  v_crm_status text;
  v_sequence_id uuid;
  v_new_sequence_id uuid;
  v_recovery_without_active boolean := false;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select lead.assigned_seller_user_id, crm.status
  into v_seller, v_crm_status
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  where lead.id = p_lead_id
  for update of lead, crm;

  if not found then raise exception 'No se encontró el Lead'; end if;
  if v_seller is null then raise exception 'El Lead todavía no tiene vendedor'; end if;
  if v_seller <> v_user_id and not private.current_user_is_management() then
    raise exception 'Acceso no autorizado';
  end if;

  select sequence.id
  into v_sequence_id
  from public.lead_contact_sequences sequence
  where sequence.lead_id = p_lead_id
    and sequence.status = 'active'
  order by sequence.created_at desc
  limit 1
  for update;

  if v_sequence_id is null then
    if v_crm_status <> 'no_contesta' then
      raise exception 'No existe un protocolo activo para reconciliar';
    end if;
    v_recovery_without_active := true;
  else
    if (
      select count(*) = 18
        and count(distinct (protocol_day, protocol_band)) = 9
        and count(distinct (protocol_day, protocol_band, band_attempt)) = 18
        and min(protocol_day) = 1 and max(protocol_day) between 3 and 4
        and bool_and(band_attempt between 1 and 2)
        and bool_and(due_end >= sequence.started_at)
        and bool_and(case protocol_band
          when '10-12' then (due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '10:00'
            and (due_end at time zone 'America/Argentina/Buenos_Aires')::time <= time '12:00'
          when '14-16' then (due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '14:00'
            and (due_end at time zone 'America/Argentina/Buenos_Aires')::time <= time '16:00'
          when '17-19' then (due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '17:00'
            and (due_end at time zone 'America/Argentina/Buenos_Aires')::time <= time '19:00'
          else false end)
      from public.lead_contact_tasks task
      join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
      where task.sequence_id = v_sequence_id and task.channel = 'call'
    ) then
      raise exception 'El protocolo activo ya cumple el contrato CRM V2';
    end if;

    update public.lead_contact_tasks
    set status = 'cancelled', updated_at = now()
    where sequence_id = v_sequence_id and status in ('pending', 'scheduled');

    update public.lead_contact_sequences
    set status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        stopped_reason = 'Reconciliación explícita a protocolo CRM V2',
        updated_at = now()
    where id = v_sequence_id;
  end if;

  -- Sin contacto never mixes a manual commitment with the protocol-driven
  -- next action. The historical manual agenda is cleared before creating the
  -- canonical sequence; create_lead_contact_sequence will set the protocol
  -- next action again.
  if v_crm_status = 'no_contesta' then
    update public.lead_crm
    set next_contact_at = null,
        next_contact_note = '',
        next_contact_source = null,
        updated_by = v_user_id,
        updated_at = now()
    where lead_id = p_lead_id;
  end if;

  insert into public.lead_activities (
    lead_id, actor_user_id, activity_type, title, detail, metadata
  ) values (
    p_lead_id,
    v_user_id,
    'follow_up',
    case when v_recovery_without_active
      then 'Protocolo CRM V2 iniciado'
      else 'Protocolo reconciliado a CRM V2'
    end,
    case when v_recovery_without_active
      then 'El Lead estaba en Sin contacto sin protocolo activo. Se preservó el historial anterior y se inició una secuencia CRM V2.'
      else 'Se conservaron los intentos históricos y se cancelaron únicamente tareas pendientes del protocolo anterior.'
    end,
    jsonb_build_object(
      'previous_sequence_id', v_sequence_id,
      'action', case when v_recovery_without_active
        then 'protocol_v2_recovery'
        else 'protocol_v2_reconciliation'
      end,
      'historical_tasks_preserved', true
    )
  );

  v_new_sequence_id := private.create_lead_contact_sequence(p_lead_id, v_seller, now());
  if v_new_sequence_id is null then
    raise exception 'No se pudo iniciar el protocolo CRM V2';
  end if;

  return v_new_sequence_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.start_no_contact_protocol_from_future(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION public.record_recall_attempt(p_item_id uuid, p_time_band text, p_outcome text, p_contacted_at timestamp with time zone, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_item public.lead_recall_items%rowtype;
  v_attempt smallint;
  v_crm_status text;
  v_lead_do_not_contact boolean;
  v_customer_do_not_contact boolean;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select * into v_item
  from public.lead_recall_items
  where id = p_item_id
  for update;

  if not found then raise exception 'No se encontró el rellamado'; end if;
  if v_item.assigned_seller_user_id <> v_user_id
     and not private.current_user_is_management() then
    raise exception 'Este rellamado no está asignado al usuario';
  end if;
  if v_item.status not in ('assigned', 'working') then
    raise exception 'El rellamado ya no admite gestiones';
  end if;
  if p_time_band not in ('10_12', '14_16', '17_19') then
    raise exception 'Franja horaria inválida';
  end if;
  if p_outcome not in ('no_answer', 'answered', 'invalid', 'not_interested') then
    raise exception 'Resultado inválido';
  end if;
  if p_contacted_at is null or p_contacted_at > now() + interval '5 minutes' then
    raise exception 'La fecha de la llamada no es válida';
  end if;
  if exists (
    select 1 from public.lead_recall_attempts
    where recall_item_id = p_item_id and time_band = p_time_band
  ) then
    raise exception 'El segundo llamado debe realizarse en otra franja horaria';
  end if;

  select
    crm.status,
    coalesce(lead.do_not_contact, false),
    coalesce(customer.do_not_contact, false)
  into v_crm_status, v_lead_do_not_contact, v_customer_do_not_contact
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  left join public.customers customer on customer.id = lead.customer_id
  where lead.id = v_item.lead_id
  for update of lead, crm;

  if v_crm_status is null then raise exception 'No se encontró la ficha CRM del Lead'; end if;
  if v_crm_status <> 'desistir' then
    raise exception 'El Lead ya no está en Desistir y no admite una gestión desde Rellamados';
  end if;
  if exists (select 1 from public.sales_cases where lead_id = v_item.lead_id) then
    raise exception 'El Lead ya está en el circuito administrativo';
  end if;

  v_attempt := v_item.attempt_count + 1;
  if v_attempt > 2 then raise exception 'Ya se registraron los dos llamados'; end if;

  insert into public.lead_recall_attempts (
    recall_item_id, seller_user_id, attempt_number, time_band, outcome, note, contacted_at
  ) values (
    p_item_id, v_user_id, v_attempt, p_time_band, p_outcome,
    left(trim(coalesce(p_note, '')), 3000), p_contacted_at
  );

  if p_outcome = 'answered' then
    if v_lead_do_not_contact or v_customer_do_not_contact then
      raise exception 'El cliente solicitó no ser contactado y no puede reactivarse desde Rellamados';
    end if;
    if p_next_contact_at is null or p_next_contact_at <= now() then
      raise exception 'Programá el próximo contacto antes de pasar el Lead a En Gestión';
    end if;

    update public.lead_recall_items
    set attempt_count = v_attempt,
        status = 'converted',
        answered_at = p_contacted_at,
        converted_at = now(),
        updated_at = now()
    where id = p_item_id;

    update public.leads
    set assigned_seller_user_id = v_user_id,
        assigned_by_user_id = v_user_id,
        assigned_at = now(),
        routing_status = 'assigned_manual',
        routing_reason = 'recall_reactivated',
        closed_at = null,
        last_message_at = greatest(last_message_at, p_contacted_at)
    where id = v_item.lead_id;

    select status into v_crm_status
    from public.lead_crm
    where lead_id = v_item.lead_id
    for update;

    if v_crm_status <> 'nuevo' then
      perform private.start_lead_crm_cycle(
        v_item.lead_id,
        v_user_id,
        'recall_reactivation',
        'Rellamado respondido',
        false
      );
    end if;

    perform public.record_lead_follow_up(
      p_lead_id => v_item.lead_id,
      p_status => 'en_proceso',
      p_note => coalesce(nullif(trim(p_note), ''), 'Rellamado respondido'),
      p_next_contact_at => p_next_contact_at,
      p_next_contact_note => coalesce(nullif(trim(p_next_contact_note), ''), 'Próximo contacto acordado'),
      p_contact_outcome => 'Rellamado respondido',
      p_priority => 'normal'
    );

    update public.lead_crm
    set last_contact_at = p_contacted_at,
        last_contact_outcome = 'Rellamado respondido',
        updated_by = v_user_id,
        updated_at = now()
    where lead_id = v_item.lead_id;

    insert into public.lead_assignments (
      lead_id, seller_user_id, assigned_by_user_id, assignment_type, reason
    ) values (
      v_item.lead_id, v_user_id, v_user_id, 'manual',
      'Rellamado respondido y reactivado en nuevo ciclo CRM V2'
    );

    insert into public.lead_activities (
      lead_id, actor_user_id, activity_type, title, detail, metadata
    ) values (
      v_item.lead_id,
      v_user_id,
      'follow_up',
      'Rellamado reactivado en nuevo ciclo',
      trim(coalesce(p_note, '')),
      jsonb_build_object(
        'recall_item_id', p_item_id,
        'attempt', v_attempt,
        'time_band', p_time_band,
        'contacted_at', p_contacted_at,
        'next_contact_at', p_next_contact_at,
        'status', 'en_proceso',
        'origin', 'recall'
      )
    );

  elsif p_outcome in ('invalid', 'not_interested') or v_attempt = 2 then
    update public.lead_recall_items
    set attempt_count = v_attempt,
        status = 'exhausted',
        exhausted_at = now(),
        updated_at = now()
    where id = p_item_id;

    update public.lead_crm
    set status = 'desistir',
        status_reason = case
          when p_outcome = 'invalid' then 'Contacto inválido en rellamado'
          when p_outcome = 'not_interested' then 'Sin interés en rellamado'
          else 'Dos llamados sin respuesta'
        end,
        desist_reason = case
          when p_outcome = 'not_interested' then 'no_interest'
          else 'other'
        end,
        next_contact_at = null,
        next_contact_note = '',
        next_contact_source = null,
        cold_base_at = null,
        updated_by = v_user_id,
        updated_at = now()
    where lead_id = v_item.lead_id;

    insert into public.lead_activities (
      lead_id, actor_user_id, activity_type, title, detail, metadata
    ) values (
      v_item.lead_id,
      v_user_id,
      'follow_up',
      'Rellamado cerrado',
      trim(coalesce(p_note, '')),
      jsonb_build_object(
        'recall_item_id', p_item_id,
        'attempts', v_attempt,
        'outcome', p_outcome,
        'base_fria', false
      )
    );

  else
    update public.lead_recall_items
    set attempt_count = v_attempt,
        status = 'working',
        updated_at = now()
    where id = p_item_id;

    insert into public.lead_activities (
      lead_id, actor_user_id, activity_type, title, detail, metadata
    ) values (
      v_item.lead_id,
      v_user_id,
      'follow_up',
      'Primer rellamado sin respuesta',
      trim(coalesce(p_note, '')),
      jsonb_build_object('recall_item_id', p_item_id, 'time_band', p_time_band)
    );
  end if;

  return jsonb_build_object(
    'status', (select status from public.lead_recall_items where id = p_item_id),
    'attempts', v_attempt,
    'lead_id', v_item.lead_id
  );
end;
$function$

;

ALTER FUNCTION public.reconcile_lead_contact_protocol(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_lead_contact_protocol(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_lead_contact_protocol(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.reconcile_lead_contact_protocol(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_lead_contact_protocol(uuid) TO service_role;

ALTER FUNCTION public.record_recall_attempt(uuid,text,text,timestamp with time zone,text,timestamp with time zone,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_recall_attempt(uuid,text,text,timestamp with time zone,text,timestamp with time zone,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_recall_attempt(uuid,text,text,timestamp with time zone,text,timestamp with time zone,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.record_recall_attempt(uuid,text,text,timestamp with time zone,text,timestamp with time zone,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_recall_attempt(uuid,text,text,timestamp with time zone,text,timestamp with time zone,text) TO service_role;

ALTER FUNCTION public.restart_lead_contact_sequence(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.restart_lead_contact_sequence(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.restart_lead_contact_sequence(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.restart_lead_contact_sequence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restart_lead_contact_sequence(uuid) TO service_role;

ALTER FUNCTION public.start_no_contact_protocol_from_future(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_no_contact_protocol_from_future(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_no_contact_protocol_from_future(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.start_no_contact_protocol_from_future(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_no_contact_protocol_from_future(uuid) TO service_role;

ALTER FUNCTION public.supervisor_manage_lead(uuid,text,text,text,text,timestamp with time zone,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supervisor_manage_lead(uuid,text,text,text,text,timestamp with time zone,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.supervisor_manage_lead(uuid,text,text,text,text,timestamp with time zone,text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.supervisor_manage_lead(uuid,text,text,text,text,timestamp with time zone,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_manage_lead(uuid,text,text,text,text,timestamp with time zone,text,text,text) TO service_role;
SET LOCAL check_function_bodies=on;
COMMIT;
