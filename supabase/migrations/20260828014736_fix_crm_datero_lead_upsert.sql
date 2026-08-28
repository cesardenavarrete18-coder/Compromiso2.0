-- PostgREST sends ON CONFLICT (lead_id) for CRM Datero upserts. A partial
-- unique index cannot be inferred without its predicate, so replace it with a
-- plain unique constraint. PostgreSQL still permits multiple NULL lead_id
-- values, preserving the Precalificado and sales-case origins.

drop index if exists public.commercial_applications_lead_unique;

alter table public.commercial_applications
  add constraint commercial_applications_lead_unique unique (lead_id);

notify pgrst, 'reload schema';
