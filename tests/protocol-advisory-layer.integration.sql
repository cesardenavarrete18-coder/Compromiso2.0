-- Run only against the isolated Supabase project. The caller prepends the
-- protocol_advisory_layer migration and wraps this script in one transaction.

create or replace function pg_temp.assert_true(p_value boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_value, false) then raise exception 'E2E assertion failed: %', p_message; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('9e320000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'protocol-supervisor-e2e@example.invalid', '{}', '{}', now(), now()),
  ('9e320000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'protocol-seller-a-e2e@example.invalid', '{}', '{}', now(), now()),
  ('9e320000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'protocol-seller-b-e2e@example.invalid', '{}', '{}', now(), now());

insert into public.profiles (user_id, email, role, seller_code, full_name, active)
values
  ('9e320000-0000-4000-8000-000000000101', 'protocol-supervisor-e2e@example.invalid', 'supervisor', 'E2E-PROTO-S', 'Supervisor Protocolo E2E', true),
  ('9e320000-0000-4000-8000-000000000102', 'protocol-seller-a-e2e@example.invalid', 'seller', 'E2E-PROTO-A', 'Vendedor Protocolo A', true),
  ('9e320000-0000-4000-8000-000000000103', 'protocol-seller-b-e2e@example.invalid', 'seller', 'E2E-PROTO-B', 'Vendedor Protocolo B', true);

insert into public.seller_routing_settings (seller_user_id, daily_quota, paused, updated_by)
values
  ('9e320000-0000-4000-8000-000000000102', 20, false, '9e320000-0000-4000-8000-000000000101'),
  ('9e320000-0000-4000-8000-000000000103', 20, false, '9e320000-0000-4000-8000-000000000101')
on conflict (seller_user_id) do update set paused = false, updated_by = excluded.updated_by;

insert into public.customers (id, normalized_phone, primary_phone, full_name)
values
  ('9e320000-0000-4000-8000-000000000201', '5491100000201', '5491100000201', 'Cliente Protocolo 1'),
  ('9e320000-0000-4000-8000-000000000202', '5491100000202', '5491100000202', 'Cliente Protocolo 2'),
  ('9e320000-0000-4000-8000-000000000203', '5491100000203', '5491100000203', 'Cliente Protocolo 3'),
  ('9e320000-0000-4000-8000-000000000204', '5491100000204', '5491100000204', 'Cliente Protocolo 4');

insert into public.leads (
  id, customer_id, customer_phone, customer_name, source_channel, qualification_status,
  routing_status, routing_reason, assigned_seller_user_id, assigned_by_user_id, assigned_at
)
values
  ('9e320000-0000-4000-8000-000000000301', '9e320000-0000-4000-8000-000000000201', '5491100000201', 'Cliente Protocolo 1', 'manual', 'qualified', 'assigned_manual', 'protocol_e2e', '9e320000-0000-4000-8000-000000000102', '9e320000-0000-4000-8000-000000000101', now()),
  ('9e320000-0000-4000-8000-000000000302', '9e320000-0000-4000-8000-000000000202', '5491100000202', 'Cliente Protocolo 2', 'manual', 'qualified', 'assigned_manual', 'protocol_e2e', '9e320000-0000-4000-8000-000000000102', '9e320000-0000-4000-8000-000000000101', now()),
  ('9e320000-0000-4000-8000-000000000303', '9e320000-0000-4000-8000-000000000203', '5491100000203', 'Cliente Protocolo 3', 'manual', 'qualified', 'assigned_manual', 'protocol_e2e', '9e320000-0000-4000-8000-000000000102', '9e320000-0000-4000-8000-000000000101', now()),
  ('9e320000-0000-4000-8000-000000000304', '9e320000-0000-4000-8000-000000000204', '5491100000204', 'Cliente Protocolo 4', 'manual', 'qualified', 'assigned_manual', 'protocol_e2e', '9e320000-0000-4000-8000-000000000102', '9e320000-0000-4000-8000-000000000101', now());

select pg_temp.assert_true(
  (select count(*) = 4 from public.lead_contact_sequences where lead_id in (
    '9e320000-0000-4000-8000-000000000301', '9e320000-0000-4000-8000-000000000302',
    '9e320000-0000-4000-8000-000000000303', '9e320000-0000-4000-8000-000000000304'
  ) and status = 'active'),
  'four assigned Leads must get an active protocol'
);

select pg_temp.assert_true(
  (select count(*) = 4 from public.lead_contact_tasks where lead_id in (
    '9e320000-0000-4000-8000-000000000301', '9e320000-0000-4000-8000-000000000302',
    '9e320000-0000-4000-8000-000000000303', '9e320000-0000-4000-8000-000000000304'
  ) and status = 'pending'),
  'each new protocol must have one pending recommendation'
);

select pg_temp.assert_true(
  (select count(*) = 28 from public.lead_contact_tasks where lead_id in (
    '9e320000-0000-4000-8000-000000000301', '9e320000-0000-4000-8000-000000000302',
    '9e320000-0000-4000-8000-000000000303', '9e320000-0000-4000-8000-000000000304'
  ) and status = 'scheduled'),
  'each new protocol must have seven scheduled recommendations'
);

select pg_temp.assert_true(
  (select count(*) = 4 from public.lead_crm where lead_id in (
    '9e320000-0000-4000-8000-000000000301', '9e320000-0000-4000-8000-000000000302',
    '9e320000-0000-4000-8000-000000000303', '9e320000-0000-4000-8000-000000000304'
  ) and next_contact_at is null and next_contact_source is null),
  'protocol creation must not write the commercial agenda'
);

update public.lead_contact_tasks
set due_start = now() - interval '5 minutes', due_end = now() + interval '1 hour'
where lead_id = '9e320000-0000-4000-8000-000000000301' and status = 'pending';

select pg_temp.assert_true(
  (select next_contact_at is null from public.lead_crm where lead_id = '9e320000-0000-4000-8000-000000000301'),
  'an overdue recommendation must not become an overdue agenda action'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000102', true);
select public.complete_contact_task(
  (select id from public.lead_contact_tasks where lead_id = '9e320000-0000-4000-8000-000000000301' and status = 'pending'),
  'no_answer', 'No respondió en prueba aislada'
);
reset role;

select pg_temp.assert_true(
  (select status = 'no_contesta' and next_contact_at is null and next_contact_source is null
   from public.lead_crm where lead_id = '9e320000-0000-4000-8000-000000000301'),
  'no_answer must update CRM outcome without creating agenda'
);
select pg_temp.assert_true(
  (select channel = 'whatsapp' and message_step = 1
   from public.lead_contact_tasks where lead_id = '9e320000-0000-4000-8000-000000000301' and status = 'pending'),
  'call 1 no_answer must promote WhatsApp 1'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000102', true);
select public.complete_contact_task(
  (select id from public.lead_contact_tasks where lead_id = '9e320000-0000-4000-8000-000000000301' and status = 'pending'),
  'sent', 'WhatsApp enviado en prueba aislada'
);
reset role;

select pg_temp.assert_true(
  (select channel = 'call' and call_attempt = 2
   from public.lead_contact_tasks where lead_id = '9e320000-0000-4000-8000-000000000301' and status = 'pending'),
  'WhatsApp 1 must promote call 2'
);
select pg_temp.assert_true(
  (select next_contact_at is null and next_contact_source is null
   from public.lead_crm where lead_id = '9e320000-0000-4000-8000-000000000301'),
  'WhatsApp sent must not create agenda'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000102', true);
select public.complete_contact_task_with_follow_up(
  (select id from public.lead_contact_tasks where lead_id = '9e320000-0000-4000-8000-000000000301' and status = 'pending'),
  'answered', 'Pidió volver a hablar mañana', now() + interval '1 day', 'Pidió volver a hablar mañana'
);
reset role;

select pg_temp.assert_true(
  (select status = 'en_proceso' and next_contact_source = 'manual'
     and next_contact_note = 'Pidió volver a hablar mañana'
   from public.lead_crm where lead_id = '9e320000-0000-4000-8000-000000000301'),
  'answered with follow-up must create the manual agenda'
);
select pg_temp.assert_true(
  not exists (select 1 from public.lead_contact_sequences where lead_id = '9e320000-0000-4000-8000-000000000301' and status = 'active'),
  'answered must cancel the remaining protocol'
);
select pg_temp.assert_true(
  exists (select 1 from public.lead_activities where lead_id = '9e320000-0000-4000-8000-000000000301'
    and detail = 'Pidió volver a hablar mañana' and metadata->>'outcome' = 'answered'),
  'answered comment must remain in history'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000102', true);
select public.record_lead_follow_up(
  '9e320000-0000-4000-8000-000000000302', 'no_contesta', 'Reintentar mañana',
  now() + interval '1 day', 'Reintentar mañana', 'no_answer', null, '', null, 'normal'
);
reset role;

select pg_temp.assert_true(
  (select next_contact_source = 'manual' and next_contact_note = 'Reintentar mañana'
   from public.lead_crm where lead_id = '9e320000-0000-4000-8000-000000000302'),
  'manual management must own the commercial agenda'
);
select pg_temp.assert_true(
  not exists (select 1 from public.lead_contact_sequences where lead_id = '9e320000-0000-4000-8000-000000000302' and status = 'active'),
  'manual management must cancel the protocol'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000101', true);
select public.reassign_leads_to_seller(
  array['9e320000-0000-4000-8000-000000000302'::uuid],
  '9e320000-0000-4000-8000-000000000103', 'Validar preservación de agenda manual'
);
reset role;

select pg_temp.assert_true(
  (select assigned_seller_user_id = '9e320000-0000-4000-8000-000000000103'
   from public.leads where id = '9e320000-0000-4000-8000-000000000302'),
  'manual Lead must be reassigned to seller B'
);
select pg_temp.assert_true(
  (select next_contact_source = 'manual' and next_contact_note = 'Reintentar mañana'
   from public.lead_crm where lead_id = '9e320000-0000-4000-8000-000000000302'),
  'reassignment must preserve the human-agreed action'
);
select pg_temp.assert_true(
  not exists (select 1 from public.lead_contact_sequences where lead_id = '9e320000-0000-4000-8000-000000000302' and status = 'active'),
  'reassignment must not start a protocol beside manual agenda'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000101', true);
select public.reassign_leads_to_seller(
  array['9e320000-0000-4000-8000-000000000303'::uuid],
  '9e320000-0000-4000-8000-000000000103', 'Validar reinicio recomendado sin agenda'
);
reset role;

select pg_temp.assert_true(
  (select count(*) = 1 from public.lead_contact_sequences where lead_id = '9e320000-0000-4000-8000-000000000303' and status = 'active'),
  'reassignment without manual agenda must start one protocol'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.lead_contact_tasks where lead_id = '9e320000-0000-4000-8000-000000000303' and status = 'pending'),
  'reassigned protocol must have one pending recommendation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000103', true);
do $$
begin
  perform public.restart_lead_contact_sequence('9e320000-0000-4000-8000-000000000302');
  raise exception 'manual restart unexpectedly succeeded';
exception when others then
  if sqlerrm = 'manual restart unexpectedly succeeded' or sqlerrm not like '%próxima acción manual%' then raise; end if;
end;
$$;
select public.restart_lead_contact_sequence('9e320000-0000-4000-8000-000000000303');
reset role;

select pg_temp.assert_true(
  (select count(*) = 1 from public.lead_contact_sequences where lead_id = '9e320000-0000-4000-8000-000000000303' and status = 'active'),
  'restart must leave exactly one active sequence'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.lead_contact_tasks where lead_id = '9e320000-0000-4000-8000-000000000303' and status = 'pending'),
  'restart must leave exactly one pending recommendation'
);
select pg_temp.assert_true(
  (select next_contact_at is null and next_contact_source is null
   from public.lead_crm where lead_id = '9e320000-0000-4000-8000-000000000303'),
  'restart must not write CRM agenda'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000102', true);
select public.record_lead_follow_up(
  '9e320000-0000-4000-8000-000000000304', 'en_proceso', 'Contacto efectivo sin próxima acción',
  null, '', 'answered', null, '', null, 'normal'
);
reset role;

select pg_temp.assert_true(
  not exists (select 1 from public.lead_contact_sequences where lead_id = '9e320000-0000-4000-8000-000000000304' and status = 'active'),
  'En proceso must cancel protocol recommendations'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000101', true);
select pg_temp.assert_true(
  exists (select 1 from public.get_supervisor_portfolio_followup()
    where lead_id = '9e320000-0000-4000-8000-000000000303'
      and next_task_id is not null and next_task_due_start is not null),
  'Supervisor must receive protocol recommendation independently from CRM agenda'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000102', true);
select pg_temp.assert_true(
  (select count(*) = 2 from public.leads where id in (
    '9e320000-0000-4000-8000-000000000301', '9e320000-0000-4000-8000-000000000302',
    '9e320000-0000-4000-8000-000000000303', '9e320000-0000-4000-8000-000000000304'
  )),
  'seller A RLS must expose only Leads 1 and 4'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e320000-0000-4000-8000-000000000103', true);
select pg_temp.assert_true(
  (select count(*) = 2 from public.leads where id in (
    '9e320000-0000-4000-8000-000000000301', '9e320000-0000-4000-8000-000000000302',
    '9e320000-0000-4000-8000-000000000303', '9e320000-0000-4000-8000-000000000304'
  )),
  'seller B RLS must expose only Leads 2 and 3'
);
reset role;

select jsonb_build_object(
  'new_protocol', 'PASS',
  'overdue_recommendation_without_agenda', 'PASS',
  'no_answer', 'PASS',
  'whatsapp', 'PASS',
  'answered_manual_follow_up', 'PASS',
  'manual_management', 'PASS',
  'reassignment', 'PASS',
  'restart', 'PASS',
  'incompatible_status', 'PASS',
  'supervisor_context', 'PASS',
  'seller_rls_a_b', 'PASS'
) as integration_result;
