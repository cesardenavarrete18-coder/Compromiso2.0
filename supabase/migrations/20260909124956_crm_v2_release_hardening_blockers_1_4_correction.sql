-- Second-round audit corrections to 20260909090000_crm_v2_release_hardening.sql.
--
-- That migration was already applied to QA before these corrections existed;
-- editing it a second time in place left QA's
-- supabase_migrations.schema_migrations history storing the ORIGINAL applied
-- SQL while the live functions had moved on to the corrected bodies below.
-- That migration file has since been restored verbatim to its original
-- 5e89d3652a8962fdf2edeff629ae46af0dbb3d07 content, and this file reconciles
-- the rest: it is named and timestamped to match the migration QA's history
-- already recorded under version 20260909124956 /
-- crm_v2_release_hardening_blockers_1_4_correction when these corrections
-- were first applied (through supabase_migrations, not a raw execute_sql
-- patch) - so this file need not be re-applied, only committed, for local
-- migration history to exactly reproduce what QA already has. Replaying
-- every migration in this repo in filename order now reaches the same
-- schema and function bodies QA is actually running. This forward-only
-- migration is where the second-round corrections live in migration
-- history:
--
-- 1) submit_crm_lead_sale (the real Datero entrypoint) only accepts Cierre or
--    Seña, instead of merely blocking the three terminals. Every other state
--    must go through record_contact_answer_with_transition or
--    record_lead_follow_up first.
-- 2) record_lead_follow_up and record_contact_answer_with_transition both
--    reject p_status = 'desistir' with a null p_desist_reason. Application
--    level only, so historical rows and the automatic protocol-exhaustion
--    path (which never calls these RPCs) are unaffected.
-- 3) private.start_lead_crm_cycle unconditionally (idempotently) guarantees
--    the canonical protocol after a successful non-opt-out reset, instead of
--    only when the previous status was already 'nuevo'.

