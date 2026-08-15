-- Supervisor lead inbox and WhatsApp routing.
-- The enum value is only consumed by application writes after this migration commits.
alter type public.app_role add value if not exists 'supervisor';

create function private.current_user_is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role::text = 'supervisor'
      and active = true
  );
$$;

create function private.current_user_is_management()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role::text in ('admin', 'supervisor')
      and active = true
  );
$$;

revoke all on function private.current_user_is_supervisor() from public;
revoke all on function private.current_user_is_management() from public;
grant execute on function private.current_user_is_supervisor() to authenticated;
grant execute on function private.current_user_is_management() to authenticated;

create table public.seller_routing_settings (
  seller_user_id uuid primary key references public.profiles (user_id) on delete cascade,
  daily_quota integer not null default 20,
  paused boolean not null default false,
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_routing_settings_quota check (daily_quota between 0 and 500)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_phone text not null,
  customer_name text,
  source_channel text not null default 'whatsapp',
  source_detail text,
  seller_code_received text,
  qualification_status text not null default 'follow_up',
  priority text not null default 'normal',
  intent_summary text not null default '',
  model_interest text,
  disqualify_reason text,
  routing_status text not null default 'pending_supervisor',
  routing_reason text not null default 'general_inbox',
  assigned_seller_user_id uuid references public.profiles (user_id) on delete set null,
  assigned_by_user_id uuid references public.profiles (user_id) on delete set null,
  assigned_at timestamptz,
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_customer_phone_length check (char_length(customer_phone) between 6 and 30),
  constraint leads_customer_name_length check (customer_name is null or char_length(customer_name) between 1 and 120),
  constraint leads_source_channel check (source_channel in ('whatsapp', 'tiktok', 'web', 'manual')),
  constraint leads_qualification_status check (qualification_status in ('qualified', 'follow_up', 'unqualified')),
  constraint leads_priority check (priority in ('low', 'normal', 'high')),
  constraint leads_routing_status check (routing_status in ('pending_supervisor', 'assigned_direct', 'assigned_manual', 'closed', 'lost')),
  constraint leads_assignment_complete check (
    (assigned_seller_user_id is null and assigned_at is null)
    or (assigned_seller_user_id is not null and assigned_at is not null)
  )
);

create index leads_pending_time_idx on public.leads (routing_status, created_at desc);
create index leads_seller_time_idx on public.leads (assigned_seller_user_id, assigned_at desc);
create index leads_phone_time_idx on public.leads (customer_phone, last_message_at desc);
create index leads_source_time_idx on public.leads (source_channel, created_at desc);

create table public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  whatsapp_message_id text unique,
  direction text not null default 'inbound',
  message_type text not null default 'text',
  body text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_messages_direction check (direction in ('inbound', 'outbound', 'system')),
  constraint lead_messages_body_length check (char_length(body) <= 10000)
);

create index lead_messages_lead_time_idx on public.lead_messages (lead_id, created_at);

create table public.lead_assignments (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  seller_user_id uuid references public.profiles (user_id) on delete set null,
  assigned_by_user_id uuid references public.profiles (user_id) on delete set null,
  assignment_type text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint lead_assignments_type check (assignment_type in ('direct_code', 'manual', 'reassigned', 'unassigned'))
);

create index lead_assignments_lead_time_idx on public.lead_assignments (lead_id, created_at desc);
create index lead_assignments_seller_time_idx on public.lead_assignments (seller_user_id, created_at desc);

create table public.supervisor_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (user_id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint supervisor_notifications_type check (notification_type in ('new_pending_lead', 'direct_assignment', 'quota_alert', 'routing_alert'))
);

create index supervisor_notifications_recipient_time_idx on public.supervisor_notifications (recipient_user_id, read_at, created_at desc);

create trigger seller_routing_settings_set_updated_at
  before update on public.seller_routing_settings
  for each row execute function private.set_updated_at();

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function private.set_updated_at();

alter table public.seller_routing_settings enable row level security;
alter table public.leads enable row level security;
alter table public.lead_messages enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.supervisor_notifications enable row level security;

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_management
on public.profiles for select
to authenticated
using (
  private.current_user_active()
  and (user_id = (select auth.uid()) or private.current_user_is_management())
);

drop policy if exists prequalifications_read_own_or_admin on public.prequalification_events;
create policy prequalifications_read_own_or_management
on public.prequalification_events for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_management())
);

drop policy if exists commercial_applications_read_own_or_admin on public.commercial_applications;
create policy commercial_applications_read_own_or_management
on public.commercial_applications for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_management())
);

create policy seller_routing_settings_read
on public.seller_routing_settings for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_management())
);

create policy seller_routing_settings_management_insert
on public.seller_routing_settings for insert
to authenticated
with check (private.current_user_is_management());

create policy seller_routing_settings_management_update
on public.seller_routing_settings for update
to authenticated
using (private.current_user_is_management())
with check (private.current_user_is_management());

create policy leads_read_management_or_owner
on public.leads for select
to authenticated
using (
  private.current_user_active()
  and (assigned_seller_user_id = (select auth.uid()) or private.current_user_is_management())
);

create policy leads_management_insert
on public.leads for insert
to authenticated
with check (private.current_user_is_management());

create policy leads_management_update
on public.leads for update
to authenticated
using (private.current_user_is_management())
with check (private.current_user_is_management());

create policy lead_messages_read_management_or_owner
on public.lead_messages for select
to authenticated
using (
  private.current_user_active()
  and exists (
    select 1 from public.leads lead
    where lead.id = lead_id
      and (lead.assigned_seller_user_id = (select auth.uid()) or private.current_user_is_management())
  )
);

create policy lead_assignments_read_management_or_owner
on public.lead_assignments for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_management())
);

create policy lead_assignments_management_insert
on public.lead_assignments for insert
to authenticated
with check (private.current_user_is_management());

create policy supervisor_notifications_read_own
on public.supervisor_notifications for select
to authenticated
using (recipient_user_id = (select auth.uid()) and private.current_user_active());

create policy supervisor_notifications_update_own
on public.supervisor_notifications for update
to authenticated
using (recipient_user_id = (select auth.uid()) and private.current_user_active())
with check (recipient_user_id = (select auth.uid()) and private.current_user_active());

grant select, insert, update on public.seller_routing_settings to authenticated;
grant select, insert, update on public.leads to authenticated;
grant select on public.lead_messages to authenticated;
grant select, insert on public.lead_assignments to authenticated;
grant select, update on public.supervisor_notifications to authenticated;

grant all on public.seller_routing_settings, public.leads, public.lead_messages, public.lead_assignments, public.supervisor_notifications to service_role;
grant usage, select on sequence public.lead_assignments_id_seq to service_role, authenticated;
