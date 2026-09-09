create table public.lead_management_playbook_items (
  lead_id uuid not null references public.leads (id) on delete cascade,
  item_key text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles (user_id) on delete set null,
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lead_id, item_key),
  constraint lead_management_playbook_item_key check (item_key in (
    'initial_message',
    'confirm_model_version',
    'detect_primary_need',
    'send_quote',
    'send_vehicle_photos',
    'send_technical_material',
    'purchase_modality',
    'initial_capacity',
    'trade_in',
    'purchase_urgency',
    'main_objection',
    'schedule_next_contact',
    'attempt_next_stage'
  )),
  constraint lead_management_playbook_completion check (
    (completed and completed_at is not null and completed_by is not null)
    or (not completed and completed_at is null and completed_by is null)
  )
);

create index lead_management_playbook_items_updated_idx
  on public.lead_management_playbook_items (lead_id, updated_at desc);

create table public.lead_management_playbook_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  item_key text not null,
  event_type text not null,
  actor_user_id uuid not null references public.profiles (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint lead_management_playbook_event_item_key check (item_key in (
    'initial_message',
    'confirm_model_version',
    'detect_primary_need',
    'send_quote',
    'send_vehicle_photos',
    'send_technical_material',
    'purchase_modality',
    'initial_capacity',
    'trade_in',
    'purchase_urgency',
    'main_objection',
    'schedule_next_contact',
    'attempt_next_stage'
  )),
  constraint lead_management_playbook_event_type check (event_type in ('completed', 'reopened'))
);

create index lead_management_playbook_events_lead_time_idx
  on public.lead_management_playbook_events (lead_id, created_at desc);

alter table public.lead_management_playbook_items enable row level security;
alter table public.lead_management_playbook_events enable row level security;

create policy lead_management_playbook_items_select
on public.lead_management_playbook_items
for select
to authenticated
using (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or exists (
      select 1
      from public.leads lead
      where lead.id = lead_id
        and lead.assigned_seller_user_id = (select auth.uid())
    )
  )
);

create policy lead_management_playbook_items_insert
on public.lead_management_playbook_items
for insert
to authenticated
with check (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or exists (
      select 1
      from public.leads lead
      where lead.id = lead_id
        and lead.assigned_seller_user_id = (select auth.uid())
    )
  )
);

create policy lead_management_playbook_items_update
on public.lead_management_playbook_items
for update
to authenticated
using (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or exists (
      select 1
      from public.leads lead
      where lead.id = lead_id
        and lead.assigned_seller_user_id = (select auth.uid())
    )
  )
)
with check (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or exists (
      select 1
      from public.leads lead
      where lead.id = lead_id
        and lead.assigned_seller_user_id = (select auth.uid())
    )
  )
);

create policy lead_management_playbook_events_select
on public.lead_management_playbook_events
for select
to authenticated
using (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or exists (
      select 1
      from public.leads lead
      where lead.id = lead_id
        and lead.assigned_seller_user_id = (select auth.uid())
    )
  )
);

grant select, insert, update on public.lead_management_playbook_items to authenticated;
grant select on public.lead_management_playbook_events to authenticated;

create or replace function private.prepare_management_playbook_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  new.updated_by := v_actor;
  new.updated_at := now();

  if new.completed then
    if tg_op = 'INSERT' or not old.completed then
      new.completed_at := now();
      new.completed_by := v_actor;
    else
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_management_playbook_item() from public, anon, authenticated;

create trigger lead_management_playbook_prepare
before insert or update on public.lead_management_playbook_items
for each row execute function private.prepare_management_playbook_item();

create or replace function private.audit_management_playbook_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  if not private.current_user_is_management() and not exists (
    select 1
    from public.leads lead
    where lead.id = new.lead_id
      and lead.assigned_seller_user_id = v_actor
  ) then
    raise exception 'El lead no está asignado a este vendedor';
  end if;

  if tg_op = 'INSERT' or old.completed is distinct from new.completed then
    insert into public.lead_management_playbook_events (
      lead_id,
      item_key,
      event_type,
      actor_user_id
    ) values (
      new.lead_id,
      new.item_key,
      case when new.completed then 'completed' else 'reopened' end,
      v_actor
    );
  end if;

  return new;
end;
$$;

revoke all on function private.audit_management_playbook_item() from public, anon, authenticated;

create trigger lead_management_playbook_audit
after insert or update on public.lead_management_playbook_items
for each row execute function private.audit_management_playbook_item();

create or replace function private.enforce_en_gestion_next_contact()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'en_proceso'
     and new.next_contact_at is null
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.next_contact_at is distinct from new.next_contact_at
     )
  then
    raise exception 'En gestión requiere un próximo contacto con fecha y hora';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_en_gestion_next_contact() from public, anon, authenticated;

create trigger lead_crm_en_gestion_next_contact
before insert or update of status, next_contact_at on public.lead_crm
for each row execute function private.enforce_en_gestion_next_contact();

comment on table public.lead_management_playbook_items
  is 'Estado estructurado del playbook comercial de En Gestión. No es un score de rendimiento.';

comment on table public.lead_management_playbook_events
  is 'Historial append-only de cambios de estado del playbook comercial.';
