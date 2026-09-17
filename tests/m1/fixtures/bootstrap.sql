-- Synthetic compatibility surface only. Never run against a shared database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
-- Simulate the restricted migration administrator, not a superuser shortcut.
CREATE ROLE postgres NOLOGIN NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS;
CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE SCHEMA extensions AUTHORIZATION postgres;
CREATE SCHEMA private AUTHORIZATION postgres;
ALTER SCHEMA public OWNER TO postgres;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TYPE public.app_role AS ENUM ('admin', 'seller', 'supervisor', 'admventas');
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role public.app_role NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.leads (
  id uuid PRIMARY KEY,
  assigned_seller_user_id uuid REFERENCES public.profiles(user_id)
);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
ALTER TABLE auth.users OWNER TO postgres;
ALTER TABLE public.profiles OWNER TO postgres;
ALTER TABLE public.leads OWNER TO postgres;
ALTER FUNCTION auth.uid() OWNER TO postgres;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_profiles_self ON public.profiles TO authenticated
USING (user_id = auth.uid());
CREATE POLICY fixture_leads_owner ON public.leads TO authenticated
USING (assigned_seller_user_id = auth.uid());
GRANT SELECT ON public.profiles, public.leads TO authenticated, service_role;
-- The runtime principal must not be added to these legacy fixture ACLs.
