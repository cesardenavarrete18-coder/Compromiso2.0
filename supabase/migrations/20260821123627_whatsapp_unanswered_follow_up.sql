-- One respectful follow-up for new WhatsApp conversations that go silent.
-- The delivery worker is invoked by Cron and keeps all eligibility checks in
-- the database so retries cannot produce duplicate messages.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create table public.whatsapp_follow_up_reminders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  first_inbound_message_id uuid not null unique references public.lead_messages (id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending',
  attempts smallint not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  whatsapp_message_id text,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_follow_up_reminders_status check (
    status in ('pending', 'processing', 'sent', 'cancelled', 'failed')
  ),
  constraint whatsapp_follow_up_reminders_attempts check (attempts between 0 and 3),
  constraint whatsapp_follow_up_reminders_error_length check (char_length(last_error) <= 1000)
);

create index whatsapp_follow_up_reminders_due_idx
  on public.whatsapp_follow_up_reminders (due_at)
  where status = 'pending';

create trigger whatsapp_follow_up_reminders_set_updated_at
  before update on public.whatsapp_follow_up_reminders
  for each row execute function private.set_updated_at();

create table public.whatsapp_automation_settings (
  id boolean primary key default true check (id),
  cron_secret_hash text not null default '',
  updated_at timestamptz not null default now(),
  constraint whatsapp_automation_settings_hash_length check (char_length(cron_secret_hash) <= 128)
);

insert into public.whatsapp_automation_settings (id) values (true);

create trigger whatsapp_automation_settings_set_updated_at
  before update on public.whatsapp_automation_settings
  for each row execute function private.set_updated_at();

create function private.cancel_whatsapp_follow_up_on_takeover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'human' then
    update public.whatsapp_follow_up_reminders
    set status = 'cancelled', last_error = 'Conversación tomada por una persona'
    where lead_id = new.lead_id and status in ('pending', 'processing');
  end if;
  return new;
end;
$$;

revoke all on function private.cancel_whatsapp_follow_up_on_takeover() from public, anon, authenticated;

create trigger whatsapp_control_cancel_automatic_follow_up
  after insert or update of mode on public.whatsapp_conversation_controls
  for each row execute function private.cancel_whatsapp_follow_up_on_takeover();

create function public.claim_due_whatsapp_follow_up_reminders(p_limit integer default 50)
returns table (
  reminder_id uuid,
  lead_id uuid,
  customer_phone text,
  model_interest text,
  attempts smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.whatsapp_follow_up_reminders reminder
  set status = case
        when exists (
          select 1 from public.lead_messages message
          where message.lead_id = reminder.lead_id
            and message.raw_payload @> '{"automated_follow_up": true}'::jsonb
        ) then 'sent'
        when reminder.attempts >= 3 then 'failed'
        else 'pending'
      end,
      sent_at = case
        when exists (
          select 1 from public.lead_messages message
          where message.lead_id = reminder.lead_id
            and message.raw_payload @> '{"automated_follow_up": true}'::jsonb
        ) then coalesce(reminder.sent_at, now())
        else reminder.sent_at
      end,
      last_error = case when reminder.attempts >= 3 then 'El proceso agotó sus reintentos' else 'Proceso recuperado después de una interrupción' end
  where reminder.status = 'processing'
    and reminder.claimed_at < now() - interval '15 minutes';

  return query
  with due as (
    select reminder.id
    from public.whatsapp_follow_up_reminders reminder
    join public.leads lead on lead.id = reminder.lead_id
    where reminder.status = 'pending'
      and reminder.due_at <= now()
      and reminder.due_at > now() - interval '22 hours'
      and coalesce(lead.do_not_contact, false) = false
      and lead.qualification_status::text <> 'unqualified'
      and (now() at time zone 'America/Argentina/Buenos_Aires')::time >= time '09:00'
      and (now() at time zone 'America/Argentina/Buenos_Aires')::time < time '20:00'
      and not exists (
        select 1 from public.whatsapp_conversation_controls control
        where control.lead_id = reminder.lead_id and control.mode = 'human'
      )
      and not exists (
        select 1 from public.lead_messages message
        where message.lead_id = reminder.lead_id
          and message.direction = 'inbound'
          and message.id <> reminder.first_inbound_message_id
      )
      and not exists (
        select 1 from public.lead_messages message
        where message.lead_id = reminder.lead_id and message.origin = 'human'
      )
      and not exists (
        select 1 from public.lead_messages message
        where message.lead_id = reminder.lead_id
          and message.raw_payload @> '{"automated_follow_up": true}'::jsonb
      )
    order by reminder.due_at, reminder.id
    for update of reminder skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), claimed as (
    update public.whatsapp_follow_up_reminders reminder
    set status = 'processing', claimed_at = now(), attempts = reminder.attempts + 1, last_error = ''
    from due
    where reminder.id = due.id
    returning reminder.id, reminder.lead_id, reminder.attempts
  )
  select claimed.id, claimed.lead_id, lead.customer_phone, coalesce(lead.model_interest, ''), claimed.attempts
  from claimed
  join public.leads lead on lead.id = claimed.lead_id;
end;
$$;

revoke all on function public.claim_due_whatsapp_follow_up_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_whatsapp_follow_up_reminders(integer) to service_role;

alter table public.whatsapp_follow_up_reminders enable row level security;
alter table public.whatsapp_automation_settings enable row level security;

create policy whatsapp_follow_up_reminders_management_read
on public.whatsapp_follow_up_reminders for select to authenticated
using (private.current_user_is_management());

revoke all on public.whatsapp_follow_up_reminders, public.whatsapp_automation_settings from public, anon, authenticated;
grant select on public.whatsapp_follow_up_reminders to authenticated;
grant all on public.whatsapp_follow_up_reminders to service_role;
grant select on public.whatsapp_automation_settings to service_role;

select cron.schedule(
  'whatsapp-unanswered-follow-up',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/whatsapp-follow-up-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_reminder_cron_secret')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);
