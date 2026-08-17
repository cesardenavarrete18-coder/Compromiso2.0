-- Commercial operations foundation: customer identity, contact protocol,
-- attribution, consent, goals and role-based operational reporting.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  normalized_phone text not null unique,
  primary_phone text not null,
  full_name text,
  email text,
  document_number text,
  cuil text,
  contact_consent_at timestamptz,
  contact_consent_source text not null default '',
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text not null default '',
  do_not_contact boolean not null default false,
  do_not_contact_at timestamptz,
  do_not_contact_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_phone_length check (char_length(normalized_phone) between 6 and 30),
  constraint customers_name_length check (full_name is null or char_length(full_name) between 1 and 160),
  constraint customers_identity_length check (
    document_number is null or char_length(document_number) between 7 and 12
  ),
  constraint customers_cuil_length check (cuil is null or char_length(cuil) = 11),
  constraint customers_contact_reason_length check (char_length(do_not_contact_reason) <= 1000)
);

create unique index customers_document_unique_idx
  on public.customers (document_number)
  where document_number is not null;
create unique index customers_cuil_unique_idx
  on public.customers (cuil)
  where cuil is not null;
create index customers_name_idx on public.customers (lower(full_name)) where full_name is not null;
create index customers_marketing_idx on public.customers (marketing_opt_in, do_not_contact, updated_at desc);

alter table public.leads
  add column customer_id uuid references public.customers (id) on delete restrict,
  add column contact_consent_at timestamptz,
  add column contact_consent_source text not null default '',
  add column marketing_opt_in boolean not null default false,
  add column marketing_opt_in_at timestamptz,
  add column marketing_opt_in_source text not null default '',
  add column do_not_contact boolean not null default false,
  add column do_not_contact_at timestamptz,
  add column do_not_contact_reason text not null default '';

create index leads_customer_time_idx on public.leads (customer_id, created_at desc);
create index leads_consent_segment_idx on public.leads (marketing_opt_in, do_not_contact, created_at desc);

with grouped as (
  select
    regexp_replace(customer_phone, '[^0-9]', '', 'g') as normalized_phone,
    min(customer_phone) as primary_phone,
    (array_agg(customer_name order by created_at desc) filter (where customer_name is not null))[1] as full_name,
    min(created_at) as created_at,
    max(updated_at) as updated_at,
    min(created_at) filter (where source_channel in ('whatsapp', 'web', 'tiktok')) as contact_consent_at,
    case when bool_or(source_channel in ('whatsapp', 'web', 'tiktok')) then 'consulta_comercial_existente' else '' end as consent_source
  from public.leads
  group by regexp_replace(customer_phone, '[^0-9]', '', 'g')
)
insert into public.customers (
  normalized_phone, primary_phone, full_name, created_at, updated_at,
  contact_consent_at, contact_consent_source
)
select normalized_phone, primary_phone, full_name, created_at, updated_at,
  contact_consent_at, consent_source
from grouped
where char_length(normalized_phone) >= 6
on conflict (normalized_phone) do nothing;

update public.leads lead
set
  customer_id = customer.id,
  contact_consent_at = coalesce(lead.contact_consent_at,
    case when lead.source_channel in ('whatsapp', 'web', 'tiktok') then lead.created_at end),
  contact_consent_source = case
    when lead.contact_consent_source <> '' then lead.contact_consent_source
    when lead.source_channel = 'whatsapp' then 'whatsapp_inbound'
    when lead.source_channel = 'tiktok' then 'tiktok_inbound'
    when lead.source_channel = 'web' then 'web_form'
    else ''
  end
from public.customers customer
where customer.normalized_phone = regexp_replace(lead.customer_phone, '[^0-9]', '', 'g');

alter table public.leads alter column customer_id set not null;

create table public.lead_attributions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  platform text not null,
  source_type text not null default '',
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  click_id text,
  source_url text,
  headline text,
  body text,
  media_type text,
  raw_referral jsonb not null default '{}'::jsonb,
  first_touch_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_attributions_platform check (platform in ('meta_ads', 'tiktok', 'web', 'manual', 'organic', 'other')),
  constraint lead_attributions_text_lengths check (
    char_length(source_type) <= 100
    and char_length(coalesce(headline, '')) <= 1000
    and char_length(coalesce(body, '')) <= 3000
  )
);

