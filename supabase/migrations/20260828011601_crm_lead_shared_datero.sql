-- Allow the existing provisional commercial application to originate from an
-- assigned CRM Lead without creating a fictitious prequalification.

alter table public.commercial_applications
  add column if not exists lead_id uuid,
  add column if not exists campaign_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.commercial_applications'::regclass
      and conname = 'commercial_applications_lead_id_fkey'
  ) then
    alter table public.commercial_applications
      add constraint commercial_applications_lead_id_fkey
      foreign key (lead_id) references public.leads (id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.commercial_applications'::regclass
      and conname = 'commercial_applications_campaign_id_fkey'
  ) then
    alter table public.commercial_applications
      add constraint commercial_applications_campaign_id_fkey
      foreign key (campaign_id) references public.campaigns (id) on delete restrict;
  end if;
end
$migration$;

alter table public.commercial_applications
  drop constraint if exists commercial_applications_source,
  add constraint commercial_applications_source check (
    num_nonnulls(prequalification_event_id, sales_case_id, lead_id) = 1
  );

alter table public.commercial_applications
  drop constraint if exists commercial_applications_crm_campaign,
  add constraint commercial_applications_crm_campaign check (
    lead_id is null or campaign_id is not null
  ) not valid;

-- Existing historical CRM rows are never rewritten. The check applies to every
-- new or updated row and is validated immediately when there is no legacy gap.
do $migration$
begin
  if not exists (
    select 1
    from public.commercial_applications
    where lead_id is not null and campaign_id is null
  ) then
    alter table public.commercial_applications
      validate constraint commercial_applications_crm_campaign;
  end if;
end
$migration$;

create unique index if not exists commercial_applications_lead_unique
  on public.commercial_applications (lead_id)
  where lead_id is not null;

create index if not exists commercial_applications_lead_time_idx
  on public.commercial_applications (lead_id, created_at desc)
  where lead_id is not null;

create index if not exists commercial_applications_campaign_idx
  on public.commercial_applications (campaign_id)
  where campaign_id is not null;

