-- Capabilities for NEW M1 foundation objects only.
-- No LOGIN worker, password, legacy table grant/policy, or channel capability.
begin;

create role crm_runtime_owner with
  nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;

-- PostgreSQL 17 requires SET membership and schema CREATE to transfer ownership
-- when the migration executor is not a superuser. Only postgres receives this
-- administrative membership, never authenticated, authenticator or a worker.
grant crm_runtime_owner to postgres with admin true, inherit false, set true;
grant usage, create on schema private to crm_runtime_owner;

alter table private.crm_runtime_policies owner to crm_runtime_owner;
alter table private.crm_runtime_gates owner to crm_runtime_owner;
alter table private.crm_conversation_state owner to crm_runtime_owner;
alter table private.crm_lead_runtime owner to crm_runtime_owner;
alter function private.crm_reject_policy_mutation() owner to crm_runtime_owner;

-- Defaults belong ONLY to the new owner. A schema-local REVOKE cannot remove
-- the built-in global PUBLIC EXECUTE default, so revoke that owner-wide.
set local role crm_runtime_owner;
alter default privileges revoke execute on functions from public;
alter default privileges revoke all on tables from public, anon, authenticated, service_role;
alter default privileges revoke all on sequences from public, anon, authenticated, service_role;

alter table private.crm_runtime_policies enable row level security;
alter table private.crm_runtime_policies force row level security;
alter table private.crm_runtime_gates enable row level security;
alter table private.crm_runtime_gates force row level security;
alter table private.crm_conversation_state enable row level security;
alter table private.crm_conversation_state force row level security;
alter table private.crm_lead_runtime enable row level security;
alter table private.crm_lead_runtime force row level security;

create policy crm_runtime_owner_all on private.crm_runtime_policies
  for all to crm_runtime_owner using (true) with check (true);
create policy crm_runtime_owner_all on private.crm_runtime_gates
  for all to crm_runtime_owner using (true) with check (true);
create policy crm_runtime_owner_all on private.crm_conversation_state
  for all to crm_runtime_owner using (true) with check (true);
create policy crm_runtime_owner_all on private.crm_lead_runtime
  for all to crm_runtime_owner using (true) with check (true);

revoke all on table private.crm_runtime_policies, private.crm_runtime_gates,
  private.crm_conversation_state, private.crm_lead_runtime
  from public, anon, authenticated, service_role;
revoke all on function private.crm_reject_policy_mutation()
  from public, anon, authenticated, service_role;
reset role;

-- Keep only schema USAGE. DDL and SET are removed before the transaction ends.
-- ADMIN without SET/INHERIT lets the trusted migration administrator perform a
-- future reviewed owner transfer; it does not grant runtime access to clients.
revoke create on schema private from crm_runtime_owner;
grant crm_runtime_owner to postgres with admin true, inherit false, set false;

comment on role crm_runtime_owner is
  'NOLOGIN owner of closed M1 foundation objects. No membership for API roles or workers; postgres administrative membership only.';

commit;
