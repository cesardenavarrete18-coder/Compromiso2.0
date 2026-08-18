-- Sales administration, linked quotes, bank credits, client portfolio and installments.

alter type public.app_role add value if not exists 'admventas';

create function private.current_user_is_sales_admin()
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
      and role::text = 'admventas'
      and active = true
  );
$$;

create function private.current_user_can_review_sales()
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
      and role::text in ('admin', 'supervisor', 'admventas')
      and active = true
  );
$$;

create function private.current_user_can_administer_sales()
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
      and role::text in ('admin', 'admventas')
      and active = true
  );
$$;

revoke all on function private.current_user_is_sales_admin() from public;
revoke all on function private.current_user_can_review_sales() from public;
revoke all on function private.current_user_can_administer_sales() from public;
grant execute on function private.current_user_is_sales_admin() to authenticated;
grant execute on function private.current_user_can_review_sales() to authenticated;
grant execute on function private.current_user_can_administer_sales() to authenticated;

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  name text not null,
  sort_order integer not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_versions_name_length check (char_length(trim(name)) between 2 and 120),
  unique (model_id, name)
);

create index model_versions_model_active_idx
  on public.model_versions (model_id, active, sort_order);

create table public.bank_credit_offers (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  financier_name text not null,
  offer_name text not null,
  term_months integer not null,
  min_financed_amount numeric(16, 2),
  max_financed_amount numeric(16, 2),
  installment_coefficient numeric(14, 8) not null,
  breakage_rate numeric(8, 4) not null default 0,
  patenting_rate numeric(8, 4) not null default 0,
  fixed_expenses numeric(16, 2) not null default 0,
  tna numeric(8, 4),
  cftea numeric(8, 4),
  notes text not null default '',
  valid_from date,
  valid_to date,
  active boolean not null default true,
  sort_order integer not null default 10,
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_credit_offer_names check (
    char_length(trim(financier_name)) between 2 and 120
    and char_length(trim(offer_name)) between 2 and 160
  ),
  constraint bank_credit_offer_term check (term_months between 1 and 120),
  constraint bank_credit_offer_amounts check (
    (min_financed_amount is null or min_financed_amount >= 0)
    and (max_financed_amount is null or max_financed_amount >= 0)
    and (max_financed_amount is null or min_financed_amount is null or max_financed_amount >= min_financed_amount)
    and fixed_expenses >= 0
  ),
  constraint bank_credit_offer_rates check (
    installment_coefficient > 0
    and breakage_rate between 0 and 100
    and patenting_rate between 0 and 100
    and (tna is null or tna between 0 and 1000)
    and (cftea is null or cftea between 0 and 2000)
  ),
  constraint bank_credit_offer_dates check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint bank_credit_offer_notes check (char_length(notes) <= 4000)
);

create index bank_credit_offers_model_active_idx
  on public.bank_credit_offers (model_id, active, sort_order);
create index bank_credit_offers_validity_idx
  on public.bank_credit_offers (active, valid_from, valid_to);

create table public.bank_credit_offer_versions (
  offer_id uuid not null references public.bank_credit_offers (id) on delete cascade,
  version_id uuid not null references public.model_versions (id) on delete cascade,
  primary key (offer_id, version_id)
);

create index bank_credit_offer_versions_version_idx
  on public.bank_credit_offer_versions (version_id, offer_id);

create table public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_code text not null unique,
  lead_id uuid not null references public.leads (id) on delete restrict,
  seller_user_id uuid not null default auth.uid() references public.profiles (user_id) on delete restrict,
  model_id uuid not null references public.models (id) on delete restrict,
  campaign_id uuid references public.campaigns (id) on delete set null,
  bank_credit_offer_id uuid references public.bank_credit_offers (id) on delete set null,
  offer_type text not null,
  customer_name text not null,
  vehicle_version text not null default '',
  sale_price numeric(16, 2) not null,
  financed_amount numeric(16, 2) not null default 0,
  term_months integer,
  installment_amount numeric(16, 2),
  advance_amount numeric(16, 2) not null,
  breakage_amount numeric(16, 2) not null default 0,
  patenting_amount numeric(16, 2) not null default 0,
  expenses_amount numeric(16, 2) not null default 0,
  final_advance_amount numeric(16, 2) not null,
  status text not null default 'issued',
  valid_until timestamptz,
  commercial_snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_quotes_code_format check (quote_code ~ '^GS-PRES-[A-Z0-9-]{6,40}$'),
  constraint sales_quotes_offer_type check (offer_type in ('savings_plan', 'bank_credit')),
  constraint sales_quotes_status check (status in ('draft', 'issued', 'expired', 'converted', 'cancelled')),
  constraint sales_quotes_source check (
    (offer_type = 'savings_plan' and campaign_id is not null and bank_credit_offer_id is null)
    or (offer_type = 'bank_credit' and bank_credit_offer_id is not null and campaign_id is null)
  ),
  constraint sales_quotes_values check (
    sale_price >= 0 and financed_amount >= 0 and financed_amount <= sale_price
    and advance_amount >= 0 and breakage_amount >= 0 and patenting_amount >= 0
    and expenses_amount >= 0 and final_advance_amount >= 0
    and (installment_amount is null or installment_amount >= 0)
    and (term_months is null or term_months between 1 and 240)
  ),
  constraint sales_quotes_names check (
    char_length(trim(customer_name)) between 2 and 120
    and char_length(vehicle_version) <= 120
  )
);

