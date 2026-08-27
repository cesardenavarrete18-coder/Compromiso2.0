-- Keep the provisional Datero separate and make every new definitive plan
-- minute authoritative from the campaign linked to the sales operation.

create or replace function private.resolve_current_sales_plan(p_sales_case_id uuid)
returns table (
  campaign_id uuid,
  campaign_updated_at timestamptz,
  offer_type text,
  brand_name text,
  model_name text,
  image_path text,
  plan_name text,
  version_name text,
  transmission text,
  installment_count integer,
  final_price numeric,
  advance_amount numeric,
  installment_amount numeric,
  installment_is_from boolean,
  bonus text,
  benefits text[],
  campaign_active boolean,
  model_active boolean,
  brand_active boolean,
  valid_from date,
  valid_to date
)
language sql
stable
security definer
set search_path = ''
as $$
  with operation as (
    select
      sales_case.quote_id as case_quote_id,
      sale_request.quote_id as request_quote_id,
      sale_request.provisional_application_id,
      prequalification.campaign_id as prequalification_campaign_id,
      quote.campaign_id as quote_campaign_id,
      quote.offer_type as quote_offer_type
    from public.sales_cases sales_case
    join public.lead_sale_requests sale_request on sale_request.id = sales_case.sale_request_id
    left join public.commercial_applications provisional on provisional.id = sale_request.provisional_application_id
    left join public.prequalification_events prequalification on prequalification.id = provisional.prequalification_event_id
    left join public.sales_quotes quote on quote.id = sale_request.quote_id
    where sales_case.id = p_sales_case_id
  ), resolved as (
    select
      case
        when provisional_application_id is not null
          and prequalification_campaign_id is not null
          and (
            request_quote_id is null
            or (
              case_quote_id = request_quote_id
              and quote_offer_type = 'savings_plan'
              and quote_campaign_id = prequalification_campaign_id
            )
          ) then prequalification_campaign_id
        when provisional_application_id is null
          and request_quote_id is not null
          and case_quote_id = request_quote_id
          and quote_offer_type = 'savings_plan' then quote_campaign_id
        else null
      end as campaign_id,
      case
        when provisional_application_id is not null then 'savings_plan'
        when request_quote_id is not null and case_quote_id = request_quote_id then quote_offer_type
        else null
      end as offer_type
    from operation
  )
  select
    resolved.campaign_id,
    campaign.updated_at,
    resolved.offer_type,
    brand.name,
    model.name,
    model.image_path,
    campaign.plan_name,
    campaign.version_name,
    campaign.transmission,
    campaign.installment_count,
    campaign.final_price,
    campaign.advance_amount,
    campaign.installment_amount,
    campaign.installment_is_from,
    campaign.bonus,
    campaign.benefits,
    campaign.active,
    model.active,
    brand.active,
    campaign.valid_from,
    campaign.valid_to
  from resolved
  left join public.campaigns campaign on campaign.id = resolved.campaign_id
  left join public.models model on model.id = campaign.model_id
  left join public.brands brand on brand.id = model.brand_id;
$$;

revoke all on function private.resolve_current_sales_plan(uuid) from public, anon, authenticated;

create or replace function private.enforce_plan_minute_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_expected_updated_at timestamptz;
  v_plan_description text;
