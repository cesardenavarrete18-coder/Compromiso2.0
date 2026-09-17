-- GENERATED from source.json; run build.py to reproduce. No personal rows.

-- Relevant observed schema, NOT an entire production database clone.

-- Fresh isolated PostgreSQL 17 cluster only; no cron/net/vault installation.

BEGIN;

SET LOCAL search_path = public, extensions;

SET LOCAL check_function_bodies = off;

DO $$ BEGIN IF current_setting('server_version_num')::integer < 170000 THEN RAISE EXCEPTION 'SCHEMA_B_REQUIRES_POSTGRES_17'; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE oid=10 AND rolname='supabase_admin' AND rolsuper) THEN RAISE EXCEPTION 'SCHEMA_B_REQUIRES_SUPABASE_ADMIN_BOOTSTRAP'; END IF; END $$;

CREATE ROLE "anon" NOLOGIN NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;

CREATE ROLE "authenticated" NOLOGIN NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;

CREATE ROLE "authenticator" LOGIN NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;

CREATE ROLE "dashboard_user" NOLOGIN NOSUPERUSER INHERIT CREATEROLE CREATEDB REPLICATION NOBYPASSRLS;

CREATE ROLE "postgres" LOGIN NOSUPERUSER INHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS;

CREATE ROLE "service_role" NOLOGIN NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOREPLICATION BYPASSRLS;

CREATE ROLE "supabase_auth_admin" LOGIN NOSUPERUSER NOINHERIT CREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;

CREATE ROLE "supabase_privileged_role" NOLOGIN NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;

CREATE ROLE "supabase_realtime_admin" NOLOGIN NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;

DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO postgres',current_database()); END $$;

SET LOCAL ROLE supabase_admin;

GRANT "anon" TO "authenticator" WITH ADMIN false, INHERIT false, SET true;

GRANT "anon" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "anon" TO "supabase_realtime_admin" WITH ADMIN false, INHERIT false, SET true;

GRANT "authenticated" TO "authenticator" WITH ADMIN false, INHERIT false, SET true;

GRANT "authenticated" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "authenticated" TO "supabase_realtime_admin" WITH ADMIN false, INHERIT false, SET true;

GRANT "authenticator" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "pg_create_subscription" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "pg_monitor" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "pg_read_all_data" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "pg_signal_backend" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "service_role" TO "authenticator" WITH ADMIN false, INHERIT false, SET true;

GRANT "service_role" TO "postgres" WITH ADMIN true, INHERIT true, SET true;

GRANT "service_role" TO "supabase_realtime_admin" WITH ADMIN false, INHERIT false, SET true;

GRANT "supabase_privileged_role" TO "postgres" WITH ADMIN false, INHERIT true, SET true;

RESET ROLE;

CREATE SCHEMA "auth" AUTHORIZATION "supabase_admin";

CREATE SCHEMA "extensions" AUTHORIZATION "postgres";

CREATE SCHEMA "private" AUTHORIZATION "postgres";

ALTER SCHEMA public OWNER TO "pg_database_owner";

CREATE TYPE "public"."app_role" AS ENUM ('admin', 'seller', 'supervisor', 'admventas');

ALTER TYPE "public"."app_role" OWNER TO "postgres";

CREATE TABLE "auth"."users" (
  "instance_id" uuid,
  "id" uuid NOT NULL,
  "aud" character varying(255),
  "role" character varying(255),
  "email" character varying(255),
  "encrypted_password" character varying(255),
  "email_confirmed_at" timestamp with time zone,
  "invited_at" timestamp with time zone,
  "confirmation_token" character varying(255),
  "confirmation_sent_at" timestamp with time zone,
  "recovery_token" character varying(255),
  "recovery_sent_at" timestamp with time zone,
  "email_change_token_new" character varying(255),
  "email_change" character varying(255),
  "email_change_sent_at" timestamp with time zone,
  "last_sign_in_at" timestamp with time zone,
  "raw_app_meta_data" jsonb,
  "raw_user_meta_data" jsonb,
  "is_super_admin" boolean,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "phone" text,
  "phone_confirmed_at" timestamp with time zone,
  "phone_change" text,
  "phone_change_token" character varying(255),
  "phone_change_sent_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  "email_change_token_current" character varying(255),
  "email_change_confirm_status" smallint,
  "banned_until" timestamp with time zone,
  "reauthentication_token" character varying(255),
  "reauthentication_sent_at" timestamp with time zone,
  "is_sso_user" boolean NOT NULL,
  "deleted_at" timestamp with time zone,
  "is_anonymous" boolean NOT NULL
);

ALTER TABLE "auth"."users" OWNER TO "supabase_auth_admin";

CREATE TABLE "public"."bank_credit_offer_versions" (
  "offer_id" uuid NOT NULL,
  "version_id" uuid NOT NULL
);

ALTER TABLE "public"."bank_credit_offer_versions" OWNER TO "postgres";

