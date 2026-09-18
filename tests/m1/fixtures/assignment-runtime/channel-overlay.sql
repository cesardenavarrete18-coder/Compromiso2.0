-- ISOLATED BASELINE FIXTURE ONLY; never a product migration.

-- Requires unchanged schema B plus assignment-boundary/overlay.sql.

-- Captured legacy mode RPC, event log, reminders and FK message relation.

-- No business rows, credentials, provider client or network behavior.

BEGIN;

SET LOCAL search_path = public, extensions;

CREATE TABLE public."lead_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL,
  "whatsapp_message_id" text,
  "direction" text NOT NULL DEFAULT 'inbound'::text,
  "message_type" text NOT NULL DEFAULT 'text'::text,
  "body" text NOT NULL DEFAULT ''::text,
  "raw_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "origin" text NOT NULL DEFAULT 'unknown'::text
);

ALTER TABLE public."lead_messages" ADD CONSTRAINT "lead_messages_body_length" CHECK ((char_length(body) <= 10000));

ALTER TABLE public."lead_messages" ADD CONSTRAINT "lead_messages_direction" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'system'::text])));

ALTER TABLE public."lead_messages" ADD CONSTRAINT "lead_messages_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE public."lead_messages" ADD CONSTRAINT "lead_messages_origin_check" CHECK ((origin = ANY (ARRAY['customer'::text, 'ai'::text, 'human'::text, 'system'::text, 'unknown'::text])));

ALTER TABLE public."lead_messages" ADD CONSTRAINT "lead_messages_pkey" PRIMARY KEY (id);

ALTER TABLE public."lead_messages" ADD CONSTRAINT "lead_messages_whatsapp_message_id_key" UNIQUE (whatsapp_message_id);

CREATE INDEX lead_messages_lead_time_idx ON public.lead_messages USING btree (lead_id, created_at);

ALTER TABLE public."lead_messages" OWNER TO postgres;

ALTER TABLE public."lead_messages" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_conversation_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "lead_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "event_type" text NOT NULL,
  "body" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public."whatsapp_conversation_events" ADD CONSTRAINT "whatsapp_conversation_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public."whatsapp_conversation_events" ADD CONSTRAINT "whatsapp_conversation_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE public."whatsapp_conversation_events" ADD CONSTRAINT "whatsapp_conversation_events_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_conversation_events" ADD CONSTRAINT "whatsapp_conversation_events_type" CHECK ((event_type = ANY (ARRAY['taken'::text, 'released'::text, 'message_sent'::text])));

CREATE INDEX whatsapp_conversation_events_actor_idx ON public.whatsapp_conversation_events USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL);

CREATE INDEX whatsapp_conversation_events_lead_created_idx ON public.whatsapp_conversation_events USING btree (lead_id, created_at DESC);

ALTER TABLE public."whatsapp_conversation_events" OWNER TO postgres;

ALTER TABLE public."whatsapp_conversation_events" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_follow_up_reminders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL,
  "first_inbound_message_id" uuid NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempts" smallint NOT NULL DEFAULT 0,
  "claimed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "whatsapp_message_id" text,
  "last_error" text NOT NULL DEFAULT ''::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_attempts" CHECK (((attempts >= 0) AND (attempts <= 3)));

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_error_length" CHECK ((char_length(last_error) <= 1000));

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_first_inbound_message_id_fkey" FOREIGN KEY (first_inbound_message_id) REFERENCES lead_messages(id) ON DELETE CASCADE;

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_first_inbound_message_id_key" UNIQUE (first_inbound_message_id);

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_lead_id_key" UNIQUE (lead_id);

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_follow_up_reminders" ADD CONSTRAINT "whatsapp_follow_up_reminders_status" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'cancelled'::text, 'failed'::text])));

CREATE INDEX whatsapp_follow_up_reminders_due_idx ON public.whatsapp_follow_up_reminders USING btree (due_at) WHERE (status = 'pending'::text);

ALTER TABLE public."whatsapp_follow_up_reminders" OWNER TO postgres;

ALTER TABLE public."whatsapp_follow_up_reminders" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_whatsapp_conversation_mode(p_lead_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_control public.whatsapp_conversation_controls%rowtype;
begin
  if v_user_id is null or not private.current_user_can_manage_whatsapp(p_lead_id) then
    raise exception 'No tenés permiso para intervenir esta conversación';
  end if;
  if p_mode not in ('ai', 'human') then
    raise exception 'El modo de conversación no es válido';
  end if;

  insert into public.whatsapp_conversation_controls (
    lead_id,
    mode,
    taken_by_user_id,
    taken_at,
    released_by_user_id,
    released_at
  ) values (
    p_lead_id,
    p_mode,
    case when p_mode = 'human' then v_user_id else null end,
    case when p_mode = 'human' then now() else null end,
    case when p_mode = 'ai' then v_user_id else null end,
    case when p_mode = 'ai' then now() else null end
  )
  on conflict (lead_id) do update set
    mode = excluded.mode,
    taken_by_user_id = excluded.taken_by_user_id,
    taken_at = excluded.taken_at,
    released_by_user_id = excluded.released_by_user_id,
    released_at = excluded.released_at
  returning * into v_control;

  insert into public.whatsapp_conversation_events (lead_id, actor_user_id, event_type)
  values (p_lead_id, v_user_id, case when p_mode = 'human' then 'taken' else 'released' end);

  return jsonb_build_object(
    'lead_id', v_control.lead_id,
    'mode', v_control.mode,
    'taken_by_user_id', v_control.taken_by_user_id,
    'taken_at', v_control.taken_at,
    'released_at', v_control.released_at,
    'updated_at', v_control.updated_at
  );
end;
$function$;

ALTER FUNCTION public.set_whatsapp_conversation_mode(p_lead_id uuid, p_mode text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.set_whatsapp_conversation_mode(p_lead_id uuid, p_mode text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_whatsapp_conversation_mode(p_lead_id uuid, p_mode text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_whatsapp_conversation_mode(p_lead_id uuid, p_mode text) TO service_role;

CREATE TRIGGER whatsapp_follow_up_reminders_set_updated_at BEFORE UPDATE ON public.whatsapp_follow_up_reminders FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "lead_messages_read_management_or_owner" ON public."lead_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_messages.lead_id) AND (private.current_user_is_management() OR ((lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid)) AND (NOT (EXISTS ( SELECT 1
           FROM sales_cases sales_case
          WHERE (sales_case.lead_id = lead.id)))))))))));

