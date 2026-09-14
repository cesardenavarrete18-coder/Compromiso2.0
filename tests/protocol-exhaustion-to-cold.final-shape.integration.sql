-- Final static contract for exhausted protocol shape.

begin;

do $$
declare v_definition text := pg_get_functiondef('private.lead_has_canonical_cold_base_evidence(uuid)'::regprocedure);
begin
  if v_definition !~* 'call_count = 18' or v_definition !~* 'whatsapp_count = 2' or v_definition !~* 'protocol_band_count = 9' then
    raise exception 'Current 18+2 / 9-band protocol shape missing';
  end if;
end;
$$;

rollback;
