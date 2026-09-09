-- CRM V2 Production compatibility for the historical Recall workflow.
--
-- This migration is intentionally forward-only and runs AFTER the CRM V2
-- release-hardening migrations. It closes two legacy paths that pre-date the
-- canonical CRM V2 contract:
--   1) cold_base_at used to mean "eligible for recall" and was written by
--      imports / two-call recall exhaustion. In CRM V2 it exclusively means
--      verified exhaustion of the canonical 18-call / 9-band protocol.
--   2) an answered recall used to jump directly from Desistir to En Gestión.
--      It now opens a new commercial cycle first and then enters En Gestión
--      through the canonical follow-up RPC, preserving history and resetting
--      the Playbook.
--
-- No Lead, customer, recall item, recall attempt, activity or assignment is
-- deleted by this migration. Historical false cold-base markers are cleared;
-- recall membership remains in public.lead_recall_items.

create or replace function private.lead_has_canonical_cold_base_evidence(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lead_contact_sequences sequence
    where sequence.lead_id = p_lead_id
      and (
        select
          count(*) filter (where task.channel = 'call') = 18
          and count(*) filter (
            where task.channel = 'call'
              and task.status = 'completed'
              and task.outcome = 'no_answer'
          ) = 18
          and count(distinct (task.protocol_day, task.protocol_band))
            filter (where task.channel = 'call') = 9
          and count(*) filter (where task.outcome = 'answered') = 0
        from public.lead_contact_tasks task
        where task.sequence_id = sequence.id
      )
  );
$$;

revoke all on function private.lead_has_canonical_cold_base_evidence(uuid)
  from public, anon, authenticated;

create or replace function private.guard_canonical_cold_base_marker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fail closed without breaking a legacy caller: any attempt to set a
  -- non-canonical marker is normalized back to NULL. The commercial status,
  -- recall item and activity history remain untouched.
  if new.cold_base_at is not null
     and old.cold_base_at is distinct from new.cold_base_at
     and (
       new.status <> 'desistir'
       or new.status_reason is distinct from 'No contactado post protocolo'
       or not private.lead_has_canonical_cold_base_evidence(new.lead_id)
     )
  then
    new.cold_base_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_canonical_cold_base_marker()
  from public, anon, authenticated;

drop trigger if exists lead_crm_guard_canonical_cold_base on public.lead_crm;
create trigger lead_crm_guard_canonical_cold_base
before update of cold_base_at on public.lead_crm
for each row execute function private.guard_canonical_cold_base_marker();

-- Historical reconciliation. This only clears the old classification marker;
-- the Lead remains Desistir and every recall row/history record is preserved.
update public.lead_crm crm
set cold_base_at = null
where crm.cold_base_at is not null
  and not private.lead_has_canonical_cold_base_evidence(crm.lead_id);

-- A pending sale that was already Desistir before the new close-on-desistir
-- trigger existed must be reconciled once. Future cases are handled by the
-- trigger installed in crm_v2_release_hardening.
with rejected as (
  update public.lead_sale_requests request
  set status = 'rejected',
      reviewed_by = coalesce(request.reviewed_by, crm.updated_by),
      reviewed_at = coalesce(request.reviewed_at, now()),
      review_note = 'Cancelada automáticamente: el cliente desistió antes de la confirmación administrativa'
  from public.lead_crm crm
  where request.lead_id = crm.lead_id
    and request.status = 'pending'
    and crm.status = 'desistir'
  returning request.lead_id, request.reviewed_by
)
insert into public.lead_activities (
  lead_id, actor_user_id, activity_type, title, detail, metadata
)
select
  rejected.lead_id,
  rejected.reviewed_by,
  'sale_confirmation',
  'Venta pendiente cancelada por desistimiento',
  'Cancelada automáticamente: el cliente desistió antes de la confirmación administrativa',
  jsonb_build_object('approved', false, 'origin', 'release_reconciliation')
from rejected;

-- Legacy Recall RPC rewritten on top of CRM V2 invariants.
create or replace function public.record_recall_attempt(
  p_item_id uuid,
  p_time_band text,
  p_outcome text,
  p_contacted_at timestamptz,
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

    -- Mark converted first so the existing Desistir->Nuevo cycle trigger does
    -- not cancel the same Recall item while the new cycle is opened.
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

    -- Seller changes already open the cycle through the canonical assignment
    -- trigger. Same-seller reactivation does not, so ensure the cycle exactly
    -- once by checking the resulting CRM state.
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

    -- Enter En Gestión through the canonical RPC. This cancels the temporary
    -- Nuevo protocol and applies the new-playbook/next-contact invariants.
    perform public.record_lead_follow_up(
      p_lead_id => v_item.lead_id,
      p_status => 'en_proceso',
      p_note => coalesce(nullif(trim(p_note), ''), 'Rellamado respondido'),
      p_next_contact_at => p_next_contact_at,
      p_next_contact_note => coalesce(nullif(trim(p_next_contact_note), ''), 'Próximo contacto acordado'),
      p_contact_outcome => 'Rellamado respondido',
      p_priority => 'normal'
    );

    -- Preserve the effective call time rather than replacing it with the
    -- database recording time used by the generic follow-up RPC.
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

    -- Exhausting the two-call Recall workflow closes that Recall item only.
    -- It never classifies Base fría; that marker belongs exclusively to 18/9.
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
$$;

revoke all on function public.record_recall_attempt(uuid, text, text, timestamptz, text, timestamptz, text)
  from public, anon;
grant execute on function public.record_recall_attempt(uuid, text, text, timestamptz, text, timestamptz, text)
  to authenticated;

comment on function public.record_recall_attempt(uuid, text, text, timestamptz, text, timestamptz, text)
  is 'CRM V2 Recall: answered opens a new cycle then En Gestión; recall exhaustion never creates Base fría.';

notify pgrst, 'reload schema';
