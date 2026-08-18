alter table public.model_versions
  add column if not exists suggested_price numeric(14,2);

alter table public.model_versions
  drop constraint if exists model_versions_suggested_price_check;

alter table public.model_versions
  add constraint model_versions_suggested_price_check
  check (suggested_price is null or suggested_price >= 0);

alter table public.sales_quotes
  add column if not exists breakage_base_amount numeric(14,2) not null default 0,
  add column if not exists breakage_vat_amount numeric(14,2) not null default 0;

alter table public.sales_quotes
  drop constraint if exists sales_quotes_breakage_base_amount_check,
  drop constraint if exists sales_quotes_breakage_vat_amount_check;

alter table public.sales_quotes
  add constraint sales_quotes_breakage_base_amount_check
    check (breakage_base_amount >= 0),
  add constraint sales_quotes_breakage_vat_amount_check
    check (breakage_vat_amount >= 0);

comment on column public.model_versions.suggested_price is
  'Precio sugerido de venta convencional. El vendedor puede ajustarlo al emitir un presupuesto de credito.';

comment on column public.sales_quotes.breakage_base_amount is
  'Quebranto base calculado sobre el importe financiado, antes de IVA.';

comment on column public.sales_quotes.breakage_vat_amount is
  'IVA del 21 por ciento calculado exclusivamente sobre el quebranto base.';
