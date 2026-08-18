-- Polish the commercial workflow after the first end-to-end user test.

alter table public.campaigns
  add column if not exists final_price numeric(16, 2);

alter table public.campaigns
  drop constraint if exists campaigns_final_price_nonnegative;

alter table public.campaigns
  add constraint campaigns_final_price_nonnegative
  check (final_price is null or final_price >= 0);

alter table public.sales_documents
  drop constraint if exists sales_documents_type;

alter table public.sales_documents
  add constraint sales_documents_type check (document_type in (
    'dni_holder_front',
    'dni_holder_back',
    'payment_receipt',
    'dni_coholder_front',
    'dni_coholder_back',
    'signed_contract',
    'supporting_document',
    'minute',
    'quote',
    'receipt',
    'dni'
  ));

create or replace function private.normalize_plan_sale_request()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_vehicle text;
begin
  if new.quote_id is null then return new; end if;

  select * into v_quote
  from public.sales_quotes
  where id = new.quote_id;

  if v_quote.id is null or v_quote.lead_id <> new.lead_id then
    raise exception 'El presupuesto no corresponde a este lead';
  end if;

  if v_quote.offer_type = 'savings_plan' then
    v_vehicle := trim(concat_ws(' ',
      nullif(v_quote.commercial_snapshot ->> 'brand', ''),
      nullif(v_quote.commercial_snapshot ->> 'model', ''),
      nullif(v_quote.vehicle_version, '')
    ));
    if char_length(v_vehicle) >= 2 then new.vehicle := v_vehicle; end if;
    new.sale_amount := v_quote.sale_price;
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_plan_sale_request() from public, anon, authenticated;

drop trigger if exists lead_sale_requests_normalize_plan on public.lead_sale_requests;
create trigger lead_sale_requests_normalize_plan
  before insert or update of quote_id, vehicle, sale_amount
  on public.lead_sale_requests
  for each row execute function private.normalize_plan_sale_request();
