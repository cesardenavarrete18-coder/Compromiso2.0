-- Cover foreign keys used by operational joins and cascading updates.
create index commercial_goals_seller_idx on public.commercial_goals (seller_user_id);
create index commercial_goals_created_by_idx on public.commercial_goals (created_by);
create index contact_message_templates_updated_by_idx on public.contact_message_templates (updated_by);
create index lead_contact_tasks_completed_by_idx on public.lead_contact_tasks (completed_by);
create index lead_contact_tasks_template_idx on public.lead_contact_tasks (template_id);

-- A reassignment must move the protocol to the new owner instead of leaving
-- pending actions in the previous seller's agenda.
create or replace function private.start_contact_sequence_after_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_seller_user_id is not null
    and (tg_op = 'INSERT' or old.assigned_seller_user_id is distinct from new.assigned_seller_user_id)
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    update public.lead_contact_sequences
    set status = 'cancelled', completed_at = now(), stopped_reason = 'Lead reasignado a otro vendedor'
    where lead_id = new.id
      and status = 'active'
      and seller_user_id is distinct from new.assigned_seller_user_id;

    update public.lead_contact_tasks
    set status = 'cancelled', updated_at = now()
    where lead_id = new.id
      and status = 'pending'
      and seller_user_id is distinct from new.assigned_seller_user_id;

    perform private.create_lead_contact_sequence(new.id, new.assigned_seller_user_id, coalesce(new.assigned_at, now()));
  end if;
  return new;
end;
$$;

revoke all on function private.start_contact_sequence_after_assignment() from public, anon, authenticated;
