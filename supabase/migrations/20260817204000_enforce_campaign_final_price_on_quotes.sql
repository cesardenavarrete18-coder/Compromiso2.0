-- A savings-plan quote must always use the final price stored in its campaign.
-- Bonuses and benefits stay informational and never change this amount.

create or replace function private.validate_sales_quote_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final_price numeric(16, 2);
begin
  if new.offer_type = 'bank_credit' then
    if not exists (
      select 1
      from public.bank_credit_offers offer
      join public.bank_credit_offer_versions link on link.offer_id = offer.id
      join public.model_versions version on version.id = link.version_id
      where offer.id = new.bank_credit_offer_id
        and offer.model_id = new.model_id
        and version.model_id = offer.model_id
        and version.name = new.vehicle_version
        and version.active = true
        and offer.active = true
        and (offer.valid_from is null or offer.valid_from <= current_date)
        and (offer.valid_to is null or offer.valid_to >= current_date)
    ) then
      raise exception 'La línea de crédito no está habilitada para la versión seleccionada';
    end if;
  else
    select campaign.final_price
      into v_final_price
    from public.campaigns campaign
    where campaign.id = new.campaign_id
      and campaign.model_id = new.model_id
      and campaign.active = true
      and (campaign.valid_from is null or campaign.valid_from <= current_date)
      and (campaign.valid_to is null or campaign.valid_to >= current_date);

    if not found then
      raise exception 'El plan seleccionado no está vigente para este modelo';
    end if;

    if v_final_price is null or v_final_price <= 0 then
      raise exception 'El plan seleccionado todavía no tiene un valor final vigente';
    end if;

    new.sale_price := v_final_price;
  end if;

  return new;
end;
$$;

drop trigger if exists sales_quotes_validate_offer on public.sales_quotes;

create trigger sales_quotes_validate_offer
before insert or update of offer_type, model_id, campaign_id, bank_credit_offer_id, vehicle_version, sale_price
on public.sales_quotes
for each row
execute function private.validate_sales_quote_offer();
