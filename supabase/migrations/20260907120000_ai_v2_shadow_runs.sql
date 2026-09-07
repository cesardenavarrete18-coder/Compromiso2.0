-- Local-only migration. Shadow stores references and derived audit data, never duplicate customer PII.
create table public.ai_v2_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  inbound_message_id uuid not null unique references public.lead_messages(id) on delete cascade,
  previous_shadow_run_id uuid null references public.ai_v2_shadow_runs(id) on delete set null,
  schema_version text not null default 'filter-v1-semantic-extractor/1.3',
  runtime_fingerprint text not null,
  filter_model text not null,
  status text not null check (status in ('processing','completed','failed','superseded')),
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  v1_decision jsonb null,
  semantic_extraction jsonb null,
  normalized_extraction jsonb null,
  safety_firewall_result jsonb null,
  engine_result jsonb null,
  next_state jsonb null,
  response_plan jsonb null,
  handoff_decision jsonb null,
  resolved_facts jsonb null,
  structured_facts jsonb null,
  knowledge_request jsonb null,
  knowledge_evidence jsonb null,
  v2_candidate_reply text null,
  candidate_reply_status text not null default 'pending',
  would_handoff boolean not null default false,
  would_continue_answering boolean not null default false,
  would_suppress_for_human boolean not null default false,
  error_code text null,
  error_detail text null,
  created_at timestamptz not null default now()
);
create index ai_v2_shadow_runs_lead_created_idx on public.ai_v2_shadow_runs (lead_id, created_at desc);
create index ai_v2_shadow_runs_created_idx on public.ai_v2_shadow_runs (created_at desc);
create index ai_v2_shadow_runs_status_idx on public.ai_v2_shadow_runs (status);
alter table public.ai_v2_shadow_runs enable row level security;
create policy "Authenticated admins can read AI V2 shadow runs" on public.ai_v2_shadow_runs for select to authenticated using (private.current_user_is_admin());
revoke all on public.ai_v2_shadow_runs from anon, authenticated;
grant select on public.ai_v2_shadow_runs to authenticated;
grant all on public.ai_v2_shadow_runs to service_role;