CREATE TABLE "public"."bank_credit_offers" (
  "id" uuid NOT NULL,
  "model_id" uuid,
  "financier_name" text NOT NULL,
  "offer_name" text NOT NULL,
  "term_months" integer NOT NULL,
  "min_financed_amount" numeric(16,2),
  "max_financed_amount" numeric(16,2),
  "installment_coefficient" numeric(14,8) NOT NULL,
  "breakage_rate" numeric(8,4) NOT NULL,
  "patenting_rate" numeric(8,4) NOT NULL,
  "fixed_expenses" numeric(16,2) NOT NULL,
  "tna" numeric(8,4),
  "cftea" numeric(8,4),
  "notes" text NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "active" boolean NOT NULL,
  "sort_order" integer NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."bank_credit_offers" OWNER TO "postgres";

CREATE TABLE "public"."brands" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "image_path" text NOT NULL,
  "sort_order" integer NOT NULL,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."brands" OWNER TO "postgres";

CREATE TABLE "public"."campaign_audit_log" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "public"."campaign_audit_log_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "campaign_id" uuid,
  "changed_by" uuid,
  "action" text NOT NULL,
  "previous_data" jsonb,
  "new_data" jsonb,
  "changed_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."campaign_audit_log" OWNER TO "postgres";

CREATE TABLE "public"."campaigns" (
  "id" uuid NOT NULL,
  "model_id" uuid NOT NULL,
  "active" boolean NOT NULL,
  "bonus" text NOT NULL,
  "benefits" text[] NOT NULL,
  "slots" integer,
  "valid_from" date,
  "valid_to" date,
  "timer_hours" integer NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "plan_name" text NOT NULL,
  "version_name" text NOT NULL,
  "transmission" text NOT NULL,
  "installment_count" integer,
  "advance_amount" numeric(16,2),
  "installment_amount" numeric(16,2),
  "installment_is_from" boolean NOT NULL,
  "sort_order" integer NOT NULL,
  "final_price" numeric(16,2)
);

ALTER TABLE "public"."campaigns" OWNER TO "postgres";

CREATE TABLE "public"."commercial_applications" (
  "id" uuid NOT NULL,
  "prequalification_event_id" uuid,
  "seller_user_id" uuid NOT NULL,
  "request_code" text NOT NULL,
  "brand_name" text NOT NULL,
  "model_name" text NOT NULL,
  "campaign_name" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "document_type" text NOT NULL,
  "document_number" text NOT NULL,
  "cuil" text NOT NULL,
  "birth_date" date NOT NULL,
  "address" text NOT NULL,
  "city_province" text NOT NULL,
  "postal_code" text NOT NULL,
  "marital_status" text NOT NULL,
  "spouse_name" text,
  "spouse_document" text,
  "primary_phone" text NOT NULL,
  "alternate_phone" text,
  "email" text NOT NULL,
  "contact_schedule" text NOT NULL,
  "employment_status" text NOT NULL,
  "employer_name" text NOT NULL,
  "employment_seniority" text NOT NULL,
  "monthly_income" numeric(16,2) NOT NULL,
  "automatic_debit" boolean NOT NULL,
  "deferred_installment" boolean NOT NULL,
  "installments_paid" integer NOT NULL,
  "installments_to_pay" integer NOT NULL,
  "plan_type" text NOT NULL,
  "agreed_price" numeric(16,2) NOT NULL,
  "first_payment_date" date,
  "first_payment_amount" numeric(16,2),
  "second_payment_date" date,
  "second_payment_amount" numeric(16,2),
  "status" text NOT NULL,
  "terms_version" text NOT NULL,
  "confirmed_at" timestamp with time zone NOT NULL,
  "commercial_snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "sales_case_id" uuid,
  "revision_number" integer NOT NULL,
  "supersedes_application_id" uuid,
  "submitted_at" timestamp with time zone,
  "lead_id" uuid,
  "campaign_id" uuid
);

ALTER TABLE "public"."commercial_applications" OWNER TO "postgres";

CREATE TABLE "public"."contact_message_templates" (
  "id" uuid NOT NULL,
  "step_number" smallint NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "meta_template_name" text,
  "meta_language" text NOT NULL,
  "active" boolean NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."contact_message_templates" OWNER TO "postgres";

CREATE TABLE "public"."customers" (
  "id" uuid NOT NULL,
  "normalized_phone" text NOT NULL,
  "primary_phone" text NOT NULL,
  "full_name" text,
  "email" text,
  "document_number" text,
  "cuil" text,
  "contact_consent_at" timestamp with time zone,
  "contact_consent_source" text NOT NULL,
  "marketing_opt_in" boolean NOT NULL,
  "marketing_opt_in_at" timestamp with time zone,
  "marketing_opt_in_source" text NOT NULL,
  "do_not_contact" boolean NOT NULL,
  "do_not_contact_at" timestamp with time zone,
  "do_not_contact_reason" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."customers" OWNER TO "postgres";

CREATE TABLE "public"."lead_activities" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "public"."lead_activities_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "lead_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "activity_type" text NOT NULL,
  "title" text NOT NULL,
  "detail" text NOT NULL,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."lead_activities" OWNER TO "postgres";

CREATE TABLE "public"."lead_contact_sequences" (
  "id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "stopped_reason" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."lead_contact_sequences" OWNER TO "postgres";

CREATE TABLE "public"."lead_contact_tasks" (
  "id" uuid NOT NULL,
  "sequence_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "sequence_order" smallint NOT NULL,
  "channel" text NOT NULL,
  "call_attempt" smallint,
  "message_step" smallint,
  "template_id" uuid,
  "due_start" timestamp with time zone NOT NULL,
  "due_end" timestamp with time zone NOT NULL,
  "status" text NOT NULL,
  "outcome" text NOT NULL,
  "note" text NOT NULL,
  "completed_at" timestamp with time zone,
  "completed_by" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "performed_at" timestamp with time zone,
  "recorded_at" timestamp with time zone,
  "protocol_day" smallint,
  "protocol_band" text,
  "band_attempt" smallint
);

ALTER TABLE "public"."lead_contact_tasks" OWNER TO "postgres";

CREATE TABLE "public"."lead_crm" (
  "lead_id" uuid NOT NULL,
  "status" text NOT NULL,
  "priority" text NOT NULL,
  "status_reason" text NOT NULL,
  "next_contact_at" timestamp with time zone,
  "next_contact_note" text NOT NULL,
  "last_contact_at" timestamp with time zone,
  "last_contact_outcome" text NOT NULL,
  "interview_at" timestamp with time zone,
  "interview_location" text NOT NULL,
  "deposit_amount" numeric(16,2),
  "deposit_at" timestamp with time zone,
  "cold_base_at" timestamp with time zone,
  "sale_confirmation_status" text NOT NULL,
  "sale_requested_at" timestamp with time zone,
  "sale_requested_by" uuid,
  "sale_confirmed_at" timestamp with time zone,
  "sale_confirmed_by" uuid,
  "vehicle_sold" text NOT NULL,
  "sale_amount" numeric(16,2),
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "next_contact_source" text,
  "interview_mode" text,
  "interview_operational_status" text,
  "interview_objective" text NOT NULL,
  "final_objection" text NOT NULL,
  "deposit_validation" text NOT NULL,
  "post_deposit_action_at" timestamp with time zone,
  "post_deposit_action_status" text,
  "previous_status" text,
  "terminal_at" timestamp with time zone,
  "desist_reason" text
);

ALTER TABLE "public"."lead_crm" OWNER TO "postgres";

CREATE TABLE "public"."lead_import_batches" (
  "id" uuid NOT NULL,
  "base_type" text NOT NULL,
  "file_name" text NOT NULL,
  "imported_by" uuid NOT NULL,
  "row_count" integer NOT NULL,
  "created_count" integer NOT NULL,
  "merged_count" integer NOT NULL,
  "rejected_count" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."lead_import_batches" OWNER TO "postgres";

CREATE TABLE "public"."lead_management_playbook_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "public"."lead_management_playbook_events_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "lead_id" uuid NOT NULL,
  "item_key" text NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."lead_management_playbook_events" OWNER TO "postgres";

CREATE TABLE "public"."lead_management_playbook_items" (
  "lead_id" uuid NOT NULL,
  "item_key" text NOT NULL,
  "completed" boolean NOT NULL,
  "completed_at" timestamp with time zone,
  "completed_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."lead_management_playbook_items" OWNER TO "postgres";

CREATE TABLE "public"."lead_recall_items" (
  "id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "import_batch_id" uuid,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "model_interest" text NOT NULL,
  "source_detail" text NOT NULL,
  "original_inquiry_at" timestamp with time zone NOT NULL,
  "available_at" timestamp with time zone NOT NULL,
  "status" text NOT NULL,
  "assigned_seller_user_id" uuid,
  "assigned_by_user_id" uuid,
  "assigned_at" timestamp with time zone,
  "attempt_count" smallint NOT NULL,
  "answered_at" timestamp with time zone,
  "converted_at" timestamp with time zone,
  "exhausted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "recall_panel_id" uuid,
  "panel_position" integer
);

ALTER TABLE "public"."lead_recall_items" OWNER TO "postgres";

CREATE TABLE "public"."lead_recall_panels" (
  "id" uuid NOT NULL,
  "panel_number" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "public"."lead_recall_panels_panel_number_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "created_by_user_id" uuid,
  "status" text NOT NULL,
  "total_items" integer NOT NULL,
  "completed_items" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "closed_at" timestamp with time zone
);

ALTER TABLE "public"."lead_recall_panels" OWNER TO "postgres";

CREATE TABLE "public"."lead_sale_requests" (
  "id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "vehicle" text NOT NULL,
  "sale_amount" numeric(16,2),
  "notes" text NOT NULL,
  "status" text NOT NULL,
  "requested_at" timestamp with time zone NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text NOT NULL,
  "quote_id" uuid,
  "provisional_application_id" uuid
);

ALTER TABLE "public"."lead_sale_requests" OWNER TO "postgres";

CREATE TABLE "public"."leads" (
  "id" uuid NOT NULL,
  "customer_phone" text NOT NULL,
  "customer_name" text,
  "source_channel" text NOT NULL,
  "source_detail" text,
  "seller_code_received" text,
  "qualification_status" text NOT NULL,
  "priority" text NOT NULL,
  "intent_summary" text NOT NULL,
  "model_interest" text,
  "disqualify_reason" text,
  "routing_status" text NOT NULL,
  "routing_reason" text NOT NULL,
  "assigned_seller_user_id" uuid,
  "assigned_by_user_id" uuid,
  "assigned_at" timestamp with time zone,
  "last_message_at" timestamp with time zone NOT NULL,
  "closed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "customer_id" uuid NOT NULL,
  "contact_consent_at" timestamp with time zone,
  "contact_consent_source" text NOT NULL,
  "marketing_opt_in" boolean NOT NULL,
  "marketing_opt_in_at" timestamp with time zone,
  "marketing_opt_in_source" text NOT NULL,
  "do_not_contact" boolean NOT NULL,
  "do_not_contact_at" timestamp with time zone,
  "do_not_contact_reason" text NOT NULL
);

ALTER TABLE "public"."leads" OWNER TO "postgres";

CREATE TABLE "public"."model_versions" (
  "id" uuid NOT NULL,
  "model_id" uuid NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "suggested_price" numeric(14,2)
);

ALTER TABLE "public"."model_versions" OWNER TO "postgres";

CREATE TABLE "public"."models" (
  "id" uuid NOT NULL,
  "brand_id" uuid NOT NULL,
  "name" text NOT NULL,
  "image_path" text NOT NULL,
  "campaign_name" text NOT NULL,
  "short_description" text NOT NULL,
  "advance_text" text NOT NULL,
  "installment_text" text NOT NULL,
  "sort_order" integer NOT NULL,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."models" OWNER TO "postgres";

CREATE TABLE "public"."prequalification_events" (
  "id" uuid NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "model_id" uuid NOT NULL,
  "campaign_id" uuid,
  "request_code" text NOT NULL,
  "customer_initials" text NOT NULL,
  "cuil_last4" text NOT NULL,
  "timer_hours" integer NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "campaign_snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "customer_name" text,
  "customer_phone" text,
  "customer_document" text,
  "model_name" text,
  "seller_name" text
);

ALTER TABLE "public"."prequalification_events" OWNER TO "postgres";

CREATE TABLE "public"."profiles" (
  "user_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" app_role NOT NULL,
  "seller_code" text NOT NULL,
  "full_name" text NOT NULL,
  "phone" text,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "contact_email" text,
  "tiktok_code" text
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

CREATE TABLE "public"."sales_case_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "public"."sales_case_events_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "sales_case_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "event_type" text NOT NULL,
  "stage" text,
  "outcome" text,
  "comment" text NOT NULL,
  "visible_to_seller" boolean NOT NULL,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."sales_case_events" OWNER TO "postgres";

CREATE TABLE "public"."sales_cases" (
  "id" uuid NOT NULL,
  "case_code" text NOT NULL,
  "sale_request_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "quote_id" uuid,
  "vehicle" text NOT NULL,
  "sale_amount" numeric(16,2),
  "status" text NOT NULL,
  "cdn_scoring_status" text NOT NULL,
  "dealer_scoring_status" text NOT NULL,
  "contract_status" text NOT NULL,
  "cancellation_reason" text NOT NULL,
  "finalized_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "admin_call_requested_at" timestamp with time zone,
  "admin_call_requested_by" uuid
);

ALTER TABLE "public"."sales_cases" OWNER TO "postgres";

CREATE TABLE "public"."sales_notifications" (
  "id" uuid NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "sales_case_id" uuid,
  "notification_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."sales_notifications" OWNER TO "postgres";

CREATE TABLE "public"."sales_quotes" (
  "id" uuid NOT NULL,
  "quote_code" text NOT NULL,
  "lead_id" uuid NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "model_id" uuid NOT NULL,
  "campaign_id" uuid,
  "bank_credit_offer_id" uuid,
  "offer_type" text NOT NULL,
  "customer_name" text NOT NULL,
  "vehicle_version" text NOT NULL,
  "sale_price" numeric(16,2) NOT NULL,
  "financed_amount" numeric(16,2) NOT NULL,
  "term_months" integer,
  "installment_amount" numeric(16,2),
  "advance_amount" numeric(16,2) NOT NULL,
  "breakage_amount" numeric(16,2) NOT NULL,
  "patenting_amount" numeric(16,2) NOT NULL,
  "expenses_amount" numeric(16,2) NOT NULL,
  "final_advance_amount" numeric(16,2) NOT NULL,
  "status" text NOT NULL,
  "valid_until" timestamp with time zone,
  "commercial_snapshot" jsonb NOT NULL,
  "issued_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "breakage_base_amount" numeric(14,2) NOT NULL,
  "breakage_vat_amount" numeric(14,2) NOT NULL
);

ALTER TABLE "public"."sales_quotes" OWNER TO "postgres";

CREATE TABLE "public"."user_invites" (
  "id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" app_role NOT NULL,
  "seller_code" text NOT NULL,
  "full_name" text NOT NULL,
  "phone" text,
  "active" boolean NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "contact_email" text,
  "tiktok_code" text
);

ALTER TABLE "public"."user_invites" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

ALTER FUNCTION "auth"."uid"() OWNER TO "supabase_auth_admin";

CREATE OR REPLACE FUNCTION private.after_sales_minute_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_previous integer;
begin
  if new.sales_case_id is null then return new; end if;

  -- Administrative revisions are handled atomically by revise_sales_minute.
  -- That RPC preserves the current workflow and records the real editor.
  if private.current_user_can_administer_sales() then
    return new;
  end if;

  select max(revision_number) into v_previous
  from public.commercial_applications
  where sales_case_id = new.sales_case_id and id <> new.id;

  update public.commercial_applications
  set status = 'superseded', updated_at = now()
  where sales_case_id = new.sales_case_id and id <> new.id and status = 'submitted';

  update public.sales_cases
  set status = 'quality_control', cdn_scoring_status = 'pending', updated_at = now()
  where id = new.sales_case_id and status <> 'cancelled';

  insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, stage, outcome, comment)
  values (
    new.sales_case_id,
    coalesce(auth.uid(), new.seller_user_id),
    case when coalesce(v_previous, 0) = 0 then 'minute_submitted' else 'minute_corrected' end,
    'cdn_scoring',
    'pending',
    case when coalesce(v_previous, 0) = 0 then 'Minuta enviada a Administración de Ventas.' else 'Minuta corregida y reenviada.' end
  );
  return new;
end;
$function$;

ALTER FUNCTION "private"."after_sales_minute_insert"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.audit_campaign_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    insert into public.campaign_audit_log (campaign_id, changed_by, action, previous_data)
    values (old.id, auth.uid(), tg_op, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.campaign_audit_log (campaign_id, changed_by, action, previous_data, new_data)
    values (new.id, auth.uid(), tg_op, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.campaign_audit_log (campaign_id, changed_by, action, new_data)
    values (new.id, auth.uid(), tg_op, to_jsonb(new));
    return new;
  end if;
end;
$function$;

ALTER FUNCTION "private"."audit_campaign_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.audit_management_playbook_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  if not private.current_user_is_management() and not exists (
    select 1
    from public.leads lead
    where lead.id = new.lead_id
      and lead.assigned_seller_user_id = v_actor
  ) then
    raise exception 'El lead no está asignado a este vendedor';
  end if;

  if tg_op = 'INSERT' or old.completed is distinct from new.completed then
    insert into public.lead_management_playbook_events (
      lead_id,
      item_key,
      event_type,
      actor_user_id
    ) values (
      new.lead_id,
      new.item_key,
      case when new.completed then 'completed' else 'reopened' end,
      v_actor
    );
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."audit_management_playbook_item"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.authorize_invited_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pending public.user_invites%rowtype;
begin
  select * into pending
  from public.user_invites
  where lower(email) = lower(new.email)
    and active = true
    and accepted_at is null
  limit 1;

  if not found then
    raise exception 'Este correo no tiene una invitación activa.';
  end if;

  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', pending.role::text,
    'seller_code', pending.seller_code,
    'tiktok_code', pending.tiktok_code
  );
  return new;
end;
$function$;

ALTER FUNCTION "private"."authorize_invited_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.business_date(p_date date, p_offset integer DEFAULT 0)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_date date := p_date;
  v_remaining integer := greatest(p_offset, 0);
begin
  while extract(isodow from v_date) = 7 loop
    v_date := v_date + 1;
  end loop;
  while v_remaining > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) <> 7 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  return v_date;
end;
$function$;

ALTER FUNCTION "private"."business_date"(p_date date, p_offset integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.cancel_lead_contact_protocol(p_lead_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.lead_contact_sequences
  set status = 'cancelled',
      completed_at = coalesce(completed_at, now()),
      stopped_reason = left(coalesce(nullif(trim(p_reason), ''), 'Seguimiento reemplazado'), 1000),
      updated_at = now()
  where lead_id = p_lead_id
    and status = 'active';

  update public.lead_contact_tasks
  set status = 'cancelled',
      updated_at = now()
  where lead_id = p_lead_id
    and status in ('pending', 'scheduled');
end;
$function$;

ALTER FUNCTION "private"."cancel_lead_contact_protocol"(p_lead_id uuid, p_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.classify_completed_contact_protocol()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    perform private.classify_exhausted_contact_protocol(
      new.lead_id,
      new.id,
      'protocol_sequence_completed'
    );
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."classify_completed_contact_protocol"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.classify_exhausted_contact_protocol(p_lead_id uuid, p_sequence_id uuid, p_origin text DEFAULT 'protocol_exhaustion'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_previous_status text;
  v_completed_at timestamptz;
  v_classified_lead_id uuid;
begin
  select crm.status
    into v_previous_status
  from public.lead_crm crm
  join public.leads lead on lead.id = crm.lead_id
  where crm.lead_id = p_lead_id
    and crm.status in ('nuevo', 'no_contesta')
    and crm.next_contact_at is null
    and crm.interview_at is null
    and crm.deposit_at is null
    and crm.sale_requested_at is null
    and crm.sale_confirmed_at is null
    and crm.sale_confirmation_status = 'none'
    and lower(trim(coalesce(crm.last_contact_outcome, ''))) not in (
      'answered',
      'respuesta recibida por whatsapp'
    )
    and lead.closed_at is null
    and not coalesce(lead.do_not_contact, false)
    and not exists (
      select 1 from public.sales_cases sales_case
      where sales_case.lead_id = p_lead_id
    )
  for update of crm;

  if not found then
    return false;
  end if;

  select sequence.completed_at
    into v_completed_at
  from public.lead_contact_sequences sequence
  where sequence.id = p_sequence_id
    and sequence.lead_id = p_lead_id
    and sequence.status = 'completed'
    and private.lead_has_canonical_cold_base_evidence(p_lead_id)
    and not exists (
      select 1
      from public.lead_contact_sequences newer_sequence
      where newer_sequence.lead_id = p_lead_id
        and newer_sequence.status <> 'cancelled'
        and (
          newer_sequence.started_at > sequence.started_at
          or (newer_sequence.started_at = sequence.started_at and newer_sequence.id > sequence.id)
        )
    );

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.lead_activities activity
    where activity.lead_id = p_lead_id
      and activity.created_at >= (
        select started_at
        from public.lead_contact_sequences
        where id = p_sequence_id
      )
      and lower(trim(coalesce(activity.metadata ->> 'outcome', ''))) in (
        'answered',
        'respuesta recibida por whatsapp'
      )
  ) then
    return false;
  end if;

  update public.lead_crm
  set status = 'desistir',
      status_reason = 'No contactado post protocolo',
      next_contact_at = null,
      next_contact_note = '',
      next_contact_source = null,
      cold_base_at = coalesce(v_completed_at, now()),
      previous_status = v_previous_status,
      terminal_at = coalesce(v_completed_at, now()),
      updated_at = now()
  where lead_id = p_lead_id
    and status = v_previous_status
    and status in ('nuevo', 'no_contesta')
    and next_contact_at is null
    and cold_base_at is null
  returning lead_id into v_classified_lead_id;

  if v_classified_lead_id is null then
    return false;
  end if;

  if to_regclass('public.lead_recall_items') is not null then
    execute $sql$
      update public.lead_recall_items
      set available_at = least(available_at, $1 + interval '15 days'),
          updated_at = now()
      where lead_id = $2
        and status in ('available', 'assigned', 'working')
    $sql$ using coalesce(v_completed_at, now()), p_lead_id;
  end if;

  insert into public.lead_activities (
    lead_id, actor_user_id, activity_type, title, detail, metadata
  ) values (
    p_lead_id,
    null,
    'status_change',
    'Lead clasificado como Base fría',
    'No contactado post protocolo',
    jsonb_build_object(
      'status', 'desistir',
      'segment', 'base_fria',
      'reason', 'No contactado post protocolo',
      'sequence_id', p_sequence_id,
      'origin', coalesce(nullif(trim(p_origin), ''), 'protocol_exhaustion'),
      'automatic', true,
      'protocol_completed_at', coalesce(v_completed_at, now())
    )
  );

  return true;
end;
$function$;

ALTER FUNCTION "private"."classify_exhausted_contact_protocol"(p_lead_id uuid, p_sequence_id uuid, p_origin text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.close_pending_sale_on_desistir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status='desistir' and old.status is distinct from 'desistir' then
    update public.lead_sale_requests set status='rejected',reviewed_by=coalesce(new.updated_by,reviewed_by),reviewed_at=now(),review_note='Cancelada automáticamente: el cliente desistió antes de la confirmación administrativa' where lead_id=new.lead_id and status='pending';
    if found then insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(new.lead_id,new.updated_by,'sale_confirmation','Venta pendiente cancelada por desistimiento','Cancelada automáticamente: el cliente desistió antes de la confirmación administrativa',jsonb_build_object('approved',false,'origin','desistir_pending_sale','previous_status',old.status)); end if;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."close_pending_sale_on_desistir"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.contact_window_end(p_date date, p_slot integer)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (p_date + case p_slot when 1 then time '12:00' when 2 then time '16:00' else time '19:00' end)
    at time zone 'America/Argentina/Buenos_Aires';
$function$;

ALTER FUNCTION "private"."contact_window_end"(p_date date, p_slot integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.contact_window_start(p_date date, p_slot integer)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (p_date + case p_slot when 1 then time '10:00' when 2 then time '14:00' else time '17:00' end)
    at time zone 'America/Argentina/Buenos_Aires';
$function$;

ALTER FUNCTION "private"."contact_window_start"(p_date date, p_slot integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.create_lead_contact_sequence(p_lead_id uuid, p_seller_user_id uuid, p_started_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sequence_id uuid;
  v_cursor timestamptz := greatest(coalesce(p_started_at, now()), now());
  v_started_at timestamptz := greatest(coalesce(p_started_at, now()), now());
  v_call_start timestamptz;
  v_call_end timestamptz;
  v_message_end timestamptz;
  v_window_day date;
  v_previous_day date;
  v_protocol_day integer := 0;
  v_band_number integer;
  v_band_attempt integer;
  v_call_attempt integer := 0;
  v_sequence_order integer := 0;
  v_message_step integer := 0;
  v_status text;
  v_manual_action timestamptz;
  v_band text;
begin
  if p_seller_user_id is null then return null; end if;

  select crm.status, crm.next_contact_at
  into v_status, v_manual_action
  from public.leads lead
  join public.lead_crm crm on crm.lead_id = lead.id
  where lead.id = p_lead_id
    and lead.assigned_seller_user_id = p_seller_user_id
    and lead.closed_at is null
    and not coalesce(lead.do_not_contact, false)
  for update of lead, crm;

  if not found or v_status not in ('nuevo', 'no_contesta') or v_manual_action is not null then return null; end if;

  select id into v_sequence_id
  from public.lead_contact_sequences
  where lead_id = p_lead_id and status = 'active';
  if v_sequence_id is not null then return v_sequence_id; end if;

  insert into public.lead_contact_sequences (lead_id, seller_user_id, started_at)
  values (p_lead_id, p_seller_user_id, v_started_at)
  returning id into v_sequence_id;

  for v_band_number in 1..9 loop
    select w.due_start, w.due_end
    into v_call_start, v_call_end
    from private.next_protocol_call_window(v_cursor) w;

    v_window_day := (v_call_start at time zone 'America/Argentina/Buenos_Aires')::date;
    if v_previous_day is distinct from v_window_day then
      v_protocol_day := v_protocol_day + 1;
      v_previous_day := v_window_day;
    end if;
    v_band := case
      when (v_call_end at time zone 'America/Argentina/Buenos_Aires')::time = time '12:00' then '10-12'
      when (v_call_end at time zone 'America/Argentina/Buenos_Aires')::time = time '16:00' then '14-16'
      else '17-19'
    end;

    for v_band_attempt in 1..2 loop
      v_call_attempt := v_call_attempt + 1;
      v_sequence_order := v_sequence_order + 1;
      insert into public.lead_contact_tasks (
        sequence_id, lead_id, seller_user_id, sequence_order, channel,
        call_attempt, message_step, template_id, due_start, due_end, status,
        protocol_day, protocol_band, band_attempt
      ) values (
        v_sequence_id, p_lead_id, p_seller_user_id, v_sequence_order, 'call',
        v_call_attempt, null, null, v_call_start, v_call_end,
        case when v_call_attempt = 1 then 'pending' else 'scheduled' end,
        v_protocol_day, v_band, v_band_attempt
      );

      if v_call_attempt in (1, 4) then
        v_message_step := v_message_step + 1;
        v_sequence_order := v_sequence_order + 1;
        v_message_end := least(v_call_start + interval '2 hours', v_call_end);
        insert into public.lead_contact_tasks (
          sequence_id, lead_id, seller_user_id, sequence_order, channel,
          call_attempt, message_step, template_id, due_start, due_end, status,
          protocol_day, protocol_band, band_attempt
        ) values (
          v_sequence_id, p_lead_id, p_seller_user_id, v_sequence_order, 'whatsapp',
          null, v_message_step,
          (select id from public.contact_message_templates where step_number = v_message_step),
          v_call_start, greatest(v_call_start + interval '1 minute', v_message_end), 'scheduled',
          v_protocol_day, v_band, null
        );
      end if;
    end loop;
    v_cursor := v_call_end + interval '1 second';
  end loop;
  return v_sequence_id;
end;
$function$;

ALTER FUNCTION "private"."create_lead_contact_sequence"(p_lead_id uuid, p_seller_user_id uuid, p_started_at timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.create_profile_for_invited_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pending public.user_invites%rowtype;
begin
  select * into pending
  from public.user_invites
  where lower(email) = lower(new.email)
    and active = true
    and accepted_at is null
  limit 1;

  if not found then
    raise exception 'No se encontró la invitación al crear el perfil.';
  end if;

  insert into public.profiles (
    user_id,
    email,
    role,
    seller_code,
    tiktok_code,
    full_name,
    phone,
    contact_email,
    active
  ) values (
    new.id,
    lower(new.email),
    pending.role,
    upper(pending.seller_code),
    pending.tiktok_code,
    pending.full_name,
    pending.phone,
    pending.contact_email,
    true
  );

  update public.user_invites
  set accepted_at = now(), active = false
  where id = pending.id;

  return new;
end;
$function$;

ALTER FUNCTION "private"."create_profile_for_invited_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.create_sales_case_after_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quote_id uuid;
  v_case_id uuid;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    v_quote_id := new.quote_id;
    if v_quote_id is null then
      select id into v_quote_id
      from public.sales_quotes
      where lead_id = new.lead_id and seller_user_id = new.seller_user_id and status in ('issued', 'converted')
      order by issued_at desc
      limit 1;
    end if;

    insert into public.sales_cases (sale_request_id, lead_id, seller_user_id, quote_id, vehicle, sale_amount)
    values (new.id, new.lead_id, new.seller_user_id, v_quote_id, new.vehicle, new.sale_amount)
    on conflict (sale_request_id) do update set quote_id = coalesce(public.sales_cases.quote_id, excluded.quote_id)
    returning id into v_case_id;

    if v_quote_id is not null then
      update public.sales_quotes set status = 'converted', updated_at = now() where id = v_quote_id;
    end if;

    insert into public.sales_case_events (sales_case_id, actor_user_id, event_type, comment)
    values (v_case_id, new.reviewed_by, 'case_created', 'Venta confirmada por supervisión; minuta habilitada.');

    insert into public.sales_notifications (recipient_user_id, sales_case_id, notification_type, title, body)
    values (new.seller_user_id, v_case_id, 'sale_confirmed', 'Venta confirmada', 'La venta fue aprobada por supervisión. Completá la minuta para iniciar el control administrativo.');
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."create_sales_case_after_confirmation"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.current_user_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and active = true
  );
$function$;

ALTER FUNCTION "private"."current_user_active"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.current_user_can_administer_sales()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role::text in ('admin', 'admventas')
      and active = true
  );
$function$;

ALTER FUNCTION "private"."current_user_can_administer_sales"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.current_user_can_review_sales()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role::text in ('admin', 'supervisor', 'admventas')
      and active = true
  );
$function$;

ALTER FUNCTION "private"."current_user_can_review_sales"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.current_user_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'admin'::public.app_role
      and active = true
  );
$function$;

ALTER FUNCTION "private"."current_user_is_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.current_user_is_management()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role::text in ('admin', 'supervisor')
      and active = true
  );
$function$;

ALTER FUNCTION "private"."current_user_is_management"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.current_user_is_sales_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role::text = 'admventas'
      and active = true
  );
$function$;

ALTER FUNCTION "private"."current_user_is_sales_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.enforce_en_gestion_next_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status = 'en_proceso'
     and new.next_contact_at is null
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.next_contact_at is distinct from new.next_contact_at
     )
  then
    raise exception 'En gestión requiere un próximo contacto con fecha y hora';
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."enforce_en_gestion_next_contact"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.enforce_plan_minute_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer_type text := 'savings_plan';
  v_total_installments integer;
  v_expected_remaining integer;
begin
  if new.sales_case_id is null then
    return new;
  end if;

  if new.brand_name not in ('Volkswagen', 'Peugeot', 'Fiat') then
    raise exception 'La minuta requiere una marca válida';
  end if;

  select coalesce(quote.offer_type, 'savings_plan') into v_offer_type
  from public.sales_cases sales_case
  left join public.sales_quotes quote on quote.id = sales_case.quote_id
  where sales_case.id = new.sales_case_id;

  if v_offer_type = 'savings_plan' then
    v_total_installments := coalesce(
      nullif(new.commercial_snapshot ->> 'installmentCount', '')::integer,
      nullif(new.commercial_snapshot ->> 'total_installments', '')::integer,
      new.installments_paid + new.installments_to_pay
    );
    v_expected_remaining := case when v_total_installments = 120 then 119 else 83 end;
    if new.installments_paid <> 1 or new.installments_to_pay <> v_expected_remaining then
      raise exception 'Las cuotas del plan deben ser 1/%', v_expected_remaining;
    end if;
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."enforce_plan_minute_identity"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.ensure_lead_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text := regexp_replace(new.customer_phone, '[^0-9]', '', 'g');
  v_customer_id uuid;
begin
  if char_length(v_phone) < 6 then
    raise exception 'El teléfono del cliente no es válido';
  end if;

  insert into public.customers (
    normalized_phone, primary_phone, full_name, contact_consent_at, contact_consent_source,
    marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source,
    do_not_contact, do_not_contact_at, do_not_contact_reason
  ) values (
    v_phone,
    new.customer_phone,
    new.customer_name,
    new.contact_consent_at,
    new.contact_consent_source,
    new.marketing_opt_in,
    new.marketing_opt_in_at,
    new.marketing_opt_in_source,
    new.do_not_contact,
    new.do_not_contact_at,
    new.do_not_contact_reason
  )
  on conflict (normalized_phone) do update set
    primary_phone = excluded.primary_phone,
    full_name = coalesce(excluded.full_name, public.customers.full_name),
    contact_consent_at = coalesce(public.customers.contact_consent_at, excluded.contact_consent_at),
    contact_consent_source = case when public.customers.contact_consent_source = '' then excluded.contact_consent_source else public.customers.contact_consent_source end,
    marketing_opt_in = public.customers.marketing_opt_in or excluded.marketing_opt_in,
    marketing_opt_in_at = coalesce(public.customers.marketing_opt_in_at, excluded.marketing_opt_in_at),
    marketing_opt_in_source = case when public.customers.marketing_opt_in_source = '' then excluded.marketing_opt_in_source else public.customers.marketing_opt_in_source end,
    do_not_contact = public.customers.do_not_contact or excluded.do_not_contact,
    do_not_contact_at = coalesce(public.customers.do_not_contact_at, excluded.do_not_contact_at),
    do_not_contact_reason = case when public.customers.do_not_contact_reason = '' then excluded.do_not_contact_reason else public.customers.do_not_contact_reason end,
    updated_at = now()
  returning id into v_customer_id;

  new.customer_id := v_customer_id;
  return new;
end;
$function$;

ALTER FUNCTION "private"."ensure_lead_customer"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.guard_canonical_cold_base_marker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.cold_base_at is not null
     and old.cold_base_at is distinct from new.cold_base_at
     and (
       new.status <> 'desistir'
       or new.status_reason is distinct from 'No contactado post protocolo'
       or not private.lead_has_canonical_cold_base_evidence(new.lead_id)
     )
  then
    new.cold_base_at := null;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."guard_canonical_cold_base_marker"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.initialize_lead_crm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.lead_crm (lead_id, priority)
  values (new.id, new.priority)
  on conflict (lead_id) do nothing;
  return new;
end;
$function$;

ALTER FUNCTION "private"."initialize_lead_crm"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.keep_protocol_deadlines_out_of_manual_agenda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.next_contact_at is null then
    new.next_contact_note := '';
    new.next_contact_source := null;
  else
    new.next_contact_source := 'manual';
    if tg_op = 'INSERT'
      or old.next_contact_at is distinct from new.next_contact_at
      or old.next_contact_note is distinct from new.next_contact_note
      or old.next_contact_source is distinct from 'manual'
    then
      perform private.cancel_lead_contact_protocol(
        new.lead_id,
        'Próxima acción manual registrada'
      );
    end if;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."keep_protocol_deadlines_out_of_manual_agenda"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.lead_has_canonical_cold_base_evidence(p_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.lead_contact_sequences sequence
    cross join lateral (
      select
        count(*) filter (where task.channel = 'call') as call_count,
        count(*) filter (where task.channel = 'whatsapp') as whatsapp_count,
        count(*) filter (where task.status in ('pending', 'scheduled')) as unfinished_count,
        count(*) filter (where task.status = 'cancelled') as cancelled_count,
        count(*) filter (where task.outcome = 'answered') as answered_count,
        count(*) filter (
          where task.channel = 'call'
            and not (
              (task.status = 'completed' and task.outcome = 'no_answer')
              or (task.status = 'skipped' and task.outcome = 'skipped')
            )
        ) as invalid_call_result_count,
        count(*) filter (
          where task.channel = 'whatsapp'
            and not (
              (task.status = 'completed' and task.outcome = 'sent')
              or (task.status = 'skipped' and task.outcome = 'skipped')
            )
        ) as invalid_whatsapp_result_count,
        count(distinct (task.protocol_day, task.protocol_band))
          filter (where task.channel = 'call') as protocol_band_count
      from public.lead_contact_tasks task
      where task.sequence_id = sequence.id
    ) evidence
    where sequence.lead_id = p_lead_id
      and sequence.status = 'completed'
      and evidence.unfinished_count = 0
      and evidence.cancelled_count = 0
      and evidence.answered_count = 0
      and evidence.invalid_call_result_count = 0
      and evidence.invalid_whatsapp_result_count = 0
      and (
        (evidence.call_count = 18
          and evidence.whatsapp_count = 2
          and evidence.protocol_band_count = 9)
        or
        (evidence.call_count = 6
          and evidence.whatsapp_count = 2)
      )
      and not exists (
        select 1
        from public.lead_contact_sequences active_sequence
        where active_sequence.lead_id = sequence.lead_id
          and active_sequence.status = 'active'
      )
      and not exists (
        select 1
        from public.lead_contact_sequences newer_sequence
        where newer_sequence.lead_id = sequence.lead_id
          and newer_sequence.status <> 'cancelled'
          and (
            newer_sequence.started_at > sequence.started_at
            or (newer_sequence.started_at = sequence.started_at and newer_sequence.id > sequence.id)
          )
      )
  );
$function$;

ALTER FUNCTION "private"."lead_has_canonical_cold_base_evidence"(p_lead_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.next_protocol_call_window(p_after timestamp with time zone)
 RETURNS TABLE(due_start timestamp with time zone, due_end timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_after timestamptz := greatest(coalesce(p_after, now()), now());
  v_local timestamp;
  v_day date;
  v_slot integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_is_saturday boolean;
begin
  v_local := v_after at time zone 'America/Argentina/Buenos_Aires';
  v_day := private.business_date(v_local::date, 0);
  v_is_saturday := extract(isodow from v_day) = 6;
  if v_day <> v_local::date then v_slot := 1;
  elsif v_local::time < time '12:00' then v_slot := 1;
  elsif v_local::time < time '16:00' then v_slot := 2;
  elsif not v_is_saturday and v_local::time < time '19:00' then v_slot := 3;
  else v_day := private.business_date(v_day, 1); v_slot := 1;
  end if;
  v_window_start := private.contact_window_start(v_day, v_slot);
  v_window_end := private.contact_window_end(v_day, v_slot);
  due_start := greatest(v_after, v_window_start);
  due_end := v_window_end;
  return next;
end;
$function$;

ALTER FUNCTION "private"."next_protocol_call_window"(p_after timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.normalize_plan_sale_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_quote public.sales_quotes%rowtype;
  v_vehicle text;
begin
  if new.quote_id is null then return new; end if;

  select * into v_quote
  from public.sales_quotes
  where id = new.quote_id;

  if v_quote.id is null or v_quote.lead_id <> new.lead_id then
    raise exception 'El presupuesto no corresponde a este lead';
  end if;

  if v_quote.offer_type = 'savings_plan' then
    v_vehicle := trim(concat_ws(' ',
      nullif(v_quote.commercial_snapshot ->> 'brand', ''),
      nullif(v_quote.commercial_snapshot ->> 'model', ''),
      nullif(v_quote.vehicle_version, '')
    ));
    if char_length(v_vehicle) >= 2 then new.vehicle := v_vehicle; end if;
    new.sale_amount := v_quote.sale_price;
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."normalize_plan_sale_request"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.prepare_management_playbook_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.current_user_active() then
    raise exception 'Acceso no autorizado';
  end if;

  new.updated_by := v_actor;
  new.updated_at := now();

  if new.completed then
    if tg_op = 'INSERT' or not old.completed then
      new.completed_at := now();
      new.completed_by := v_actor;
    else
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."prepare_management_playbook_item"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.prevent_seller_lead_access_after_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles profile
      where profile.user_id = (select auth.uid()) and profile.role::text = 'seller' and profile.active = true
    )
    and exists (select 1 from public.sales_cases sales_case where sales_case.lead_id = new.lead_id)
  then raise exception 'El Lead ya se encuentra en el circuito administrativo'; end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."prevent_seller_lead_access_after_sale"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.queue_cold_lead_for_recall()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lead public.leads%rowtype;
  v_customer_name text;
begin
  if new.status = 'desistir' and old.status is distinct from new.status then
    select * into v_lead from public.leads where id = new.lead_id;

    v_customer_name := left(trim(coalesce(v_lead.customer_name, '')), 120);
    if char_length(v_customer_name) < 2 then
      v_customer_name := 'Cliente sin nombre';
    end if;

    if not v_lead.do_not_contact
      and not exists (select 1 from public.sales_cases where lead_id = new.lead_id)
    then
      insert into public.lead_recall_items (
        lead_id, customer_name, customer_phone, model_interest, source_detail,
        original_inquiry_at, available_at
      ) values (
        new.lead_id,
        v_customer_name,
        v_lead.customer_phone,
        coalesce(v_lead.model_interest, ''),
        coalesce(v_lead.source_detail, ''),
        v_lead.created_at,
        now() + interval '15 days'
      ) on conflict (lead_id) where status in ('available', 'assigned', 'working')
      do update set
        available_at = least(public.lead_recall_items.available_at, excluded.available_at),
        updated_at = now();
    end if;
  elsif new.status not in ('desistir', 'invalido', 'venta') and old.status = 'desistir' then
    update public.lead_recall_items
    set status = 'cancelled', updated_at = now()
    where lead_id = new.lead_id and status in ('available', 'assigned', 'working');
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."queue_cold_lead_for_recall"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.refresh_recall_panel_from_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    perform private.sync_recall_panel_progress(old.recall_panel_id);
    return old;
  end if;

  perform private.sync_recall_panel_progress(new.recall_panel_id);
  if tg_op = 'UPDATE' and old.recall_panel_id is distinct from new.recall_panel_id then
    perform private.sync_recall_panel_progress(old.recall_panel_id);
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."refresh_recall_panel_from_item"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.set_campaign_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end;
$function$;

ALTER FUNCTION "private"."set_campaign_metadata"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.start_contact_sequence_after_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.assigned_seller_user_id is not null
    and tg_op = 'INSERT'
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.create_lead_contact_sequence(
      new.id,
      new.assigned_seller_user_id,
      greatest(coalesce(new.assigned_at, now()), now())
    );

  elsif new.assigned_seller_user_id is not null
    and old.assigned_seller_user_id is distinct from new.assigned_seller_user_id
    and coalesce(new.routing_reason, '') <> 'recall_reactivated'
    and not new.do_not_contact
    and not exists (select 1 from public.sales_cases where lead_id = new.id)
  then
    perform private.start_lead_crm_cycle(
      new.id,
      coalesce(new.assigned_by_user_id, new.assigned_seller_user_id),
      case
        when new.routing_reason = 'authorized_reactivation' then 'reactivation'
        when old.assigned_seller_user_id is null then 'assignment'
        else 'transfer'
      end,
      case
        when new.routing_reason = 'authorized_reactivation' then 'Lead reactivado con autorización'
        when old.assigned_seller_user_id is null then 'Lead asignado'
        else 'Lead transferido a otro vendedor'
      end
    );
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."start_contact_sequence_after_assignment"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.start_lead_crm_cycle(p_lead_id uuid, p_actor_user_id uuid, p_origin text, p_reason text, p_override_opt_out boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_previous public.lead_crm%rowtype; v_seller uuid; v_do_not_contact boolean;
begin
 select * into v_previous from public.lead_crm where lead_id=p_lead_id for update; if not found then raise exception 'No se encontró la ficha CRM del Lead'; end if;
 select assigned_seller_user_id,coalesce(do_not_contact,false) into v_seller,v_do_not_contact from public.leads where id=p_lead_id; if v_seller is null then raise exception 'El Lead todavía no tiene vendedor'; end if;
 if v_do_not_contact and not p_override_opt_out then insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(p_lead_id,p_actor_user_id,'assignment','Nuevo ciclo bloqueado por opt-out','El Lead solicitó no ser contactado; se preservó su estado y no se generó protocolo',jsonb_build_object('origin',p_origin,'blocked',true,'previous_status',v_previous.status)); return; end if;
 perform private.cancel_lead_contact_protocol(p_lead_id,'Inicio de nuevo ciclo: '||p_origin);
 insert into public.lead_activities(lead_id,actor_user_id,activity_type,title,detail,metadata) values(p_lead_id,p_actor_user_id,'assignment','Nuevo ciclo comercial iniciado',left(trim(coalesce(p_reason,'Nuevo ciclo autorizado')),5000),jsonb_build_object('origin',p_origin,'previous_status',v_previous.status,'previous_priority',v_previous.priority,'previous_status_reason',v_previous.status_reason,'previous_desist_reason',v_previous.desist_reason,'previous_next_contact_at',v_previous.next_contact_at,'previous_next_contact_note',v_previous.next_contact_note,'previous_last_contact_at',v_previous.last_contact_at,'previous_last_contact_outcome',v_previous.last_contact_outcome,'previous_interview_at',v_previous.interview_at,'previous_interview_location',v_previous.interview_location,'previous_interview_mode',v_previous.interview_mode,'previous_interview_operational_status',v_previous.interview_operational_status,'previous_interview_objective',v_previous.interview_objective,'previous_final_objection',v_previous.final_objection,'previous_deposit_amount',v_previous.deposit_amount,'previous_deposit_at',v_previous.deposit_at,'previous_deposit_validation',v_previous.deposit_validation,'previous_post_deposit_action_at',v_previous.post_deposit_action_at,'previous_post_deposit_action_status',v_previous.post_deposit_action_status,'previous_terminal_at',v_previous.terminal_at,'previous_sale_confirmation_status',v_previous.sale_confirmation_status,'previous_sale_requested_at',v_previous.sale_requested_at,'previous_sale_confirmed_at',v_previous.sale_confirmed_at,'previous_vehicle_sold',v_previous.vehicle_sold,'previous_sale_amount',v_previous.sale_amount));
 update public.lead_crm set status='nuevo',priority='normal',status_reason='',desist_reason=null,next_contact_at=null,next_contact_note='',next_contact_source=null,last_contact_at=null,last_contact_outcome='',interview_at=null,interview_location='',interview_mode=null,interview_operational_status=null,interview_objective='',final_objection='',deposit_amount=null,deposit_at=null,deposit_validation='',post_deposit_action_at=null,post_deposit_action_status=null,previous_status=null,terminal_at=null,cold_base_at=null,sale_confirmation_status='none',sale_requested_at=null,sale_requested_by=null,sale_confirmed_at=null,sale_confirmed_by=null,vehicle_sold='',sale_amount=null,updated_by=p_actor_user_id,updated_at=now() where lead_id=p_lead_id;
 update public.lead_management_playbook_items set completed=false where lead_id=p_lead_id and completed=true;
 perform private.create_lead_contact_sequence(p_lead_id,v_seller,now());
end; $function$;

ALTER FUNCTION "private"."start_lead_crm_cycle"(p_lead_id uuid, p_actor_user_id uuid, p_origin text, p_reason text, p_override_opt_out boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.sync_contact_sequence_with_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_seller uuid;
begin
  if new.status not in ('nuevo', 'no_contesta') then
    perform private.cancel_lead_contact_protocol(new.lead_id, 'Cambio de estado a ' || new.status);
  elsif old.status not in ('nuevo', 'no_contesta')
    and new.status in ('nuevo', 'no_contesta')
    and new.next_contact_at is null
  then
    select assigned_seller_user_id into v_seller
    from public.leads
    where id = new.lead_id;
    if v_seller is not null then
      perform private.create_lead_contact_sequence(new.lead_id, v_seller, now());
    end if;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "private"."sync_contact_sequence_with_status"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.sync_recall_panel_progress(p_panel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer;
  v_completed integer;
begin
  if p_panel_id is null then return; end if;

  select count(*), count(*) filter (where status in ('converted', 'exhausted', 'cancelled'))
  into v_total, v_completed
  from public.lead_recall_items
  where recall_panel_id = p_panel_id;

  update public.lead_recall_panels
  set total_items = v_total,
      completed_items = v_completed,
      status = case when v_total > 0 and v_completed = v_total then 'closed' else 'open' end,
      closed_at = case
        when v_total > 0 and v_completed = v_total then coalesce(closed_at, now())
        else null
      end
  where id = p_panel_id;
end;
$function$;

ALTER FUNCTION "private"."sync_recall_panel_progress"(p_panel_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.validate_sales_quote_bank_credit_applicability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if new.offer_type = 'bank_credit' and not exists (
    select 1
    from public.bank_credit_offer_versions link
    join public.bank_credit_offers offer on offer.id = link.offer_id
    join public.model_versions version on version.id = link.version_id
    join public.models model on model.id = version.model_id
    where link.offer_id = new.bank_credit_offer_id
      and offer.active = true
      and (offer.valid_from is null or offer.valid_from <= v_today)
      and (offer.valid_to is null or offer.valid_to >= v_today)
      and version.active = true
      and model.active = true
      and version.model_id = new.model_id
      and version.name = new.vehicle_version
  ) then
    raise exception 'Selected bank credit is not active/current for this model/version'
      using errcode = '23514',
            constraint = 'sales_quotes_bank_credit_applicability';
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."validate_sales_quote_bank_credit_applicability"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION private.validate_sales_quote_offer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_final_price numeric(16, 2);
begin
  if new.offer_type = 'savings_plan' then
    select campaign.final_price
      into v_final_price
    from public.campaigns campaign
    where campaign.id = new.campaign_id
      and campaign.model_id = new.model_id
      and campaign.active = true
      and (campaign.valid_from is null or campaign.valid_from <= current_date)
      and (campaign.valid_to is null or campaign.valid_to >= current_date);

    if not found then
      raise exception 'El plan seleccionado no está vigente para este modelo';
    end if;

    if v_final_price is null or v_final_price <= 0 then
      raise exception 'El plan seleccionado todavía no tiene un valor final vigente';
    end if;

    new.sale_price := v_final_price;
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "private"."validate_sales_quote_offer"() OWNER TO "postgres";

ALTER TABLE "auth"."users" ALTER COLUMN "phone" SET DEFAULT NULL::character varying;

ALTER TABLE "auth"."users" ALTER COLUMN "phone_change" SET DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ALTER COLUMN "phone_change_token" SET DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ALTER COLUMN "email_change_token_current" SET DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ALTER COLUMN "email_change_confirm_status" SET DEFAULT 0;

ALTER TABLE "auth"."users" ALTER COLUMN "reauthentication_token" SET DEFAULT ''::character varying;

ALTER TABLE "auth"."users" ALTER COLUMN "is_sso_user" SET DEFAULT false;

ALTER TABLE "auth"."users" ALTER COLUMN "is_anonymous" SET DEFAULT false;

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "breakage_rate" SET DEFAULT 0;

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "patenting_rate" SET DEFAULT 0;

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "fixed_expenses" SET DEFAULT 0;

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "notes" SET DEFAULT ''::text;

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "sort_order" SET DEFAULT 10;

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."bank_credit_offers" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."brands" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."brands" ALTER COLUMN "description" SET DEFAULT ''::text;

ALTER TABLE "public"."brands" ALTER COLUMN "sort_order" SET DEFAULT 0;

ALTER TABLE "public"."brands" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."brands" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."brands" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."campaign_audit_log" ALTER COLUMN "changed_at" SET DEFAULT now();

ALTER TABLE "public"."campaigns" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."campaigns" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."campaigns" ALTER COLUMN "bonus" SET DEFAULT 'Consultar bonificación vigente'::text;

ALTER TABLE "public"."campaigns" ALTER COLUMN "benefits" SET DEFAULT ARRAY['Asesoramiento personalizado'::text, 'Condiciones sujetas a disponibilidad'::text];

ALTER TABLE "public"."campaigns" ALTER COLUMN "timer_hours" SET DEFAULT 24;

ALTER TABLE "public"."campaigns" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."campaigns" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."campaigns" ALTER COLUMN "version_name" SET DEFAULT ''::text;

ALTER TABLE "public"."campaigns" ALTER COLUMN "transmission" SET DEFAULT ''::text;

ALTER TABLE "public"."campaigns" ALTER COLUMN "installment_is_from" SET DEFAULT true;

ALTER TABLE "public"."campaigns" ALTER COLUMN "sort_order" SET DEFAULT 10;

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "seller_user_id" SET DEFAULT auth.uid();

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "installments_paid" SET DEFAULT 0;

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "status" SET DEFAULT 'completed'::text;

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "commercial_snapshot" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."commercial_applications" ALTER COLUMN "revision_number" SET DEFAULT 1;

ALTER TABLE "public"."contact_message_templates" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."contact_message_templates" ALTER COLUMN "meta_language" SET DEFAULT 'es_AR'::text;

ALTER TABLE "public"."contact_message_templates" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."contact_message_templates" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."contact_message_templates" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."customers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."customers" ALTER COLUMN "contact_consent_source" SET DEFAULT ''::text;

ALTER TABLE "public"."customers" ALTER COLUMN "marketing_opt_in" SET DEFAULT false;

ALTER TABLE "public"."customers" ALTER COLUMN "marketing_opt_in_source" SET DEFAULT ''::text;

ALTER TABLE "public"."customers" ALTER COLUMN "do_not_contact" SET DEFAULT false;

ALTER TABLE "public"."customers" ALTER COLUMN "do_not_contact_reason" SET DEFAULT ''::text;

ALTER TABLE "public"."customers" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."customers" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."lead_activities" ALTER COLUMN "detail" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_activities" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."lead_activities" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_contact_sequences" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."lead_contact_sequences" ALTER COLUMN "status" SET DEFAULT 'active'::text;

ALTER TABLE "public"."lead_contact_sequences" ALTER COLUMN "started_at" SET DEFAULT now();

ALTER TABLE "public"."lead_contact_sequences" ALTER COLUMN "stopped_reason" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_contact_sequences" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_contact_sequences" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."lead_contact_tasks" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."lead_contact_tasks" ALTER COLUMN "status" SET DEFAULT 'pending'::text;

ALTER TABLE "public"."lead_contact_tasks" ALTER COLUMN "outcome" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_contact_tasks" ALTER COLUMN "note" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_contact_tasks" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_contact_tasks" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."lead_crm" ALTER COLUMN "status" SET DEFAULT 'nuevo'::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "priority" SET DEFAULT 'normal'::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "status_reason" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "next_contact_note" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "last_contact_outcome" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "interview_location" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "sale_confirmation_status" SET DEFAULT 'none'::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "vehicle_sold" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_crm" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."lead_crm" ALTER COLUMN "interview_objective" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "final_objection" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_crm" ALTER COLUMN "deposit_validation" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_import_batches" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."lead_import_batches" ALTER COLUMN "row_count" SET DEFAULT 0;

ALTER TABLE "public"."lead_import_batches" ALTER COLUMN "created_count" SET DEFAULT 0;

ALTER TABLE "public"."lead_import_batches" ALTER COLUMN "merged_count" SET DEFAULT 0;

ALTER TABLE "public"."lead_import_batches" ALTER COLUMN "rejected_count" SET DEFAULT 0;

ALTER TABLE "public"."lead_import_batches" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_management_playbook_events" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_management_playbook_items" ALTER COLUMN "completed" SET DEFAULT false;

ALTER TABLE "public"."lead_management_playbook_items" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_management_playbook_items" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "model_interest" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "source_detail" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "available_at" SET DEFAULT now();

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "status" SET DEFAULT 'available'::text;

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "attempt_count" SET DEFAULT 0;

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_recall_items" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."lead_recall_panels" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."lead_recall_panels" ALTER COLUMN "status" SET DEFAULT 'open'::text;

ALTER TABLE "public"."lead_recall_panels" ALTER COLUMN "total_items" SET DEFAULT 0;

ALTER TABLE "public"."lead_recall_panels" ALTER COLUMN "completed_items" SET DEFAULT 0;

ALTER TABLE "public"."lead_recall_panels" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."lead_sale_requests" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."lead_sale_requests" ALTER COLUMN "notes" SET DEFAULT ''::text;

ALTER TABLE "public"."lead_sale_requests" ALTER COLUMN "status" SET DEFAULT 'pending'::text;

ALTER TABLE "public"."lead_sale_requests" ALTER COLUMN "requested_at" SET DEFAULT now();

ALTER TABLE "public"."lead_sale_requests" ALTER COLUMN "review_note" SET DEFAULT ''::text;

ALTER TABLE "public"."leads" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."leads" ALTER COLUMN "source_channel" SET DEFAULT 'whatsapp'::text;

ALTER TABLE "public"."leads" ALTER COLUMN "qualification_status" SET DEFAULT 'follow_up'::text;

ALTER TABLE "public"."leads" ALTER COLUMN "priority" SET DEFAULT 'normal'::text;

ALTER TABLE "public"."leads" ALTER COLUMN "intent_summary" SET DEFAULT ''::text;

ALTER TABLE "public"."leads" ALTER COLUMN "routing_status" SET DEFAULT 'pending_supervisor'::text;

ALTER TABLE "public"."leads" ALTER COLUMN "routing_reason" SET DEFAULT 'general_inbox'::text;

ALTER TABLE "public"."leads" ALTER COLUMN "last_message_at" SET DEFAULT now();

ALTER TABLE "public"."leads" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."leads" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."leads" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."leads" ALTER COLUMN "contact_consent_source" SET DEFAULT ''::text;

ALTER TABLE "public"."leads" ALTER COLUMN "marketing_opt_in" SET DEFAULT false;

ALTER TABLE "public"."leads" ALTER COLUMN "marketing_opt_in_source" SET DEFAULT ''::text;

ALTER TABLE "public"."leads" ALTER COLUMN "do_not_contact" SET DEFAULT false;

ALTER TABLE "public"."leads" ALTER COLUMN "do_not_contact_reason" SET DEFAULT ''::text;

ALTER TABLE "public"."model_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."model_versions" ALTER COLUMN "sort_order" SET DEFAULT 10;

ALTER TABLE "public"."model_versions" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."model_versions" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."model_versions" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."models" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."models" ALTER COLUMN "short_description" SET DEFAULT ''::text;

ALTER TABLE "public"."models" ALTER COLUMN "advance_text" SET DEFAULT 'A confirmar'::text;

ALTER TABLE "public"."models" ALTER COLUMN "installment_text" SET DEFAULT 'A confirmar'::text;

ALTER TABLE "public"."models" ALTER COLUMN "sort_order" SET DEFAULT 0;

ALTER TABLE "public"."models" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."models" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."models" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."prequalification_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."prequalification_events" ALTER COLUMN "seller_user_id" SET DEFAULT auth.uid();

ALTER TABLE "public"."prequalification_events" ALTER COLUMN "campaign_snapshot" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."prequalification_events" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."profiles" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."profiles" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."profiles" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."sales_case_events" ALTER COLUMN "comment" SET DEFAULT ''::text;

ALTER TABLE "public"."sales_case_events" ALTER COLUMN "visible_to_seller" SET DEFAULT true;

ALTER TABLE "public"."sales_case_events" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."sales_case_events" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."sales_cases" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."sales_cases" ALTER COLUMN "case_code" SET DEFAULT ('GS-VTA-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 10)));

ALTER TABLE "public"."sales_cases" ALTER COLUMN "status" SET DEFAULT 'minute_pending'::text;

ALTER TABLE "public"."sales_cases" ALTER COLUMN "cdn_scoring_status" SET DEFAULT 'pending'::text;

ALTER TABLE "public"."sales_cases" ALTER COLUMN "dealer_scoring_status" SET DEFAULT 'pending'::text;

ALTER TABLE "public"."sales_cases" ALTER COLUMN "contract_status" SET DEFAULT 'pending'::text;

ALTER TABLE "public"."sales_cases" ALTER COLUMN "cancellation_reason" SET DEFAULT ''::text;

ALTER TABLE "public"."sales_cases" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."sales_cases" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."sales_notifications" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."sales_notifications" ALTER COLUMN "body" SET DEFAULT ''::text;

ALTER TABLE "public"."sales_notifications" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "seller_user_id" SET DEFAULT auth.uid();

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "vehicle_version" SET DEFAULT ''::text;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "financed_amount" SET DEFAULT 0;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "breakage_amount" SET DEFAULT 0;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "patenting_amount" SET DEFAULT 0;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "expenses_amount" SET DEFAULT 0;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "status" SET DEFAULT 'issued'::text;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "commercial_snapshot" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "issued_at" SET DEFAULT now();

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "breakage_base_amount" SET DEFAULT 0;

ALTER TABLE "public"."sales_quotes" ALTER COLUMN "breakage_vat_amount" SET DEFAULT 0;

ALTER TABLE "public"."user_invites" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."user_invites" ALTER COLUMN "role" SET DEFAULT 'seller'::app_role;

ALTER TABLE "public"."user_invites" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "public"."user_invites" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "auth"."users" ADD CONSTRAINT "users_email_change_confirm_status_check" CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2);

ALTER TABLE "auth"."users" ADD CONSTRAINT "users_phone_key" UNIQUE (phone);

ALTER TABLE "auth"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."bank_credit_offer_versions" ADD CONSTRAINT "bank_credit_offer_versions_pkey" PRIMARY KEY (offer_id, version_id);

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offer_amounts" CHECK ((min_financed_amount IS NULL OR min_financed_amount >= 0::numeric) AND (max_financed_amount IS NULL OR max_financed_amount >= 0::numeric) AND (max_financed_amount IS NULL OR min_financed_amount IS NULL OR max_financed_amount >= min_financed_amount) AND fixed_expenses >= 0::numeric);

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offer_dates" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offer_names" CHECK (char_length(TRIM(BOTH FROM financier_name)) >= 2 AND char_length(TRIM(BOTH FROM financier_name)) <= 120 AND char_length(TRIM(BOTH FROM offer_name)) >= 2 AND char_length(TRIM(BOTH FROM offer_name)) <= 160);

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offer_notes" CHECK (char_length(notes) <= 4000);

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offer_rates" CHECK (installment_coefficient > 0::numeric AND breakage_rate >= 0::numeric AND breakage_rate <= 100::numeric AND patenting_rate >= 0::numeric AND patenting_rate <= 100::numeric AND (tna IS NULL OR tna >= 0::numeric AND tna <= 1000::numeric) AND (cftea IS NULL OR cftea >= 0::numeric AND cftea <= 2000::numeric));

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offer_term" CHECK (term_months >= 1 AND term_months <= 120);

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offers_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."brands" ADD CONSTRAINT "brands_name_key" UNIQUE (name);

ALTER TABLE "public"."brands" ADD CONSTRAINT "brands_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."campaign_audit_log" ADD CONSTRAINT "campaign_audit_log_action_check" CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]));

ALTER TABLE "public"."campaign_audit_log" ADD CONSTRAINT "campaign_audit_log_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_commercial_amounts_nonnegative" CHECK ((advance_amount IS NULL OR advance_amount >= 0::numeric) AND (installment_amount IS NULL OR installment_amount >= 0::numeric));

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_final_price_nonnegative" CHECK (final_price IS NULL OR final_price >= 0::numeric);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_installment_count_positive" CHECK (installment_count IS NULL OR installment_count > 0);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_plan_name_length" CHECK (char_length(plan_name) >= 2 AND char_length(plan_name) <= 80);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_slots_nonnegative" CHECK (slots IS NULL OR slots >= 0);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_timer_range" CHECK (timer_hours >= 1 AND timer_hours <= 720);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_transmission_values" CHECK (transmission = ANY (ARRAY[''::text, 'MT'::text, 'AT'::text]));

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_valid_dates" CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_version_name_length" CHECK (char_length(version_name) <= 80);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_amounts" CHECK (monthly_income >= 0::numeric AND agreed_price >= 0::numeric AND (first_payment_amount IS NULL OR first_payment_amount >= 0::numeric) AND (second_payment_amount IS NULL OR second_payment_amount >= 0::numeric));

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_crm_campaign" CHECK (lead_id IS NULL OR campaign_id IS NOT NULL);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_cuil" CHECK (cuil ~ '^\d{11}$'::text);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_document_number" CHECK (document_number ~ '^\d{7,12}$'::text);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_installments" CHECK (installments_paid >= 0 AND installments_to_pay > 0);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_lead_unique" UNIQUE (lead_id);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_payment_pairs" CHECK ((first_payment_date IS NULL) = (first_payment_amount IS NULL) AND (second_payment_date IS NULL) = (second_payment_amount IS NULL));

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_prequalification_event_id_key" UNIQUE (prequalification_event_id);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_request_code_key" UNIQUE (request_code);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_revision" CHECK (revision_number >= 1 AND revision_number <= 1000);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_source" CHECK (num_nonnulls(prequalification_event_id, sales_case_id, lead_id) = 1);

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_status" CHECK (status = ANY (ARRAY['completed'::text, 'submitted'::text, 'superseded'::text, 'cancelled'::text]));

ALTER TABLE "public"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_body_length" CHECK (char_length(body) >= 10 AND char_length(body) <= 1500);

ALTER TABLE "public"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_step" CHECK (step_number >= 1 AND step_number <= 4);

ALTER TABLE "public"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_step_number_key" UNIQUE (step_number);

ALTER TABLE "public"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_title_length" CHECK (char_length(title) >= 2 AND char_length(title) <= 120);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_contact_reason_length" CHECK (char_length(do_not_contact_reason) <= 1000);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_cuil_length" CHECK (cuil IS NULL OR char_length(cuil) = 11);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_identity_length" CHECK (document_number IS NULL OR char_length(document_number) >= 7 AND char_length(document_number) <= 12);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_name_length" CHECK (full_name IS NULL OR char_length(full_name) >= 1 AND char_length(full_name) <= 160);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_normalized_phone_key" UNIQUE (normalized_phone);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_phone_length" CHECK (char_length(normalized_phone) >= 6 AND char_length(normalized_phone) <= 30);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_detail_length" CHECK (char_length(detail) <= 5000);

ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_title_length" CHECK (char_length(title) >= 2 AND char_length(title) <= 160);

ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_type" CHECK (activity_type = ANY (ARRAY['status_change'::text, 'comment'::text, 'contact'::text, 'follow_up'::text, 'interview'::text, 'sale_request'::text, 'sale_confirmation'::text, 'assignment'::text, 'manual_creation'::text, 'vehicle_appraisal_requested'::text, 'vehicle_appraisal_confirmed'::text, 'vehicle_market_reference_checked'::text]));

ALTER TABLE "public"."lead_contact_sequences" ADD CONSTRAINT "lead_contact_sequences_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_contact_sequences" ADD CONSTRAINT "lead_contact_sequences_reason_length" CHECK (char_length(stopped_reason) <= 1000);

ALTER TABLE "public"."lead_contact_sequences" ADD CONSTRAINT "lead_contact_sequences_status" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text, 'paused'::text]));

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_call" CHECK (channel = 'call'::text AND call_attempt >= 1 AND call_attempt <= 18 AND message_step IS NULL OR channel = 'whatsapp'::text AND message_step >= 1 AND message_step <= 4 AND call_attempt IS NULL);

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_channel" CHECK (channel = ANY (ARRAY['call'::text, 'whatsapp'::text]));

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_note_length" CHECK (char_length(note) <= 3000);

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_order" UNIQUE (sequence_id, sequence_order);

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_protocol_metadata" CHECK (protocol_day IS NULL AND protocol_band IS NULL AND band_attempt IS NULL OR protocol_day >= 1 AND protocol_day <= 4 AND (protocol_band = ANY (ARRAY['10-12'::text, '14-16'::text, '17-19'::text])) AND (channel = 'call'::text AND band_attempt >= 1 AND band_attempt <= 2 OR channel = 'whatsapp'::text AND band_attempt IS NULL));

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_status" CHECK (status = ANY (ARRAY['scheduled'::text, 'pending'::text, 'completed'::text, 'skipped'::text, 'cancelled'::text]));

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_window" CHECK (due_end > due_start);

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_confirmed_sale_status" CHECK (status <> 'venta'::text OR sale_confirmation_status = 'confirmed'::text);

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_deposit_nonnegative" CHECK (deposit_amount IS NULL OR deposit_amount >= 0::numeric);

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_desist_reason" CHECK (desist_reason IS NULL OR (desist_reason = ANY (ARRAY['no_interest'::text, 'conditions_not_viable'::text, 'chose_other_option'::text, 'postponed_without_date'::text, 'requested_no_contact'::text, 'other'::text])));

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_interview_mode" CHECK (interview_mode IS NULL OR (interview_mode = ANY (ARRAY['presencial'::text, 'videollamada'::text])));

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_interview_operational_status" CHECK (interview_operational_status IS NULL OR (interview_operational_status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'rescheduled'::text, 'no_show'::text, 'completed'::text])));

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_next_contact_source_check" CHECK (next_contact_source IS NULL OR next_contact_source = 'manual'::text);

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_pkey" PRIMARY KEY (lead_id);

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_post_deposit_action_status" CHECK (post_deposit_action_status IS NULL OR (post_deposit_action_status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'rescheduled'::text, 'completed'::text])));

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_priority" CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]));

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_sale_confirmation" CHECK (sale_confirmation_status = ANY (ARRAY['none'::text, 'pending'::text, 'confirmed'::text, 'rejected'::text]));

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_sale_nonnegative" CHECK (sale_amount IS NULL OR sale_amount >= 0::numeric);

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_status" CHECK (status = ANY (ARRAY['nuevo'::text, 'no_contesta'::text, 'contacto_futuro'::text, 'en_proceso'::text, 'invalido'::text, 'entrevista'::text, 'cierre'::text, 'sena'::text, 'venta'::text, 'desistir'::text]));

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_text_lengths" CHECK (char_length(status_reason) <= 2000 AND char_length(next_contact_note) <= 1000 AND char_length(last_contact_outcome) <= 500 AND char_length(interview_location) <= 300 AND char_length(vehicle_sold) <= 160);

ALTER TABLE "public"."lead_import_batches" ADD CONSTRAINT "lead_import_batches_base_type" CHECK (base_type = ANY (ARRAY['new'::text, 'recall'::text]));

ALTER TABLE "public"."lead_import_batches" ADD CONSTRAINT "lead_import_batches_counts" CHECK (row_count >= 0 AND created_count >= 0 AND merged_count >= 0 AND rejected_count >= 0);

ALTER TABLE "public"."lead_import_batches" ADD CONSTRAINT "lead_import_batches_file_name_length" CHECK (char_length(file_name) >= 1 AND char_length(file_name) <= 255);

ALTER TABLE "public"."lead_import_batches" ADD CONSTRAINT "lead_import_batches_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_management_playbook_events" ADD CONSTRAINT "lead_management_playbook_event_item_key" CHECK (item_key = ANY (ARRAY['initial_message'::text, 'confirm_model_version'::text, 'detect_primary_need'::text, 'send_quote'::text, 'send_vehicle_photos'::text, 'send_technical_material'::text, 'purchase_modality'::text, 'initial_capacity'::text, 'trade_in'::text, 'purchase_urgency'::text, 'main_objection'::text, 'schedule_next_contact'::text, 'attempt_next_stage'::text]));

ALTER TABLE "public"."lead_management_playbook_events" ADD CONSTRAINT "lead_management_playbook_event_type" CHECK (event_type = ANY (ARRAY['completed'::text, 'reopened'::text]));

ALTER TABLE "public"."lead_management_playbook_events" ADD CONSTRAINT "lead_management_playbook_events_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_management_playbook_items" ADD CONSTRAINT "lead_management_playbook_completion" CHECK (completed AND completed_at IS NOT NULL AND completed_by IS NOT NULL OR NOT completed AND completed_at IS NULL AND completed_by IS NULL);

ALTER TABLE "public"."lead_management_playbook_items" ADD CONSTRAINT "lead_management_playbook_item_key" CHECK (item_key = ANY (ARRAY['initial_message'::text, 'confirm_model_version'::text, 'detect_primary_need'::text, 'send_quote'::text, 'send_vehicle_photos'::text, 'send_technical_material'::text, 'purchase_modality'::text, 'initial_capacity'::text, 'trade_in'::text, 'purchase_urgency'::text, 'main_objection'::text, 'schedule_next_contact'::text, 'attempt_next_stage'::text]));

ALTER TABLE "public"."lead_management_playbook_items" ADD CONSTRAINT "lead_management_playbook_items_pkey" PRIMARY KEY (lead_id, item_key);

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_assignment" CHECK (assigned_seller_user_id IS NULL AND assigned_at IS NULL OR assigned_seller_user_id IS NOT NULL AND assigned_at IS NOT NULL);

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_attempts" CHECK (attempt_count >= 0 AND attempt_count <= 2);

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_name_length" CHECK (char_length(customer_name) >= 2 AND char_length(customer_name) <= 120);

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_panel_position" CHECK (recall_panel_id IS NULL AND panel_position IS NULL OR recall_panel_id IS NOT NULL AND panel_position > 0);

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_phone_length" CHECK (char_length(customer_phone) >= 6 AND char_length(customer_phone) <= 30);

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_status" CHECK (status = ANY (ARRAY['available'::text, 'assigned'::text, 'working'::text, 'converted'::text, 'exhausted'::text, 'cancelled'::text]));

ALTER TABLE "public"."lead_recall_panels" ADD CONSTRAINT "lead_recall_panels_closed_at" CHECK (status = 'open'::text AND closed_at IS NULL OR status = 'closed'::text AND closed_at IS NOT NULL);

ALTER TABLE "public"."lead_recall_panels" ADD CONSTRAINT "lead_recall_panels_panel_number_key" UNIQUE (panel_number);

ALTER TABLE "public"."lead_recall_panels" ADD CONSTRAINT "lead_recall_panels_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_recall_panels" ADD CONSTRAINT "lead_recall_panels_progress" CHECK (total_items >= 0 AND completed_items >= 0 AND completed_items <= total_items);

ALTER TABLE "public"."lead_recall_panels" ADD CONSTRAINT "lead_recall_panels_status" CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_amount_nonnegative" CHECK (sale_amount IS NULL OR sale_amount >= 0::numeric);

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_notes_length" CHECK (char_length(notes) <= 3000 AND char_length(review_note) <= 3000);

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_status" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text]));

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_vehicle_length" CHECK (char_length(vehicle) >= 2 AND char_length(vehicle) <= 160);

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_assignment_complete" CHECK (assigned_seller_user_id IS NULL AND assigned_at IS NULL OR assigned_seller_user_id IS NOT NULL AND assigned_at IS NOT NULL);

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_customer_name_length" CHECK (customer_name IS NULL OR char_length(customer_name) >= 1 AND char_length(customer_name) <= 120);

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_customer_phone_length" CHECK (char_length(customer_phone) >= 6 AND char_length(customer_phone) <= 30);

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_priority" CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]));

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_qualification_status" CHECK (qualification_status = ANY (ARRAY['qualified'::text, 'follow_up'::text, 'unqualified'::text]));

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_routing_status" CHECK (routing_status = ANY (ARRAY['pending_supervisor'::text, 'assigned_direct'::text, 'assigned_manual'::text, 'closed'::text, 'lost'::text]));

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_source_channel" CHECK (source_channel = ANY (ARRAY['whatsapp'::text, 'tiktok'::text, 'web'::text, 'manual'::text]));

ALTER TABLE "public"."model_versions" ADD CONSTRAINT "model_versions_model_id_name_key" UNIQUE (model_id, name);

ALTER TABLE "public"."model_versions" ADD CONSTRAINT "model_versions_name_length" CHECK (char_length(TRIM(BOTH FROM name)) >= 2 AND char_length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE "public"."model_versions" ADD CONSTRAINT "model_versions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."model_versions" ADD CONSTRAINT "model_versions_suggested_price_check" CHECK (suggested_price IS NULL OR suggested_price >= 0::numeric);

ALTER TABLE "public"."models" ADD CONSTRAINT "models_brand_id_name_key" UNIQUE (brand_id, name);

ALTER TABLE "public"."models" ADD CONSTRAINT "models_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_cuil_last4" CHECK (cuil_last4 ~ '^\d{4}$'::text);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_customer_document" CHECK (customer_document IS NULL OR customer_document ~ '^\d{7,9}$'::text);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_customer_name" CHECK (customer_name IS NULL OR char_length(customer_name) >= 2 AND char_length(customer_name) <= 120);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_customer_phone" CHECK (customer_phone IS NULL OR char_length(customer_phone) >= 6 AND char_length(customer_phone) <= 30);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_events_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_events_request_code_key" UNIQUE (request_code);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_export_data_complete" CHECK (customer_name IS NULL AND customer_phone IS NULL AND customer_document IS NULL AND model_name IS NULL AND seller_name IS NULL OR customer_name IS NOT NULL AND customer_phone IS NOT NULL AND customer_document IS NOT NULL AND model_name IS NOT NULL AND seller_name IS NOT NULL);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_initials_length" CHECK (char_length(customer_initials) >= 2 AND char_length(customer_initials) <= 12);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_model_name" CHECK (model_name IS NULL OR char_length(model_name) >= 1 AND char_length(model_name) <= 80);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_seller_name" CHECK (seller_name IS NULL OR char_length(seller_name) >= 2 AND char_length(seller_name) <= 120);

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_timer_range" CHECK (timer_hours >= 1 AND timer_hours <= 720);

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_contact_email_format" CHECK (contact_email IS NULL OR contact_email = lower(TRIM(BOTH FROM contact_email)) AND char_length(contact_email) <= 254 AND contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text);

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_phone_length" CHECK (phone IS NULL OR char_length(phone) >= 6 AND char_length(phone) <= 30);

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (user_id);

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_seller_code_format" CHECK (seller_code ~ '^[A-Z0-9_-]{3,20}$'::text);

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_tiktok_code_format" CHECK (role <> 'seller'::app_role AND tiktok_code IS NULL OR role = 'seller'::app_role AND char_length(tiktok_code) >= 3 AND char_length(tiktok_code) <= 20 AND tiktok_code ~ '^[A-Z]{2,}[A-Z0-9_-]*[0-9][A-Z0-9_-]*$'::text);

ALTER TABLE "public"."sales_case_events" ADD CONSTRAINT "sales_case_events_comment" CHECK (char_length(comment) <= 5000);

ALTER TABLE "public"."sales_case_events" ADD CONSTRAINT "sales_case_events_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."sales_case_events" ADD CONSTRAINT "sales_case_events_type" CHECK (event_type = ANY (ARRAY['case_created'::text, 'minute_submitted'::text, 'minute_corrected'::text, 'stage_review'::text, 'sale_finalized'::text, 'sale_cancelled'::text, 'client_grouped'::text, 'installment_update'::text, 'document_added'::text, 'admin_call_requested'::text]));

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_cancellation_reason" CHECK (char_length(cancellation_reason) <= 5000);

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_case_code_key" UNIQUE (case_code);

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_cdn_status" CHECK (cdn_scoring_status = ANY (ARRAY['pending'::text, 'approved'::text, 'observed'::text, 'baja'::text]));

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_contract_status" CHECK (contract_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'baja'::text]));

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_dealer_status" CHECK (dealer_scoring_status = ANY (ARRAY['pending'::text, 'approved'::text, 'observed'::text, 'baja'::text]));

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_lead_id_key" UNIQUE (lead_id);

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_sale_amount" CHECK (sale_amount IS NULL OR sale_amount >= 0::numeric);

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_sale_request_id_key" UNIQUE (sale_request_id);

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_status" CHECK (status = ANY (ARRAY['minute_pending'::text, 'quality_control'::text, 'dealer_scoring'::text, 'contract_signature'::text, 'formation_group'::text, 'grouped'::text, 'finalized'::text, 'cancelled'::text]));

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_vehicle" CHECK (char_length(TRIM(BOTH FROM vehicle)) >= 2 AND char_length(TRIM(BOTH FROM vehicle)) <= 160);

ALTER TABLE "public"."sales_notifications" ADD CONSTRAINT "sales_notifications_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."sales_notifications" ADD CONSTRAINT "sales_notifications_text" CHECK (char_length(title) >= 2 AND char_length(title) <= 160 AND char_length(body) <= 5000);

ALTER TABLE "public"."sales_notifications" ADD CONSTRAINT "sales_notifications_type" CHECK (notification_type = ANY (ARRAY['sale_confirmed'::text, 'observed'::text, 'cancelled'::text, 'finalized'::text, 'status_update'::text, 'admin_call_requested'::text]));

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_breakage_base_amount_check" CHECK (breakage_base_amount >= 0::numeric);

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_breakage_vat_amount_check" CHECK (breakage_vat_amount >= 0::numeric);

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_code_format" CHECK (quote_code ~ '^GS-PRES-[A-Z0-9-]{6,40}$'::text);

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_names" CHECK (char_length(TRIM(BOTH FROM customer_name)) >= 2 AND char_length(TRIM(BOTH FROM customer_name)) <= 120 AND char_length(vehicle_version) <= 120);

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_offer_type" CHECK (offer_type = ANY (ARRAY['savings_plan'::text, 'bank_credit'::text]));

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_quote_code_key" UNIQUE (quote_code);

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_source" CHECK (offer_type = 'savings_plan'::text AND campaign_id IS NOT NULL AND bank_credit_offer_id IS NULL OR offer_type = 'bank_credit'::text AND bank_credit_offer_id IS NOT NULL AND campaign_id IS NULL);

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_status" CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'expired'::text, 'converted'::text, 'cancelled'::text]));

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_values" CHECK (sale_price >= 0::numeric AND financed_amount >= 0::numeric AND financed_amount <= sale_price AND advance_amount >= 0::numeric AND breakage_amount >= 0::numeric AND patenting_amount >= 0::numeric AND expenses_amount >= 0::numeric AND final_advance_amount >= 0::numeric AND (installment_amount IS NULL OR installment_amount >= 0::numeric) AND (term_months IS NULL OR term_months >= 1 AND term_months <= 240));

ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_contact_email_format" CHECK (contact_email IS NULL OR contact_email = lower(TRIM(BOTH FROM contact_email)) AND char_length(contact_email) <= 254 AND contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text);

ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_email_normalized" CHECK (email = lower(TRIM(BOTH FROM email)));

ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_phone_length" CHECK (phone IS NULL OR char_length(phone) >= 6 AND char_length(phone) <= 30);

ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_seller_code_format" CHECK (seller_code ~ '^[A-Z0-9_-]{3,20}$'::text);

ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_tiktok_code_format" CHECK (role <> 'seller'::app_role AND tiktok_code IS NULL OR role = 'seller'::app_role AND char_length(tiktok_code) >= 3 AND char_length(tiktok_code) <= 20 AND tiktok_code ~ '^[A-Z]{2,}[A-Z0-9_-]*[0-9][A-Z0-9_-]*$'::text);

ALTER TABLE "public"."bank_credit_offer_versions" ADD CONSTRAINT "bank_credit_offer_versions_offer_id_fkey" FOREIGN KEY (offer_id) REFERENCES bank_credit_offers(id) ON DELETE CASCADE;

ALTER TABLE "public"."bank_credit_offer_versions" ADD CONSTRAINT "bank_credit_offer_versions_version_id_fkey" FOREIGN KEY (version_id) REFERENCES model_versions(id) ON DELETE CASCADE;

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offers_model_id_fkey" FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE;

ALTER TABLE "public"."bank_credit_offers" ADD CONSTRAINT "bank_credit_offers_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_audit_log" ADD CONSTRAINT "campaign_audit_log_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_audit_log" ADD CONSTRAINT "campaign_audit_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_model_id_fkey" FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE;

ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT;

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT;

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_prequalification_event_id_fkey" FOREIGN KEY (prequalification_event_id) REFERENCES prequalification_events(id) ON DELETE CASCADE;

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_sales_case_id_fkey" FOREIGN KEY (sales_case_id) REFERENCES sales_cases(id) ON DELETE RESTRICT;

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."commercial_applications" ADD CONSTRAINT "commercial_applications_supersedes_application_id_fkey" FOREIGN KEY (supersedes_application_id) REFERENCES commercial_applications(id) ON DELETE SET NULL;

ALTER TABLE "public"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_contact_sequences" ADD CONSTRAINT "lead_contact_sequences_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_contact_sequences" ADD CONSTRAINT "lead_contact_sequences_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_sequence_id_fkey" FOREIGN KEY (sequence_id) REFERENCES lead_contact_sequences(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_contact_tasks" ADD CONSTRAINT "lead_contact_tasks_template_id_fkey" FOREIGN KEY (template_id) REFERENCES contact_message_templates(id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_sale_confirmed_by_fkey" FOREIGN KEY (sale_confirmed_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_sale_requested_by_fkey" FOREIGN KEY (sale_requested_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_crm" ADD CONSTRAINT "lead_crm_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_import_batches" ADD CONSTRAINT "lead_import_batches_imported_by_fkey" FOREIGN KEY (imported_by) REFERENCES profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."lead_management_playbook_events" ADD CONSTRAINT "lead_management_playbook_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."lead_management_playbook_events" ADD CONSTRAINT "lead_management_playbook_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_management_playbook_items" ADD CONSTRAINT "lead_management_playbook_items_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_management_playbook_items" ADD CONSTRAINT "lead_management_playbook_items_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_management_playbook_items" ADD CONSTRAINT "lead_management_playbook_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_assigned_by_user_id_fkey" FOREIGN KEY (assigned_by_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_assigned_seller_user_id_fkey" FOREIGN KEY (assigned_seller_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_import_batch_id_fkey" FOREIGN KEY (import_batch_id) REFERENCES lead_import_batches(id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_recall_items" ADD CONSTRAINT "lead_recall_items_recall_panel_id_fkey" FOREIGN KEY (recall_panel_id) REFERENCES lead_recall_panels(id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_recall_panels" ADD CONSTRAINT "lead_recall_panels_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_recall_panels" ADD CONSTRAINT "lead_recall_panels_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_provisional_application_id_fkey" FOREIGN KEY (provisional_application_id) REFERENCES commercial_applications(id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES sales_quotes(id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."lead_sale_requests" ADD CONSTRAINT "lead_sale_requests_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_assigned_by_user_id_fkey" FOREIGN KEY (assigned_by_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_assigned_seller_user_id_fkey" FOREIGN KEY (assigned_seller_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;

ALTER TABLE "public"."model_versions" ADD CONSTRAINT "model_versions_model_id_fkey" FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE;

ALTER TABLE "public"."models" ADD CONSTRAINT "models_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_events_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_events_model_id_fkey" FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE RESTRICT;

ALTER TABLE "public"."prequalification_events" ADD CONSTRAINT "prequalification_events_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."sales_case_events" ADD CONSTRAINT "sales_case_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE "public"."sales_case_events" ADD CONSTRAINT "sales_case_events_sales_case_id_fkey" FOREIGN KEY (sales_case_id) REFERENCES sales_cases(id) ON DELETE CASCADE;

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_admin_call_requested_by_fkey" FOREIGN KEY (admin_call_requested_by) REFERENCES profiles(user_id);

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT;

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES sales_quotes(id) ON DELETE SET NULL;

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_sale_request_id_fkey" FOREIGN KEY (sale_request_id) REFERENCES lead_sale_requests(id) ON DELETE RESTRICT;

ALTER TABLE "public"."sales_cases" ADD CONSTRAINT "sales_cases_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."sales_notifications" ADD CONSTRAINT "sales_notifications_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."sales_notifications" ADD CONSTRAINT "sales_notifications_sales_case_id_fkey" FOREIGN KEY (sales_case_id) REFERENCES sales_cases(id) ON DELETE CASCADE;

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_bank_credit_offer_id_fkey" FOREIGN KEY (bank_credit_offer_id) REFERENCES bank_credit_offers(id) ON DELETE SET NULL;

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT;

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_model_id_fkey" FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE RESTRICT;

ALTER TABLE "public"."sales_quotes" ADD CONSTRAINT "sales_quotes_seller_user_id_fkey" FOREIGN KEY (seller_user_id) REFERENCES profiles(user_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);

CREATE INDEX idx_users_email ON auth.users USING btree (email);

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);

CREATE INDEX bank_credit_offer_versions_version_idx ON public.bank_credit_offer_versions USING btree (version_id, offer_id);

CREATE INDEX bank_credit_offers_model_active_idx ON public.bank_credit_offers USING btree (model_id, active, sort_order);

CREATE INDEX bank_credit_offers_updated_by_idx ON public.bank_credit_offers USING btree (updated_by);

CREATE INDEX bank_credit_offers_validity_idx ON public.bank_credit_offers USING btree (active, valid_from, valid_to);

CREATE INDEX brands_active_sort_idx ON public.brands USING btree (active, sort_order);

CREATE INDEX campaign_audit_log_actor_time_idx ON public.campaign_audit_log USING btree (changed_by, changed_at DESC);

CREATE INDEX campaign_audit_log_campaign_time_idx ON public.campaign_audit_log USING btree (campaign_id, changed_at DESC);

CREATE INDEX campaigns_active_dates_idx ON public.campaigns USING btree (active, valid_from, valid_to);

CREATE INDEX campaigns_model_sort_idx ON public.campaigns USING btree (model_id, sort_order, active);

CREATE INDEX campaigns_updated_by_idx ON public.campaigns USING btree (updated_by);

CREATE INDEX commercial_applications_campaign_idx ON public.commercial_applications USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);

CREATE UNIQUE INDEX commercial_applications_case_revision_idx ON public.commercial_applications USING btree (sales_case_id, revision_number) WHERE (sales_case_id IS NOT NULL);

CREATE INDEX commercial_applications_lead_time_idx ON public.commercial_applications USING btree (lead_id, created_at DESC) WHERE (lead_id IS NOT NULL);

CREATE INDEX commercial_applications_prequalification_idx ON public.commercial_applications USING btree (prequalification_event_id);

CREATE INDEX commercial_applications_sales_case_time_idx ON public.commercial_applications USING btree (sales_case_id, created_at DESC) WHERE (sales_case_id IS NOT NULL);

CREATE INDEX commercial_applications_seller_time_idx ON public.commercial_applications USING btree (seller_user_id, created_at DESC);

CREATE INDEX commercial_applications_supersedes_idx ON public.commercial_applications USING btree (supersedes_application_id);

CREATE INDEX contact_message_templates_updated_by_idx ON public.contact_message_templates USING btree (updated_by);

CREATE UNIQUE INDEX customers_cuil_unique_idx ON public.customers USING btree (cuil) WHERE (cuil IS NOT NULL);

CREATE UNIQUE INDEX customers_document_unique_idx ON public.customers USING btree (document_number) WHERE (document_number IS NOT NULL);

CREATE INDEX customers_marketing_idx ON public.customers USING btree (marketing_opt_in, do_not_contact, updated_at DESC);

CREATE INDEX customers_name_idx ON public.customers USING btree (lower(full_name)) WHERE (full_name IS NOT NULL);

CREATE INDEX lead_activities_actor_time_idx ON public.lead_activities USING btree (actor_user_id, created_at DESC);

CREATE INDEX lead_activities_lead_time_idx ON public.lead_activities USING btree (lead_id, created_at DESC);

CREATE UNIQUE INDEX lead_contact_sequences_one_active_idx ON public.lead_contact_sequences USING btree (lead_id) WHERE (status = 'active'::text);

CREATE INDEX lead_contact_sequences_seller_idx ON public.lead_contact_sequences USING btree (seller_user_id, status, started_at DESC);

CREATE INDEX lead_contact_tasks_agenda_idx ON public.lead_contact_tasks USING btree (seller_user_id, status, due_start) WHERE (status = 'pending'::text);

CREATE INDEX lead_contact_tasks_completed_by_idx ON public.lead_contact_tasks USING btree (completed_by);

CREATE INDEX lead_contact_tasks_lead_idx ON public.lead_contact_tasks USING btree (lead_id, created_at DESC);

CREATE UNIQUE INDEX lead_contact_tasks_one_pending_per_lead_idx ON public.lead_contact_tasks USING btree (lead_id) WHERE (status = 'pending'::text);

CREATE INDEX lead_contact_tasks_template_idx ON public.lead_contact_tasks USING btree (template_id);

CREATE INDEX lead_crm_agenda_idx ON public.lead_crm USING btree (next_contact_at) WHERE ((next_contact_at IS NOT NULL) AND (status <> ALL (ARRAY['venta'::text, 'desistir'::text, 'invalido'::text])));

CREATE INDEX lead_crm_sale_confirmed_by_idx ON public.lead_crm USING btree (sale_confirmed_by);

CREATE INDEX lead_crm_sale_pending_idx ON public.lead_crm USING btree (sale_confirmation_status, sale_requested_at DESC) WHERE (sale_confirmation_status = 'pending'::text);

CREATE INDEX lead_crm_sale_requested_by_idx ON public.lead_crm USING btree (sale_requested_by);

CREATE INDEX lead_crm_status_updated_idx ON public.lead_crm USING btree (status, updated_at DESC);

CREATE INDEX lead_crm_updated_by_idx ON public.lead_crm USING btree (updated_by);

CREATE INDEX lead_import_batches_imported_by_idx ON public.lead_import_batches USING btree (imported_by);

CREATE INDEX lead_management_playbook_events_lead_time_idx ON public.lead_management_playbook_events USING btree (lead_id, created_at DESC);

CREATE INDEX lead_management_playbook_items_updated_idx ON public.lead_management_playbook_items USING btree (lead_id, updated_at DESC);

CREATE INDEX lead_recall_items_assigned_by_idx ON public.lead_recall_items USING btree (assigned_by_user_id) WHERE (assigned_by_user_id IS NOT NULL);

CREATE INDEX lead_recall_items_import_batch_idx ON public.lead_recall_items USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);

CREATE UNIQUE INDEX lead_recall_items_one_open_idx ON public.lead_recall_items USING btree (lead_id) WHERE (status = ANY (ARRAY['available'::text, 'assigned'::text, 'working'::text]));

CREATE UNIQUE INDEX lead_recall_items_panel_position_idx ON public.lead_recall_items USING btree (recall_panel_id, panel_position) WHERE (recall_panel_id IS NOT NULL);

CREATE INDEX lead_recall_items_seller_idx ON public.lead_recall_items USING btree (assigned_seller_user_id, status, available_at, original_inquiry_at DESC);

CREATE INDEX lead_recall_items_supervisor_idx ON public.lead_recall_items USING btree (status, original_inquiry_at DESC, model_interest);

CREATE INDEX lead_recall_panels_created_by_idx ON public.lead_recall_panels USING btree (created_by_user_id) WHERE (created_by_user_id IS NOT NULL);

CREATE INDEX lead_recall_panels_seller_status_idx ON public.lead_recall_panels USING btree (seller_user_id, status, created_at DESC);

CREATE UNIQUE INDEX lead_sale_requests_one_pending_idx ON public.lead_sale_requests USING btree (lead_id) WHERE (status = 'pending'::text);

CREATE UNIQUE INDEX lead_sale_requests_provisional_application_idx ON public.lead_sale_requests USING btree (provisional_application_id) WHERE (provisional_application_id IS NOT NULL);

CREATE INDEX lead_sale_requests_quote_idx ON public.lead_sale_requests USING btree (quote_id);

CREATE INDEX lead_sale_requests_reviewed_by_idx ON public.lead_sale_requests USING btree (reviewed_by);

CREATE INDEX lead_sale_requests_seller_time_idx ON public.lead_sale_requests USING btree (seller_user_id, requested_at DESC);

CREATE INDEX lead_sale_requests_status_time_idx ON public.lead_sale_requests USING btree (status, requested_at DESC);

CREATE INDEX leads_assigned_by_idx ON public.leads USING btree (assigned_by_user_id);

CREATE INDEX leads_consent_segment_idx ON public.leads USING btree (marketing_opt_in, do_not_contact, created_at DESC);

CREATE INDEX leads_customer_time_idx ON public.leads USING btree (customer_id, created_at DESC);

CREATE INDEX leads_pending_time_idx ON public.leads USING btree (routing_status, created_at DESC);

CREATE INDEX leads_phone_time_idx ON public.leads USING btree (customer_phone, last_message_at DESC);

CREATE INDEX leads_seller_time_idx ON public.leads USING btree (assigned_seller_user_id, assigned_at DESC);

CREATE INDEX leads_source_time_idx ON public.leads USING btree (source_channel, created_at DESC);

CREATE INDEX model_versions_model_active_idx ON public.model_versions USING btree (model_id, active, sort_order);

CREATE INDEX models_brand_active_sort_idx ON public.models USING btree (brand_id, active, sort_order);

CREATE INDEX prequalification_events_campaign_idx ON public.prequalification_events USING btree (campaign_id);

CREATE INDEX prequalification_events_model_time_idx ON public.prequalification_events USING btree (model_id, created_at DESC);

CREATE INDEX prequalification_events_seller_time_idx ON public.prequalification_events USING btree (seller_user_id, created_at DESC);

CREATE INDEX profiles_active_role_idx ON public.profiles USING btree (role, active);

CREATE UNIQUE INDEX profiles_contact_email_unique ON public.profiles USING btree (lower(contact_email)) WHERE (contact_email IS NOT NULL);

CREATE UNIQUE INDEX profiles_email_unique ON public.profiles USING btree (lower(email));

CREATE UNIQUE INDEX profiles_seller_code_unique ON public.profiles USING btree (upper(seller_code));

CREATE UNIQUE INDEX profiles_tiktok_code_unique_idx ON public.profiles USING btree (tiktok_code) WHERE (tiktok_code IS NOT NULL);

CREATE INDEX sales_case_events_actor_time_idx ON public.sales_case_events USING btree (actor_user_id, created_at DESC);

CREATE INDEX sales_case_events_case_time_idx ON public.sales_case_events USING btree (sales_case_id, created_at DESC);

CREATE INDEX sales_cases_admin_call_requested_by_idx ON public.sales_cases USING btree (admin_call_requested_by) WHERE (admin_call_requested_by IS NOT NULL);

CREATE INDEX sales_cases_admin_call_requested_idx ON public.sales_cases USING btree (admin_call_requested_at DESC) WHERE (admin_call_requested_at IS NOT NULL);

CREATE INDEX sales_cases_admin_queue_idx ON public.sales_cases USING btree (cdn_scoring_status, dealer_scoring_status, contract_status, updated_at DESC);

CREATE INDEX sales_cases_quote_idx ON public.sales_cases USING btree (quote_id);

CREATE INDEX sales_cases_seller_time_idx ON public.sales_cases USING btree (seller_user_id, created_at DESC);

CREATE INDEX sales_cases_status_time_idx ON public.sales_cases USING btree (status, updated_at DESC);

CREATE INDEX sales_notifications_case_idx ON public.sales_notifications USING btree (sales_case_id);

CREATE INDEX sales_notifications_recipient_idx ON public.sales_notifications USING btree (recipient_user_id, read_at, created_at DESC);

CREATE INDEX sales_quotes_bank_credit_offer_idx ON public.sales_quotes USING btree (bank_credit_offer_id);

CREATE INDEX sales_quotes_campaign_idx ON public.sales_quotes USING btree (campaign_id);

CREATE INDEX sales_quotes_lead_time_idx ON public.sales_quotes USING btree (lead_id, issued_at DESC);

CREATE INDEX sales_quotes_model_idx ON public.sales_quotes USING btree (model_id);

CREATE INDEX sales_quotes_seller_time_idx ON public.sales_quotes USING btree (seller_user_id, issued_at DESC);

CREATE INDEX sales_quotes_status_time_idx ON public.sales_quotes USING btree (status, issued_at DESC);

CREATE UNIQUE INDEX user_invites_active_tiktok_code_unique_idx ON public.user_invites USING btree (tiktok_code) WHERE ((tiktok_code IS NOT NULL) AND (active = true) AND (accepted_at IS NULL));

CREATE UNIQUE INDEX user_invites_contact_email_unique ON public.user_invites USING btree (lower(contact_email)) WHERE ((contact_email IS NOT NULL) AND (accepted_at IS NULL) AND (active = true));

CREATE UNIQUE INDEX user_invites_email_unique ON public.user_invites USING btree (lower(email));

CREATE UNIQUE INDEX user_invites_seller_code_unique ON public.user_invites USING btree (upper(seller_code));

CREATE TRIGGER after_auth_user_created_grupo_sur AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.create_profile_for_invited_user();

CREATE TRIGGER before_auth_user_created_grupo_sur BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.authorize_invited_user();

CREATE TRIGGER bank_credit_offers_set_updated_at BEFORE UPDATE ON bank_credit_offers FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER campaigns_audit_change AFTER INSERT OR DELETE OR UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION private.audit_campaign_change();

CREATE TRIGGER campaigns_set_metadata BEFORE INSERT OR UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION private.set_campaign_metadata();

CREATE TRIGGER commercial_applications_enforce_plan_minute BEFORE INSERT OR UPDATE OF brand_name, installments_paid, installments_to_pay ON commercial_applications FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_minute_identity();

CREATE TRIGGER commercial_applications_sales_case_submission AFTER INSERT OR UPDATE OF confirmed_at ON commercial_applications FOR EACH ROW EXECUTE FUNCTION private.after_sales_minute_insert();

CREATE TRIGGER commercial_applications_set_updated_at BEFORE UPDATE ON commercial_applications FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER contact_message_templates_set_updated_at BEFORE UPDATE ON contact_message_templates FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER lead_activities_block_seller_after_sale BEFORE INSERT OR UPDATE ON lead_activities FOR EACH ROW EXECUTE FUNCTION private.prevent_seller_lead_access_after_sale();

CREATE TRIGGER lead_contact_sequences_classify_exhausted AFTER UPDATE OF status ON lead_contact_sequences FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status AND new.status = 'completed'::text) EXECUTE FUNCTION private.classify_completed_contact_protocol();

CREATE TRIGGER lead_contact_sequences_set_updated_at BEFORE UPDATE ON lead_contact_sequences FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER lead_contact_tasks_set_updated_at BEFORE UPDATE ON lead_contact_tasks FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER lead_crm_block_seller_after_sale BEFORE INSERT OR UPDATE ON lead_crm FOR EACH ROW EXECUTE FUNCTION private.prevent_seller_lead_access_after_sale();

CREATE TRIGGER lead_crm_close_pending_sale_on_desistir AFTER UPDATE OF status ON lead_crm FOR EACH ROW EXECUTE FUNCTION private.close_pending_sale_on_desistir();

CREATE TRIGGER lead_crm_en_gestion_next_contact BEFORE INSERT OR UPDATE OF status, next_contact_at ON lead_crm FOR EACH ROW EXECUTE FUNCTION private.enforce_en_gestion_next_contact();

CREATE TRIGGER lead_crm_guard_canonical_cold_base BEFORE UPDATE OF cold_base_at ON lead_crm FOR EACH ROW EXECUTE FUNCTION private.guard_canonical_cold_base_marker();

CREATE TRIGGER lead_crm_manual_agenda_on_insert BEFORE INSERT ON lead_crm FOR EACH ROW EXECUTE FUNCTION private.keep_protocol_deadlines_out_of_manual_agenda();

CREATE TRIGGER lead_crm_manual_agenda_on_update BEFORE UPDATE OF next_contact_at, next_contact_note ON lead_crm FOR EACH ROW EXECUTE FUNCTION private.keep_protocol_deadlines_out_of_manual_agenda();

CREATE TRIGGER lead_crm_queue_cold_recall AFTER UPDATE OF status ON lead_crm FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION private.queue_cold_lead_for_recall();

CREATE TRIGGER lead_crm_sync_contact_sequence AFTER UPDATE OF status ON lead_crm FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION private.sync_contact_sequence_with_status();

CREATE TRIGGER lead_management_playbook_audit AFTER INSERT OR UPDATE ON lead_management_playbook_items FOR EACH ROW EXECUTE FUNCTION private.audit_management_playbook_item();

CREATE TRIGGER lead_management_playbook_prepare BEFORE INSERT OR UPDATE ON lead_management_playbook_items FOR EACH ROW EXECUTE FUNCTION private.prepare_management_playbook_item();

CREATE TRIGGER lead_recall_items_refresh_panel AFTER INSERT OR DELETE OR UPDATE OF status, recall_panel_id ON lead_recall_items FOR EACH ROW EXECUTE FUNCTION private.refresh_recall_panel_from_item();

CREATE TRIGGER lead_recall_items_set_updated_at BEFORE UPDATE ON lead_recall_items FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER lead_sale_requests_create_sales_case AFTER UPDATE OF status ON lead_sale_requests FOR EACH ROW EXECUTE FUNCTION private.create_sales_case_after_confirmation();

CREATE TRIGGER lead_sale_requests_normalize_plan BEFORE INSERT OR UPDATE OF quote_id, vehicle, sale_amount ON lead_sale_requests FOR EACH ROW EXECUTE FUNCTION private.normalize_plan_sale_request();

CREATE TRIGGER leads_ensure_customer BEFORE INSERT OR UPDATE OF customer_phone, customer_name, contact_consent_at, contact_consent_source, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, do_not_contact, do_not_contact_at, do_not_contact_reason ON leads FOR EACH ROW EXECUTE FUNCTION private.ensure_lead_customer();

CREATE TRIGGER leads_initialize_crm AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION private.initialize_lead_crm();

CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER leads_start_contact_sequence AFTER INSERT OR UPDATE OF assigned_seller_user_id ON leads FOR EACH ROW EXECUTE FUNCTION private.start_contact_sequence_after_assignment();

CREATE TRIGGER model_versions_set_updated_at BEFORE UPDATE ON model_versions FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER models_set_updated_at BEFORE UPDATE ON models FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER sales_cases_set_updated_at BEFORE UPDATE ON sales_cases FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER sales_quotes_set_updated_at BEFORE UPDATE ON sales_quotes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER sales_quotes_validate_offer BEFORE INSERT OR UPDATE OF offer_type, model_id, campaign_id, bank_credit_offer_id, vehicle_version, sale_price ON sales_quotes FOR EACH ROW EXECUTE FUNCTION private.validate_sales_quote_offer();

CREATE TRIGGER validate_sales_quote_bank_credit_applicability BEFORE INSERT OR UPDATE OF bank_credit_offer_id, model_id, vehicle_version, offer_type ON sales_quotes FOR EACH ROW EXECUTE FUNCTION private.validate_sales_quote_bank_credit_applicability();

CREATE POLICY "bank_credit_offer_versions_admin_delete" ON "public"."bank_credit_offer_versions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.current_user_is_admin());

CREATE POLICY "bank_credit_offer_versions_admin_insert" ON "public"."bank_credit_offer_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_admin());

CREATE POLICY "bank_credit_offer_versions_read" ON "public"."bank_credit_offer_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_active());

CREATE POLICY "bank_credit_offers_admin_delete" ON "public"."bank_credit_offers" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.current_user_is_admin());

CREATE POLICY "bank_credit_offers_admin_insert" ON "public"."bank_credit_offers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_admin());

CREATE POLICY "bank_credit_offers_admin_update" ON "public"."bank_credit_offers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());

CREATE POLICY "bank_credit_offers_read_active_users" ON "public"."bank_credit_offers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_active());

CREATE POLICY "brands_admin_delete" ON "public"."brands" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.current_user_is_admin());

CREATE POLICY "brands_admin_insert" ON "public"."brands" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_admin());

CREATE POLICY "brands_admin_update" ON "public"."brands" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());

CREATE POLICY "brands_read_active_users" ON "public"."brands" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_active());

CREATE POLICY "campaign_audit_admin_read" ON "public"."campaign_audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_is_admin());

CREATE POLICY "campaigns_admin_delete" ON "public"."campaigns" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.current_user_is_admin());

CREATE POLICY "campaigns_admin_insert" ON "public"."campaigns" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_admin());

CREATE POLICY "campaigns_admin_update" ON "public"."campaigns" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());

CREATE POLICY "campaigns_read_active_users" ON "public"."campaigns" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_active());

CREATE POLICY "commercial_applications_read_sales_scope" ON "public"."commercial_applications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_can_review_sales() OR ((seller_user_id = ( SELECT auth.uid() AS uid)) AND ((sales_case_id IS NULL) OR (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE ((sales_case.id = commercial_applications.sales_case_id) AND (sales_case.status <> 'cancelled'::text))))))));

CREATE POLICY "commercial_applications_seller_insert" ON "public"."commercial_applications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.current_user_active() AND (seller_user_id = ( SELECT auth.uid() AS uid)) AND (((prequalification_event_id IS NOT NULL) AND (sales_case_id IS NULL) AND (lead_id IS NULL) AND (EXISTS ( SELECT 1
   FROM prequalification_events event
  WHERE ((event.id = commercial_applications.prequalification_event_id) AND (event.seller_user_id = ( SELECT auth.uid() AS uid)))))) OR ((prequalification_event_id IS NULL) AND (sales_case_id IS NOT NULL) AND (lead_id IS NULL) AND (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE ((sales_case.id = commercial_applications.sales_case_id) AND (sales_case.seller_user_id = ( SELECT auth.uid() AS uid)) AND ((sales_case.status = 'minute_pending'::text) OR ((sales_case.status = 'quality_control'::text) AND (sales_case.cdn_scoring_status = 'observed'::text))))))) OR ((prequalification_event_id IS NULL) AND (sales_case_id IS NULL) AND (lead_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = commercial_applications.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid)))))))));

