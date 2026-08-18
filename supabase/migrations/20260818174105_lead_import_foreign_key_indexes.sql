create index lead_import_batches_imported_by_idx
  on public.lead_import_batches (imported_by);

create index lead_import_rows_lead_idx
  on public.lead_import_rows (lead_id)
  where lead_id is not null;

create index lead_import_rows_recall_item_idx
  on public.lead_import_rows (recall_item_id)
  where recall_item_id is not null;

create index lead_recall_attempts_seller_idx
  on public.lead_recall_attempts (seller_user_id, contacted_at desc);

create index lead_recall_items_assigned_by_idx
  on public.lead_recall_items (assigned_by_user_id)
  where assigned_by_user_id is not null;

create index lead_recall_items_import_batch_idx
  on public.lead_recall_items (import_batch_id)
  where import_batch_id is not null;

create index seller_lead_submissions_lead_idx
  on public.seller_lead_submissions (lead_id)
  where lead_id is not null;

create index seller_lead_submissions_reviewed_by_idx
  on public.seller_lead_submissions (reviewed_by_user_id)
  where reviewed_by_user_id is not null;
