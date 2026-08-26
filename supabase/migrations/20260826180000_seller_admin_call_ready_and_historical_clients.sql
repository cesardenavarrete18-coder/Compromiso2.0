-- Seller quality-of-life improvements, administrative call handoff and
-- provisional historical client intake for August 2026 onward.

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

create table if not exists public.historical_clients (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  normalized_phone text not null check (char_length(normalized_phone) between 6 and 30),
  document_number text not null default '' check (char_length(document_number) <= 20),
  seller_user_id uuid not null references public.profiles(user_id),
  vehicle text not null check (char_length(vehicle) between 2 and 160),
  sale_date date not null check (sale_date >= date '2026-08-01'),
  notes text not null default '' check (char_length(notes) <= 3000),
  source_file text not null default '' check (char_length(source_file) <= 255),
  imported_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_phone, vehicle, sale_date)
);

alter table public.historical_clients enable row level security;
revoke all on table public.historical_clients from anon;
grant select on table public.historical_clients to authenticated;

drop policy if exists historical_clients_read_sales_admin on public.historical_clients;
create policy historical_clients_read_sales_admin
on public.historical_clients for select to authenticated
using (private.current_user_can_administer_sales());

create index if not exists historical_clients_sale_date_idx
  on public.historical_clients (sale_date desc);
create index if not exists historical_clients_seller_idx
  on public.historical_clients (seller_user_id, sale_date desc);

create or replace function public.import_historical_clients(
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_row_number integer := 0;
  v_created integer := 0;
  v_merged integer := 0;
  v_rejected integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_name text;
  v_phone text;
  v_document text;
  v_vehicle text;
  v_notes text;
  v_seller text;
  v_seller_id uuid;
  v_sale_date date;
  v_inserted boolean;
begin
  if v_actor is null or not private.current_user_can_administer_sales() then
    raise exception 'Se requiere permiso de Administración de Ventas';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no contiene clientes';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'El máximo por archivo es de 2000 clientes';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := v_row_number + 1;
    begin
      v_name := regexp_replace(trim(coalesce(v_row->>'name', '')), '\\s+', ' ', 'g');
      v_phone := private.normalize_argentina_mobile_phone(v_row->>'phone');
      v_document := regexp_replace(coalesce(v_row->>'document_number', ''), '[^0-9]', '', 'g');
      v_vehicle := regexp_replace(trim(coalesce(v_row->>'vehicle', '')), '\\s+', ' ', 'g');
      v_notes := left(trim(coalesce(v_row->>'notes', '')), 3000);
      v_seller := lower(regexp_replace(trim(coalesce(v_row->>'seller', '')), '\\s+', ' ', 'g'));
      v_sale_date := nullif(v_row->>'sale_date', '')::date;

      if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Nombre inválido'; end if;
      if char_length(v_phone) < 6 or char_length(v_phone) > 30 then raise exception 'Teléfono inválido'; end if;
      if char_length(v_vehicle) < 2 or char_length(v_vehicle) > 160 then raise exception 'Vehículo inválido'; end if;
      if v_sale_date is null or v_sale_date < date '2026-08-01' or v_sale_date > current_date then
        raise exception 'La fecha debe estar entre 01/08/2026 y hoy';
      end if;

      select profile.user_id into v_seller_id
      from public.profiles profile
      where profile.role::text = 'seller'
        and profile.active
        and (lower(profile.seller_code) = v_seller or lower(profile.full_name) = v_seller)
      limit 1;
      if v_seller_id is null then raise exception 'Vendedor no encontrado'; end if;

      insert into public.historical_clients (
        customer_name, normalized_phone, document_number, seller_user_id,
        vehicle, sale_date, notes, source_file, imported_by
      ) values (
        v_name, v_phone, v_document, v_seller_id, v_vehicle, v_sale_date,
        v_notes, left(coalesce(nullif(trim(p_file_name), ''), 'clientes.xlsx'), 255), v_actor
      )
      on conflict (normalized_phone, vehicle, sale_date) do update
      set customer_name = excluded.customer_name,
          document_number = excluded.document_number,
          seller_user_id = excluded.seller_user_id,
          notes = excluded.notes,
          source_file = excluded.source_file,
          imported_by = excluded.imported_by,
          updated_at = now()
      returning (xmax = 0) into v_inserted;

      if v_inserted then v_created := v_created + 1; else v_merged := v_merged + 1; end if;
    exception when others then
      v_rejected := v_rejected + 1;
      if jsonb_array_length(v_errors) < 25 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_row_number, 'error', left(sqlerrm, 300)
        ));
      end if;
    end;
    v_seller_id := null;
  end loop;

  return jsonb_build_object(
    'rows', v_row_number,
    'created', v_created,
    'merged', v_merged,
    'rejected', v_rejected,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.import_historical_clients(text, jsonb) from public, anon;
grant execute on function public.import_historical_clients(text, jsonb) to authenticated;