drop policy if exists commercial_applications_seller_insert on public.commercial_applications;
create policy commercial_applications_seller_insert
on public.commercial_applications for insert to authenticated
with check (
  private.current_user_active()
  and seller_user_id = (select auth.uid())
  and (
    (
      prequalification_event_id is not null and sales_case_id is null and lead_id is null
      and exists (
        select 1 from public.prequalification_events event
        where event.id = prequalification_event_id
          and event.seller_user_id = (select auth.uid())
      )
    )
    or (
      prequalification_event_id is null and sales_case_id is not null and lead_id is null
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
    or (
      prequalification_event_id is null and sales_case_id is null and lead_id is not null
      and exists (
        select 1 from public.leads lead
        where lead.id = lead_id
          and lead.assigned_seller_user_id = (select auth.uid())
      )
    )
  )
);

create or replace function public.submit_crm_lead_sale(
  p_application_id uuid,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.commercial_applications%rowtype;
  v_request_id uuid;
  v_vehicle text;
  v_campaign_name text;
  v_version_name text;
  v_transmission text;
  v_installment_count integer;
  v_final_price numeric;
  v_advance_amount numeric;
  v_installment_amount numeric;
  v_model_id uuid;
  v_model_name text;
  v_brand_name text;
  v_model_image text;
  v_bonus text;
  v_benefits text[];
  v_campaign_active boolean;
  v_model_active boolean;
  v_brand_active boolean;
  v_valid_from date;
  v_valid_to date;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select * into v_application
  from public.commercial_applications application
  where application.id = p_application_id
  for update;

  if not found
    or v_application.seller_user_id <> v_user_id
    or v_application.lead_id is null
    or v_application.prequalification_event_id is not null
    or v_application.sales_case_id is not null then
    raise exception 'El datero no corresponde a este vendedor o Lead';
  end if;

  if not exists (
    select 1 from public.leads lead
    where lead.id = v_application.lead_id
      and lead.assigned_seller_user_id = v_user_id
  ) then
    raise exception 'El Lead no está asignado a este vendedor';
  end if;

  select
    campaign.plan_name,
    campaign.version_name,
    campaign.transmission,
    campaign.installment_count,
    campaign.final_price,
    campaign.advance_amount,
    campaign.installment_amount,
    model.id,
    model.name,
    brand.name,
    model.image_path,
    campaign.bonus,
    campaign.benefits,
    campaign.active,
    model.active,
    brand.active,
    campaign.valid_from,
    campaign.valid_to
  into
    v_campaign_name,
    v_version_name,
    v_transmission,
    v_installment_count,
    v_final_price,
    v_advance_amount,
    v_installment_amount,
    v_model_id,
    v_model_name,
    v_brand_name,
    v_model_image,
    v_bonus,
    v_benefits,
    v_campaign_active,
    v_model_active,
    v_brand_active,
    v_valid_from,
    v_valid_to
  from public.campaigns campaign
  join public.models model on model.id = campaign.model_id
  join public.brands brand on brand.id = model.brand_id
  where campaign.id = v_application.campaign_id;

  if not found then
    raise exception 'La campaña seleccionada no existe en el catálogo central';
  end if;
  if not v_campaign_active or not v_model_active or not v_brand_active
    or (v_valid_from is not null and v_valid_from > current_date)
    or (v_valid_to is not null and v_valid_to < current_date) then
    raise exception 'La campaña seleccionada ya no está vigente';
  end if;
  if coalesce(trim(v_version_name), '') = '' or coalesce(trim(v_transmission), '') = ''
    or coalesce(trim(v_campaign_name), '') = '' or coalesce(v_installment_count, 0) < 1
    or coalesce(v_final_price, 0) <= 0 or v_advance_amount is null
    or coalesce(v_installment_amount, 0) <= 0 or coalesce(trim(v_model_image), '') = '' then
    raise exception 'La campaña seleccionada tiene datos obligatorios incompletos';
  end if;
  if v_application.brand_name is distinct from v_brand_name
    or v_application.model_name is distinct from v_model_name
    or v_application.campaign_name is distinct from v_campaign_name
    or v_application.plan_type is distinct from (v_campaign_name || ' · ' || v_installment_count || ' cuotas')
    or v_application.installments_to_pay is distinct from v_installment_count
    or v_application.agreed_price is distinct from v_final_price
    or v_application.commercial_snapshot ->> 'campaignId' is distinct from v_application.campaign_id::text
    or v_application.commercial_snapshot ->> 'modelId' is distinct from v_model_id::text
    or v_application.commercial_snapshot ->> 'version' is distinct from v_version_name
    or v_application.commercial_snapshot ->> 'transmission' is distinct from v_transmission
    or (v_application.commercial_snapshot ->> 'installmentCount')::integer is distinct from v_installment_count
    or (v_application.commercial_snapshot ->> 'finalPrice')::numeric is distinct from v_final_price
    or (v_application.commercial_snapshot ->> 'advanceAmount')::numeric is distinct from v_advance_amount
    or (v_application.commercial_snapshot ->> 'installmentAmount')::numeric is distinct from v_installment_amount
    or v_application.commercial_snapshot ->> 'bonus' is distinct from v_bonus
    or v_application.commercial_snapshot ->> 'image' is distinct from v_model_image
    or v_application.commercial_snapshot -> 'benefits' is distinct from to_jsonb(v_benefits) then
    raise exception 'Las condiciones de la campaña cambiaron. Volvé a seleccionarla antes de enviar el Datero';
  end if;

  if char_length(trim(coalesce(p_notes, ''))) > 3000 then
    raise exception 'Las observaciones no pueden superar los 3000 caracteres';
  end if;

  select request.id into v_request_id
  from public.lead_sale_requests request
  where request.provisional_application_id = p_application_id;

  if v_request_id is not null then
    return v_request_id;
  end if;

  if exists (
    select 1 from public.lead_sale_requests request
    where request.lead_id = v_application.lead_id and request.status = 'pending'
  ) then
    raise exception 'Ya existe una venta pendiente de confirmación para este cliente';
  end if;

  if exists (
    select 1 from public.sales_cases sales_case
    where sales_case.lead_id = v_application.lead_id
  ) then
    raise exception 'La venta ya se encuentra en el circuito administrativo';
  end if;

  v_vehicle := trim(concat_ws(' ', v_brand_name, v_model_name, v_version_name, v_transmission));

  insert into public.lead_sale_requests (
    lead_id,
    seller_user_id,
    vehicle,
    sale_amount,
    notes,
    provisional_application_id
  ) values (
    v_application.lead_id,
    v_user_id,
    v_vehicle,
    v_application.agreed_price,
    left(trim(coalesce(p_notes, '')), 3000),
    v_application.id
  ) returning id into v_request_id;

  update public.lead_crm set
    status = 'cierre',
    priority = 'high',
    sale_confirmation_status = 'pending',
    sale_requested_at = now(),
    sale_requested_by = v_user_id,
    vehicle_sold = v_vehicle,
    sale_amount = v_application.agreed_price,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = v_application.lead_id;

  insert into public.lead_activities (
    lead_id,
    actor_user_id,
    activity_type,
    title,
    detail,
    metadata
  ) values (
    v_application.lead_id,
    v_user_id,
    'sale_request',
    'Datero enviado a supervisión',
    left(trim(coalesce(p_notes, '')), 3000),
    jsonb_build_object(
      'vehicle', v_vehicle,
      'amount', v_application.agreed_price,
      'request_id', v_request_id,
      'provisional_application_id', v_application.id,
      'campaign_id', v_application.campaign_id,
      'origin', 'crm_lead'
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.submit_crm_lead_sale(uuid, text) from public, anon;
grant execute on function public.submit_crm_lead_sale(uuid, text) to authenticated;

notify pgrst, 'reload schema';
