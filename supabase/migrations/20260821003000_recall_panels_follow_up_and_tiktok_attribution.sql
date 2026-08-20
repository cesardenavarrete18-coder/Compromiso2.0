-- Stable recall panels, manual-only agenda deadlines and TikTok routing audit.

create table public.lead_recall_panels (
  id uuid primary key default gen_random_uuid(),
  panel_number bigint generated always as identity unique,
  seller_user_id uuid not null references public.profiles (user_id) on delete restrict,
  created_by_user_id uuid references public.profiles (user_id) on delete set null,
  status text not null default 'open',
  total_items integer not null default 0,
  completed_items integer not null default 0,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint lead_recall_panels_status check (status in ('open', 'closed')),
  constraint lead_recall_panels_progress check (
    total_items >= 0 and completed_items >= 0 and completed_items <= total_items
  ),
  constraint lead_recall_panels_closed_at check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  )
);

alter table public.lead_recall_items
  add column recall_panel_id uuid references public.lead_recall_panels (id) on delete set null,
  add column panel_position integer;

alter table public.lead_recall_items
  add constraint lead_recall_items_panel_position check (
    (recall_panel_id is null and panel_position is null)
    or (recall_panel_id is not null and panel_position > 0)
  );

create unique index lead_recall_items_panel_position_idx
  on public.lead_recall_items (recall_panel_id, panel_position)
  where recall_panel_id is not null;
create index lead_recall_panels_seller_status_idx
  on public.lead_recall_panels (seller_user_id, status, created_at desc);
create index lead_recall_panels_created_by_idx
  on public.lead_recall_panels (created_by_user_id)
  where created_by_user_id is not null;

