-- Prevent concurrent WhatsApp deliveries from creating two active leads for the same phone.
create or replace function public.claim_whatsapp_lead(
  p_customer_phone text,
  p_customer_name text default null,
  p_source_channel text default 'whatsapp',
  p_source_detail text default 'organic',
  p_metadata jsonb default '{}'::jsonb
)
returns table (lead_id uuid, created_new boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_lead_id uuid;
begin
  if char_length(v_phone) < 6 then
    raise exception 'El teléfono del cliente no es válido';
  end if;

  -- The transaction-scoped lock serializes only messages from the same phone.
  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  select lead.id
    into v_lead_id
  from public.leads lead
  where lead.customer_phone = v_phone
    and lead.routing_status not in ('closed', 'lost')
    and lead.last_message_at >= now() - interval '30 days'
  order by lead.last_message_at desc, lead.created_at desc
  limit 1;

  if v_lead_id is null then
    insert into public.leads (
      customer_phone,
      customer_name,
      source_channel,
      source_detail,
      qualification_status,
      priority,
      intent_summary,
      routing_status,
      routing_reason,
      last_message_at,
      contact_consent_at,
      contact_consent_source,
      metadata
    ) values (
      v_phone,
      nullif(left(trim(coalesce(p_customer_name, '')), 120), ''),
      case when p_source_channel in ('whatsapp', 'tiktok', 'web', 'manual') then p_source_channel else 'whatsapp' end,
      nullif(left(trim(coalesce(p_source_detail, 'organic')), 120), ''),
      'follow_up',
      'normal',
      'Conversación de WhatsApp pendiente de analizar',
      'pending_supervisor',
      'general_inbox',
      now(),
      now(),
      'whatsapp_inbound',
      coalesce(p_metadata, '{}'::jsonb)
    ) returning id into v_lead_id;

    return query select v_lead_id, true;
    return;
  end if;

  update public.leads
  set customer_name = coalesce(nullif(left(trim(coalesce(p_customer_name, '')), 120), ''), customer_name),
      last_message_at = now(),
      contact_consent_at = coalesce(contact_consent_at, now()),
      contact_consent_source = case when contact_consent_source = '' then 'whatsapp_inbound' else contact_consent_source end
  where id = v_lead_id;

  return query select v_lead_id, false;
end;
$$;

revoke all on function public.claim_whatsapp_lead(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_lead(text, text, text, text, jsonb) to service_role;

create table public.vehicle_appraisals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  brand text not null,
  model text not null,
  version text not null default '',
  vehicle_year integer not null,
  mileage_km integer not null,
  condition text not null default 'good',
  notes text not null default '',
  estimated_min numeric,
  estimated_max numeric,
  market_median numeric,
  suggested_value numeric,
  market_currency text,
  estimate_source text not null default 'pending_market_reference',
  estimate_basis text not null default '',
  reference_count integer not null default 0,
  market_references jsonb not null default '[]'::jsonb,
  market_checked_at timestamptz,
  status text not null default 'pending',
  confirmed_value numeric,
  confirmed_currency text,
  review_note text not null default '',
  created_by uuid references public.profiles (user_id) on delete set null,
  reviewed_by uuid references public.profiles (user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_appraisals_year check (vehicle_year between 1950 and 2100),
  constraint vehicle_appraisals_mileage check (mileage_km between 0 and 3000000),
  constraint vehicle_appraisals_condition check (condition in ('excellent', 'good', 'fair', 'to_review')),
  constraint vehicle_appraisals_status check (status in ('pending', 'confirmed', 'rejected')),
  constraint vehicle_appraisals_range check (
    (estimated_min is null and estimated_max is null)
    or (estimated_min >= 0 and estimated_max >= estimated_min)
  ),
  constraint vehicle_appraisals_confirmed_value check (confirmed_value is null or confirmed_value >= 0),
  constraint vehicle_appraisals_currency check (
    (market_currency is null or market_currency in ('ARS', 'USD'))
    and (confirmed_currency is null or confirmed_currency in ('ARS', 'USD'))
  ),
  constraint vehicle_appraisals_market_values check (
    (market_median is null or market_median >= 0)
    and (suggested_value is null or suggested_value >= 0)
  ),
  constraint vehicle_appraisals_market_references check (jsonb_typeof(market_references) = 'array'),
  constraint vehicle_appraisals_text_length check (
    char_length(brand) between 1 and 80
    and char_length(model) between 1 and 120
    and char_length(version) <= 160
    and char_length(notes) <= 3000
    and char_length(estimate_basis) <= 3000
    and char_length(review_note) <= 3000
  )
);

create index vehicle_appraisals_status_time_idx on public.vehicle_appraisals (status, updated_at desc);

create trigger vehicle_appraisals_set_updated_at
  before update on public.vehicle_appraisals
  for each row execute function private.set_updated_at();

alter table public.vehicle_appraisals enable row level security;

create policy vehicle_appraisals_read_management_or_owner
on public.vehicle_appraisals for select
to authenticated
using (
  private.current_user_active()
  and exists (
    select 1
    from public.leads lead
    where lead.id = lead_id
      and (
        lead.assigned_seller_user_id = (select auth.uid())
        or private.current_user_is_management()
      )
  )
);

create function public.save_lead_vehicle_appraisal(
  p_lead_id uuid,
  p_brand text,
  p_model text,
  p_version text,
  p_vehicle_year integer,
  p_mileage_km integer,
  p_condition text,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appraisal_id uuid;
  v_is_owner boolean;
begin
  select exists (
    select 1
    from public.leads lead
    where lead.id = p_lead_id
      and lead.assigned_seller_user_id = (select auth.uid())
      and lead.routing_status not in ('closed', 'lost')
  ) into v_is_owner;

  if not (v_is_owner or private.current_user_is_management()) then
    raise exception 'No tenés permiso para registrar la tasación de este lead';
  end if;
  if char_length(trim(coalesce(p_brand, ''))) < 1 or char_length(trim(coalesce(p_model, ''))) < 1 then
    raise exception 'Completá marca y modelo del usado';
  end if;
  if p_vehicle_year < 1950 or p_vehicle_year > extract(year from current_date)::integer + 1 then
    raise exception 'El año del vehículo no es válido';
  end if;
  if p_mileage_km < 0 or p_mileage_km > 3000000 then
    raise exception 'El kilometraje no es válido';
  end if;
  if p_condition not in ('excellent', 'good', 'fair', 'to_review') then
    raise exception 'El estado general no es válido';
  end if;

  insert into public.vehicle_appraisals (
    lead_id, brand, model, version, vehicle_year, mileage_km, condition, notes,
    estimate_source, status, created_by
  ) values (
    p_lead_id, trim(p_brand), trim(p_model), trim(coalesce(p_version, '')),
    p_vehicle_year, p_mileage_km, p_condition, trim(coalesce(p_notes, '')),
    'pending_market_reference', 'pending', (select auth.uid())
  )
  on conflict (lead_id) do update set
    brand = excluded.brand,
    model = excluded.model,
    version = excluded.version,
    vehicle_year = excluded.vehicle_year,
    mileage_km = excluded.mileage_km,
    condition = excluded.condition,
    notes = excluded.notes,
    estimated_min = null,
    estimated_max = null,
    market_median = null,
    suggested_value = null,
    market_currency = null,
    estimate_source = 'pending_market_reference',
    estimate_basis = '',
    reference_count = 0,
    market_references = '[]'::jsonb,
    market_checked_at = null,
    status = 'pending',
    confirmed_value = null,
    confirmed_currency = null,
    review_note = '',
    reviewed_by = null,
    reviewed_at = null,
    created_by = (select auth.uid())
  returning id into v_appraisal_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    p_lead_id,
    (select auth.uid()),
    'vehicle_appraisal_requested',
    'Tasación de usado solicitada',
    concat_ws(' · ', trim(p_brand), trim(p_model), trim(coalesce(p_version, '')), p_vehicle_year::text, p_mileage_km::text || ' km'),
    jsonb_build_object('appraisal_id', v_appraisal_id, 'status', 'pending')
  );

  return v_appraisal_id;
end;
$$;

revoke all on function public.save_lead_vehicle_appraisal(uuid, text, text, text, integer, integer, text, text) from public, anon;
grant execute on function public.save_lead_vehicle_appraisal(uuid, text, text, text, integer, integer, text, text) to authenticated;

create function public.review_lead_vehicle_appraisal(
  p_appraisal_id uuid,
  p_confirmed_value numeric,
  p_review_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
begin
  if not private.current_user_is_management() then
    raise exception 'Solo Supervisión puede confirmar una tasación';
  end if;
  if p_confirmed_value is null or p_confirmed_value < 0 then
    raise exception 'Ingresá un valor de tasación válido';
  end if;

  update public.vehicle_appraisals
  set status = 'confirmed',
      confirmed_value = p_confirmed_value,
      confirmed_currency = coalesce(market_currency, 'ARS'),
      review_note = trim(coalesce(p_review_note, '')),
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_appraisal_id
  returning lead_id into v_lead_id;

  if v_lead_id is null then
    raise exception 'No se encontró la tasación';
  end if;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    v_lead_id,
    (select auth.uid()),
    'vehicle_appraisal_confirmed',
    'Tasación de usado confirmada',
    trim(coalesce(p_review_note, '')),
    jsonb_build_object('appraisal_id', p_appraisal_id, 'confirmed_value', p_confirmed_value)
  );
end;
$$;

revoke all on function public.review_lead_vehicle_appraisal(uuid, numeric, text) from public, anon;
grant execute on function public.review_lead_vehicle_appraisal(uuid, numeric, text) to authenticated;

grant select on public.vehicle_appraisals to authenticated;
grant all on public.vehicle_appraisals to service_role;

-- Mercado Libre OAuth tokens remain encrypted in Vault. Only the server-side
-- Edge Functions can consume them; CRM users never receive either token.
create table private.mercadolibre_connections (
  singleton boolean primary key default true check (singleton),
  access_secret_id uuid not null,
  refresh_secret_id uuid not null,
  expires_at timestamptz not null,
  external_user_id text not null default '',
  scopes text not null default '',
  updated_at timestamptz not null default now()
);

create table private.mercadolibre_oauth_states (
  state_hash text primary key,
  requested_by uuid not null references public.profiles (user_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint mercadolibre_oauth_state_hash_length check (char_length(state_hash) = 64)
);

create function public.create_mercadolibre_oauth_state(p_state_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.current_user_is_management() then
    raise exception 'Solo Supervisión puede conectar Mercado Libre';
  end if;
  if char_length(coalesce(p_state_hash, '')) <> 64 then
    raise exception 'El estado OAuth no es válido';
  end if;

  delete from private.mercadolibre_oauth_states where expires_at < now();
  insert into private.mercadolibre_oauth_states (state_hash, requested_by, expires_at)
  values (p_state_hash, (select auth.uid()), now() + interval '10 minutes')
  on conflict (state_hash) do update set
    requested_by = excluded.requested_by,
    expires_at = excluded.expires_at,
    created_at = now();
end;
$$;

revoke all on function public.create_mercadolibre_oauth_state(text) from public, anon;
grant execute on function public.create_mercadolibre_oauth_state(text) to authenticated;

create function public.consume_mercadolibre_oauth_state(p_state_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  with consumed as (
    delete from private.mercadolibre_oauth_states
    where state_hash = p_state_hash and expires_at >= now()
    returning 1
  )
  select exists(select 1 from consumed) into v_found;
  return v_found;
end;
$$;

revoke all on function public.consume_mercadolibre_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_mercadolibre_oauth_state(text) to service_role;

create function public.save_mercadolibre_oauth_connection(
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_external_user_id text default '',
  p_scopes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection private.mercadolibre_connections%rowtype;
  v_access_secret_id uuid;
  v_refresh_secret_id uuid;
begin
  if char_length(coalesce(p_access_token, '')) < 20 or char_length(coalesce(p_refresh_token, '')) < 20 then
    raise exception 'Mercado Libre no devolvió credenciales válidas';
  end if;

  select * into v_connection from private.mercadolibre_connections where singleton;
  if v_connection.singleton is null then
    select vault.create_secret(p_access_token, 'mercadolibre_access_token', 'Token OAuth de Mercado Libre') into v_access_secret_id;
    select vault.create_secret(p_refresh_token, 'mercadolibre_refresh_token', 'Refresh token OAuth de Mercado Libre') into v_refresh_secret_id;
  else
    v_access_secret_id := v_connection.access_secret_id;
    v_refresh_secret_id := v_connection.refresh_secret_id;
    perform vault.update_secret(v_access_secret_id, p_access_token, 'mercadolibre_access_token', 'Token OAuth de Mercado Libre');
    perform vault.update_secret(v_refresh_secret_id, p_refresh_token, 'mercadolibre_refresh_token', 'Refresh token OAuth de Mercado Libre');
  end if;

  insert into private.mercadolibre_connections (
    singleton, access_secret_id, refresh_secret_id, expires_at, external_user_id, scopes, updated_at
  ) values (
    true, v_access_secret_id, v_refresh_secret_id, p_expires_at,
    left(coalesce(p_external_user_id, ''), 120), left(coalesce(p_scopes, ''), 1000), now()
  )
  on conflict (singleton) do update set
    access_secret_id = excluded.access_secret_id,
    refresh_secret_id = excluded.refresh_secret_id,
    expires_at = excluded.expires_at,
    external_user_id = excluded.external_user_id,
    scopes = excluded.scopes,
    updated_at = now();
end;
$$;

revoke all on function public.save_mercadolibre_oauth_connection(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.save_mercadolibre_oauth_connection(text, text, timestamptz, text, text) to service_role;

create function public.get_mercadolibre_oauth_connection()
returns table (access_token text, refresh_token text, expires_at timestamptz, external_user_id text, scopes text)
language sql
security definer
set search_path = ''
as $$
  select access_secret.decrypted_secret,
         refresh_secret.decrypted_secret,
         connection.expires_at,
         connection.external_user_id,
         connection.scopes
  from private.mercadolibre_connections connection
  join vault.decrypted_secrets access_secret on access_secret.id = connection.access_secret_id
  join vault.decrypted_secrets refresh_secret on refresh_secret.id = connection.refresh_secret_id
  where connection.singleton;
$$;

revoke all on function public.get_mercadolibre_oauth_connection() from public, anon, authenticated;
grant execute on function public.get_mercadolibre_oauth_connection() to service_role;
