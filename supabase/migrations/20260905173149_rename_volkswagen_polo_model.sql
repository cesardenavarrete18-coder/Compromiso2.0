-- Rename the Volkswagen Polo catalog entry while preserving its stable model ID
-- and every campaign, quote, and sales relationship attached to it.

do $$
declare
  v_old_model_id uuid;
  v_existing_polo_id uuid;
begin
  select model.id
    into v_old_model_id
  from public.models model
  join public.brands brand on brand.id = model.brand_id
  where brand.name = 'Volkswagen'
    and model.name = 'Polo Robust';

  select model.id
    into v_existing_polo_id
  from public.models model
  join public.brands brand on brand.id = model.brand_id
  where brand.name = 'Volkswagen'
    and model.name = 'Polo';

  if v_old_model_id is not null
     and v_existing_polo_id is not null
     and v_existing_polo_id <> v_old_model_id then
    raise exception 'Cannot rename Volkswagen Polo Robust: a different Volkswagen Polo row already exists';
  end if;

  update public.models
  set
    name = 'Polo',
    updated_at = now()
  where id = v_old_model_id;
end
$$;

-- Normalize structured CRM data so current records render the new canonical
-- model name. Free-text notes, activity history, and notification history are
-- intentionally preserved as originally recorded.
update public.leads
set model_interest = 'Volkswagen Polo'
where lower(trim(model_interest)) in ('polo robust', 'volkswagen polo robust');

update public.commercial_applications
set model_name = 'Polo'
where lower(trim(model_name)) in ('polo robust', 'volkswagen polo robust');

update public.commercial_applications
set commercial_snapshot = jsonb_set(
  commercial_snapshot,
  '{vehicle}',
  to_jsonb(regexp_replace(commercial_snapshot ->> 'vehicle', 'Polo[[:space:]]+Robust', 'Polo', 'gi')),
  false
)
where commercial_snapshot ->> 'vehicle' ~* 'Polo[[:space:]]+Robust';

update public.sales_quotes
set commercial_snapshot = jsonb_set(
  commercial_snapshot,
  '{model}',
  to_jsonb('Polo'::text),
  false
)
where lower(trim(commercial_snapshot ->> 'model')) = 'polo robust';

update public.lead_crm
set vehicle_sold = regexp_replace(vehicle_sold, 'Polo[[:space:]]+Robust', 'Polo', 'gi')
where vehicle_sold ~* 'Polo[[:space:]]+Robust';

update public.lead_sale_requests
set vehicle = regexp_replace(vehicle, 'Polo[[:space:]]+Robust', 'Polo', 'gi')
where vehicle ~* 'Polo[[:space:]]+Robust';

update public.sales_cases
set vehicle = regexp_replace(vehicle, 'Polo[[:space:]]+Robust', 'Polo', 'gi')
where vehicle ~* 'Polo[[:space:]]+Robust';
