-- Confiance : avis des clients sur les vendeurs et statistiques publiques des vendeurs.
--
-- Règles :
-- * un compte donne au plus un avis par vendeur (note de 1 à 5, commentaire facultatif de 500
--   caractères), modifiable et supprimable ; jamais sur son propre commerce ;
-- * un avis créé ou modifié part « en attente » ; le serveur le contrôle (règles automatiques) et le
--   publie ou l’envoie en vérification humaine, avec la clé de modération (comme les annonces) ;
--   l’administration peut aussi le masquer ;
-- * seuls les avis publiés comptent dans la note : moyenne arrondie à 0,1, avec le nombre d’avis ;
-- * statistiques publiques : membre depuis (création de la vitrine), annonces en ligne, vendeur vérifié,
--   note et nombre d’avis. Les avis sont affichés sans le nom ni l’adresse de leur auteur.

create table public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  status text not null default 'pending' check (status in ('pending', 'published', 'review', 'hidden')),
  revision integer not null default 1,
  moderation_reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index seller_reviews_business_idx on public.seller_reviews (business_id, status, updated_at desc);
create trigger seller_reviews_updated_at before update on public.seller_reviews for each row execute function public.set_updated_at();

revoke all on public.seller_reviews from anon, authenticated;
grant select, delete on public.seller_reviews to authenticated;
alter table public.seller_reviews enable row level security;
create policy "avis : les siens (lecture)" on public.seller_reviews for select to authenticated using (user_id = auth.uid());
create policy "avis : les siens (suppression)" on public.seller_reviews for delete to authenticated using (user_id = auth.uid());

-- Note publique d’un vendeur (avis publiés seulement).
create function private.seller_rating(p_business_id uuid) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'rating', case when count(*) > 0 then round(avg(rating)::numeric, 1) end,
    'reviewCount', count(*)
  )
  from public.seller_reviews where business_id = p_business_id and status = 'published';
$$;

-- Avis du compte connecté : créé ou modifié, il repart en attente de contrôle.
create function public.save_seller_review(p_business_id uuid, p_rating integer, p_comment text default null) returns public.seller_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.seller_reviews;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour donner votre avis.' using errcode = 'GL403';
  end if;
  if not exists (select 1 from public.seller_profiles where business_id = p_business_id and active) then
    raise exception 'Vendeur introuvable.' using errcode = 'GL422';
  end if;
  if public.is_business_member(p_business_id) then
    raise exception 'Vous ne pouvez pas donner un avis sur votre propre commerce.' using errcode = 'GL403';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'La note doit être comprise entre 1 et 5.' using errcode = 'GL422';
  end if;
  if char_length(v_comment) > 500 then
    raise exception 'Le commentaire ne peut pas dépasser 500 caractères.' using errcode = 'GL422';
  end if;
  insert into public.seller_reviews (business_id, user_id, rating, comment)
  values (p_business_id, auth.uid(), p_rating, v_comment)
  on conflict (business_id, user_id) do update set
    rating = excluded.rating, comment = excluded.comment, status = 'pending',
    revision = public.seller_reviews.revision + 1, moderation_reasons = '{}'
  returning * into v_review;
  return v_review;
end;
$$;

-- Décision sur un avis (contrôle automatique ou administration), pour la version examinée.
create function public.moderate_review(p_key text, p_review_id uuid, p_revision integer, p_status text, p_reasons text[], p_by text) returns public.seller_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.seller_reviews;
begin
  perform private.check_moderation_key(p_key);
  if p_status not in ('published', 'review', 'hidden') or p_by not in ('auto', 'admin') or (p_by = 'auto' and p_status = 'hidden') then
    raise exception 'Décision de modération invalide.' using errcode = 'GL422';
  end if;
  select * into v_review from public.seller_reviews where id = p_review_id for update;
  if not found then
    raise exception 'Avis introuvable.' using errcode = 'GL403';
  end if;
  if v_review.revision <> p_revision or (p_by = 'auto' and v_review.status <> 'pending') then
    raise exception 'L’avis a changé depuis la vérification.' using errcode = 'GL409';
  end if;
  update public.seller_reviews set status = p_status, moderation_reasons = coalesce(p_reasons, '{}')
  where id = p_review_id returning * into v_review;
  return v_review;