CREATE POLICY "commercial_applications_update_prequalification_or_sales_admin" ON "public"."commercial_applications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((((sales_case_id IS NULL) AND (seller_user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_active() AND (((prequalification_event_id IS NOT NULL) AND (lead_id IS NULL) AND (EXISTS ( SELECT 1
   FROM prequalification_events event
  WHERE ((event.id = commercial_applications.prequalification_event_id) AND (event.seller_user_id = ( SELECT auth.uid() AS uid)))))) OR ((prequalification_event_id IS NULL) AND (lead_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = commercial_applications.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid)))))))) OR private.current_user_can_administer_sales())) WITH CHECK ((((sales_case_id IS NULL) AND (seller_user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_active() AND (((prequalification_event_id IS NOT NULL) AND (lead_id IS NULL) AND (EXISTS ( SELECT 1
   FROM prequalification_events event
  WHERE ((event.id = commercial_applications.prequalification_event_id) AND (event.seller_user_id = ( SELECT auth.uid() AS uid)))))) OR ((prequalification_event_id IS NULL) AND (lead_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = commercial_applications.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid)))))))) OR private.current_user_can_administer_sales()));

CREATE POLICY "contact_message_templates_management_update" ON "public"."contact_message_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.current_user_is_management()) WITH CHECK (private.current_user_is_management());

