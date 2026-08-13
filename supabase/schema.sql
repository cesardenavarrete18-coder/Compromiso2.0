-- Grupo Sur Automotores - portal comercial
-- Esquema inicial para autenticación, campañas y auditoría.
-- Los cupos se administran manualmente: no existe ningún trigger que los descuente.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('admin', 'seller');

create table public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.app_role not null default 'seller',
  seller_code text not null,
  full_name text not null,
  phone text,
  contact_email text,
  active boolean not null default true,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_invites_email_normalized check (email = lower(trim(email))),
  constraint user_invites_seller_code_format check (seller_code ~ '^[A-Z0-9_-]{3,20}$'),
  constraint user_invites_phone_length check (phone is null or char_length(phone) between 6 and 30),
  constraint user_invites_contact_email_format check (contact_email is null or (contact_email = lower(trim(contact_email)) and char_length(contact_email) <= 254 and contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'))
);

create unique index user_invites_email_unique on public.user_invites (lower(email));
create unique index user_invites_seller_code_unique on public.user_invites (upper(seller_code));
create unique index user_invites_contact_email_unique on public.user_invites (lower(contact_email)) where contact_email is not null and accepted_at is null and active = true;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.app_role not null,
  seller_code text not null,
  full_name text not null,
  phone text,
  contact_email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_seller_code_format check (seller_code ~ '^[A-Z0-9_-]{3,20}$'),
  constraint profiles_phone_length check (phone is null or char_length(phone) between 6 and 30),
  constraint profiles_contact_email_format check (contact_email is null or (contact_email = lower(trim(contact_email)) and char_length(contact_email) <= 254 and contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'))
);

create unique index profiles_email_unique on public.profiles (lower(email));
create unique index profiles_seller_code_unique on public.profiles (upper(seller_code));
create unique index profiles_contact_email_unique on public.profiles (lower(contact_email)) where contact_email is not null;
create index profiles_active_role_idx on public.profiles (role, active);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  image_path text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brands_active_sort_idx on public.brands (active, sort_order);

create table public.models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  image_path text not null,
  campaign_name text not null,
  short_description text not null default '',
  advance_text text not null default 'A confirmar',
  installment_text text not null default 'A confirmar',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

create index models_brand_active_sort_idx on public.models (brand_id, active, sort_order);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  plan_name text not null,
  version_name text not null default '',
  transmission text not null default '',
  installment_count integer,
  advance_amount numeric(16, 2),
  installment_amount numeric(16, 2),
  installment_is_from boolean not null default true,
  sort_order integer not null default 10,
  active boolean not null default true,
  bonus text not null default 'Consultar bonificación vigente',
  benefits text[] not null default array['Asesoramiento personalizado', 'Condiciones sujetas a disponibilidad']::text[],
  slots integer,
  valid_from date,
  valid_to date,
  timer_hours integer not null default 24,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_slots_nonnegative check (slots is null or slots >= 0),
  constraint campaigns_plan_name_length check (char_length(plan_name) between 2 and 80),
  constraint campaigns_version_name_length check (char_length(version_name) <= 80),
  constraint campaigns_transmission_values check (transmission in ('', 'MT', 'AT')),
  constraint campaigns_installment_count_positive check (installment_count is null or installment_count > 0),
  constraint campaigns_commercial_amounts_nonnegative check (
    (advance_amount is null or advance_amount >= 0)
    and (installment_amount is null or installment_amount >= 0)
  ),
  constraint campaigns_valid_dates check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint campaigns_timer_range check (timer_hours between 1 and 720)
);

create index campaigns_active_dates_idx on public.campaigns (active, valid_from, valid_to);
create index campaigns_model_sort_idx on public.campaigns (model_id, sort_order, active);
create index campaigns_updated_by_idx on public.campaigns (updated_by);

create table public.campaign_audit_log (
  id bigint generated always as identity primary key,
  campaign_id uuid references public.campaigns (id) on delete set null,
  changed_by uuid references auth.users (id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  previous_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index campaign_audit_log_campaign_time_idx on public.campaign_audit_log (campaign_id, changed_at desc);
create index campaign_audit_log_actor_time_idx on public.campaign_audit_log (changed_by, changed_at desc);

create table public.prequalification_events (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  model_id uuid not null references public.models (id) on delete restrict,
  campaign_id uuid references public.campaigns (id) on delete set null,
  request_code text not null unique,
  customer_initials text not null,
  cuil_last4 text not null,
  customer_name text,
  customer_phone text,
  customer_document text,
  model_name text,
  seller_name text,
  timer_hours integer not null,
  valid_until timestamptz not null,
  campaign_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint prequalification_initials_length check (char_length(customer_initials) between 2 and 12),
  constraint prequalification_cuil_last4 check (cuil_last4 ~ '^\d{4}$'),
  constraint prequalification_customer_name check (customer_name is null or char_length(customer_name) between 2 and 120),
  constraint prequalification_customer_phone check (customer_phone is null or char_length(customer_phone) between 6 and 30),
  constraint prequalification_customer_document check (customer_document is null or customer_document ~ '^\d{7,9}$'),
  constraint prequalification_model_name check (model_name is null or char_length(model_name) between 1 and 80),
  constraint prequalification_seller_name check (seller_name is null or char_length(seller_name) between 2 and 120),
  constraint prequalification_export_data_complete check (
    (customer_name is null and customer_phone is null and customer_document is null and model_name is null and seller_name is null)
    or
    (customer_name is not null and customer_phone is not null and customer_document is not null and model_name is not null and seller_name is not null)
  ),
  constraint prequalification_timer_range check (timer_hours between 1 and 720)
);

create index prequalification_events_seller_time_idx on public.prequalification_events (seller_user_id, created_at desc);
create index prequalification_events_model_time_idx on public.prequalification_events (model_id, created_at desc);
create index prequalification_events_campaign_idx on public.prequalification_events (campaign_id);

create table public.commercial_applications (
  id uuid primary key default gen_random_uuid(),
  prequalification_event_id uuid not null unique references public.prequalification_events (id) on delete cascade,
  seller_user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  request_code text not null unique,
  brand_name text not null,
  model_name text not null,
  campaign_name text not null,
  first_name text not null,
  last_name text not null,
  document_type text not null,
  document_number text not null,
  cuil text not null,
  birth_date date not null,
  address text not null,
  city_province text not null,
  postal_code text not null,
  marital_status text not null,
  spouse_name text,
  spouse_document text,
  primary_phone text not null,
  alternate_phone text,
  email text not null,
  contact_schedule text not null,
  employment_status text not null,
  employer_name text not null,
  employment_seniority text not null,
  monthly_income numeric(16, 2) not null,
  automatic_debit boolean not null,
  deferred_installment boolean not null,
  installments_paid integer not null default 0,
  installments_to_pay integer not null,
  plan_type text not null,
  agreed_price numeric(16, 2) not null,
  first_payment_date date,
  first_payment_amount numeric(16, 2),
  second_payment_date date,
  second_payment_amount numeric(16, 2),
  status text not null default 'completed',
  terms_version text not null,
  confirmed_at timestamptz not null,
  commercial_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_applications_document_number check (document_number ~ '^\d{7,12}$'),
  constraint commercial_applications_cuil check (cuil ~ '^\d{11}$'),
  constraint commercial_applications_amounts check (
    monthly_income >= 0 and agreed_price >= 0
    and (first_payment_amount is null or first_payment_amount >= 0)
    and (second_payment_amount is null or second_payment_amount >= 0)
  ),
  constraint commercial_applications_installments check (installments_paid >= 0 and installments_to_pay > 0),
  constraint commercial_applications_payment_pairs check (
    (first_payment_date is null) = (first_payment_amount is null)
    and (second_payment_date is null) = (second_payment_amount is null)
  ),
  constraint commercial_applications_status check (status in ('completed', 'cancelled'))
);

create index commercial_applications_seller_time_idx on public.commercial_applications (seller_user_id, created_at desc);
create index commercial_applications_prequalification_idx on public.commercial_applications (prequalification_event_id);

create function private.current_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and active = true
  );
$$;

create function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'admin'::public.app_role
      and active = true
  );
$$;

revoke all on function private.current_user_active() from public;
revoke all on function private.current_user_is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_active() to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

create function private.authorize_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.user_invites%rowtype;
begin
  select * into pending
  from public.user_invites
  where lower(email) = lower(new.email)
    and active = true
    and accepted_at is null
  limit 1;

  if not found then
    raise exception 'Este correo no tiene una invitación activa.';
  end if;

  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', pending.role::text,
    'seller_code', pending.seller_code
  );
  return new;