create index sales_quotes_lead_time_idx on public.sales_quotes (lead_id, issued_at desc);
create index sales_quotes_seller_time_idx on public.sales_quotes (seller_user_id, issued_at desc);
create index sales_quotes_status_time_idx on public.sales_quotes (status, issued_at desc);

alter table public.lead_sale_requests
  add column quote_id uuid references public.sales_quotes (id) on delete set null;

create index lead_sale_requests_quote_idx on public.lead_sale_requests (quote_id);

create table public.sales_cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique default ('GS-VTA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  sale_request_id uuid not null unique references public.lead_sale_requests (id) on delete restrict,
  lead_id uuid not null unique references public.leads (id) on delete restrict,
  seller_user_id uuid not null references public.profiles (user_id) on delete restrict,
  quote_id uuid references public.sales_quotes (id) on delete set null,
  vehicle text not null,
  sale_amount numeric(16, 2),
  status text not null default 'minute_pending',
  cdn_scoring_status text not null default 'pending',
  dealer_scoring_status text not null default 'pending',
  contract_status text not null default 'pending',
  cancellation_reason text not null default '',
  finalized_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_cases_status check (status in (
    'minute_pending', 'quality_control', 'dealer_scoring', 'contract_signature',
    'formation_group', 'grouped', 'finalized', 'cancelled'
  )),
  constraint sales_cases_cdn_status check (cdn_scoring_status in ('pending', 'approved', 'observed', 'baja')),
  constraint sales_cases_dealer_status check (dealer_scoring_status in ('pending', 'approved', 'observed', 'baja')),
  constraint sales_cases_contract_status check (contract_status in ('pending', 'approved', 'rejected', 'baja')),
  constraint sales_cases_vehicle check (char_length(trim(vehicle)) between 2 and 160),
  constraint sales_cases_sale_amount check (sale_amount is null or sale_amount >= 0),
  constraint sales_cases_cancellation_reason check (char_length(cancellation_reason) <= 5000)
);

create index sales_cases_seller_time_idx on public.sales_cases (seller_user_id, created_at desc);
create index sales_cases_status_time_idx on public.sales_cases (status, updated_at desc);
create index sales_cases_admin_queue_idx on public.sales_cases (cdn_scoring_status, dealer_scoring_status, contract_status, updated_at desc);

alter table public.commercial_applications
  alter column prequalification_event_id drop not null,
  add column sales_case_id uuid references public.sales_cases (id) on delete restrict,
  add column revision_number integer not null default 1,
  add column supersedes_application_id uuid references public.commercial_applications (id) on delete set null,
  add column submitted_at timestamptz;

alter table public.commercial_applications
  drop constraint commercial_applications_status,
  add constraint commercial_applications_status check (status in ('completed', 'submitted', 'superseded', 'cancelled')),
  add constraint commercial_applications_source check (
    (prequalification_event_id is not null and sales_case_id is null)
    or (prequalification_event_id is null and sales_case_id is not null)
  ),
  add constraint commercial_applications_revision check (revision_number between 1 and 1000);

create unique index commercial_applications_case_revision_idx
  on public.commercial_applications (sales_case_id, revision_number)
  where sales_case_id is not null;
create index commercial_applications_sales_case_time_idx
  on public.commercial_applications (sales_case_id, created_at desc)
  where sales_case_id is not null;
create index commercial_applications_supersedes_idx
  on public.commercial_applications (supersedes_application_id);

create table public.sales_case_events (
  id bigint generated always as identity primary key,
  sales_case_id uuid not null references public.sales_cases (id) on delete cascade,
  actor_user_id uuid references public.profiles (user_id) on delete set null,
  event_type text not null,
  stage text,
  outcome text,
  comment text not null default '',
  visible_to_seller boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sales_case_events_type check (event_type in (
    'case_created', 'minute_submitted', 'minute_corrected', 'stage_review',
    'sale_finalized', 'sale_cancelled', 'client_grouped', 'installment_update', 'document_added'
  )),
  constraint sales_case_events_comment check (char_length(comment) <= 5000)
);

create index sales_case_events_case_time_idx on public.sales_case_events (sales_case_id, created_at desc);
create index sales_case_events_actor_time_idx on public.sales_case_events (actor_user_id, created_at desc);

create table public.sales_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (user_id) on delete cascade,
  sales_case_id uuid references public.sales_cases (id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sales_notifications_type check (notification_type in ('sale_confirmed', 'observed', 'cancelled', 'finalized', 'status_update')),
  constraint sales_notifications_text check (char_length(title) between 2 and 160 and char_length(body) <= 5000)
);

create index sales_notifications_recipient_idx
  on public.sales_notifications (recipient_user_id, read_at, created_at desc);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  sales_case_id uuid not null unique references public.sales_cases (id) on delete restrict,
  status text not null default 'formation_group',
  grouped_month date,
  automatic_debit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_status check (status in ('formation_group', 'grouped')),
  constraint clients_grouped_month check (
    (status = 'formation_group' and grouped_month is null)
    or (status = 'grouped' and grouped_month is not null and grouped_month = date_trunc('month', grouped_month)::date)
  )
);

