-- CRM V2 Playbook ACL hardening.
-- Forward-only security correction after Production revealed broad default grants
-- on newly created tables/sequences. This migration changes privileges only;
-- it does not modify Lead, CRM, Recall, Playbook or activity data.

revoke all on table public.lead_management_playbook_items
from anon, authenticated;

revoke all on table public.lead_management_playbook_events
from anon, authenticated;

revoke all on sequence public.lead_management_playbook_events_id_seq
from anon, authenticated;

grant select, insert, update
on table public.lead_management_playbook_items
to authenticated;

grant select
on table public.lead_management_playbook_events
to authenticated;

notify pgrst, 'reload schema';