CREATE POLICY "contact_message_templates_read_active" ON "public"."contact_message_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_active());

CREATE POLICY "customers_read_management_or_owner" ON "public"."customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (private.current_user_is_management() OR private.current_user_is_sales_admin() OR (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.customer_id = customers.id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid)) AND (NOT (EXISTS ( SELECT 1
           FROM sales_cases sales_case
          WHERE (sales_case.lead_id = lead.id))))))))));

CREATE POLICY "lead_activities_read_management_or_owner" ON "public"."lead_activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (private.current_user_is_management() OR ((EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_activities.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid))))) AND (NOT (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE (sales_case.lead_id = lead_activities.lead_id))))))));

CREATE POLICY "lead_contact_sequences_read_management_or_owner" ON "public"."lead_contact_sequences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management())));

CREATE POLICY "lead_contact_tasks_read_management_or_owner" ON "public"."lead_contact_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management())));

CREATE POLICY "lead_crm_read_management_or_owner" ON "public"."lead_crm" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (private.current_user_is_management() OR ((EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_crm.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid))))) AND (NOT (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE (sales_case.lead_id = lead_crm.lead_id))))))));

CREATE POLICY "lead_import_batches_management_read" ON "public"."lead_import_batches" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_is_management());

CREATE POLICY "lead_management_playbook_events_select" ON "public"."lead_management_playbook_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (private.current_user_is_management() OR (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_management_playbook_events.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "lead_management_playbook_items_insert" ON "public"."lead_management_playbook_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.current_user_active() AND (private.current_user_is_management() OR (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_management_playbook_items.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "lead_management_playbook_items_select" ON "public"."lead_management_playbook_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (private.current_user_is_management() OR (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_management_playbook_items.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "lead_management_playbook_items_update" ON "public"."lead_management_playbook_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((private.current_user_active() AND (private.current_user_is_management() OR (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_management_playbook_items.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((private.current_user_active() AND (private.current_user_is_management() OR (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = lead_management_playbook_items.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "lead_recall_items_management_or_owner_read" ON "public"."lead_recall_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_is_management() OR (assigned_seller_user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "lead_recall_panels_management_or_owner_read" ON "public"."lead_recall_panels" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_is_management() OR (seller_user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "lead_sale_requests_read_sales_scope" ON "public"."lead_sale_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_is_management() OR private.current_user_is_sales_admin() OR ((seller_user_id = ( SELECT auth.uid() AS uid)) AND ((status <> 'confirmed'::text) OR (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE ((sales_case.sale_request_id = lead_sale_requests.id) AND (sales_case.status <> 'cancelled'::text))))))));

CREATE POLICY "leads_management_insert" ON "public"."leads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_management());

CREATE POLICY "leads_management_update" ON "public"."leads" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.current_user_is_management()) WITH CHECK (private.current_user_is_management());

CREATE POLICY "leads_read_management_or_owner" ON "public"."leads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND (private.current_user_is_management() OR ((assigned_seller_user_id = ( SELECT auth.uid() AS uid)) AND (NOT (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE (sales_case.lead_id = leads.id))))) OR (private.current_user_is_sales_admin() AND (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE (sales_case.lead_id = leads.id)))))));

CREATE POLICY "model_versions_admin_delete" ON "public"."model_versions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.current_user_is_admin());

CREATE POLICY "model_versions_admin_insert" ON "public"."model_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_admin());

CREATE POLICY "model_versions_admin_update" ON "public"."model_versions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());

CREATE POLICY "model_versions_read_active_users" ON "public"."model_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_active());

CREATE POLICY "models_admin_delete" ON "public"."models" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.current_user_is_admin());

CREATE POLICY "models_admin_insert" ON "public"."models" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.current_user_is_admin());

CREATE POLICY "models_admin_update" ON "public"."models" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());

CREATE POLICY "models_read_active_users" ON "public"."models" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.current_user_active());

CREATE POLICY "prequalifications_read_own_or_management" ON "public"."prequalification_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND ((seller_user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management())));

CREATE POLICY "prequalifications_seller_insert" ON "public"."prequalification_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.current_user_active() AND (seller_user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "profiles_read_own_or_management" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_active() AND ((user_id = ( SELECT auth.uid() AS uid)) OR private.current_user_is_management() OR private.current_user_is_sales_admin())));

CREATE POLICY "sales_case_events_read" ON "public"."sales_case_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_can_review_sales() OR (visible_to_seller AND (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE ((sales_case.id = sales_case_events.sales_case_id) AND (sales_case.seller_user_id = ( SELECT auth.uid() AS uid)) AND (sales_case.status <> 'cancelled'::text)))))));

CREATE POLICY "sales_cases_read" ON "public"."sales_cases" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_can_review_sales() OR ((seller_user_id = ( SELECT auth.uid() AS uid)) AND (status <> 'cancelled'::text))));