end;
$$;

create function private.create_profile_for_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.user_invites%rowtype;
begin
  select * into pending
  from public.user_invites
  where lower(email) = lower(new.email)
    and active = true
    and accepted_at is null
  limit 1;

  if not found then
    raise exception 'No se encontró la invitación al crear el perfil.';
  end if;

  insert into public.profiles (user_id, email, role, seller_code, full_name, phone, contact_email, active)
  values (new.id, lower(new.email), pending.role, upper(pending.seller_code), pending.full_name, pending.phone, pending.contact_email, true);

  update public.user_invites
  set accepted_at = now(), active = false
  where id = pending.id;

  return new;
end;
$$;

revoke all on function private.authorize_invited_user() from public, anon, authenticated;
revoke all on function private.create_profile_for_invited_user() from public, anon, authenticated;

create trigger before_auth_user_created_grupo_sur
  before insert on auth.users
  for each row execute function private.authorize_invited_user();

create trigger after_auth_user_created_grupo_sur
  after insert on auth.users
  for each row execute function private.create_profile_for_invited_user();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger brands_set_updated_at before update on public.brands
  for each row execute function private.set_updated_at();
create trigger models_set_updated_at before update on public.models
  for each row execute function private.set_updated_at();
create trigger commercial_applications_set_updated_at before update on public.commercial_applications
  for each row execute function private.set_updated_at();

