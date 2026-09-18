-- GENERATED OPTIONAL TEST FIXTURE. Not a product migration or appraisal redesign.

-- Apply only in the isolated harness after B and assignment-runtime/overlay.sql.

BEGIN;

SET LOCAL ROLE postgres;

SET LOCAL search_path = public, extensions;

SET LOCAL check_function_bodies = off;

CREATE TABLE "public"."vehicle_appraisals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL,
  "brand" text NOT NULL,
  "model" text NOT NULL,
  "version" text NOT NULL DEFAULT ''::text,
  "vehicle_year" integer NOT NULL,
  "mileage_km" integer NOT NULL,
  "condition" text NOT NULL DEFAULT 'good'::text,
  "notes" text NOT NULL DEFAULT ''::text,
  "estimated_min" numeric,
  "estimated_max" numeric,
  "market_median" numeric,
  "suggested_value" numeric,
  "market_currency" text,
  "estimate_source" text NOT NULL DEFAULT 'pending_market_reference'::text,
  "estimate_basis" text NOT NULL DEFAULT ''::text,
  "reference_count" integer NOT NULL DEFAULT 0,
  "market_references" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "market_checked_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "confirmed_value" numeric,
  "confirmed_currency" text,
  "review_note" text NOT NULL DEFAULT ''::text,
  "created_by" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."vehicle_appraisals" OWNER TO "postgres";

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_condition" CHECK (condition = ANY (ARRAY['excellent'::text, 'good'::text, 'fair'::text, 'to_review'::text]));

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_confirmed_value" CHECK (confirmed_value IS NULL OR confirmed_value >= 0::numeric);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_currency" CHECK ((market_currency IS NULL OR (market_currency = ANY (ARRAY['ARS'::text, 'USD'::text]))) AND (confirmed_currency IS NULL OR (confirmed_currency = ANY (ARRAY['ARS'::text, 'USD'::text]))));

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_lead_id_key" UNIQUE (lead_id);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_market_references" CHECK (jsonb_typeof(market_references) = 'array'::text);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_market_values" CHECK ((market_median IS NULL OR market_median >= 0::numeric) AND (suggested_value IS NULL OR suggested_value >= 0::numeric));

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_mileage" CHECK (mileage_km >= 0 AND mileage_km <= 3000000);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_range" CHECK (estimated_min IS NULL AND estimated_max IS NULL OR estimated_min >= 0::numeric AND estimated_max >= estimated_min);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_status" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text]));

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_text_length" CHECK (char_length(brand) >= 1 AND char_length(brand) <= 80 AND char_length(model) >= 1 AND char_length(model) <= 120 AND char_length(version) <= 160 AND char_length(notes) <= 3000 AND char_length(estimate_basis) <= 3000 AND char_length(review_note) <= 3000);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_year" CHECK (vehicle_year >= 1950 AND vehicle_year <= 2100);

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."vehicle_appraisals" ADD CONSTRAINT "vehicle_appraisals_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

