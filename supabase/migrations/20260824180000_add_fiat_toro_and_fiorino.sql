-- Add the Fiat Toro and Fiorino catalog entries with their current commercial offers.
-- The statements are idempotent so the migration can safely reconcile pre-existing rows.

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
  offer.name,
  offer.image_path,
  offer.campaign_name,
  offer.short_description,
  offer.advance_text,
  offer.installment_text,
  offer.sort_order,
  true
from public.brands brand
cross join (
  values
    (
      'Toro',
      '/assets/fiat-toro-catalog-v2.webp',
      'Plan 70/30',
      'Pick-up versátil para trabajo y uso personal.',
      '$15.573.000',
      'Desde $701.881',
      70
    ),
    (
      'Fiorino',
      '/assets/fiat-fiorino-catalog-v2.webp',
      'Plan 70/30',
      'Utilitario compacto para trabajo y uso comercial.',
      '$9.663.000',
      'Desde $465.604',
      80
    )
) as offer(
  name,
  image_path,
  campaign_name,
  short_description,
  advance_text,
  installment_text,
  sort_order
)
where brand.name = 'Fiat'
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

with offer_data as (
  select *
  from (
    values
      ('Toro', 'Plan 70/30', 'Freedom T270', 84, 51910000::numeric, 15573000::numeric, 701881::numeric, 2, 24),
      ('Fiorino', 'Plan 70/30', 'Endurance 1.4', 84, 32210000::numeric, 9663000::numeric, 465604::numeric, 2, 24)
  ) as offer(
    model_name,
    plan_name,
    version_name,
    installment_count,
    final_price,
    advance_amount,
    installment_amount,
    slots,
    timer_hours
  )
)
update public.campaigns campaign
set
  transmission = '',
  installment_count = offer.installment_count,
  final_price = offer.final_price,
  advance_amount = offer.advance_amount,
  installment_amount = offer.installment_amount,
  installment_is_from = true,
  slots = offer.slots,
  valid_from = null,
  valid_to = null,
  timer_hours = offer.timer_hours,
  sort_order = 10,
  active = true,
  updated_at = now()
from offer_data offer
join public.brands brand on brand.name = 'Fiat'
join public.models model
  on model.brand_id = brand.id
  and model.name = offer.model_name
where campaign.model_id = model.id
  and campaign.plan_name = offer.plan_name
  and campaign.version_name = offer.version_name;

with offer_data as (
  select *
  from (
    values
      ('Toro', 'Plan 70/30', 'Freedom T270', 84, 51910000::numeric, 15573000::numeric, 701881::numeric, 2, 24),
      ('Fiorino', 'Plan 70/30', 'Endurance 1.4', 84, 32210000::numeric, 9663000::numeric, 465604::numeric, 2, 24)
  ) as offer(
    model_name,
    plan_name,
    version_name,
    installment_count,
    final_price,
    advance_amount,
    installment_amount,
    slots,
    timer_hours
  )
)
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
  offer.plan_name,
  offer.version_name,
  '',
  offer.installment_count,
  offer.final_price,
  offer.advance_amount,
  offer.installment_amount,
  true,
  offer.slots,
  null,
  null,
  offer.timer_hours,
  10,
  true
from offer_data offer
join public.brands brand on brand.name = 'Fiat'
join public.models model
  on model.brand_id = brand.id
  and model.name = offer.model_name
where not exists (
  select 1
  from public.campaigns existing
  where existing.model_id = model.id
    and existing.plan_name = offer.plan_name
    and existing.version_name = offer.version_name
);
