-- Static integration guard: the historical reconciliation only considers
-- completed sequences attached to still-active Nuevo/No contesta CRM cards.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition !~* 'status in \(''nuevo'', ''no_contesta''\)' then
    raise exception 'Backfill classifier must be restricted to active no-contact statuses';
  end if;
  if v_definition !~* 'next_contact_at is null' then
    raise exception 'Backfill classifier must preserve manual next actions';
  end if;
end;
$$;

rollback;
