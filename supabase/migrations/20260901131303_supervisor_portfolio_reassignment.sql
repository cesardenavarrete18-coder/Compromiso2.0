-- Reuse the canonical assignment path for individual and atomic portfolio
-- reassignments. Updating leads keeps the existing contact-sequence trigger as
-- the single owner of protocol cancellation and restart behavior.

create or replace function private.assign_lead_to_seller_with_reason(
  p_lead_id uuid,
  p_seller_user_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function private.assign_lead_to_seller_with_reason(uuid, uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.assign_lead_to_seller(
  p_lead_id uuid,
  p_seller_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.assign_lead_to_seller(uuid, uuid) from public, anon;
grant execute on function public.assign_lead_to_seller(uuid, uuid) to authenticated;

create or replace function public.reassign_leads_to_seller(
  p_lead_ids uuid[],
  p_seller_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
    select lead.id, lead.assigned_seller_user_id
    from public.leads lead
    where lead.id = any(p_lead_ids)
    order by lead.id
    for update
  loop
    if v_lead.assigned_seller_user_id is null then
      raise exception 'Todos los Leads deben estar asignados antes de reasignarlos';
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
$$;

revoke all on function public.reassign_leads_to_seller(uuid[], uuid, text)
  from public, anon;
grant execute on function public.reassign_leads_to_seller(uuid[], uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
