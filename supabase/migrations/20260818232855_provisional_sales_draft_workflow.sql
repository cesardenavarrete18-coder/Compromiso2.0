alter table public.lead_sale_requests
  add column provisional_application_id uuid
  references public.commercial_applications (id) on delete set null;

create unique index lead_sale_requests_provisional_application_idx
  on public.lead_sale_requests (provisional_application_id)
  where provisional_application_id is not null;

create function public.submit_prequalification_sale(
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
  v_phone text;
  v_lead_id uuid;
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
    or v_application.prequalification_event_id is null
    or v_application.sales_case_id is not null then
    raise exception 'El datero no corresponde a este vendedor';
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

  v_phone := regexp_replace(v_application.primary_phone, '[^0-9]', '', 'g');
  if char_length(v_phone) < 6 then
    raise exception 'El teléfono del cliente no es válido';
  end if;

  select lead.id into v_lead_id
  from public.leads lead
  join public.customers customer on customer.id = lead.customer_id
  left join public.sales_cases sales_case on sales_case.lead_id = lead.id
  where customer.normalized_phone = v_phone
    and lead.assigned_seller_user_id = v_user_id
    and sales_case.id is null
  order by lead.created_at desc
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
      model_interest,
      routing_status,
      routing_reason,
      assigned_seller_user_id,
      assigned_by_user_id,
      assigned_at,
      last_message_at
    ) values (
      v_application.primary_phone,
      trim(v_application.first_name || ' ' || v_application.last_name),
      'manual',
      'Precalificación crediticia ' || v_application.request_code,
      'qualified',
      'high',
      'Operación precalificada y enviada a supervisión desde el Apto.',
      trim(v_application.brand_name || ' ' || v_application.model_name),
      'assigned_manual',
      'prequalification_sale_draft',
      v_user_id,
      v_user_id,
      now(),
      now()
    ) returning id into v_lead_id;

    insert into public.lead_assignments (
      lead_id,
      seller_user_id,
      assigned_by_user_id,
      assignment_type,
      reason
    ) values (
      v_lead_id,
      v_user_id,
      v_user_id,
      'manual',
      'Operación originada en una precalificación aprobada'
    );

    insert into public.lead_activities (
      lead_id,
      actor_user_id,
      activity_type,
      title,
      detail,
      metadata
    ) values (
      v_lead_id,
      v_user_id,
      'manual_creation',
      'Lead creado desde el Apto',
      'El cliente completó el datero provisorio de la operación.',
      jsonb_build_object(
        'prequalification_event_id', v_application.prequalification_event_id,
        'provisional_application_id', v_application.id,
        'request_code', v_application.request_code
      )
    );
  end if;

  if exists (
    select 1
    from public.lead_sale_requests request
    where request.lead_id = v_lead_id and request.status = 'pending'
  ) then
    raise exception 'Ya existe una venta pendiente de confirmación para este cliente';
  end if;

  if exists (
    select 1 from public.sales_cases sales_case where sales_case.lead_id = v_lead_id
  ) then
    raise exception 'La venta ya se encuentra en el circuito administrativo';
  end if;

  v_vehicle := trim(v_application.brand_name || ' ' || v_application.model_name);

  insert into public.lead_sale_requests (
    lead_id,
    seller_user_id,
    vehicle,
    sale_amount,
    notes,
    provisional_application_id
  ) values (
    v_lead_id,
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
  where lead_id = v_lead_id;

  insert into public.lead_activities (
    lead_id,
    actor_user_id,
    activity_type,
    title,
    detail,
    metadata
  ) values (
    v_lead_id,
    v_user_id,
    'sale_request',
    'Datero enviado a supervisión',
    left(trim(coalesce(p_notes, '')), 3000),
    jsonb_build_object(
      'vehicle', v_vehicle,
      'amount', v_application.agreed_price,
      'request_id', v_request_id,
      'provisional_application_id', v_application.id
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.submit_prequalification_sale(uuid, text) from public, anon;
grant execute on function public.submit_prequalification_sale(uuid, text) to authenticated;

drop policy if exists lead_sale_requests_read_sales_scope on public.lead_sale_requests;
create policy lead_sale_requests_read_sales_scope
on public.lead_sale_requests for select to authenticated
using (
  private.current_user_is_management()
  or private.current_user_is_sales_admin()
  or (
    seller_user_id = (select auth.uid())
    and (
      status <> 'confirmed'
      or exists (
        select 1
        from public.sales_cases sales_case
        where sales_case.sale_request_id = lead_sale_requests.id
          and sales_case.status <> 'cancelled'
      )
    )
  )
);