CREATE POLICY "whatsapp_conversation_events_read_authorized" ON public."whatsapp_conversation_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_can_manage_whatsapp(lead_id));

CREATE POLICY "whatsapp_follow_up_reminders_management_read" ON public."whatsapp_follow_up_reminders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_is_management());

REVOKE ALL ON public."lead_messages" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON public."whatsapp_conversation_events" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON public."whatsapp_follow_up_reminders" FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE ON public."lead_messages" TO "anon";

GRANT INSERT ON public."lead_messages" TO "anon";

GRANT MAINTAIN ON public."lead_messages" TO "anon";

GRANT REFERENCES ON public."lead_messages" TO "anon";

GRANT SELECT ON public."lead_messages" TO "anon";

GRANT TRIGGER ON public."lead_messages" TO "anon";

GRANT TRUNCATE ON public."lead_messages" TO "anon";

GRANT UPDATE ON public."lead_messages" TO "anon";

GRANT DELETE ON public."lead_messages" TO "authenticated";

GRANT INSERT ON public."lead_messages" TO "authenticated";

GRANT MAINTAIN ON public."lead_messages" TO "authenticated";

GRANT REFERENCES ON public."lead_messages" TO "authenticated";

GRANT SELECT ON public."lead_messages" TO "authenticated";

GRANT TRIGGER ON public."lead_messages" TO "authenticated";

GRANT TRUNCATE ON public."lead_messages" TO "authenticated";

GRANT UPDATE ON public."lead_messages" TO "authenticated";

GRANT DELETE ON public."lead_messages" TO "service_role";

GRANT INSERT ON public."lead_messages" TO "service_role";

GRANT MAINTAIN ON public."lead_messages" TO "service_role";

GRANT REFERENCES ON public."lead_messages" TO "service_role";

GRANT SELECT ON public."lead_messages" TO "service_role";

GRANT TRIGGER ON public."lead_messages" TO "service_role";

GRANT TRUNCATE ON public."lead_messages" TO "service_role";

GRANT UPDATE ON public."lead_messages" TO "service_role";

GRANT DELETE ON public."whatsapp_conversation_events" TO "authenticated";

GRANT INSERT ON public."whatsapp_conversation_events" TO "authenticated";

GRANT MAINTAIN ON public."whatsapp_conversation_events" TO "authenticated";

GRANT REFERENCES ON public."whatsapp_conversation_events" TO "authenticated";

GRANT SELECT ON public."whatsapp_conversation_events" TO "authenticated";

GRANT TRIGGER ON public."whatsapp_conversation_events" TO "authenticated";

GRANT TRUNCATE ON public."whatsapp_conversation_events" TO "authenticated";

GRANT UPDATE ON public."whatsapp_conversation_events" TO "authenticated";

GRANT DELETE ON public."whatsapp_conversation_events" TO "service_role";

GRANT INSERT ON public."whatsapp_conversation_events" TO "service_role";

GRANT MAINTAIN ON public."whatsapp_conversation_events" TO "service_role";

GRANT REFERENCES ON public."whatsapp_conversation_events" TO "service_role";

GRANT SELECT ON public."whatsapp_conversation_events" TO "service_role";

GRANT TRIGGER ON public."whatsapp_conversation_events" TO "service_role";

GRANT TRUNCATE ON public."whatsapp_conversation_events" TO "service_role";

GRANT UPDATE ON public."whatsapp_conversation_events" TO "service_role";

GRANT SELECT ON public."whatsapp_follow_up_reminders" TO "authenticated";

GRANT DELETE ON public."whatsapp_follow_up_reminders" TO "service_role";

GRANT INSERT ON public."whatsapp_follow_up_reminders" TO "service_role";

GRANT MAINTAIN ON public."whatsapp_follow_up_reminders" TO "service_role";

GRANT REFERENCES ON public."whatsapp_follow_up_reminders" TO "service_role";

GRANT SELECT ON public."whatsapp_follow_up_reminders" TO "service_role";

GRANT TRIGGER ON public."whatsapp_follow_up_reminders" TO "service_role";

GRANT TRUNCATE ON public."whatsapp_follow_up_reminders" TO "service_role";

GRANT UPDATE ON public."whatsapp_follow_up_reminders" TO "service_role";

REVOKE ALL ON SEQUENCE public."whatsapp_conversation_events_id_seq" FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."whatsapp_conversation_events_id_seq" TO "service_role";

COMMIT;
