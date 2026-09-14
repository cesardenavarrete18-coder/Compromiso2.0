-- Backfill and live completion paths carry explicit audit origins.

begin;

do $$
declare v_definition text := pg_get_functiondef('private.classify_completed_contact_protocol()'::regprocedure);
begin
  if v_definition !~* 'protocol_sequence_completed' then raise exception 'Live completion origin missing'; end if;
end;
$$;

rollback;
