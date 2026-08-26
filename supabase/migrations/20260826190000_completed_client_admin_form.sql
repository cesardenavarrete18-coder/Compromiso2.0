-- Replace the provisional spreadsheet intake with a complete administrative
-- minute that enters the customer directly into the finalized portfolio.

drop function if exists public.import_historical_clients(text, jsonb);
drop table if exists public.historical_clients;

create or replace function public.create_completed_client_from_admin(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_seller uuid := nullif(p_data->>'seller_user_id', '')::uuid;
  v_sale_date date := nullif(p_data->>'sale_date', '')::date;
  v_sale_at timestamptz;
  v_first_name text := regexp_replace(trim(coalesce(p_data->>'first_name', '')), '\s+', ' ', 'g');
  v_last_name text := regexp_replace(trim(coalesce(p_data->>'last_name', '')), '\s+', ' ', 'g');
  v_full_name text;
  v_document text := regexp_replace(coalesce(p_data->>'document_number', ''), '[^0-9]', '', 'g');
  v_cuil text := regexp_replace(coalesce(p_data->>'cuil', ''), '[^0-9]', '', 'g');
  v_phone text := private.normalize_argentina_mobile_phone(p_data->>'primary_phone');
  v_vehicle text := regexp_replace(trim(coalesce(p_data->>'model_name', '')), '\s+', ' ', 'g');
  v_brand text := trim(coalesce(p_data->>'brand_name', ''));
  v_installments_paid integer := coalesce(nullif(p_data->>'installments_paid', '')::integer, 0);
  v_installments_to_pay integer := coalesce(nullif(p_data->>'installments_to_pay', '')::integer, 0);
  v_customer_id uuid;
  v_lead_id uuid;
  v_request_id uuid;
  v_case_id uuid;
  v_client_id uuid;
  v_case_code text;
  v_identity_matches integer;
  v_request_code text := 'GS-ADM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if v_actor is null or not private.current_user_can_administer_sales() then
    raise exception 'Se requiere permiso de Administración de Ventas';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'La ficha del cliente es inválida'; end if;
  if not exists (select 1 from public.profiles where user_id = v_seller and role::text = 'seller' and active) then
    raise exception 'Seleccioná un vendedor activo';
  end if;
  if v_sale_date is null or v_sale_date < date '2026-08-01' or v_sale_date > current_date then
    raise exception 'La fecha de venta debe estar entre 01/08/2026 y hoy';
  end if;
  if char_length(v_first_name) < 2 or char_length(v_last_name) < 2 then raise exception 'Ingresá nombre y apellido'; end if;
  if char_length(v_document) not between 7 and 12 then raise exception 'El documento debe tener entre 7 y 12 números'; end if;
  if char_length(v_cuil) <> 11 then raise exception 'El CUIL debe tener 11 números'; end if;
  if char_length(v_phone) < 6 or char_length(v_phone) > 30 then raise exception 'El teléfono es inválido'; end if;
  if v_brand not in ('Volkswagen', 'Peugeot', 'Fiat') then raise exception 'Seleccioná una marca válida'; end if;
  if char_length(v_vehicle) < 2 or char_length(v_vehicle) > 160 then raise exception 'Ingresá el modelo o versión'; end if;
  if v_installments_paid <> 1 or v_installments_to_pay not in (83, 119) then raise exception 'Las cuotas deben ser 1/83 o 1/119'; end if;
  if nullif(p_data->>'birth_date', '') is null or nullif(p_data->>'birth_date', '')::date >= current_date then raise exception 'La fecha de nacimiento es inválida'; end if;
  if position('@' in coalesce(p_data->>'email', '')) < 2 then raise exception 'El correo electrónico es inválido'; end if;
  if exists (
    select 1 from unnest(array[
      p_data->>'address', p_data->>'city_province', p_data->>'postal_code', p_data->>'marital_status',
      p_data->>'contact_schedule', p_data->>'employment_status', p_data->>'employer_name',
      p_data->>'employment_seniority', p_data->>'campaign_name', p_data->>'plan_type'
    ]) required_value where nullif(trim(required_value), '') is null
  ) then raise exception 'Completá todos los campos obligatorios de la minuta'; end if;
  if nullif(regexp_replace(coalesce(p_data->>'spouse_document', ''), '[^0-9]', '', 'g'), '') is not null
    and char_length(regexp_replace(p_data->>'spouse_document', '[^0-9]', '', 'g')) not between 7 and 12 then
    raise exception 'El documento del cónyuge debe tener entre 7 y 12 números';
  end if;
  if coalesce(nullif(p_data->>'monthly_income', '')::numeric, -1) < 0 or coalesce(nullif(p_data->>'agreed_price', '')::numeric, -1) < 0 then
    raise exception 'Los importes no pueden ser negativos';
  end if;
  if (nullif(p_data->>'first_payment_date', '') is null) <> (nullif(p_data->>'first_payment_amount', '') is null)
    or (nullif(p_data->>'second_payment_date', '') is null) <> (nullif(p_data->>'second_payment_amount', '') is null) then
    raise exception 'Cada pago debe tener fecha e importe';
  end if;
  if coalesce(nullif(p_data->>'first_payment_amount', '')::numeric, 0) < 0
    or coalesce(nullif(p_data->>'second_payment_amount', '')::numeric, 0) < 0 then
    raise exception 'Los pagos no pueden ser negativos';
  end if;

  v_full_name := v_first_name || ' ' || v_last_name;
  v_sale_at := (v_sale_date + time '12:00') at time zone 'America/Argentina/Buenos_Aires';

  select count(distinct customer.id) into v_identity_matches
  from public.customers customer
  where customer.normalized_phone = v_phone or customer.document_number = v_document or customer.cuil = v_cuil;
  if v_identity_matches > 1 then raise exception 'El teléfono, DNI o CUIL pertenecen a fichas diferentes; revisá los datos'; end if;

  select customer.id into v_customer_id
  from public.customers customer
  where customer.normalized_phone = v_phone or customer.document_number = v_document or customer.cuil = v_cuil
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      normalized_phone, primary_phone, full_name, email, document_number, cuil, created_at, updated_at
    ) values (
      v_phone, trim(p_data->>'primary_phone'), v_full_name, lower(trim(p_data->>'email')), v_document, v_cuil, v_sale_at, now()
    ) returning id into v_customer_id;
  else
    update public.customers set
      normalized_phone = v_phone, primary_phone = trim(p_data->>'primary_phone'), full_name = v_full_name,
      email = lower(trim(p_data->>'email')), document_number = v_document, cuil = v_cuil, updated_at = now()
    where id = v_customer_id;
  end if;

  if exists (
    select 1 from public.sales_cases sales_case
    join public.leads lead on lead.id = sales_case.lead_id
    where lead.customer_id = v_customer_id and lower(sales_case.vehicle) = lower(v_vehicle)
      and sales_case.created_at::date = v_sale_date
  ) then raise exception 'Este cliente ya tiene registrada la misma venta en esa fecha'; end if;

  insert into public.leads (
    customer_id, customer_phone, customer_name, source_channel, source_detail,
    qualification_status, priority, intent_summary, model_interest, routing_status,
    routing_reason, assigned_seller_user_id, assigned_by_user_id, assigned_at,
    last_message_at, metadata, created_at, updated_at
  ) values (
    v_customer_id, v_phone, v_full_name, 'manual', 'Alta administrativa de cliente finalizado',
    'qualified', 'normal', 'Venta finalizada cargada por Administración.', v_vehicle, 'assigned_manual',
    'completed_client_admin', v_seller, v_actor, v_sale_at,
    v_sale_at, jsonb_build_object('source', 'completed_client_admin', 'entered_by', v_actor), v_sale_at, now()
  ) returning id into v_lead_id;

  update public.lead_crm set
    status = 'venta', sale_confirmation_status = 'confirmed', sale_requested_at = v_sale_at,
    sale_requested_by = v_seller, sale_confirmed_at = v_sale_at, sale_confirmed_by = v_actor,
    vehicle_sold = v_vehicle, sale_amount = nullif(p_data->>'agreed_price', '')::numeric,
    updated_by = v_actor, updated_at = now()
  where lead_id = v_lead_id;

  insert into public.lead_sale_requests (
    lead_id, seller_user_id, vehicle, sale_amount, notes, status,
    requested_at, reviewed_by, reviewed_at, review_note
  ) values (
    v_lead_id, v_seller, v_vehicle, nullif(p_data->>'agreed_price', '')::numeric,
    left(trim(coalesce(p_data->>'admin_notes', '')), 3000), 'confirmed',
    v_sale_at, v_actor, v_sale_at, 'Cliente finalizado cargado directamente por Administración.'
  ) returning id into v_request_id;

  insert into public.sales_cases (
    sale_request_id, lead_id, seller_user_id, vehicle, sale_amount, created_at, updated_at
  ) values (
    v_request_id, v_lead_id, v_seller, v_vehicle, nullif(p_data->>'agreed_price', '')::numeric, v_sale_at, now()
  ) returning id into v_case_id;

  insert into public.commercial_applications (
    sales_case_id, seller_user_id, request_code, brand_name, model_name, campaign_name,
    first_name, last_name, document_type, document_number, cuil, birth_date,
    address, city_province, postal_code, marital_status, spouse_name, spouse_document,
    primary_phone, alternate_phone, email, contact_schedule, employment_status,
    employer_name, employment_seniority, monthly_income, automatic_debit,
    deferred_installment, installments_paid, installments_to_pay, plan_type,
    agreed_price, first_payment_date, first_payment_amount, second_payment_date,
    second_payment_amount, status, terms_version, confirmed_at, commercial_snapshot,
    revision_number, submitted_at, created_at, updated_at
  ) values (
    v_case_id, v_seller, v_request_code, v_brand, v_vehicle, trim(p_data->>'campaign_name'),
    v_first_name, v_last_name, p_data->>'document_type', v_document, v_cuil, (p_data->>'birth_date')::date,
    trim(p_data->>'address'), trim(p_data->>'city_province'), trim(p_data->>'postal_code'), p_data->>'marital_status', nullif(trim(p_data->>'spouse_name'), ''), nullif(regexp_replace(coalesce(p_data->>'spouse_document', ''), '[^0-9]', '', 'g'), ''),
    trim(p_data->>'primary_phone'), nullif(trim(p_data->>'alternate_phone'), ''), lower(trim(p_data->>'email')), trim(p_data->>'contact_schedule'), trim(p_data->>'employment_status'),
    trim(p_data->>'employer_name'), trim(p_data->>'employment_seniority'), (p_data->>'monthly_income')::numeric, coalesce((p_data->>'automatic_debit')::boolean, false),
    coalesce((p_data->>'deferred_installment')::boolean, false), v_installments_paid, v_installments_to_pay, trim(p_data->>'plan_type'),
    (p_data->>'agreed_price')::numeric, nullif(p_data->>'first_payment_date', '')::date, nullif(p_data->>'first_payment_amount', '')::numeric, nullif(p_data->>'second_payment_date', '')::date,
    nullif(p_data->>'second_payment_amount', '')::numeric, 'submitted', 'ADMIN-COMPLETED-2026-01', v_sale_at,
    jsonb_build_object('source', 'completed_client_admin', 'entered_by', v_actor, 'admin_notes', coalesce(p_data->>'admin_notes', '')),
    1, v_sale_at, v_sale_at, now()
  );

  update public.sales_cases set
    status = 'formation_group', cdn_scoring_status = 'approved', dealer_scoring_status = 'approved',
    contract_status = 'approved', finalized_at = v_sale_at, updated_at = now()
  where id = v_case_id
  returning case_code into v_case_code;

  insert into public.clients (sales_case_id, status, automatic_debit, created_at, updated_at)
  values (v_case_id, 'formation_group', coalesce((p_data->>'automatic_debit')::boolean, false), v_sale_at, now())
  returning id into v_client_id;

  insert into public.sales_case_events (
    sales_case_id, actor_user_id, event_type, stage, outcome, comment, visible_to_seller, metadata, created_at
  ) values (
    v_case_id, v_actor, 'sale_finalized', 'contract', 'approved',
    'Cliente finalizado incorporado directamente por Administración.', true,
    jsonb_build_object('source', 'completed_client_admin', 'admin_notes', coalesce(p_data->>'admin_notes', '')), v_sale_at
  );

  return jsonb_build_object('client_id', v_client_id, 'sales_case_id', v_case_id, 'case_code', v_case_code);
end;
$$;

revoke all on function public.create_completed_client_from_admin(jsonb) from public, anon;
grant execute on function public.create_completed_client_from_admin(jsonb) to authenticated;
