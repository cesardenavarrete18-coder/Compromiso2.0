-- The obsolete 3-call/4-WhatsApp shape is intentionally not backfilled.
-- This protects historical rows whose old semantics were different.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.lead_has_canonical_cold_base_evidence(uuid)'::regprocedure);
begin
  if v_definition ~* 'call_count = 3' then
    raise exception 'Obsolete 3+4 protocol must not qualify as canonical cold-base evidence';
  end if;
end;
$$;

rollback;
