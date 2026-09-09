-- Allow one bank credit condition to apply to versions from multiple models.
-- Applicability remains snapshotted through bank_credit_offer_versions.

alter table public.bank_credit_offers
  alter column model_id drop not null;

comment on column public.bank_credit_offers.model_id is
  'Legacy single-model anchor. New multi-vehicle credits use NULL and derive applicability exclusively from bank_credit_offer_versions.';

create or replace function public.admin_upsert_bank_credit_offer(
  p_offer_id uuid,
  p_financier_name text,
  p_offer_name text,
  p_term_months integer,
  p_min_financed_amount numeric,
  p_max_financed_amount numeric,
  p_installment_coefficient numeric,
  p_breakage_rate numeric,
  p_patenting_rate numeric,
  p_fixed_expenses numeric,
  p_tna numeric,
  p_cftea numeric,
  p_notes text,
  p_valid_from date,
  p_valid_to date,
  p_active boolean,
  p_sort_order integer,
  p_version_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offer_id uuid;
  v_requested_count integer;
  v_existing_count integer;
begin
  if not (select private.current_user_is_admin()) then
    raise exception 'Administrator privileges required'
      using errcode = '42501';
  end if;

  v_requested_count := coalesce(cardinality(p_version_ids), 0);
  if v_requested_count = 0 then
    raise exception 'At least one vehicle version is required'
      using errcode = '22023';
  end if;

  select count(distinct mv.id)
  into v_existing_count
  from unnest(p_version_ids) as requested(version_id)
  join public.model_versions mv on mv.id = requested.version_id
  where mv.active = true;

  if v_existing_count <> (select count(distinct version_id) from unnest(p_version_ids) as requested(version_id)) then
    raise exception 'One or more selected vehicle versions do not exist or are inactive'
      using errcode = '22023';
  end if;

  if p_offer_id is null then
    insert into public.bank_credit_offers (
      model_id,
      financier_name,
      offer_name,
      term_months,
      min_financed_amount,
      max_financed_amount,
      installment_coefficient,
      breakage_rate,
      patenting_rate,
      fixed_expenses,
      tna,
      cftea,
      notes,
      valid_from,
      valid_to,
      active,
      sort_order,
      updated_by
    ) values (
      null,
      trim(p_financier_name),
      trim(p_offer_name),
      p_term_months,
      p_min_financed_amount,
      p_max_financed_amount,
      p_installment_coefficient,
      coalesce(p_breakage_rate, 0),
      coalesce(p_patenting_rate, 0),
      coalesce(p_fixed_expenses, 0),
      p_tna,
      p_cftea,
      coalesce(p_notes, ''),
      p_valid_from,
      p_valid_to,
      coalesce(p_active, true),
      coalesce(p_sort_order, 10),
      (select auth.uid())
    )
    returning id into v_offer_id;
  else
    update public.bank_credit_offers
    set model_id = null,
        financier_name = trim(p_financier_name),
        offer_name = trim(p_offer_name),
        term_months = p_term_months,
        min_financed_amount = p_min_financed_amount,
        max_financed_amount = p_max_financed_amount,
        installment_coefficient = p_installment_coefficient,
        breakage_rate = coalesce(p_breakage_rate, 0),
        patenting_rate = coalesce(p_patenting_rate, 0),
        fixed_expenses = coalesce(p_fixed_expenses, 0),
        tna = p_tna,
        cftea = p_cftea,
        notes = coalesce(p_notes, ''),
        valid_from = p_valid_from,
        valid_to = p_valid_to,
        active = coalesce(p_active, true),
        sort_order = coalesce(p_sort_order, sort_order),
        updated_by = (select auth.uid()),
        updated_at = now()
    where id = p_offer_id
    returning id into v_offer_id;

    if v_offer_id is null then
      raise exception 'Bank credit offer not found'
        using errcode = 'P0002';
    end if;

    delete from public.bank_credit_offer_versions
    where offer_id = v_offer_id;
  end if;

  insert into public.bank_credit_offer_versions (offer_id, version_id)
  select v_offer_id, requested.version_id
  from (
    select distinct version_id
    from unnest(p_version_ids) as input(version_id)
  ) as requested;

  return v_offer_id;
end;
$$;

create or replace function private.validate_sales_quote_bank_credit_applicability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.offer_type = 'bank_credit' and not exists (
    select 1
    from public.bank_credit_offer_versions link
    join public.model_versions version on version.id = link.version_id
    where link.offer_id = new.bank_credit_offer_id
      and version.model_id = new.model_id
      and version.name = new.vehicle_version
  ) then
    raise exception 'Selected bank credit does not apply to this model/version'
      using errcode = '23514',
            constraint = 'sales_quotes_bank_credit_applicability';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_sales_quote_bank_credit_applicability on public.sales_quotes;
create trigger validate_sales_quote_bank_credit_applicability
before insert or update of bank_credit_offer_id, model_id, vehicle_version, offer_type
on public.sales_quotes
for each row
execute function private.validate_sales_quote_bank_credit_applicability();

revoke all on function private.validate_sales_quote_bank_credit_applicability() from public, anon, authenticated;

revoke all on function public.admin_upsert_bank_credit_offer(
  uuid, text, text, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, date, date, boolean, integer, uuid[]
) from public, anon;

grant execute on function public.admin_upsert_bank_credit_offer(
  uuid, text, text, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, date, date, boolean, integer, uuid[]
) to authenticated;
