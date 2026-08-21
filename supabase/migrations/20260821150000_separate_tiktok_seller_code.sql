alter table public.profiles
  add column if not exists tiktok_code text;

alter table public.user_invites
  add column if not exists tiktok_code text;

update public.profiles
set tiktok_code = upper(trim(seller_code))
where role = 'seller'
  and tiktok_code is null
  and seller_code is not null;

update public.user_invites
set tiktok_code = upper(trim(seller_code))
where role = 'seller'
  and tiktok_code is null
  and seller_code is not null;

alter table public.profiles
  drop constraint if exists profiles_tiktok_code_format;

alter table public.profiles
  add constraint profiles_tiktok_code_format check (
    (role <> 'seller' and tiktok_code is null)
    or (
      role = 'seller'
      and char_length(tiktok_code) between 3 and 20
      and tiktok_code ~ '^[A-Z]{2,}[A-Z0-9_-]*[0-9][A-Z0-9_-]*$'
    )
  );

alter table public.user_invites
  drop constraint if exists user_invites_tiktok_code_format;

alter table public.user_invites
  add constraint user_invites_tiktok_code_format check (
    (role <> 'seller' and tiktok_code is null)
    or (
      role = 'seller'
      and char_length(tiktok_code) between 3 and 20
      and tiktok_code ~ '^[A-Z]{2,}[A-Z0-9_-]*[0-9][A-Z0-9_-]*$'
    )
  );

create unique index if not exists profiles_tiktok_code_unique_idx
  on public.profiles (tiktok_code)
  where tiktok_code is not null;

create unique index if not exists user_invites_active_tiktok_code_unique_idx
  on public.user_invites (tiktok_code)
  where tiktok_code is not null and active = true and accepted_at is null;

create or replace function private.authorize_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.create_profile_for_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

alter table public.lead_tiktok_attributions
  drop constraint if exists lead_tiktok_attributions_identifier_type;

alter table public.lead_tiktok_attributions
  add constraint lead_tiktok_attributions_identifier_type check (
    identifier_type in ('seller_code', 'tiktok_code', 'advisor_name')
  );

comment on column public.profiles.seller_code is
  'Código interno de acceso al portal comercial.';

comment on column public.profiles.tiktok_code is
  'Código público del vendedor usado exclusivamente para atribuir y asignar leads provenientes de TikTok.';

comment on column public.user_invites.tiktok_code is
  'Código público de TikTok que se copia al perfil al crear el usuario.';

comment on column public.leads.seller_code_received is
  'Identificador público recibido por WhatsApp; para atribuciones nuevas corresponde al código TikTok del vendedor.';
