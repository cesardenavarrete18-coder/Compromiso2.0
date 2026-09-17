-- DIAGNOSTIC ONLY: captured schema overlay, never a production migration.

-- No application rows, event table, mode RPC, Edge handler or provider is included.

-- The human-mode trigger is retained verbatim but that branch is not exercised.

BEGIN;

SET LOCAL search_path = public, extensions;

CREATE TABLE public.whatsapp_conversation_controls (
  "lead_id" uuid NOT NULL,
  "mode" text NOT NULL DEFAULT 'ai'::text,
  "taken_by_user_id" uuid,
  "taken_at" timestamp with time zone,
  "released_by_user_id" uuid,
  "released_at" timestamp with time zone,
  "last_human_message_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversation_controls ADD CONSTRAINT "whatsapp_conversation_controls_human_owner" CHECK (((mode = 'ai'::text) OR ((taken_by_user_id IS NOT NULL) AND (taken_at IS NOT NULL))));

ALTER TABLE public.whatsapp_conversation_controls ADD CONSTRAINT "whatsapp_conversation_controls_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_conversation_controls ADD CONSTRAINT "whatsapp_conversation_controls_mode" CHECK ((mode = ANY (ARRAY['ai'::text, 'human'::text])));

ALTER TABLE public.whatsapp_conversation_controls ADD CONSTRAINT "whatsapp_conversation_controls_pkey" PRIMARY KEY (lead_id);

ALTER TABLE public.whatsapp_conversation_controls ADD CONSTRAINT "whatsapp_conversation_controls_released_by_user_id_fkey" FOREIGN KEY (released_by_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_conversation_controls ADD CONSTRAINT "whatsapp_conversation_controls_taken_by_user_id_fkey" FOREIGN KEY (taken_by_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

CREATE INDEX whatsapp_conversation_controls_mode_updated_idx ON public.whatsapp_conversation_controls USING btree (mode, updated_at DESC);

CREATE INDEX whatsapp_conversation_controls_released_by_idx ON public.whatsapp_conversation_controls USING btree (released_by_user_id) WHERE (released_by_user_id IS NOT NULL);

CREATE INDEX whatsapp_conversation_controls_taken_by_idx ON public.whatsapp_conversation_controls USING btree (taken_by_user_id) WHERE (taken_by_user_id IS NOT NULL);

CREATE OR REPLACE FUNCTION private.current_user_can_manage_whatsapp(p_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    left join public.leads l on l.id = p_lead_id
    where p.user_id = (select auth.uid())
      and p.active = true
      and (
        p.role::text in ('admin', 'supervisor')
        or (p.role::text = 'seller' and l.assigned_seller_user_id = p.user_id)
      )
  );
$function$;

ALTER FUNCTION private.current_user_can_manage_whatsapp(p_lead_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.current_user_can_manage_whatsapp(p_lead_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.current_user_can_manage_whatsapp(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.cancel_whatsapp_follow_up_on_takeover()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.mode = 'human' then
    update public.whatsapp_follow_up_reminders
    set status = 'cancelled', last_error = 'Conversación tomada por una persona'
    where lead_id = new.lead_id and status in ('pending', 'processing');
  end if;
  return new;
end;
$function$;

ALTER FUNCTION private.cancel_whatsapp_follow_up_on_takeover() OWNER TO postgres;

REVOKE ALL ON FUNCTION private.cancel_whatsapp_follow_up_on_takeover() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER whatsapp_control_cancel_automatic_follow_up AFTER INSERT OR UPDATE OF mode ON public.whatsapp_conversation_controls FOR EACH ROW EXECUTE FUNCTION private.cancel_whatsapp_follow_up_on_takeover();

CREATE TRIGGER whatsapp_conversation_controls_set_updated_at BEFORE UPDATE ON public.whatsapp_conversation_controls FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

ALTER TABLE public.whatsapp_conversation_controls OWNER TO postgres;

ALTER TABLE public.whatsapp_conversation_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_conversation_controls_read_authorized" ON public.whatsapp_conversation_controls AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_can_manage_whatsapp(lead_id));

REVOKE ALL ON public.whatsapp_conversation_controls FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE ON public.whatsapp_conversation_controls TO "authenticated";

GRANT INSERT ON public.whatsapp_conversation_controls TO "authenticated";

GRANT MAINTAIN ON public.whatsapp_conversation_controls TO "authenticated";

GRANT REFERENCES ON public.whatsapp_conversation_controls TO "authenticated";

GRANT SELECT ON public.whatsapp_conversation_controls TO "authenticated";

GRANT TRIGGER ON public.whatsapp_conversation_controls TO "authenticated";

GRANT TRUNCATE ON public.whatsapp_conversation_controls TO "authenticated";

GRANT UPDATE ON public.whatsapp_conversation_controls TO "authenticated";

GRANT DELETE ON public.whatsapp_conversation_controls TO "service_role";

GRANT INSERT ON public.whatsapp_conversation_controls TO "service_role";

GRANT MAINTAIN ON public.whatsapp_conversation_controls TO "service_role";

GRANT REFERENCES ON public.whatsapp_conversation_controls TO "service_role";

GRANT SELECT ON public.whatsapp_conversation_controls TO "service_role";

GRANT TRIGGER ON public.whatsapp_conversation_controls TO "service_role";

GRANT TRUNCATE ON public.whatsapp_conversation_controls TO "service_role";

GRANT UPDATE ON public.whatsapp_conversation_controls TO "service_role";

COMMIT;