create or replace function public.submit_crm_lead_sale(
  p_application_id uuid,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.commercial_applications%rowtype;
  v_request_id uuid;
  v_vehicle text;
  v_campaign_name text;
  v_version_name text;
  v_transmission text;
  v_installment_count integer;
  v_final_price numeric;
  v_advance_amount numeric;
  v_installment_amount numeric;
  v_model_id uuid;
  v_model_name text;
  v_brand_name text;
  v_model_image text;
  v_bonus text;
  v_benefits text[];
  v_campaign_active boolean;
  v_model_active boolean;
  v_brand_active boolean;
  v_valid_from date;
  v_valid_to date;
  v_current_status text;
  v_new_status text;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select * into v_application
  from public.commercial_applications application
  where application.id = p_application_id
  for update;

  if not found
    or v_application.seller_user_id <> v_user_id
    or v_application.lead_id is null
    or v_application.prequalification_event_id is not null
    or v_application.sales_case_id is not null then
    raise exception 'El datero no corresponde a este vendedor o Lead';
  end if;

  if not exists (
    select 1 from public.leads lead
    where lead.id = v_application.lead_id
      and lead.assigned_seller_user_id = v_user_id
  ) then
    raise exception 'El Lead no está asignado a este vendedor';
  end if;

  -- Idempotent retry: an application that already produced a request returns
  -- it as-is, without re-evaluating the Lead's current commercial status.
  select request.id into v_request_id
  from public.lead_sale_requests request
  where request.provisional_application_id = p_application_id;
  if v_request_id is not null then
    return v_request_id;
  end if;

  select status into v_current_status
  from public.lead_crm
  where lead_id = v_application.lead_id
  for update;
  if v_current_status is null then raise exception 'No se encontró la ficha CRM del Lead'; end if;
  -- The Datero is only a valid side effect of a Lead that already reached a
  -- sale-ready commercial state through the canonical transition flow. Every
  -- other state (nuevo, no_contesta, contacto_futuro, en_proceso, entrevista,
  -- and the terminals venta/desistir/invalido) must go through
  -- record_contact_answer_with_transition or record_lead_follow_up first.
  if v_current_status not in ('cierre', 'sena') then
    raise exception 'El Datero sólo puede enviarse desde Cierre o Seña (estado actual: %)', v_current_status;
  end if;

  select
    campaign.plan_name,
    campaign.version_name,
    campaign.transmission,
    campaign.installment_count,
    campaign.final_price,
    campaign.advance_amount,
    campaign.installment_amount,
    model.id,
    model.name,
    brand.name,
    model.image_path,
    campaign.bonus,
    campaign.benefits,
    campaign.active,
    model.active,
    brand.active,
    campaign.valid_from,
    campaign.valid_to
  into
    v_campaign_name,
    v_version_name,
    v_transmission,
    v_installment_count,
    v_final_price,
    v_advance_amount,
    v_installment_amount,
    v_model_id,
    v_model_name,
    v_brand_name,
    v_model_image,
    v_bonus,
    v_benefits,
    v_campaign_active,
    v_model_active,
    v_brand_active,
    v_valid_from,
    v_valid_to
  from public.campaigns campaign
  join public.models model on model.id = campaign.model_id
  join public.brands brand on brand.id = model.brand_id
  where campaign.id = v_application.campaign_id;

  if not found then
    raise exception 'La campaña seleccionada no existe en el catálogo central';
  end if;
  if not v_campaign_active or not v_model_active or not v_brand_active
    or (v_valid_from is not null and v_valid_from > current_date)
    or (v_valid_to is not null and v_valid_to < current_date) then
    raise exception 'La campaña seleccionada ya no está vigente';
  end if;
  if coalesce(trim(v_version_name), '') = '' or coalesce(trim(v_transmission), '') = ''
    or coalesce(trim(v_campaign_name), '') = '' or coalesce(v_installment_count, 0) < 1
    or coalesce(v_final_price, 0) <= 0 or v_advance_amount is null
    or coalesce(v_installment_amount, 0) <= 0 or coalesce(trim(v_model_image), '') = '' then
    raise exception 'La campaña seleccionada tiene datos obligatorios incompletos';
  end if;
  if v_application.brand_name is distinct from v_brand_name
    or v_application.model_name is distinct from v_model_name
    or v_application.campaign_name is distinct from v_campaign_name
    or v_application.plan_type is distinct from (v_campaign_name || ' · ' || v_installment_count || ' cuotas')
    or v_application.installments_to_pay is distinct from v_installment_count
    or v_application.agreed_price is distinct from v_final_price
    or v_application.commercial_snapshot ->> 'campaignId' is distinct from v_application.campaign_id::text
    or v_application.commercial_snapshot ->> 'modelId' is distinct from v_model_id::text
    or v_application.commercial_snapshot ->> 'version' is distinct from v_version_name
    or v_application.commercial_snapshot ->> 'transmission' is distinct from v_transmission
    or (v_application.commercial_snapshot ->> 'installmentCount')::integer is distinct from v_installment_count
    or (v_application.commercial_snapshot ->> 'finalPrice')::numeric is distinct from v_final_price
    or (v_application.commercial_snapshot ->> 'advanceAmount')::numeric is distinct from v_advance_amount
    or (v_application.commercial_snapshot ->> 'installmentAmount')::numeric is distinct from v_installment_amount
    or v_application.commercial_snapshot ->> 'bonus' is distinct from v_bonus
    or v_application.commercial_snapshot ->> 'image' is distinct from v_model_image
    or v_application.commercial_snapshot -> 'benefits' is distinct from to_jsonb(v_benefits) then
    raise exception 'Las condiciones de la campaña cambiaron. Volvé a seleccionarla antes de enviar el Datero';
  end if;

  if char_length(trim(coalesce(p_notes, ''))) > 3000 then
    raise exception 'Las observaciones no pueden superar los 3000 caracteres';
  end if;

  if exists (
    select 1 from public.lead_sale_requests request
    where request.lead_id = v_application.lead_id and request.status = 'pending'
  ) then
    raise exception 'Ya existe una venta pendiente de confirmación para este cliente';
  end if;

  if exists (
    select 1 from public.sales_cases sales_case
    where sales_case.lead_id = v_application.lead_id
  ) then
    raise exception 'La venta ya se encuentra en el circuito administrativo';
  end if;

  v_vehicle := trim(concat_ws(' ', v_brand_name, v_model_name, v_version_name, v_transmission));
  -- v_current_status is already constrained to cierre/sena above; Seña stays
  -- Seña, Cierre stays Cierre. Neither ever demotes while confirmation is pending.
  v_new_status := v_current_status;

  insert into public.lead_sale_requests (
    lead_id,
    seller_user_id,
    vehicle,
    sale_amount,
    notes,
    provisional_application_id
  ) values (
    v_application.lead_id,
    v_user_id,
    v_vehicle,
    v_application.agreed_price,
    left(trim(coalesce(p_notes, '')), 3000),
    v_application.id
  ) returning id into v_request_id;

  -- Seña's amount/date/validation are commercial facts of the deposit and are
  -- never touched here; only the sale-request bookkeeping fields change.
  update public.lead_crm set
    status = v_new_status,
    priority = 'high',
    sale_confirmation_status = 'pending',
    sale_requested_at = now(),
    sale_requested_by = v_user_id,
    vehicle_sold = v_vehicle,
    sale_amount = v_application.agreed_price,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = v_application.lead_id;

  insert into public.lead_activities (
    lead_id,
    actor_user_id,
    activity_type,
    title,
    detail,
    metadata
  ) values (
    v_application.lead_id,
    v_user_id,
    'sale_request',
    'Datero enviado a supervisión',
    left(trim(coalesce(p_notes, '')), 3000),
    jsonb_build_object(
      'vehicle', v_vehicle,
      'amount', v_application.agreed_price,
      'request_id', v_request_id,
      'provisional_application_id', v_application.id,
      'campaign_id', v_application.campaign_id,
      'origin', 'crm_lead',
      'previous_status', v_current_status,
      'status', v_new_status
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.submit_crm_lead_sale(uuid, text) from public, anon;
grant execute on function public.submit_crm_lead_sale(uuid, text) to authenticated;

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
  p_deposit_validation text default '',
  p_desist_reason text default null
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
  -- Every NEW manual Desistir must carry a structured reason. This is an
  -- application-level rule, not a table constraint, so historical rows and
  -- the automatic protocol-exhaustion path (which never calls this RPC)
  -- remain valid with desist_reason left null.
  if p_status = 'desistir' and p_desist_reason is null then
    raise exception 'Seleccioná el motivo del desistimiento';
  end if;
  if p_status = 'desistir' and p_desist_reason is not null and p_desist_reason not in (
    'no_interest', 'conditions_not_viable', 'chose_other_option',
    'postponed_without_date', 'requested_no_contact', 'other'
  ) then
    raise exception 'Motivo de desistimiento inválido';
  end if;

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
    desist_reason = case when p_status = 'desistir' then p_desist_reason else desist_reason end,
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
      'desist_reason', case when p_status = 'desistir' then p_desist_reason else null end,
      'next_contact_at', case when p_status = 'no_contesta' then null else p_next_contact_at end,
      'next_contact_note', case when p_status = 'no_contesta' or p_next_contact_at is null then null else v_next_note end,
      'next_contact_source', case when p_status = 'no_contesta' or p_next_contact_at is null then null else 'manual' end,
      'interview_at', p_interview_at,
      'interview_location', trim(coalesce(p_interview_location, '')),
      'interview_mode', p_interview_mode,
      'deposit_amount', p_deposit_amount
    )
  );

  if p_status = 'desistir' and p_desist_reason = 'requested_no_contact' then
    perform private.apply_lead_opt_out(p_lead_id, trim(coalesce(p_note, '')));
  end if;

  if p_status = 'no_contesta' then
    select assigned_seller_user_id into v_seller from public.leads where id = p_lead_id;
    if private.create_lead_contact_sequence(p_lead_id, v_seller, now()) is null then
      raise exception 'No se pudo iniciar el protocolo CRM V2';
    end if;
  end if;
end;
$$;

comment on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, text, text, text, text)
  is 'Registra una gestión; Sin contacto limpia la agenda manual, garantiza un único protocolo CRM V2 y aplica el motivo estructurado de Desistir.';