end;
$$;

-- File de vérification des avis (console d’administration).
create function public.review_queue(p_key text, p_status text) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_moderation_key(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'revision', r.revision, 'rating', r.rating, 'comment', r.comment, 'status', r.status,
      'reasons', r.moderation_reasons, 'updatedAt', r.updated_at, 'businessId', r.business_id,
      'sellerName', coalesce(s.display_name, b.name)
    ) order by r.updated_at desc)
    from public.seller_reviews r
    join public.businesses b on b.id = r.business_id
    left join public.seller_profiles s on s.business_id = r.business_id
    where r.status = p_status
  ), '[]'::jsonb);
end;
$$;

-- Fiche d’annonce : note du vendeur en plus.
create or replace function private.listing_card(l public.listings, p public.products, b public.businesses, s public.seller_profiles, p_city_key text) returns jsonb
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
  ) || (select jsonb_build_object('sellerRating', rating -> 'rating', 'sellerReviews', rating -> 'reviewCount') from private.seller_rating(l.business_id) rating);
$$;

-- Statistiques publiques d’un vendeur.
create function private.seller_stats(s public.seller_profiles) returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.seller_rating(s.business_id) || jsonb_build_object(
    'memberSince', s.created_at,
    'activeListings', (
      select count(*) from public.listings l join public.products p on p.id = l.product_id
      where l.business_id = s.business_id and l.status = 'published' and not p.archived and p.quantity > 0
    )
  );
$$;

create or replace function public.marketplace_seller(p_business_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'seller', jsonb_build_object('id', s.business_id, 'name', s.display_name, 'city', s.city, 'whatsapp', s.whatsapp, 'phone', s.phone,
      'verified', s.verified, 'deliversEverywhere', s.delivers_everywhere, 'deliveryCities', s.delivery_cities, 'description', s.description,
      'stats', private.seller_stats(s)),
    'listings', coalesce((
      select jsonb_agg(private.listing_card(l, p, b, s, null) order by l.published_at desc)
      from public.listings l
      join public.products p on p.id = l.product_id
      join public.businesses b on b.id = l.business_id
      where l.business_id = s.business_id and l.status = 'published' and not p.archived and p.quantity > 0
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment, 'createdAt', r.created_at, 'updatedAt', r.updated_at) order by r.updated_at desc)
      from (select * from public.seller_reviews where business_id = s.business_id and status = 'published' order by updated_at desc limit 30) r
    ), '[]'::jsonb)
  )
  from public.seller_profiles s
  where s.business_id = p_business_id and s.active;
$$;

create or replace function public.marketplace_listing(p_listing_id uuid) returns jsonb
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
      'verified', s.verified, 'deliversEverywhere', s.delivers_everywhere, 'deliveryCities', s.delivery_cities, 'description', s.description,
      'stats', private.seller_stats(s))
  )
  from public.listings l
  join public.products p on p.id = l.product_id
  join public.businesses b on b.id = l.business_id
  join public.seller_profiles s on s.business_id = l.business_id
  where l.id = p_listing_id and l.status = 'published' and s.active and not p.archived;
$$;

revoke execute on function private.seller_rating(uuid) from public, anon, authenticated;
revoke execute on function private.seller_stats(public.seller_profiles) from public, anon, authenticated;
revoke execute on function public.save_seller_review(uuid, integer, text) from public, anon;
grant execute on function public.save_seller_review(uuid, integer, text) to authenticated;
revoke execute on function public.moderate_review(text, uuid, integer, text, text[], text) from public;
revoke execute on function public.review_queue(text, text) from public;
grant execute on function public.moderate_review(text, uuid, integer, text, text[], text) to anon, authenticated;
grant execute on function public.review_queue(text, text) to anon, authenticated;
