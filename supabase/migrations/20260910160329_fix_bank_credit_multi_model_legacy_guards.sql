-- Remove legacy single-model guards superseded by the canonical multi-model
-- applicability relation in bank_credit_offer_versions.

-- This trigger encoded the old invariant bank_credit_offers.model_id = model_versions.model_id.
-- New multi-model offers intentionally keep bank_credit_offers.model_id NULL, so the link itself
-- is the canonical applicability record and the Admin RPC validates that linked versions/models
-- are active before writing them.
drop trigger if exists bank_credit_offer_versions_validate on public.bank_credit_offer_versions;
drop function if exists private.validate_bank_credit_version_model();

-- Keep savings-plan price enforcement in the original generic quote validator, but delegate every
-- bank-credit applicability check to private.validate_sales_quote_bank_credit_applicability(),
-- which validates offer status/validity plus the selected model/version through the link table.
create or replace function private.validate_sales_quote_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final_price numeric(16, 2);
begin
  if new.offer_type = 'savings_plan' then
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

revoke all on function private.validate_sales_quote_offer() from public, anon, authenticated;
