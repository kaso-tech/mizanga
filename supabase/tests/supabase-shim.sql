-- Pour les tests uniquement : reproduit ce que Supabase fournit avant nos migrations.
-- * rôles anon, authenticated, service_role (ce dernier contourne la RLS) ;
-- * schéma auth avec auth.users et auth.uid() (identifiant tiré du jeton de l’utilisateur) ;
-- * droits accordés par défaut par Supabase sur tout ce qui est créé dans public : nos migrations doivent
--   donc les retirer elles-mêmes, et les tests le vérifient.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Supabase Storage (le strict nécessaire) : compartiments, fichiers (avec RLS) et storage.foldername().
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
