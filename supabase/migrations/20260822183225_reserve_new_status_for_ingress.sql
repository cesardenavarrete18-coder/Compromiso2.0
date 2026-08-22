-- "Nuevo" representa exclusivamente el estado inicial asignado al crear un lead.
-- Toda gestión posterior debe registrar un resultado comercial real.

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
      'interview_at', p_interview_at,
      'interview_location', trim(coalesce(p_interview_location, '')),
      'deposit_amount', p_deposit_amount
    )
  );
end;
$$;

comment on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text)
  is 'Registra una gestión comercial. El estado nuevo queda reservado exclusivamente al ingreso del lead.';

revoke all on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) from public, anon;
grant execute on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) to authenticated;