CREATE INDEX vehicle_appraisals_status_time_idx ON public.vehicle_appraisals USING btree (status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.save_lead_vehicle_appraisal(p_lead_id uuid, p_brand text, p_model text, p_version text, p_vehicle_year integer, p_mileage_km integer, p_condition text, p_notes text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_appraisal_id uuid;
  v_is_owner boolean;
begin
  select exists (
    select 1
    from public.leads lead
    where lead.id = p_lead_id
      and lead.assigned_seller_user_id = (select auth.uid())
      and lead.routing_status not in ('closed', 'lost')
  ) into v_is_owner;

  if not (v_is_owner or private.current_user_is_management()) then
    raise exception 'No tenés permiso para registrar la tasación de este lead';
  end if;
  if char_length(trim(coalesce(p_brand, ''))) < 1 or char_length(trim(coalesce(p_model, ''))) < 1 then
    raise exception 'Completá marca y modelo del usado';
  end if;
  if p_vehicle_year < 1950 or p_vehicle_year > extract(year from current_date)::integer + 1 then
    raise exception 'El año del vehículo no es válido';
  end if;
  if p_mileage_km < 0 or p_mileage_km > 3000000 then
    raise exception 'El kilometraje no es válido';
  end if;
  if p_condition not in ('excellent', 'good', 'fair', 'to_review') then
    raise exception 'El estado general no es válido';
  end if;

  insert into public.vehicle_appraisals (
    lead_id, brand, model, version, vehicle_year, mileage_km, condition, notes,
    estimate_source, status, created_by
  ) values (
    p_lead_id, trim(p_brand), trim(p_model), trim(coalesce(p_version, '')),
    p_vehicle_year, p_mileage_km, p_condition, trim(coalesce(p_notes, '')),
    'pending_market_reference', 'pending', (select auth.uid())
  )
  on conflict (lead_id) do update set
    brand = excluded.brand,
    model = excluded.model,
    version = excluded.version,
    vehicle_year = excluded.vehicle_year,
    mileage_km = excluded.mileage_km,
    condition = excluded.condition,
    notes = excluded.notes,
    estimated_min = null,
    estimated_max = null,
    market_median = null,
    suggested_value = null,
    market_currency = null,
    estimate_source = 'pending_market_reference',
    estimate_basis = '',
    reference_count = 0,
    market_references = '[]'::jsonb,
    market_checked_at = null,
    status = 'pending',
    confirmed_value = null,
    confirmed_currency = null,
    review_note = '',
    reviewed_by = null,
    reviewed_at = null,
    created_by = (select auth.uid())
  returning id into v_appraisal_id;

  insert into public.lead_activities (lead_id, actor_user_id, activity_type, title, detail, metadata)
  values (
    p_lead_id,
    (select auth.uid()),
    'vehicle_appraisal_requested',
    'Tasación de usado solicitada',
    concat_ws(' · ', trim(p_brand), trim(p_model), trim(coalesce(p_version, '')), p_vehicle_year::text, p_mileage_km::text || ' km'),
    jsonb_build_object('appraisal_id', v_appraisal_id, 'status', 'pending')
  );

  return v_appraisal_id;
end;
$function$;

ALTER FUNCTION "public"."save_lead_vehicle_appraisal"(p_lead_id uuid, p_brand text, p_model text, p_version text, p_vehicle_year integer, p_mileage_km integer, p_condition text, p_notes text) OWNER TO "postgres";

CREATE TRIGGER vehicle_appraisals_set_updated_at BEFORE UPDATE ON vehicle_appraisals FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "vehicle_appraisals_read_management_or_owner" ON "public"."vehicle_appraisals" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = vehicle_appraisals.lead_id) AND ((lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management()))))));

ALTER TABLE "public"."vehicle_appraisals" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."vehicle_appraisals" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

GRANT INSERT ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT SELECT ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT UPDATE ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT DELETE ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT REFERENCES ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT TRIGGER ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."vehicle_appraisals" TO "postgres";

GRANT INSERT ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT SELECT ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT UPDATE ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT DELETE ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT TRUNCATE ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT REFERENCES ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT TRIGGER ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT MAINTAIN ON TABLE "public"."vehicle_appraisals" TO "anon";

GRANT INSERT ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT SELECT ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT UPDATE ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT DELETE ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."vehicle_appraisals" TO "authenticated";

GRANT INSERT ON TABLE "public"."vehicle_appraisals" TO "service_role";

GRANT SELECT ON TABLE "public"."vehicle_appraisals" TO "service_role";

GRANT UPDATE ON TABLE "public"."vehicle_appraisals" TO "service_role";

GRANT DELETE ON TABLE "public"."vehicle_appraisals" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."vehicle_appraisals" TO "service_role";

GRANT REFERENCES ON TABLE "public"."vehicle_appraisals" TO "service_role";

GRANT TRIGGER ON TABLE "public"."vehicle_appraisals" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."vehicle_appraisals" TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_lead_vehicle_appraisal"(p_lead_id uuid, p_brand text, p_model text, p_version text, p_vehicle_year integer, p_mileage_km integer, p_condition text, p_notes text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

GRANT EXECUTE ON FUNCTION "public"."save_lead_vehicle_appraisal"(p_lead_id uuid, p_brand text, p_model text, p_version text, p_vehicle_year integer, p_mileage_km integer, p_condition text, p_notes text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_lead_vehicle_appraisal"(p_lead_id uuid, p_brand text, p_model text, p_version text, p_vehicle_year integer, p_mileage_km integer, p_condition text, p_notes text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_lead_vehicle_appraisal"(p_lead_id uuid, p_brand text, p_model text, p_version text, p_vehicle_year integer, p_mileage_km integer, p_condition text, p_notes text) TO "service_role";

SET LOCAL check_function_bodies = on;

COMMIT;