create index lead_attributions_reporting_idx
  on public.lead_attributions (platform, campaign_id, adset_id, ad_id, first_touch_at desc);
create index lead_attributions_click_idx on public.lead_attributions (click_id) where click_id is not null;

create table public.contact_message_templates (
  id uuid primary key default gen_random_uuid(),
  step_number smallint not null unique,
  title text not null,
  body text not null,
  meta_template_name text,
  meta_language text not null default 'es_AR',
  active boolean not null default true,
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_message_templates_step check (step_number between 1 and 4),
  constraint contact_message_templates_title_length check (char_length(title) between 2 and 120),
  constraint contact_message_templates_body_length check (char_length(body) between 10 and 1500)
);

insert into public.contact_message_templates (step_number, title, body) values
  (1, 'Presentación', 'Hola {nombre}, ¿cómo estás? Mi nombre es {vendedor}, asesor de Compromiso mi 0km. Recibimos tu consulta por {modelo}. Intenté comunicarme para conocer qué tipo de operación estás buscando. Cuando puedas, respondeme por acá y lo vemos.'),
  (2, 'Segundo seguimiento', 'Hola {nombre}. Estuve intentando comunicarme con vos por la consulta que realizaste sobre {modelo}. Quería confirmar si todavía estás buscando una alternativa para avanzar con tu 0 km y poder orientarte correctamente.'),
  (3, 'Confirmación de interés', 'Hola {nombre}. No es mi intención molestarte; solamente quería saber si querés que continuemos con la consulta por {modelo} o si preferís que la dejemos pausada por el momento.'),
  (4, 'Cierre respetuoso', 'Hola {nombre}. Como no pude comunicarme, voy a dejar tu consulta pausada para no incomodarte. Si más adelante querés retomarla, respondeme este mensaje y continuamos desde acá.');

create table public.lead_contact_sequences (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  seller_user_id uuid not null references public.profiles (user_id) on delete restrict,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stopped_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_contact_sequences_status check (status in ('active', 'completed', 'cancelled', 'paused')),
  constraint lead_contact_sequences_reason_length check (char_length(stopped_reason) <= 1000)
);

create unique index lead_contact_sequences_one_active_idx
  on public.lead_contact_sequences (lead_id)
  where status = 'active';
create index lead_contact_sequences_seller_idx
  on public.lead_contact_sequences (seller_user_id, status, started_at desc);

