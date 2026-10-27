-- Monétisation : formules Gratuit et Pro pour les commerçants, sponsorisation d’annonces.
--
-- Règles :
-- * la formule « test » devient la formule Gratuit (même identifiant, pour garder les abonnements) ;
--   la formule Pro est payante, au mois. Les limites portent sur les annonces en ligne, les photos par
--   annonce, les questions par jour à l’assistant de l’Espace vendeur et le nombre de commerces ;
-- * une formule Pro dont la période est terminée retombe d’elle-même sur la formule Gratuit (les annonces
--   déjà en ligne y restent, mais aucune nouvelle annonce n’est acceptée au-delà de la limite) ;
-- * paiement par Mobile Money, hors de Gilli pour l’instant : le commerçant envoie la somme au numéro
--   indiqué, puis déclare le paiement (numéro qui a payé, référence de la transaction) ; l’administration
--   le vérifie et le confirme dans la console, ce qui active la formule ou la sponsorisation. Le montant
--   est toujours calculé par la base à partir des tarifs, jamais fourni par l’application ;
-- * une annonce sponsorisée est présentée à part, marquée « Sponsorisé », en tête de la première page
--   des résultats qu’elle satisfait ; elle ne change ni le classement des résultats ni celui de
--   l’assistant d’achat ;
-- * tarifs, limites et numéros de paiement sont modifiables dans la console (clé de modération).

alter table public.plans
  add column max_listings integer not null default 1000 check (max_listings >= 0),
  add column max_photos integer not null default 5 check (max_photos between 1 and 5);

update public.plans set name = 'Gratuit', is_test = false, daily_ai_requests = 30, max_businesses = 1, max_listings = 5, max_photos = 3 where id = 'test';
insert into public.plans (id, name, monthly_price, daily_ai_requests, max_businesses, max_listings, max_photos, is_test)
values ('pro', 'Pro', 5000, 200, 3, 100, 5, false);

-- Formule effective d’un commerce : Pro tant que sa période court, sinon Gratuit.
create function private.business_plan(p_business_id uuid) returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p from public.subscriptions s join public.plans p on p.id = s.plan_id
      where s.business_id = p_business_id and p.active
        and (s.status = 'test' or (s.status = 'active' and (s.current_period_end is null or s.current_period_end > now())))),
    (select p from public.plans p where p.id = 'test')
  );
$$;

create or replace function public.allowed_businesses(p_user_id uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select max((private.business_plan(m.business_id)).max_businesses)
      from public.business_members m where m.user_id = p_user_id and m.role = 'owner'), 0),
    coalesce((select max_businesses from public.plans where id = 'test'), 1)
  );
$$;

