-- Validates the automatic path used by refresh_due_contact_protocols / complete_contact_task.
-- Isolated validation fixture; always rolls back.

begin;

do $$
declare
  v_seller uuid := (select user_id from public.profiles limit 1);
  v_customer uuid := (select id from public.customers limit 1);
  v_lead uuid := gen_random_uuid();
  v_sequence uuid := gen_random_uuid();
  v_completed timestamptz := now() - interval '1 minute';
  v_status text;
  i integer;
begin
  if v_seller is null or v_customer is null then
    raise exception 'Fixture requires at least one profile and customer';
  end if;

  insert into public.leads (id, customer_id, customer_phone, customer_name)
  values (v_lead, v_customer, '+54911' || right(replace(v_lead::text, '-', ''), 10), 'Protocol trigger fixture');

  insert into public.lead_contact_sequences (id, lead_id, seller_user_id, status, started_at)
  values (v_sequence, v_lead, v_seller, 'active', v_completed - interval '3 days');

  for i in 1..6 loop
    insert into public.lead_contact_tasks (
      sequence_id, lead_id, seller_user_id, sequence_order, channel,
      call_attempt, due_start, due_end, status, outcome, completed_at
    ) values (
      v_sequence, v_lead, v_seller, i, 'call', i,
      v_completed - interval '3 days', v_completed - interval '2 days',
      case when i = 1 then 'completed' else 'skipped' end,
      case when i = 1 then 'no_answer' else 'skipped' end,
      v_completed
    );
  end loop;

  insert into public.lead_contact_tasks (
    sequence_id, lead_id, seller_user_id, sequence_order, channel,
    message_step, due_start, due_end, status, outcome, completed_at
  ) values
    (v_sequence, v_lead, v_seller, 7, 'whatsapp', 1, v_completed - interval '2 days', v_completed - interval '2 days' + interval '1 hour', 'completed', 'sent', v_completed),
    (v_sequence, v_lead, v_seller, 8, 'whatsapp', 2, v_completed - interval '1 day', v_completed - interval '1 day' + interval '1 hour', 'skipped', 'skipped', v_completed);

  update public.lead_contact_sequences
  set status = 'completed', completed_at = v_completed
  where id = v_sequence;

  select status into v_status from public.lead_crm where lead_id = v_lead;
  if v_status <> 'desistir' then
    raise exception 'Sequence completion trigger did not move lead to Base fria: %', v_status;
  end if;
end;
$$;

rollback;
