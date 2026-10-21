-- Gilli — espace Business : schéma, droits et règles RLS.
--
-- Principes :
-- * chaque donnée commerciale appartient à une entreprise (business_id) ; seuls ses membres y accèdent ;
-- * les règles RLS s’appliquent même si le serveur de Gilli se trompait : le serveur interroge la base
--   avec l’identité de l’utilisateur, pas avec la clé « service » ;
-- * les droits SQL (GRANT) limitent en plus les colonnes modifiables : la quantité en stock, les ventes et
--   les mouvements de stock ne s’écrivent qu’à travers des fonctions contrôlées (étapes 3 et 4) ;
-- * les montants sont des entiers dans la devise de l’entreprise (le franc CFA n’a pas de centimes),
--   les quantités des décimaux (kg, litres…).
--
-- Fourni par Supabase (et simulé dans les tests) : le schéma auth, auth.users, auth.uid(),
-- les rôles anon, authenticated et service_role.

-- ---------------------------------------------------------------------------------------------------
-- Outils communs
-- ---------------------------------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Profils (un par compte)
-- ---------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  country_code text not null default 'BF' check (country_code ~ '^[A-Z]{2}$'),
  locale text not null default 'fr' check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profil créé automatiquement à l’inscription.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------------
-- Entreprises et membres
-- ---------------------------------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  country_code text not null default 'BF' check (country_code ~ '^[A-Z]{2}$'),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Ouagadougou' check (char_length(timezone) between 1 and 64),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

create type public.business_role as enum ('owner', 'staff');

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_user_idx on public.business_members (user_id);

-- Fonctions d’appartenance, utilisées par les règles RLS. SECURITY DEFINER évite que la règle de
-- business_members ne se rappelle elle-même ; elles ne révèlent qu’un booléen sur l’utilisateur courant.
create function public.is_business_member(target uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target and m.user_id = auth.uid()
  );
$$;