revoke all on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, text, text, text, text) to authenticated;

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
  p_performed_at timestamptz default now(),
  p_interview_mode text default null,
  p_deposit_validation text default '',
  p_desist_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_task public.lead_contact_tasks%rowtype;
  v_previous_status text;
  v_next_note text := left(coalesce(nullif(trim(p_next_contact_note), ''), trim(p_note)), 1000);
  v_activity_type text := 'status_change';
  v_title text;
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  if p_performed_at is null or p_performed_at > now() + interval '5 minutes' then raise exception 'La hora efectiva del contacto no es válida'; end if;
  if char_length(trim(coalesce(p_note, ''))) > 3000 then raise exception 'El detalle es demasiado extenso'; end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'Prioridad inválida'; end if;
  if p_status not in ('contacto_futuro', 'en_proceso', 'entrevista', 'cierre', 'sena', 'desistir') then
    raise exception 'Resultado comercial no permitido después de una respuesta';
  end if;
  if p_status = 'desistir' and p_desist_reason is null then
    raise exception 'Seleccioná el motivo del desistimiento';
  end if;
  if p_status = 'desistir' and p_desist_reason is not null and p_desist_reason not in (
    'no_interest', 'conditions_not_viable', 'chose_other_option',
    'postponed_without_date', 'requested_no_contact', 'other'
  ) then
    raise exception 'Motivo de desistimiento inválido';
  end if;

  select * into v_task
  from public.lead_contact_tasks
  where id = p_task_id
  for update;
  if v_task.id is null or v_task.status <> 'pending' then raise exception 'La tarea ya fue procesada o no existe'; end if;
  if v_task.seller_user_id <> v_user_id and not private.current_user_is_management() then raise exception 'La tarea no corresponde a este vendedor'; end if;

  select status into v_previous_status
  from public.lead_crm
  where lead_id = v_task.lead_id
  for update;
  if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;
  if v_previous_status not in ('nuevo', 'no_contesta') then raise exception 'El Lead ya no está en Nuevo ni en Sin contacto'; end if;
  if not private.crm_transition_allowed(v_previous_status, p_status) then
    raise exception 'Transición comercial no permitida: % → %', v_previous_status, p_status;
  end if;

  if p_status in ('contacto_futuro', 'en_proceso') and (p_next_contact_at is null or p_next_contact_at <= now()) then
    if p_status = 'en_proceso' then
      raise exception 'En gestión requiere un próximo contacto con fecha y hora';
    else
      raise exception 'Programá el contacto solicitado';
    end if;
  end if;
  if p_status = 'entrevista' and (p_interview_at is null or p_interview_at <= now()) then raise exception 'Indicá la fecha y hora futura de la entrevista'; end if;
  if p_status = 'entrevista' and p_interview_mode not in ('presencial', 'videollamada') then raise exception 'La entrevista debe ser Presencial o Videollamada'; end if;
  if p_status = 'sena' and (p_deposit_amount is null or p_deposit_amount <= 0) then raise exception 'Indicá el importe de la seña'; end if;
  if p_status = 'desistir' and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Indicá el motivo para este estado'; end if;

  -- Deliberately bypass the legacy task-completion RPC: it changes the CRM
  -- status before the required final fields exist.
  update public.lead_contact_tasks set
    status = 'completed',
    outcome = 'answered',
    note = trim(coalesce(p_note, '')),
    completed_at = now(),
    performed_at = p_performed_at,
    recorded_at = now(),
    completed_by = v_user_id,
    updated_at = now()
  where id = v_task.id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (v_task.lead_id, v_user_id, case when v_task.channel = 'call' then 'contact' else 'follow_up' end,
    case when v_task.channel = 'call' then 'Intento de llamada ' || v_task.call_attempt || ' contestado'
      else 'WhatsApp de seguimiento ' || v_task.message_step || ' contestado' end,
    trim(coalesce(p_note, '')),
    jsonb_build_object('task_id', v_task.id, 'channel', v_task.channel, 'outcome', 'answered',
      'call_attempt', v_task.call_attempt, 'message_step', v_task.message_step,
      'performed_at', p_performed_at, 'recorded_at', now()));

  perform private.cancel_lead_contact_protocol(v_task.lead_id, 'El cliente respondió');

  if p_status = 'entrevista' then v_activity_type := 'interview'; end if;
  if p_status in ('contacto_futuro', 'en_proceso') then v_activity_type := 'follow_up'; end if;
  if p_status = 'en_proceso' then v_activity_type := 'contact'; end if;
  v_title := case p_status
    when 'contacto_futuro' then 'El cliente pidió contacto futuro'
    when 'en_proceso' then 'Contacto en proceso'
    when 'entrevista' then 'Entrevista programada'
    when 'cierre' then 'Oportunidad en cierre'
    when 'sena' then 'Seña registrada'
    when 'desistir' then 'Oportunidad desistida'
  end;

  update public.lead_crm set
    status = p_status,
    priority = case when p_status = 'cierre' then 'high' else p_priority end,
    status_reason = case when p_status = 'desistir' then trim(coalesce(p_note, '')) else status_reason end,
    desist_reason = case when p_status = 'desistir' then p_desist_reason else desist_reason end,
    next_contact_at = case when p_status in ('contacto_futuro', 'en_proceso') then p_next_contact_at else null end,
    next_contact_note = case when p_status in ('contacto_futuro', 'en_proceso') then v_next_note else '' end,
    next_contact_source = case when p_status in ('contacto_futuro', 'en_proceso') then 'manual' else null end,
    last_contact_at = p_performed_at,
    last_contact_outcome = 'answered',
    interview_at = case when p_status = 'entrevista' then p_interview_at else interview_at end,
    interview_location = case when p_status = 'entrevista' then trim(coalesce(p_interview_location, '')) else interview_location end,
    interview_mode = case when p_status = 'entrevista' then p_interview_mode else interview_mode end,
    interview_operational_status = case when p_status = 'entrevista' then 'scheduled' else interview_operational_status end,
    interview_objective = case when p_status = 'entrevista' then trim(coalesce(p_note, '')) else interview_objective end,
    final_objection = case when p_status = 'cierre' then trim(coalesce(p_note, '')) else final_objection end,
    deposit_amount = case when p_status = 'sena' then p_deposit_amount else deposit_amount end,
    deposit_at = case when p_status = 'sena' then now() else deposit_at end,
    deposit_validation = case when p_status = 'sena' then trim(coalesce(p_deposit_validation, '')) else deposit_validation end,
    cold_base_at = null,
    previous_status = case when p_status = 'desistir' then v_previous_status else previous_status end,
    terminal_at = case when p_status = 'desistir' then now() else null end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = v_task.lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (v_task.lead_id, v_user_id, v_activity_type, v_title, trim(coalesce(p_note, '')),
    jsonb_build_object('previous_status', v_previous_status, 'status', p_status,
      'desist_reason', case when p_status = 'desistir' then p_desist_reason else null end,
      'next_contact_at', case when p_status in ('contacto_futuro', 'en_proceso') then p_next_contact_at else null end,
      'next_contact_note', case when p_status in ('contacto_futuro', 'en_proceso') then v_next_note else null end,
      'next_contact_source', case when p_status in ('contacto_futuro', 'en_proceso') then 'manual' else null end,
      'interview_at', p_interview_at, 'interview_location', trim(coalesce(p_interview_location, '')),
      'deposit_amount', p_deposit_amount, 'performed_at', p_performed_at));

  if p_status = 'desistir' and p_desist_reason = 'requested_no_contact' then
    perform private.apply_lead_opt_out(v_task.lead_id, trim(coalesce(p_note, '')));
  end if;
