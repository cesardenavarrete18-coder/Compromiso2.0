-- Two corrections to public.supervisor_manage_lead
-- (20260909140100_supervisor_manage_lead_v2_hardening.sql), found in a
-- follow-up audit. That migration is already applied; this is a new
-- forward-only correction, not an edit to it.
--
-- 1) Sin contacto was never idempotent: every 'status' call with
--    p_status = 'no_contesta' unconditionally cancelled the protocol before
--    recreating it, including a no_contesta -> no_contesta call (e.g. a
--    resubmission). That cancel+recreate discarded the valid active
--    sequence's completed attempts and handed back a brand new sequence id.
--    private.create_lead_contact_sequence is already idempotent on its own
--    (it looks up and returns the existing active sequence for the lead
--    instead of creating a duplicate - see its own definition), so the fix
--    is simply to stop cancelling first: entering Sin contacto from another
--    state still ends up with exactly one protocol (there was none to
--    begin with), Sin contacto -> Sin contacto now preserves the existing
--    sequence and its completed attempts untouched, and a Sin contacto Lead
--    with no active sequence at all (a historical anomaly) still gets
--    exactly one created.
-- 2) 'schedule' only failed closed for a Lead already in Sin contacto,
--    letting a manual next action be programmed on a Nuevo Lead and, via
--    the unconditional cancel_lead_contact_protocol a few lines below,
--    leave it as "Nuevo + manual next_contact_at + cancelled protocol" -
--    exactly the state the canonical protocol is supposed to prevent. Nuevo
--    joins Sin contacto in the same fail-closed guard: a Nuevo Lead's first
--    action is always the canonical protocol.
create or replace function public.supervisor_manage_lead(
  p_lead_id uuid,
  p_action text,
  p_status text default null,
  p_priority text default null,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default '',
  p_contact_outcome text default '',
  p_desist_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    -- Nuevo and Sin contacto's próxima acción are both protocol-driven.
    -- Mixing a manual commitment into either here would silently cancel the
    -- canonical protocol; reject instead of choosing one concept over the
    -- other implicitly.
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
    -- Same mandatory structured reason as the seller-facing RPCs. Application
    -- level only; historical rows and the automatic exhaustion path are unaffected.
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
    -- Sin contacto is NOT cancelled here anymore, on purpose: doing so
    -- unconditionally broke idempotency for a no_contesta -> no_contesta
    -- call (see migration header). private.create_lead_contact_sequence
    -- below is itself idempotent and is the only thing that needs to run.

    update public.lead_crm set
      status = p_status,
      priority = case when p_status = 'cierre' then 'high' else p_priority end,
      status_reason = case when p_status in ('invalido', 'desistir') then trim(p_note) else status_reason end,
      desist_reason = case when p_status = 'desistir' then p_desist_reason else desist_reason end,
      next_contact_at = case when p_status in ('invalido', 'desistir', 'no_contesta') then null else next_contact_at end,
      next_contact_note = case when p_status in ('invalido', 'desistir', 'no_contesta') then '' else next_contact_note end,
      next_contact_source = case when p_status in ('invalido', 'desistir', 'no_contesta') then null else next_contact_source end,
      -- Base fría is exclusively the automatic protocol-exhaustion signal
      -- (record_contact_task_result). cold_base_at is deliberately absent
      -- from this SET clause: a manual Desistir by Supervisor never touches it.
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = p_lead_id;

    if p_status = 'desistir' and p_desist_reason = 'requested_no_contact' then
      perform private.apply_lead_opt_out(p_lead_id, trim(coalesce(p_note, '')));
    end if;

    if p_status = 'no_contesta' then
      -- Idempotent: returns the existing active sequence (preserving its
      -- completed attempts and id) whenever one already exists for this
      -- Lead, and only creates a fresh one when there truly is none -
      -- whether this is a transition into Sin contacto or a repeated call
      -- while already there.
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

  -- Legacy free-text "Registrar gestión". It has no task id and no final
  -- commercial status to offer, so it can never atomically close a real
  -- protocol task the way record_contact_answer_with_transition does. Rather
  -- than invent a commercial result (previously: silently forcing en_proceso
  -- and unconditionally cancelling the protocol for ANY outcome, even
  -- no_answer/sent), it fails closed for the one case that would require that
  -- guarantee, and never touches the protocol otherwise.
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
$$;

revoke all on function public.supervisor_manage_lead(uuid, text, text, text, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.supervisor_manage_lead(uuid, text, text, text, text, timestamptz, text, text, text) to authenticated;

notify pgrst, 'reload schema';