create table public.lead_contact_tasks (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.lead_contact_sequences (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  seller_user_id uuid not null references public.profiles (user_id) on delete restrict,
  sequence_order smallint not null,
  channel text not null,
  call_attempt smallint,
  message_step smallint,
  template_id uuid references public.contact_message_templates (id) on delete set null,
  due_start timestamptz not null,
  due_end timestamptz not null,
  status text not null default 'pending',
  outcome text not null default '',
  note text not null default '',
  completed_at timestamptz,
  completed_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_contact_tasks_order unique (sequence_id, sequence_order),
  constraint lead_contact_tasks_channel check (channel in ('call', 'whatsapp')),
  constraint lead_contact_tasks_status check (status in ('pending', 'completed', 'skipped', 'cancelled')),
  constraint lead_contact_tasks_window check (due_end > due_start),
  constraint lead_contact_tasks_call check (
    (channel = 'call' and call_attempt between 1 and 3 and message_step is null)
    or (channel = 'whatsapp' and message_step between 1 and 4 and call_attempt is null)
  ),
  constraint lead_contact_tasks_note_length check (char_length(note) <= 3000)
);

create index lead_contact_tasks_agenda_idx
  on public.lead_contact_tasks (seller_user_id, status, due_start)
  where status = 'pending';
create index lead_contact_tasks_lead_idx
  on public.lead_contact_tasks (lead_id, created_at desc);

create table public.commercial_goals (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  seller_user_id uuid references public.profiles (user_id) on delete cascade,
  target_contacts integer not null default 0,
  target_interviews integer not null default 0,
  target_sales integer not null default 0,
  target_finalized integer not null default 0,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_goals_first_day check (extract(day from period_month) = 1),
  constraint commercial_goals_nonnegative check (
    target_contacts >= 0 and target_interviews >= 0 and target_sales >= 0 and target_finalized >= 0
  )
);

create unique index commercial_goals_seller_month_idx
  on public.commercial_goals (period_month, seller_user_id)
  where seller_user_id is not null;
create unique index commercial_goals_team_month_idx
  on public.commercial_goals (period_month)
  where seller_user_id is null;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();
create trigger lead_attributions_set_updated_at
  before update on public.lead_attributions
  for each row execute function private.set_updated_at();
create trigger contact_message_templates_set_updated_at
  before update on public.contact_message_templates
  for each row execute function private.set_updated_at();
create trigger lead_contact_sequences_set_updated_at
  before update on public.lead_contact_sequences
  for each row execute function private.set_updated_at();
create trigger lead_contact_tasks_set_updated_at
  before update on public.lead_contact_tasks
  for each row execute function private.set_updated_at();
create trigger commercial_goals_set_updated_at
  before update on public.commercial_goals
  for each row execute function private.set_updated_at();

create function private.ensure_lead_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(new.customer_phone, '[^0-9]', '', 'g');
  v_customer_id uuid;
begin
  if char_length(v_phone) < 6 then
    raise exception 'El teléfono del cliente no es válido';
  end if;

  insert into public.customers (
    normalized_phone, primary_phone, full_name, contact_consent_at, contact_consent_source,
    marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source,
    do_not_contact, do_not_contact_at, do_not_contact_reason
  ) values (
    v_phone,
    new.customer_phone,
    new.customer_name,
    new.contact_consent_at,
    new.contact_consent_source,
    new.marketing_opt_in,
    new.marketing_opt_in_at,
    new.marketing_opt_in_source,
    new.do_not_contact,
    new.do_not_contact_at,
    new.do_not_contact_reason
  )
  on conflict (normalized_phone) do update set
    primary_phone = excluded.primary_phone,
    full_name = coalesce(excluded.full_name, public.customers.full_name),
    contact_consent_at = coalesce(public.customers.contact_consent_at, excluded.contact_consent_at),
    contact_consent_source = case when public.customers.contact_consent_source = '' then excluded.contact_consent_source else public.customers.contact_consent_source end,
    marketing_opt_in = public.customers.marketing_opt_in or excluded.marketing_opt_in,
    marketing_opt_in_at = coalesce(public.customers.marketing_opt_in_at, excluded.marketing_opt_in_at),
    marketing_opt_in_source = case when public.customers.marketing_opt_in_source = '' then excluded.marketing_opt_in_source else public.customers.marketing_opt_in_source end,
    do_not_contact = public.customers.do_not_contact or excluded.do_not_contact,
    do_not_contact_at = coalesce(public.customers.do_not_contact_at, excluded.do_not_contact_at),
    do_not_contact_reason = case when public.customers.do_not_contact_reason = '' then excluded.do_not_contact_reason else public.customers.do_not_contact_reason end,
    updated_at = now()
  returning id into v_customer_id;

  new.customer_id := v_customer_id;
  return new;
end;
$$;

revoke all on function private.ensure_lead_customer() from public, anon, authenticated;

create trigger leads_ensure_customer
  before insert or update of customer_phone, customer_name, contact_consent_at,
    contact_consent_source, marketing_opt_in, marketing_opt_in_at,
    marketing_opt_in_source, do_not_contact, do_not_contact_at, do_not_contact_reason
  on public.leads
  for each row execute function private.ensure_lead_customer();

create function private.business_date(p_date date, p_offset integer default 0)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_date date := p_date;
  v_remaining integer := greatest(p_offset, 0);
begin
  while extract(isodow from v_date) > 5 loop
    v_date := v_date + 1;
  end loop;
  while v_remaining > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) <= 5 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  return v_date;
end;
$$;

create function private.contact_window_start(p_date date, p_slot integer)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_date + case p_slot when 1 then time '10:00' when 2 then time '14:00' else time '17:00' end)
    at time zone 'America/Argentina/Buenos_Aires';
$$;

create function private.contact_window_end(p_date date, p_slot integer)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_date + case p_slot when 1 then time '12:00' when 2 then time '16:00' else time '19:00' end)
    at time zone 'America/Argentina/Buenos_Aires';