create index clients_status_time_idx on public.clients (status, updated_at desc);
create index clients_grouped_month_idx on public.clients (grouped_month) where grouped_month is not null;

create table public.client_installments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  installment_number integer not null,
  due_month date not null,
  status text not null default 'pending',
  promised_for date,
  paid_at timestamptz,
  receipt_path text,
  note text not null default '',
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_installments_number check (installment_number between 2 and 999),
  constraint client_installments_month check (due_month = date_trunc('month', due_month)::date),
  constraint client_installments_status check (status in ('pending', 'paid', 'promised', 'delinquent')),
  constraint client_installments_promised check (status <> 'promised' or promised_for is not null),
  constraint client_installments_paid check (status <> 'paid' or paid_at is not null),
  constraint client_installments_note check (char_length(note) <= 3000),
  unique (client_id, installment_number),
  unique (client_id, due_month)
);

create index client_installments_month_status_idx on public.client_installments (due_month, status);
create index client_installments_client_month_idx on public.client_installments (client_id, due_month);

create table public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  sales_case_id uuid not null references public.sales_cases (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  uploaded_by uuid not null default auth.uid() references public.profiles (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sales_documents_type check (document_type in ('dni', 'signed_contract', 'receipt', 'supporting_document', 'minute', 'quote')),
  constraint sales_documents_names check (char_length(file_name) between 1 and 255 and char_length(storage_path) between 5 and 1000),
  constraint sales_documents_mime check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'))
);

create index sales_documents_case_time_idx on public.sales_documents (sales_case_id, created_at desc);
create index sales_documents_client_time_idx on public.sales_documents (client_id, created_at desc) where client_id is not null;

create trigger model_versions_set_updated_at before update on public.model_versions
  for each row execute function private.set_updated_at();
create trigger bank_credit_offers_set_updated_at before update on public.bank_credit_offers
  for each row execute function private.set_updated_at();

create function private.validate_bank_credit_version_model()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bank_credit_offers offer
    join public.model_versions version on version.id = new.version_id
    where offer.id = new.offer_id and offer.model_id = version.model_id
  ) then raise exception 'La versión y la línea de crédito deben pertenecer al mismo modelo'; end if;
  return new;
end;
$$;
revoke all on function private.validate_bank_credit_version_model() from public, anon, authenticated;

create trigger bank_credit_offer_versions_validate before insert or update on public.bank_credit_offer_versions
  for each row execute function private.validate_bank_credit_version_model();
create trigger sales_quotes_set_updated_at before update on public.sales_quotes
  for each row execute function private.set_updated_at();
create trigger sales_cases_set_updated_at before update on public.sales_cases
  for each row execute function private.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger client_installments_set_updated_at before update on public.client_installments
  for each row execute function private.set_updated_at();

create function private.prevent_seller_lead_access_after_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles profile
      where profile.user_id = (select auth.uid()) and profile.role::text = 'seller' and profile.active = true
    )
    and exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = new.lead_id)
  then raise exception 'El Lead ya se encuentra en el circuito administrativo'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_seller_lead_access_after_sale() from public, anon, authenticated;

create trigger lead_crm_block_seller_after_sale before insert or update on public.lead_crm
  for each row execute function private.prevent_seller_lead_access_after_sale();
create trigger lead_activities_block_seller_after_sale before insert or update on public.lead_activities
  for each row execute function private.prevent_seller_lead_access_after_sale();

create function private.validate_sales_quote_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
        and version.active = true and offer.active = true
        and (offer.valid_from is null or offer.valid_from <= current_date)
        and (offer.valid_to is null or offer.valid_to >= current_date)
    ) then raise exception 'La línea de crédito no está habilitada para la versión seleccionada'; end if;
  elsif not exists (
    select 1 from public.campaigns campaign
    where campaign.id = new.campaign_id and campaign.model_id = new.model_id and campaign.active = true
      and (campaign.valid_from is null or campaign.valid_from <= current_date)
      and (campaign.valid_to is null or campaign.valid_to >= current_date)
  ) then raise exception 'El plan seleccionado no está vigente para este modelo';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_sales_quote_offer() from public, anon, authenticated;

create trigger sales_quotes_validate_offer before insert or update of model_id, campaign_id, bank_credit_offer_id, vehicle_version
  on public.sales_quotes for each row execute function private.validate_sales_quote_offer();

create function private.audit_client_installment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sales_case_id uuid;
begin
  if row(old.status, old.promised_for, old.paid_at, old.receipt_path, old.note)
    is distinct from row(new.status, new.promised_for, new.paid_at, new.receipt_path, new.note) then
    select client.sales_case_id into v_sales_case_id from public.clients client where client.id = new.client_id;
    insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, stage, outcome, comment, visible_to_seller, metadata)
    values (v_sales_case_id, coalesce(new.updated_by, (select auth.uid())), 'installment_update', 'installment', new.status,
      trim(coalesce(new.note, '')), false,
      jsonb_build_object('installment_number', new.installment_number, 'due_month', new.due_month, 'previous_status', old.status, 'new_status', new.status));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_client_installment_update() from public, anon, authenticated;

create trigger client_installments_audit after update on public.client_installments
  for each row execute function private.audit_client_installment_update();

