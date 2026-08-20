-- Cover the actor foreign keys used by audit and ownership lookups.
create index whatsapp_conversation_controls_taken_by_idx
  on public.whatsapp_conversation_controls (taken_by_user_id)
  where taken_by_user_id is not null;
create index whatsapp_conversation_controls_released_by_idx
  on public.whatsapp_conversation_controls (released_by_user_id)
  where released_by_user_id is not null;
create index whatsapp_conversation_events_actor_idx
  on public.whatsapp_conversation_events (actor_user_id)
  where actor_user_id is not null;
