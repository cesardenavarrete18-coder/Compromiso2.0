-- Human handoff for WhatsApp conversations.
-- Direct writes stay closed; authenticated CRM users operate through audited RPCs.

create table public.whatsapp_conversation_controls (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  mode text not null default 'ai',
  taken_by_user_id uuid references public.profiles (user_id) on delete set null,
  taken_at timestamptz,
  released_by_user_id uuid references public.profiles (user_id) on delete set null,
  released_at timestamptz,
  last_human_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversation_controls_mode check (mode in ('ai', 'human')),
  constraint whatsapp_conversation_controls_human_owner check (
    mode = 'ai' or (taken_by_user_id is not null and taken_at is not null)
  )
);

create table public.whatsapp_conversation_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  actor_user_id uuid references public.profiles (user_id) on delete set null,
  event_type text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint whatsapp_conversation_events_type check (event_type in ('taken', 'released', 'message_sent'))
);

create index whatsapp_conversation_controls_mode_updated_idx
  on public.whatsapp_conversation_controls (mode, updated_at desc);
create index whatsapp_conversation_events_lead_created_idx
  on public.whatsapp_conversation_events (lead_id, created_at desc);

create trigger whatsapp_conversation_controls_set_updated_at
  before update on public.whatsapp_conversation_controls
  for each row execute function private.set_updated_at();

create or replace function private.current_user_can_manage_whatsapp(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.leads l on l.id = p_lead_id
    where p.user_id = (select auth.uid())
      and p.active = true
      and (
        p.role::text in ('admin', 'supervisor')
        or (p.role::text = 'seller' and l.assigned_seller_user_id = p.user_id)
      )
  );
$$;

revoke all on function private.current_user_can_manage_whatsapp(uuid) from public, anon;
grant execute on function private.current_user_can_manage_whatsapp(uuid) to authenticated;

create or replace function public.set_whatsapp_conversation_mode(
  p_lead_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_control public.whatsapp_conversation_controls%rowtype;
begin
  if v_user_id is null or not private.current_user_can_manage_whatsapp(p_lead_id) then
    raise exception 'No tenés permiso para intervenir esta conversación';
  end if;
  if p_mode not in ('ai', 'human') then
    raise exception 'El modo de conversación no es válido';
  end if;

  insert into public.whatsapp_conversation_controls (
    lead_id,
    mode,
    taken_by_user_id,
    taken_at,
    released_by_user_id,
    released_at
  ) values (
    p_lead_id,
    p_mode,
    case when p_mode = 'human' then v_user_id else null end,
    case when p_mode = 'human' then now() else null end,
    case when p_mode = 'ai' then v_user_id else null end,
    case when p_mode = 'ai' then now() else null end
  )
  on conflict (lead_id) do update set
    mode = excluded.mode,
    taken_by_user_id = excluded.taken_by_user_id,
    taken_at = excluded.taken_at,
    released_by_user_id = excluded.released_by_user_id,
    released_at = excluded.released_at
  returning * into v_control;

  insert into public.whatsapp_conversation_events (lead_id, actor_user_id, event_type)
  values (p_lead_id, v_user_id, case when p_mode = 'human' then 'taken' else 'released' end);

  return jsonb_build_object(
    'lead_id', v_control.lead_id,
    'mode', v_control.mode,
    'taken_by_user_id', v_control.taken_by_user_id,
    'taken_at', v_control.taken_at,
    'released_at', v_control.released_at,
    'updated_at', v_control.updated_at
  );
end;
$$;

revoke all on function public.set_whatsapp_conversation_mode(uuid, text) from public, anon;
grant execute on function public.set_whatsapp_conversation_mode(uuid, text) to authenticated;

alter table public.whatsapp_conversation_controls enable row level security;
alter table public.whatsapp_conversation_events enable row level security;

create policy whatsapp_conversation_controls_read_authorized
on public.whatsapp_conversation_controls for select
to authenticated
using (private.current_user_can_manage_whatsapp(lead_id));

create policy whatsapp_conversation_events_read_authorized
on public.whatsapp_conversation_events for select
to authenticated
using (private.current_user_can_manage_whatsapp(lead_id));

revoke all on public.whatsapp_conversation_controls from public, anon;
revoke all on public.whatsapp_conversation_events from public, anon;
grant select on public.whatsapp_conversation_controls to authenticated;
grant select on public.whatsapp_conversation_events to authenticated;
grant all on public.whatsapp_conversation_controls to service_role;
grant all on public.whatsapp_conversation_events to service_role;
grant usage, select on sequence public.whatsapp_conversation_events_id_seq to service_role;

