-- Skipped protocol windows remain factual system misses, not seller contacts.

begin;

do $$
declare v_definition text := pg_get_functiondef('private.lead_has_canonical_cold_base_evidence(uuid)'::regprocedure);
begin
  if v_definition !~* 'status = ''skipped'' and task\.outcome = ''skipped''' then
    raise exception 'Skipped windows must remain skipped evidence';
  end if;
end;
$$;

rollback;