CREATE POLICY "sales_notifications_read_own" ON "public"."sales_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((recipient_user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_active()));

CREATE POLICY "sales_notifications_update_own" ON "public"."sales_notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((recipient_user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_active())) WITH CHECK (((recipient_user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_active()));

CREATE POLICY "sales_quotes_read" ON "public"."sales_quotes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.current_user_is_management() OR (private.current_user_is_sales_admin() AND (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE ((sales_case.quote_id = sales_quotes.id) OR (sales_case.lead_id = sales_quotes.lead_id))))) OR ((seller_user_id = ( SELECT auth.uid() AS uid)) AND (NOT (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE (sales_case.lead_id = sales_quotes.lead_id)))))));

CREATE POLICY "sales_quotes_seller_insert" ON "public"."sales_quotes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((seller_user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_active() AND (EXISTS ( SELECT 1
   FROM leads lead
  WHERE ((lead.id = sales_quotes.lead_id) AND (lead.assigned_seller_user_id = ( SELECT auth.uid() AS uid))))) AND (NOT (EXISTS ( SELECT 1
   FROM sales_cases sales_case
  WHERE (sales_case.lead_id = sales_quotes.lead_id))))));

CREATE POLICY "sales_quotes_seller_update" ON "public"."sales_quotes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((seller_user_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::text))) WITH CHECK (((seller_user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['draft'::text, 'cancelled'::text]))));