begin
  if new.sales_case_id is null then
    return new;
  end if;

  -- Definitive documents are immutable. Lifecycle changes may only supersede
  -- them by changing status and updated_at; corrections must insert a revision.
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['status', 'updated_at'])
      is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
      raise exception 'La Minuta Definitiva es inmutable. Creá una nueva revisión para corregirla';
    end if;
    return new;
  end if;

  select * into v_plan from private.resolve_current_sales_plan(new.sales_case_id);
  if not found then
    raise exception 'No se encontró la operación vinculada a la Minuta Definitiva';
  end if;
  if v_plan.campaign_id is null or v_plan.offer_type <> 'savings_plan' then
    raise exception 'La operación no tiene un campaign_id inequívoco para emitir la Minuta Definitiva';
  end if;
  if v_plan.campaign_updated_at is null
    or v_plan.campaign_active is not true
    or v_plan.model_active is not true
    or v_plan.brand_active is not true
    or (v_plan.valid_from is not null and v_plan.valid_from > current_date)
    or (v_plan.valid_to is not null and v_plan.valid_to < current_date) then
    raise exception 'La campaña asociada está inactiva o fuera de vigencia';
  end if;
  if coalesce(trim(v_plan.brand_name), '') = ''
    or coalesce(trim(v_plan.model_name), '') = ''
    or coalesce(trim(concat_ws(' ', v_plan.version_name, v_plan.transmission)), '') = ''
    or coalesce(trim(v_plan.plan_name), '') = ''
    or v_plan.installment_count is null
    or v_plan.installment_count < 2
    or v_plan.final_price is null
    or v_plan.final_price <= 0
    or v_plan.advance_amount is null
    or v_plan.advance_amount < 0
    or v_plan.installment_amount is null
    or v_plan.installment_amount <= 0
    or coalesce(trim(v_plan.bonus), '') = ''
    or coalesce(trim(v_plan.image_path), '') = '' then
    raise exception 'La ficha vigente del plan está incompleta';
  end if;

  begin
    v_expected_updated_at := nullif(new.commercial_snapshot ->> 'campaign_updated_at', '')::timestamptz;
  exception when others then
    raise exception 'La versión esperada de la campaña no es válida';
  end;
  if v_expected_updated_at is null then
    raise exception 'La Minuta Definitiva debe informar campaign_updated_at';
  end if;
  if v_expected_updated_at is distinct from v_plan.campaign_updated_at then
    raise exception 'Las condiciones comerciales cambiaron antes de guardar. Volvé a consultar la ficha vigente del plan';
  end if;

  v_plan_description := trim(v_plan.plan_name) || ' · ' || v_plan.installment_count || ' cuotas';
  new.brand_name := trim(v_plan.brand_name);
  new.model_name := trim(v_plan.model_name);
  new.campaign_name := v_plan_description;
  new.plan_type := v_plan_description;
  new.agreed_price := v_plan.final_price;
  new.installments_paid := 1;
  new.installments_to_pay := v_plan.installment_count - 1;
  new.commercial_snapshot := coalesce(new.commercial_snapshot, '{}'::jsonb) || jsonb_build_object(
    'source', 'final_sales_minute',
    'campaign_id', v_plan.campaign_id,
    'campaign_updated_at', v_plan.campaign_updated_at,
    'campaign_validated_at', now(),
    'brand', trim(v_plan.brand_name),
    'model', trim(v_plan.model_name),
    'version', trim(v_plan.version_name),
    'transmission', trim(v_plan.transmission),
    'plan_name', trim(v_plan.plan_name),
    'plan_description', v_plan_description,
    'installment_count', v_plan.installment_count,
    'total_installments', v_plan.installment_count,
    'final_price', v_plan.final_price,
    'advance_amount', v_plan.advance_amount,
    'installment_amount', v_plan.installment_amount,
    'installment_is_from', v_plan.installment_is_from,
    'bonus', trim(v_plan.bonus),
    'benefits', v_plan.benefits,
    'image', trim(v_plan.image_path)
  );
  return new;
end;
$$;

revoke all on function private.enforce_plan_minute_identity() from public, anon, authenticated;

drop trigger if exists commercial_applications_enforce_plan_minute on public.commercial_applications;
create trigger commercial_applications_enforce_plan_minute
  before insert or update on public.commercial_applications
  for each row execute function private.enforce_plan_minute_identity();