create function public.is_business_owner(target uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Le créateur d’une entreprise en devient automatiquement propriétaire.
create function public.add_business_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_members (business_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger businesses_add_owner after insert on public.businesses
  for each row execute function public.add_business_owner();

-- ---------------------------------------------------------------------------------------------------
-- Produits et stock
-- ---------------------------------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sku text check (char_length(sku) <= 64),
  unit text not null default 'unité' check (char_length(unit) between 1 and 24),
  -- Modifiée uniquement par les mouvements de stock et les ventes (fonctions des étapes 3 et 4).
  quantity numeric(14, 3) not null default 0 check (quantity >= 0),
  purchase_price bigint not null default 0 check (purchase_price >= 0),
  sale_price bigint not null default 0 check (sale_price >= 0),
  alert_threshold numeric(14, 3) not null default 0 check (alert_threshold >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Permet aux tables liées d’exiger que le produit appartienne à la même entreprise.
  unique (business_id, id)
);

create index products_business_idx on public.products (business_id, archived, name);

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------
-- Ventes
-- ---------------------------------------------------------------------------------------------------

create type public.sale_status as enum ('completed', 'cancelled');

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sold_at timestamptz not null default now(),
  status public.sale_status not null default 'completed',
  -- Totaux figés au moment de la vente (somme des lignes) : chiffre d’affaires et coût des produits vendus.
  total_amount bigint not null default 0 check (total_amount >= 0),
  total_cost bigint not null default 0 check (total_cost >= 0),
  customer_name text check (char_length(customer_name) <= 120),
  note text check (char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create index sales_business_idx on public.sales (business_id, sold_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  -- Prix d’achat figé au moment de la vente : le coût des ventes ne change pas si le prix d’achat change ensuite.
  unit_cost bigint not null check (unit_cost >= 0),
  line_total bigint not null check (line_total >= 0),
  line_cost bigint not null check (line_cost >= 0),
  foreign key (business_id, sale_id) references public.sales (business_id, id) on delete cascade,
  foreign key (business_id, product_id) references public.products (business_id, id)
);

create index sale_items_sale_idx on public.sale_items (sale_id);

-- ---------------------------------------------------------------------------------------------------
-- Journal des mouvements de stock
-- ---------------------------------------------------------------------------------------------------

create type public.stock_movement_kind as enum ('initial', 'purchase', 'sale', 'adjustment', 'return', 'loss', 'sale_cancelled');

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  kind public.stock_movement_kind not null,
  quantity_delta numeric(14, 3) not null check (quantity_delta <> 0),
  unit_cost bigint check (unit_cost >= 0),
  sale_id uuid,
  note text check (char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (business_id, product_id) references public.products (business_id, id) on delete cascade,
  foreign key (business_id, sale_id) references public.sales (business_id, id) on delete cascade
);

create index stock_movements_product_idx on public.stock_movements (business_id, product_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------
-- Dépenses
-- ---------------------------------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount bigint not null check (amount > 0),
  category text not null default 'autre' check (char_length(category) between 1 and 40),
  description text check (char_length(description) <= 500),
  spent_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_business_idx on public.expenses (business_id, spent_at desc);

create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------
-- Consommation de l’IA (limites et coûts par utilisateur) — écrite par le serveur uniquement
-- ---------------------------------------------------------------------------------------------------

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  feature text not null check (feature in ('chat', 'title', 'business_assistant')),
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- Coût estimé en millionièmes de dollar US (prix publics du fournisseur), 0 sur l’offre gratuite.
  estimated_cost_micro_usd bigint not null default 0 check (estimated_cost_micro_usd >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------
-- Formules et abonnements (mode test : aucun paiement) — écrits par le serveur uniquement
-- ---------------------------------------------------------------------------------------------------

create table public.plans (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null,
  monthly_price bigint not null default 0 check (monthly_price >= 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  daily_ai_requests integer not null check (daily_ai_requests >= 0),
  max_businesses integer not null check (max_businesses >= 0),
  is_test boolean not null default true,
  active boolean not null default true
);

-- Formule de test, gratuite ; les vraies formules et leurs prix seront décidés plus tard.
insert into public.plans (id, name, monthly_price, daily_ai_requests, max_businesses, is_test)
values ('test', 'Test (gratuit)', 0, 50, 1, true);

create type public.subscription_status as enum ('test', 'active', 'past_due', 'cancelled');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null default 'test',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------
-- Droits SQL : tout est retiré, puis seul le nécessaire est accordé
-- ---------------------------------------------------------------------------------------------------

revoke all on public.profiles, public.businesses, public.business_members, public.products, public.sales,
  public.sale_items, public.stock_movements, public.expenses, public.ai_usage, public.plans, public.subscriptions
  from anon, authenticated;

-- Fonctions internes (déclencheurs) : appelables par personne. Fonctions d’appartenance : seulement
-- par les utilisateurs connectés, et elles ne renseignent que sur eux-mêmes.
revoke execute on function public.handle_new_user(), public.add_business_owner(), public.set_updated_at()
  from public, anon, authenticated;
revoke execute on function public.is_business_member(uuid), public.is_business_owner(uuid) from public, anon;
grant execute on function public.is_business_member(uuid), public.is_business_owner(uuid) to authenticated;

grant select, update (display_name, country_code, locale) on public.profiles to authenticated;

grant select, delete on public.businesses to authenticated;
grant insert (name, country_code, currency, timezone) on public.businesses to authenticated;
grant update (name, country_code, currency, timezone) on public.businesses to authenticated;

grant select on public.business_members to authenticated;

grant select, delete on public.products to authenticated;
grant insert (business_id, name, sku, unit, purchase_price, sale_price, alert_threshold) on public.products to authenticated;
grant update (name, sku, unit, purchase_price, sale_price, alert_threshold, archived) on public.products to authenticated;

grant select on public.sales, public.sale_items, public.stock_movements to authenticated;

grant select, delete on public.expenses to authenticated;
grant insert (business_id, amount, category, description, spent_at) on public.expenses to authenticated;
grant update (amount, category, description, spent_at) on public.expenses to authenticated;

grant select on public.ai_usage, public.plans, public.subscriptions to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Règles RLS
-- ---------------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.ai_usage enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

create policy "profil : lecture par son titulaire" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profil : modification par son titulaire" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Le créateur voit l’entreprise dès sa création (avant même l’ajout automatique de son rôle).
create policy "entreprise : lecture par ses membres" on public.businesses
  for select to authenticated using (public.is_business_member(id) or created_by = (select auth.uid()));
create policy "entreprise : création à son nom" on public.businesses
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "entreprise : modification par le propriétaire" on public.businesses
  for update to authenticated using (public.is_business_owner(id)) with check (public.is_business_owner(id));
create policy "entreprise : suppression par le propriétaire" on public.businesses
  for delete to authenticated using (public.is_business_owner(id));

create policy "membres : lecture par les membres" on public.business_members
  for select to authenticated using (public.is_business_member(business_id));

create policy "produits : lecture par les membres" on public.products
  for select to authenticated using (public.is_business_member(business_id));
create policy "produits : création par les membres" on public.products
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "produits : modification par les membres" on public.products
  for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "produits : suppression par le propriétaire" on public.products
  for delete to authenticated using (public.is_business_owner(business_id));

create policy "ventes : lecture par les membres" on public.sales
  for select to authenticated using (public.is_business_member(business_id));
create policy "lignes de vente : lecture par les membres" on public.sale_items
  for select to authenticated using (public.is_business_member(business_id));
create policy "mouvements de stock : lecture par les membres" on public.stock_movements
  for select to authenticated using (public.is_business_member(business_id));

create policy "dépenses : lecture par les membres" on public.expenses
  for select to authenticated using (public.is_business_member(business_id));
create policy "dépenses : création par les membres" on public.expenses
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "dépenses : modification par les membres" on public.expenses
  for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "dépenses : suppression par le propriétaire" on public.expenses
  for delete to authenticated using (public.is_business_owner(business_id));

create policy "consommation IA : lecture de la sienne" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

create policy "formules : lecture des formules actives" on public.plans
  for select to authenticated using (active);

create policy "abonnements : lecture par les membres" on public.subscriptions
  for select to authenticated using (public.is_business_member(business_id));