create or replace function public.ai_quota(p_business_id uuid, p_feature text default 'business_assistant')
returns table (used integer, daily_limit integer, resets_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_day_start timestamptz;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  select timezone into v_timezone from public.businesses where id = p_business_id;
  v_day_start := date_trunc('day', now() at time zone v_timezone) at time zone v_timezone;
  return query
  select
    (select count(*)::integer from public.ai_usage u
      where u.user_id = auth.uid() and u.feature = p_feature and u.status <> 'failed' and u.created_at >= v_day_start),
    coalesce((private.business_plan(p_business_id)).daily_ai_requests, 0),
    v_day_start + interval '1 day';
end;
$$;

-- Limites de la formule sur les annonces : nombre d’annonces en ligne (ou en cours de contrôle) et
-- photos par annonce. Une annonce déjà en ligne peut toujours être modifiée.
create function private.check_listing_limits() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_active integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_plan := private.business_plan(new.business_id);
  if cardinality(new.photos) > v_plan.max_photos then
    raise exception 'Votre formule % permet % photo(s) par annonce.', v_plan.name, v_plan.max_photos using errcode = 'GL409';
  end if;
  -- Nouvelle annonce, ou annonce retirée ou refusée qui revient : elle compte dans la limite.
  if tg_op = 'INSERT' and exists (select 1 from public.listings where product_id = new.product_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('pending', 'published', 'review') then
    return new;
  end if;
  if new.status not in ('pending', 'published', 'review') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('gilli-listings-' || new.business_id::text));
  select count(*) into v_active from public.listings
  where business_id = new.business_id and status in ('pending', 'published', 'review') and product_id <> new.product_id;
  if v_active >= v_plan.max_listings then
    raise exception 'Votre formule % permet % annonce(s) en ligne : retirez-en une ou passez à la formule Pro.', v_plan.name, v_plan.max_listings using errcode = 'GL409';
  end if;
  return new;
end;
$$;
create trigger listings_plan_limits before insert or update of status, photos on public.listings
  for each row execute function private.check_listing_limits();

-- ---------------------------------------------------------------------------------------------------
-- Sponsorisation et paiements
-- ---------------------------------------------------------------------------------------------------

create table public.sponsor_offers (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  days integer not null check (days between 1 and 365),
  price bigint not null check (price >= 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true
);
insert into public.sponsor_offers (id, days, price) values ('3-jours', 3, 1000), ('7-jours', 7, 2000), ('30-jours', 30, 6000);

-- Numéros Mobile Money où envoyer les paiements (un seul enregistrement).
create table public.payment_settings (
  id boolean primary key default true check (id),
  account_name text not null default '' check (char_length(account_name) <= 80),
  orange_money text check (orange_money ~ '^[0-9]{8,15}$'),
  moov_money text check (moov_money ~ '^[0-9]{8,15}$'),
  instructions text not null default '' check (char_length(instructions) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.payment_settings (id) values (true);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pro', 'sponsor')),
  months integer check (months between 1 and 12),
  offer_id text references public.sponsor_offers (id),
  listing_id uuid references public.listings (id) on delete set null,
  amount bigint not null check (amount >= 0),
  currency text not null,
  method text not null check (method in ('orange_money', 'moov_money')),
  payer_phone text not null check (payer_phone ~ '^[0-9]{8,15}$'),
  reference text not null check (char_length(btrim(reference)) between 4 and 60),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  admin_note text check (char_length(admin_note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((kind = 'pro') = (months is not null)),
  check ((kind = 'sponsor') = (offer_id is not null))
);
create index payments_business_idx on public.payments (business_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at);
-- Une référence de transaction ne sert qu’une fois (sauf si le paiement a été refusé).
create unique index payments_reference_idx on public.payments (method, upper(btrim(reference))) where status <> 'rejected';

create table public.listing_sponsorships (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_at timestamptz not null default now()
);
create index listing_sponsorships_active_idx on public.listing_sponsorships (listing_id, ends_at desc);

revoke all on public.sponsor_offers, public.payment_settings, public.payments, public.listing_sponsorships from anon, authenticated;
grant select on public.sponsor_offers, public.payment_settings, public.payments, public.listing_sponsorships to authenticated;
alter table public.sponsor_offers enable row level security;
alter table public.payment_settings enable row level security;
alter table public.payments enable row level security;
alter table public.listing_sponsorships enable row level security;
create policy "offres : lecture des offres actives" on public.sponsor_offers for select to authenticated using (active);
create policy "paiement : lecture des numéros" on public.payment_settings for select to authenticated using (true);
create policy "paiements : lecture par les membres" on public.payments for select to authenticated using (public.is_business_member(business_id));
create policy "sponsorisations : lecture par les membres" on public.listing_sponsorships for select to authenticated using (public.is_business_member(business_id));

-- Déclaration d’un paiement par le propriétaire du commerce. Le montant vient des tarifs.
create function public.request_payment(
  p_business_id uuid,
  p_kind text,
  p_months integer,
  p_offer_id text,
  p_listing_id uuid,
  p_method text,
  p_payer_phone text,
  p_reference text
) returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_amount bigint;
  v_currency text;
begin
  if auth.uid() is null or not public.is_business_owner(p_business_id) then
    raise exception 'Seul le propriétaire du commerce peut payer.' using errcode = 'GL403';
  end if;
  if p_method not in ('orange_money', 'moov_money') then
    raise exception 'Moyen de paiement inconnu.' using errcode = 'GL422';
  end if;
  if p_payer_phone is null or p_payer_phone !~ '^[0-9]{8,15}$' then
    raise exception 'Numéro qui a payé invalide.' using errcode = 'GL422';
  end if;
  if char_length(btrim(coalesce(p_reference, ''))) not between 4 and 60 then
    raise exception 'Indiquez la référence de la transaction reçue par SMS.' using errcode = 'GL422';
  end if;
  if exists (select 1 from public.payments where method = p_method and upper(btrim(reference)) = upper(btrim(p_reference)) and status <> 'rejected') then
    raise exception 'Cette référence de transaction a déjà été déclarée.' using errcode = 'GL409';
  end if;
  if p_kind = 'pro' then
    if p_months is null or p_months not between 1 and 12 then
      raise exception 'Durée invalide.' using errcode = 'GL422';
    end if;
    select monthly_price * p_months, currency into v_amount, v_currency from public.plans where id = 'pro' and active;
    if v_amount is null then
      raise exception 'La formule Pro n’est pas disponible.' using errcode = 'GL422';
    end if;
    if exists (select 1 from public.payments where business_id = p_business_id and kind = 'pro' and status = 'pending') then
      raise exception 'Un paiement pour la formule Pro est déjà en cours de vérification.' using errcode = 'GL409';
    end if;
  elsif p_kind = 'sponsor' then
    select price, currency into v_amount, v_currency from public.sponsor_offers where id = p_offer_id and active;
    if v_amount is null then
      raise exception 'Offre de sponsorisation inconnue.' using errcode = 'GL422';
    end if;
    if not exists (select 1 from public.listings where id = p_listing_id and business_id = p_business_id and status = 'published') then
      raise exception 'Seule une annonce en ligne peut être sponsorisée.' using errcode = 'GL422';
    end if;
    if exists (select 1 from public.payments where listing_id = p_listing_id and kind = 'sponsor' and status = 'pending') then
      raise exception 'Une sponsorisation de cette annonce est déjà en cours de vérification.' using errcode = 'GL409';
    end if;
  else
    raise exception 'Type de paiement inconnu.' using errcode = 'GL422';
  end if;
  insert into public.payments (business_id, user_id, kind, months, offer_id, listing_id, amount, currency, method, payer_phone, reference)
  values (p_business_id, auth.uid(), p_kind, case when p_kind = 'pro' then p_months end, case when p_kind = 'sponsor' then p_offer_id end,
    case when p_kind = 'sponsor' then p_listing_id end, v_amount, v_currency, p_method, p_payer_phone, btrim(p_reference))
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Décision de l’administration : un paiement confirmé active la formule Pro (prolongée à partir de la
-- fin de la période en cours) ou la sponsorisation (à la suite d’une sponsorisation encore active).
create function public.decide_payment(p_key text, p_payment_id uuid, p_status text, p_note text default null) returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_days integer;
  v_start timestamptz;
begin
  perform private.check_moderation_key(p_key);
  if p_status not in ('confirmed', 'rejected') then
    raise exception 'Décision invalide.' using errcode = 'GL422';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable.' using errcode = 'GL403';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Ce paiement a déjà été traité.' using errcode = 'GL409';
  end if;
  update public.payments set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), ''), decided_at = now()
  where id = p_payment_id returning * into v_payment;
  if p_status = 'confirmed' and v_payment.kind = 'pro' then
    update public.subscriptions set
      plan_id = 'pro',
      status = 'active',
      current_period_end = greatest(now(), case when plan_id = 'pro' and status = 'active' then coalesce(current_period_end, now()) else now() end)
        + make_interval(months => v_payment.months)
    where business_id = v_payment.business_id;
  elsif p_status = 'confirmed' and v_payment.kind = 'sponsor' and v_payment.listing_id is not null then
    select days into v_days from public.sponsor_offers where id = v_payment.offer_id;
    select greatest(now(), coalesce(max(ends_at), now())) into v_start from public.listing_sponsorships where listing_id = v_payment.listing_id;
    insert into public.listing_sponsorships (listing_id, business_id, payment_id, starts_at, ends_at)
    values (v_payment.listing_id, v_payment.business_id, v_payment.id, v_start, v_start + make_interval(days => v_days));
  end if;
  return v_payment;
end;
$$;

-- Paiements à vérifier (console), avec le commerce et l’annonce concernés.
create function public.payment_queue(p_key text, p_status text) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_moderation_key(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pay.id, 'kind', pay.kind, 'months', pay.months, 'offerId', pay.offer_id, 'days', o.days, 'amount', pay.amount, 'currency', pay.currency,
      'method', pay.method, 'payerPhone', pay.payer_phone, 'reference', pay.reference, 'status', pay.status, 'adminNote', pay.admin_note,
      'createdAt', pay.created_at, 'decidedAt', pay.decided_at, 'businessId', pay.business_id, 'businessName', b.name,
      'listingTitle', l.title
    ) order by pay.created_at)
    from (select * from public.payments where status = p_status order by created_at desc limit 200) pay
    join public.businesses b on b.id = pay.business_id
    left join public.sponsor_offers o on o.id = pay.offer_id
    left join public.listings l on l.id = pay.listing_id
  ), '[]'::jsonb);
