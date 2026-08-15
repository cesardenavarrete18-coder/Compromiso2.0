-- Private commercial knowledge base used by the WhatsApp assistant.

create table public.ai_assistant_settings (
  id boolean primary key default true check (id),
  qualification_rules text not null default 'Calificar cuando exista un modelo o tipo de vehículo definido, una modalidad de compra y al menos un dato concreto de capacidad o intención (anticipo, usado, plazo, visita o seña).',
  vector_store_id text,
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_assistant_settings_rules_length check (char_length(qualification_rules) between 20 and 10000)
);

insert into public.ai_assistant_settings (id) values (true) on conflict (id) do nothing;

create table public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text not null default 'General',
  category text not null default 'Condiciones comerciales',
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  openai_file_id text,
  processing_status text not null default 'pending',
  processing_error text,
  active boolean not null default true,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_documents_title_length check (char_length(title) between 2 and 160),
  constraint ai_knowledge_documents_brand_length check (char_length(brand) between 2 and 80),
  constraint ai_knowledge_documents_category_length check (char_length(category) between 2 and 100),
  constraint ai_knowledge_documents_status check (processing_status in ('pending', 'processing', 'ready', 'error')),
  constraint ai_knowledge_documents_pdf check (mime_type = 'application/pdf')
);

create index ai_knowledge_documents_status_idx on public.ai_knowledge_documents (active, processing_status, created_at desc);

create table public.ai_training_examples (
  id uuid primary key default gen_random_uuid(),
  conversation text not null,
  expected_status text not null,
  expected_summary text not null default '',
  correction_note text not null default '',
  active boolean not null default true,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_training_examples_status check (expected_status in ('qualified', 'follow_up', 'unqualified')),
  constraint ai_training_examples_conversation_length check (char_length(conversation) between 2 and 20000)
);

create trigger ai_assistant_settings_set_updated_at
  before update on public.ai_assistant_settings
  for each row execute function private.set_updated_at();

create trigger ai_knowledge_documents_set_updated_at
  before update on public.ai_knowledge_documents
  for each row execute function private.set_updated_at();

create trigger ai_training_examples_set_updated_at
  before update on public.ai_training_examples
  for each row execute function private.set_updated_at();

alter table public.ai_assistant_settings enable row level security;
alter table public.ai_knowledge_documents enable row level security;
alter table public.ai_training_examples enable row level security;

create policy ai_assistant_settings_admin_all
on public.ai_assistant_settings for all to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

create policy ai_knowledge_documents_admin_all
on public.ai_knowledge_documents for all to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

create policy ai_training_examples_admin_all
on public.ai_training_examples for all to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

grant select, insert, update, delete on public.ai_assistant_settings, public.ai_knowledge_documents, public.ai_training_examples to authenticated;
grant all on public.ai_assistant_settings, public.ai_knowledge_documents, public.ai_training_examples to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-commercial-knowledge', 'ai-commercial-knowledge', false, 20971520, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy ai_knowledge_storage_admin_select
on storage.objects for select to authenticated
using (bucket_id = 'ai-commercial-knowledge' and private.current_user_is_admin());

create policy ai_knowledge_storage_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'ai-commercial-knowledge' and private.current_user_is_admin());

create policy ai_knowledge_storage_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'ai-commercial-knowledge' and private.current_user_is_admin())
with check (bucket_id = 'ai-commercial-knowledge' and private.current_user_is_admin());

create policy ai_knowledge_storage_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'ai-commercial-knowledge' and private.current_user_is_admin());
