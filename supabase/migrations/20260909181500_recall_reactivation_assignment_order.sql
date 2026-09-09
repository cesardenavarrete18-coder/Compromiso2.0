-- Recall reactivation ordering fix.
--
-- The generic seller-change trigger normally starts a new CRM cycle inside the
-- same UPDATE that changes assigned_seller_user_id. For seller-initiated
-- Recall conversion this is too early: the En Gestión Playbook audit still
-- evaluates assignment while the parent UPDATE is in progress and can reject
-- the reset. The Recall RPC already owns this transition and explicitly calls
-- private.start_lead_crm_cycle immediately after the assignment UPDATE.
--
-- Therefore routing_reason = 'recall_reactivated' is the one seller-change
-- case delegated to the Recall RPC. All normal assignment / transfer /
-- authorized-reactivation behavior remains unchanged.

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
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.create_lead_contact_sequence(
      new.id,
      new.assigned_seller_user_id,
      greatest(coalesce(new.assigned_at, now()), now())
    );

  elsif new.assigned_seller_user_id is not null
    and old.assigned_seller_user_id is distinct from new.assigned_seller_user_id
    and coalesce(new.routing_reason, '') <> 'recall_reactivated'
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.start_lead_crm_cycle(
      new.id,
      coalesce(new.assigned_by_user_id, new.assigned_seller_user_id),
      case
        when new.routing_reason = 'authorized_reactivation' then 'reactivation'
        when old.assigned_seller_user_id is null then 'assignment'
        else 'transfer'
      end,
      case
        when new.routing_reason = 'authorized_reactivation' then 'Lead reactivado con autorización'
        when old.assigned_seller_user_id is null then 'Lead asignado'
        else 'Lead transferido a otro vendedor'
      end
    );
  end if;

  return new;
end;
$$;

revoke all on function private.start_contact_sequence_after_assignment()
  from public, anon, authenticated;

comment on function private.start_contact_sequence_after_assignment()
  is 'Assignment/transfer cycle trigger; recall_reactivated is intentionally delegated to record_recall_attempt after assignment is visible.';
