-- Once moved to Base fria, rerunning classification must be a no-op.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition !~* 'crm\.status in \(''nuevo'', ''no_contesta''\)' then
    raise exception 'Classifier must only enter from active no-contact statuses';
  end if;
  if v_definition !~* 'cold_base_at is null' then
    raise exception 'Classifier must not rewrite an existing cold marker';
  end if;
end;
$$;

rollback;
