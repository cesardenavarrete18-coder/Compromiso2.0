-- Bulk lead intake, recall pools and seller-submitted lead approval.

create table public.lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  base_type text not null,
  file_name text not null,
  imported_by uuid not null references public.profiles (user_id) on delete restrict,
  row_count integer not null default 0,
  created_count integer not null default 0,
  merged_count integer not null default 0,
  rejected_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_import_batches_base_type check (base_type in ('new', 'recall')),
  constraint lead_import_batches_file_name_length check (char_length(file_name) between 1 and 255),
  constraint lead_import_batches_counts check (
    row_count >= 0 and created_count >= 0 and merged_count >= 0 and rejected_count >= 0
  )
);

create table public.lead_recall_items (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  import_batch_id uuid references public.lead_import_batches (id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  model_interest text not null default '',
  source_detail text not null default '',
  original_inquiry_at timestamptz not null,
  available_at timestamptz not null default now(),
  status text not null default 'available',
  assigned_seller_user_id uuid references public.profiles (user_id) on delete set null,
  assigned_by_user_id uuid references public.profiles (user_id) on delete set null,
  assigned_at timestamptz,
  attempt_count smallint not null default 0,
  answered_at timestamptz,
  converted_at timestamptz,
  exhausted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_recall_items_status check (status in ('available', 'assigned', 'working', 'converted', 'exhausted', 'cancelled')),
  constraint lead_recall_items_attempts check (attempt_count between 0 and 2),
  constraint lead_recall_items_name_length check (char_length(customer_name) between 2 and 120),
  constraint lead_recall_items_phone_length check (char_length(customer_phone) between 6 and 30),
  constraint lead_recall_items_assignment check (
    (assigned_seller_user_id is null and assigned_at is null)
    or (assigned_seller_user_id is not null and assigned_at is not null)
  )
);

create unique index lead_recall_items_one_open_idx
  on public.lead_recall_items (lead_id)
  where status in ('available', 'assigned', 'working');
create index lead_recall_items_supervisor_idx
  on public.lead_recall_items (status, original_inquiry_at desc, model_interest);
create index lead_recall_items_seller_idx
  on public.lead_recall_items (assigned_seller_user_id, status, available_at, original_inquiry_at desc);

create table public.lead_recall_attempts (
  id uuid primary key default gen_random_uuid(),
  recall_item_id uuid not null references public.lead_recall_items (id) on delete cascade,
  seller_user_id uuid not null references public.profiles (user_id) on delete restrict,
  attempt_number smallint not null,
  time_band text not null,
  outcome text not null,
  note text not null default '',
  contacted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint lead_recall_attempts_number check (attempt_number between 1 and 2),
  constraint lead_recall_attempts_band check (time_band in ('10_12', '14_16', '17_19')),
  constraint lead_recall_attempts_outcome check (outcome in ('no_answer', 'answered', 'invalid', 'not_interested')),
  constraint lead_recall_attempts_note_length check (char_length(note) <= 3000),
  constraint lead_recall_attempts_unique_number unique (recall_item_id, attempt_number)
);

create unique index lead_recall_attempts_distinct_band_idx
  on public.lead_recall_attempts (recall_item_id, time_band);

create table public.lead_import_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.lead_import_batches (id) on delete cascade,
  row_number integer not null,
  normalized_phone text,
  raw_data jsonb not null default '{}'::jsonb,
  result text not null,
  lead_id uuid references public.leads (id) on delete set null,
  recall_item_id uuid references public.lead_recall_items (id) on delete set null,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  constraint lead_import_rows_result check (result in ('created', 'merged', 'rejected')),
  constraint lead_import_rows_row_number check (row_number > 0),
  constraint lead_import_rows_error_length check (char_length(error_message) <= 2000),
  constraint lead_import_rows_batch_row unique (batch_id, row_number)
);

