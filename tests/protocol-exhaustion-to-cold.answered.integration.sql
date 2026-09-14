-- Any recorded answer blocks automatic Base fria classification.
-- Isolated validation fixture; always rolls back.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.lead_has_canonical_cold_base_evidence(uuid)'::regprocedure);
begin
  if v_definition !~* 'answered_count = 0' then
    raise exception 'Canonical exhaustion evidence must reject answered tasks';
  end if;
end;
$$;

rollback;
