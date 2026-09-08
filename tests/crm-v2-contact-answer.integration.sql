-- Run only against an isolated Supabase test database after all migrations.
-- The surrounding test runner must wrap this fixture in a transaction and roll it back.

create or replace function pg_temp.assert_true(p_value boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_value, false) then raise exception 'CRM V2 E2E assertion failed: %', p_message; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('9e330000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'crm-v2-answer-seller@example.invalid', '{}', '{}', now(), now());
insert into public.profiles (user_id, email, role, seller_code, full_name, active)
values ('9e330000-0000-4000-8000-000000000101', 'crm-v2-answer-seller@example.invalid', 'seller', 'E2E-V2-ANSWER', 'Vendedor CRM V2 E2E', true);

insert into public.customers (id, normalized_phone, primary_phone, full_name)
values
  ('9e330000-0000-4000-8000-000000000201', '5491100001201', '5491100001201', 'E2E En gestión'),
  ('9e330000-0000-4000-8000-000000000202', '5491100001202', '5491100001202', 'E2E Contacto futuro'),
  ('9e330000-0000-4000-8000-000000000203', '5491100001203', '5491100001203', 'E2E Rollback'),
  ('9e330000-0000-4000-8000-000000000204', '5491100001204', '5491100001204', 'E2E Inválido');
insert into public.leads (
  id, customer_id, customer_phone, customer_name, source_channel, qualification_status,
  routing_status, routing_reason, assigned_seller_user_id, assigned_by_user_id, assigned_at
)
values
  ('9e330000-0000-4000-8000-000000000301', '9e330000-0000-4000-8000-000000000201', '5491100001201', 'E2E En gestión', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now()),
  ('9e330000-0000-4000-8000-000000000302', '9e330000-0000-4000-8000-000000000202', '5491100001202', 'E2E Contacto futuro', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now()),
  ('9e330000-0000-4000-8000-000000000303', '9e330000-0000-4000-8000-000000000203', '5491100001203', 'E2E Rollback', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now()),
  ('9e330000-0000-4000-8000-000000000304', '9e330000-0000-4000-8000-000000000204', '5491100001204', 'E2E Inválido', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now());
update public.lead_crm set status = 'no_contesta' where lead_id in (
  '9e330000-0000-4000-8000-000000000301', '9e330000-0000-4000-8000-000000000302',
  '9e330000-0000-4000-8000-000000000303', '9e330000-0000-4000-8000-000000000304'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000101', true);
select public.record_contact_answer_with_transition(
  (select id from public.lead_contact_tasks where lead_id = '9e330000-0000-4000-8000-000000000301' and status = 'pending'),
  'en_proceso', 'Contestó; continuar propuesta', now() + interval '1 day', 'Enviar propuesta ajustada',
  'answered', null, '', null, 'normal', now() - interval '2 minutes'
);
reset role;

select pg_temp.assert_true((select status = 'en_proceso' and next_contact_at is not null and next_contact_source = 'manual'
  and last_contact_outcome = 'answered' from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'),
  'Sin contacto -> En gestión must apply the final state with its manual next contact');
select pg_temp.assert_true((select status = 'completed' and outcome = 'answered' and performed_at is not null and recorded_at is not null
  from public.lead_contact_tasks where lead_id = '9e330000-0000-4000-8000-000000000301' and completed_by is not null),
  'answered task must preserve performed_at and recorded_at');
select pg_temp.assert_true(not exists (select 1 from public.lead_contact_tasks
  where lead_id = '9e330000-0000-4000-8000-000000000301' and status in ('pending', 'scheduled')),
  'remaining protocol tasks must be cancelled');

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000101', true);
select public.record_contact_answer_with_transition(
  (select id from public.lead_contact_tasks where lead_id = '9e330000-0000-4000-8000-000000000302' and status = 'pending'),
  'contacto_futuro', 'Pidió contacto futuro', now() + interval '2 days', 'Llamar cuando tenga disponibilidad',
  'answered', null, '', null, 'normal', now()
);
reset role;
select pg_temp.assert_true((select status = 'contacto_futuro' and next_contact_at > now() and next_contact_source = 'manual'
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000302'),
  'Sin contacto -> Pide contacto futuro must succeed without an intermediate state');

-- A failing final transition is one failed RPC statement: PostgreSQL rolls back
-- every task/protocol mutation performed inside it.
do $$
declare v_task uuid;
begin
  select id into v_task from public.lead_contact_tasks
  where lead_id = '9e330000-0000-4000-8000-000000000303' and status = 'pending';
  perform set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000101', true);
  begin
    perform public.record_contact_answer_with_transition(v_task, 'en_proceso', 'Sin fecha', null);
    raise exception 'Expected En gestión validation failure';
  exception when others then
    if sqlerrm <> 'En gestión requiere un próximo contacto con fecha y hora' then raise; end if;
  end;
  perform pg_temp.assert_true((select status = 'pending' and outcome = '' and performed_at is null and recorded_at is null
    from public.lead_contact_tasks where id = v_task), 'failed final transition must roll back the answered attempt');
  perform pg_temp.assert_true((select status = 'no_contesta' from public.lead_crm
    where lead_id = '9e330000-0000-4000-8000-000000000303'), 'failed final transition must leave Sin contacto observable');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000101', true);
select public.record_contact_task_result(
  (select id from public.lead_contact_tasks where lead_id = '9e330000-0000-4000-8000-000000000304' and status = 'pending'),
  'invalid', 'Dato erróneo', now()
);
reset role;
select pg_temp.assert_true((select status = 'invalido' from public.lead_crm
  where lead_id = '9e330000-0000-4000-8000-000000000304'), 'Inválido must remain available from Sin contacto');
