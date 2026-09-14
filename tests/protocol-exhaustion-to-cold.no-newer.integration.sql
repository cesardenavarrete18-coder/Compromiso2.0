-- Only the latest non-cancelled contact sequence may drive automatic Cold.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.lead_has_canonical_cold_base_evidence(uuid)'::regprocedure);
begin
  if v_definition !~* 'newer_sequence' then
    raise exception 'Canonical exhaustion must reject a superseded sequence';
  end if;
  if v_definition !~* 'active_sequence' then
    raise exception 'Canonical exhaustion must reject leads with an active sequence';
  end if;
end;
$$;

rollback;
