-- Permite múltiples propuestas comerciales por modelo y administra importes mensuales.

alter table public.campaigns drop constraint if exists campaigns_model_id_key;

alter table public.campaigns
  add column if not exists plan_name text,
  add column if not exists version_name text not null default '',
  add column if not exists transmission text not null default '',
  add column if not exists installment_count integer,
  add column if not exists advance_amount numeric(16, 2),
  add column if not exists installment_amount numeric(16, 2),
  add column if not exists installment_is_from boolean not null default true,
  add column if not exists sort_order integer not null default 10;

update public.campaigns campaign
set
  plan_name = coalesce(nullif(campaign.plan_name, ''), model.campaign_name),
  advance_amount = coalesce(
    campaign.advance_amount,
    nullif(regexp_replace(model.advance_text, '[^0-9]', '', 'g'), '')::numeric
  ),
  installment_amount = coalesce(
    campaign.installment_amount,
    nullif(regexp_replace(model.installment_text, '[^0-9]', '', 'g'), '')::numeric
  ),
  installment_is_from = model.installment_text ilike 'Desde %'
from public.models model
where model.id = campaign.model_id;

alter table public.campaigns alter column plan_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_plan_name_length'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_plan_name_length check (char_length(plan_name) between 2 and 80);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_version_name_length'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_version_name_length check (char_length(version_name) <= 80);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_transmission_values'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_transmission_values check (transmission in ('', 'MT', 'AT'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_installment_count_positive'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_installment_count_positive check (installment_count is null or installment_count > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_commercial_amounts_nonnegative'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_commercial_amounts_nonnegative check (
        (advance_amount is null or advance_amount >= 0)
        and (installment_amount is null or installment_amount >= 0)
      );
  end if;
end
$$;

create index if not exists campaigns_model_sort_idx
  on public.campaigns (model_id, sort_order, active);

update public.campaigns campaign
set
  plan_name = 'Plan 80/20',
  version_name = 'Allure',
  transmission = 'MT',
  installment_count = 84,
  sort_order = 20
from public.models model
join public.brands brand on brand.id = model.brand_id
where campaign.model_id = model.id
  and brand.name = 'Peugeot'
  and model.name = '208'
  and campaign.plan_name = 'Plan 80/20';

insert into public.campaigns (
  model_id, active, plan_name, version_name, transmission, installment_count,
  advance_amount, installment_amount, installment_is_from, bonus, benefits,
  slots, valid_from, valid_to, timer_hours, sort_order
)
select
  base.model_id, false, offer.plan_name, 'Allure', offer.transmission, offer.installment_count,
  null, null, true, base.bonus, base.benefits,
  null, base.valid_from, base.valid_to, base.timer_hours, offer.sort_order
from public.campaigns base
join public.models model on model.id = base.model_id
join public.brands brand on brand.id = model.brand_id
cross join (
  values
    ('Plan 70/30', 'MT', 120, 10),
    ('Plan 100%', 'AT', 84, 30)
) as offer(plan_name, transmission, installment_count, sort_order)
where brand.name = 'Peugeot'
  and model.name = '208'
  and base.plan_name = 'Plan 80/20'
  and not exists (
    select 1
    from public.campaigns existing
    where existing.model_id = base.model_id
      and existing.plan_name = offer.plan_name
      and existing.version_name = 'Allure'
      and existing.transmission = offer.transmission
      and existing.installment_count = offer.installment_count
  );
