-- reactivate_lead_cycle only explicitly guaranteed a fresh CRM cycle when the
-- new seller matched the previous one; for a seller change it relied on
-- private.start_contact_sequence_after_assignment (the trigger on
-- public.leads) to do it instead. That trigger's own guard skips whenever
-- `new.do_not_contact` is true -- which an authorized opt-out override
-- reactivation never clears (do_not_contact must stay true). The result: an
-- opted-out Lead reactivated with an explicit override AND a different
-- seller got reassigned, but its CRM cycle/history was never reset by either
-- path -- it kept the stale previous-cycle CRM state instead of starting
-- clean in Nuevo.
--
-- Fix: call private.start_lead_crm_cycle explicitly in every case the
-- trigger will not already cover. The trigger's seller-change branch only
-- fires when NOT do_not_contact, so the explicit call here is needed for:
-- same seller (the trigger never fires on an unchanged seller, opted out or
-- not -- this was already the pre-existing correct behavior), and different
-- seller while opted out (previously missing -- this is the fix). When the
-- seller changes and the Lead is not opted out, the trigger still handles it
-- alone, so no double reset/duplicate activity log entry is introduced.
-- start_lead_crm_cycle's own opt-out guard still applies underneath (it only
-- proceeds with p_override_opt_out = true, which reactivate_lead_cycle has
-- already required above before reaching this point), so a Lead that
-- remains opted out never gets a protocol/automated contact generated.
create or replace function public.reactivate_lead_cycle(
  p_lead_id uuid,
  p_seller_user_id uuid,
  p_reason text,
  p_confirm_opt_out_override boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_previous_seller uuid;
  v_do_not_contact boolean;
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

  select assigned_seller_user_id, coalesce(do_not_contact, false)
  into v_previous_seller, v_do_not_contact
  from public.leads where id = p_lead_id for update;
  if not found then raise exception 'No se encontró el Lead'; end if;
  if v_do_not_contact and not p_confirm_opt_out_override then
    raise exception 'El Lead solicitó no ser contactado. Confirmá explícitamente la excepción para reactivarlo';
  end if;

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
    jsonb_build_object('origin', 'reactivation', 'previous_seller_user_id', v_previous_seller,
      'seller_user_id', p_seller_user_id, 'opt_out_override', v_do_not_contact and p_confirm_opt_out_override));

  -- The trigger already resets the cycle when the seller changes and the
  -- Lead is not opted out (do_not_contact = false at that point, since this
  -- function never touches it). Call it explicitly here in the two cases the
  -- trigger will not: same seller (its seller-change branch never fires),
  -- and a different seller while opted out (its own do_not_contact guard
  -- skips it, and only this explicit, already-authorized call may run it).
  if v_previous_seller is not distinct from p_seller_user_id or v_do_not_contact then
    perform private.start_lead_crm_cycle(p_lead_id, v_user_id, 'reactivation', v_reason, p_confirm_opt_out_override);
  end if;
end;
$$;

revoke all on function public.reactivate_lead_cycle(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.reactivate_lead_cycle(uuid, uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
