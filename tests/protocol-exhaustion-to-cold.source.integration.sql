-- Automatic cold classification does not rewrite lead source attribution.

begin;

do $$
declare v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition ~* 'source_(channel|detail)\s*=' then
    raise exception 'Protocol exhaustion must preserve original source attribution';
  end if;
end;
$$;

rollback;
