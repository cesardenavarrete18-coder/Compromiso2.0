-- Automatic Cold classification must remain auditable.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition !~* 'Lead clasificado como Base fría' then
    raise exception 'Missing automatic Base fria activity';
  end if;
  if v_definition !~* '''automatic'', true' then
    raise exception 'Automatic classification must be marked in activity metadata';
  end if;
  if v_definition !~* 'protocol_completed_at' then
    raise exception 'Activity must record protocol completion time';
  end if;
end;
$$;

rollback;
