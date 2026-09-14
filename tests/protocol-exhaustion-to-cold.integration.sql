-- Transactional integration coverage for protocol exhaustion -> Base fria.
-- Intended for an isolated Supabase validation database; always rolls back.

begin;

do $$
declare
  v_seller uuid := (select user_id from public.profiles limit 1);
  v_customer uuid := (select id from public.customers limit 1);
  v_lead uuid := gen_random_uuid();
  v_sequence uuid := gen_random_uuid();
  v_completed timestamptz := now() - interval '2 days';
  v_status text;
  v_cold timestamptz;
  v_band text;
  v_day integer;
  i integer;
begin
  if v_seller is null or v_customer is null then
    raise exception 'Fixture requires at least one profile and customer';
  end if;

  insert into public.leads (id, customer_id, customer_phone, customer_name)
  values (
    v_lead,
    v_customer,
    '+54911' || right(replace(v_lead::text, '-', ''), 10),
    'Protocol exhaustion integration fixture'
  );

  insert into public.lead_contact_sequences (
    id, lead_id, seller_user_id, status, started_at, completed_at, stopped_reason
  ) values (
    v_sequence,
    v_lead,
    v_seller,
    'completed',
    v_completed - interval '3 days',
    v_completed,
    'Calendario finalizado con intentos no realizados'
  );

  for i in 1..18 loop
    v_day := ((i - 1) / 6) + 1;
    v_band := case ((i - 1) / 2) % 3
      when 0 then '10-12'
      when 1 then '14-16'
      else '17-19'
    end;

    insert into public.lead_contact_tasks (
      sequence_id, lead_id, seller_user_id, sequence_order, channel,
      call_attempt, due_start, due_end, status, outcome, completed_at,
      protocol_day, protocol_band, band_attempt
    ) values (
      v_sequence, v_lead, v_seller, i, 'call', i,
      v_completed - interval '4 days',
      v_completed - interval '3 days',
      case when i <= 5 then 'completed' else 'skipped' end,
      case when i <= 5 then 'no_answer' else 'skipped' end,
      v_completed, v_day, v_band,
      case when i % 2 = 1 then 1 else 2 end
    );
  end loop;

  insert into public.lead_contact_tasks (
    sequence_id, lead_id, seller_user_id, sequence_order, channel,
    message_step, due_start, due_end, status, outcome, completed_at, protocol_day
  ) values
    (v_sequence, v_lead, v_seller, 19, 'whatsapp', 1,
      v_completed - interval '3 days', v_completed - interval '3 days' + interval '1 hour',
      'completed', 'sent', v_completed, 1),
    (v_sequence, v_lead, v_seller, 20, 'whatsapp', 2,
      v_completed - interval '2 days', v_completed - interval '2 days' + interval '1 hour',
      'skipped', 'skipped', v_completed, 2);

  if not private.classify_exhausted_contact_protocol(v_lead, v_sequence, 'integration_test') then
    raise exception 'Recognized exhausted protocol was not classified';
  end if;

  select status, cold_base_at
    into v_status, v_cold
  from public.lead_crm
  where lead_id = v_lead;

  if v_status <> 'desistir' or v_cold is null then
    raise exception 'Expected Base fria/desistir with cold_base_at, got status=%, cold=%', v_status, v_cold;
  end if;

  if not private.lead_has_canonical_cold_base_evidence(v_lead) then
    raise exception 'Canonical cold-base evidence was not preserved';
  end if;
end;
$$;

rollback;