create function private.create_sales_case_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_case_id uuid;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    v_quote_id := new.quote_id;
    if v_quote_id is null then
      select id into v_quote_id
      from public.sales_quotes
      where lead_id = new.lead_id and seller_user_id = new.seller_user_id and status in ('issued', 'converted')
      order by issued_at desc
      limit 1;
    end if;

    insert into public.sales_cases (sale_request_id, lead_id, seller_user_id, quote_id, vehicle, sale_amount)
    values (new.id, new.lead_id, new.seller_user_id, v_quote_id, new.vehicle, new.sale_amount)
    on conflict (sale_request_id) do update set quote_id = coalesce(public.sales_cases.quote_id, excluded.quote_id)
    returning id into v_case_id;

    if v_quote_id is not null then
      update public.sales_quotes set status = 'converted', updated_at = now() where id = v_quote_id;
    end if;

    insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, comment)
    values (v_case_id, new.reviewed_by, 'case_created', 'Venta confirmada por supervisión; minuta habilitada.');

    insert into public.sales_notifications (recipient_user_id, sales_case_id, notification_type, title, body)
    values (new.seller_user_id, v_case_id, 'sale_confirmed', 'Venta confirmada', 'La venta fue aprobada por supervisión. Completá la minuta para iniciar el control administrativo.');
  end if;
  return new;
end;
$$;

revoke all on function private.create_sales_case_after_confirmation() from public, anon, authenticated;

create trigger lead_sale_requests_create_sales_case
  after update of status on public.lead_sale_requests
  for each row execute function private.create_sales_case_after_confirmation();

insert into public.sales_cases (sale_request_id, lead_id, seller_user_id, quote_id, vehicle, sale_amount, created_at)
select request.id, request.lead_id, request.seller_user_id, request.quote_id, request.vehicle, request.sale_amount,
  coalesce(request.reviewed_at, request.requested_at)
from public.lead_sale_requests request
where request.status = 'confirmed'
on conflict (sale_request_id) do nothing;

insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, comment, created_at)
select sales_case.id, request.reviewed_by, 'case_created', 'Venta confirmada por supervisión; minuta habilitada.', sales_case.created_at
from public.sales_cases sales_case
join public.lead_sale_requests request on request.id = sales_case.sale_request_id
where not exists (
  select 1 from public.sales_case_events event
  where event.sales_case_id = sales_case.id and event.event_type = 'case_created'
);

create function private.after_sales_minute_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous integer;
begin
  if new.sales_case_id is null then return new; end if;

  select max(revision_number) into v_previous
  from public.commercial_applications
  where sales_case_id = new.sales_case_id and id <> new.id;

  update public.commercial_applications
  set status = 'superseded', updated_at = now()
  where sales_case_id = new.sales_case_id and id <> new.id and status = 'submitted';

  update public.sales_cases
  set status = 'quality_control', cdn_scoring_status = 'pending', updated_at = now()
  where id = new.sales_case_id and status <> 'cancelled';

  insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, stage, outcome, comment)
  values (
    new.sales_case_id,
    new.seller_user_id,
    case when coalesce(v_previous, 0) = 0 then 'minute_submitted' else 'minute_corrected' end,
    'cdn_scoring',
    'pending',
    case when coalesce(v_previous, 0) = 0 then 'Minuta enviada a Administración de Ventas.' else 'Minuta corregida y reenviada.' end
  );
  return new;
end;
$$;

revoke all on function private.after_sales_minute_insert() from public, anon, authenticated;

create trigger commercial_applications_sales_case_submission
  after insert on public.commercial_applications
  for each row execute function private.after_sales_minute_insert();