create function private.sync_recall_panel_progress(p_panel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_completed integer;
begin
  if p_panel_id is null then return; end if;

  select count(*), count(*) filter (where status in ('converted', 'exhausted', 'cancelled'))
  into v_total, v_completed
  from public.lead_recall_items
  where recall_panel_id = p_panel_id;

  update public.lead_recall_panels
  set total_items = v_total,
      completed_items = v_completed,
      status = case when v_total > 0 and v_completed = v_total then 'closed' else 'open' end,
      closed_at = case
        when v_total > 0 and v_completed = v_total then coalesce(closed_at, now())
        else null
      end
  where id = p_panel_id;
end;
$$;

revoke all on function private.sync_recall_panel_progress(uuid) from public, anon, authenticated;

create function private.refresh_recall_panel_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_recall_panel_progress(old.recall_panel_id);
    return old;
  end if;

  perform private.sync_recall_panel_progress(new.recall_panel_id);
  if tg_op = 'UPDATE' and old.recall_panel_id is distinct from new.recall_panel_id then
    perform private.sync_recall_panel_progress(old.recall_panel_id);
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_recall_panel_from_item() from public, anon, authenticated;

create trigger lead_recall_items_refresh_panel
  after insert or delete or update of status, recall_panel_id on public.lead_recall_items
  for each row execute function private.refresh_recall_panel_from_item();

-- Preserve the already assigned workload by grouping each seller's current
-- recall items into one stable panel.
do $$
declare
  v_seller record;
  v_panel_id uuid;
begin
  for v_seller in
    select assigned_seller_user_id as seller_user_id,
           (array_agg(assigned_by_user_id order by assigned_at desc nulls last))[1] as assigned_by_user_id,
           min(assigned_at) as first_assigned_at
    from public.lead_recall_items
    where status in ('assigned', 'working')
      and assigned_seller_user_id is not null
      and recall_panel_id is null
    group by assigned_seller_user_id
  loop
    insert into public.lead_recall_panels (
      seller_user_id, created_by_user_id, created_at
    ) values (
      v_seller.seller_user_id, v_seller.assigned_by_user_id,
      coalesce(v_seller.first_assigned_at, now())
    ) returning id into v_panel_id;

    with ordered as (
      select id, row_number() over (
        order by assigned_at asc nulls last, original_inquiry_at desc, id
      )::integer as position
      from public.lead_recall_items
      where status in ('assigned', 'working')
        and assigned_seller_user_id = v_seller.seller_user_id
        and recall_panel_id is null
    )
    update public.lead_recall_items item
    set recall_panel_id = v_panel_id,
        panel_position = ordered.position,
        updated_at = now()
    from ordered
    where item.id = ordered.id;

    perform private.sync_recall_panel_progress(v_panel_id);
  end loop;
end;
$$;

create or replace function public.assign_recall_items(p_item_ids uuid[], p_seller_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
  v_panel_id uuid;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if coalesce(cardinality(p_item_ids), 0) = 0 then
    raise exception 'Seleccioná al menos un rellamado';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = p_seller_user_id and role::text = 'seller' and active
  ) then
    raise exception 'El vendedor seleccionado no está activo';
  end if;

  insert into public.lead_recall_panels (seller_user_id, created_by_user_id)
  values (p_seller_user_id, v_user_id)
  returning id into v_panel_id;

  with requested as (
    select requested_id, row_number() over (order by first_position)::integer as panel_position
    from (
      select requested_id, min(ordinality) as first_position
      from unnest(p_item_ids) with ordinality as requested_value(requested_id, ordinality)
      group by requested_id
    ) deduplicated
  )
  update public.lead_recall_items item
  set status = 'assigned',
      assigned_seller_user_id = p_seller_user_id,
      assigned_by_user_id = v_user_id,
      assigned_at = now(),
      recall_panel_id = v_panel_id,
      panel_position = requested.panel_position,
      updated_at = now()
  from requested
  where item.id = requested.requested_id
    and item.status = 'available'
    and item.available_at <= now()
    and item.recall_panel_id is null;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    delete from public.lead_recall_panels where id = v_panel_id;
    raise exception 'Los rellamados seleccionados ya no están disponibles';
  end if;

  perform private.sync_recall_panel_progress(v_panel_id);
  return v_count;
end;
$$;

revoke all on function public.assign_recall_items(uuid[], uuid) from public, anon;
grant execute on function public.assign_recall_items(uuid[], uuid) to authenticated;

-- Automated protocol windows stay in lead_contact_tasks. Only a manually
-- agreed future contact may populate lead_crm.next_contact_at.
create function private.is_automated_contact_note(p_note text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select trim(coalesce(p_note, '')) ~* '^(WhatsApp [1-4]( de seguimiento| de 4)?|Llamada [1-3] de 3)$';
$$;

revoke all on function private.is_automated_contact_note(text) from public, anon, authenticated;

create function private.keep_protocol_deadlines_out_of_manual_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_automated_contact_note(new.next_contact_note) then
    if tg_op = 'UPDATE'
      and old.next_contact_at is not null
      and not private.is_automated_contact_note(old.next_contact_note)
    then
      new.next_contact_at := old.next_contact_at;
      new.next_contact_note := old.next_contact_note;
    else
      new.next_contact_at := null;
      new.next_contact_note := '';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_protocol_deadlines_out_of_manual_agenda() from public, anon, authenticated;

create trigger lead_crm_manual_agenda_on_insert
  before insert on public.lead_crm
  for each row execute function private.keep_protocol_deadlines_out_of_manual_agenda();
create trigger lead_crm_manual_agenda_on_update
  before update of next_contact_at, next_contact_note on public.lead_crm
  for each row execute function private.keep_protocol_deadlines_out_of_manual_agenda();

update public.lead_crm
set next_contact_at = null,
    next_contact_note = '',
    updated_at = now()
where next_contact_at is not null
  and private.is_automated_contact_note(next_contact_note);

create table public.lead_tiktok_attributions (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  whatsapp_message_id text,
  identifier_type text not null,
  raw_identifier text not null default '',
  matched_seller_user_id uuid references public.profiles (user_id) on delete set null,
  outcome text not null,
  routing_reason text not null default '',
  created_at timestamptz not null default now(),
  constraint lead_tiktok_attributions_identifier_type check (
    identifier_type in ('seller_code', 'advisor_name')
  ),
  constraint lead_tiktok_attributions_outcome check (
    outcome in ('assigned', 'existing_owner', 'invalid', 'ambiguous', 'seller_paused', 'daily_quota_reached')
  ),
  constraint lead_tiktok_attributions_identifier_length check (char_length(raw_identifier) <= 160),
  constraint lead_tiktok_attributions_reason_length check (char_length(routing_reason) <= 300)
);

create unique index lead_tiktok_attributions_message_idx
  on public.lead_tiktok_attributions (whatsapp_message_id)
  where whatsapp_message_id is not null;
create index lead_tiktok_attributions_supervisor_idx
  on public.lead_tiktok_attributions (created_at desc, outcome);
create index lead_tiktok_attributions_lead_idx
  on public.lead_tiktok_attributions (lead_id, created_at desc);
create index lead_tiktok_attributions_seller_idx
  on public.lead_tiktok_attributions (matched_seller_user_id, created_at desc)
  where matched_seller_user_id is not null;

alter table public.lead_recall_panels enable row level security;
alter table public.lead_tiktok_attributions enable row level security;

create policy lead_recall_panels_management_or_owner_read
on public.lead_recall_panels for select to authenticated
using (
  private.current_user_is_management()
  or seller_user_id = (select auth.uid())
);

create policy lead_tiktok_attributions_management_read
on public.lead_tiktok_attributions for select to authenticated
using (private.current_user_is_management());

grant select on public.lead_recall_panels, public.lead_tiktok_attributions to authenticated;
grant all on public.lead_recall_panels, public.lead_tiktok_attributions to service_role;
grant usage, select on sequence public.lead_recall_panels_panel_number_seq,
  public.lead_tiktok_attributions_id_seq to service_role;
