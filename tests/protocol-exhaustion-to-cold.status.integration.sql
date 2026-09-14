-- Base fria classification uses the existing CRM V2 terminal representation.

begin;

do $$
declare
  v_definition text := pg_get_functiondef('private.classify_exhausted_contact_protocol(uuid,uuid,text)'::regprocedure);
begin
  if v_definition !~* 'status = ''desistir''' then raise exception 'Expected Desistir cold status'; end if;
  if v_definition !~* 'status_reason = ''No contactado post protocolo''' then raise exception 'Expected canonical cold reason'; end if;
  if v_definition !~* 'previous_status = v_previous_status' then raise exception 'Previous status must be preserved'; end if;
end;
$$;

rollback;
