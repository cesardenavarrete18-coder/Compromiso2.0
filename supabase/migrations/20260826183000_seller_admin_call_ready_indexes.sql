-- Cover the foreign keys introduced by the seller/admin handoff workflow.

create index if not exists sales_cases_admin_call_requested_by_idx
  on public.sales_cases (admin_call_requested_by)
  where admin_call_requested_by is not null;
