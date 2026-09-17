-- TEST-ONLY replacement after verifying the installed hook is closed.
-- No data/config/payload can activate this replacement in the migration itself.
CREATE OR REPLACE FUNCTION private.crm_apply_foundation_probe(
  p_command_id uuid, p_lead_id uuid, p_payload jsonb, p_context jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  BEGIN
    INSERT INTO m1_fixture.probe_effects(operation_id, command_id, lead_id, value, context)
    VALUES ((p_payload->>'operation_id')::uuid, p_command_id, p_lead_id,
            (p_payload->>'value')::bigint, p_context);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0104', MESSAGE = 'DUPLICATE_INTENT';
  END;
  IF EXISTS (SELECT 1 FROM m1_fixture.failpoints
             WHERE operation_id = (p_payload->>'operation_id')::uuid AND fail_after_effect) THEN
    RAISE EXCEPTION USING ERRCODE = 'P9999', MESSAGE = 'FIXTURE_FAILURE_AFTER_EFFECT';
  END IF;
  RETURN p_payload;
END;
$$;
