-- Manual next actions must always win over protocol exhaustion.
-- Isolated validation fixture; always rolls back.

begin;

do $$
declare
  v_seller uuid := (select user_id from public.profiles limit 1);
  v_customer uuid := (select id from public.customers limit 1);
  v_lead uuid := gen_random_uuid();
  v_sequence uuid := gen_random_uuid();
  v_completed timestamptz := now() - interval '2 days';
  v_status text;
  i integer;
begin
  if v_seller is null or v_customer is null then
    raise exception 'Fixture requires at least one profile and customer';
  end if;

  insert into public.leads (id, customer_id, customer_phone, customer_name)
  values (v_lead, v_customer, '+54911' || right(replace(v_lead::text, '-', ''), 10), 'Manual action fixture');

  update public.lead_crm
  set status = 'no_contesta',
      next_contact_at = now() + interval '1 day',
      next_contact_note = 'Acordado con cliente'
  where lead_id = v_lead;

  insert into public.lead_contact_sequences (id, lead_id, seller_user_id, status, started_at, completed_at)
  values (v_sequence, v_lead, v_seller, 'completed', v_completed - interval '3 days', v_completed);

  for i in 1..6 loop
    insert into public.lead_contact_tasks (
      sequence_id, lead_id, seller_user_id, sequence_order, channel,
      call_attempt, due_start, due_end, status, outcome, completed_at
    ) values (
      v_sequence, v_lead, v_seller, i, 'call', i,
      v_completed - interval '4 days', v_completed - interval '3 days',
      'skipped', 'skipped', v_completed
    );
  end loop;

  insert into public.lead_contact_tasks (
    sequence_id, lead_id, seller_user_id, sequence_order, channel,
    message_step, due_start, due_end, status, outcome, completed_at
  ) values
    (v_sequence, v_lead, v_seller, 7, 'whatsapp', 1, v_completed - interval '3 days', v_completed - interval '3 days' + interval '1 hour', 'skipped', 'skipped', v_completed),
    (v_sequence, v_lead, v_seller, 8, 'whatsapp', 2, v_completed - interval '2 days', v_completed - interval '2 days' + interval '1 hour', 'skipped', 'skipped', v_completed);

  if private.classify_exhausted_contact_protocol(v_lead, v_sequence, 'integration_test') then
    raise exception 'Lead with manual next action was incorrectly classified';
  end if;

  select status into v_status from public.lead_crm where lead_id = v_lead;
  if v_status <> 'no_contesta' then
    raise exception 'Manual action status was changed: %', v_status;
  end if;
end;
$$;

rollback;
