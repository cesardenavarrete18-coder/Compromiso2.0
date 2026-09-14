-- Entering Base fria clears active agenda fields.

begin;

do $$
declare v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition !~* 'next_contact_at = null' then raise exception 'Cold must clear next_contact_at'; end if;
  if v_definition !~* 'next_contact_note = ''''' then raise exception 'Cold must clear next_contact_note'; end if;
  if v_definition !~* 'next_contact_source = null' then raise exception 'Cold must clear next_contact_source'; end if;
end;
$$;

rollback;