create function private.audit_campaign_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.campaign_audit_log (campaign_id, changed_by, action, previous_data)
    values (old.id, auth.uid(), tg_op, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.campaign_audit_log (campaign_id, changed_by, action, previous_data, new_data)
    values (new.id, auth.uid(), tg_op, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.campaign_audit_log (campaign_id, changed_by, action, new_data)
    values (new.id, auth.uid(), tg_op, to_jsonb(new));
    return new;
  end if;
end;
$$;

revoke all on function private.audit_campaign_change() from public, anon, authenticated;

create function private.set_campaign_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end;
$$;

create trigger campaigns_set_metadata
  before insert or update on public.campaigns
  for each row execute function private.set_campaign_metadata();

create trigger campaigns_audit_change
  after insert or update or delete on public.campaigns
  for each row execute function private.audit_campaign_change();

alter table public.user_invites enable row level security;
alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.models enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_audit_log enable row level security;
alter table public.prequalification_events enable row level security;
alter table public.commercial_applications enable row level security;

create policy user_invites_deny_client_access
on public.user_invites for all
to authenticated
using (false)
with check (false);

create policy profiles_read_own_or_admin
on public.profiles for select
to authenticated
using (
  private.current_user_active()
  and (user_id = (select auth.uid()) or private.current_user_is_admin())
);

create policy brands_read_active_users
on public.brands for select
to authenticated
using (private.current_user_active());

create policy brands_admin_insert
on public.brands for insert
to authenticated
with check (private.current_user_is_admin());

create policy brands_admin_update
on public.brands for update
to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

create policy brands_admin_delete
on public.brands for delete
to authenticated
using (private.current_user_is_admin());

create policy models_read_active_users
on public.models for select
to authenticated
using (private.current_user_active());

create policy models_admin_insert
on public.models for insert
to authenticated
with check (private.current_user_is_admin());

create policy models_admin_update
on public.models for update
to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

create policy models_admin_delete
on public.models for delete
to authenticated
using (private.current_user_is_admin());

create policy campaigns_read_active_users
on public.campaigns for select
to authenticated
using (private.current_user_active());

create policy campaigns_admin_insert
on public.campaigns for insert
to authenticated
with check (private.current_user_is_admin());

create policy campaigns_admin_update
on public.campaigns for update
to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

create policy campaigns_admin_delete
on public.campaigns for delete
to authenticated
using (private.current_user_is_admin());

create policy campaign_audit_admin_read
on public.campaign_audit_log for select
to authenticated
using (private.current_user_is_admin());

create policy prequalifications_read_own_or_admin
on public.prequalification_events for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_admin())
);

