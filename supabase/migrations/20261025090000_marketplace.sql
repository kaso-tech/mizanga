-- Gilli — marketplace, phase 1 : vitrine des vendeurs, annonces modérées, recherche publique, signalements.
--
-- Principes :
-- * une annonce présente un produit de l’Espace Business : prix et stock viennent du produit (toujours à jour) ;
-- * toute annonce créée ou modifiée repart « en attente » : seule la modération la publie. La décision de
--   modération (contrôle automatique ou administrateur) ne peut venir que du serveur de Gilli, qui
--   présente une clé de modération ; un vendeur ne peut donc pas publier lui-même ;
-- * le public lit uniquement les annonces publiées, par des fonctions qui n’exposent que les champs utiles ;
-- * les signalements répétés renvoient une annonce en vérification.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Clé de modération (empreinte seulement) ; à définir une fois, dans l’éditeur SQL de Supabase :
--   select public.set_moderation_key('la même valeur que MODERATION_KEY sur le serveur');
-- ---------------------------------------------------------------------------------------------------

create table private.moderation_keys (
  key_hash text primary key,
  created_at timestamptz not null default now()
);

create function public.set_moderation_key(p_key text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or char_length(p_key) < 24 then
    raise exception 'La clé de modération doit compter au moins 24 caractères.' using errcode = 'GL422';
  end if;
  delete from private.moderation_keys;
  insert into private.moderation_keys (key_hash) values (encode(sha256(convert_to(p_key, 'UTF8')), 'hex'));
end;
$$;

create function private.check_moderation_key(p_key text) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_key is null or not exists (select 1 from private.moderation_keys where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'Modération non autorisée.' using errcode = 'GL403';
  end if;
end;
$$;

-- Texte comparable (minuscules, sans accents) pour la recherche et les villes.
create function public.normalize_text(p_text text) returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(translate(coalesce(p_text, ''),
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñŸÿ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYy')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------------------------------
-- Profils vendeurs (un par commerce)
-- ---------------------------------------------------------------------------------------------------

create table public.seller_profiles (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  city text not null check (char_length(btrim(city)) between 2 and 60),
  city_key text generated always as (public.normalize_text(city)) stored,
  whatsapp text check (whatsapp ~ '^[0-9]{8,15}$'),
  phone text check (phone ~ '^[0-9]{8,15}$'),
  delivers_everywhere boolean not null default false,
  delivery_cities text[] not null default '{}' check (cardinality(delivery_cities) <= 30),
  description text check (char_length(description) <= 500),
  -- Attribués par l’administration de Gilli seulement.
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (whatsapp is not null or phone is not null)
);

create trigger seller_profiles_updated_at before update on public.seller_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------
-- Annonces
-- ---------------------------------------------------------------------------------------------------

create type public.listing_status as enum ('pending', 'published', 'review', 'rejected', 'hidden', 'withdrawn');

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null unique,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null check (category ~ '^[a-z0-9-]{2,60}$'),
  subcategory text check (subcategory ~ '^[a-z0-9-]{2,60}$'),
  condition text not null default 'new' check (condition in ('new', 'used', 'refurbished')),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object' and pg_column_size(attributes) <= 4096),
  photos text[] not null default '{}' check (cardinality(photos) <= 5),
  status public.listing_status not null default 'pending',
  -- Chaque modification par le vendeur incrémente la révision : une décision de modération ne s’applique
  -- qu’à la révision qu’elle a examinée.
  revision integer not null default 1,
  moderation_reasons text[] not null default '{}',
  moderated_by text check (moderated_by in ('auto', 'admin')),
  moderated_at timestamptz,
  published_at timestamptz,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);

create index listings_status_idx on public.listings (status, published_at desc);
create index listings_business_idx on public.listings (business_id);

create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

create table public.listing_reports (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  reason text not null check (reason in ('forbidden', 'scam', 'counterfeit', 'wrong_info', 'other')),
  details text check (char_length(details) <= 500),
  reporter_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index listing_reports_listing_idx on public.listing_reports (listing_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------
-- Fonctions du vendeur (propriétaire du commerce)
-- ---------------------------------------------------------------------------------------------------

create function public.upsert_seller_profile(
  p_business_id uuid,
  p_display_name text,
  p_city text,
  p_whatsapp text,
  p_phone text,
  p_delivers_everywhere boolean,
  p_delivery_cities text[],
  p_description text
) returns public.seller_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.seller_profiles;
begin
  if auth.uid() is null or not public.is_business_owner(p_business_id) then
    raise exception 'Seul le propriétaire peut gérer la vitrine.' using errcode = 'GL403';
  end if;
  insert into public.seller_profiles (business_id, display_name, city, whatsapp, phone, delivers_everywhere, delivery_cities, description)
  values (p_business_id, btrim(p_display_name), btrim(p_city), nullif(p_whatsapp, ''), nullif(p_phone, ''), coalesce(p_delivers_everywhere, false), coalesce(p_delivery_cities, '{}'), nullif(btrim(p_description), ''))
  on conflict (business_id) do update set
    display_name = excluded.display_name,
    city = excluded.city,
    whatsapp = excluded.whatsapp,
    phone = excluded.phone,
    delivers_everywhere = excluded.delivers_everywhere,
    delivery_cities = excluded.delivery_cities,
    description = excluded.description
  returning * into v_profile;
  return v_profile;
end;
$$;

-- Crée ou modifie l’annonce d’un produit ; elle repart toujours « en attente » de modération.
create function public.submit_listing(
  p_business_id uuid,
  p_product_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_subcategory text,
  p_condition text,
  p_attributes jsonb,
  p_photos text[]
) returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
  v_product public.products;
  v_photo text;
begin
  if auth.uid() is null or not public.is_business_owner(p_business_id) then
    raise exception 'Seul le propriétaire peut publier sur la marketplace.' using errcode = 'GL403';
  end if;
  if not exists (select 1 from public.seller_profiles where business_id = p_business_id) then
    raise exception 'Complétez d’abord votre vitrine (nom, ville, contact).' using errcode = 'GL422';
  end if;
  select * into v_product from public.products where id = p_product_id and business_id = p_business_id;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'GL403';
  end if;
  if v_product.archived then
    raise exception 'Ce produit est archivé.' using errcode = 'GL410';
  end if;
  foreach v_photo in array coalesce(p_photos, '{}') loop
    if v_photo !~ ('^' || p_business_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
      raise exception 'Photo invalide.' using errcode = 'GL422';
    end if;
  end loop;

  insert into public.listings (business_id, product_id, title, description, category, subcategory, condition, attributes, photos, search_text)
  values (
    p_business_id, p_product_id, btrim(p_title), coalesce(btrim(p_description), ''), p_category, p_subcategory, coalesce(p_condition, 'new'),
    coalesce(p_attributes, '{}'), coalesce(p_photos, '{}'), ''
  )
  on conflict (product_id) do update set
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    subcategory = excluded.subcategory,
    condition = excluded.condition,
    attributes = excluded.attributes,
    photos = excluded.photos,
    status = 'pending',
    revision = public.listings.revision + 1,
    moderation_reasons = '{}',
    moderated_by = null,
    moderated_at = null
  returning * into v_listing;

  update public.listings
  set search_text = public.normalize_text(concat_ws(' ', v_listing.title, v_listing.description, v_listing.category, v_listing.subcategory,
    (select string_agg(value, ' ') from jsonb_each_text(v_listing.attributes))))
  where id = v_listing.id
  returning * into v_listing;
  return v_listing;
end;
$$;

-- Retire une annonce (elle n’est plus visible ; une nouvelle soumission la remet en modération).
create function public.withdraw_listing(p_business_id uuid, p_listing_id uuid) returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
begin
  if auth.uid() is null or not public.is_business_owner(p_business_id) then
    raise exception 'Seul le propriétaire peut retirer une annonce.' using errcode = 'GL403';
  end if;
  update public.listings set status = 'withdrawn' where id = p_listing_id and business_id = p_business_id returning * into v_listing;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'GL403';
  end if;
  return v_listing;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Modération (serveur de Gilli, avec la clé de modération)
-- ---------------------------------------------------------------------------------------------------

create function public.moderate_listing(
  p_key text,
  p_listing_id uuid,
  p_revision integer,
  p_status public.listing_status,
  p_reasons text[],
  p_by text
) returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
begin
  perform private.check_moderation_key(p_key);
  if p_status not in ('published', 'review', 'rejected', 'hidden') or p_by not in ('auto', 'admin') then
    raise exception 'Décision de modération invalide.' using errcode = 'GL422';
  end if;
  -- Le contrôle automatique ne peut que publier ou demander une vérification humaine.
  if p_by = 'auto' and p_status not in ('published', 'review') then
    raise exception 'Décision automatique invalide.' using errcode = 'GL422';
  end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'GL403';
  end if;
  -- Une décision ne s’applique qu’à la version examinée, et jamais à une annonce retirée par son vendeur.
  if v_listing.revision <> p_revision or v_listing.status = 'withdrawn' then
    raise exception 'L’annonce a changé depuis la vérification.' using errcode = 'GL409';
  end if;
  if p_by = 'auto' and v_listing.status <> 'pending' then
    raise exception 'L’annonce n’attend plus de contrôle automatique.' using errcode = 'GL409';
  end if;
  update public.listings set
    status = p_status,
    moderation_reasons = coalesce(p_reasons, '{}'),
    moderated_by = p_by,
    moderated_at = now(),
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
  where id = p_listing_id
  returning * into v_listing;
  return v_listing;
end;
$$;

-- File de modération : annonces d’un statut, avec prix, vendeur et signalements récents.
create function public.moderation_queue(p_key text, p_status public.listing_status default 'review') returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.check_moderation_key(p_key);
  select coalesce(jsonb_agg(item order by updated_at desc), '[]'::jsonb) into v_result
  from (
    select l.updated_at, jsonb_build_object(
      'id', l.id, 'revision', l.revision, 'status', l.status, 'title', l.title, 'description', l.description,
      'category', l.category, 'subcategory', l.subcategory, 'condition', l.condition, 'attributes', l.attributes,
      'photos', l.photos, 'reasons', l.moderation_reasons, 'moderatedBy', l.moderated_by, 'updatedAt', l.updated_at,
      'price', p.sale_price, 'currency', b.currency, 'businessId', b.id, 'businessName', b.name,
      'seller', jsonb_build_object('name', s.display_name, 'city', s.city, 'whatsapp', s.whatsapp, 'phone', s.phone, 'verified', s.verified),
      'reports', (select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'details', r.details, 'createdAt', r.created_at) order by r.created_at desc), '[]'::jsonb)
        from (select * from public.listing_reports where listing_id = l.id order by created_at desc limit 5) r)
    ) as item
    from public.listings l
    join public.products p on p.id = l.product_id
    join public.businesses b on b.id = l.business_id
    left join public.seller_profiles s on s.business_id = l.business_id
    where l.status = p_status
    order by l.updated_at desc
    limit 100
  ) queue;
  return v_result;
end;
$$;

create function public.set_seller_verified(p_key text, p_business_id uuid, p_verified boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_moderation_key(p_key);
  update public.seller_profiles set verified = p_verified where business_id = p_business_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Lecture publique (visiteurs et utilisateurs connectés) : annonces publiées, produit en stock, vendeur actif
-- ---------------------------------------------------------------------------------------------------

create function private.listing_card(l public.listings, p public.products, b public.businesses, s public.seller_profiles, p_city_key text) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'category', l.category, 'subcategory', l.subcategory, 'condition', l.condition,
    'attributes', l.attributes, 'photo', l.photos[1], 'price', p.sale_price, 'currency', b.currency, 'unit', p.unit,
    'city', s.city, 'sellerId', l.business_id, 'sellerName', s.display_name, 'sellerVerified', s.verified,
    'sameCity', p_city_key is not null and s.city_key = p_city_key,
    'deliversToCity', p_city_key is not null and (s.delivers_everywhere or exists (select 1 from unnest(s.delivery_cities) c where public.normalize_text(c) = p_city_key)),
    'publishedAt', l.published_at
  );
$$;

create function public.marketplace_search(
  p_query text default null,
  p_category text default null,
  p_subcategory text default null,
  p_city text default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_condition text default null,
  p_limit integer default 24,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_terms text[] := array(select term from unnest(string_to_array(public.normalize_text(p_query), ' ')) term where char_length(term) >= 2 limit 8);
  v_city text := nullif(public.normalize_text(p_city), '');
  v_result jsonb;
begin
  with matches as (
    select l, p, b, s
    from public.listings l
    join public.products p on p.id = l.product_id
    join public.businesses b on b.id = l.business_id
    join public.seller_profiles s on s.business_id = l.business_id
    where l.status = 'published' and s.active and not p.archived and p.quantity > 0
      and (p_category is null or l.category = p_category)
      and (p_subcategory is null or l.subcategory = p_subcategory)
      and (p_condition is null or l.condition = p_condition)
      and (p_min_price is null or p.sale_price >= p_min_price)
      and (p_max_price is null or p.sale_price <= p_max_price)
      and not exists (select 1 from unnest(v_terms) term where position(term in l.search_text) = 0)
  ), ranked as (
    select private.listing_card(l, p, b, s, v_city) as card,
      (v_city is not null and (s).city_key = v_city) as same_city,
      (v_city is not null and ((s).delivers_everywhere or exists (select 1 from unnest((s).delivery_cities) c where public.normalize_text(c) = v_city))) as delivers,
      (l).published_at as published_at
    from matches
  )
  select jsonb_build_object(
    'total', (select count(*) from ranked),
    'items', coalesce((select jsonb_agg(card) from (
      select card from ranked order by same_city desc, delivers desc, published_at desc
      limit least(greatest(coalesce(p_limit, 24), 1), 60) offset greatest(coalesce(p_offset, 0), 0)
    ) page), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.marketplace_listing(p_listing_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'description', l.description, 'category', l.category, 'subcategory', l.subcategory,
    'condition', l.condition, 'attributes', l.attributes, 'photos', l.photos, 'price', p.sale_price, 'currency', b.currency,
    'unit', p.unit, 'inStock', p.quantity > 0, 'publishedAt', l.published_at,
    'seller', jsonb_build_object('id', l.business_id, 'name', s.display_name, 'city', s.city, 'whatsapp', s.whatsapp, 'phone', s.phone,
      'verified', s.verified, 'deliversEverywhere', s.delivers_everywhere, 'deliveryCities', s.delivery_cities, 'description', s.description)
  )
  from public.listings l
  join public.products p on p.id = l.product_id
  join public.businesses b on b.id = l.business_id
  join public.seller_profiles s on s.business_id = l.business_id
  where l.id = p_listing_id and l.status = 'published' and s.active and not p.archived;
$$;

create function public.marketplace_seller(p_business_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'seller', jsonb_build_object('id', s.business_id, 'name', s.display_name, 'city', s.city, 'whatsapp', s.whatsapp, 'phone', s.phone,
      'verified', s.verified, 'deliversEverywhere', s.delivers_everywhere, 'deliveryCities', s.delivery_cities, 'description', s.description),
    'listings', coalesce((
      select jsonb_agg(private.listing_card(l, p, b, s, null) order by l.published_at desc)
      from public.listings l
      join public.products p on p.id = l.product_id
      join public.businesses b on b.id = l.business_id
      where l.business_id = s.business_id and l.status = 'published' and not p.archived and p.quantity > 0
    ), '[]'::jsonb)
  )
  from public.seller_profiles s
  where s.business_id = p_business_id and s.active;
$$;

-- Signalement d’une annonce publiée ; trois signalements depuis la dernière décision la renvoient en vérification.
create function public.report_listing(p_listing_id uuid, p_reason text, p_details text default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
begin
  select * into v_listing from public.listings where id = p_listing_id and status = 'published' for update;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'GL403';
  end if;
  insert into public.listing_reports (listing_id, reason, details, reporter_id)
  values (p_listing_id, p_reason, nullif(btrim(left(p_details, 500)), ''), auth.uid());
  if (select count(*) from public.listing_reports where listing_id = p_listing_id and created_at >= coalesce(v_listing.moderated_at, v_listing.created_at)) >= 3 then
    update public.listings set status = 'review', moderation_reasons = array['Signalée plusieurs fois par des utilisateurs'], moderated_by = 'auto', moderated_at = now()
    where id = p_listing_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Photos (Supabase Storage) : dossier du commerce, écriture par son propriétaire, lecture publique
-- ---------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos d’annonces : ajout par le propriétaire du commerce" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and public.is_business_owner(((storage.foldername(name))[1])::uuid));

create policy "photos d’annonces : suppression par le propriétaire du commerce" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos' and public.is_business_owner(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------------------------------
-- Droits et règles d’accès
-- ---------------------------------------------------------------------------------------------------

revoke all on public.seller_profiles, public.listings, public.listing_reports from anon, authenticated;
grant select on public.seller_profiles, public.listings to authenticated;

alter table public.seller_profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_reports enable row level security;

create policy "vitrine : lecture par les membres du commerce" on public.seller_profiles
  for select to authenticated using (public.is_business_member(business_id));
create policy "annonces : lecture par les membres du commerce" on public.listings
  for select to authenticated using (public.is_business_member(business_id));

revoke execute on function public.set_moderation_key(text) from public, anon, authenticated;
revoke execute on function private.check_moderation_key(text) from public, anon, authenticated;
revoke execute on function private.listing_card(public.listings, public.products, public.businesses, public.seller_profiles, text) from public, anon, authenticated;
revoke execute on function public.upsert_seller_profile(uuid, text, text, text, text, boolean, text[], text) from public, anon;
revoke execute on function public.submit_listing(uuid, uuid, text, text, text, text, text, jsonb, text[]) from public, anon;
revoke execute on function public.withdraw_listing(uuid, uuid) from public, anon;
grant execute on function public.upsert_seller_profile(uuid, text, text, text, text, boolean, text[], text) to authenticated;
grant execute on function public.submit_listing(uuid, uuid, text, text, text, text, text, jsonb, text[]) to authenticated;
grant execute on function public.withdraw_listing(uuid, uuid) to authenticated;
-- La clé est vérifiée dans ces fonctions ; elles restent appelables par le serveur avec la clé publique.
grant execute on function public.moderate_listing(text, uuid, integer, public.listing_status, text[], text) to anon, authenticated;
grant execute on function public.moderation_queue(text, public.listing_status) to anon, authenticated;
grant execute on function public.set_seller_verified(text, uuid, boolean) to anon, authenticated;
grant execute on function public.marketplace_search(text, text, text, text, bigint, bigint, text, integer, integer) to anon, authenticated;
grant execute on function public.marketplace_listing(uuid) to anon, authenticated;
grant execute on function public.marketplace_seller(uuid) to anon, authenticated;
grant execute on function public.report_listing(uuid, text, text) to anon, authenticated;
grant execute on function public.normalize_text(text) to anon, authenticated;
