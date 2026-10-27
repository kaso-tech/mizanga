-- Marketplace sur le compte : favoris, alertes de recherche et abonnements aux notifications du
-- téléphone (Web Push).
--
-- Règles :
-- * chacun ne voit et ne modifie que ses favoris, ses alertes et ses abonnements (RLS) ;
-- * 100 favoris et 10 alertes au plus par compte ;
-- * les critères d’une alerte (`criteria`) sont calculés par le serveur à partir de ses filtres, au
--   format de la recherche (marketplace_search) : la base s’en sert pour trouver les alertes qu’une
--   annonce nouvellement publiée satisfait ;
-- * une alerte n’est notifiée qu’une fois par annonce, jamais pour une annonce du commerce de
--   l’utilisateur, et 10 fois par jour au plus par compte ;
-- * l’envoi des notifications passe par le serveur, avec la clé de modération (comme les décisions de
--   modération) ; les clés VAPID générées par le serveur sont gardées dans le schéma privé.

create table public.marketplace_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 4000),
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.marketplace_alerts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  filters jsonb not null check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 2000),
  criteria jsonb not null check (jsonb_typeof(criteria) = 'object' and octet_length(criteria::text) <= 2000),
  seen_at timestamptz not null default now(),
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index marketplace_alerts_user_idx on public.marketplace_alerts (user_id);
create index marketplace_alerts_notify_idx on public.marketplace_alerts (notify) where notify;
create trigger marketplace_alerts_updated_at before update on public.marketplace_alerts for each row execute function public.set_updated_at();

create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table private.alert_notifications (
  alert_id uuid not null references public.marketplace_alerts (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (alert_id, listing_id)
);
create index alert_notifications_user_idx on private.alert_notifications (user_id, created_at desc);

create table private.push_keys (
  id boolean primary key default true check (id),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

-- Limites par compte (un favori ou une alerte déjà enregistrés peuvent toujours être mis à jour).
create function private.check_favorites_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.marketplace_favorites where user_id = new.user_id) >= 100
    and not exists (select 1 from public.marketplace_favorites where user_id = new.user_id and listing_id = new.listing_id) then
    raise exception 'Vous avez déjà 100 favoris : retirez-en un d’abord.' using errcode = 'GL422';
  end if;
  return new;
end;
$$;
create function private.check_alerts_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.marketplace_alerts where user_id = new.user_id) >= 10
    and not exists (select 1 from public.marketplace_alerts where id = new.id) then
    raise exception 'Vous avez déjà 10 alertes : supprimez-en une d’abord.' using errcode = 'GL422';
  end if;
  return new;
end;
$$;
create trigger marketplace_favorites_limit before insert on public.marketplace_favorites for each row execute function private.check_favorites_limit();
create trigger marketplace_alerts_limit before insert on public.marketplace_alerts for each row execute function private.check_alerts_limit();

revoke all on public.marketplace_favorites, public.marketplace_alerts, public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.marketplace_favorites to authenticated;
grant update (snapshot) on public.marketplace_favorites to authenticated;
grant select, insert, delete on public.marketplace_alerts to authenticated;
grant update (label, filters, criteria, seen_at, notify) on public.marketplace_alerts to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
alter table public.marketplace_favorites enable row level security;
alter table public.marketplace_alerts enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "favoris : les siens" on public.marketplace_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "alertes : les siennes" on public.marketplace_alerts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "abonnements : les siens (lecture)" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "abonnements : les siens (suppression)" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Enregistrement (ajout ou mise à jour) d’un favori et d’une alerte, avec les droits de l’utilisateur.
create function public.save_marketplace_favorite(p_listing_id uuid, p_snapshot jsonb) returns void
language sql
set search_path = ''
as $$
  insert into public.marketplace_favorites (listing_id, snapshot) values (p_listing_id, p_snapshot)
  on conflict (user_id, listing_id) do update set snapshot = excluded.snapshot;
$$;

create function public.save_marketplace_alert(p_id uuid, p_label text, p_filters jsonb, p_criteria jsonb, p_seen_at timestamptz, p_notify boolean) returns void
language sql
set search_path = ''
as $$
  insert into public.marketplace_alerts (id, label, filters, criteria, seen_at, notify) values (p_id, p_label, p_filters, p_criteria, p_seen_at, p_notify)
  on conflict (id) do update set label = excluded.label, filters = excluded.filters, criteria = excluded.criteria,
    seen_at = greatest(public.marketplace_alerts.seen_at, excluded.seen_at), notify = excluded.notify;
$$;

-- Abonnement du téléphone : un appareil partagé passe au compte connecté.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'GL403';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth);
  -- 10 appareils au plus par compte : les plus anciens sont retirés.
  delete from public.push_subscriptions where user_id = auth.uid() and endpoint in (
    select endpoint from public.push_subscriptions where user_id = auth.uid() order by created_at desc offset 10
  );
end;
$$;