$$;

revoke all on function private.business_date(date, integer) from public, anon, authenticated;
revoke all on function private.contact_window_start(date, integer) from public, anon, authenticated;
revoke all on function private.contact_window_end(date, integer) from public, anon, authenticated;

create function private.create_lead_contact_sequence(
  p_lead_id uuid,
  p_seller_user_id uuid,
  p_started_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence_id uuid;
  v_local timestamp := p_started_at at time zone 'America/Argentina/Buenos_Aires';
  v_day_one date;
  v_day_two date;
  v_day_three date;
  v_slot_one integer;
  v_slot_two integer;
  v_slot_three integer;
  v_call_one_start timestamptz;
  v_call_one_end timestamptz;
  v_call_two_start timestamptz;
  v_call_two_end timestamptz;
  v_call_three_start timestamptz;
  v_call_three_end timestamptz;
begin
  if p_seller_user_id is null then return null; end if;
  if exists (select 1 from public.leads where id = p_lead_id and do_not_contact) then return null; end if;
  select id into v_sequence_id
  from public.lead_contact_sequences
  where lead_id = p_lead_id and status = 'active';
  if v_sequence_id is not null then return v_sequence_id; end if;

  v_day_one := private.business_date(v_local::date, 0);
  if v_day_one <> v_local::date or v_local::time >= time '18:30' then
    if v_day_one = v_local::date then v_day_one := private.business_date(v_day_one, 1); end if;
    v_slot_one := 1;
  elsif v_local::time < time '11:30' then
    v_slot_one := 1;
  elsif v_local::time < time '15:30' then
    v_slot_one := 2;
  else
    v_slot_one := 3;
  end if;

  v_slot_two := case v_slot_one when 1 then 2 when 2 then 3 else 1 end;
  v_slot_three := case v_slot_one when 1 then 3 when 2 then 1 else 2 end;
  v_day_two := private.business_date(v_day_one, 1);
  v_day_three := private.business_date(v_day_one, 2);

  v_call_one_start := private.contact_window_start(v_day_one, v_slot_one);
  v_call_one_end := private.contact_window_end(v_day_one, v_slot_one);
  v_call_two_start := private.contact_window_start(v_day_two, v_slot_two);
  v_call_two_end := private.contact_window_end(v_day_two, v_slot_two);
  v_call_three_start := private.contact_window_start(v_day_three, v_slot_three);
  v_call_three_end := private.contact_window_end(v_day_three, v_slot_three);

  insert into public.lead_contact_sequences (lead_id, seller_user_id, started_at)
  values (p_lead_id, p_seller_user_id, p_started_at)
  returning id into v_sequence_id;

  insert into public.lead_contact_tasks (
    sequence_id, lead_id, seller_user_id, sequence_order, channel,
    call_attempt, message_step, template_id, due_start, due_end
  ) values
    (v_sequence_id, p_lead_id, p_seller_user_id, 1, 'whatsapp', null, 1,
      (select id from public.contact_message_templates where step_number = 1),
      p_started_at, p_started_at + interval '2 hours'),
    (v_sequence_id, p_lead_id, p_seller_user_id, 2, 'call', 1, null, null,
      v_call_one_start, v_call_one_end),
    (v_sequence_id, p_lead_id, p_seller_user_id, 3, 'whatsapp', null, 2,
      (select id from public.contact_message_templates where step_number = 2),
      v_call_one_end + interval '15 minutes', v_call_one_end + interval '2 hours'),
    (v_sequence_id, p_lead_id, p_seller_user_id, 4, 'call', 2, null, null,
      v_call_two_start, v_call_two_end),
    (v_sequence_id, p_lead_id, p_seller_user_id, 5, 'whatsapp', null, 3,
      (select id from public.contact_message_templates where step_number = 3),
      v_call_two_end + interval '15 minutes', v_call_two_end + interval '2 hours'),
    (v_sequence_id, p_lead_id, p_seller_user_id, 6, 'call', 3, null, null,
      v_call_three_start, v_call_three_end),
    (v_sequence_id, p_lead_id, p_seller_user_id, 7, 'whatsapp', null, 4,
      (select id from public.contact_message_templates where step_number = 4),
      v_call_three_end + interval '15 minutes', v_call_three_end + interval '2 hours');

  insert into public.lead_crm (lead_id, priority, next_contact_at, next_contact_note)
  select p_lead_id, priority, p_started_at, 'WhatsApp 1 de seguimiento'
  from public.leads where id = p_lead_id
  on conflict (lead_id) do update set
    next_contact_at = excluded.next_contact_at,
    next_contact_note = excluded.next_contact_note,
    updated_at = now();

  return v_sequence_id;
end;
$$;

revoke all on function private.create_lead_contact_sequence(uuid, uuid, timestamptz) from public, anon, authenticated;

create function private.start_contact_sequence_after_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_seller_user_id is not null
    and (tg_op = 'INSERT' or old.assigned_seller_user_id is distinct from new.assigned_seller_user_id)
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.create_lead_contact_sequence(new.id, new.assigned_seller_user_id, coalesce(new.assigned_at, now()));
  end if;
  return new;
end;
$$;

revoke all on function private.start_contact_sequence_after_assignment() from public, anon, authenticated;

create trigger leads_start_contact_sequence
  after insert or update of assigned_seller_user_id on public.leads
  for each row execute function private.start_contact_sequence_after_assignment();

create function private.sync_contact_sequence_with_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
begin
  if new.status not in ('nuevo', 'no_contesta') then
    update public.lead_contact_sequences
    set status = 'cancelled', completed_at = now(), stopped_reason = 'Cambio de estado a ' || new.status
    where lead_id = new.lead_id and status = 'active';
    update public.lead_contact_tasks
    set status = 'cancelled', updated_at = now()
    where lead_id = new.lead_id and status = 'pending';
  elsif old.status not in ('nuevo', 'no_contesta') and new.status in ('nuevo', 'no_contesta') then
    select assigned_seller_user_id into v_seller from public.leads where id = new.lead_id;
    if v_seller is not null then
      perform private.create_lead_contact_sequence(new.lead_id, v_seller, now());
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_contact_sequence_with_status() from public, anon, authenticated;

create trigger lead_crm_sync_contact_sequence
  after update of status on public.lead_crm
  for each row when (old.status is distinct from new.status)
  execute function private.sync_contact_sequence_with_status();

create function public.complete_contact_task(
  p_task_id uuid,
  p_outcome text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_task public.lead_contact_tasks%rowtype;
  v_next public.lead_contact_tasks%rowtype;
  v_customer_id uuid;
  v_sequence_finished boolean := false;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;
  if p_outcome not in ('no_answer', 'answered', 'sent', 'skipped', 'invalid', 'no_interest', 'requested_no_contact') then
    raise exception 'Resultado de contacto inválido';
  end if;
  if char_length(trim(coalesce(p_note, ''))) > 3000 then
    raise exception 'El detalle es demasiado extenso';
  end if;

  select * into v_task from public.lead_contact_tasks where id = p_task_id for update;
  if v_task.id is null or v_task.status <> 'pending' then
    raise exception 'La tarea ya fue procesada o no existe';
  end if;
  if v_task.seller_user_id <> v_user_id and not private.current_user_is_management() then
    raise exception 'La tarea no corresponde a este vendedor';
  end if;
  if v_task.channel = 'call' and p_outcome = 'sent' then
    raise exception 'Resultado incompatible con una llamada';
  end if;
  if v_task.channel = 'whatsapp' and p_outcome = 'no_answer' then
    raise exception 'Resultado incompatible con WhatsApp';
  end if;

  update public.lead_contact_tasks set
    status = case when p_outcome = 'skipped' then 'skipped' else 'completed' end,
    outcome = p_outcome,
    note = trim(coalesce(p_note, '')),
    completed_at = now(),
    completed_by = v_user_id,
    updated_at = now()
  where id = p_task_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    v_task.lead_id,
    v_user_id,
    case when v_task.channel = 'call' then 'contact' else 'follow_up' end,
    case
      when v_task.channel = 'call' then 'Intento de llamada ' || v_task.call_attempt || ' registrado'
      else 'WhatsApp de seguimiento ' || v_task.message_step || ' registrado'
    end,
    trim(coalesce(p_note, '')),
    jsonb_build_object('task_id', v_task.id, 'channel', v_task.channel, 'outcome', p_outcome,
      'call_attempt', v_task.call_attempt, 'message_step', v_task.message_step)
  );

  if p_outcome in ('answered', 'invalid', 'no_interest', 'requested_no_contact') then
    update public.lead_contact_sequences set
      status = 'cancelled', completed_at = now(), stopped_reason = case p_outcome
        when 'answered' then 'El cliente respondió'
        when 'invalid' then 'Contacto inválido'
        when 'requested_no_contact' then 'Solicitó no ser contactado'
        else 'El cliente no desea continuar'
      end
    where id = v_task.sequence_id;
    update public.lead_contact_tasks set status = 'cancelled', updated_at = now()
    where sequence_id = v_task.sequence_id and status = 'pending';

    update public.lead_crm set
      status = case
        when p_outcome = 'answered' then 'en_proceso'
        when p_outcome = 'invalid' then 'invalido'
        else 'desistir'
      end,
      status_reason = case when p_outcome = 'answered' then status_reason else coalesce(nullif(trim(p_note), ''),
        case when p_outcome = 'invalid' then 'Contacto inválido' when p_outcome = 'requested_no_contact' then 'Solicitó no ser contactado' else 'No desea continuar' end) end,
      next_contact_at = null,
      next_contact_note = '',
      last_contact_at = now(),
      last_contact_outcome = p_outcome,
      cold_base_at = case when p_outcome in ('no_interest', 'requested_no_contact') then now() else cold_base_at end,
      updated_by = v_user_id,
      updated_at = now()
    where lead_id = v_task.lead_id;

    if p_outcome = 'requested_no_contact' then
      select customer_id into v_customer_id from public.leads where id = v_task.lead_id;
      update public.leads set do_not_contact = true, do_not_contact_at = now(),
        do_not_contact_reason = coalesce(nullif(trim(p_note), ''), 'Solicitud individual')
      where customer_id = v_customer_id;
      update public.customers set do_not_contact = true, do_not_contact_at = now(),
        do_not_contact_reason = coalesce(nullif(trim(p_note), ''), 'Solicitud individual')
      where id = v_customer_id;
    end if;
  else
    select * into v_next
    from public.lead_contact_tasks
    where sequence_id = v_task.sequence_id and status = 'pending'
    order by sequence_order
    limit 1;

    if v_next.id is null then
      v_sequence_finished := true;
      update public.lead_contact_sequences set status = 'completed', completed_at = now(),
        stopped_reason = 'Protocolo 3–4–1 completado sin respuesta'
      where id = v_task.sequence_id;
      update public.lead_crm set
        status = case when status in ('nuevo', 'no_contesta') then 'desistir' else status end,
        status_reason = case when status in ('nuevo', 'no_contesta') then 'Protocolo 3–4–1 completado sin respuesta' else status_reason end,
        next_contact_at = null,
        next_contact_note = '',
        cold_base_at = case when status in ('nuevo', 'no_contesta') then now() else cold_base_at end,
        updated_by = v_user_id,
        updated_at = now()
      where lead_id = v_task.lead_id;
    else
      update public.lead_crm set
        status = case when p_outcome = 'no_answer' and status = 'nuevo' then 'no_contesta' else status end,
        next_contact_at = v_next.due_start,
        next_contact_note = case when v_next.channel = 'call'
          then 'Llamada ' || v_next.call_attempt || ' de 3'
          else 'WhatsApp ' || v_next.message_step || ' de 4'
        end,
        last_contact_at = now(),
        last_contact_outcome = p_outcome,
        updated_by = v_user_id,
        updated_at = now()
      where lead_id = v_task.lead_id;
    end if;
  end if;

  return jsonb_build_object(
    'lead_id', v_task.lead_id,
    'sequence_finished', v_sequence_finished,
    'next_task_id', v_next.id,
    'next_due_at', v_next.due_start
  );
end;
$$;

revoke all on function public.complete_contact_task(uuid, text, text) from public, anon;
grant execute on function public.complete_contact_task(uuid, text, text) to authenticated;

create function public.restart_lead_contact_sequence(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_seller uuid;
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  select assigned_seller_user_id into v_seller from public.leads where id = p_lead_id;
  if v_seller is null then raise exception 'El lead todavía no tiene vendedor'; end if;
  if v_seller <> v_user_id and not private.current_user_is_management() then raise exception 'Acceso no autorizado'; end if;

  update public.lead_contact_sequences set status = 'cancelled', completed_at = now(), stopped_reason = 'Secuencia reiniciada'
  where lead_id = p_lead_id and status = 'active';
  update public.lead_contact_tasks set status = 'cancelled', updated_at = now()
  where lead_id = p_lead_id and status = 'pending';
  update public.lead_crm set status = 'nuevo', next_contact_at = null, next_contact_note = '', updated_by = v_user_id, updated_at = now()
  where lead_id = p_lead_id;
  return private.create_lead_contact_sequence(p_lead_id, v_seller, now());
end;
$$;

revoke all on function public.restart_lead_contact_sequence(uuid) from public, anon;
grant execute on function public.restart_lead_contact_sequence(uuid) to authenticated;

-- Automatically create a sequence for assigned leads that are still awaiting contact.
do $$
declare v_lead record;
begin
  for v_lead in
    select lead.id, lead.assigned_seller_user_id, coalesce(lead.assigned_at, now()) as started_at
    from public.leads lead
    join public.lead_crm crm on crm.lead_id = lead.id
    where lead.assigned_seller_user_id is not null
      and not lead.do_not_contact
      and crm.status in ('nuevo', 'no_contesta')
      and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = lead.id)
      and not exists (select 1 from public.lead_contact_sequences sequence where sequence.lead_id = lead.id and sequence.status = 'active')
  loop
    perform private.create_lead_contact_sequence(v_lead.id, v_lead.assigned_seller_user_id, greatest(v_lead.started_at, now()));
  end loop;
end;
$$;

alter table public.customers enable row level security;
alter table public.lead_attributions enable row level security;
alter table public.contact_message_templates enable row level security;
alter table public.lead_contact_sequences enable row level security;
alter table public.lead_contact_tasks enable row level security;
alter table public.commercial_goals enable row level security;

create policy customers_read_management_or_owner
on public.customers for select
to authenticated
using (
  private.current_user_active()
  and (
    private.current_user_is_management()
    or private.current_user_is_sales_admin()
    or exists (
      select 1 from public.leads lead
      where lead.customer_id = customers.id
        and lead.assigned_seller_user_id = (select auth.uid())
        and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = lead.id)
    )
  )
);

