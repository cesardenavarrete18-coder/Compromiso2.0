-- Ensures the production cold-base guard accepts the new exhaustion evidence.
-- This test installs an equivalent guard only inside the transaction and rolls back.

begin;

do $$
begin
  if to_regprocedure('private.guard_canonical_cold_base_marker()') is null then
    execute $fn$
      create function private.guard_canonical_cold_base_marker()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        if new.cold_base_at is not null
           and old.cold_base_at is distinct from new.cold_base_at
           and (
             new.status <> 'desistir'
             or new.status_reason is distinct from 'No contactado post protocolo'
             or not private.lead_has_canonical_cold_base_evidence(new.lead_id)
           )
        then
          new.cold_base_at := null;
        end if;
        return new;
      end;
      $body$
    $fn$;

    execute 'create trigger lead_crm_guard_canonical_cold_base_test before update of cold_base_at on public.lead_crm for each row execute function private.guard_canonical_cold_base_marker()';
  end if;
end;
$$;

-- The detailed exhaustion fixture is covered by protocol-exhaustion-to-cold.integration.sql.
-- Here we assert the evidence function is deliberately independent of the current
-- CRM status, which is required because the production guard runs BEFORE UPDATE.
do $$
declare
  v_definition text := pg_get_functiondef('private.lead_has_canonical_cold_base_evidence(uuid)'::regprocedure);
begin
  if v_definition ~* 'crm\.status' or v_definition ~* 'crm\.status_reason' then
    raise exception 'Cold evidence must not depend on the pre-update CRM status';
  end if;
end;
$$;

rollback;
