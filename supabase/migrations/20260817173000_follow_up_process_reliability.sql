-- Make the commercial follow-up process safe to complete and keep messages
-- inside reasonable contact hours in Argentina.

create or replace function private.create_lead_contact_sequence(
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
  v_message_one_start timestamptz;
  v_message_two_start timestamptz;
  v_message_three_start timestamptz;
  v_message_four_start timestamptz;
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

  -- The first WhatsApp is immediate only during the commercial day. Leads
  -- assigned overnight wait until 09:30 of the next valid business day.
  if v_day_one <> v_local::date or v_local::time < time '09:30' then
    v_message_one_start := (v_day_one + time '09:30') at time zone 'America/Argentina/Buenos_Aires';
  else
    v_message_one_start := p_started_at;
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
  v_message_two_start := case
    when (v_call_one_end at time zone 'America/Argentina/Buenos_Aires')::time >= time '19:00' then v_call_one_end
    else v_call_one_end + interval '15 minutes'
  end;
  v_message_three_start := case
    when (v_call_two_end at time zone 'America/Argentina/Buenos_Aires')::time >= time '19:00' then v_call_two_end
    else v_call_two_end + interval '15 minutes'
  end;
  v_message_four_start := case
    when (v_call_three_end at time zone 'America/Argentina/Buenos_Aires')::time >= time '19:00' then v_call_three_end
    else v_call_three_end + interval '15 minutes'
  end;

  insert into public.lead_contact_sequences (lead_id, seller_user_id, started_at)
  values (p_lead_id, p_seller_user_id, p_started_at)
  returning id into v_sequence_id;

  insert into public.lead_contact_tasks (
    sequence_id, lead_id, seller_user_id, sequence_order, channel,
    call_attempt, message_step, template_id, due_start, due_end
  ) values
    (v_sequence_id, p_lead_id, p_seller_user_id, 1, 'whatsapp', null, 1,
      (select id from public.contact_message_templates where step_number = 1),
      v_message_one_start, v_message_one_start + interval '2 hours'),
    (v_sequence_id, p_lead_id, p_seller_user_id, 2, 'call', 1, null, null,
      v_call_one_start, v_call_one_end),
    (v_sequence_id, p_lead_id, p_seller_user_id, 3, 'whatsapp', null, 2,
      (select id from public.contact_message_templates where step_number = 2),
      v_message_two_start,
      least(v_message_two_start + interval '2 hours', (v_day_one + time '20:00') at time zone 'America/Argentina/Buenos_Aires')),
    (v_sequence_id, p_lead_id, p_seller_user_id, 4, 'call', 2, null, null,
      v_call_two_start, v_call_two_end),
    (v_sequence_id, p_lead_id, p_seller_user_id, 5, 'whatsapp', null, 3,
      (select id from public.contact_message_templates where step_number = 3),
      v_message_three_start,
      least(v_message_three_start + interval '2 hours', (v_day_two + time '20:00') at time zone 'America/Argentina/Buenos_Aires')),
    (v_sequence_id, p_lead_id, p_seller_user_id, 6, 'call', 3, null, null,
      v_call_three_start, v_call_three_end),
    (v_sequence_id, p_lead_id, p_seller_user_id, 7, 'whatsapp', null, 4,
      (select id from public.contact_message_templates where step_number = 4),
      v_message_four_start,
      least(v_message_four_start + interval '2 hours', (v_day_three + time '20:00') at time zone 'America/Argentina/Buenos_Aires'));

  insert into public.lead_crm (lead_id, priority, next_contact_at, next_contact_note)
  select p_lead_id, priority, v_message_one_start, 'WhatsApp 1 de seguimiento'
  from public.leads where id = p_lead_id
  on conflict (lead_id) do update set
    next_contact_at = excluded.next_contact_at,
    next_contact_note = excluded.next_contact_note,
    updated_at = now();

  return v_sequence_id;
end;
$$;

revoke all on function private.create_lead_contact_sequence(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Unique RPC name: PostgREST does not support overloaded functions reliably.
-- A positive response is committed only together with its next commercial step.
create function public.complete_contact_task_with_follow_up(
  p_task_id uuid,
  p_outcome text,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_lead_id uuid;
begin
  if p_outcome = 'answered' then
    if p_next_contact_at is null or p_next_contact_at <= now() then
      raise exception 'Programá una fecha y hora futura para el próximo contacto';
    end if;
    if char_length(trim(coalesce(p_next_contact_note, ''))) < 3 then
      raise exception 'Indicá el motivo del próximo contacto';
    end if;
  end if;

  v_result := public.complete_contact_task(p_task_id, p_outcome, p_note);
  v_lead_id := (v_result ->> 'lead_id')::uuid;

  if p_outcome = 'answered' then
    update public.lead_crm
    set next_contact_at = p_next_contact_at,
        next_contact_note = trim(p_next_contact_note),
        updated_at = now()
    where lead_id = v_lead_id;

    v_result := v_result || jsonb_build_object(
      'next_due_at', p_next_contact_at,
      'manual_follow_up', true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.complete_contact_task_with_follow_up(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.complete_contact_task_with_follow_up(uuid, text, text, timestamptz, text) to authenticated;

-- Repair only pending first messages that were created outside the commercial
-- day by the previous scheduler. Historical completed/cancelled tasks remain as
-- an audit trail.
with adjusted as (
  select t.id,
    ((private.business_date((t.due_start at time zone 'America/Argentina/Buenos_Aires')::date,
      case when (t.due_start at time zone 'America/Argentina/Buenos_Aires')::time < time '09:30' then 0 else 1 end
    ) + time '09:30') at time zone 'America/Argentina/Buenos_Aires') as new_start
  from public.lead_contact_tasks t
  where t.status in ('pending', 'cancelled')
    and t.sequence_order = 1
    and t.channel = 'whatsapp'
    and t.completed_at is null
    and coalesce(t.outcome, '') = ''
    and (
      (t.due_start at time zone 'America/Argentina/Buenos_Aires')::time < time '09:30'
      or (t.due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '19:00'
    )
)
update public.lead_contact_tasks t
set due_start = a.new_start,
    due_end = a.new_start + interval '2 hours',
    updated_at = now()
from adjusted a
where t.id = a.id;

update public.lead_crm c
set next_contact_at = t.due_start,
    next_contact_note = 'WhatsApp 1 de seguimiento',
    updated_at = now()
from public.lead_contact_tasks t
where t.lead_id = c.lead_id
  and t.status = 'pending'
  and t.sequence_order = 1
  and t.channel = 'whatsapp'
  and c.next_contact_note = 'WhatsApp 1 de seguimiento';

-- Cap legacy unprocessed WhatsApp windows at 20:00. This also makes cancelled
-- sample sequences display the corrected recommendation without erasing them.
update public.lead_contact_tasks t
set due_start = case
      when (t.due_start at time zone 'America/Argentina/Buenos_Aires')::time >= time '19:00'
        then (((t.due_start at time zone 'America/Argentina/Buenos_Aires')::date + time '19:00') at time zone 'America/Argentina/Buenos_Aires')
      else t.due_start
    end,
    due_end = (((t.due_start at time zone 'America/Argentina/Buenos_Aires')::date + time '20:00') at time zone 'America/Argentina/Buenos_Aires'),
    updated_at = now()
where t.channel = 'whatsapp'
  and t.sequence_order > 1
  and t.status in ('pending', 'cancelled')
  and t.completed_at is null
  and coalesce(t.outcome, '') = ''
  and (t.due_end at time zone 'America/Argentina/Buenos_Aires')::time > time '20:00';
