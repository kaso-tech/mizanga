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