create function public.request_lead_sale_v2(
  p_lead_id uuid,
  p_vehicle text,
  p_amount numeric default null,
  p_notes text default '',
  p_quote_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request_id uuid;
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  if not private.current_user_is_management() and not exists (
    select 1 from public.leads where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then raise exception 'El lead no está asignado a este vendedor'; end if;
  if char_length(trim(coalesce(p_vehicle, ''))) < 2 or char_length(trim(p_vehicle)) > 160 then raise exception 'Indicá el vehículo vendido'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'El importe no puede ser negativo'; end if;
  if exists (select 1 from public.lead_sale_requests where lead_id = p_lead_id and status = 'pending') then raise exception 'Ya existe una venta pendiente de confirmación'; end if;
  if exists (select 1 from public.sales_cases where lead_id = p_lead_id) then raise exception 'La venta ya se encuentra en el circuito administrativo'; end if;
  if p_quote_id is not null and not exists (
    select 1 from public.sales_quotes
    where id = p_quote_id and lead_id = p_lead_id and seller_user_id = v_user_id and status in ('issued', 'converted')
  ) then raise exception 'El presupuesto no corresponde a este lead'; end if;

  insert into public.lead_sale_requests (lead_id, seller_user_id, vehicle, sale_amount, notes, quote_id)
  values (p_lead_id, v_user_id, trim(p_vehicle), p_amount, trim(coalesce(p_notes, '')), p_quote_id)
  returning id into v_request_id;

  update public.lead_crm set
    status = 'cierre', priority = 'high', sale_confirmation_status = 'pending',
    sale_requested_at = now(), sale_requested_by = v_user_id, vehicle_sold = trim(p_vehicle),
    sale_amount = p_amount, updated_by = v_user_id, updated_at = now()
  where lead_id = p_lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (p_lead_id, v_user_id, 'sale_request', 'Venta enviada a confirmación', trim(coalesce(p_notes, '')),
    jsonb_build_object('vehicle', trim(p_vehicle), 'amount', p_amount, 'request_id', v_request_id, 'quote_id', p_quote_id));

  return v_request_id;
end;
$$;

revoke all on function public.request_lead_sale_v2(uuid, text, numeric, text, uuid) from public, anon;
grant execute on function public.request_lead_sale_v2(uuid, text, numeric, text, uuid) to authenticated;

create function public.record_sales_stage(
  p_sales_case_id uuid,
  p_stage text,
  p_outcome text,
  p_comment text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_case public.sales_cases%rowtype;
  v_cancel boolean := false;
  v_title text;
begin
  if v_user_id is null or not private.current_user_can_administer_sales() then
    raise exception 'Se requiere permiso de Administración de Ventas';
  end if;
  select * into v_case from public.sales_cases where id = p_sales_case_id for update;
  if v_case.id is null then raise exception 'No se encontró la operación'; end if;
  if v_case.status = 'cancelled' then raise exception 'La operación ya está dada de baja'; end if;
  if p_stage not in ('cdn_scoring', 'dealer_scoring', 'contract') then raise exception 'Etapa inválida'; end if;
  if p_outcome in ('observed', 'baja', 'rejected') and char_length(trim(coalesce(p_comment, ''))) < 3 then
    raise exception 'Indicá el motivo del resultado';
  end if;

  if p_stage = 'cdn_scoring' then
    if p_outcome not in ('approved', 'observed', 'baja') then raise exception 'Resultado inválido para Scoring CDN'; end if;
    if not exists (select 1 from public.commercial_applications where sales_case_id = p_sales_case_id and status = 'submitted') then
      raise exception 'La operación todavía no tiene una minuta vigente';
    end if;
    update public.sales_cases set
      cdn_scoring_status = p_outcome,
      status = case p_outcome when 'approved' then 'dealer_scoring' when 'observed' then 'quality_control' else 'cancelled' end,
      cancellation_reason = case when p_outcome = 'baja' then trim(p_comment) else cancellation_reason end,
      cancelled_at = case when p_outcome = 'baja' then now() else cancelled_at end,
      updated_at = now()
    where id = p_sales_case_id;
    v_title := 'Scoring CDN';
  elsif p_stage = 'dealer_scoring' then
    if v_case.cdn_scoring_status <> 'approved' then raise exception 'Primero debe aprobarse el Scoring CDN'; end if;
    if p_outcome not in ('approved', 'observed', 'baja') then raise exception 'Resultado inválido para Scoring Concesionario'; end if;
    update public.sales_cases set
      dealer_scoring_status = p_outcome,
      status = case p_outcome when 'approved' then 'contract_signature' when 'observed' then 'dealer_scoring' else 'cancelled' end,
      cancellation_reason = case when p_outcome = 'baja' then trim(p_comment) else cancellation_reason end,
      cancelled_at = case when p_outcome = 'baja' then now() else cancelled_at end,
      updated_at = now()
    where id = p_sales_case_id;
    v_title := 'Scoring Concesionario';
  else
    if v_case.cdn_scoring_status <> 'approved' or v_case.dealer_scoring_status <> 'approved' then
      raise exception 'Primero deben aprobarse ambos controles de scoring';
    end if;
    if p_outcome not in ('approved', 'rejected', 'baja') then raise exception 'Resultado inválido para Firma de contrato'; end if;
    v_cancel := p_outcome in ('rejected', 'baja');
    update public.sales_cases set
      contract_status = p_outcome,
      status = case when p_outcome = 'approved' then 'formation_group' else 'cancelled' end,
      cancellation_reason = case when v_cancel then trim(p_comment) else cancellation_reason end,
      cancelled_at = case when v_cancel then now() else cancelled_at end,
      finalized_at = case when p_outcome = 'approved' then now() else finalized_at end,
      updated_at = now()
    where id = p_sales_case_id;
    if p_outcome = 'approved' then
      insert into public.clients (sales_case_id, automatic_debit)
      select p_sales_case_id, coalesce(application.automatic_debit, false)
      from public.commercial_applications application
      where application.sales_case_id = p_sales_case_id and application.status = 'submitted'
      order by application.revision_number desc
      limit 1
      on conflict (sales_case_id) do nothing;
    end if;
    v_title := 'Firma de contrato';
  end if;

  insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, stage, outcome, comment, visible_to_seller)
  values (p_sales_case_id, v_user_id,
    case when p_outcome in ('baja', 'rejected') then 'sale_cancelled' when p_stage = 'contract' and p_outcome = 'approved' then 'sale_finalized' else 'stage_review' end,
    p_stage, p_outcome, trim(coalesce(p_comment, '')), true);

  if p_outcome = 'observed' then
    insert into public.sales_notifications (recipient_user_id, sales_case_id, notification_type, title, body)
    values (v_case.seller_user_id, p_sales_case_id, 'observed', v_title || ' observado', trim(p_comment));
  elsif p_outcome in ('baja', 'rejected') then
    insert into public.sales_notifications (recipient_user_id, sales_case_id, notification_type, title, body)
    values (v_case.seller_user_id, p_sales_case_id, 'cancelled', 'Operación dada de baja', trim(p_comment));
  elsif p_stage = 'contract' and p_outcome = 'approved' then
    insert into public.sales_notifications (recipient_user_id, sales_case_id, notification_type, title, body)
    values (v_case.seller_user_id, p_sales_case_id, 'finalized', 'Venta finalizada', 'La operación completó satisfactoriamente el proceso administrativo.');
  end if;
end;
$$;

revoke all on function public.record_sales_stage(uuid, text, text, text) from public, anon;
grant execute on function public.record_sales_stage(uuid, text, text, text) to authenticated;

create function public.group_client(p_client_id uuid, p_group_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_client public.clients%rowtype;
  v_installment_count integer;
begin
  if v_user_id is null or not private.current_user_can_administer_sales() then
    raise exception 'Se requiere permiso de Administración de Ventas';
  end if;
  if p_group_month is null or p_group_month <> date_trunc('month', p_group_month)::date then
    raise exception 'Indicá el primer día del mes de agrupación';
  end if;
  select * into v_client from public.clients where id = p_client_id for update;
  if v_client.id is null then raise exception 'No se encontró el cliente'; end if;

  select application.installments_to_pay into v_installment_count
  from public.commercial_applications application
  where application.sales_case_id = v_client.sales_case_id and application.status = 'submitted'
  order by application.revision_number desc
  limit 1;
  v_installment_count := greatest(1, least(coalesce(v_installment_count, 84) - 1, 239));

  update public.clients set status = 'grouped', grouped_month = p_group_month, updated_at = now() where id = p_client_id;
  update public.sales_cases set status = 'grouped', updated_at = now() where id = v_client.sales_case_id;

  insert into public.client_installments (client_id, installment_number, due_month, updated_by)
  select p_client_id, series_number + 2, (p_group_month + (series_number || ' months')::interval)::date, v_user_id
  from generate_series(0, v_installment_count - 1) as series_number
  on conflict (client_id, installment_number) do nothing;

  insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, stage, outcome, comment)
  values (v_client.sales_case_id, v_user_id, 'client_grouped', 'client', 'grouped',
    'Cliente agrupado. ' || to_char(p_group_month, 'MM/YYYY') || ' corresponde a la cuota N° 2.');
end;
$$;

revoke all on function public.group_client(uuid, date) from public, anon;
grant execute on function public.group_client(uuid, date) to authenticated;

create function public.get_installment_metrics(p_month date default null)
returns table (
  due_month date,
  total_clients bigint,
  paid_count bigint,
  promised_count bigint,
  delinquent_count bigint,
  pending_count bigint,
  paid_percentage numeric,
  promised_percentage numeric,
  delinquent_percentage numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    installment.due_month,
    count(*)::bigint,
    count(*) filter (where installment.status = 'paid')::bigint,
    count(*) filter (where installment.status = 'promised')::bigint,
    count(*) filter (where installment.status = 'delinquent')::bigint,
    count(*) filter (where installment.status = 'pending')::bigint,
    round(100.0 * count(*) filter (where installment.status = 'paid') / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (where installment.status = 'promised') / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (where installment.status = 'delinquent') / nullif(count(*), 0), 2)
  from public.client_installments installment
  where private.current_user_can_review_sales()
    and installment.due_month = coalesce(date_trunc('month', p_month)::date, date_trunc('month', current_date)::date)
  group by installment.due_month;
$$;

revoke all on function public.get_installment_metrics(date) from public, anon;
grant execute on function public.get_installment_metrics(date) to authenticated;

create function public.get_sales_performance(p_month date default date_trunc('month', current_date)::date)
returns table (
  seller_user_id uuid,
  seller_name text,
  seller_code text,
  confirmed_sales bigint,
  finalized_sales bigint,
  assigned_leads bigint,
  conversion_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with month_limits as (
    select date_trunc('month', p_month)::date as starts_at,
      (date_trunc('month', p_month) + interval '1 month')::date as ends_at
  ),
  assigned as (
    select lead.assigned_seller_user_id as seller_id, count(*)::bigint as total
    from public.leads lead, month_limits limits
    where lead.assigned_seller_user_id is not null
      and (lead.assigned_at at time zone 'America/Argentina/Buenos_Aires')::date >= limits.starts_at
      and (lead.assigned_at at time zone 'America/Argentina/Buenos_Aires')::date < limits.ends_at
    group by lead.assigned_seller_user_id
  ),
  confirmed as (
    select sales_case.seller_user_id as seller_id, count(*)::bigint as total
    from public.sales_cases sales_case, month_limits limits
    where (sales_case.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= limits.starts_at
      and (sales_case.created_at at time zone 'America/Argentina/Buenos_Aires')::date < limits.ends_at
    group by sales_case.seller_user_id
  ),
  finalized as (
    select sales_case.seller_user_id as seller_id, count(*)::bigint as total
    from public.sales_cases sales_case, month_limits limits
    where sales_case.finalized_at is not null
      and (sales_case.finalized_at at time zone 'America/Argentina/Buenos_Aires')::date >= limits.starts_at
      and (sales_case.finalized_at at time zone 'America/Argentina/Buenos_Aires')::date < limits.ends_at
    group by sales_case.seller_user_id
  )
  select profile.user_id, profile.full_name, profile.seller_code,
    coalesce(confirmed.total, 0)::bigint,
    coalesce(finalized.total, 0)::bigint,
    coalesce(assigned.total, 0)::bigint,
    case when coalesce(assigned.total, 0) = 0 then 0::numeric
      else round((coalesce(confirmed.total, 0)::numeric * 100) / assigned.total, 1)
    end
  from public.profiles profile
  left join assigned on assigned.seller_id = profile.user_id
  left join confirmed on confirmed.seller_id = profile.user_id
  left join finalized on finalized.seller_id = profile.user_id
  where private.current_user_active() and profile.role::text = 'seller' and profile.active = true
  order by coalesce(confirmed.total, 0) desc, coalesce(finalized.total, 0) desc, profile.full_name;
$$;

revoke all on function public.get_sales_performance(date) from public, anon;
grant execute on function public.get_sales_performance(date) to authenticated;

alter table public.model_versions enable row level security;
alter table public.bank_credit_offers enable row level security;
alter table public.bank_credit_offer_versions enable row level security;
alter table public.sales_quotes enable row level security;
alter table public.sales_cases enable row level security;
alter table public.sales_case_events enable row level security;
alter table public.sales_notifications enable row level security;
alter table public.clients enable row level security;
alter table public.client_installments enable row level security;
alter table public.sales_documents enable row level security;

create policy model_versions_read_active_users on public.model_versions for select to authenticated
using (private.current_user_active());
create policy model_versions_admin_insert on public.model_versions for insert to authenticated
with check (private.current_user_is_admin());
create policy model_versions_admin_update on public.model_versions for update to authenticated
using (private.current_user_is_admin()) with check (private.current_user_is_admin());
create policy model_versions_admin_delete on public.model_versions for delete to authenticated
using (private.current_user_is_admin());

create policy bank_credit_offers_read_active_users on public.bank_credit_offers for select to authenticated
using (private.current_user_active());
create policy bank_credit_offers_admin_insert on public.bank_credit_offers for insert to authenticated
with check (private.current_user_is_admin());
create policy bank_credit_offers_admin_update on public.bank_credit_offers for update to authenticated
using (private.current_user_is_admin()) with check (private.current_user_is_admin());
create policy bank_credit_offers_admin_delete on public.bank_credit_offers for delete to authenticated
using (private.current_user_is_admin());

create policy bank_credit_offer_versions_read on public.bank_credit_offer_versions for select to authenticated
using (private.current_user_active());
create policy bank_credit_offer_versions_admin_insert on public.bank_credit_offer_versions for insert to authenticated
with check (private.current_user_is_admin());
create policy bank_credit_offer_versions_admin_delete on public.bank_credit_offer_versions for delete to authenticated
using (private.current_user_is_admin());

create policy sales_quotes_read on public.sales_quotes for select to authenticated
using (
  private.current_user_is_management()
  or (
    private.current_user_is_sales_admin()
    and exists (
      select 1 from public.sales_cases sales_case
      where sales_case.quote_id = sales_quotes.id or sales_case.lead_id = sales_quotes.lead_id
    )
  )
  or (
    seller_user_id = (select auth.uid())
    and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = sales_quotes.lead_id)
  )
);
create policy sales_quotes_seller_insert on public.sales_quotes for insert to authenticated
with check (
  seller_user_id = (select auth.uid()) and private.current_user_active()
  and exists (
    select 1 from public.leads lead
    where lead.id = lead_id and lead.assigned_seller_user_id = (select auth.uid())
  )
  and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = sales_quotes.lead_id)
);
create policy sales_quotes_seller_update on public.sales_quotes for update to authenticated
using (seller_user_id = (select auth.uid()) and status = 'draft')
with check (seller_user_id = (select auth.uid()) and status in ('draft', 'cancelled'));

create policy sales_cases_read on public.sales_cases for select to authenticated
using (
  private.current_user_can_review_sales()
  or (seller_user_id = (select auth.uid()) and status <> 'cancelled')
);

create policy sales_case_events_read on public.sales_case_events for select to authenticated
using (
  private.current_user_can_review_sales()
  or (
    visible_to_seller
    and exists (
      select 1 from public.sales_cases sales_case
      where sales_case.id = sales_case_id
        and sales_case.seller_user_id = (select auth.uid())
        and sales_case.status <> 'cancelled'
    )
  )
);

create policy sales_notifications_read_own on public.sales_notifications for select to authenticated
using (recipient_user_id = (select auth.uid()) and private.current_user_active());
create policy sales_notifications_update_own on public.sales_notifications for update to authenticated
using (recipient_user_id = (select auth.uid()) and private.current_user_active())
with check (recipient_user_id = (select auth.uid()) and private.current_user_active());

create policy clients_read_sales_management on public.clients for select to authenticated
using (private.current_user_can_review_sales());
create policy clients_update_sales_admin on public.clients for update to authenticated
using (private.current_user_can_administer_sales()) with check (private.current_user_can_administer_sales());

create policy client_installments_read_sales_management on public.client_installments for select to authenticated
using (private.current_user_can_review_sales());
create policy client_installments_update_sales_admin on public.client_installments for update to authenticated
using (private.current_user_can_administer_sales()) with check (private.current_user_can_administer_sales());

create policy sales_documents_read_sales_management on public.sales_documents for select to authenticated
using (private.current_user_can_review_sales());
create policy sales_documents_insert_sales_admin on public.sales_documents for insert to authenticated
with check (private.current_user_can_administer_sales() and uploaded_by = (select auth.uid()));

drop policy if exists profiles_read_own_or_management on public.profiles;
create policy profiles_read_own_or_management on public.profiles for select to authenticated
using (
  private.current_user_active()
  and (user_id = (select auth.uid()) or private.current_user_is_management() or private.current_user_is_sales_admin())
);

drop policy if exists leads_read_management_or_owner on public.leads;
create policy leads_read_management_or_owner on public.leads for select to authenticated
using (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or (
      assigned_seller_user_id = (select auth.uid())
      and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = leads.id)
    )
    or (
      private.current_user_is_sales_admin()
      and exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = leads.id)
    )
  )
);

