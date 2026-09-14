-- Recall availability for protocol-exhausted leads is anchored to the actual
-- protocol completion, not the date a historical backfill is deployed.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition !~* 'available_at = least\(available_at, \$1 \+ interval ''15 days''\)' then
    raise exception 'Recall timing must be anchored to protocol completion';
  end if;
end;
$$;

rollback;