end;
$$;

-- Tarifs et numéros de paiement (console) : lecture et modification.
create function public.pricing(p_key text) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_moderation_key(p_key);
  return jsonb_build_object(
    'plans', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'monthlyPrice', monthly_price, 'currency', currency, 'dailyAiRequests', daily_ai_requests,
      'maxBusinesses', max_businesses, 'maxListings', max_listings, 'maxPhotos', max_photos, 'active', active) order by monthly_price) from public.plans where id in ('test', 'pro')),
    'offers', (select jsonb_agg(jsonb_build_object('id', id, 'days', days, 'price', price, 'currency', currency, 'active', active) order by days) from public.sponsor_offers),
    'settings', (select jsonb_build_object('accountName', account_name, 'orangeMoney', orange_money, 'moovMoney', moov_money, 'instructions', instructions) from public.payment_settings)
  );
end;
$$;

create function public.save_pricing(p_key text, p_pricing jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_offer jsonb;
begin
  perform private.check_moderation_key(p_key);
  for v_plan in select * from jsonb_array_elements(coalesce(p_pricing -> 'plans', '[]')) loop
    update public.plans set
      monthly_price = case when id = 'test' then 0 else (v_plan ->> 'monthlyPrice')::bigint end,
      daily_ai_requests = (v_plan ->> 'dailyAiRequests')::integer,
      max_businesses = (v_plan ->> 'maxBusinesses')::integer,
      max_listings = (v_plan ->> 'maxListings')::integer,
      max_photos = (v_plan ->> 'maxPhotos')::integer
    where id = v_plan ->> 'id' and id in ('test', 'pro');
  end loop;
  for v_offer in select * from jsonb_array_elements(coalesce(p_pricing -> 'offers', '[]')) loop
    update public.sponsor_offers set price = (v_offer ->> 'price')::bigint, active = coalesce((v_offer ->> 'active')::boolean, active)
    where id = v_offer ->> 'id';
  end loop;
  if p_pricing ? 'settings' then
    update public.payment_settings set
      account_name = btrim(coalesce(p_pricing -> 'settings' ->> 'accountName', '')),
      orange_money = nullif(p_pricing -> 'settings' ->> 'orangeMoney', ''),
      moov_money = nullif(p_pricing -> 'settings' ->> 'moovMoney', ''),
      instructions = btrim(coalesce(p_pricing -> 'settings' ->> 'instructions', '')),
      updated_at = now();
  end if;
  return public.pricing(p_key);
end;
$$;

-- Formule, limites, consommation, et ce que le commerçant peut acheter.
create or replace function public.business_subscription(p_business_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  v_plan := private.business_plan(p_business_id);
  select jsonb_build_object(
    'planId', v_plan.id,
    'planName', v_plan.name,
    'isTest', v_plan.is_test,
    'status', case when v_plan.id = 'pro' then 'active' else 'test' end,
    'monthlyPrice', v_plan.monthly_price,
    'currency', v_plan.currency,
    'dailyAiRequests', v_plan.daily_ai_requests,
    'maxBusinesses', public.allowed_businesses(auth.uid()),
    'maxListings', v_plan.max_listings,
    'maxPhotos', v_plan.max_photos,
    'activeListings', (select count(*) from public.listings where business_id = p_business_id and status in ('pending', 'published', 'review')),
    'currentPeriodEnd', case when v_plan.id = 'pro' then s.current_period_end end,
    'aiUsedToday', (select q.used from public.ai_quota(p_business_id) q),
    'plans', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'monthlyPrice', p.monthly_price, 'currency', p.currency, 'dailyAiRequests', p.daily_ai_requests,
      'maxBusinesses', p.max_businesses, 'maxListings', p.max_listings, 'maxPhotos', p.max_photos) order by p.monthly_price) from public.plans p where p.id in ('test', 'pro') and p.active),
    'offers', (select jsonb_agg(jsonb_build_object('id', o.id, 'days', o.days, 'price', o.price, 'currency', o.currency) order by o.days) from public.sponsor_offers o where o.active),
    'payment', (select jsonb_build_object('accountName', ps.account_name, 'orangeMoney', ps.orange_money, 'moovMoney', ps.moov_money, 'instructions', ps.instructions) from public.payment_settings ps),
    'payments', (select jsonb_agg(jsonb_build_object('id', pay.id, 'kind', pay.kind, 'months', pay.months, 'offerId', pay.offer_id, 'listingId', pay.listing_id,
      'amount', pay.amount, 'currency', pay.currency, 'method', pay.method, 'reference', pay.reference, 'status', pay.status, 'adminNote', pay.admin_note,
      'createdAt', pay.created_at) order by pay.created_at desc) from (select * from public.payments where business_id = p_business_id order by created_at desc limit 20) pay),
    'sponsorships', (select jsonb_agg(jsonb_build_object('listingId', sp.listing_id, 'startsAt', sp.starts_at, 'endsAt', sp.ends_at) order by sp.ends_at desc)
      from public.listing_sponsorships sp where sp.business_id = p_business_id and sp.ends_at > now())
  ) into v_result
  from public.subscriptions s
  where s.business_id = p_business_id;
  if v_result is null then
    raise exception 'Aucun abonnement pour ce commerce.' using errcode = 'GL403';
  end if;
  return v_result;