drop policy if exists lead_messages_read_management_or_owner on public.lead_messages;
create policy lead_messages_read_management_or_owner on public.lead_messages for select to authenticated
using (
  private.current_user_active()
  and exists (
    select 1 from public.leads lead
    where lead.id = lead_id
      and (
        private.current_user_is_management()
        or (
          lead.assigned_seller_user_id = (select auth.uid())
          and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = lead.id)
        )
      )
  )
);

drop policy if exists lead_crm_read_management_or_owner on public.lead_crm;
create policy lead_crm_read_management_or_owner on public.lead_crm for select to authenticated
using (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or (
      exists (
        select 1 from public.leads lead
        where lead.id = lead_id and lead.assigned_seller_user_id = (select auth.uid())
      )
      and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = lead_crm.lead_id)
    )
  )
);

drop policy if exists lead_activities_read_management_or_owner on public.lead_activities;
create policy lead_activities_read_management_or_owner on public.lead_activities for select to authenticated
using (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or (
      exists (
        select 1 from public.leads lead
        where lead.id = lead_id and lead.assigned_seller_user_id = (select auth.uid())
      )
      and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = lead_activities.lead_id)
    )
  )
);

drop policy if exists lead_sale_requests_read_management_or_owner on public.lead_sale_requests;
create policy lead_sale_requests_read_sales_scope on public.lead_sale_requests for select to authenticated
using (
  private.current_user_is_management()
  or private.current_user_is_sales_admin()
  or (seller_user_id = (select auth.uid()) and status <> 'confirmed')
);

