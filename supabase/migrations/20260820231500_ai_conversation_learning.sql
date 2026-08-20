-- Controlled learning for the WhatsApp assistant.

alter table public.ai_assistant_settings
  add column if not exists conversation_style text not null default
    'Respondé con calidez, naturalidad y español rioplatense profesional. Saludá por el nombre de pila solamente al comenzar la conversación. Primero reconocé lo que dijo la persona y después hacé una sola pregunta concreta. Evitá respuestas secas, interrogatorios, frases robóticas y repetir información ya aportada. Si ya hay datos suficientes, resumí lo entendido y avisá que un asesor continuará la gestión.';

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_style_length;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_style_length
  check (char_length(conversation_style) between 40 and 10000);

alter table public.lead_messages
  add column if not exists origin text not null default 'unknown';

update public.lead_messages
set origin = case
  when direction = 'inbound' then 'customer'
  when direction = 'system' then 'system'
  else 'unknown'
end
where origin = 'unknown';

alter table public.lead_messages
  drop constraint if exists lead_messages_origin_check;

alter table public.lead_messages
  add constraint lead_messages_origin_check
  check (origin in ('customer', 'ai', 'human', 'system', 'unknown'));

alter table public.ai_training_examples
  add column if not exists lead_id uuid references public.leads (id) on delete cascade,
  add column if not exists message_id uuid references public.lead_messages (id) on delete cascade,
  add column if not exists rating text not null default 'corrected',
  add column if not exists expected_reply text not null default '';

alter table public.ai_training_examples
  drop constraint if exists ai_training_examples_rating_check;

alter table public.ai_training_examples
  add constraint ai_training_examples_rating_check
  check (rating in ('correct', 'corrected'));

alter table public.ai_training_examples
  drop constraint if exists ai_training_examples_expected_reply_length;

alter table public.ai_training_examples
  add constraint ai_training_examples_expected_reply_length
  check (char_length(expected_reply) <= 4096);

create unique index if not exists ai_training_examples_message_unique
  on public.ai_training_examples (message_id)
  where message_id is not null;

create index if not exists ai_training_examples_active_updated_idx
  on public.ai_training_examples (active, updated_at desc);

create or replace function public.review_ai_message(
  p_message_id uuid,
  p_rating text,
  p_expected_reply text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.lead_messages%rowtype;
  v_lead public.leads%rowtype;
  v_conversation text;
  v_reply text := btrim(coalesce(p_expected_reply, ''));
  v_example_id uuid;
begin
  if v_user_id is null or not private.current_user_is_management() then
    raise exception 'Se requiere permiso de supervisión';
  end if;

  if p_rating not in ('correct', 'corrected') then
    raise exception 'Valoración inválida';
  end if;

  select * into v_message
  from public.lead_messages
  where id = p_message_id;

  if v_message.id is null or v_message.direction <> 'outbound' or v_message.origin <> 'ai' then
    raise exception 'El mensaje seleccionado no fue generado por la IA';
  end if;

  if p_rating = 'corrected' and char_length(v_reply) < 2 then
    raise exception 'Escribí la respuesta que debería haber enviado la IA';
  end if;

  if p_rating = 'correct' then
    v_reply := v_message.body;
  end if;

  select * into v_lead from public.leads where id = v_message.lead_id;

  select string_agg(
    case when item.direction = 'inbound' then 'Cliente: ' else 'Asistente: ' end || item.body,
    E'\n' order by item.created_at
  ) into v_conversation
  from (
    select direction, body, created_at
    from public.lead_messages
    where lead_id = v_message.lead_id
      and id <> v_message.id
      and created_at <= v_message.created_at
      and direction in ('inbound', 'outbound')
    order by created_at desc
    limit 10
  ) item;

  if nullif(btrim(coalesce(v_lead.customer_name, '')), '') is not null then
    v_conversation := replace(v_conversation, v_lead.customer_name, '[nombre]');
    v_reply := replace(v_reply, v_lead.customer_name, '[nombre]');
  end if;
  if nullif(btrim(coalesce(v_lead.customer_phone, '')), '') is not null then
    v_conversation := replace(v_conversation, v_lead.customer_phone, '[teléfono]');
    v_reply := replace(v_reply, v_lead.customer_phone, '[teléfono]');
  end if;

  insert into public.ai_training_examples (
    lead_id,
    message_id,
    conversation,
    expected_status,
    expected_summary,
    correction_note,
    rating,
    expected_reply,
    active,
    created_by
  ) values (
    v_message.lead_id,
    v_message.id,
    coalesce(nullif(v_conversation, ''), 'Cliente: conversación sin contexto previo'),
    coalesce(v_lead.qualification_status::text, 'follow_up'),
    coalesce(v_lead.intent_summary, ''),
    case when p_rating = 'correct' then 'Respuesta aprobada por Supervisión' else 'Respuesta corregida por Supervisión' end,
    p_rating,
    v_reply,
    true,
    v_user_id
  )
  on conflict (message_id) where message_id is not null do update
  set conversation = excluded.conversation,
      expected_status = excluded.expected_status,
      expected_summary = excluded.expected_summary,
      correction_note = excluded.correction_note,
      rating = excluded.rating,
      expected_reply = excluded.expected_reply,
      active = true,
      created_by = excluded.created_by,
      updated_at = now()
  returning id into v_example_id;

  return v_example_id;
end;
$$;

revoke all on function public.review_ai_message(uuid, text, text) from public, anon;
grant execute on function public.review_ai_message(uuid, text, text) to authenticated;