create policy lead_attributions_read_management_or_owner
on public.lead_attributions for select
to authenticated
using (
  private.current_user_active()
  and exists (
    select 1 from public.leads lead
    where lead.id = lead_attributions.lead_id
      and (
        private.current_user_is_management()
        or (lead.assigned_seller_user_id = (select auth.uid())
          and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = lead.id))
      )
  )
);

create policy contact_message_templates_read_active
on public.contact_message_templates for select
to authenticated
using (private.current_user_active());
create policy contact_message_templates_management_update
on public.contact_message_templates for update
to authenticated
using (private.current_user_is_management())
with check (private.current_user_is_management());

create policy lead_contact_sequences_read_management_or_owner
on public.lead_contact_sequences for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_management())
);
create policy lead_contact_tasks_read_management_or_owner
on public.lead_contact_tasks for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or private.current_user_is_management())
);

create policy commercial_goals_read
on public.commercial_goals for select
to authenticated
using (
  private.current_user_active()
  and (seller_user_id = (select auth.uid()) or seller_user_id is null or private.current_user_is_management())
);
create policy commercial_goals_management_insert
on public.commercial_goals for insert
to authenticated
with check (private.current_user_is_management());
create policy commercial_goals_management_update
on public.commercial_goals for update
to authenticated
using (private.current_user_is_management())
with check (private.current_user_is_management());
create policy commercial_goals_management_delete
on public.commercial_goals for delete
to authenticated
using (private.current_user_is_management());

grant select on public.customers, public.lead_attributions, public.lead_contact_sequences, public.lead_contact_tasks to authenticated;
grant select, update on public.contact_message_templates to authenticated;
grant select, insert, update, delete on public.commercial_goals to authenticated;
grant all on public.customers, public.lead_attributions, public.contact_message_templates,
  public.lead_contact_sequences, public.lead_contact_tasks, public.commercial_goals to service_role;
