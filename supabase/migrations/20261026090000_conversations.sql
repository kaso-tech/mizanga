-- Gilli — conversations enregistrées sur le compte : chatbot généraliste et assistants de l’Espace Business
-- (commerce, élevage, agriculture). Chacun ne voit, ne modifie et ne supprime que les siennes ; une
-- conversation d’assistant Business est rattachée à un commerce dont l’utilisateur est membre.
-- Le contenu des fichiers joints n’est jamais enregistré (seulement leur nom), comme sur l’appareil.

create table public.conversations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Identifiant créé par l’application (le même sur tous les appareils).
  id text not null check (id ~ '^[A-Za-z0-9-]{8,80}$'),
  kind text not null default 'general' check (kind in ('general', 'commerce', 'elevage', 'agriculture')),
  business_id uuid references public.businesses (id) on delete cascade,
  title text check (char_length(title) <= 120),
  favorite boolean not null default false,
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and octet_length(messages::text) <= 2000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check ((kind = 'general') = (business_id is null))
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

revoke all on public.conversations from anon, authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
alter table public.conversations enable row level security;

create policy "conversations : lecture des siennes" on public.conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversations : ajout des siennes" on public.conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (business_id is null or public.is_business_member(business_id)));
create policy "conversations : modification des siennes" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (business_id is null or public.is_business_member(business_id)));
create policy "conversations : suppression des siennes" on public.conversations
  for delete to authenticated using (user_id = (select auth.uid()));
