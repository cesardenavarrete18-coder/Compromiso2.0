-- Allow the existing provisional commercial application to originate from an
-- assigned CRM Lead without creating a fictitious prequalification.

alter table public.commercial_applications
  add column lead_id uuid references public.leads (id) on delete restrict;

alter table public.commercial_applications
  drop constraint if exists commercial_applications_source,
  add constraint commercial_applications_source check (
    num_nonnulls(prequalification_event_id, sales_case_id, lead_id) = 1
  ),
  add constraint commercial_applications_lead_unique unique (lead_id);

create index commercial_applications_lead_time_idx
  on public.commercial_applications (lead_id, created_at desc)
  where lead_id is not null;

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

create function public.submit_crm_lead_sale(
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

  v_vehicle := trim(concat_ws(' ',
    nullif(v_application.brand_name, 'A definir'),
    nullif(v_application.model_name, 'Vehículo a definir')
  ));
  if char_length(v_vehicle) < 2 then
    v_vehicle := 'Vehículo a definir';
  end if;

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
      'origin', 'crm_lead'
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.submit_crm_lead_sale(uuid, text) from public, anon;
grant execute on function public.submit_crm_lead_sale(uuid, text) to authenticated;
