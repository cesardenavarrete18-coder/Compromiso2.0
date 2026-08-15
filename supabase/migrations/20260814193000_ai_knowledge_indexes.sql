-- Cover management foreign keys used by the AI knowledge center.
create index if not exists ai_assistant_settings_updated_by_idx
  on public.ai_assistant_settings (updated_by);

create index if not exists ai_knowledge_documents_created_by_idx
  on public.ai_knowledge_documents (created_by);

create index if not exists ai_training_examples_created_by_idx
  on public.ai_training_examples (created_by);
