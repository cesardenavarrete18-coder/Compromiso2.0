-- Classifier scope must not absorb closed/DNC/sold leads into no-contact Cold.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition !~* 'lead\.closed_at is null' then
    raise exception 'Closed leads must be excluded';
  end if;
  if v_definition !~* 'not coalesce\(lead\.do_not_contact, false\)' then
    raise exception 'DNC leads must be excluded';
  end if;
  if v_definition !~* 'public\.sales_cases' then
    raise exception 'Sales cases must be excluded';
  end if;
end;
$$;

rollback;
