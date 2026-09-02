-- Keep seller CRM closures from failing when a Lead has an incomplete name.

create or replace function private.queue_cold_lead_for_recall()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_customer_name text;
begin
  if new.status = 'desistir' and old.status is distinct from new.status then
    select * into v_lead from public.leads where id = new.lead_id;

    v_customer_name := left(trim(coalesce(v_lead.customer_name, '')), 120);
    if char_length(v_customer_name) < 2 then
      v_customer_name := 'Cliente sin nombre';
    end if;

    if not v_lead.do_not_contact
      and not exists (select 1 from public.sales_cases where lead_id = new.lead_id)
    then
      insert into public.lead_recall_items (
        lead_id, customer_name, customer_phone, model_interest, source_detail,
        original_inquiry_at, available_at
      ) values (
        new.lead_id,
        v_customer_name,
        v_lead.customer_phone,
        coalesce(v_lead.model_interest, ''),
        coalesce(v_lead.source_detail, ''),
        v_lead.created_at,
        now() + interval '15 days'
      ) on conflict (lead_id) where status in ('available', 'assigned', 'working')
      do update set
        available_at = least(public.lead_recall_items.available_at, excluded.available_at),
        updated_at = now();
    end if;
  elsif new.status not in ('desistir', 'invalido', 'venta') and old.status = 'desistir' then
    update public.lead_recall_items
    set status = 'cancelled', updated_at = now()
    where lead_id = new.lead_id and status in ('available', 'assigned', 'working');
  end if;
  return new;
end;
$$;

revoke all on function private.queue_cold_lead_for_recall() from public, anon, authenticated;