-- L’annonce satisfait-elle les critères d’une alerte ? (mêmes règles que marketplace_search, sans la ville,
-- qui n’y sert qu’au classement.)
create function private.listing_matches_criteria(l public.listings, p public.products, s public.seller_profiles, c jsonb) returns boolean
language sql
stable
set search_path = ''
as $$
  select (c ->> 'category' is null or l.category = c ->> 'category')
    and (c ->> 'subcategory' is null or l.subcategory = c ->> 'subcategory')
    and (c ->> 'condition' is null or l.condition = c ->> 'condition')
    and (c ->> 'min_price' is null or p.sale_price >= (c ->> 'min_price')::bigint)
    and (c ->> 'max_price' is null or p.sale_price <= (c ->> 'max_price')::bigint)
    and (not coalesce((c ->> 'verified_only')::boolean, false) or s.verified)
    and not exists (
      select 1 from unnest(array(select term from unnest(string_to_array(public.normalize_text(c ->> 'query'), ' ')) term where char_length(term) >= 2 limit 8)) term
      where position(term in l.search_text) = 0
    )
    and not exists (
      select 1 from jsonb_each(case when jsonb_typeof(c -> 'attributes') = 'object' then c -> 'attributes' else '{}'::jsonb end) wanted(key, value)
      where not case
        when jsonb_typeof(wanted.value) = 'object' then
          jsonb_typeof(l.attributes -> wanted.key) = 'number'
          and (not (wanted.value ? 'min') or (l.attributes ->> wanted.key)::numeric >= (wanted.value ->> 'min')::numeric)
          and (not (wanted.value ? 'max') or (l.attributes ->> wanted.key)::numeric <= (wanted.value ->> 'max')::numeric)
        when jsonb_typeof(wanted.value) = 'boolean' then l.attributes -> wanted.key = wanted.value
        when jsonb_typeof(wanted.value) = 'string' then
          jsonb_typeof(l.attributes -> wanted.key) = 'string'
          and public.normalize_text(l.attributes ->> wanted.key) = public.normalize_text(wanted.value #>> '{}')
        else false
      end
    );
$$;

-- Alertes à notifier pour une annonce qui vient d’être publiée, avec les appareils de leurs propriétaires.
-- Chaque alerte trouvée est marquée comme notifiée pour cette annonce (aucun doublon).
create function public.alert_notifications_for_listing(p_key text, p_listing_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.check_moderation_key(p_key);
  with listing as (
    select l, p, s, b
    from public.listings l
    join public.products p on p.id = l.product_id
    join public.businesses b on b.id = l.business_id
    join public.seller_profiles s on s.business_id = l.business_id
    where l.id = p_listing_id and l.status = 'published' and s.active and not p.archived and p.quantity > 0
  ), matched as (
    select a.id, a.user_id, a.label
    from public.marketplace_alerts a, listing
    where a.notify
      and a.created_at < (listing.l).published_at
      and not exists (select 1 from public.business_members m where m.business_id = (listing.l).business_id and m.user_id = a.user_id)
      and not exists (select 1 from private.alert_notifications n where n.alert_id = a.id and n.listing_id = p_listing_id)
      and (select count(*) from private.alert_notifications n where n.user_id = a.user_id and n.created_at > now() - interval '1 day') < 10
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = a.user_id)
      and private.listing_matches_criteria(listing.l, listing.p, listing.s, a.criteria)
  ), noted as (
    insert into private.alert_notifications (alert_id, listing_id, user_id)
    select id, p_listing_id, user_id from matched
    on conflict do nothing
    returning alert_id
  )
  select jsonb_build_object(
    'listing', (select jsonb_build_object('id', (l).id, 'title', (l).title, 'price', (p).sale_price, 'currency', (b).currency, 'city', (s).city) from listing),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
      'alertId', m.id, 'label', m.label,
      'subscriptions', (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)) from public.push_subscriptions ps where ps.user_id = m.user_id)
    )) from matched m where m.id in (select alert_id from noted)), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Appareil qui n’accepte plus les notifications (désinstallé, permission retirée).
create function public.forget_push_subscription(p_key text, p_endpoint text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_moderation_key(p_key);
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

-- Clés VAPID du serveur : lues, ou enregistrées une fois (la première valeur reste).
create function public.push_keys(p_key text, p_public_key text default null, p_private_key text default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_moderation_key(p_key);
  if p_public_key is not null and p_private_key is not null then
    insert into private.push_keys (public_key, private_key) values (p_public_key, p_private_key) on conflict (id) do nothing;
  end if;
  return (select jsonb_build_object('publicKey', public_key, 'privateKey', private_key) from private.push_keys);
end;
$$;

revoke execute on function private.check_favorites_limit() from public, anon, authenticated;
revoke execute on function private.check_alerts_limit() from public, anon, authenticated;
revoke execute on function private.listing_matches_criteria(public.listings, public.products, public.seller_profiles, jsonb) from public, anon, authenticated;
revoke execute on function public.save_marketplace_favorite(uuid, jsonb) from public, anon;
revoke execute on function public.save_marketplace_alert(uuid, text, jsonb, jsonb, timestamptz, boolean) from public, anon;
grant execute on function public.save_marketplace_favorite(uuid, jsonb) to authenticated;
grant execute on function public.save_marketplace_alert(uuid, text, jsonb, jsonb, timestamptz, boolean) to authenticated;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
revoke execute on function public.alert_notifications_for_listing(text, uuid) from public;
revoke execute on function public.forget_push_subscription(text, text) from public;
revoke execute on function public.push_keys(text, text, text) from public;
grant execute on function public.alert_notifications_for_listing(text, uuid) to anon, authenticated;
grant execute on function public.forget_push_subscription(text, text) to anon, authenticated;
grant execute on function public.push_keys(text, text, text) to anon, authenticated;
