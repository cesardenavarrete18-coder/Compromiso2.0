-- Isolated synthetic aggregate; no installed legacy business handler is enabled.
CREATE SCHEMA m1_fixture;
CREATE TABLE m1_fixture.probe_effects (
  operation_id uuid PRIMARY KEY,
  command_id uuid NOT NULL UNIQUE,
  lead_id uuid NOT NULL,
  value bigint NOT NULL,
  context jsonb NOT NULL
);
CREATE TABLE m1_fixture.failpoints (
  operation_id uuid PRIMARY KEY,
  fail_after_effect boolean NOT NULL DEFAULT false
);
GRANT USAGE ON SCHEMA m1_fixture TO crm_runtime_owner;
GRANT SELECT, INSERT ON m1_fixture.probe_effects TO crm_runtime_owner;
GRANT SELECT ON m1_fixture.failpoints TO crm_runtime_owner;

INSERT INTO auth.users(id) VALUES
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000003'),
('00000000-0000-4000-8000-000000000004'),
('00000000-0000-4000-8000-000000000005'),
('00000000-0000-4000-8000-000000000006');
INSERT INTO public.profiles(user_id, role, active) VALUES
('00000000-0000-4000-8000-000000000001', 'seller', true),
('00000000-0000-4000-8000-000000000002', 'seller', true),
('00000000-0000-4000-8000-000000000003', 'seller', false),
('00000000-0000-4000-8000-000000000004', 'supervisor', true),
('00000000-0000-4000-8000-000000000005', 'admin', true),
('00000000-0000-4000-8000-000000000006', 'admventas', true);
INSERT INTO private.crm_runtime_policies(policy_version, policy_hash, snapshot, publisher_subject, baseline_manifest_id)
SELECT 'fixture-v1', encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), snapshot,
       'isolated-fixture', 'm1-foundation-fixture/1'
FROM (SELECT '{"project_ref":"m1_fixture_local"}'::jsonb AS snapshot) AS fixture;
