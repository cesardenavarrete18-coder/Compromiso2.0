-- Contact protocol clock advance.
--
-- Two invariants are enforced here:
-- 1) an expired commercial window must never block a later active window;
-- 2) missing an attempt is recorded as skipped/no-realizado, never as no_answer.
--
-- The original due_start/due_end timestamps remain immutable while a sequence is
-- processed. This preserves the audit trail and allows Supervisor metrics to
-- distinguish on-time, late, and missed work truthfully.

create or replace function private.sync_protocol_next_action(
  p_sequence_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

    -- Never move the contractual/audit window forward. A later refresh can
    -- classify an expired task as skipped when the next commercial band begins.
    update public.lead_contact_tasks
    set status = 'pending',
        updated_at = now()
    where id = v_task.id
    returning * into v_task;
  end if;

  return v_task.id;
end;
$$;

revoke all on function private.sync_protocol_next_action(uuid, uuid) from public, anon, authenticated;

create or replace function public.refresh_due_contact_protocols()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_management boolean;
  v_sequence record;
  v_current_window_start timestamptz;
  v_future_task_exists boolean;
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
    v_current_window_start := null;
    v_next_task_id := null;
    v_skipped := 0;

    -- A later band becomes authoritative only once that band has actually
    -- started. Between bands, the prior attempt remains available for a late
    -- truthful registration instead of being silently discarded.
    select min(task.due_start)
      into v_current_window_start
    from public.lead_contact_tasks task
    where task.sequence_id = v_sequence.id
      and task.status in ('pending', 'scheduled')
      and task.due_start <= now()
      and task.due_end >= now();

    if v_current_window_start is not null then
      update public.lead_contact_tasks task
      set status = 'skipped',
          outcome = 'skipped',
          note = case
            when trim(coalesce(task.note, '')) = '' then 'No realizada: ventana vencida'
            else task.note
          end,
          completed_at = coalesce(task.completed_at, now()),
          completed_by = null,
          performed_at = null,
          recorded_at = coalesce(task.recorded_at, now()),
          updated_at = now()
      where task.sequence_id = v_sequence.id
        and task.status in ('pending', 'scheduled')
        and task.due_end < v_current_window_start;

      get diagnostics v_skipped = row_count;
    else
      select exists (
        select 1
        from public.lead_contact_tasks task
        where task.sequence_id = v_sequence.id
          and task.status in ('pending', 'scheduled')
          and task.due_start > now()
      ) into v_future_task_exists;

      -- After the final window there is no later band that could advance the
      -- sequence. Close remaining expired work as missed, without generating a
      -- synthetic no_answer and without classifying Base fria.
      if not v_future_task_exists then
        update public.lead_contact_tasks task
        set status = 'skipped',
            outcome = 'skipped',
            note = case
              when trim(coalesce(task.note, '')) = '' then 'No realizada: ventana vencida'
              else task.note
            end,
            completed_at = coalesce(task.completed_at, now()),
            completed_by = null,
            performed_at = null,
            recorded_at = coalesce(task.recorded_at, now()),
            updated_at = now()
        where task.sequence_id = v_sequence.id
          and task.status in ('pending', 'scheduled')
          and task.due_end < now();

        get diagnostics v_skipped = row_count;
      end if;
    end if;

    if v_skipped > 0 then
      v_skipped_total := v_skipped_total + v_skipped;
      v_sequences_touched := v_sequences_touched + 1;

      insert into public.lead_activities (
        lead_id, actor_user_id, activity_type, title, detail, metadata
      ) values (
        v_sequence.lead_id,
        v_user_id,
        'follow_up',
        'Intentos vencidos registrados como no realizados',
        v_skipped || ' tarea(s) vencida(s) se omitieron sin inventar un contacto.',
        jsonb_build_object(
          'sequence_id', v_sequence.id,
          'skipped_count', v_skipped,
          'reason', 'window_expired_without_recorded_attempt'
        )
      );
    end if;

    select exists (
      select 1 from public.lead_contact_tasks task
      where task.sequence_id = v_sequence.id
        and task.status in ('pending', 'scheduled')
    ) into v_unfinished_exists;

    if not v_unfinished_exists then
      update public.lead_contact_sequences
      set status = 'completed',
          completed_at = coalesce(completed_at, now()),
          stopped_reason = case
            when v_skipped > 0 then 'Calendario finalizado con intentos no realizados'
            else coalesce(stopped_reason, 'Protocolo finalizado')
          end,
          updated_at = now()
      where id = v_sequence.id
        and status = 'active';
      continue;
    end if;

    -- Once expired predecessors are out of the way, exactly the earliest
    -- unfinished task becomes actionable. Its original due window is preserved.
    select task.id into v_next_task_id
    from public.lead_contact_tasks task
    where task.sequence_id = v_sequence.id
      and task.status in ('pending', 'scheduled')
    order by task.sequence_order
    limit 1
    for update;

    if v_next_task_id is not null then
      update public.lead_contact_tasks
      set status = case when id = v_next_task_id then 'pending' else status end,
          updated_at = case when id = v_next_task_id and status <> 'pending' then now() else updated_at end
      where sequence_id = v_sequence.id
        and id = v_next_task_id;
    end if;
  end loop;

  return jsonb_build_object(
    'sequences_touched', v_sequences_touched,
    'tasks_skipped', v_skipped_total
  );
end;
$$;

revoke all on function public.refresh_due_contact_protocols() from public, anon;
grant execute on function public.refresh_due_contact_protocols() to authenticated;

comment on function public.refresh_due_contact_protocols()
  is 'Advances active contact protocols by real commercial time. Expired attempts become skipped/no-realizado, never no_answer; later bands can proceed without falsifying prior work.';

notify pgrst, 'reload schema';