create policy prequalifications_seller_insert
on public.prequalification_events for insert
to authenticated
with check (
  private.current_user_active()
  and seller_user_id = (select auth.uid())
);

create policy commercial_applications_read_own_or_admin
on public.commercial_applications for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_admin())
);

create policy commercial_applications_seller_insert
on public.commercial_applications for insert
to authenticated
with check (
  private.current_user_active()
  and seller_user_id = (select auth.uid())
  and exists (
    select 1 from public.prequalification_events event
    where event.id = prequalification_event_id
      and event.seller_user_id = (select auth.uid())
  )
);

create policy commercial_applications_update_own_or_admin
on public.commercial_applications for update
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_admin())
)
with check (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_admin())
);

revoke all on all tables in schema public from anon;
revoke all on public.user_invites from authenticated;
grant select on public.profiles, public.brands, public.models, public.campaigns, public.campaign_audit_log to authenticated;
grant insert, update, delete on public.brands, public.models, public.campaigns to authenticated;
grant select, insert on public.prequalification_events to authenticated;
grant select, insert, update on public.commercial_applications to authenticated;
grant all on public.user_invites, public.profiles, public.brands, public.models, public.campaigns, public.campaign_audit_log, public.prequalification_events, public.commercial_applications to service_role;
grant usage, select on sequence public.campaign_audit_log_id_seq to service_role;

insert into public.user_invites (email, role, seller_code, full_name, phone)
values ('cesardenavarrete18@gmail.com', 'admin', 'ADMIN', 'Cesar de Navarrete', null);

insert into public.brands (name, description, image_path, sort_order)
values
  ('Volkswagen', 'SUV, SUVW y pick-up', '/assets/brand-selector-vw-v2.webp', 10),
  ('Peugeot', 'Hatchback, SUV y utilitario', '/assets/brand-selector-peugeot-v2.webp', 20),
  ('Fiat', 'Urbano, sedán, SUV y pick-up', '/assets/brand-selector-fiat-v2.webp', 30);

insert into public.models (brand_id, name, image_path, campaign_name, short_description, advance_text, installment_text, sort_order)
select b.id, source.name, source.image_path, source.campaign_name, source.short_description, source.advance_text, source.installment_text, source.sort_order
from (
  values
    ('Volkswagen', 'Amarok', '/assets/vw-amarok.webp', 'Plan 70/30', 'Bonificación y entrega pactada según campaña.', '$10.400.000', 'Desde $600.000', 10),
    ('Volkswagen', 'Tera', '/assets/vw-tera-color-v3.webp', 'Plan 70/30', 'Alternativas de retiro en cuotas pactadas.', '$11.000.000', 'Desde $500.000', 20),
    ('Volkswagen', 'Taos', '/assets/vw-taos.webp', 'Plan 60/40', 'Propuesta con anticipo y financiación vigente.', '$15.000.000', 'A confirmar', 30),
    ('Volkswagen', 'Nivus', '/assets/vw-nivus-catalog-v2.webp', 'Plan 80/20', 'Financiación según versión seleccionada.', '$6.656.310', 'Desde $423.000', 40),
    ('Volkswagen', 'T-Cross', '/assets/vw-tcross-catalog-v2.webp', 'Plan 80/20', 'Condición preliminar con entrega pactada.', '$7.583.060', 'Desde $482.000', 50),
    ('Volkswagen', 'Virtus', '/assets/vw-virtus-color-v3.webp', 'Plan 90/10', 'Ingreso inicial reducido sujeto a campaña.', '$3.365.910', 'A confirmar', 60),
    ('Peugeot', '208', '/assets/peugeot-208-color-v3.webp', 'Plan 80/20', 'Propuesta urbana con retiro pactado.', '$4.000.000', 'Desde $400.000', 10),
    ('Peugeot', '2008', '/assets/peugeot-2008-color-v3.webp', 'Plan 70/30', 'SUV con alternativas de financiación vigente.', '$4.900.000', 'Desde $550.000', 20),
    ('Peugeot', 'Partner', '/assets/peugeot-partner.webp', 'Plan utilitario', 'Condición comercial para uso laboral.', '$10.000.000', 'Desde $500.000', 30),
    ('Peugeot', 'Expert', '/assets/peugeot-expert-catalog-v2.webp', 'Plan utilitario', 'Alternativa de financiación para trabajo.', '$10.000.000', 'Desde $500.000', 40),
    ('Fiat', 'Cronos', '/assets/fiat-cronos-color-v3.webp', 'Plan 80/20', 'Retiro pactado según condición vigente.', '$5.000.000', 'Desde $500.000', 10),
    ('Fiat', 'Mobi', '/assets/fiat-mobi-color-v3.webp', 'Plan 80/20', 'Ingreso inicial y cuota accesible.', '$5.000.000', 'Desde $500.000', 20),
    ('Fiat', 'Argo', '/assets/fiat-argo-color-v3.webp', 'Campaña lanzamiento', 'Condición preliminar de lanzamiento.', 'A confirmar', 'A confirmar', 30),
    ('Fiat', 'Titano', '/assets/fiat-titano.webp', 'Plan pick-up', 'Propuesta para uso laboral y personal.', 'A confirmar', 'A confirmar', 40),
    ('Fiat', 'Fastback', '/assets/fiat-fastback-catalog-v2.webp', 'Plan 70/30', 'Financiación sujeta a versión y campaña.', 'A confirmar', 'A confirmar', 50),
    ('Fiat', 'Strada', '/assets/fiat-strada-color-v3.webp', 'Plan utilitario', 'Alternativas para trabajo y uso diario.', 'A confirmar', 'A confirmar', 60)
) as source(brand_name, name, image_path, campaign_name, short_description, advance_text, installment_text, sort_order)
join public.brands b on b.name = source.brand_name;

