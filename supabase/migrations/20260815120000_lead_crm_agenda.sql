-- Operational CRM for assigned leads: agenda, pipeline, notes, sale approval and ranking.

create table public.lead_crm (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  status text not null default 'nuevo',
  priority text not null default 'normal',
  status_reason text not null default '',
  next_contact_at timestamptz,
  next_contact_note text not null default '',
  last_contact_at timestamptz,
  last_contact_outcome text not null default '',
  interview_at timestamptz,
  interview_location text not null default '',
  deposit_amount numeric(16, 2),
  deposit_at timestamptz,
  cold_base_at timestamptz,
  sale_confirmation_status text not null default 'none',
  sale_requested_at timestamptz,
  sale_requested_by uuid references public.profiles (user_id) on delete set null,
  sale_confirmed_at timestamptz,
  sale_confirmed_by uuid references public.profiles (user_id) on delete set null,
  vehicle_sold text not null default '',
  sale_amount numeric(16, 2),
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_crm_status check (status in ('nuevo', 'no_contesta', 'en_proceso', 'invalido', 'entrevista', 'cierre', 'sena', 'venta', 'desistir')),
  constraint lead_crm_priority check (priority in ('low', 'normal', 'high')),
  constraint lead_crm_sale_confirmation check (sale_confirmation_status in ('none', 'pending', 'confirmed', 'rejected')),
  constraint lead_crm_deposit_nonnegative check (deposit_amount is null or deposit_amount >= 0),
  constraint lead_crm_sale_nonnegative check (sale_amount is null or sale_amount >= 0),
  constraint lead_crm_text_lengths check (
    char_length(status_reason) <= 2000
    and char_length(next_contact_note) <= 1000
    and char_length(last_contact_outcome) <= 500
    and char_length(interview_location) <= 300
    and char_length(vehicle_sold) <= 160
  ),
  constraint lead_crm_confirmed_sale_status check (status <> 'venta' or sale_confirmation_status = 'confirmed')
);

create index lead_crm_agenda_idx on public.lead_crm (next_contact_at) where next_contact_at is not null and status not in ('venta', 'desistir', 'invalido');
create index lead_crm_status_updated_idx on public.lead_crm (status, updated_at desc);
create index lead_crm_sale_pending_idx on public.lead_crm (sale_confirmation_status, sale_requested_at desc) where sale_confirmation_status = 'pending';

create table public.lead_activities (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  actor_user_id uuid references public.profiles (user_id) on delete set null,
  activity_type text not null,
  title text not null,
  detail text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_activities_type check (activity_type in ('status_change', 'comment', 'contact', 'follow_up', 'interview', 'sale_request', 'sale_confirmation', 'assignment', 'manual_creation')),
  constraint lead_activities_title_length check (char_length(title) between 2 and 160),
  constraint lead_activities_detail_length check (char_length(detail) <= 5000)
);

create index lead_activities_lead_time_idx on public.lead_activities (lead_id, created_at desc);
create index lead_activities_actor_time_idx on public.lead_activities (actor_user_id, created_at desc);

create table public.lead_sale_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  seller_user_id uuid not null references public.profiles (user_id) on delete restrict,
  vehicle text not null,
  sale_amount numeric(16, 2),
  notes text not null default '',
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (user_id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  constraint lead_sale_requests_vehicle_length check (char_length(vehicle) between 2 and 160),
  constraint lead_sale_requests_amount_nonnegative check (sale_amount is null or sale_amount >= 0),
  constraint lead_sale_requests_status check (status in ('pending', 'confirmed', 'rejected')),
  constraint lead_sale_requests_notes_length check (char_length(notes) <= 3000 and char_length(review_note) <= 3000)
);

create unique index lead_sale_requests_one_pending_idx on public.lead_sale_requests (lead_id) where status = 'pending';
create index lead_sale_requests_seller_time_idx on public.lead_sale_requests (seller_user_id, requested_at desc);
create index lead_sale_requests_status_time_idx on public.lead_sale_requests (status, requested_at desc);

