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
  ('9e330000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'crm-v2-answer-seller@example.invalid', '{}', '{}', now(), now()),
  ('9e330000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'crm-v2-answer-supervisor@example.invalid', '{}', '{}', now(), now());
insert into public.profiles (user_id, email, role, seller_code, full_name, active)
values
  ('9e330000-0000-4000-8000-000000000101', 'crm-v2-answer-seller@example.invalid', 'seller', 'E2E-V2-ANSWER', 'Vendedor CRM V2 E2E', true),
  ('9e330000-0000-4000-8000-000000000102', 'crm-v2-answer-supervisor@example.invalid', 'supervisor', 'E2E-V2-SUP', 'Supervisor CRM V2 E2E', true);

insert into public.customers (id, normalized_phone, primary_phone, full_name)
values
  ('9e330000-0000-4000-8000-000000000201', '5491100001201', '5491100001201', 'E2E En gestión'),
  ('9e330000-0000-4000-8000-000000000202', '5491100001202', '5491100001202', 'E2E Contacto futuro'),
  ('9e330000-0000-4000-8000-000000000203', '5491100001203', '5491100001203', 'E2E Rollback'),
  ('9e330000-0000-4000-8000-000000000204', '5491100001204', '5491100001204', 'E2E Inválido'),
  ('9e330000-0000-4000-8000-000000000205', '5491100001205', '5491100001205', 'E2E Venta');
insert into public.leads (
  id, customer_id, customer_phone, customer_name, source_channel, qualification_status,
  routing_status, routing_reason, assigned_seller_user_id, assigned_by_user_id, assigned_at
)
values
  ('9e330000-0000-4000-8000-000000000301', '9e330000-0000-4000-8000-000000000201', '5491100001201', 'E2E En gestión', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now()),
  ('9e330000-0000-4000-8000-000000000302', '9e330000-0000-4000-8000-000000000202', '5491100001202', 'E2E Contacto futuro', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now()),
  ('9e330000-0000-4000-8000-000000000303', '9e330000-0000-4000-8000-000000000203', '5491100001203', 'E2E Rollback', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now()),
  ('9e330000-0000-4000-8000-000000000304', '9e330000-0000-4000-8000-000000000204', '5491100001204', 'E2E Inválido', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now()),
  ('9e330000-0000-4000-8000-000000000305', '9e330000-0000-4000-8000-000000000205', '5491100001205', 'E2E Venta', 'manual', 'qualified', 'assigned_manual', 'crm_v2_e2e', '9e330000-0000-4000-8000-000000000101', '9e330000-0000-4000-8000-000000000101', now());
update public.lead_crm set status = 'no_contesta' where lead_id in (
  '9e330000-0000-4000-8000-000000000301', '9e330000-0000-4000-8000-000000000302',
  '9e330000-0000-4000-8000-000000000303', '9e330000-0000-4000-8000-000000000304',
  '9e330000-0000-4000-8000-000000000305'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000101', true);
select public.record_contact_answer_with_transition(
  (select id from public.lead_contact_tasks where lead_id = '9e330000-0000-4000-8000-000000000301' and status = 'pending'),
  'en_proceso', 'Contestó; continuar propuesta', now() + interval '1 day', 'Enviar propuesta ajustada',
  'answered', null, '', null, 'normal', now() - interval '2 minutes'
);
reset role;

-- Seña -> Venta reuses the existing request/review/Admin circuit and never
-- demotes Seña while the request is pending.
set local role authenticated;
select set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000101', true);
select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000305', p_status => 'en_proceso', p_note => 'Gestión activa', p_next_contact_at => now() + interval '1 day');
select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000305', p_status => 'cierre', p_note => 'Propuesta final', p_next_contact_at => now() + interval '1 day');
select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000305', p_status => 'sena', p_note => 'Seña venta', p_next_contact_at => now() + interval '1 day', p_deposit_amount => 300000);
select public.request_lead_sale_v2('9e330000-0000-4000-8000-000000000305', 'Vehículo E2E', 10000000, 'Enviar a Administración', null);
select pg_temp.assert_true((select status = 'sena' and sale_confirmation_status = 'pending' from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000305'), 'pending sale request must preserve Seña');
select set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000102', true);
select public.review_lead_sale((select id from public.lead_sale_requests where lead_id = '9e330000-0000-4000-8000-000000000305' and status = 'pending'), true, 'Venta aprobada E2E');
select pg_temp.assert_true((select status = 'venta' and sale_confirmation_status = 'confirmed' from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000305'), 'Seña -> Venta must succeed through approval');
select pg_temp.assert_true(exists (select 1 from public.sales_cases where lead_id = '9e330000-0000-4000-8000-000000000305'), 'Venta must enter the existing Administration circuit');
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

-- Remaining CRM V2 workspaces: operational interview events stay inside
-- Entrevista, while commercial results use the canonical transition RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', '9e330000-0000-4000-8000-000000000101', true);
select public.record_lead_follow_up(
  p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'entrevista',
  p_note => 'Revisar propuesta final', p_interview_at => now() + interval '2 days',
  p_interview_location => 'Salón central', p_priority => 'normal',
  p_interview_mode => 'presencial', p_interview_operational_status => 'scheduled'
);
select public.record_interview_operation('9e330000-0000-4000-8000-000000000301', 'confirmed', now() + interval '2 days', 'presencial', 'Asistencia confirmada', 'Salón central');
select pg_temp.assert_true((select status = 'entrevista' and interview_operational_status = 'confirmed'
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'confirmed interview must remain Entrevista');
select public.record_interview_operation('9e330000-0000-4000-8000-000000000301', 'rescheduled', now() + interval '3 days', 'videollamada', 'Revisar propuesta reprogramada', 'Meet');
select pg_temp.assert_true((select status = 'entrevista' and interview_operational_status = 'rescheduled' and interview_mode = 'videollamada'
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'rescheduled interview must remain Entrevista');
select public.record_interview_operation('9e330000-0000-4000-8000-000000000301', 'no_show', now() - interval '1 minute', 'videollamada', 'Cliente no ingresó', 'Meet');
select pg_temp.assert_true((select status = 'entrevista' and interview_operational_status = 'no_show'
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'no-show must not change the commercial status');
do $$
begin
  begin
    perform public.record_interview_operation('9e330000-0000-4000-8000-000000000301', 'completed', now(), 'videollamada', 'Intento sin resultado comercial', 'Meet');
    raise exception 'Expected completed interview rejection';
  exception when others then if sqlerrm = 'Expected completed interview rejection' then raise; end if; end;
end;
$$;

select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'cierre',
  p_note => 'Resolver objeción final', p_next_contact_at => now() + interval '1 day', p_priority => 'high');
select pg_temp.assert_true((select status = 'cierre' and interview_operational_status = 'completed'
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'Entrevista -> Cierre must complete the interview');
select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'entrevista',
  p_note => 'Nueva entrevista de definición', p_interview_at => now() + interval '2 days', p_interview_mode => 'presencial');
select pg_temp.assert_true((select status = 'entrevista' from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'Cierre -> Entrevista must be allowed');
select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'en_proceso',
  p_note => 'Retomar gestión', p_next_contact_at => now() + interval '1 day');
select pg_temp.assert_true((select status = 'en_proceso' from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'Entrevista -> En Gestión must be allowed');
select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'cierre',
  p_note => 'Decisión final', p_next_contact_at => now() + interval '1 day');
select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'sena',
  p_note => 'Seña recibida', p_next_contact_at => now() + interval '1 day', p_deposit_amount => 250000,
  p_deposit_validation => 'Transferencia validada');
select pg_temp.assert_true((select status = 'sena' and deposit_amount = 250000 and deposit_at is not null
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'Cierre -> Seña must preserve amount and date');
select public.record_post_deposit_interview('9e330000-0000-4000-8000-000000000301', 'scheduled', now() + interval '2 days', 'presencial', 'Firma posterior');
select pg_temp.assert_true((select status = 'sena' and post_deposit_action_status = 'scheduled'
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'post-deposit interview must not change Seña');

-- Invalid backward transitions fail and leave Seña intact.
do $$
begin
  begin
    perform public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'cierre', p_note => 'No permitido', p_next_contact_at => now() + interval '1 day');
    raise exception 'Expected Seña -> Cierre rejection';
  exception when others then if sqlerrm = 'Expected Seña -> Cierre rejection' then raise; end if; end;
  begin
    perform public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'en_proceso', p_note => 'No permitido', p_next_contact_at => now() + interval '1 day');
    raise exception 'Expected Seña -> En Gestión rejection';
  exception when others then if sqlerrm = 'Expected Seña -> En Gestión rejection' then raise; end if; end;
  perform pg_temp.assert_true((select status = 'sena' from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'rejected transitions must preserve Seña');
end;
$$;

select public.record_lead_follow_up(p_lead_id => '9e330000-0000-4000-8000-000000000301', p_status => 'desistir', p_note => 'Operación caída post-seña');
select pg_temp.assert_true((select status = 'desistir' and deposit_amount = 250000 and deposit_at is not null and previous_status = 'sena'
  from public.lead_crm where lead_id = '9e330000-0000-4000-8000-000000000301'), 'Seña -> Desistir must preserve deposit amount and date');
reset role;
