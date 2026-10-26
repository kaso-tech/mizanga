-- Recherche avancée de la marketplace : tri, vendeurs vérifiés seulement, caractéristiques
-- (« au moins 4 Go de RAM », « double SIM », « 4G ») et annonces publiées après une date (alertes).
-- La fonction remplace marketplace_search ; les anciens paramètres gardent leur sens.

drop function public.marketplace_search(text, text, text, text, bigint, bigint, text, integer, integer);

-- p_attributes : { "clé": { "min": n, "max": n } | true | false | "valeur" }. Une annonce qui n’indique
-- pas la caractéristique ne correspond pas. Les clés sont contrôlées par le serveur (catégorie).
-- p_sort : relevance (ville du client, puis livraison, puis les plus récentes), price_asc, price_desc, recent.
create function public.marketplace_search(
  p_query text default null,
  p_category text default null,
  p_subcategory text default null,
  p_city text default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_condition text default null,
  p_limit integer default 24,
  p_offset integer default 0,
  p_sort text default 'relevance',
  p_verified_only boolean default false,
  p_attributes jsonb default null,
  p_published_after timestamptz default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_terms text[] := array(select term from unnest(string_to_array(public.normalize_text(p_query), ' ')) term where char_length(term) >= 2 limit 8);
  v_city text := nullif(public.normalize_text(p_city), '');
  v_sort text := coalesce(p_sort, 'relevance');
  v_attributes jsonb := case when jsonb_typeof(p_attributes) = 'object' then p_attributes else '{}'::jsonb end;
  v_result jsonb;
begin
  if v_sort not in ('relevance', 'price_asc', 'price_desc', 'recent') then
    raise exception 'Tri inconnu.' using errcode = 'GL422';
  end if;
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
      and (not coalesce(p_verified_only, false) or s.verified)
      and (p_published_after is null or l.published_at > p_published_after)
      and not exists (select 1 from unnest(v_terms) term where position(term in l.search_text) = 0)
      and not exists (
        select 1 from jsonb_each(v_attributes) wanted(key, value)
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
      )
  ), ranked as (
    select private.listing_card(l, p, b, s, v_city) as card,
      (v_city is not null and (s).city_key = v_city) as same_city,
      (v_city is not null and ((s).delivers_everywhere or exists (select 1 from unnest((s).delivery_cities) c where public.normalize_text(c) = v_city))) as delivers,
      (l).published_at as published_at,
      (p).sale_price as price,
      (l).id as id
    from matches
  )
  select jsonb_build_object(
    'total', (select count(*) from ranked),
    'items', coalesce((select jsonb_agg(card order by position) from (
      select card, row_number() over (order by
        case when v_sort = 'price_asc' then price end asc,
        case when v_sort = 'price_desc' then price end desc,
        case when v_sort = 'relevance' then same_city end desc,
        case when v_sort = 'relevance' then delivers end desc,
        published_at desc, id) as position
      from ranked
      order by position
      limit least(greatest(coalesce(p_limit, 24), 1), 60) offset greatest(coalesce(p_offset, 0), 0)
    ) page), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.marketplace_search(text, text, text, text, bigint, bigint, text, integer, integer, text, boolean, jsonb, timestamptz) from public;
grant execute on function public.marketplace_search(text, text, text, text, bigint, bigint, text, integer, integer, text, boolean, jsonb, timestamptz) to anon, authenticated;