drop policy if exists commercial_applications_read_own_or_management on public.commercial_applications;
create policy commercial_applications_read_sales_scope on public.commercial_applications for select to authenticated
using (
  private.current_user_can_review_sales()
  or (
    seller_user_id = (select auth.uid())
    and (
      sales_case_id is null
      or exists (
        select 1 from public.sales_cases sales_case
        where sales_case.id = sales_case_id and sales_case.status <> 'cancelled'
      )
    )
  )
);

drop policy if exists commercial_applications_seller_insert on public.commercial_applications;
create policy commercial_applications_seller_insert on public.commercial_applications for insert to authenticated
with check (
  private.current_user_active()
  and seller_user_id = (select auth.uid())
  and (
    (
      prequalification_event_id is not null and sales_case_id is null
      and exists (
        select 1 from public.prequalification_events event
        where event.id = prequalification_event_id and event.seller_user_id = (select auth.uid())
      )
    )
    or (
      prequalification_event_id is null and sales_case_id is not null
      and exists (
        select 1 from public.sales_cases sales_case
        where sales_case.id = sales_case_id
          and sales_case.seller_user_id = (select auth.uid())
          and (
            sales_case.status = 'minute_pending'
            or (sales_case.status = 'quality_control' and sales_case.cdn_scoring_status = 'observed')
          )
      )
    )
  )
);

