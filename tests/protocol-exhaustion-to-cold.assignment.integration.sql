-- Automatic cold classification must not rewrite seller ownership history.

begin;

do $$
declare v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition ~* 'assigned_seller_user_id\s*=' then
    raise exception 'Protocol exhaustion must not reassign the lead';
  end if;
end;
$$;

rollback;
