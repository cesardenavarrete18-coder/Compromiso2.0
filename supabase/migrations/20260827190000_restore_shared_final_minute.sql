-- Keep the provisional Datero unchanged and make newly emitted final minutes
-- authoritative from the campaign linked to the approved sales operation.

create or replace function private.enforce_plan_minute_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer_type text;
  v_campaign_id uuid;
  v_campaign_updated_at timestamptz;
  v_expected_updated_at timestamptz;
  v_brand text;
  v_model text;
  v_image text;
  v_plan text;
  v_version text;
  v_transmission text;
  v_total_installments integer;
  v_final_price numeric(16, 2);
  v_advance numeric(16, 2);
  v_installment numeric(16, 2);
  v_installment_is_from boolean;
  v_bonus text;
  v_benefits text[];
begin
  -- The Apto document remains provisional and must not declare final payments.
  if new.sales_case_id is null then
    return new;
  end if;

  select
    case
      when sale_request.provisional_application_id is not null then prequalification.campaign_id
      when sale_request.quote_id is not null and sales_case.quote_id = sale_request.quote_id then quote.campaign_id
      else null
    end,
    case
      when sale_request.provisional_application_id is not null then 'savings_plan'
      when sale_request.quote_id is not null and sales_case.quote_id = sale_request.quote_id then quote.offer_type
      else null
    end
  into v_campaign_id, v_offer_type
  from public.sales_cases sales_case
  join public.lead_sale_requests sale_request on sale_request.id = sales_case.sale_request_id
  left join public.commercial_applications provisional on provisional.id = sale_request.provisional_application_id
  left join public.prequalification_events prequalification on prequalification.id = provisional.prequalification_event_id
  left join public.sales_quotes quote on quote.id = sale_request.quote_id
  where sales_case.id = new.sales_case_id;

  if coalesce(new.commercial_snapshot ->> 'source', '') = 'final_sales_minute' then
    if v_offer_type <> 'savings_plan' or v_campaign_id is null then
      raise exception 'La operación no tiene un campaign_id inequívoco para emitir la Minuta Definitiva';
    end if;

    select
      campaign.updated_at,
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
      campaign.benefits
    into
      v_campaign_updated_at,
      v_brand,
      v_model,
      v_image,
      v_plan,
      v_version,
      v_transmission,
      v_total_installments,
      v_final_price,
      v_advance,
      v_installment,
      v_installment_is_from,
      v_bonus,
      v_benefits
    from public.campaigns campaign
    join public.models model on model.id = campaign.model_id
    join public.brands brand on brand.id = model.brand_id
    where campaign.id = v_campaign_id
      and campaign.active = true
      and model.active = true
      and brand.active = true
      and (campaign.valid_from is null or campaign.valid_from <= current_date)
      and (campaign.valid_to is null or campaign.valid_to >= current_date);

    if v_campaign_updated_at is null
      or coalesce(v_brand, '') = ''
      or coalesce(v_model, '') = ''
      or coalesce(trim(concat_ws(' ', v_version, v_transmission)), '') = ''
      or coalesce(v_plan, '') = ''
      or v_total_installments is null
      or v_total_installments < 2
      or v_final_price is null
      or v_final_price <= 0
      or coalesce(v_image, '') = '' then
      raise exception 'La ficha vigente del plan está incompleta o inactiva';
    end if;

    begin
      v_expected_updated_at := nullif(new.commercial_snapshot ->> 'campaign_updated_at', '')::timestamptz;
    exception when others then
      raise exception 'La versión esperada de la campaña no es válida';
    end;

    if v_expected_updated_at is distinct from v_campaign_updated_at then
      raise exception 'Las condiciones comerciales cambiaron antes de guardar. Volvé a consultar la ficha vigente del plan';
    end if;

    new.brand_name := v_brand;
    new.model_name := v_model;
    new.campaign_name := trim(v_plan) || ' · ' || v_total_installments || ' cuotas';
    new.plan_type := new.campaign_name;
    new.agreed_price := v_final_price;
    new.installments_paid := 1;
    new.installments_to_pay := v_total_installments - 1;
    new.commercial_snapshot := coalesce(new.commercial_snapshot, '{}'::jsonb) || jsonb_build_object(
      'campaign_id', v_campaign_id,
      'campaign_updated_at', v_campaign_updated_at,
      'brand', v_brand,
      'model', v_model,
      'version', v_version,
      'transmission', v_transmission,
      'plan_name', v_plan,
      'plan_description', new.campaign_name,
      'installment_count', v_total_installments,
      'total_installments', v_total_installments,
      'final_price', v_final_price,
      'advance_amount', v_advance,
      'installment_amount', v_installment,
      'installment_is_from', v_installment_is_from,
      'bonus', v_bonus,
      'benefits', v_benefits,
      'image', v_image,
      'campaign_validated_at', now()
    );
  elsif v_offer_type = 'savings_plan' then
    -- Preserve compatibility for already stored legacy minutes, but never
    -- manufacture an 84-installment default when their real total is absent.
    v_total_installments := coalesce(
      nullif(new.commercial_snapshot ->> 'installmentCount', '')::integer,
      nullif(new.commercial_snapshot ->> 'total_installments', '')::integer,
      new.installments_paid + new.installments_to_pay
    );
    if v_total_installments is null or v_total_installments < 2 then
      raise exception 'No se pudo determinar la cantidad total de cuotas del plan';
    end if;
    if new.installments_paid <> 1 or new.installments_to_pay <> v_total_installments - 1 then
      raise exception 'Las cuotas del plan deben ser 1/%', v_total_installments - 1;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_plan_minute_identity() from public, anon, authenticated;

drop trigger if exists commercial_applications_enforce_plan_minute on public.commercial_applications;
create trigger commercial_applications_enforce_plan_minute
  before insert or update of
    sales_case_id,
    brand_name,
    model_name,
    campaign_name,
    plan_type,
    agreed_price,
    installments_paid,
    installments_to_pay,
    commercial_snapshot
  on public.commercial_applications
  for each row execute function private.enforce_plan_minute_identity();
