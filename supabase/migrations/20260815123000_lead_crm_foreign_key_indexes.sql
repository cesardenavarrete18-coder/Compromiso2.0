-- Cover foreign keys used by CRM authorization, audit and operational lookups.
create index if not exists lead_assignments_assigned_by_idx on public.lead_assignments (assigned_by_user_id);
create index if not exists lead_crm_sale_requested_by_idx on public.lead_crm (sale_requested_by);
create index if not exists lead_crm_sale_confirmed_by_idx on public.lead_crm (sale_confirmed_by);
create index if not exists lead_crm_updated_by_idx on public.lead_crm (updated_by);
create index if not exists lead_sale_requests_reviewed_by_idx on public.lead_sale_requests (reviewed_by);
create index if not exists leads_assigned_by_idx on public.leads (assigned_by_user_id);
create index if not exists seller_routing_settings_updated_by_idx on public.seller_routing_settings (updated_by);
create index if not exists supervisor_notifications_lead_idx on public.supervisor_notifications (lead_id);