end;
$$;

-- Recherche : les annonces sponsorisées qui satisfont la recherche sont données à part (2 au plus, en
-- première page), dans un ordre qui tourne ; les résultats eux-mêmes ne changent pas.
create or replace function public.marketplace_search(
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
    ) page), '[]'::jsonb),
    'sponsored', case when coalesce(p_offset, 0) = 0 and p_published_after is null then coalesce((
      select jsonb_agg(card) from (
        select r.card from ranked r
        where exists (select 1 from public.listing_sponsorships sp where sp.listing_id = r.id and sp.starts_at <= now() and sp.ends_at > now())
        order by md5(r.id::text || to_char(now(), 'YYYYMMDDHH24'))
        limit 2
      ) chosen
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function private.business_plan(uuid) from public, anon, authenticated;
revoke execute on function private.check_listing_limits() from public, anon, authenticated;
revoke execute on function public.request_payment(uuid, text, integer, text, uuid, text, text, text) from public, anon;
grant execute on function public.request_payment(uuid, text, integer, text, uuid, text, text, text) to authenticated;
revoke execute on function public.decide_payment(text, uuid, text, text) from public;
revoke execute on function public.payment_queue(text, text) from public;
revoke execute on function public.pricing(text) from public;
revoke execute on function public.save_pricing(text, jsonb) from public;
grant execute on function public.decide_payment(text, uuid, text, text) to anon, authenticated;
grant execute on function public.payment_queue(text, text) to anon, authenticated;
grant execute on function public.pricing(text) to anon, authenticated;
grant execute on function public.save_pricing(text, jsonb) to anon, authenticated;
