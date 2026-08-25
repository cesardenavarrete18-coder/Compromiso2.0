-- Add Volkswagen Polo Robust to the catalog with its current commercial offer.
-- The statements reconcile matching rows so the migration remains idempotent.

insert into public.models (
  brand_id,
  name,
  image_path,
  campaign_name,
  short_description,
  advance_text,
  installment_text,
  sort_order,
  active
)
select
  brand.id,
  'Polo Robust',
  '/assets/vw-polo-robust-catalog-v2.webp',
  'Plan 70/30',
  'Hatchback práctico con configuración robusta para uso diario.',
  '$8.932.770',
  'Desde $342.000',
  70,
  true
from public.brands brand
where brand.name = 'Volkswagen'
on conflict (brand_id, name) do update
set
  image_path = excluded.image_path,
  campaign_name = excluded.campaign_name,
  short_description = excluded.short_description,
  advance_text = excluded.advance_text,
  installment_text = excluded.installment_text,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

update public.campaigns campaign
set
  transmission = 'MT',
  installment_count = 84,
  final_price = 29775900,
  advance_amount = 8932770,
  installment_amount = 342000,
  installment_is_from = true,
  slots = 2,
  valid_from = null,
  valid_to = null,
  timer_hours = 24,
  sort_order = 10,
  active = true,
  updated_at = now()
from public.models model
join public.brands brand on brand.id = model.brand_id
where campaign.model_id = model.id
  and brand.name = 'Volkswagen'
  and model.name = 'Polo Robust'
  and campaign.plan_name = 'Plan 70/30'
  and campaign.version_name = '1.6 MSI';

insert into public.campaigns (
  model_id,
  plan_name,
  version_name,
  transmission,
  installment_count,
  final_price,
  advance_amount,
  installment_amount,
  installment_is_from,
  slots,
  valid_from,
  valid_to,
  timer_hours,
  sort_order,
  active
)
select
  model.id,
  'Plan 70/30',
  '1.6 MSI',
  'MT',
  84,
  29775900,
  8932770,
  342000,
  true,
  2,
  null,
  null,
  24,
  10,
  true
from public.models model
join public.brands brand on brand.id = model.brand_id
where brand.name = 'Volkswagen'
  and model.name = 'Polo Robust'
  and not exists (
    select 1
    from public.campaigns existing
    where existing.model_id = model.id
      and existing.plan_name = 'Plan 70/30'
      and existing.version_name = '1.6 MSI'
  );
