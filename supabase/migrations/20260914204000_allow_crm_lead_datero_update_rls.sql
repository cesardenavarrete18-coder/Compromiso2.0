-- Allow CRM Lead-originated Dateros to be updated by their currently assigned seller.
-- This closes the gap between the INSERT policy introduced by
-- 20260828011601_crm_lead_shared_datero.sql and the legacy UPDATE policy,
-- which only recognized prequalification-originated drafts.

drop policy if exists commercial_applications_update_prequalification_or_sales_admin
on public.commercial_applications;

create policy commercial_applications_update_prequalification_or_sales_admin
on public.commercial_applications
for update
to authenticated
using (
  (
    sales_case_id is null
    and seller_user_id = (select auth.uid())
    and private.current_user_active()
    and (
      (
        prequalification_event_id is not null
        and lead_id is null
        and exists (
          select 1
          from public.prequalification_events event
          where event.id = commercial_applications.prequalification_event_id
            and event.seller_user_id = (select auth.uid())
        )
      )
      or (
        prequalification_event_id is null
        and lead_id is not null
        and exists (
          select 1
          from public.leads lead
          where lead.id = commercial_applications.lead_id
            and lead.assigned_seller_user_id = (select auth.uid())
        )
      )
    )
  )
  or private.current_user_can_administer_sales()
)
with check (
  (
    sales_case_id is null
    and seller_user_id = (select auth.uid())
    and private.current_user_active()
    and (
      (
        prequalification_event_id is not null
        and lead_id is null
        and exists (
          select 1
          from public.prequalification_events event
          where event.id = commercial_applications.prequalification_event_id
            and event.seller_user_id = (select auth.uid())
        )
      )
      or (
        prequalification_event_id is null
        and lead_id is not null
        and exists (
          select 1
          from public.leads lead
          where lead.id = commercial_applications.lead_id
            and lead.assigned_seller_user_id = (select auth.uid())
        )
      )
    )
  )
  or private.current_user_can_administer_sales()
);

notify pgrst, 'reload schema';