create table public.seller_lead_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by_user_id uuid not null references public.profiles (user_id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  source_detail text not null default '',
  model_interest text not null default '',
  summary text not null default '',
  status text not null default 'pending',
  reviewed_by_user_id uuid references public.profiles (user_id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_lead_submissions_status check (status in ('pending', 'approved', 'rejected')),
  constraint seller_lead_submissions_name_length check (char_length(customer_name) between 2 and 120),
  constraint seller_lead_submissions_phone_length check (char_length(customer_phone) between 6 and 30),
  constraint seller_lead_submissions_text_length check (
    char_length(source_detail) <= 300 and char_length(model_interest) <= 160
    and char_length(summary) <= 3000 and char_length(review_note) <= 3000
  )
);

create index seller_lead_submissions_queue_idx
  on public.seller_lead_submissions (status, created_at desc);
create index seller_lead_submissions_seller_idx
  on public.seller_lead_submissions (submitted_by_user_id, created_at desc);

create trigger lead_recall_items_set_updated_at
  before update on public.lead_recall_items
  for each row execute function private.set_updated_at();
create trigger seller_lead_submissions_set_updated_at
  before update on public.seller_lead_submissions
  for each row execute function private.set_updated_at();

create function private.queue_cold_lead_for_recall()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
begin
  if new.status = 'desistir' and old.status is distinct from new.status then
    select * into v_lead from public.leads where id = new.lead_id;
    if not v_lead.do_not_contact
      and not exists (select 1 from public.sales_cases where lead_id = new.lead_id)
    then
      insert into public.lead_recall_items (
        lead_id, customer_name, customer_phone, model_interest, source_detail,
        original_inquiry_at, available_at
      ) values (
        new.lead_id,
        coalesce(nullif(trim(v_lead.customer_name), ''), 'Cliente sin nombre'),
        v_lead.customer_phone,
        coalesce(v_lead.model_interest, ''),
        coalesce(v_lead.source_detail, ''),
        v_lead.created_at,
        now() + interval '15 days'
      ) on conflict (lead_id) where status in ('available', 'assigned', 'working')
      do update set available_at = least(public.lead_recall_items.available_at, excluded.available_at), updated_at = now();
    end if;
  elsif new.status not in ('desistir', 'invalido', 'venta') and old.status = 'desistir' then
    update public.lead_recall_items
    set status = 'cancelled', updated_at = now()
    where lead_id = new.lead_id and status in ('available', 'assigned', 'working');
  end if;
  return new;
end;
$$;

revoke all on function private.queue_cold_lead_for_recall() from public, anon, authenticated;

create trigger lead_crm_queue_cold_recall
  after update of status on public.lead_crm
  for each row when (old.status is distinct from new.status)
  execute function private.queue_cold_lead_for_recall();

create function public.import_lead_rows(
  p_base_type text,
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_batch_id uuid;
  v_row jsonb;
  v_row_number integer := 0;
  v_phone text;
  v_name text;
  v_model text;
  v_source text;
  v_summary text;
  v_original timestamptz;
  v_lead_id uuid;
  v_active_lead_id uuid;
  v_recall_id uuid;
  v_recall_lead_created boolean := false;
  v_created integer := 0;
  v_merged integer := 0;
  v_rejected integer := 0;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;
  if p_base_type not in ('new', 'recall') then raise exception 'Tipo de base inválido'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no contiene filas para importar';
  end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'El máximo por archivo es de 5000 filas'; end if;

  insert into public.lead_import_batches (base_type, file_name, imported_by, row_count)
  values (p_base_type, left(coalesce(nullif(trim(p_file_name), ''), 'base.xlsx'), 255), v_user_id, jsonb_array_length(p_rows))
  returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := v_row_number + 1;
    begin
      v_phone := regexp_replace(coalesce(v_row->>'phone', ''), '[^0-9]', '', 'g');
      v_name := trim(coalesce(v_row->>'name', ''));
      v_model := left(trim(coalesce(v_row->>'model_interest', '')), 160);
      v_source := left(trim(coalesce(v_row->>'source_detail', 'Importación Excel')), 300);
      v_summary := left(trim(coalesce(v_row->>'summary', '')), 3000);
      if char_length(v_phone) < 6 or char_length(v_phone) > 30 then raise exception 'Teléfono inválido'; end if;
      if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Nombre inválido'; end if;
      v_original := coalesce(nullif(v_row->>'original_inquiry_at', '')::timestamptz, now());

      select lead.id into v_active_lead_id
      from public.leads lead
      join public.customers customer on customer.id = lead.customer_id
      join public.lead_crm crm on crm.lead_id = lead.id
      where customer.normalized_phone = v_phone
        and crm.status not in ('venta', 'desistir', 'invalido')
        and not exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = lead.id)
      order by lead.created_at desc limit 1;

      if v_active_lead_id is not null then
        v_lead_id := v_active_lead_id;
        insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
        values (v_lead_id, v_user_id, 'manual_creation', 'Consulta detectada en importación', v_summary,
          jsonb_build_object('batch_id', v_batch_id, 'base_type', p_base_type, 'source_detail', v_source, 'original_inquiry_at', v_original));
        insert into public.lead_import_rows (batch_id, row_number, normalized_phone, raw_data, result, lead_id)
        values (v_batch_id, v_row_number, v_phone, v_row, 'merged', v_lead_id);
        v_merged := v_merged + 1;
      elsif p_base_type = 'new' then
        insert into public.leads (
          customer_phone, customer_name, source_channel, source_detail, qualification_status,
          priority, intent_summary, model_interest, routing_status, routing_reason,
          contact_consent_source, last_message_at, created_at
        ) values (
          v_phone, v_name, 'manual', v_source, 'follow_up', 'normal', v_summary,
          nullif(v_model, ''), 'pending_supervisor', 'excel_new_import', '', v_original, now()
        ) returning id into v_lead_id;
        insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
        values (v_lead_id, v_user_id, 'manual_creation', 'Lead importado desde Excel', v_summary,
          jsonb_build_object('batch_id', v_batch_id, 'source_detail', v_source, 'original_inquiry_at', v_original));
        insert into public.lead_import_rows (batch_id, row_number, normalized_phone, raw_data, result, lead_id)
        values (v_batch_id, v_row_number, v_phone, v_row, 'created', v_lead_id);
        v_created := v_created + 1;
      else
        select lead.id into v_lead_id
        from public.leads lead
        join public.customers customer on customer.id = lead.customer_id
        left join public.sales_cases sales_case on sales_case.lead_id = lead.id
        where customer.normalized_phone = v_phone and sales_case.id is null
        order by lead.created_at desc limit 1;

        if v_lead_id is null then
          insert into public.leads (
            customer_phone, customer_name, source_channel, source_detail, qualification_status,
            priority, intent_summary, model_interest, routing_status, routing_reason, last_message_at
          ) values (
            v_phone, v_name, 'manual', v_source, 'follow_up', 'normal', v_summary,
            nullif(v_model, ''), 'closed', 'recall_import', v_original
          ) returning id into v_lead_id;
          update public.lead_crm set status = 'desistir', status_reason = 'Base histórica importada', cold_base_at = now()
          where lead_id = v_lead_id;
          v_recall_lead_created := true;
        end if;

        select id into v_recall_id from public.lead_recall_items
        where lead_id = v_lead_id and status in ('available', 'assigned', 'working') limit 1;
        if v_recall_id is null then
          insert into public.lead_recall_items (
            lead_id, import_batch_id, customer_name, customer_phone, model_interest,
            source_detail, original_inquiry_at, available_at
          ) values (
            v_lead_id, v_batch_id, v_name, v_phone, v_model, v_source, v_original, now()
          ) returning id into v_recall_id;
          v_created := v_created + 1;
          insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
          values (v_lead_id, v_user_id, 'manual_creation', 'Cliente incorporado a rellamados', v_summary,
            jsonb_build_object('batch_id', v_batch_id, 'original_inquiry_at', v_original));
          insert into public.lead_import_rows (batch_id, row_number, normalized_phone, raw_data, result, lead_id, recall_item_id)
          values (v_batch_id, v_row_number, v_phone, v_row, 'created', v_lead_id, v_recall_id);
        else
          update public.lead_recall_items set
            import_batch_id = coalesce(import_batch_id, v_batch_id),
            customer_name = v_name,
            customer_phone = v_phone,
            model_interest = v_model,
            source_detail = v_source,
            original_inquiry_at = least(original_inquiry_at, v_original),
            available_at = least(available_at, now()),
            updated_at = now()
          where id = v_recall_id;
          if v_recall_lead_created then
            v_created := v_created + 1;
          else
            v_merged := v_merged + 1;
          end if;
          insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
          values (v_lead_id, v_user_id, 'manual_creation',
            case when v_recall_lead_created then 'Cliente incorporado a rellamados' else 'Registro duplicado agregado al historial' end,
            v_summary,
            jsonb_build_object('batch_id', v_batch_id, 'original_inquiry_at', v_original));
          insert into public.lead_import_rows (batch_id, row_number, normalized_phone, raw_data, result, lead_id, recall_item_id)
          values (v_batch_id, v_row_number, v_phone, v_row,
            case when v_recall_lead_created then 'created' else 'merged' end,
            v_lead_id, v_recall_id);
        end if;
      end if;
    exception when others then
      v_rejected := v_rejected + 1;
      insert into public.lead_import_rows (batch_id, row_number, normalized_phone, raw_data, result, error_message)
      values (v_batch_id, v_row_number, nullif(v_phone, ''), v_row, 'rejected', left(sqlerrm, 2000));
    end;
    v_active_lead_id := null; v_lead_id := null; v_recall_id := null; v_recall_lead_created := false;
  end loop;

  update public.lead_import_batches set
    created_count = v_created, merged_count = v_merged, rejected_count = v_rejected
  where id = v_batch_id;
  return jsonb_build_object('batch_id', v_batch_id, 'rows', v_row_number, 'created', v_created, 'merged', v_merged, 'rejected', v_rejected);
end;
$$;

create function public.assign_recall_items(p_item_ids uuid[], p_seller_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
begin
  if v_user_id is null or not private.current_user_is_management() then raise exception 'Se requiere permiso de supervisión'; end if;
  if not exists (select 1 from public.profiles where user_id = p_seller_user_id and role::text = 'seller' and active) then
    raise exception 'El vendedor seleccionado no está activo';
  end if;
  update public.lead_recall_items set
    status = 'assigned', assigned_seller_user_id = p_seller_user_id,
    assigned_by_user_id = v_user_id, assigned_at = now(), updated_at = now()
  where id = any(p_item_ids) and status in ('available', 'assigned');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.record_recall_attempt(
  p_item_id uuid,
  p_time_band text,
  p_outcome text,
  p_contacted_at timestamptz,
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
  v_user_id uuid := (select auth.uid());
  v_item public.lead_recall_items%rowtype;
  v_attempt smallint;
begin
  if v_user_id is null or not private.current_user_active() then raise exception 'Acceso no autorizado'; end if;
  select * into v_item from public.lead_recall_items where id = p_item_id for update;
  if not found then raise exception 'No se encontró el rellamado'; end if;
  if v_item.assigned_seller_user_id <> v_user_id and not private.current_user_is_management() then raise exception 'Este rellamado no está asignado al usuario'; end if;
  if v_item.status not in ('assigned', 'working') then raise exception 'El rellamado ya no admite gestiones'; end if;
  if p_time_band not in ('10_12', '14_16', '17_19') then raise exception 'Franja horaria inválida'; end if;
  if p_outcome not in ('no_answer', 'answered', 'invalid', 'not_interested') then raise exception 'Resultado inválido'; end if;
  if p_contacted_at is null or p_contacted_at > now() + interval '5 minutes' then raise exception 'La fecha de la llamada no es válida'; end if;
  if exists (select 1 from public.lead_recall_attempts where recall_item_id = p_item_id and time_band = p_time_band) then
    raise exception 'El segundo llamado debe realizarse en otra franja horaria';
  end if;
  v_attempt := v_item.attempt_count + 1;
  if v_attempt > 2 then raise exception 'Ya se registraron los dos llamados'; end if;

  insert into public.lead_recall_attempts (recall_item_id, seller_user_id, attempt_number, time_band, outcome, note, contacted_at)
  values (p_item_id, v_user_id, v_attempt, p_time_band, p_outcome, left(trim(coalesce(p_note, '')), 3000), p_contacted_at);

  if p_outcome = 'answered' then
    if p_next_contact_at is null or p_next_contact_at <= now() then raise exception 'Programá el próximo contacto antes de pasar el Lead a la agenda'; end if;
    update public.lead_recall_items set attempt_count = v_attempt, status = 'converted', answered_at = p_contacted_at, converted_at = now(), updated_at = now()
    where id = p_item_id;
    update public.leads set
      assigned_seller_user_id = v_user_id, assigned_by_user_id = v_user_id,
      assigned_at = now(), routing_status = 'assigned_manual', routing_reason = 'recall_reactivated',
      closed_at = null, last_message_at = greatest(last_message_at, p_contacted_at)
    where id = v_item.lead_id;
    update public.lead_crm set
      status = 'en_proceso', status_reason = '', next_contact_at = p_next_contact_at,
      next_contact_note = left(trim(coalesce(p_next_contact_note, 'Próximo contacto acordado')), 1000),
      last_contact_at = p_contacted_at, last_contact_outcome = 'Rellamado respondido', cold_base_at = null,
      updated_by = v_user_id, updated_at = now()
    where lead_id = v_item.lead_id;
    insert into public.lead_assignments (lead_id, seller_user_id, assigned_by_user_id, assignment_type, reason)
    values (v_item.lead_id, v_user_id, v_user_id, 'manual', 'Rellamado respondido y pasado a agenda');
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (v_item.lead_id, v_user_id, 'follow_up', 'Rellamado reactivado y pasado a agenda', trim(coalesce(p_note, '')),
      jsonb_build_object('recall_item_id', p_item_id, 'attempt', v_attempt, 'time_band', p_time_band, 'next_contact_at', p_next_contact_at));
  elsif p_outcome in ('invalid', 'not_interested') or v_attempt = 2 then
    update public.lead_recall_items set attempt_count = v_attempt, status = 'exhausted', exhausted_at = now(), updated_at = now()
    where id = p_item_id;
    update public.lead_crm set status = 'desistir', status_reason = case when p_outcome = 'invalid' then 'Contacto inválido en rellamado' when p_outcome = 'not_interested' then 'Sin interés en rellamado' else 'Dos llamados sin respuesta' end,
      next_contact_at = null, next_contact_note = '', cold_base_at = now(), updated_by = v_user_id, updated_at = now()
    where lead_id = v_item.lead_id;
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (v_item.lead_id, v_user_id, 'follow_up', 'Rellamado cerrado', trim(coalesce(p_note, '')),
      jsonb_build_object('recall_item_id', p_item_id, 'attempts', v_attempt, 'outcome', p_outcome));
  else
    update public.lead_recall_items set attempt_count = v_attempt, status = 'working', updated_at = now() where id = p_item_id;
    insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
    values (v_item.lead_id, v_user_id, 'follow_up', 'Primer rellamado sin respuesta', trim(coalesce(p_note, '')),
      jsonb_build_object('recall_item_id', p_item_id, 'time_band', p_time_band));
  end if;
  return jsonb_build_object('status', (select status from public.lead_recall_items where id = p_item_id), 'attempts', v_attempt, 'lead_id', v_item.lead_id);
end;
$$;

create function public.submit_seller_lead_candidate(
  p_customer_name text,
  p_customer_phone text,
  p_source_detail text default '',
  p_model_interest text default '',
  p_summary text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null or not exists (select 1 from public.profiles where user_id = v_user_id and role::text = 'seller' and active) then
    raise exception 'Se requiere un vendedor activo';
  end if;
  if char_length(trim(coalesce(p_customer_name, ''))) < 2 then raise exception 'Indicá el nombre del cliente'; end if;
  if char_length(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g')) < 6 then raise exception 'Indicá un teléfono válido'; end if;
  if exists (
    select 1 from public.seller_lead_submissions
    where submitted_by_user_id = v_user_id and status = 'pending'
      and regexp_replace(customer_phone, '[^0-9]', '', 'g') = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
  ) then raise exception 'Ya existe una propuesta pendiente para este teléfono'; end if;
  insert into public.seller_lead_submissions (submitted_by_user_id, customer_name, customer_phone, source_detail, model_interest, summary)
  values (v_user_id, left(trim(p_customer_name), 120), left(trim(p_customer_phone), 30), left(trim(coalesce(p_source_detail, '')), 300), left(trim(coalesce(p_model_interest, '')), 160), left(trim(coalesce(p_summary, '')), 3000))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.review_seller_lead_submission(p_submission_id uuid, p_approved boolean, p_review_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_submission public.seller_lead_submissions%rowtype;
  v_phone text;
  v_existing uuid;
  v_lead_id uuid;
begin
  if v_user_id is null or not private.current_user_is_management() then raise exception 'Se requiere permiso de supervisión'; end if;
  select * into v_submission from public.seller_lead_submissions where id = p_submission_id for update;
  if not found or v_submission.status <> 'pending' then raise exception 'La propuesta ya fue revisada o no existe'; end if;
  if not p_approved and char_length(trim(coalesce(p_review_note, ''))) < 3 then raise exception 'Indicá el motivo del rechazo'; end if;

  if p_approved then
    v_phone := regexp_replace(v_submission.customer_phone, '[^0-9]', '', 'g');
    select lead.id into v_existing
    from public.leads lead
    join public.customers customer on customer.id = lead.customer_id
    join public.lead_crm crm on crm.lead_id = lead.id
    where customer.normalized_phone = v_phone
      and crm.status not in ('venta', 'desistir', 'invalido')
    order by lead.created_at desc limit 1;

    if v_existing is not null then
      v_lead_id := v_existing;
      insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
      values (v_lead_id, v_user_id, 'manual_creation', 'Lead propuesto por vendedor agregado al historial', v_submission.summary,
        jsonb_build_object('submission_id', p_submission_id, 'submitted_by_user_id', v_submission.submitted_by_user_id));
    else
      insert into public.leads (
        customer_phone, customer_name, source_channel, source_detail, qualification_status,
        priority, intent_summary, model_interest, routing_status, routing_reason,
        assigned_seller_user_id, assigned_by_user_id, assigned_at
      ) values (
        v_submission.customer_phone, v_submission.customer_name, 'manual', nullif(v_submission.source_detail, ''), 'follow_up',
        'normal', v_submission.summary, nullif(v_submission.model_interest, ''), 'assigned_manual', 'seller_submission_approved',
        v_submission.submitted_by_user_id, v_user_id, now()
      ) returning id into v_lead_id;
      insert into public.lead_assignments (lead_id, seller_user_id, assigned_by_user_id, assignment_type, reason)
      values (v_lead_id, v_submission.submitted_by_user_id, v_user_id, 'manual', 'Lead propuesto por el vendedor y aprobado por supervisión');
      insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
      values (v_lead_id, v_user_id, 'manual_creation', 'Lead propuesto por vendedor aprobado', v_submission.summary,
        jsonb_build_object('submission_id', p_submission_id, 'submitted_by_user_id', v_submission.submitted_by_user_id));
    end if;
  end if;

  update public.seller_lead_submissions set
    status = case when p_approved then 'approved' else 'rejected' end,
    reviewed_by_user_id = v_user_id, reviewed_at = now(), review_note = left(trim(coalesce(p_review_note, '')), 3000),
    lead_id = v_lead_id, updated_at = now()
  where id = p_submission_id;
  return v_lead_id;
end;
$$;

alter table public.lead_import_batches enable row level security;
alter table public.lead_import_rows enable row level security;
alter table public.lead_recall_items enable row level security;
alter table public.lead_recall_attempts enable row level security;
alter table public.seller_lead_submissions enable row level security;

create policy lead_import_batches_management_read on public.lead_import_batches for select to authenticated
using (private.current_user_is_management());
create policy lead_import_rows_management_read on public.lead_import_rows for select to authenticated
using (private.current_user_is_management());
create policy lead_recall_items_management_or_owner_read on public.lead_recall_items for select to authenticated
using (private.current_user_is_management() or assigned_seller_user_id = (select auth.uid()));
create policy lead_recall_attempts_management_or_owner_read on public.lead_recall_attempts for select to authenticated
using (private.current_user_is_management() or seller_user_id = (select auth.uid()));
create policy seller_lead_submissions_management_or_owner_read on public.seller_lead_submissions for select to authenticated
using (private.current_user_is_management() or submitted_by_user_id = (select auth.uid()));

grant select on public.lead_import_batches, public.lead_import_rows, public.lead_recall_items, public.lead_recall_attempts, public.seller_lead_submissions to authenticated;
grant all on public.lead_import_batches, public.lead_import_rows, public.lead_recall_items, public.lead_recall_attempts, public.seller_lead_submissions to service_role;
grant usage, select on sequence public.lead_import_rows_id_seq to service_role;

revoke all on function public.import_lead_rows(text, text, jsonb) from public, anon;
revoke all on function public.assign_recall_items(uuid[], uuid) from public, anon;
revoke all on function public.record_recall_attempt(uuid, text, text, timestamptz, text, timestamptz, text) from public, anon;
revoke all on function public.submit_seller_lead_candidate(text, text, text, text, text) from public, anon;
revoke all on function public.review_seller_lead_submission(uuid, boolean, text) from public, anon;
grant execute on function public.import_lead_rows(text, text, jsonb) to authenticated;
grant execute on function public.assign_recall_items(uuid[], uuid) to authenticated;
grant execute on function public.record_recall_attempt(uuid, text, text, timestamptz, text, timestamptz, text) to authenticated;
grant execute on function public.submit_seller_lead_candidate(text, text, text, text, text) to authenticated;
grant execute on function public.review_seller_lead_submission(uuid, boolean, text) to authenticated;

create function private.enforce_plan_minute_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer_type text;
begin
  if new.sales_case_id is not null then
    if new.brand_name not in ('Volkswagen', 'Peugeot', 'Fiat') then
      raise exception 'La minuta requiere una marca válida';
    end if;
    select quote.offer_type into v_offer_type
    from public.sales_cases sales_case
    left join public.sales_quotes quote on quote.id = sales_case.quote_id
    where sales_case.id = new.sales_case_id;
    if coalesce(v_offer_type, 'savings_plan') = 'savings_plan'
      and (new.installments_paid <> 1 or new.installments_to_pay not in (83, 119)) then
      raise exception 'Las cuotas del plan deben ser 1/83 o 1/119';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_plan_minute_identity() from public, anon, authenticated;
create trigger commercial_applications_enforce_plan_minute
  before insert or update of brand_name, installments_paid, installments_to_pay
  on public.commercial_applications
  for each row execute function private.enforce_plan_minute_identity();