create function private.initialize_lead_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_crm (lead_id, priority)
  values (new.id, new.priority)
  on conflict (lead_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_lead_crm() from public, anon, authenticated;

create trigger leads_initialize_crm
  after insert on public.leads
  for each row execute function private.initialize_lead_crm();

insert into public.lead_crm (lead_id, priority)
select id, priority from public.leads
on conflict (lead_id) do nothing;

create function public.record_lead_follow_up(
  p_lead_id uuid,
  p_status text,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default '',
  p_contact_outcome text default '',
  p_interview_at timestamptz default null,
  p_interview_location text default '',
  p_deposit_amount numeric default null,
  p_priority text default 'normal'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_management boolean;
  v_previous_status text;
  v_activity_type text := 'status_change';
  v_title text;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  v_is_management := private.current_user_is_management();
  if not v_is_management and not exists (
    select 1 from public.leads
    where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then
    raise exception 'El lead no está asignado a este vendedor';
  end if;

  if p_status not in ('nuevo', 'no_contesta', 'en_proceso', 'invalido', 'entrevista', 'cierre', 'sena', 'desistir') then
    raise exception 'Estado comercial inválido';
  end if;
  if p_priority not in ('low', 'normal', 'high') then
    raise exception 'Prioridad inválida';
  end if;
  if p_status = 'no_contesta' and p_next_contact_at is null then
    raise exception 'Programá el próximo intento de contacto';
  end if;
  if p_status = 'entrevista' and p_interview_at is null then
    raise exception 'Indicá la fecha y hora de la entrevista';
  end if;
  if p_status = 'sena' and (p_deposit_amount is null or p_deposit_amount <= 0) then
    raise exception 'Indicá el importe de la seña';
  end if;
  if p_status in ('invalido', 'desistir') and char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Indicá el motivo para este estado';
  end if;

  select status into v_previous_status from public.lead_crm where lead_id = p_lead_id for update;
  if v_previous_status is null then
    raise exception 'No se encontró la ficha CRM del lead';
  end if;

  if p_status = 'entrevista' then v_activity_type := 'interview'; end if;
  if p_status = 'no_contesta' or p_next_contact_at is not null then v_activity_type := 'follow_up'; end if;
  if p_status in ('en_proceso', 'invalido') then v_activity_type := 'contact'; end if;
  v_title := case p_status
    when 'nuevo' then 'Lead marcado como nuevo'
    when 'no_contesta' then 'El cliente no respondió'
    when 'en_proceso' then 'Contacto en proceso'
    when 'invalido' then 'Contacto inválido o erróneo'
    when 'entrevista' then 'Entrevista programada'
    when 'cierre' then 'Oportunidad en cierre'
    when 'sena' then 'Seña registrada'
    when 'desistir' then 'Lead enviado a base fría'
  end;

  update public.lead_crm set
    status = p_status,
    priority = case when p_status = 'cierre' then 'high' else p_priority end,
    status_reason = case when p_status in ('invalido', 'desistir') then trim(coalesce(p_note, '')) else status_reason end,
    next_contact_at = case when p_status in ('venta', 'desistir', 'invalido') then null else p_next_contact_at end,
    next_contact_note = case when p_status in ('venta', 'desistir', 'invalido') then '' else trim(coalesce(p_next_contact_note, '')) end,
    last_contact_at = case when p_status <> 'nuevo' then now() else last_contact_at end,
    last_contact_outcome = trim(coalesce(p_contact_outcome, '')),
    interview_at = coalesce(p_interview_at, interview_at),
    interview_location = case when p_interview_at is not null then trim(coalesce(p_interview_location, '')) else interview_location end,
    deposit_amount = coalesce(p_deposit_amount, deposit_amount),
    deposit_at = case when p_status = 'sena' then now() else deposit_at end,
    cold_base_at = case when p_status = 'desistir' then now() else null end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    p_lead_id,
    v_user_id,
    v_activity_type,
    v_title,
    trim(coalesce(p_note, '')),
    jsonb_build_object(
      'previous_status', v_previous_status,
      'status', p_status,
      'next_contact_at', p_next_contact_at,
      'interview_at', p_interview_at,
      'interview_location', trim(coalesce(p_interview_location, '')),
      'deposit_amount', p_deposit_amount
    )
  );
end;
$$;

create function public.add_lead_comment(p_lead_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;
  if char_length(trim(coalesce(p_comment, ''))) < 2 or char_length(trim(p_comment)) > 5000 then
    raise exception 'El comentario debe tener entre 2 y 5000 caracteres';
  end if;
  if not private.current_user_is_management() and not exists (
    select 1 from public.leads where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then
    raise exception 'El lead no está asignado a este vendedor';
  end if;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail)
  values (p_lead_id, v_user_id, 'comment', 'Comentario agregado', trim(p_comment));

  update public.lead_crm set updated_by = v_user_id, updated_at = now() where lead_id = p_lead_id;
end;
$$;

create function public.request_lead_sale(
  p_lead_id uuid,
  p_vehicle text,
  p_amount numeric default null,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request_id uuid;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;
  if not private.current_user_is_management() and not exists (
    select 1 from public.leads where id = p_lead_id and assigned_seller_user_id = v_user_id
  ) then
    raise exception 'El lead no está asignado a este vendedor';
  end if;
  if char_length(trim(coalesce(p_vehicle, ''))) < 2 or char_length(trim(p_vehicle)) > 160 then
    raise exception 'Indicá el vehículo vendido';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'El importe no puede ser negativo';
  end if;
  if exists (select 1 from public.lead_sale_requests where lead_id = p_lead_id and status = 'pending') then
    raise exception 'Ya existe una venta pendiente de confirmación';
  end if;

  insert into public.lead_sale_requests (lead_id, seller_user_id, vehicle, sale_amount, notes)
  values (p_lead_id, v_user_id, trim(p_vehicle), p_amount, trim(coalesce(p_notes, '')))
  returning id into v_request_id;

  update public.lead_crm set
    status = 'cierre',
    priority = 'high',
    sale_confirmation_status = 'pending',
    sale_requested_at = now(),
    sale_requested_by = v_user_id,
    vehicle_sold = trim(p_vehicle),
    sale_amount = p_amount,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = p_lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (p_lead_id, v_user_id, 'sale_request', 'Venta enviada a confirmación', trim(coalesce(p_notes, '')), jsonb_build_object('vehicle', trim(p_vehicle), 'amount', p_amount, 'request_id', v_request_id));

  return v_request_id;
end;
$$;

create function public.review_lead_sale(p_request_id uuid, p_approved boolean, p_review_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.lead_sale_requests%rowtype;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;

  select * into v_request from public.lead_sale_requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'No se encontró la solicitud'; end if;
  if v_request.status <> 'pending' then raise exception 'La solicitud ya fue revisada'; end if;

  update public.lead_sale_requests set
    status = case when p_approved then 'confirmed' else 'rejected' end,
    reviewed_by = v_user_id,
    reviewed_at = now(),
    review_note = trim(coalesce(p_review_note, ''))
  where id = p_request_id;

  update public.lead_crm set
    status = case when p_approved then 'venta' else 'cierre' end,
    priority = 'high',
    sale_confirmation_status = case when p_approved then 'confirmed' else 'rejected' end,
    sale_confirmed_at = case when p_approved then now() else null end,
    sale_confirmed_by = case when p_approved then v_user_id else null end,
    vehicle_sold = v_request.vehicle,
    sale_amount = v_request.sale_amount,
    next_contact_at = case when p_approved then null else next_contact_at end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = v_request.lead_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    v_request.lead_id,
    v_user_id,
    'sale_confirmation',
    case when p_approved then 'Venta confirmada' else 'Venta observada por supervisión' end,
    trim(coalesce(p_review_note, '')),
    jsonb_build_object('approved', p_approved, 'vehicle', v_request.vehicle, 'amount', v_request.sale_amount, 'request_id', p_request_id)
  );
end;
$$;

create function public.create_manual_lead(
  p_customer_name text,
  p_customer_phone text,
  p_source_detail text default '',
  p_model_interest text default '',
  p_intent_summary text default '',
  p_priority text default 'normal',
  p_seller_user_id uuid default null,
  p_next_contact_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_lead_id uuid;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if char_length(trim(coalesce(p_customer_name, ''))) < 2 or char_length(trim(p_customer_name)) > 120 then
    raise exception 'Indicá el nombre del cliente';
  end if;
  if trim(coalesce(p_customer_phone, '')) !~ '^[0-9+() -]{6,30}$' then
    raise exception 'El teléfono no tiene un formato válido';
  end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'Prioridad inválida'; end if;
  if p_seller_user_id is not null and not exists (
    select 1 from public.profiles where user_id = p_seller_user_id and role::text = 'seller' and active = true
  ) then
    raise exception 'El vendedor seleccionado no está activo';
  end if;

  insert into public.leads (
    customer_phone, customer_name, source_channel, source_detail, qualification_status,
    priority, intent_summary, model_interest, routing_status, routing_reason,
    assigned_seller_user_id, assigned_by_user_id, assigned_at
  ) values (
    trim(p_customer_phone), trim(p_customer_name), 'manual', nullif(trim(coalesce(p_source_detail, '')), ''), 'qualified',
    p_priority, trim(coalesce(p_intent_summary, '')), nullif(trim(coalesce(p_model_interest, '')), ''),
    case when p_seller_user_id is null then 'pending_supervisor' else 'assigned_manual' end,
    case when p_seller_user_id is null then 'manual_general_inbox' else 'manual_supervisor_assignment' end,
    p_seller_user_id, case when p_seller_user_id is null then null else v_user_id end,
    case when p_seller_user_id is null then null else now() end
  ) returning id into v_lead_id;

  update public.lead_crm set
    priority = p_priority,
    next_contact_at = p_next_contact_at,
    next_contact_note = case when p_next_contact_at is null then '' else 'Primer contacto programado por supervisión' end,
    updated_by = v_user_id,
    updated_at = now()
  where lead_id = v_lead_id;

  if p_seller_user_id is not null then
    insert into public.lead_assignments (lead_id, seller_user_id, assigned_by_user_id, assignment_type, reason)
    values (v_lead_id, p_seller_user_id, v_user_id, 'manual', 'Lead cargado y asignado manualmente');
  end if;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (v_lead_id, v_user_id, 'manual_creation', 'Lead cargado manualmente', trim(coalesce(p_intent_summary, '')), jsonb_build_object('source_detail', trim(coalesce(p_source_detail, '')), 'assigned_seller_user_id', p_seller_user_id));

  return v_lead_id;
end;
$$;

create function public.assign_lead_to_seller(p_lead_id uuid, p_seller_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_previous_seller uuid;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if not exists (
    select 1 from public.profiles where user_id = p_seller_user_id and role::text = 'seller' and active = true
  ) then
    raise exception 'El vendedor seleccionado no está activo';
  end if;

  select assigned_seller_user_id into v_previous_seller from public.leads where id = p_lead_id for update;
  if not found then raise exception 'No se encontró el lead'; end if;

  update public.leads set
    assigned_seller_user_id = p_seller_user_id,
    assigned_by_user_id = v_user_id,
    assigned_at = now(),
    routing_status = 'assigned_manual',
    routing_reason = case when v_previous_seller is null then 'supervisor_assignment' else 'supervisor_reassignment' end
  where id = p_lead_id;

  insert into public.lead_assignments (lead_id, seller_user_id, assigned_by_user_id, assignment_type, reason)
  values (
    p_lead_id,
    p_seller_user_id,
    v_user_id,
    case when v_previous_seller is null then 'manual' else 'reassigned' end,
    case when v_previous_seller is null then 'Asignado por supervisor' else 'Reasignado por supervisor' end
  );

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    p_lead_id,
    v_user_id,
    'assignment',
    case when v_previous_seller is null then 'Lead asignado a un vendedor' else 'Lead reasignado' end,
    '',
    jsonb_build_object('previous_seller_user_id', v_previous_seller, 'seller_user_id', p_seller_user_id)
  );
end;
$$;

create function public.get_sales_ranking(p_month date default date_trunc('month', current_date)::date)
returns table (
  seller_user_id uuid,
  seller_name text,
  seller_code text,
  confirmed_sales bigint,
  assigned_leads bigint,
  conversion_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with month_limits as (
    select date_trunc('month', p_month)::date as starts_at,
           (date_trunc('month', p_month) + interval '1 month')::date as ends_at
  ),
  assigned as (
    select l.assigned_seller_user_id as seller_id, count(*)::bigint as total
    from public.leads l, month_limits m
    where l.assigned_seller_user_id is not null
      and (l.assigned_at at time zone 'America/Argentina/Buenos_Aires')::date >= m.starts_at
      and (l.assigned_at at time zone 'America/Argentina/Buenos_Aires')::date < m.ends_at
    group by l.assigned_seller_user_id
  ),
  sold as (
    select c.sale_confirmed_by as confirmer, l.assigned_seller_user_id as seller_id, count(*)::bigint as total
    from public.lead_crm c
    join public.leads l on l.id = c.lead_id
    cross join month_limits m
    where c.sale_confirmation_status = 'confirmed'
      and c.sale_confirmed_at is not null
      and (c.sale_confirmed_at at time zone 'America/Argentina/Buenos_Aires')::date >= m.starts_at
      and (c.sale_confirmed_at at time zone 'America/Argentina/Buenos_Aires')::date < m.ends_at
    group by c.sale_confirmed_by, l.assigned_seller_user_id
  ),
  sold_by_seller as (
    select seller_id, sum(total)::bigint as total from sold group by seller_id
  )
  select p.user_id,
         p.full_name,
         p.seller_code,
         coalesce(s.total, 0)::bigint as confirmed_sales,
         coalesce(a.total, 0)::bigint as assigned_leads,
         case when coalesce(a.total, 0) = 0 then 0::numeric
              else round((coalesce(s.total, 0)::numeric * 100) / a.total, 1)
         end as conversion_rate
  from public.profiles p
  left join assigned a on a.seller_id = p.user_id
  left join sold_by_seller s on s.seller_id = p.user_id
  where private.current_user_active()
    and p.role::text = 'seller'
    and p.active = true
  order by coalesce(s.total, 0) desc, conversion_rate desc, p.full_name;
$$;

alter table public.lead_crm enable row level security;
alter table public.lead_activities enable row level security;
alter table public.lead_sale_requests enable row level security;

create policy lead_crm_read_management_or_owner
on public.lead_crm for select
to authenticated
using (
  private.current_user_active()
  and exists (
    select 1 from public.leads l
    where l.id = lead_id
      and (l.assigned_seller_user_id = (select auth.uid()) or private.current_user_is_management())
  )
);

create policy lead_activities_read_management_or_owner
on public.lead_activities for select
to authenticated
using (
  private.current_user_active()
  and exists (
    select 1 from public.leads l
    where l.id = lead_id
      and (l.assigned_seller_user_id = (select auth.uid()) or private.current_user_is_management())
  )
);

create policy lead_sale_requests_read_management_or_owner
on public.lead_sale_requests for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_management())
);

grant select on public.lead_crm, public.lead_activities, public.lead_sale_requests to authenticated;
grant all on public.lead_crm, public.lead_activities, public.lead_sale_requests to service_role;
grant usage, select on sequence public.lead_activities_id_seq to service_role;

revoke all on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) from public, anon;
revoke all on function public.add_lead_comment(uuid, text) from public, anon;
revoke all on function public.request_lead_sale(uuid, text, numeric, text) from public, anon;
revoke all on function public.review_lead_sale(uuid, boolean, text) from public, anon;
revoke all on function public.create_manual_lead(text, text, text, text, text, text, uuid, timestamptz) from public, anon;
revoke all on function public.assign_lead_to_seller(uuid, uuid) from public, anon;
revoke all on function public.get_sales_ranking(date) from public, anon;

grant execute on function public.record_lead_follow_up(uuid, text, text, timestamptz, text, text, timestamptz, text, numeric, text) to authenticated;
grant execute on function public.add_lead_comment(uuid, text) to authenticated;
grant execute on function public.request_lead_sale(uuid, text, numeric, text) to authenticated;
grant execute on function public.review_lead_sale(uuid, boolean, text) to authenticated;
grant execute on function public.create_manual_lead(text, text, text, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.assign_lead_to_seller(uuid, uuid) to authenticated;
grant execute on function public.get_sales_ranking(date) to authenticated;

revoke all on public.lead_crm, public.lead_activities, public.lead_sale_requests from anon;