CREATE POLICY "user_invites_deny_client_access" ON "public"."user_invites" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);

ALTER TABLE "auth"."users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bank_credit_offer_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bank_credit_offers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."campaign_audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."commercial_applications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."contact_message_templates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_activities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_contact_sequences" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_contact_tasks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_crm" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_import_batches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_management_playbook_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_management_playbook_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_recall_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_recall_panels" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lead_sale_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."model_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."models" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."prequalification_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sales_case_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sales_cases" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sales_notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sales_quotes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_invites" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA "auth" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "supabase_admin";

GRANT USAGE ON SCHEMA "auth" TO "supabase_admin";

GRANT CREATE ON SCHEMA "auth" TO "supabase_admin";

RESET ROLE;

SET LOCAL ROLE "supabase_admin";

GRANT USAGE ON SCHEMA "auth" TO "anon";

RESET ROLE;

SET LOCAL ROLE "supabase_admin";

GRANT USAGE ON SCHEMA "auth" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "supabase_admin";

GRANT USAGE ON SCHEMA "auth" TO "service_role";

RESET ROLE;

SET LOCAL ROLE "supabase_admin";

GRANT USAGE ON SCHEMA "auth" TO "supabase_auth_admin";

GRANT CREATE ON SCHEMA "auth" TO "supabase_auth_admin";

RESET ROLE;

SET LOCAL ROLE "supabase_admin";

GRANT USAGE ON SCHEMA "auth" TO "dashboard_user";

GRANT CREATE ON SCHEMA "auth" TO "dashboard_user";

RESET ROLE;

SET LOCAL ROLE "supabase_admin";

GRANT USAGE ON SCHEMA "auth" TO "postgres";

RESET ROLE;

REVOKE ALL ON SCHEMA "extensions" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "extensions" TO "postgres";

GRANT CREATE ON SCHEMA "extensions" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "extensions" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "extensions" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "extensions" TO "service_role";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "extensions" TO "dashboard_user";

GRANT CREATE ON SCHEMA "extensions" TO "dashboard_user";

RESET ROLE;

REVOKE ALL ON SCHEMA "private" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "private" TO "postgres";

GRANT CREATE ON SCHEMA "private" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

RESET ROLE;

REVOKE ALL ON SCHEMA "public" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "public" TO "pg_database_owner";

GRANT CREATE ON SCHEMA "public" TO "pg_database_owner";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "public" TO PUBLIC;

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "public" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "public" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT USAGE ON SCHEMA "public" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "auth"."users" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "supabase_auth_admin";

GRANT INSERT ON TABLE "auth"."users" TO "supabase_auth_admin";

GRANT SELECT ON TABLE "auth"."users" TO "supabase_auth_admin";

GRANT UPDATE ON TABLE "auth"."users" TO "supabase_auth_admin";

GRANT DELETE ON TABLE "auth"."users" TO "supabase_auth_admin";

GRANT TRUNCATE ON TABLE "auth"."users" TO "supabase_auth_admin";

GRANT REFERENCES ON TABLE "auth"."users" TO "supabase_auth_admin";

GRANT TRIGGER ON TABLE "auth"."users" TO "supabase_auth_admin";

GRANT MAINTAIN ON TABLE "auth"."users" TO "supabase_auth_admin";

RESET ROLE;

SET LOCAL ROLE "supabase_auth_admin";

GRANT INSERT ON TABLE "auth"."users" TO "dashboard_user";

GRANT SELECT ON TABLE "auth"."users" TO "dashboard_user";

GRANT UPDATE ON TABLE "auth"."users" TO "dashboard_user";

GRANT DELETE ON TABLE "auth"."users" TO "dashboard_user";

GRANT TRUNCATE ON TABLE "auth"."users" TO "dashboard_user";

GRANT REFERENCES ON TABLE "auth"."users" TO "dashboard_user";

GRANT TRIGGER ON TABLE "auth"."users" TO "dashboard_user";

GRANT MAINTAIN ON TABLE "auth"."users" TO "dashboard_user";

RESET ROLE;

SET LOCAL ROLE "supabase_auth_admin";

GRANT INSERT ON TABLE "auth"."users" TO "postgres";

GRANT SELECT ON TABLE "auth"."users" TO "postgres" WITH GRANT OPTION;

GRANT UPDATE ON TABLE "auth"."users" TO "postgres";

GRANT DELETE ON TABLE "auth"."users" TO "postgres";

GRANT TRUNCATE ON TABLE "auth"."users" TO "postgres";

GRANT REFERENCES ON TABLE "auth"."users" TO "postgres";

GRANT TRIGGER ON TABLE "auth"."users" TO "postgres";

GRANT MAINTAIN ON TABLE "auth"."users" TO "postgres";

RESET ROLE;

REVOKE ALL ON TABLE "public"."bank_credit_offer_versions" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

GRANT SELECT ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

GRANT UPDATE ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

GRANT DELETE ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offer_versions" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offer_versions" TO "anon";

GRANT SELECT ON TABLE "public"."bank_credit_offer_versions" TO "anon";

GRANT UPDATE ON TABLE "public"."bank_credit_offer_versions" TO "anon";

GRANT DELETE ON TABLE "public"."bank_credit_offer_versions" TO "anon";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offer_versions" TO "anon";

GRANT REFERENCES ON TABLE "public"."bank_credit_offer_versions" TO "anon";

GRANT TRIGGER ON TABLE "public"."bank_credit_offer_versions" TO "anon";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offer_versions" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

