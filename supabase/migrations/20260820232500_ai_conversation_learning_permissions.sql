-- Explicitly remove PostgREST anonymous access from the learning RPC.

revoke all on function public.review_ai_message(uuid, text, text) from public, anon;
grant execute on function public.review_ai_message(uuid, text, text) to authenticated;

