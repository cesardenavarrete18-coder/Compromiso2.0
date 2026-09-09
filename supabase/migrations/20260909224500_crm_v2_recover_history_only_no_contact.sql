-- CRM V2 recovery for historical Sin contacto Leads that only retain a
-- cancelled/completed legacy protocol and therefore have no active sequence.
--
-- Existing reconciliation behavior is preserved for an ACTIVE incompatible
-- protocol. The new path is deliberately narrow: only a Lead currently in
-- no_contesta may recover when there is no active sequence. Historical tasks
-- are never rewritten or deleted. A stale manual next action is cleared
-- because Sin contacto is protocol-driven in CRM V2.
create or replace function public.reconcile_lead_contact_protocol(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.reconcile_lead_contact_protocol(uuid) from public, anon;
grant execute on function public.reconcile_lead_contact_protocol(uuid) to authenticated;

comment on function public.reconcile_lead_contact_protocol(uuid)
  is 'Reconcilia un protocolo legacy activo o recupera un Sin contacto histórico sin secuencia activa, preservando el historial y creando el protocolo CRM V2.';

notify pgrst, 'reload schema';
