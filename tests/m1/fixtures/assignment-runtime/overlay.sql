-- GENERATED from source.json by build.py; TEST FIXTURE ONLY, NOT A MIGRATION.

-- Apply after schema-baseline-b/bootstrap.sql and assignment-boundary/overlay.sql.

-- No application/auth rows, sequence current values, jobs, secrets or provider calls.

BEGIN;

SET LOCAL ROLE postgres;

SET LOCAL search_path = public, extensions;

SET LOCAL check_function_bodies = off;

DO $$ BEGIN IF current_setting('server_version_num')::integer < 170000 THEN RAISE EXCEPTION 'ASSIGNMENT_FIXTURE_REQUIRES_POSTGRES_17'; END IF; END $$;

CREATE TABLE "public"."lead_assignments" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "public"."lead_assignments_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "lead_id" uuid NOT NULL,
  "seller_user_id" uuid,
  "assigned_by_user_id" uuid,
  "assignment_type" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."lead_assignments" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.apply_lead_opt_out(p_lead_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_customer_id uuid;
begin
  select customer_id into v_customer_id from public.leads where id=p_lead_id;
  update public.leads set do_not_contact=true,do_not_contact_at=now(),do_not_contact_reason=coalesce(nullif(trim(p_reason),''),'Solicitud individual') where id=p_lead_id;
  if v_customer_id is not null then update public.customers set do_not_contact=true,do_not_contact_at=now(),do_not_contact_reason=coalesce(nullif(trim(p_reason),''),'Solicitud individual') where id=v_customer_id; end if;
end;
$function$;

ALTER FUNCTION "private"."apply_lead_opt_out"(p_lead_id uuid, p_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.assign_lead_to_seller_with_reason(p_lead_id uuid, p_seller_user_id uuid, p_actor_user_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_previous_seller uuid;
  v_previous_seller_name text;
  v_new_seller_name text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select
    lead.assigned_seller_user_id,
    previous_seller.full_name,
    new_seller.full_name
  into v_previous_seller, v_previous_seller_name, v_new_seller_name
  from public.leads lead
  left join public.profiles previous_seller
    on previous_seller.user_id = lead.assigned_seller_user_id
  join public.profiles new_seller
    on new_seller.user_id = p_seller_user_id
  where lead.id = p_lead_id
  for update of lead;

  if not found then
    raise exception 'No se encontró el Lead';
  end if;
  if v_previous_seller is not distinct from p_seller_user_id then
    raise exception 'El Lead ya está asignado al vendedor seleccionado';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'Indicá un motivo válido para la reasignación';
  end if;

  update public.leads set
    assigned_seller_user_id = p_seller_user_id,
    assigned_by_user_id = p_actor_user_id,
    assigned_at = now(),
    routing_status = 'assigned_manual',
    routing_reason = case
      when v_previous_seller is null then 'supervisor_assignment'
      else 'supervisor_reassignment'
    end
  where id = p_lead_id;

  insert into public.lead_assignments (
    lead_id,
    seller_user_id,
    assigned_by_user_id,
    assignment_type,
    reason
  ) values (
    p_lead_id,
    p_seller_user_id,
    p_actor_user_id,
    case when v_previous_seller is null then 'manual' else 'reassigned' end,
    v_reason
  );

  insert into public.lead_activities (
    lead_id,
    actor_user_id,
    activity_type,
    title,
    detail,
    metadata
  ) values (
    p_lead_id,
    p_actor_user_id,
    'assignment',
    case when v_previous_seller is null then 'Lead asignado a un vendedor' else 'Lead reasignado' end,
    format(
      '%s → %s · Motivo: %s',
      coalesce(v_previous_seller_name, 'Sin vendedor'),
      v_new_seller_name,
      v_reason
    ),
    jsonb_build_object(
      'origin', 'supervisor_portfolio',
      'previous_seller_user_id', v_previous_seller,
      'previous_seller_name', v_previous_seller_name,
      'seller_user_id', p_seller_user_id,
      'seller_name', v_new_seller_name,
      'supervisor_user_id', p_actor_user_id,
      'reason', v_reason
    )
  );
end;
$function$;

ALTER FUNCTION "private"."assign_lead_to_seller_with_reason"(p_lead_id uuid, p_seller_user_id uuid, p_actor_user_id uuid, p_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.crm_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_from
    when 'nuevo' then p_to in ('contacto_futuro','en_proceso','entrevista','cierre','sena','venta','desistir','no_contesta','invalido')
    when 'no_contesta' then p_to in ('contacto_futuro','en_proceso','entrevista','cierre','sena','venta','desistir','no_contesta','invalido')
    when 'contacto_futuro' then p_to in ('contacto_futuro','no_contesta','en_proceso','entrevista','cierre','sena','venta','desistir')
    when 'en_proceso' then p_to in ('en_proceso','entrevista','cierre','sena','venta','desistir')
    when 'entrevista' then p_to in ('en_proceso','entrevista','cierre','sena','venta','desistir')
    when 'cierre' then p_to in ('cierre','entrevista','en_proceso','sena','venta','desistir')
    when 'sena' then p_to in ('sena','venta','desistir')
    when 'venta' then p_to = 'venta'
    else false
  end;
$function$;

ALTER FUNCTION "private"."crm_transition_allowed"(p_from text, p_to text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.sync_protocol_next_action(p_sequence_id uuid, p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_task public.lead_contact_tasks%rowtype;
begin
  select task.* into v_task
  from public.lead_contact_tasks task
  join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
  where task.sequence_id = p_sequence_id
    and task.lead_id = p_lead_id
    and task.status = 'pending'
    and sequence.status = 'active'
  order by task.sequence_order
  limit 1
  for update of task;

  if v_task.id is null then
    select task.* into v_task
    from public.lead_contact_tasks task
    join public.lead_contact_sequences sequence on sequence.id = task.sequence_id
    where task.sequence_id = p_sequence_id
      and task.lead_id = p_lead_id
      and task.status = 'scheduled'
      and sequence.status = 'active'
    order by task.sequence_order
    limit 1
    for update of task;

    if v_task.id is null then return null; end if;

    update public.lead_contact_tasks
    set status = 'pending',
        updated_at = now()
    where id = v_task.id
    returning * into v_task;
  end if;

  return v_task.id;
end;
$function$;

ALTER FUNCTION "private"."sync_protocol_next_action"(p_sequence_id uuid, p_lead_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.assign_lead_to_seller(p_lead_id uuid, p_seller_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if not exists (
    select 1
    from public.profiles
    where user_id = p_seller_user_id
      and role::text = 'seller'
      and active = true
  ) then
    raise exception 'El vendedor seleccionado no está activo';
  end if;

  perform private.assign_lead_to_seller_with_reason(
    p_lead_id,
    p_seller_user_id,
    v_user_id,
    'Asignación individual desde Supervisión'
  );
end;
$function$;

ALTER FUNCTION "public"."assign_lead_to_seller"(p_lead_id uuid, p_seller_user_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.complete_contact_task(p_task_id uuid, p_outcome text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_task public.lead_contact_tasks%rowtype; v_next public.lead_contact_tasks%rowtype; v_next_task_id uuid; v_previous_status text; v_sequence_finished boolean:=false;
begin
 if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
 if p_outcome='answered' then raise exception 'Una respuesta requiere record_contact_answer_with_transition'; end if;
 if p_outcome not in('no_answer','sent','skipped','invalid','no_interest','requested_no_contact') then raise exception 'Resultado de contacto inválido'; end if;
 if char_length(trim(coalesce(p_note,'')))>3000 then raise exception 'El detalle es demasiado extenso'; end if;
 select * into v_task from public.lead_contact_tasks where id=p_task_id for update;
 if v_task.id is null or v_task.status<>'pending' then raise exception 'La tarea ya fue procesada o no existe'; end if;
 if v_task.seller_user_id<>v_user_id and not private.current_user_is_management() then raise exception 'La tarea no corresponde a este vendedor'; end if;
 if v_task.channel='call' and p_outcome='sent' then raise exception 'Resultado incompatible con una llamada'; end if;
 if v_task.channel='whatsapp' and p_outcome='no_answer' then raise exception 'Resultado incompatible con WhatsApp'; end if;
 update public.lead_contact_tasks set status=case when p_outcome='skipped' then 'skipped' else 'completed' end,outcome=p_outcome,note=trim(coalesce(p_note,'')),completed_at=now(),completed_by=v_user_id,updated_at=now() where id=p_task_id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(v_task.lead_id,v_user_id,case when v_task.channel='call' then 'contact' else 'follow_up' end,case when v_task.channel='call' then 'Intento de llamada '||v_task.call_attempt||' registrado' else 'WhatsApp de seguimiento '||v_task.message_step||' registrado' end,trim(coalesce(p_note,'')),jsonb_build_object('task_id',v_task.id,'channel',v_task.channel,'outcome',p_outcome,'call_attempt',v_task.call_attempt,'message_step',v_task.message_step));
 if p_outcome in('invalid','no_interest','requested_no_contact') then
  select status into v_previous_status from public.lead_crm where lead_id=v_task.lead_id for update; if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;
  perform private.cancel_lead_contact_protocol(v_task.lead_id,case p_outcome when 'invalid' then 'Contacto inválido' when 'requested_no_contact' then 'Solicitó no ser contactado' else 'El cliente no desea continuar' end);
  update public.lead_crm set status=case when p_outcome='invalid' then 'invalido' else 'desistir' end,status_reason=coalesce(nullif(trim(p_note),''),case when p_outcome='invalid' then 'Contacto inválido' when p_outcome='requested_no_contact' then 'Solicitó no ser contactado' else 'No desea continuar' end),desist_reason=case when p_outcome='no_interest' then 'no_interest' when p_outcome='requested_no_contact' then 'requested_no_contact' else desist_reason end,next_contact_at=null,next_contact_note='',next_contact_source=null,last_contact_at=now(),last_contact_outcome=p_outcome,cold_base_at=null,previous_status=v_previous_status,terminal_at=now(),updated_by=v_user_id,updated_at=now() where lead_id=v_task.lead_id;
  if p_outcome='requested_no_contact' then perform private.apply_lead_opt_out(v_task.lead_id,trim(coalesce(p_note,''))); end if;
 else
  v_next_task_id:=private.sync_protocol_next_action(v_task.sequence_id,v_task.lead_id);
  if v_next_task_id is null then v_sequence_finished:=true; update public.lead_contact_sequences set status='completed',completed_at=now(),stopped_reason='Protocolo CRM V2 procesado por completo',updated_at=now() where id=v_task.sequence_id;
  else select * into v_next from public.lead_contact_tasks where id=v_next_task_id; update public.lead_crm set status=case when p_outcome='no_answer' and status='nuevo' then 'no_contesta' else status end,last_contact_at=now(),last_contact_outcome=p_outcome,updated_by=v_user_id,updated_at=now() where lead_id=v_task.lead_id; end if;
 end if;
 return jsonb_build_object('lead_id',v_task.lead_id,'sequence_finished',v_sequence_finished,'next_task_id',v_next.id,'next_due_at',v_next.due_start);
end; $function$;

ALTER FUNCTION "public"."complete_contact_task"(p_task_id uuid, p_outcome text, p_note text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.complete_contact_task_with_follow_up(p_task_id uuid, p_outcome text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_outcome = 'answered' then
    raise exception 'Una respuesta requiere record_contact_answer_with_transition';
  end if;
  return public.complete_contact_task(p_task_id, p_outcome, p_note);
end;
$function$;

ALTER FUNCTION "public"."complete_contact_task_with_follow_up"(p_task_id uuid, p_outcome text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.reassign_leads_to_seller(p_lead_ids uuid[], p_seller_user_id uuid, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_reason text := trim(coalesce(p_reason, ''));
  v_expected_count integer;
  v_locked_count integer := 0;
  v_lead record;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 then
    raise exception 'Seleccioná al menos un Lead';
  end if;
  if cardinality(p_lead_ids) > 500 then
    raise exception 'La reasignación admite hasta 500 Leads por operación';
  end if;
  if exists (
    select 1 from unnest(p_lead_ids) as selected(lead_id)
    where selected.lead_id is null
  ) then
    raise exception 'La selección contiene un Lead inválido';
  end if;

  select count(distinct lead_id)::integer
  into v_expected_count
  from unnest(p_lead_ids) as selected(lead_id);
  if v_expected_count <> cardinality(p_lead_ids) then
    raise exception 'La selección contiene Leads duplicados';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'Indicá un motivo válido para la reasignación masiva';
  end if;
  if not exists (
    select 1
    from public.profiles
    where user_id = p_seller_user_id
      and role::text = 'seller'
      and active = true
  ) then
    raise exception 'El vendedor seleccionado no está activo';
  end if;

  -- Lock every target in a deterministic order before the first mutation. If
  -- any validation fails, Postgres rolls back the complete RPC transaction.
  for v_lead in
    select lead.id, lead.assigned_seller_user_id, crm.status as crm_status
    from public.leads lead
    join public.lead_crm crm on crm.lead_id = lead.id
    where lead.id = any(p_lead_ids)
    order by lead.id
    for update of lead, crm
  loop
    if v_lead.assigned_seller_user_id is null then
      raise exception 'Todos los Leads deben estar asignados antes de reasignarlos';
    end if;
    if v_lead.crm_status in ('venta', 'desistir', 'invalido') then
      raise exception 'Los Leads con estado terminal no se pueden reasignar';
    end if;
    if v_lead.assigned_seller_user_id is not distinct from p_seller_user_id then
      raise exception 'Uno de los Leads ya pertenece al vendedor seleccionado';
    end if;
    v_locked_count := v_locked_count + 1;
  end loop;

  if v_locked_count <> v_expected_count then
    raise exception 'No se encontraron todos los Leads seleccionados';
  end if;

  for v_lead in
    select lead.id
    from public.leads lead
    where lead.id = any(p_lead_ids)
    order by lead.id
  loop
    perform private.assign_lead_to_seller_with_reason(
      v_lead.id,
      p_seller_user_id,
      v_user_id,
      v_reason
    );
  end loop;

  return v_locked_count;
end;
$function$;

ALTER FUNCTION "public"."reassign_leads_to_seller"(p_lead_ids uuid[], p_seller_user_id uuid, p_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.record_contact_answer_with_transition(p_task_id uuid, p_status text, p_interview_operational_status text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_interview_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_interview_location text DEFAULT ''::text, p_deposit_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_performed_at timestamp with time zone DEFAULT now(), p_interview_mode text DEFAULT NULL::text, p_deposit_validation text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_interview_operational_status is not null
     and p_interview_operational_status <> 'scheduled' then
    raise exception 'Estado operativo de entrevista inválido para una respuesta inicial';
  end if;

  perform public.record_contact_answer_with_transition(
    p_task_id => p_task_id,
    p_status => p_status,
    p_note => p_note,
    p_next_contact_at => p_next_contact_at,
    p_next_contact_note => p_next_contact_note,
    p_contact_outcome => p_contact_outcome,
    p_interview_at => p_interview_at,
    p_interview_location => p_interview_location,
    p_deposit_amount => p_deposit_amount,
    p_priority => p_priority,
    p_performed_at => p_performed_at,
    p_interview_mode => p_interview_mode,
    p_deposit_validation => p_deposit_validation,
    p_desist_reason => p_desist_reason
  );
end;
$function$;

ALTER FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_interview_operational_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.record_contact_answer_with_transition(p_task_id uuid, p_status text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_interview_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_interview_location text DEFAULT ''::text, p_deposit_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_performed_at timestamp with time zone DEFAULT now(), p_interview_mode text DEFAULT NULL::text, p_deposit_validation text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_task public.lead_contact_tasks%rowtype; v_previous_status text; v_next_note text:=left(coalesce(nullif(trim(p_next_contact_note),''),trim(p_note)),1000); v_activity_type text:='status_change'; v_title text;
begin
 if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
 if p_performed_at is null or p_performed_at>now()+interval '5 minutes' then raise exception 'La hora efectiva del contacto no es válida'; end if;
 if char_length(trim(coalesce(p_note,'')))>3000 then raise exception 'El detalle es demasiado extenso'; end if;
 if p_priority not in('low','normal','high') then raise exception 'Prioridad inválida'; end if;
 if p_status not in('contacto_futuro','en_proceso','entrevista','cierre','sena','desistir') then raise exception 'Resultado comercial no permitido después de una respuesta'; end if;
 if p_status='desistir' and p_desist_reason is null then raise exception 'Seleccioná el motivo del desistimiento'; end if;
 if p_status='desistir' and p_desist_reason is not null and p_desist_reason not in('no_interest','conditions_not_viable','chose_other_option','postponed_without_date','requested_no_contact','other') then raise exception 'Motivo de desistimiento inválido'; end if;
 select * into v_task from public.lead_contact_tasks where id=p_task_id for update;
 if v_task.id is null or v_task.status<>'pending' then raise exception 'La tarea ya fue procesada o no existe'; end if;
 if v_task.seller_user_id<>v_user_id and not private.current_user_is_management() then raise exception 'La tarea no corresponde a este vendedor'; end if;
 select status into v_previous_status from public.lead_crm where lead_id=v_task.lead_id for update;
 if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;
 if v_previous_status not in('nuevo','no_contesta') then raise exception 'El Lead ya no está en Nuevo ni en Sin contacto'; end if;
 if not private.crm_transition_allowed(v_previous_status,p_status) then raise exception 'Transición comercial no permitida: % → %',v_previous_status,p_status; end if;
 if p_status in('contacto_futuro','en_proceso') and(p_next_contact_at is null or p_next_contact_at<=now()) then if p_status='en_proceso' then raise exception 'En gestión requiere un próximo contacto con fecha y hora'; else raise exception 'Programá el contacto solicitado'; end if; end if;
 if p_status='entrevista' and(p_interview_at is null or p_interview_at<=now()) then raise exception 'Indicá la fecha y hora futura de la entrevista'; end if;
 if p_status='entrevista' and p_interview_mode not in('presencial','videollamada') then raise exception 'La entrevista debe ser Presencial o Videollamada'; end if;
 if p_status='sena' and(p_deposit_amount is null or p_deposit_amount<=0) then raise exception 'Indicá el importe de la seña'; end if;
 if p_status='desistir' and char_length(trim(coalesce(p_note,'')))<3 then raise exception 'Indicá el motivo para este estado'; end if;
 update public.lead_contact_tasks set status='completed',outcome='answered',note=trim(coalesce(p_note,'')),completed_at=now(),performed_at=p_performed_at,recorded_at=now(),completed_by=v_user_id,updated_at=now() where id=v_task.id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(v_task.lead_id,v_user_id,case when v_task.channel='call' then 'contact' else 'follow_up' end,case when v_task.channel='call' then 'Intento de llamada '||v_task.call_attempt||' contestado' else 'WhatsApp de seguimiento '||v_task.message_step||' contestado' end,trim(coalesce(p_note,'')),jsonb_build_object('task_id',v_task.id,'channel',v_task.channel,'outcome','answered','call_attempt',v_task.call_attempt,'message_step',v_task.message_step,'performed_at',p_performed_at,'recorded_at',now()));
 perform private.cancel_lead_contact_protocol(v_task.lead_id,'El cliente respondió');
 if p_status='entrevista' then v_activity_type:='interview'; end if; if p_status in('contacto_futuro','en_proceso') then v_activity_type:='follow_up'; end if; if p_status='en_proceso' then v_activity_type:='contact'; end if;
 v_title:=case p_status when 'contacto_futuro' then 'El cliente pidió contacto futuro' when 'en_proceso' then 'Contacto en proceso' when 'entrevista' then 'Entrevista programada' when 'cierre' then 'Oportunidad en cierre' when 'sena' then 'Seña registrada' when 'desistir' then 'Oportunidad desistida' end;
 update public.lead_crm set status=p_status,priority=case when p_status='cierre' then 'high' else p_priority end,status_reason=case when p_status='desistir' then trim(coalesce(p_note,'')) else status_reason end,desist_reason=case when p_status='desistir' then p_desist_reason else desist_reason end,next_contact_at=case when p_status in('contacto_futuro','en_proceso') then p_next_contact_at else null end,next_contact_note=case when p_status in('contacto_futuro','en_proceso') then v_next_note else '' end,next_contact_source=case when p_status in('contacto_futuro','en_proceso') then 'manual' else null end,last_contact_at=p_performed_at,last_contact_outcome='answered',interview_at=case when p_status='entrevista' then p_interview_at else interview_at end,interview_location=case when p_status='entrevista' then trim(coalesce(p_interview_location,'')) else interview_location end,interview_mode=case when p_status='entrevista' then p_interview_mode else interview_mode end,interview_operational_status=case when p_status='entrevista' then 'scheduled' else interview_operational_status end,interview_objective=case when p_status='entrevista' then trim(coalesce(p_note,'')) else interview_objective end,final_objection=case when p_status='cierre' then trim(coalesce(p_note,'')) else final_objection end,deposit_amount=case when p_status='sena' then p_deposit_amount else deposit_amount end,deposit_at=case when p_status='sena' then now() else deposit_at end,deposit_validation=case when p_status='sena' then trim(coalesce(p_deposit_validation,'')) else deposit_validation end,cold_base_at=null,previous_status=case when p_status='desistir' then v_previous_status else previous_status end,terminal_at=case when p_status='desistir' then now() else null end,updated_by=v_user_id,updated_at=now() where lead_id=v_task.lead_id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(v_task.lead_id,v_user_id,v_activity_type,v_title,trim(coalesce(p_note,'')),jsonb_build_object('previous_status',v_previous_status,'status',p_status,'desist_reason',case when p_status='desistir' then p_desist_reason else null end,'next_contact_at',case when p_status in('contacto_futuro','en_proceso') then p_next_contact_at else null end,'next_contact_note',case when p_status in('contacto_futuro','en_proceso') then v_next_note else null end,'next_contact_source',case when p_status in('contacto_futuro','en_proceso') then 'manual' else null end,'interview_at',p_interview_at,'interview_location',trim(coalesce(p_interview_location,'')),'deposit_amount',p_deposit_amount,'performed_at',p_performed_at));
 if p_status='desistir' and p_desist_reason='requested_no_contact' then perform private.apply_lead_opt_out(v_task.lead_id,trim(coalesce(p_note,''))); end if;
end; $function$;

ALTER FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.record_contact_task_result(p_task_id uuid, p_outcome text, p_note text DEFAULT ''::text, p_performed_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if p_outcome = 'answered' then
    raise exception 'Una respuesta requiere record_contact_answer_with_transition';
  end if;
  if p_performed_at is null or p_performed_at > now() + interval '5 minutes' then
    raise exception 'La hora efectiva del contacto no es válida';
  end if;

  v_result := public.complete_contact_task(p_task_id, p_outcome, p_note);

  update public.lead_contact_tasks
  set performed_at = p_performed_at,
      recorded_at = now()
  where id = p_task_id;

  return v_result;
end;
$function$;

ALTER FUNCTION "public"."record_contact_task_result"(p_task_id uuid, p_outcome text, p_note text, p_performed_at timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.record_lead_follow_up(p_lead_id uuid, p_status text, p_note text DEFAULT ''::text, p_next_contact_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_contact_note text DEFAULT ''::text, p_contact_outcome text DEFAULT ''::text, p_interview_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_interview_location text DEFAULT ''::text, p_deposit_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_interview_mode text DEFAULT NULL::text, p_interview_operational_status text DEFAULT NULL::text, p_deposit_validation text DEFAULT ''::text, p_desist_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_is_management boolean; v_previous_status text; v_seller uuid; v_activity_type text:='status_change'; v_title text; v_next_note text:=left(coalesce(nullif(trim(coalesce(p_note,'')),''),'Próximo contacto programado'),1000);
begin
 if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
 v_is_management:=private.current_user_is_management();
 if not v_is_management and not exists(select 1 from public.leads where id=p_lead_id and assigned_seller_user_id=v_user_id) then raise exception 'El lead no está asignado a este vendedor'; end if;
 if p_status='nuevo' then raise exception 'Nuevo es un estado de ingreso. Seleccioná el resultado de la gestión'; end if;
 if p_status is null or p_status not in('no_contesta','contacto_futuro','en_proceso','invalido','entrevista','cierre','sena','desistir') then raise exception 'Estado comercial inválido'; end if;
 if p_priority not in('low','normal','high') then raise exception 'Prioridad inválida'; end if;
 if char_length(trim(coalesce(p_note,'')))>3000 then raise exception 'El detalle es demasiado extenso'; end if;
 if p_status in('contacto_futuro','en_proceso','cierre','sena') and p_next_contact_at is null then raise exception 'Programá el próximo contacto'; end if;
 if p_status<>'no_contesta' and p_next_contact_at is not null and p_next_contact_at<=now() then raise exception 'El próximo contacto debe quedar programado a futuro'; end if;
 if p_status='entrevista' and p_interview_at is null then raise exception 'Indicá la fecha y hora de la entrevista'; end if;
 if p_status='entrevista' and p_interview_mode not in('presencial','videollamada') then raise exception 'La entrevista debe ser Presencial o Videollamada'; end if;
 if p_status='sena' and(p_deposit_amount is null or p_deposit_amount<=0) then raise exception 'Indicá el importe de la seña'; end if;
 if p_status in('invalido','desistir') and char_length(trim(coalesce(p_note,'')))<3 then raise exception 'Indicá el motivo para este estado'; end if;
 if p_status='desistir' and p_desist_reason is null then raise exception 'Seleccioná el motivo del desistimiento'; end if;
 if p_status='desistir' and p_desist_reason is not null and p_desist_reason not in('no_interest','conditions_not_viable','chose_other_option','postponed_without_date','requested_no_contact','other') then raise exception 'Motivo de desistimiento inválido'; end if;
 select status into v_previous_status from public.lead_crm where lead_id=p_lead_id for update;
 if v_previous_status is null then raise exception 'No se encontró la ficha CRM del lead'; end if;
 if not private.crm_transition_allowed(v_previous_status,p_status) then raise exception 'Transición comercial no permitida: % → %',v_previous_status,p_status; end if;
 if p_status='entrevista' then v_activity_type:='interview'; end if;
 if p_status in('no_contesta','contacto_futuro') or p_next_contact_at is not null then v_activity_type:='follow_up'; end if;
 if p_status in('en_proceso','invalido') then v_activity_type:='contact'; end if;
 v_title:=case p_status when 'no_contesta' then 'El cliente no respondió' when 'contacto_futuro' then 'El cliente pidió contacto futuro' when 'en_proceso' then 'Contacto en proceso' when 'invalido' then 'Contacto inválido o erróneo' when 'entrevista' then 'Entrevista programada' when 'cierre' then 'Oportunidad en cierre' when 'sena' then 'Seña registrada' when 'desistir' then 'Oportunidad desistida' end;
 if p_status<>'no_contesta' then perform private.cancel_lead_contact_protocol(p_lead_id,'Gestión manual registrada'); end if;
 update public.lead_crm set status=p_status,priority=case when p_status='cierre' then 'high' else p_priority end,status_reason=case when p_status in('invalido','desistir') then trim(coalesce(p_note,'')) else status_reason end,desist_reason=case when p_status='desistir' then p_desist_reason else desist_reason end,next_contact_at=case when p_status in('no_contesta','desistir','invalido') then null else p_next_contact_at end,next_contact_note=case when p_status in('no_contesta','desistir','invalido') or p_next_contact_at is null then '' else v_next_note end,next_contact_source=case when p_status in('no_contesta','desistir','invalido') or p_next_contact_at is null then null else 'manual' end,last_contact_at=now(),last_contact_outcome=trim(coalesce(p_contact_outcome,'')),interview_at=coalesce(p_interview_at,interview_at),interview_location=case when p_interview_at is not null then trim(coalesce(p_interview_location,'')) else interview_location end,interview_mode=case when p_status='entrevista' then p_interview_mode else interview_mode end,interview_operational_status=case when p_status='entrevista' then coalesce(p_interview_operational_status,'scheduled') when v_previous_status='entrevista' then 'completed' else interview_operational_status end,interview_objective=case when p_status='entrevista' then trim(coalesce(p_note,'')) else interview_objective end,final_objection=case when p_status='cierre' then trim(coalesce(p_note,'')) else final_objection end,deposit_amount=coalesce(p_deposit_amount,deposit_amount),deposit_at=case when p_status='sena' then now() else deposit_at end,deposit_validation=case when p_status='sena' then trim(coalesce(p_deposit_validation,'')) else deposit_validation end,cold_base_at=null,previous_status=case when p_status in('desistir','invalido') then v_previous_status else previous_status end,terminal_at=case when p_status in('desistir','invalido') then now() else null end,updated_by=v_user_id,updated_at=now() where lead_id=p_lead_id;
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(p_lead_id,v_user_id,v_activity_type,v_title,trim(coalesce(p_note,'')),jsonb_build_object('previous_status',v_previous_status,'status',p_status,'desist_reason',case when p_status='desistir' then p_desist_reason else null end,'next_contact_at',case when p_status='no_contesta' then null else p_next_contact_at end,'next_contact_note',case when p_status='no_contesta' or p_next_contact_at is null then null else v_next_note end,'next_contact_source',case when p_status='no_contesta' or p_next_contact_at is null then null else 'manual' end,'interview_at',p_interview_at,'interview_location',trim(coalesce(p_interview_location,'')),'interview_mode',p_interview_mode,'deposit_amount',p_deposit_amount));
 if p_status='desistir' and p_desist_reason='requested_no_contact' then perform private.apply_lead_opt_out(p_lead_id,trim(coalesce(p_note,''))); end if;
 if p_status='no_contesta' then select assigned_seller_user_id into v_seller from public.leads where id=p_lead_id; if private.create_lead_contact_sequence(p_lead_id,v_seller,now()) is null then raise exception 'No se pudo iniciar el protocolo CRM V2'; end if; end if;
end; $function$;

ALTER FUNCTION "public"."record_lead_follow_up"(p_lead_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_interview_mode text, p_interview_operational_status text, p_deposit_validation text, p_desist_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.refresh_due_contact_protocols()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_management boolean;
  v_sequence record;
  v_unfinished_exists boolean;
  v_next_task_id uuid;
  v_skipped integer;
  v_skipped_total integer := 0;
  v_sequences_touched integer := 0;
begin
  if v_user_id is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;
  v_is_management := private.current_user_is_management();
  for v_sequence in
    select sequence.id, sequence.lead_id
    from public.lead_contact_sequences sequence
    join public.leads lead on lead.id = sequence.lead_id
    join public.lead_crm crm on crm.lead_id = sequence.lead_id
    where sequence.status = 'active'
      and crm.status in ('nuevo', 'no_contesta')
      and lead.closed_at is null
      and not coalesce(lead.do_not_contact, false)
      and (v_is_management or sequence.seller_user_id = v_user_id)
    order by sequence.started_at, sequence.id
    for update of sequence
  loop
    v_next_task_id := null;
    v_skipped := 0;
    update public.lead_contact_tasks task
    set status = 'skipped',
        outcome = 'skipped',
        note = case when trim(coalesce(task.note, '')) = '' then 'No realizada: ventana vencida' else task.note end,
        completed_at = coalesce(task.completed_at, now()),
        completed_by = null,
        performed_at = null,
        recorded_at = coalesce(task.recorded_at, now()),
        updated_at = now()
    where task.sequence_id = v_sequence.id
      and task.status in ('pending', 'scheduled')
      and task.due_end <= now();
    get diagnostics v_skipped = row_count;
    if v_skipped > 0 then
      v_skipped_total := v_skipped_total + v_skipped;
      v_sequences_touched := v_sequences_touched + 1;
      insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
      values (
        v_sequence.lead_id,
        null,
        'follow_up',
        'Intentos vencidos registrados como no realizados',
        v_skipped || ' tarea(s) vencida(s) se omitieron sin inventar un contacto.',
        jsonb_build_object(
          'sequence_id', v_sequence.id,
          'skipped_count', v_skipped,
          'reason', 'window_expired_without_recorded_attempt',
          'origin', 'protocol_clock'
        )
      );
    end if;
    select exists (
      select 1 from public.lead_contact_tasks task
      where task.sequence_id = v_sequence.id and task.status in ('pending', 'scheduled')
    ) into v_unfinished_exists;
    if not v_unfinished_exists then
      update public.lead_contact_sequences
      set status = 'completed',
          completed_at = coalesce(completed_at, now()),
          stopped_reason = case when v_skipped > 0 then 'Calendario finalizado con intentos no realizados' else coalesce(stopped_reason, 'Protocolo finalizado') end,
          updated_at = now()
      where id = v_sequence.id and status = 'active';
      continue;
    end if;
    select task.id into v_next_task_id
    from public.lead_contact_tasks task
    where task.sequence_id = v_sequence.id and task.status in ('pending', 'scheduled')
    order by task.sequence_order
    limit 1
    for update;
    if v_next_task_id is not null then
      update public.lead_contact_tasks
      set status = 'pending',
          updated_at = case when status <> 'pending' then now() else updated_at end
      where id = v_next_task_id;
    end if;
  end loop;
  return jsonb_build_object('sequences_touched', v_sequences_touched, 'tasks_skipped', v_skipped_total);
end;
$function$;

ALTER FUNCTION "public"."refresh_due_contact_protocols"() OWNER TO "postgres";

ALTER TABLE "public"."lead_assignments" ALTER COLUMN "reason" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_assignments" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_assignments" ADD CONSTRAINT "lead_assignments_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_assignments" ADD CONSTRAINT "lead_assignments_type" CHECK (assignment_type = ANY (ARRAY['direct_code'::text, 'manual'::text, 'reassigned'::text, 'unassigned'::text]));

ALTER TABLE "public"."lead_assignments" ADD CONSTRAINT "lead_assignments_assigned_by_user_id_fkey" FOREIGN KEY (assigned_by_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_assignments" ADD CONSTRAINT "lead_assignments_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

CREATE INDEX lead_assignments_assigned_by_idx ON public.lead_assignments USING btree (assigned_by_user_id);

CREATE INDEX lead_assignments_lead_time_idx ON public.lead_assignments USING btree (lead_id, created_at DESC);

CREATE INDEX lead_assignments_seller_time_idx ON public.lead_assignments USING btree (seller_user_id, created_at DESC);

CREATE POLICY "lead_assignments_management_insert" ON "public"."lead_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_management());

CREATE POLICY "lead_assignments_read_management_or_owner" ON "public"."lead_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management())));

ALTER TABLE "public"."lead_assignments" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."lead_assignments" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT INSERT ON TABLE "public"."lead_assignments" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_assignments" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_assignments" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_assignments" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_assignments" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_assignments" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_assignments" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_assignments" TO "postgres";

SET LOCAL ROLE postgres;

GRANT INSERT ON TABLE "public"."lead_assignments" TO "anon";

GRANT SELECT ON TABLE "public"."lead_assignments" TO "anon";

GRANT UPDATE ON TABLE "public"."lead_assignments" TO "anon";

GRANT DELETE ON TABLE "public"."lead_assignments" TO "anon";

GRANT TRUNCATE ON TABLE "public"."lead_assignments" TO "anon";

GRANT REFERENCES ON TABLE "public"."lead_assignments" TO "anon";

GRANT TRIGGER ON TABLE "public"."lead_assignments" TO "anon";

GRANT MAINTAIN ON TABLE "public"."lead_assignments" TO "anon";

SET LOCAL ROLE postgres;

GRANT INSERT ON TABLE "public"."lead_assignments" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_assignments" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_assignments" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_assignments" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_assignments" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_assignments" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_assignments" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_assignments" TO "authenticated";

SET LOCAL ROLE postgres;

GRANT INSERT ON TABLE "public"."lead_assignments" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_assignments" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_assignments" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_assignments" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_assignments" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_assignments" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_assignments" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_assignments" TO "service_role";

REVOKE ALL ON SEQUENCE "public"."lead_assignments_id_seq" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT SELECT ON SEQUENCE "public"."lead_assignments_id_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE "public"."lead_assignments_id_seq" TO "postgres";

GRANT USAGE ON SEQUENCE "public"."lead_assignments_id_seq" TO "postgres";

SET LOCAL ROLE postgres;

GRANT SELECT ON SEQUENCE "public"."lead_assignments_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE "public"."lead_assignments_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE "public"."lead_assignments_id_seq" TO "anon";

SET LOCAL ROLE postgres;

GRANT SELECT ON SEQUENCE "public"."lead_assignments_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE "public"."lead_assignments_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE "public"."lead_assignments_id_seq" TO "authenticated";

SET LOCAL ROLE postgres;

GRANT SELECT ON SEQUENCE "public"."lead_assignments_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "public"."lead_assignments_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "public"."lead_assignments_id_seq" TO "service_role";

REVOKE ALL ON FUNCTION "private"."apply_lead_opt_out"(p_lead_id uuid, p_reason text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "private"."apply_lead_opt_out"(p_lead_id uuid, p_reason text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."assign_lead_to_seller_with_reason"(p_lead_id uuid, p_seller_user_id uuid, p_actor_user_id uuid, p_reason text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "private"."assign_lead_to_seller_with_reason"(p_lead_id uuid, p_seller_user_id uuid, p_actor_user_id uuid, p_reason text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."crm_transition_allowed"(p_from text, p_to text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "private"."crm_transition_allowed"(p_from text, p_to text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."sync_protocol_next_action"(p_sequence_id uuid, p_lead_id uuid) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "private"."sync_protocol_next_action"(p_sequence_id uuid, p_lead_id uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."assign_lead_to_seller"(p_lead_id uuid, p_seller_user_id uuid) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."assign_lead_to_seller"(p_lead_id uuid, p_seller_user_id uuid) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."assign_lead_to_seller"(p_lead_id uuid, p_seller_user_id uuid) TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."assign_lead_to_seller"(p_lead_id uuid, p_seller_user_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."complete_contact_task"(p_task_id uuid, p_outcome text, p_note text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."complete_contact_task"(p_task_id uuid, p_outcome text, p_note text) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."complete_contact_task"(p_task_id uuid, p_outcome text, p_note text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."complete_contact_task_with_follow_up"(p_task_id uuid, p_outcome text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."complete_contact_task_with_follow_up"(p_task_id uuid, p_outcome text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."complete_contact_task_with_follow_up"(p_task_id uuid, p_outcome text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text) TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."complete_contact_task_with_follow_up"(p_task_id uuid, p_outcome text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reassign_leads_to_seller"(p_lead_ids uuid[], p_seller_user_id uuid, p_reason text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."reassign_leads_to_seller"(p_lead_ids uuid[], p_seller_user_id uuid, p_reason text) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."reassign_leads_to_seller"(p_lead_ids uuid[], p_seller_user_id uuid, p_reason text) TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."reassign_leads_to_seller"(p_lead_ids uuid[], p_seller_user_id uuid, p_reason text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_interview_operational_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_interview_operational_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_interview_operational_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_interview_operational_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_answer_with_transition"(p_task_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_performed_at timestamp with time zone, p_interview_mode text, p_deposit_validation text, p_desist_reason text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_contact_task_result"(p_task_id uuid, p_outcome text, p_note text, p_performed_at timestamp with time zone) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_task_result"(p_task_id uuid, p_outcome text, p_note text, p_performed_at timestamp with time zone) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_task_result"(p_task_id uuid, p_outcome text, p_note text, p_performed_at timestamp with time zone) TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_contact_task_result"(p_task_id uuid, p_outcome text, p_note text, p_performed_at timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_lead_follow_up"(p_lead_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_interview_mode text, p_interview_operational_status text, p_deposit_validation text, p_desist_reason text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_lead_follow_up"(p_lead_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_interview_mode text, p_interview_operational_status text, p_deposit_validation text, p_desist_reason text) TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_lead_follow_up"(p_lead_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_interview_mode text, p_interview_operational_status text, p_deposit_validation text, p_desist_reason text) TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."record_lead_follow_up"(p_lead_id uuid, p_status text, p_note text, p_next_contact_at timestamp with time zone, p_next_contact_note text, p_contact_outcome text, p_interview_at timestamp with time zone, p_interview_location text, p_deposit_amount numeric, p_priority text, p_interview_mode text, p_interview_operational_status text, p_deposit_validation text, p_desist_reason text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_due_contact_protocols"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."refresh_due_contact_protocols"() TO "postgres";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."refresh_due_contact_protocols"() TO "authenticated";

SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION "public"."refresh_due_contact_protocols"() TO "service_role";

SET LOCAL check_function_bodies = on;

COMMIT;