end;
$$;

revoke all on function public.record_contact_answer_with_transition(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.record_contact_answer_with_transition(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text, timestamptz, text, text, text) to authenticated;

create or replace function private.start_lead_crm_cycle(
  p_lead_id uuid,
  p_actor_user_id uuid,
  p_origin text,
  p_reason text,
  p_override_opt_out boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.lead_crm%rowtype;
  v_seller uuid;
  v_do_not_contact boolean;
begin
  select * into v_previous
  from public.lead_crm
  where lead_id = p_lead_id
  for update;
  if not found then raise exception 'No se encontró la ficha CRM del Lead'; end if;

  select assigned_seller_user_id, coalesce(do_not_contact, false)
  into v_seller, v_do_not_contact
  from public.leads
  where id = p_lead_id;
  if v_seller is null then raise exception 'El Lead todavía no tiene vendedor'; end if;

  if v_do_not_contact and not p_override_opt_out then
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (p_lead_id, p_actor_user_id, 'assignment', 'Nuevo ciclo bloqueado por opt-out',
      'El Lead solicitó no ser contactado; se preservó su estado y no se generó protocolo',
      jsonb_build_object('origin', p_origin, 'blocked', true, 'previous_status', v_previous.status));
    return;
  end if;

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
      'previous_desist_reason', v_previous.desist_reason,
      'previous_next_contact_at', v_previous.next_contact_at,
      'previous_next_contact_note', v_previous.next_contact_note,
      'previous_last_contact_at', v_previous.last_contact_at,
      'previous_last_contact_outcome', v_previous.last_contact_outcome,
      'previous_interview_at', v_previous.interview_at,
      'previous_interview_location', v_previous.interview_location,
      'previous_interview_mode', v_previous.interview_mode,
      'previous_interview_operational_status', v_previous.interview_operational_status,
      'previous_interview_objective', v_previous.interview_objective,
      'previous_final_objection', v_previous.final_objection,
      'previous_deposit_amount', v_previous.deposit_amount,
      'previous_deposit_at', v_previous.deposit_at,
      'previous_deposit_validation', v_previous.deposit_validation,
      'previous_post_deposit_action_at', v_previous.post_deposit_action_at,
      'previous_post_deposit_action_status', v_previous.post_deposit_action_status,
      'previous_terminal_at', v_previous.terminal_at,
      'previous_sale_confirmation_status', v_previous.sale_confirmation_status,
      'previous_sale_requested_at', v_previous.sale_requested_at,
      'previous_sale_confirmed_at', v_previous.sale_confirmed_at,
      'previous_vehicle_sold', v_previous.vehicle_sold,
      'previous_sale_amount', v_previous.sale_amount
    )
  );

  update public.lead_crm set
    status = 'nuevo',
    priority = 'normal',
    status_reason = '',
    desist_reason = null,
    next_contact_at = null,
    next_contact_note = '',
    next_contact_source = null,
    last_contact_at = null,
    last_contact_outcome = '',
    interview_at = null,
    interview_location = '',
    interview_mode = null,
    interview_operational_status = null,
    interview_objective = '',
    final_objection = '',
    deposit_amount = null,
    deposit_at = null,
    deposit_validation = '',
    post_deposit_action_at = null,
    post_deposit_action_status = null,
    previous_status = null,
    terminal_at = null,
    cold_base_at = null,
    sale_confirmation_status = 'none',
    sale_requested_at = null,
    sale_requested_by = null,
    sale_confirmed_at = null,
    sale_confirmed_by = null,
    vehicle_sold = '',
    sale_amount = null,
    updated_by = p_actor_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  -- A new cycle starts the En Gestión playbook clean. Completed items are
  -- reopened (never deleted); the append-only event log keeps every prior
  -- cycle's history intact via the existing audit trigger.
  update public.lead_management_playbook_items
  set completed = false
  where lead_id = p_lead_id and completed = true;

  -- Always guarantee exactly one active canonical protocol for the current
  -- seller after a successful reset, regardless of the previous status.
  -- create_lead_contact_sequence is idempotent (it returns the existing
  -- active sequence id instead of creating a duplicate), so this is safe to
  -- call unconditionally and safe to call again on a repeated/idempotent
  -- invocation of this function.
  perform private.create_lead_contact_sequence(p_lead_id, v_seller, now());
end;
$$;

revoke all on function private.start_lead_crm_cycle(uuid, uuid, text, text, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
