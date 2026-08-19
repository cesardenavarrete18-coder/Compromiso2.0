create or replace function private.enforce_plan_minute_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer_type text := 'savings_plan';
  v_total_installments integer;
  v_expected_remaining integer;
begin
  -- El datero del Apto es provisorio: todavía no declara cuotas abonadas
  -- ni cuotas restantes. La regla 1/83 o 1/119 corresponde exclusivamente
  -- a la minuta definitiva que el vendedor completa después de la aprobación.
  if new.sales_case_id is null then
    return new;
  end if;

  if new.brand_name not in ('Volkswagen', 'Peugeot', 'Fiat') then
    raise exception 'La minuta requiere una marca válida';
  end if;

  select coalesce(quote.offer_type, 'savings_plan') into v_offer_type
  from public.sales_cases sales_case
  left join public.sales_quotes quote on quote.id = sales_case.quote_id
  where sales_case.id = new.sales_case_id;

  if v_offer_type = 'savings_plan' then
    v_total_installments := coalesce(
      nullif(new.commercial_snapshot ->> 'installmentCount', '')::integer,
      nullif(new.commercial_snapshot ->> 'total_installments', '')::integer,
      new.installments_paid + new.installments_to_pay
    );
    v_expected_remaining := case when v_total_installments = 120 then 119 else 83 end;
    if new.installments_paid <> 1 or new.installments_to_pay <> v_expected_remaining then
      raise exception 'Las cuotas del plan deben ser 1/%', v_expected_remaining;
    end if;
  end if;

  return new;
end;
$$;