create or replace function public.get_sales_case_current_plan(p_sales_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan record;
  v_plan_description text;
begin
  if v_actor is null or not private.current_user_can_administer_sales() then
    raise exception 'No tenés permisos para consultar la condición comercial de esta minuta';
  end if;
  select * into v_plan from private.resolve_current_sales_plan(p_sales_case_id);
  if not found then
    raise exception 'No se encontró la operación';
  end if;
  if v_plan.campaign_id is null or v_plan.offer_type <> 'savings_plan' then
    raise exception 'La operación no tiene un campaign_id inequívoco';
  end if;
  if v_plan.campaign_updated_at is null
    or v_plan.campaign_active is not true
    or v_plan.model_active is not true
    or v_plan.brand_active is not true
    or (v_plan.valid_from is not null and v_plan.valid_from > current_date)
    or (v_plan.valid_to is not null and v_plan.valid_to < current_date)
    or coalesce(trim(v_plan.brand_name), '') = ''
    or coalesce(trim(v_plan.model_name), '') = ''
    or coalesce(trim(concat_ws(' ', v_plan.version_name, v_plan.transmission)), '') = ''
    or coalesce(trim(v_plan.plan_name), '') = ''
    or v_plan.installment_count is null
    or v_plan.installment_count < 2
    or v_plan.final_price is null
    or v_plan.final_price <= 0
    or v_plan.advance_amount is null
    or v_plan.advance_amount < 0
    or v_plan.installment_amount is null
    or v_plan.installment_amount <= 0
    or coalesce(trim(v_plan.bonus), '') = ''
    or coalesce(trim(v_plan.image_path), '') = '' then
    raise exception 'La ficha vigente del plan está incompleta, inactiva o fuera de vigencia';
  end if;
  v_plan_description := trim(v_plan.plan_name) || ' · ' || v_plan.installment_count || ' cuotas';
  return jsonb_build_object(
    'campaign_id', v_plan.campaign_id,
    'campaign_updated_at', v_plan.campaign_updated_at,
    'brand_name', trim(v_plan.brand_name),
    'model_name', trim(v_plan.model_name),
    'version_name', trim(concat_ws(' ', v_plan.version_name, v_plan.transmission)),
    'plan_type', v_plan_description,
    'total_installments', v_plan.installment_count,
    'agreed_price', v_plan.final_price,
    'advance_amount', v_plan.advance_amount,
    'installment_amount', v_plan.installment_amount,
    'installment_is_from', v_plan.installment_is_from,
    'bonus', trim(v_plan.bonus),
    'image', trim(v_plan.image_path)
  );
end;
$$;

revoke all on function public.get_sales_case_current_plan(uuid) from public, anon;
grant execute on function public.get_sales_case_current_plan(uuid) to authenticated;

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
  v_plan record;
  v_customer_id uuid;
  v_phone text;
  v_full_name text;
  v_plan_description text;
  v_revision integer;
begin
  if v_actor is null or not private.current_user_can_administer_sales() then
    raise exception 'No tenés permisos para editar minutas de venta';
  end if;
  if p_sales_case_id is null then raise exception 'La operación es obligatoria'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'Los cambios no son válidos'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Indicá el motivo de la corrección (mínimo 5 caracteres)'; end if;
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

  select * into v_plan from private.resolve_current_sales_plan(p_sales_case_id);
  if not found then
    raise exception 'No se encontró la relación comercial de la operación';
  end if;
  if v_plan.campaign_id is null or v_plan.offer_type <> 'savings_plan' then
    raise exception 'La operación no tiene un campaign_id inequívoco para revisar la Minuta Definitiva';
  end if;
  if v_plan.campaign_updated_at is null
    or v_plan.campaign_active is not true
    or v_plan.model_active is not true
    or v_plan.brand_active is not true
    or (v_plan.valid_from is not null and v_plan.valid_from > current_date)
    or (v_plan.valid_to is not null and v_plan.valid_to < current_date)
    or coalesce(trim(v_plan.brand_name), '') = ''
    or coalesce(trim(v_plan.model_name), '') = ''
    or coalesce(trim(concat_ws(' ', v_plan.version_name, v_plan.transmission)), '') = ''
    or coalesce(trim(v_plan.plan_name), '') = ''
    or v_plan.installment_count is null
    or v_plan.installment_count < 2
    or v_plan.final_price is null
    or v_plan.final_price <= 0
    or v_plan.advance_amount is null
    or v_plan.advance_amount < 0
    or v_plan.installment_amount is null
    or v_plan.installment_amount <= 0
    or coalesce(trim(v_plan.bonus), '') = ''
    or coalesce(trim(v_plan.image_path), '') = '' then
    raise exception 'La ficha vigente del plan está incompleta, inactiva o fuera de vigencia';
  end if;

  select * into v_new from jsonb_populate_record(v_current, p_changes);
  v_revision := v_current.revision_number + 1;
  if v_revision > 1000 then raise exception 'La minuta alcanzó el límite de revisiones'; end if;
  v_plan_description := trim(v_plan.plan_name) || ' · ' || v_plan.installment_count || ' cuotas';

  -- Protected/version fields are always rebuilt from the current campaign.
  v_new.id := gen_random_uuid();
  v_new.prequalification_event_id := null;
  v_new.sales_case_id := v_case.id;
  v_new.seller_user_id := v_current.seller_user_id;
  v_new.request_code := v_case.case_code || '-R' || v_revision::text;
  v_new.revision_number := v_revision;
  v_new.supersedes_application_id := v_current.id;
  v_new.status := 'submitted';
  v_new.terms_version := coalesce(nullif(v_current.terms_version, ''), 'GS-MINUTA-2026-01');
  v_new.confirmed_at := now();
  v_new.submitted_at := now();
  v_new.created_at := now();
  v_new.updated_at := now();
  v_new.brand_name := trim(v_plan.brand_name);
  v_new.model_name := trim(v_plan.model_name);
  v_new.campaign_name := v_plan_description;
  v_new.plan_type := v_plan_description;
  v_new.agreed_price := v_plan.final_price;
  v_new.installments_paid := 1;
  v_new.installments_to_pay := v_plan.installment_count - 1;
  v_new.commercial_snapshot := coalesce(v_current.commercial_snapshot, '{}'::jsonb) || jsonb_build_object(
    'source', 'final_sales_minute',
    'campaign_id', v_plan.campaign_id,
    'campaign_updated_at', v_plan.campaign_updated_at,
    'campaign_read_at', now(),
    'brand', trim(v_plan.brand_name),
    'model', trim(v_plan.model_name),
    'version', trim(v_plan.version_name),
    'transmission', trim(v_plan.transmission),
    'plan_name', trim(v_plan.plan_name),
    'plan_description', v_plan_description,
    'installment_count', v_plan.installment_count,
    'total_installments', v_plan.installment_count,
    'final_price', v_plan.final_price,
    'advance_amount', v_plan.advance_amount,
    'installment_amount', v_plan.installment_amount,
    'installment_is_from', v_plan.installment_is_from,
    'bonus', trim(v_plan.bonus),
    'benefits', v_plan.benefits,
    'image', trim(v_plan.image_path),
    'last_admin_revision_at', now(),
    'last_admin_revision_by', v_actor
  );

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

  if coalesce(v_new.first_name, '') = '' or coalesce(v_new.last_name, '') = ''
    or coalesce(v_new.document_type, '') = '' or coalesce(v_new.address, '') = ''
    or coalesce(v_new.city_province, '') = '' or coalesce(v_new.postal_code, '') = ''
    or coalesce(v_new.marital_status, '') = '' or coalesce(v_new.primary_phone, '') = ''
    or coalesce(v_new.email, '') = '' or coalesce(v_new.contact_schedule, '') = ''
    or coalesce(v_new.employment_status, '') = '' or coalesce(v_new.employer_name, '') = ''
    or coalesce(v_new.employment_seniority, '') = '' or v_new.birth_date is null then
    raise exception 'Completá todos los datos obligatorios de la minuta';
  end if;
  if v_new.document_number !~ '^\d{7,12}$' then raise exception 'El DNI debe tener entre 7 y 12 números'; end if;
  if v_new.cuil !~ '^\d{11}$' then raise exception 'El CUIL debe tener 11 números'; end if;
  if v_new.email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Ingresá un correo válido'; end if;
  if v_new.monthly_income < 0 then raise exception 'Los importes no pueden ser negativos'; end if;

  select * into v_client from public.clients where sales_case_id = v_case.id for update;
  if found and v_client.status = 'grouped'
    and (v_new.installments_paid <> v_current.installments_paid or v_new.installments_to_pay <> v_current.installments_to_pay) then
    raise exception 'La campaña cambió la cantidad de cuotas de un cliente ya agrupado; revisá su cronograma antes de generar otra minuta';
  end if;

  v_phone := regexp_replace(v_new.primary_phone, '[^0-9]', '', 'g');
  if char_length(v_phone) < 6 or char_length(v_phone) > 30 then raise exception 'Ingresá un teléfono válido'; end if;
  v_full_name := trim(v_new.first_name || ' ' || v_new.last_name);

  select lead.customer_id into v_customer_id from public.leads lead where lead.id = v_case.lead_id for update;
  if v_customer_id is null then raise exception 'El lead no tiene un cliente asociado'; end if;
  if exists (select 1 from public.customers where normalized_phone = v_phone and id <> v_customer_id) then raise exception 'Ese teléfono ya pertenece a otro cliente'; end if;
  if exists (select 1 from public.customers where document_number = v_new.document_number and id <> v_customer_id) then raise exception 'Ese DNI ya pertenece a otro cliente'; end if;
  if exists (select 1 from public.customers where cuil = v_new.cuil and id <> v_customer_id) then raise exception 'Ese CUIL ya pertenece a otro cliente'; end if;

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

  update public.commercial_applications set status = 'superseded', updated_at = now() where id = v_current.id;
  update public.customers set normalized_phone = v_phone, primary_phone = v_new.primary_phone, full_name = v_full_name, email = v_new.email, document_number = v_new.document_number, cuil = v_new.cuil, updated_at = now() where id = v_customer_id;
  update public.leads set customer_name = v_full_name, customer_phone = v_new.primary_phone, model_interest = v_new.model_name, updated_at = now() where id = v_case.lead_id;
  update public.sales_cases set vehicle = trim(v_new.brand_name || ' ' || v_new.model_name), sale_amount = v_new.agreed_price, updated_at = now() where id = v_case.id;
  update public.lead_sale_requests set vehicle = trim(v_new.brand_name || ' ' || v_new.model_name), sale_amount = v_new.agreed_price where id = v_case.sale_request_id;
  update public.clients set automatic_debit = v_new.automatic_debit, updated_at = now() where sales_case_id = v_case.id;

  insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, comment, metadata)
  values (
    v_case.id,
    v_actor,
    'minute_corrected',
    'Administración de Ventas corrigió la minuta. Motivo: ' || trim(p_reason),
    jsonb_build_object(
      'previous_application_id', v_current.id,
      'new_application_id', v_new.id,
      'previous_revision', v_current.revision_number,
      'new_revision', v_revision,
      'campaign_id', v_plan.campaign_id,
      'campaign_updated_at', v_plan.campaign_updated_at,
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