insert into public.campaigns (
  model_id, plan_name, advance_amount, installment_amount, installment_is_from,
  slots, timer_hours, sort_order
)
select
  m.id,
  m.campaign_name,
  nullif(regexp_replace(m.advance_text, '[^0-9]', '', 'g'), '')::numeric,
  nullif(regexp_replace(m.installment_text, '[^0-9]', '', 'g'), '')::numeric,
  m.installment_text ilike 'Desde %',
  source.slots,
  24,
  10
from (
  values
    ('Volkswagen', 'Amarok', 2), ('Volkswagen', 'Tera', 3), ('Volkswagen', 'Taos', null),
    ('Volkswagen', 'Nivus', 4), ('Volkswagen', 'T-Cross', null), ('Volkswagen', 'Virtus', 2),
    ('Peugeot', '208', 3), ('Peugeot', '2008', 2), ('Peugeot', 'Partner', null), ('Peugeot', 'Expert', null),
    ('Fiat', 'Cronos', 4), ('Fiat', 'Mobi', 3), ('Fiat', 'Argo', null), ('Fiat', 'Titano', 2),
    ('Fiat', 'Fastback', null), ('Fiat', 'Strada', null)
) as source(brand_name, model_name, slots)
join public.brands b on b.name = source.brand_name
join public.models m on m.brand_id = b.id and m.name = source.model_name;

update public.campaigns campaign
set version_name = 'Allure', transmission = 'MT', installment_count = 84, sort_order = 20
from public.models model
join public.brands brand on brand.id = model.brand_id
where campaign.model_id = model.id and brand.name = 'Peugeot' and model.name = '208';

insert into public.campaigns (
  model_id, active, plan_name, version_name, transmission, installment_count,
  bonus, benefits, slots, timer_hours, sort_order
)
select model.id, false, offer.plan_name, 'Allure', offer.transmission, offer.installment_count,
  base.bonus, base.benefits, null, base.timer_hours, offer.sort_order
from public.models model
join public.brands brand on brand.id = model.brand_id
join public.campaigns base on base.model_id = model.id
cross join (
  values ('Plan 70/30', 'MT', 120, 10), ('Plan 100%', 'AT', 84, 30)
) as offer(plan_name, transmission, installment_count, sort_order)
where brand.name = 'Peugeot' and model.name = '208';