GRANT SELECT ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

GRANT UPDATE ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

GRANT DELETE ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offer_versions" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

GRANT SELECT ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

GRANT UPDATE ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

GRANT DELETE ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offer_versions" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."bank_credit_offers" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offers" TO "postgres";

GRANT SELECT ON TABLE "public"."bank_credit_offers" TO "postgres";

GRANT UPDATE ON TABLE "public"."bank_credit_offers" TO "postgres";

GRANT DELETE ON TABLE "public"."bank_credit_offers" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offers" TO "postgres";

GRANT REFERENCES ON TABLE "public"."bank_credit_offers" TO "postgres";

GRANT TRIGGER ON TABLE "public"."bank_credit_offers" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offers" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offers" TO "anon";

GRANT SELECT ON TABLE "public"."bank_credit_offers" TO "anon";

GRANT UPDATE ON TABLE "public"."bank_credit_offers" TO "anon";

GRANT DELETE ON TABLE "public"."bank_credit_offers" TO "anon";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offers" TO "anon";

GRANT REFERENCES ON TABLE "public"."bank_credit_offers" TO "anon";

GRANT TRIGGER ON TABLE "public"."bank_credit_offers" TO "anon";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offers" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offers" TO "authenticated";

GRANT SELECT ON TABLE "public"."bank_credit_offers" TO "authenticated";

GRANT UPDATE ON TABLE "public"."bank_credit_offers" TO "authenticated";

GRANT DELETE ON TABLE "public"."bank_credit_offers" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offers" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."bank_credit_offers" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."bank_credit_offers" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offers" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."bank_credit_offers" TO "service_role";

GRANT SELECT ON TABLE "public"."bank_credit_offers" TO "service_role";

GRANT UPDATE ON TABLE "public"."bank_credit_offers" TO "service_role";

GRANT DELETE ON TABLE "public"."bank_credit_offers" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."bank_credit_offers" TO "service_role";

GRANT REFERENCES ON TABLE "public"."bank_credit_offers" TO "service_role";

GRANT TRIGGER ON TABLE "public"."bank_credit_offers" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."bank_credit_offers" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."brands" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."brands" TO "postgres";

GRANT SELECT ON TABLE "public"."brands" TO "postgres";

GRANT UPDATE ON TABLE "public"."brands" TO "postgres";

GRANT DELETE ON TABLE "public"."brands" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."brands" TO "postgres";

GRANT REFERENCES ON TABLE "public"."brands" TO "postgres";

GRANT TRIGGER ON TABLE "public"."brands" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."brands" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."brands" TO "authenticated";

GRANT SELECT ON TABLE "public"."brands" TO "authenticated";

GRANT UPDATE ON TABLE "public"."brands" TO "authenticated";

GRANT DELETE ON TABLE "public"."brands" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."brands" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."brands" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."brands" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."brands" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."brands" TO "service_role";

GRANT SELECT ON TABLE "public"."brands" TO "service_role";

GRANT UPDATE ON TABLE "public"."brands" TO "service_role";

GRANT DELETE ON TABLE "public"."brands" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."brands" TO "service_role";

GRANT REFERENCES ON TABLE "public"."brands" TO "service_role";

GRANT TRIGGER ON TABLE "public"."brands" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."brands" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."campaign_audit_log" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."campaign_audit_log" TO "postgres";

GRANT SELECT ON TABLE "public"."campaign_audit_log" TO "postgres";

GRANT UPDATE ON TABLE "public"."campaign_audit_log" TO "postgres";

GRANT DELETE ON TABLE "public"."campaign_audit_log" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."campaign_audit_log" TO "postgres";

GRANT REFERENCES ON TABLE "public"."campaign_audit_log" TO "postgres";

GRANT TRIGGER ON TABLE "public"."campaign_audit_log" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."campaign_audit_log" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."campaign_audit_log" TO "authenticated";

GRANT SELECT ON TABLE "public"."campaign_audit_log" TO "authenticated";

GRANT UPDATE ON TABLE "public"."campaign_audit_log" TO "authenticated";

GRANT DELETE ON TABLE "public"."campaign_audit_log" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."campaign_audit_log" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."campaign_audit_log" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."campaign_audit_log" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."campaign_audit_log" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."campaign_audit_log" TO "service_role";

GRANT SELECT ON TABLE "public"."campaign_audit_log" TO "service_role";

GRANT UPDATE ON TABLE "public"."campaign_audit_log" TO "service_role";

GRANT DELETE ON TABLE "public"."campaign_audit_log" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."campaign_audit_log" TO "service_role";

GRANT REFERENCES ON TABLE "public"."campaign_audit_log" TO "service_role";

GRANT TRIGGER ON TABLE "public"."campaign_audit_log" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."campaign_audit_log" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."campaigns" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."campaigns" TO "postgres";

GRANT SELECT ON TABLE "public"."campaigns" TO "postgres";

GRANT UPDATE ON TABLE "public"."campaigns" TO "postgres";

GRANT DELETE ON TABLE "public"."campaigns" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."campaigns" TO "postgres";

GRANT REFERENCES ON TABLE "public"."campaigns" TO "postgres";

GRANT TRIGGER ON TABLE "public"."campaigns" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."campaigns" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."campaigns" TO "authenticated";

GRANT SELECT ON TABLE "public"."campaigns" TO "authenticated";

GRANT UPDATE ON TABLE "public"."campaigns" TO "authenticated";

GRANT DELETE ON TABLE "public"."campaigns" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."campaigns" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."campaigns" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."campaigns" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."campaigns" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."campaigns" TO "service_role";

GRANT SELECT ON TABLE "public"."campaigns" TO "service_role";

GRANT UPDATE ON TABLE "public"."campaigns" TO "service_role";

GRANT DELETE ON TABLE "public"."campaigns" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."campaigns" TO "service_role";

GRANT REFERENCES ON TABLE "public"."campaigns" TO "service_role";

GRANT TRIGGER ON TABLE "public"."campaigns" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."campaigns" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."commercial_applications" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."commercial_applications" TO "postgres";

GRANT SELECT ON TABLE "public"."commercial_applications" TO "postgres";

GRANT UPDATE ON TABLE "public"."commercial_applications" TO "postgres";

GRANT DELETE ON TABLE "public"."commercial_applications" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."commercial_applications" TO "postgres";

GRANT REFERENCES ON TABLE "public"."commercial_applications" TO "postgres";

GRANT TRIGGER ON TABLE "public"."commercial_applications" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."commercial_applications" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."commercial_applications" TO "authenticated";

GRANT SELECT ON TABLE "public"."commercial_applications" TO "authenticated";

GRANT UPDATE ON TABLE "public"."commercial_applications" TO "authenticated";

GRANT DELETE ON TABLE "public"."commercial_applications" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."commercial_applications" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."commercial_applications" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."commercial_applications" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."commercial_applications" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."commercial_applications" TO "service_role";

GRANT SELECT ON TABLE "public"."commercial_applications" TO "service_role";

GRANT UPDATE ON TABLE "public"."commercial_applications" TO "service_role";

GRANT DELETE ON TABLE "public"."commercial_applications" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."commercial_applications" TO "service_role";

GRANT REFERENCES ON TABLE "public"."commercial_applications" TO "service_role";

GRANT TRIGGER ON TABLE "public"."commercial_applications" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."commercial_applications" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."contact_message_templates" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."contact_message_templates" TO "postgres";

GRANT SELECT ON TABLE "public"."contact_message_templates" TO "postgres";

GRANT UPDATE ON TABLE "public"."contact_message_templates" TO "postgres";

GRANT DELETE ON TABLE "public"."contact_message_templates" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."contact_message_templates" TO "postgres";

GRANT REFERENCES ON TABLE "public"."contact_message_templates" TO "postgres";

GRANT TRIGGER ON TABLE "public"."contact_message_templates" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."contact_message_templates" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."contact_message_templates" TO "anon";

GRANT SELECT ON TABLE "public"."contact_message_templates" TO "anon";

GRANT UPDATE ON TABLE "public"."contact_message_templates" TO "anon";

GRANT DELETE ON TABLE "public"."contact_message_templates" TO "anon";

GRANT TRUNCATE ON TABLE "public"."contact_message_templates" TO "anon";

GRANT REFERENCES ON TABLE "public"."contact_message_templates" TO "anon";

GRANT TRIGGER ON TABLE "public"."contact_message_templates" TO "anon";

GRANT MAINTAIN ON TABLE "public"."contact_message_templates" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."contact_message_templates" TO "authenticated";

GRANT SELECT ON TABLE "public"."contact_message_templates" TO "authenticated";

GRANT UPDATE ON TABLE "public"."contact_message_templates" TO "authenticated";

GRANT DELETE ON TABLE "public"."contact_message_templates" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."contact_message_templates" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."contact_message_templates" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."contact_message_templates" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."contact_message_templates" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."contact_message_templates" TO "service_role";

GRANT SELECT ON TABLE "public"."contact_message_templates" TO "service_role";

GRANT UPDATE ON TABLE "public"."contact_message_templates" TO "service_role";

GRANT DELETE ON TABLE "public"."contact_message_templates" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."contact_message_templates" TO "service_role";

GRANT REFERENCES ON TABLE "public"."contact_message_templates" TO "service_role";

GRANT TRIGGER ON TABLE "public"."contact_message_templates" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."contact_message_templates" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."customers" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."customers" TO "postgres";

GRANT SELECT ON TABLE "public"."customers" TO "postgres";

GRANT UPDATE ON TABLE "public"."customers" TO "postgres";

GRANT DELETE ON TABLE "public"."customers" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."customers" TO "postgres";

GRANT REFERENCES ON TABLE "public"."customers" TO "postgres";

GRANT TRIGGER ON TABLE "public"."customers" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."customers" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."customers" TO "anon";

GRANT SELECT ON TABLE "public"."customers" TO "anon";

GRANT UPDATE ON TABLE "public"."customers" TO "anon";

GRANT DELETE ON TABLE "public"."customers" TO "anon";

GRANT TRUNCATE ON TABLE "public"."customers" TO "anon";

GRANT REFERENCES ON TABLE "public"."customers" TO "anon";

GRANT TRIGGER ON TABLE "public"."customers" TO "anon";

GRANT MAINTAIN ON TABLE "public"."customers" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."customers" TO "authenticated";

GRANT SELECT ON TABLE "public"."customers" TO "authenticated";

GRANT UPDATE ON TABLE "public"."customers" TO "authenticated";

GRANT DELETE ON TABLE "public"."customers" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."customers" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."customers" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."customers" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."customers" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."customers" TO "service_role";

GRANT SELECT ON TABLE "public"."customers" TO "service_role";

GRANT UPDATE ON TABLE "public"."customers" TO "service_role";

GRANT DELETE ON TABLE "public"."customers" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."customers" TO "service_role";

GRANT REFERENCES ON TABLE "public"."customers" TO "service_role";

GRANT TRIGGER ON TABLE "public"."customers" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."customers" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_activities" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_activities" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_activities" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_activities" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_activities" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_activities" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_activities" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_activities" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_activities" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_activities" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_activities" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_activities" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_activities" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_activities" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_activities" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_activities" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_activities" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_activities" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_activities" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_activities" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_activities" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_activities" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_activities" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_activities" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_activities" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_contact_sequences" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_sequences" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_contact_sequences" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_contact_sequences" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_contact_sequences" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_contact_sequences" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_contact_sequences" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_contact_sequences" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_contact_sequences" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_sequences" TO "anon";

GRANT SELECT ON TABLE "public"."lead_contact_sequences" TO "anon";

GRANT UPDATE ON TABLE "public"."lead_contact_sequences" TO "anon";

GRANT DELETE ON TABLE "public"."lead_contact_sequences" TO "anon";

GRANT TRUNCATE ON TABLE "public"."lead_contact_sequences" TO "anon";

GRANT REFERENCES ON TABLE "public"."lead_contact_sequences" TO "anon";

GRANT TRIGGER ON TABLE "public"."lead_contact_sequences" TO "anon";

GRANT MAINTAIN ON TABLE "public"."lead_contact_sequences" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_sequences" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_contact_sequences" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_contact_sequences" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_contact_sequences" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_contact_sequences" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_contact_sequences" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_contact_sequences" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_contact_sequences" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_sequences" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_contact_sequences" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_contact_sequences" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_contact_sequences" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_contact_sequences" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_contact_sequences" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_contact_sequences" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_contact_sequences" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_contact_tasks" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_tasks" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_contact_tasks" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_contact_tasks" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_contact_tasks" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_contact_tasks" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_contact_tasks" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_contact_tasks" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_contact_tasks" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_tasks" TO "anon";

GRANT SELECT ON TABLE "public"."lead_contact_tasks" TO "anon";

GRANT UPDATE ON TABLE "public"."lead_contact_tasks" TO "anon";

GRANT DELETE ON TABLE "public"."lead_contact_tasks" TO "anon";

GRANT TRUNCATE ON TABLE "public"."lead_contact_tasks" TO "anon";

GRANT REFERENCES ON TABLE "public"."lead_contact_tasks" TO "anon";

GRANT TRIGGER ON TABLE "public"."lead_contact_tasks" TO "anon";

GRANT MAINTAIN ON TABLE "public"."lead_contact_tasks" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_tasks" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_contact_tasks" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_contact_tasks" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_contact_tasks" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_contact_tasks" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_contact_tasks" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_contact_tasks" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_contact_tasks" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_contact_tasks" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_contact_tasks" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_contact_tasks" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_contact_tasks" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_contact_tasks" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_contact_tasks" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_contact_tasks" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_contact_tasks" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_crm" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_crm" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_crm" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_crm" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_crm" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_crm" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_crm" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_crm" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_crm" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_crm" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_crm" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_crm" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_crm" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_crm" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_crm" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_crm" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_crm" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_crm" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_crm" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_crm" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_crm" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_crm" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_crm" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_crm" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_crm" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_import_batches" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_import_batches" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_import_batches" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_import_batches" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_import_batches" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_import_batches" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_import_batches" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_import_batches" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_import_batches" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_import_batches" TO "anon";

GRANT SELECT ON TABLE "public"."lead_import_batches" TO "anon";

GRANT UPDATE ON TABLE "public"."lead_import_batches" TO "anon";

GRANT DELETE ON TABLE "public"."lead_import_batches" TO "anon";

GRANT TRUNCATE ON TABLE "public"."lead_import_batches" TO "anon";

GRANT REFERENCES ON TABLE "public"."lead_import_batches" TO "anon";

GRANT TRIGGER ON TABLE "public"."lead_import_batches" TO "anon";

GRANT MAINTAIN ON TABLE "public"."lead_import_batches" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_import_batches" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_import_batches" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_import_batches" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_import_batches" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_import_batches" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_import_batches" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_import_batches" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_import_batches" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_import_batches" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_import_batches" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_import_batches" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_import_batches" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_import_batches" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_import_batches" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_import_batches" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_import_batches" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_management_playbook_events" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_management_playbook_events" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_management_playbook_events" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_management_playbook_events" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_management_playbook_events" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_management_playbook_events" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_management_playbook_events" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_management_playbook_events" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_management_playbook_events" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_management_playbook_events" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_management_playbook_events" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_management_playbook_events" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_management_playbook_events" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_management_playbook_events" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_management_playbook_events" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_management_playbook_events" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_management_playbook_events" TO "service_role";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON TABLE "public"."lead_management_playbook_events" TO "authenticated";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_management_playbook_items" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_management_playbook_items" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_management_playbook_items" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_management_playbook_items" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_management_playbook_items" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_management_playbook_items" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_management_playbook_items" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_management_playbook_items" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_management_playbook_items" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_management_playbook_items" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_management_playbook_items" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_management_playbook_items" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_management_playbook_items" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_management_playbook_items" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_management_playbook_items" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_management_playbook_items" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_management_playbook_items" TO "service_role";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_management_playbook_items" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_management_playbook_items" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_management_playbook_items" TO "authenticated";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_recall_items" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_items" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_recall_items" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_recall_items" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_recall_items" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_recall_items" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_recall_items" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_recall_items" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_recall_items" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_items" TO "anon";

GRANT SELECT ON TABLE "public"."lead_recall_items" TO "anon";

GRANT UPDATE ON TABLE "public"."lead_recall_items" TO "anon";

GRANT DELETE ON TABLE "public"."lead_recall_items" TO "anon";

GRANT TRUNCATE ON TABLE "public"."lead_recall_items" TO "anon";

GRANT REFERENCES ON TABLE "public"."lead_recall_items" TO "anon";

GRANT TRIGGER ON TABLE "public"."lead_recall_items" TO "anon";

GRANT MAINTAIN ON TABLE "public"."lead_recall_items" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_items" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_recall_items" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_recall_items" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_recall_items" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_recall_items" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_recall_items" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_recall_items" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_recall_items" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_items" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_recall_items" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_recall_items" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_recall_items" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_recall_items" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_recall_items" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_recall_items" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_recall_items" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_recall_panels" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_panels" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_recall_panels" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_recall_panels" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_recall_panels" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_recall_panels" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_recall_panels" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_recall_panels" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_recall_panels" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_panels" TO "anon";

GRANT SELECT ON TABLE "public"."lead_recall_panels" TO "anon";

GRANT UPDATE ON TABLE "public"."lead_recall_panels" TO "anon";

GRANT DELETE ON TABLE "public"."lead_recall_panels" TO "anon";

GRANT TRUNCATE ON TABLE "public"."lead_recall_panels" TO "anon";

GRANT REFERENCES ON TABLE "public"."lead_recall_panels" TO "anon";

GRANT TRIGGER ON TABLE "public"."lead_recall_panels" TO "anon";

GRANT MAINTAIN ON TABLE "public"."lead_recall_panels" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_panels" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_recall_panels" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_recall_panels" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_recall_panels" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_recall_panels" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_recall_panels" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_recall_panels" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_recall_panels" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_recall_panels" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_recall_panels" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_recall_panels" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_recall_panels" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_recall_panels" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_recall_panels" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_recall_panels" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_recall_panels" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."lead_sale_requests" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_sale_requests" TO "postgres";

GRANT SELECT ON TABLE "public"."lead_sale_requests" TO "postgres";

GRANT UPDATE ON TABLE "public"."lead_sale_requests" TO "postgres";

GRANT DELETE ON TABLE "public"."lead_sale_requests" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."lead_sale_requests" TO "postgres";

GRANT REFERENCES ON TABLE "public"."lead_sale_requests" TO "postgres";

GRANT TRIGGER ON TABLE "public"."lead_sale_requests" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."lead_sale_requests" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_sale_requests" TO "authenticated";

GRANT SELECT ON TABLE "public"."lead_sale_requests" TO "authenticated";

GRANT UPDATE ON TABLE "public"."lead_sale_requests" TO "authenticated";

GRANT DELETE ON TABLE "public"."lead_sale_requests" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."lead_sale_requests" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."lead_sale_requests" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."lead_sale_requests" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."lead_sale_requests" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."lead_sale_requests" TO "service_role";

GRANT SELECT ON TABLE "public"."lead_sale_requests" TO "service_role";

GRANT UPDATE ON TABLE "public"."lead_sale_requests" TO "service_role";

GRANT DELETE ON TABLE "public"."lead_sale_requests" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."lead_sale_requests" TO "service_role";

GRANT REFERENCES ON TABLE "public"."lead_sale_requests" TO "service_role";

GRANT TRIGGER ON TABLE "public"."lead_sale_requests" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."lead_sale_requests" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."leads" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."leads" TO "postgres";

GRANT SELECT ON TABLE "public"."leads" TO "postgres";

GRANT UPDATE ON TABLE "public"."leads" TO "postgres";

GRANT DELETE ON TABLE "public"."leads" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."leads" TO "postgres";

GRANT REFERENCES ON TABLE "public"."leads" TO "postgres";

GRANT TRIGGER ON TABLE "public"."leads" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."leads" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."leads" TO "anon";

GRANT SELECT ON TABLE "public"."leads" TO "anon";

GRANT UPDATE ON TABLE "public"."leads" TO "anon";

GRANT DELETE ON TABLE "public"."leads" TO "anon";

GRANT TRUNCATE ON TABLE "public"."leads" TO "anon";

GRANT REFERENCES ON TABLE "public"."leads" TO "anon";

GRANT TRIGGER ON TABLE "public"."leads" TO "anon";

GRANT MAINTAIN ON TABLE "public"."leads" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."leads" TO "authenticated";

GRANT SELECT ON TABLE "public"."leads" TO "authenticated";

GRANT UPDATE ON TABLE "public"."leads" TO "authenticated";

GRANT DELETE ON TABLE "public"."leads" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."leads" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."leads" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."leads" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."leads" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."leads" TO "service_role";

GRANT SELECT ON TABLE "public"."leads" TO "service_role";

GRANT UPDATE ON TABLE "public"."leads" TO "service_role";

GRANT DELETE ON TABLE "public"."leads" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."leads" TO "service_role";

GRANT REFERENCES ON TABLE "public"."leads" TO "service_role";

GRANT TRIGGER ON TABLE "public"."leads" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."leads" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."model_versions" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."model_versions" TO "postgres";

GRANT SELECT ON TABLE "public"."model_versions" TO "postgres";

GRANT UPDATE ON TABLE "public"."model_versions" TO "postgres";

GRANT DELETE ON TABLE "public"."model_versions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."model_versions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."model_versions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."model_versions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."model_versions" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."model_versions" TO "anon";

