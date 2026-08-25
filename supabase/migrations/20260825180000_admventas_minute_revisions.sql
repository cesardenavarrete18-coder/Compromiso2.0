-- Allow Sales Administration to correct submitted minutes without losing
-- history or reopening an already reviewed/finalized sales case.

create or replace function private.after_sales_minute_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous integer;
begin
  if new.sales_case_id is null then return new; end if;

  -- Administrative revisions are handled atomically by revise_sales_minute.
  -- That RPC preserves the current workflow and records the real editor.
  if private.current_user_can_administer_sales() then
    return new;
  end if;

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
    coalesce(auth.uid(), new.seller_user_id),
    case when coalesce(v_previous, 0) = 0 then 'minute_submitted' else 'minute_corrected' end,
    'cdn_scoring',
    'pending',
    case when coalesce(v_previous, 0) = 0 then 'Minuta enviada a Administración de Ventas.' else 'Minuta corregida y reenviada.' end
  );
  return new;
end;
$$;

revoke all on function private.after_sales_minute_insert() from public, anon, authenticated;

create or replace function public.revise_sales_minute(
  p_sales_case_id uuid,
  p_changes jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.sales_cases%rowtype;
  v_current public.commercial_applications%rowtype;
  v_new public.commercial_applications%rowtype;
  v_client public.clients%rowtype;
  v_customer_id uuid;
  v_phone text;
  v_full_name text;
  v_revision integer;
begin
  if v_actor is null or not private.current_user_can_administer_sales() then
    raise exception 'No tenés permisos para editar minutas de venta';
  end if;
  if p_sales_case_id is null then raise exception 'La operación es obligatoria'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'Los cambios no son válidos'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indicá el motivo de la corrección (mínimo 5 caracteres)';
  end if;
  if char_length(trim(p_reason)) > 500 then raise exception 'El motivo no puede superar 500 caracteres'; end if;

  select * into v_case from public.sales_cases where id = p_sales_case_id for update;
  if not found then raise exception 'No se encontró la operación'; end if;
  if v_case.status = 'cancelled' then raise exception 'No se puede editar la minuta de una operación dada de baja'; end if;

  select * into v_current
  from public.commercial_applications
  where sales_case_id = p_sales_case_id and status = 'submitted'
  order by revision_number desc
  limit 1
  for update;
  if not found then raise exception 'La operación todavía no tiene una minuta enviada'; end if;

  select * into v_new from jsonb_populate_record(v_current, p_changes);
  v_revision := v_current.revision_number + 1;
  if v_revision > 1000 then raise exception 'La minuta alcanzó el límite de revisiones'; end if;

  -- Protected/version fields can never be supplied by the browser.
  v_new.id := gen_random_uuid();
  v_new.prequalification_event_id := null;
  v_new.sales_case_id := v_case.id;
  v_new.seller_user_id := v_current.seller_user_id;
  v_new.request_code := v_case.case_code || '-R' || v_revision::text;
  v_new.revision_number := v_revision;
  v_new.supersedes_application_id := v_current.id;
  v_new.status := 'submitted';
  v_new.terms_version := v_current.terms_version;
  v_new.confirmed_at := now();
  v_new.submitted_at := now();
  v_new.created_at := now();
  v_new.updated_at := now();
  v_new.commercial_snapshot := coalesce(v_current.commercial_snapshot, '{}'::jsonb)
    || jsonb_build_object('last_admin_revision_at', now(), 'last_admin_revision_by', v_actor);

  v_new.brand_name := trim(v_new.brand_name);
  v_new.model_name := trim(v_new.model_name);
  v_new.campaign_name := trim(v_new.campaign_name);
  v_new.first_name := trim(v_new.first_name);
  v_new.last_name := trim(v_new.last_name);
  v_new.document_type := trim(v_new.document_type);
  v_new.document_number := regexp_replace(coalesce(v_new.document_number, ''), '[^0-9]', '', 'g');
  v_new.cuil := regexp_replace(coalesce(v_new.cuil, ''), '[^0-9]', '', 'g');
  v_new.address := trim(v_new.address);
  v_new.city_province := trim(v_new.city_province);
  v_new.postal_code := trim(v_new.postal_code);
  v_new.marital_status := trim(v_new.marital_status);
  v_new.spouse_name := nullif(trim(coalesce(v_new.spouse_name, '')), '');
  v_new.spouse_document := nullif(regexp_replace(coalesce(v_new.spouse_document, ''), '[^0-9]', '', 'g'), '');
  v_new.primary_phone := trim(v_new.primary_phone);
  v_new.alternate_phone := nullif(trim(coalesce(v_new.alternate_phone, '')), '');
  v_new.email := lower(trim(v_new.email));
  v_new.contact_schedule := trim(v_new.contact_schedule);
  v_new.employment_status := trim(v_new.employment_status);
  v_new.employer_name := trim(v_new.employer_name);
  v_new.employment_seniority := trim(v_new.employment_seniority);
  v_new.plan_type := trim(v_new.plan_type);

  if coalesce(v_new.brand_name, '') = '' or coalesce(v_new.model_name, '') = ''
    or coalesce(v_new.campaign_name, '') = '' or coalesce(v_new.first_name, '') = ''
    or coalesce(v_new.last_name, '') = '' or coalesce(v_new.document_type, '') = ''
    or coalesce(v_new.address, '') = '' or coalesce(v_new.city_province, '') = ''
    or coalesce(v_new.postal_code, '') = '' or coalesce(v_new.marital_status, '') = ''
    or coalesce(v_new.primary_phone, '') = '' or coalesce(v_new.email, '') = ''
    or coalesce(v_new.contact_schedule, '') = '' or coalesce(v_new.employment_status, '') = ''
    or coalesce(v_new.employer_name, '') = '' or coalesce(v_new.employment_seniority, '') = ''
    or coalesce(v_new.plan_type, '') = '' or v_new.birth_date is null then
    raise exception 'Completá todos los datos obligatorios de la minuta';
  end if;
  if v_new.document_number !~ '^\d{7,12}$' then raise exception 'El DNI debe tener entre 7 y 12 números'; end if;
  if v_new.cuil !~ '^\d{11}$' then raise exception 'El CUIL debe tener 11 números'; end if;
  if v_new.email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Ingresá un correo válido'; end if;
  if v_new.monthly_income < 0 or v_new.agreed_price < 0 then raise exception 'Los importes no pueden ser negativos'; end if;
  if v_new.installments_paid < 0 or v_new.installments_to_pay <= 0 then raise exception 'La cantidad de cuotas no es válida'; end if;

  select * into v_client from public.clients where sales_case_id = v_case.id for update;
  if found and v_client.status = 'grouped'
    and (v_new.installments_paid <> v_current.installments_paid or v_new.installments_to_pay <> v_current.installments_to_pay) then
    raise exception 'Las cuotas de un cliente ya agrupado no pueden modificarse porque su cronograma ya fue generado';
  end if;

  v_phone := regexp_replace(v_new.primary_phone, '[^0-9]', '', 'g');
  if char_length(v_phone) < 6 or char_length(v_phone) > 30 then raise exception 'Ingresá un teléfono válido'; end if;
  v_full_name := trim(v_new.first_name || ' ' || v_new.last_name);

  select lead.customer_id into v_customer_id from public.leads lead where lead.id = v_case.lead_id for update;
  if v_customer_id is null then raise exception 'El lead no tiene un cliente asociado'; end if;
  if exists (select 1 from public.customers where normalized_phone = v_phone and id <> v_customer_id) then
    raise exception 'Ese teléfono ya pertenece a otro cliente';
  end if;
  if exists (select 1 from public.customers where document_number = v_new.document_number and id <> v_customer_id) then
    raise exception 'Ese DNI ya pertenece a otro cliente';
  end if;
  if exists (select 1 from public.customers where cuil = v_new.cuil and id <> v_customer_id) then
    raise exception 'Ese CUIL ya pertenece a otro cliente';
  end if;

  insert into public.commercial_applications (
    id, prequalification_event_id, seller_user_id, request_code,
    brand_name, model_name, campaign_name, first_name, last_name,
    document_type, document_number, cuil, birth_date, address,
    city_province, postal_code, marital_status, spouse_name, spouse_document,
    primary_phone, alternate_phone, email, contact_schedule,
    employment_status, employer_name, employment_seniority, monthly_income,
    automatic_debit, deferred_installment, installments_paid, installments_to_pay,
    plan_type, agreed_price, first_payment_date, first_payment_amount,
    second_payment_date, second_payment_amount, status, terms_version,
    confirmed_at, commercial_snapshot, created_at, updated_at, sales_case_id,
    revision_number, supersedes_application_id, submitted_at
  ) values (
    v_new.id, v_new.prequalification_event_id, v_new.seller_user_id, v_new.request_code,
    v_new.brand_name, v_new.model_name, v_new.campaign_name, v_new.first_name, v_new.last_name,
    v_new.document_type, v_new.document_number, v_new.cuil, v_new.birth_date, v_new.address,
    v_new.city_province, v_new.postal_code, v_new.marital_status, v_new.spouse_name, v_new.spouse_document,
    v_new.primary_phone, v_new.alternate_phone, v_new.email, v_new.contact_schedule,
    v_new.employment_status, v_new.employer_name, v_new.employment_seniority, v_new.monthly_income,
    v_new.automatic_debit, v_new.deferred_installment, v_new.installments_paid, v_new.installments_to_pay,
    v_new.plan_type, v_new.agreed_price, v_new.first_payment_date, v_new.first_payment_amount,
    v_new.second_payment_date, v_new.second_payment_amount, v_new.status, v_new.terms_version,
    v_new.confirmed_at, v_new.commercial_snapshot, v_new.created_at, v_new.updated_at, v_new.sales_case_id,
    v_new.revision_number, v_new.supersedes_application_id, v_new.submitted_at
  );
  update public.commercial_applications
  set status = 'superseded', updated_at = now()
  where id = v_current.id;

  update public.customers
  set normalized_phone = v_phone,
      primary_phone = v_new.primary_phone,
      full_name = v_full_name,
      email = v_new.email,
      document_number = v_new.document_number,
      cuil = v_new.cuil,
      updated_at = now()
  where id = v_customer_id;

  update public.leads
  set customer_name = v_full_name,
      customer_phone = v_new.primary_phone,
      model_interest = v_new.model_name,
      updated_at = now()
  where id = v_case.lead_id;

  update public.sales_cases
  set vehicle = trim(v_new.brand_name || ' ' || v_new.model_name),
      sale_amount = v_new.agreed_price,
      updated_at = now()
  where id = v_case.id;

  update public.lead_sale_requests
  set vehicle = trim(v_new.brand_name || ' ' || v_new.model_name),
      sale_amount = v_new.agreed_price
  where id = v_case.sale_request_id;

  update public.clients
  set automatic_debit = v_new.automatic_debit, updated_at = now()
  where sales_case_id = v_case.id;

  insert into public.sales_case_events (
    sales_case_id, actor_user_id, event_type, comment, metadata
  ) values (
    v_case.id,
    v_actor,
    'minute_corrected',
    'Administración de Ventas corrigió la minuta. Motivo: ' || trim(p_reason),
    jsonb_build_object(
      'previous_application_id', v_current.id,
      'new_application_id', v_new.id,
      'previous_revision', v_current.revision_number,
      'new_revision', v_revision,
      'reason', trim(p_reason)
    )
  );

  return v_new.id;
exception
  when unique_violation then
    raise exception 'El DNI, CUIL, teléfono o código de revisión ya existe en otro registro';
end;
$$;

revoke all on function public.revise_sales_minute(uuid, jsonb, text) from public, anon;
grant execute on function public.revise_sales_minute(uuid, jsonb, text) to authenticated;
