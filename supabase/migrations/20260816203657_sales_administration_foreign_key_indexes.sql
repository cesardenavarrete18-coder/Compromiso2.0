-- Cover foreign keys introduced by the sales administration module.

create index if not exists bank_credit_offers_updated_by_idx
  on public.bank_credit_offers (updated_by);

create index if not exists client_installments_updated_by_idx
  on public.client_installments (updated_by);

create index if not exists sales_cases_quote_idx
  on public.sales_cases (quote_id);

create index if not exists sales_documents_uploaded_by_idx
  on public.sales_documents (uploaded_by);

create index if not exists sales_notifications_case_idx
  on public.sales_notifications (sales_case_id);

create index if not exists sales_quotes_bank_credit_offer_idx
  on public.sales_quotes (bank_credit_offer_id);

create index if not exists sales_quotes_campaign_idx
  on public.sales_quotes (campaign_id);

create index if not exists sales_quotes_model_idx
  on public.sales_quotes (model_id);