GRANT SELECT ON TABLE "public"."model_versions" TO "anon";

GRANT UPDATE ON TABLE "public"."model_versions" TO "anon";

GRANT DELETE ON TABLE "public"."model_versions" TO "anon";

GRANT TRUNCATE ON TABLE "public"."model_versions" TO "anon";

GRANT REFERENCES ON TABLE "public"."model_versions" TO "anon";

GRANT TRIGGER ON TABLE "public"."model_versions" TO "anon";

GRANT MAINTAIN ON TABLE "public"."model_versions" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."model_versions" TO "authenticated";

GRANT SELECT ON TABLE "public"."model_versions" TO "authenticated";

GRANT UPDATE ON TABLE "public"."model_versions" TO "authenticated";

GRANT DELETE ON TABLE "public"."model_versions" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."model_versions" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."model_versions" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."model_versions" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."model_versions" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."model_versions" TO "service_role";

GRANT SELECT ON TABLE "public"."model_versions" TO "service_role";

GRANT UPDATE ON TABLE "public"."model_versions" TO "service_role";

GRANT DELETE ON TABLE "public"."model_versions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."model_versions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."model_versions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."model_versions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."model_versions" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."models" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."models" TO "postgres";

GRANT SELECT ON TABLE "public"."models" TO "postgres";

GRANT UPDATE ON TABLE "public"."models" TO "postgres";

GRANT DELETE ON TABLE "public"."models" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."models" TO "postgres";

GRANT REFERENCES ON TABLE "public"."models" TO "postgres";

GRANT TRIGGER ON TABLE "public"."models" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."models" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."models" TO "authenticated";

GRANT SELECT ON TABLE "public"."models" TO "authenticated";

GRANT UPDATE ON TABLE "public"."models" TO "authenticated";

GRANT DELETE ON TABLE "public"."models" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."models" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."models" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."models" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."models" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."models" TO "service_role";

GRANT SELECT ON TABLE "public"."models" TO "service_role";

GRANT UPDATE ON TABLE "public"."models" TO "service_role";

GRANT DELETE ON TABLE "public"."models" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."models" TO "service_role";

GRANT REFERENCES ON TABLE "public"."models" TO "service_role";

GRANT TRIGGER ON TABLE "public"."models" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."models" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."prequalification_events" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."prequalification_events" TO "postgres";

GRANT SELECT ON TABLE "public"."prequalification_events" TO "postgres";

GRANT UPDATE ON TABLE "public"."prequalification_events" TO "postgres";

GRANT DELETE ON TABLE "public"."prequalification_events" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."prequalification_events" TO "postgres";

GRANT REFERENCES ON TABLE "public"."prequalification_events" TO "postgres";

GRANT TRIGGER ON TABLE "public"."prequalification_events" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."prequalification_events" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."prequalification_events" TO "authenticated";

GRANT SELECT ON TABLE "public"."prequalification_events" TO "authenticated";

GRANT UPDATE ON TABLE "public"."prequalification_events" TO "authenticated";

GRANT DELETE ON TABLE "public"."prequalification_events" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."prequalification_events" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."prequalification_events" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."prequalification_events" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."prequalification_events" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."prequalification_events" TO "service_role";

GRANT SELECT ON TABLE "public"."prequalification_events" TO "service_role";

GRANT UPDATE ON TABLE "public"."prequalification_events" TO "service_role";

GRANT DELETE ON TABLE "public"."prequalification_events" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."prequalification_events" TO "service_role";

GRANT REFERENCES ON TABLE "public"."prequalification_events" TO "service_role";

GRANT TRIGGER ON TABLE "public"."prequalification_events" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."prequalification_events" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."profiles" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."profiles" TO "postgres";

GRANT SELECT ON TABLE "public"."profiles" TO "postgres";

GRANT UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE ON TABLE "public"."profiles" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."profiles" TO "postgres";

GRANT REFERENCES ON TABLE "public"."profiles" TO "postgres";

GRANT TRIGGER ON TABLE "public"."profiles" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."profiles" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."profiles" TO "authenticated";

GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE ON TABLE "public"."profiles" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."profiles" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."profiles" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."profiles" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."profiles" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."profiles" TO "service_role";

GRANT SELECT ON TABLE "public"."profiles" TO "service_role";

GRANT UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE ON TABLE "public"."profiles" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."profiles" TO "service_role";

GRANT REFERENCES ON TABLE "public"."profiles" TO "service_role";

GRANT TRIGGER ON TABLE "public"."profiles" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."profiles" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."sales_case_events" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_case_events" TO "postgres";

GRANT SELECT ON TABLE "public"."sales_case_events" TO "postgres";

GRANT UPDATE ON TABLE "public"."sales_case_events" TO "postgres";

GRANT DELETE ON TABLE "public"."sales_case_events" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."sales_case_events" TO "postgres";

GRANT REFERENCES ON TABLE "public"."sales_case_events" TO "postgres";

GRANT TRIGGER ON TABLE "public"."sales_case_events" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."sales_case_events" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_case_events" TO "anon";

GRANT SELECT ON TABLE "public"."sales_case_events" TO "anon";

GRANT UPDATE ON TABLE "public"."sales_case_events" TO "anon";

GRANT DELETE ON TABLE "public"."sales_case_events" TO "anon";

GRANT TRUNCATE ON TABLE "public"."sales_case_events" TO "anon";

GRANT REFERENCES ON TABLE "public"."sales_case_events" TO "anon";

GRANT TRIGGER ON TABLE "public"."sales_case_events" TO "anon";

GRANT MAINTAIN ON TABLE "public"."sales_case_events" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_case_events" TO "authenticated";

GRANT SELECT ON TABLE "public"."sales_case_events" TO "authenticated";

GRANT UPDATE ON TABLE "public"."sales_case_events" TO "authenticated";

GRANT DELETE ON TABLE "public"."sales_case_events" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."sales_case_events" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."sales_case_events" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."sales_case_events" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."sales_case_events" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_case_events" TO "service_role";

GRANT SELECT ON TABLE "public"."sales_case_events" TO "service_role";

GRANT UPDATE ON TABLE "public"."sales_case_events" TO "service_role";

GRANT DELETE ON TABLE "public"."sales_case_events" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."sales_case_events" TO "service_role";

GRANT REFERENCES ON TABLE "public"."sales_case_events" TO "service_role";

GRANT TRIGGER ON TABLE "public"."sales_case_events" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."sales_case_events" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."sales_cases" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_cases" TO "postgres";

GRANT SELECT ON TABLE "public"."sales_cases" TO "postgres";

GRANT UPDATE ON TABLE "public"."sales_cases" TO "postgres";

GRANT DELETE ON TABLE "public"."sales_cases" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."sales_cases" TO "postgres";

GRANT REFERENCES ON TABLE "public"."sales_cases" TO "postgres";

GRANT TRIGGER ON TABLE "public"."sales_cases" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."sales_cases" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_cases" TO "anon";

GRANT SELECT ON TABLE "public"."sales_cases" TO "anon";

GRANT UPDATE ON TABLE "public"."sales_cases" TO "anon";

GRANT DELETE ON TABLE "public"."sales_cases" TO "anon";

GRANT TRUNCATE ON TABLE "public"."sales_cases" TO "anon";

GRANT REFERENCES ON TABLE "public"."sales_cases" TO "anon";

GRANT TRIGGER ON TABLE "public"."sales_cases" TO "anon";

GRANT MAINTAIN ON TABLE "public"."sales_cases" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_cases" TO "authenticated";

GRANT SELECT ON TABLE "public"."sales_cases" TO "authenticated";

GRANT UPDATE ON TABLE "public"."sales_cases" TO "authenticated";

GRANT DELETE ON TABLE "public"."sales_cases" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."sales_cases" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."sales_cases" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."sales_cases" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."sales_cases" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_cases" TO "service_role";

GRANT SELECT ON TABLE "public"."sales_cases" TO "service_role";

GRANT UPDATE ON TABLE "public"."sales_cases" TO "service_role";

GRANT DELETE ON TABLE "public"."sales_cases" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."sales_cases" TO "service_role";

GRANT REFERENCES ON TABLE "public"."sales_cases" TO "service_role";

GRANT TRIGGER ON TABLE "public"."sales_cases" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."sales_cases" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."sales_notifications" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_notifications" TO "postgres";

GRANT SELECT ON TABLE "public"."sales_notifications" TO "postgres";

GRANT UPDATE ON TABLE "public"."sales_notifications" TO "postgres";

GRANT DELETE ON TABLE "public"."sales_notifications" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."sales_notifications" TO "postgres";

GRANT REFERENCES ON TABLE "public"."sales_notifications" TO "postgres";

GRANT TRIGGER ON TABLE "public"."sales_notifications" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."sales_notifications" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_notifications" TO "anon";

GRANT SELECT ON TABLE "public"."sales_notifications" TO "anon";

GRANT UPDATE ON TABLE "public"."sales_notifications" TO "anon";

GRANT DELETE ON TABLE "public"."sales_notifications" TO "anon";

GRANT TRUNCATE ON TABLE "public"."sales_notifications" TO "anon";

GRANT REFERENCES ON TABLE "public"."sales_notifications" TO "anon";

GRANT TRIGGER ON TABLE "public"."sales_notifications" TO "anon";

GRANT MAINTAIN ON TABLE "public"."sales_notifications" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_notifications" TO "authenticated";

GRANT SELECT ON TABLE "public"."sales_notifications" TO "authenticated";

GRANT UPDATE ON TABLE "public"."sales_notifications" TO "authenticated";

GRANT DELETE ON TABLE "public"."sales_notifications" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."sales_notifications" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."sales_notifications" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."sales_notifications" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."sales_notifications" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_notifications" TO "service_role";

GRANT SELECT ON TABLE "public"."sales_notifications" TO "service_role";

GRANT UPDATE ON TABLE "public"."sales_notifications" TO "service_role";

GRANT DELETE ON TABLE "public"."sales_notifications" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."sales_notifications" TO "service_role";

GRANT REFERENCES ON TABLE "public"."sales_notifications" TO "service_role";

GRANT TRIGGER ON TABLE "public"."sales_notifications" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."sales_notifications" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."sales_quotes" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_quotes" TO "postgres";

GRANT SELECT ON TABLE "public"."sales_quotes" TO "postgres";

GRANT UPDATE ON TABLE "public"."sales_quotes" TO "postgres";

GRANT DELETE ON TABLE "public"."sales_quotes" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."sales_quotes" TO "postgres";

GRANT REFERENCES ON TABLE "public"."sales_quotes" TO "postgres";

GRANT TRIGGER ON TABLE "public"."sales_quotes" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."sales_quotes" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_quotes" TO "anon";

GRANT SELECT ON TABLE "public"."sales_quotes" TO "anon";

GRANT UPDATE ON TABLE "public"."sales_quotes" TO "anon";

GRANT DELETE ON TABLE "public"."sales_quotes" TO "anon";

GRANT TRUNCATE ON TABLE "public"."sales_quotes" TO "anon";

GRANT REFERENCES ON TABLE "public"."sales_quotes" TO "anon";

GRANT TRIGGER ON TABLE "public"."sales_quotes" TO "anon";

GRANT MAINTAIN ON TABLE "public"."sales_quotes" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_quotes" TO "authenticated";

GRANT SELECT ON TABLE "public"."sales_quotes" TO "authenticated";

GRANT UPDATE ON TABLE "public"."sales_quotes" TO "authenticated";

GRANT DELETE ON TABLE "public"."sales_quotes" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."sales_quotes" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."sales_quotes" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."sales_quotes" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."sales_quotes" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."sales_quotes" TO "service_role";

GRANT SELECT ON TABLE "public"."sales_quotes" TO "service_role";

GRANT UPDATE ON TABLE "public"."sales_quotes" TO "service_role";

GRANT DELETE ON TABLE "public"."sales_quotes" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."sales_quotes" TO "service_role";

GRANT REFERENCES ON TABLE "public"."sales_quotes" TO "service_role";

GRANT TRIGGER ON TABLE "public"."sales_quotes" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."sales_quotes" TO "service_role";

RESET ROLE;

REVOKE ALL ON TABLE "public"."user_invites" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."user_invites" TO "postgres";

GRANT SELECT ON TABLE "public"."user_invites" TO "postgres";

GRANT UPDATE ON TABLE "public"."user_invites" TO "postgres";

GRANT DELETE ON TABLE "public"."user_invites" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."user_invites" TO "postgres";

GRANT REFERENCES ON TABLE "public"."user_invites" TO "postgres";

GRANT TRIGGER ON TABLE "public"."user_invites" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."user_invites" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT INSERT ON TABLE "public"."user_invites" TO "service_role";

GRANT SELECT ON TABLE "public"."user_invites" TO "service_role";

GRANT UPDATE ON TABLE "public"."user_invites" TO "service_role";

GRANT DELETE ON TABLE "public"."user_invites" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."user_invites" TO "service_role";

GRANT REFERENCES ON TABLE "public"."user_invites" TO "service_role";

GRANT TRIGGER ON TABLE "public"."user_invites" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."user_invites" TO "service_role";

RESET ROLE;

REVOKE ALL ON SEQUENCE "public"."campaign_audit_log_id_seq" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "postgres";

GRANT USAGE ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "public"."campaign_audit_log_id_seq" TO "service_role";

RESET ROLE;

REVOKE ALL ON SEQUENCE "public"."lead_activities_id_seq" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_activities_id_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE "public"."lead_activities_id_seq" TO "postgres";

GRANT USAGE ON SEQUENCE "public"."lead_activities_id_seq" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_activities_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE "public"."lead_activities_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE "public"."lead_activities_id_seq" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_activities_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE "public"."lead_activities_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE "public"."lead_activities_id_seq" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_activities_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "public"."lead_activities_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "public"."lead_activities_id_seq" TO "service_role";

RESET ROLE;

REVOKE ALL ON SEQUENCE "public"."lead_management_playbook_events_id_seq" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_management_playbook_events_id_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE "public"."lead_management_playbook_events_id_seq" TO "postgres";

GRANT USAGE ON SEQUENCE "public"."lead_management_playbook_events_id_seq" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_management_playbook_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "public"."lead_management_playbook_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "public"."lead_management_playbook_events_id_seq" TO "service_role";

RESET ROLE;

REVOKE ALL ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "postgres";

GRANT USAGE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "anon";

GRANT UPDATE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "anon";

GRANT USAGE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "public"."lead_recall_panels_panel_number_seq" TO "service_role";

RESET ROLE;

REVOKE ALL ON SEQUENCE "public"."sales_case_events_id_seq" FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."sales_case_events_id_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE "public"."sales_case_events_id_seq" TO "postgres";

GRANT USAGE ON SEQUENCE "public"."sales_case_events_id_seq" TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."sales_case_events_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE "public"."sales_case_events_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE "public"."sales_case_events_id_seq" TO "anon";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."sales_case_events_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE "public"."sales_case_events_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE "public"."sales_case_events_id_seq" TO "authenticated";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT SELECT ON SEQUENCE "public"."sales_case_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "public"."sales_case_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "public"."sales_case_events_id_seq" TO "service_role";

RESET ROLE;

REVOKE ALL ON FUNCTION "auth"."uid"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "supabase_auth_admin";

GRANT EXECUTE ON FUNCTION "auth"."uid"() TO PUBLIC;

RESET ROLE;

SET LOCAL ROLE "supabase_auth_admin";

GRANT EXECUTE ON FUNCTION "auth"."uid"() TO "supabase_auth_admin";

RESET ROLE;

SET LOCAL ROLE "supabase_auth_admin";

GRANT EXECUTE ON FUNCTION "auth"."uid"() TO "dashboard_user";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."after_sales_minute_insert"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."after_sales_minute_insert"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."audit_campaign_change"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."audit_campaign_change"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."audit_management_playbook_item"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."audit_management_playbook_item"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."authorize_invited_user"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."authorize_invited_user"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."business_date"(p_date date, p_offset integer) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."business_date"(p_date date, p_offset integer) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."cancel_lead_contact_protocol"(p_lead_id uuid, p_reason text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."cancel_lead_contact_protocol"(p_lead_id uuid, p_reason text) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."classify_completed_contact_protocol"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."classify_completed_contact_protocol"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."classify_exhausted_contact_protocol"(p_lead_id uuid, p_sequence_id uuid, p_origin text) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."classify_exhausted_contact_protocol"(p_lead_id uuid, p_sequence_id uuid, p_origin text) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."close_pending_sale_on_desistir"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."close_pending_sale_on_desistir"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."contact_window_end"(p_date date, p_slot integer) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."contact_window_end"(p_date date, p_slot integer) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."contact_window_start"(p_date date, p_slot integer) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."contact_window_start"(p_date date, p_slot integer) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."create_lead_contact_sequence"(p_lead_id uuid, p_seller_user_id uuid, p_started_at timestamp with time zone) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."create_lead_contact_sequence"(p_lead_id uuid, p_seller_user_id uuid, p_started_at timestamp with time zone) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."create_profile_for_invited_user"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."create_profile_for_invited_user"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."create_sales_case_after_confirmation"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."create_sales_case_after_confirmation"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."current_user_active"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_active"() TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_active"() TO "authenticated";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."current_user_can_administer_sales"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_can_administer_sales"() TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_can_administer_sales"() TO "authenticated";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."current_user_can_review_sales"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_can_review_sales"() TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_can_review_sales"() TO "authenticated";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."current_user_is_admin"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_is_admin"() TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_is_admin"() TO "authenticated";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."current_user_is_management"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_is_management"() TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_is_management"() TO "authenticated";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."current_user_is_sales_admin"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_is_sales_admin"() TO "postgres";

RESET ROLE;

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_user_is_sales_admin"() TO "authenticated";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."enforce_en_gestion_next_contact"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."enforce_en_gestion_next_contact"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."enforce_plan_minute_identity"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."enforce_plan_minute_identity"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."ensure_lead_customer"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."ensure_lead_customer"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."guard_canonical_cold_base_marker"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."guard_canonical_cold_base_marker"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."initialize_lead_crm"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."initialize_lead_crm"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."keep_protocol_deadlines_out_of_manual_agenda"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."keep_protocol_deadlines_out_of_manual_agenda"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."lead_has_canonical_cold_base_evidence"(p_lead_id uuid) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."lead_has_canonical_cold_base_evidence"(p_lead_id uuid) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."next_protocol_call_window"(p_after timestamp with time zone) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."next_protocol_call_window"(p_after timestamp with time zone) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."normalize_plan_sale_request"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."normalize_plan_sale_request"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."prepare_management_playbook_item"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."prepare_management_playbook_item"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."prevent_seller_lead_access_after_sale"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."prevent_seller_lead_access_after_sale"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."queue_cold_lead_for_recall"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."queue_cold_lead_for_recall"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."refresh_recall_panel_from_item"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."refresh_recall_panel_from_item"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."start_contact_sequence_after_assignment"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."start_contact_sequence_after_assignment"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."start_lead_crm_cycle"(p_lead_id uuid, p_actor_user_id uuid, p_origin text, p_reason text, p_override_opt_out boolean) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."start_lead_crm_cycle"(p_lead_id uuid, p_actor_user_id uuid, p_origin text, p_reason text, p_override_opt_out boolean) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."sync_contact_sequence_with_status"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."sync_contact_sequence_with_status"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."sync_recall_panel_progress"(p_panel_id uuid) FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."sync_recall_panel_progress"(p_panel_id uuid) TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."validate_sales_quote_bank_credit_applicability"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."validate_sales_quote_bank_credit_applicability"() TO "postgres";

RESET ROLE;

REVOKE ALL ON FUNCTION "private"."validate_sales_quote_offer"() FROM PUBLIC, "anon", "authenticated", "authenticator", "dashboard_user", "postgres", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_privileged_role", "supabase_realtime_admin";

SET LOCAL ROLE "postgres";

GRANT EXECUTE ON FUNCTION "private"."validate_sales_quote_offer"() TO "postgres";

RESET ROLE;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT INSERT ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT INSERT ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT INSERT ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT INSERT ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT SELECT ON SEQUENCES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT UPDATE ON SEQUENCES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT USAGE ON SEQUENCES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT EXECUTE ON FUNCTIONS TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT INSERT ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT SELECT ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT UPDATE ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT DELETE ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT TRUNCATE ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT REFERENCES ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT TRIGGER ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT MAINTAIN ON TABLES TO "postgres" WITH GRANT OPTION;

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT USAGE ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT INSERT ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT INSERT ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT INSERT ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT INSERT ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT UPDATE ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRUNCATE ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT REFERENCES ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT TRIGGER ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT MAINTAIN ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT SELECT ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT UPDATE ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT USAGE ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT SELECT ON SEQUENCES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT UPDATE ON SEQUENCES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT USAGE ON SEQUENCES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT EXECUTE ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT EXECUTE ON FUNCTIONS TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT INSERT ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT SELECT ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT UPDATE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT DELETE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT TRUNCATE ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT REFERENCES ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT TRIGGER ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT MAINTAIN ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT INSERT ON TABLES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT SELECT ON TABLES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT UPDATE ON TABLES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT DELETE ON TABLES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT TRUNCATE ON TABLES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT REFERENCES ON TABLES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT TRIGGER ON TABLES TO "dashboard_user";

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT MAINTAIN ON TABLES TO "dashboard_user";

SET LOCAL check_function_bodies = on;

-- No application/auth user rows, sequence last_value, jobs or secrets restored.

COMMIT;
