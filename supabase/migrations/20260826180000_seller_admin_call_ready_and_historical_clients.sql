-- Seller quality-of-life improvements and administrative call handoff.

create or replace function public.update_assigned_lead_name(
  p_lead_id uuid,
  p_customer_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_lead public.leads%rowtype;
  v_name text := regexp_replace(trim(coalesce(p_customer_name, '')), '\\s+', ' ', 'g');
begin
  if v_actor is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'El nombre debe tener entre 2 y 120 caracteres';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'No se encontró el Lead'; end if;
  if v_lead.assigned_seller_user_id <> v_actor and not private.current_user_is_management() then
    raise exception 'El Lead no está asignado a este vendedor';
  end if;

  if coalesce(v_lead.customer_name, '') = v_name then return v_name; end if;

  update public.leads
  set customer_name = v_name, updated_at = now()
  where id = p_lead_id;

  update public.customers
  set full_name = v_name, updated_at = now()
  where id = v_lead.customer_id;

  update public.lead_recall_items
  set customer_name = v_name, updated_at = now()
  where lead_id = p_lead_id;

  insert into public.lead_activities (
    lead_id, actor_user_id, activity_type, title, detail, metadata
  ) values (
    p_lead_id,
    v_actor,
    'manual_creation',
    'Nombre del Lead actualizado',
    'El vendedor corrigió el nombre del cliente.',
    jsonb_build_object('previous_name', v_lead.customer_name, 'new_name', v_name)
  );

  return v_name;
end;
$$;

revoke all on function public.update_assigned_lead_name(uuid, text) from public, anon;
grant execute on function public.update_assigned_lead_name(uuid, text) to authenticated;

alter table public.sales_cases
  add column if not exists admin_call_requested_at timestamptz,
  add column if not exists admin_call_requested_by uuid references public.profiles(user_id);

create index if not exists sales_cases_admin_call_requested_idx
  on public.sales_cases (admin_call_requested_at desc)
  where admin_call_requested_at is not null;

alter table public.sales_case_events drop constraint if exists sales_case_events_type;
alter table public.sales_case_events add constraint sales_case_events_type check (event_type in (
  'case_created', 'minute_submitted', 'minute_corrected', 'stage_review',
  'sale_finalized', 'sale_cancelled', 'client_grouped', 'installment_update',
  'document_added', 'admin_call_requested'
));

alter table public.sales_notifications drop constraint if exists sales_notifications_type;
alter table public.sales_notifications add constraint sales_notifications_type check (notification_type in (
  'sale_confirmed', 'observed', 'cancelled', 'finalized', 'status_update',
  'admin_call_requested'
));

create or replace function public.request_admin_sales_call(p_sales_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.sales_cases%rowtype;
  v_customer_name text;
begin
  if v_actor is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  select * into v_case from public.sales_cases where id = p_sales_case_id for update;
  if not found then raise exception 'No se encontró la operación'; end if;
  if v_case.seller_user_id <> v_actor then
    raise exception 'La venta no corresponde a este vendedor';
  end if;
  if v_case.status = 'cancelled' then raise exception 'La operación está dada de baja'; end if;
  if not exists (
    select 1 from public.commercial_applications
    where sales_case_id = p_sales_case_id and status = 'submitted'
  ) then
    raise exception 'Primero debés rendir la minuta';
  end if;
  if v_case.admin_call_requested_at is not null then return; end if;

  select coalesce(nullif(trim(lead.customer_name), ''), 'Cliente')
  into v_customer_name
  from public.leads lead
  where lead.id = v_case.lead_id;

  update public.sales_cases
  set admin_call_requested_at = now(),
      admin_call_requested_by = v_actor,
      updated_at = now()
  where id = p_sales_case_id;

  insert into public.sales_case_events (
    sales_case_id, actor_user_id, event_type, stage, outcome, comment
  ) values (
    p_sales_case_id, v_actor, 'admin_call_requested', 'administrative_call',
    'pending', 'El vendedor indicó que la venta está lista para llamar.'
  );

  insert into public.sales_notifications (
    recipient_user_id, sales_case_id, notification_type, title, body
  )
  select profile.user_id,
         p_sales_case_id,
         'admin_call_requested',
         'Venta lista para llamar',
         v_customer_name || ' · ' || v_case.vehicle || ' · ' || v_case.case_code
  from public.profiles profile
  where profile.role::text in ('admventas', 'admin') and profile.active;
end;
$$;

revoke all on function public.request_admin_sales_call(uuid) from public, anon;
grant execute on function public.request_admin_sales_call(uuid) to authenticated;