drop policy if exists commercial_applications_update_own_or_admin on public.commercial_applications;
create policy commercial_applications_update_prequalification_or_sales_admin on public.commercial_applications for update to authenticated
using (
  (sales_case_id is null and seller_user_id = (select auth.uid()) and private.current_user_active())
  or private.current_user_can_administer_sales()
)
with check (
  (sales_case_id is null and seller_user_id = (select auth.uid()) and private.current_user_active())
  or private.current_user_can_administer_sales()
);

grant select, insert, update, delete on public.model_versions, public.bank_credit_offers, public.bank_credit_offer_versions to authenticated;
grant select, insert, update on public.sales_quotes to authenticated;
grant select on public.sales_cases, public.sales_case_events to authenticated;
grant select, update on public.sales_notifications to authenticated;
grant select, update on public.clients, public.client_installments to authenticated;
grant select, insert on public.sales_documents to authenticated;

grant all on public.model_versions, public.bank_credit_offers, public.bank_credit_offer_versions,
  public.sales_quotes, public.sales_cases, public.sales_case_events, public.sales_notifications,
  public.clients, public.client_installments, public.sales_documents to service_role;
grant usage, select on sequence public.sales_case_events_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sales-documents', 'sales-documents', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy sales_documents_storage_read
on storage.objects for select to authenticated
using (bucket_id = 'sales-documents' and private.current_user_can_review_sales());

create policy sales_documents_storage_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'sales-documents' and private.current_user_can_administer_sales());

create policy sales_documents_storage_update
on storage.objects for update to authenticated
using (bucket_id = 'sales-documents' and private.current_user_can_administer_sales())
with check (bucket_id = 'sales-documents' and private.current_user_can_administer_sales());
