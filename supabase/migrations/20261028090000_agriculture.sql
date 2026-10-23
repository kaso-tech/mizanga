-- Gilli — Espace Business, onglet Agriculture : parcelles, cultures par saison, journal (travaux,
-- intrants, frais, récoltes, ventes, consommation, pertes), travaux prévus avec rappels, résultats.
--
-- Règles :
-- * une surface est enregistrée en m² (entier) ; l’unité choisie (ha ou m²) sert à l’affichage ;
-- * les quantités récoltées, vendues, consommées ou perdues sont converties en kg (sac, cageot ou panier :
--   poids d’une unité indiqué par l’agriculteur) ; le stock de récolte d’une culture ne change que par le
--   journal (fonctions record_farm_operation et cancel_farm_operation) et n’est jamais négatif ;
-- * résultats d’une culture (déterministes, en entiers dans la devise de l’entreprise) :
--   rendement = kg récoltés ÷ surface cultivée en hectares, arrondi au kg ;
--   coûts = intrants + main-d’œuvre (travaux) + location (terre, matériel) + autres frais ;
--   marge estimée = ventes de récolte − coûts. La récolte encore en stock est indiquée en kg, sans
--   valeur en francs. Ce n’est pas un résultat comptable ou fiscal certifié ;
-- * ces résultats restent séparés de ceux du Commerce et de l’Élevage.

create table public.farm_plots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  location text check (char_length(location) <= 80),
  area_m2 bigint not null check (area_m2 between 1 and 100000000000),
  area_unit text not null default 'ha' check (area_unit in ('ha', 'm2')),
  tenure text not null default 'owned' check (tenure in ('owned', 'rented', 'lent')),
  note text check (char_length(note) <= 500),
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index farm_plots_business_idx on public.farm_plots (business_id, archived, name);
create trigger farm_plots_updated_at before update on public.farm_plots for each row execute function public.set_updated_at();

create table public.farm_crops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plot_id uuid not null references public.farm_plots (id) on delete cascade,
  crop text not null check (crop in ('maize', 'sorghum', 'millet', 'rice', 'cowpea', 'groundnut', 'soybean', 'cotton', 'sesame', 'onion', 'tomato', 'cabbage', 'pepper', 'other')),
  -- Nom affiché : celui de la liste, ou celui donné par l’agriculteur pour « Autre ».
  crop_label text not null check (char_length(btrim(crop_label)) between 1 and 60),
  season text not null check (season in ('rainy', 'dry')),
  year integer not null check (year between 2000 and 2100),
  area_m2 bigint not null check (area_m2 between 1 and 100000000000),
  sown_on date,
  expected_harvest_on date,
  status text not null default 'active' check (status in ('active', 'closed')),
  harvested_kg numeric(14, 3) not null default 0 check (harvested_kg >= 0),
  stock_kg numeric(14, 3) not null default 0 check (stock_kg >= 0),
  note text check (char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index farm_crops_business_idx on public.farm_crops (business_id, year desc, status);
create trigger farm_crops_updated_at before update on public.farm_crops for each row execute function public.set_updated_at();

create table public.farm_operations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  crop_id uuid not null references public.farm_crops (id) on delete cascade,
  kind text not null check (kind in ('work', 'input', 'rental', 'expense', 'harvest', 'sale', 'consumption', 'loss')),
  work_type text check (work_type in ('soil_prep', 'sowing', 'weeding', 'fertilizing', 'treatment', 'irrigation', 'harvesting', 'other')),
  input_type text check (input_type in ('seed', 'fertilizer', 'manure', 'treatment_product', 'other')),
  label text check (char_length(label) <= 120),
  -- Quantité saisie et son unité (intrants : kg, sac, litre… ; récolte et sorties : kg, tonne, sac…).
  quantity numeric(14, 3) check (quantity >= 0),
  unit text check (char_length(unit) <= 20),
  -- Récolte et sorties : quantité convertie en kg, et variation du stock de récolte.
  quantity_kg numeric(14, 3) not null default 0 check (quantity_kg >= 0),
  stock_delta numeric(14, 3) not null default 0,
  amount bigint not null default 0 check (amount between 0 and 1000000000000),
  note text check (char_length(note) <= 500),
  occurred_on date not null,
  status text not null default 'recorded' check (status in ('recorded', 'cancelled')),
  cancel_reason text check (char_length(cancel_reason) <= 500),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index farm_operations_business_idx on public.farm_operations (business_id, occurred_on desc, created_at desc);
create index farm_operations_crop_idx on public.farm_operations (crop_id);

create table public.farm_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  crop_id uuid not null references public.farm_crops (id) on delete cascade,
  work_type text not null check (work_type in ('soil_prep', 'sowing', 'weeding', 'fertilizing', 'treatment', 'irrigation', 'harvesting', 'other')),
  label text check (char_length(label) <= 120),
  due_on date not null,
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  done_on date,
  operation_id uuid references public.farm_operations (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'done' or done_on is not null)
);
create index farm_tasks_business_idx on public.farm_tasks (business_id, status, due_on);
create trigger farm_tasks_updated_at before update on public.farm_tasks for each row execute function public.set_updated_at();

-- Lecture pour les membres ; parcelles, cultures et rappels modifiables par les membres (colonnes
-- autorisées) ; journal et stock de récolte uniquement par les fonctions ci-dessous.
revoke all on public.farm_plots, public.farm_crops, public.farm_operations, public.farm_tasks from anon, authenticated;
grant select on public.farm_plots, public.farm_crops, public.farm_operations, public.farm_tasks to authenticated;
grant insert (business_id, name, location, area_m2, area_unit, tenure, note) on public.farm_plots to authenticated;
grant update (name, location, area_m2, area_unit, tenure, note, archived) on public.farm_plots to authenticated;
grant insert (business_id, plot_id, crop, crop_label, season, year, area_m2, sown_on, expected_harvest_on, note) on public.farm_crops to authenticated;
grant update (crop_label, area_m2, sown_on, expected_harvest_on, status, note) on public.farm_crops to authenticated;
grant insert (business_id, crop_id, work_type, label, due_on) on public.farm_tasks to authenticated;
grant update (label, due_on, status) on public.farm_tasks to authenticated;
alter table public.farm_plots enable row level security;
alter table public.farm_crops enable row level security;
alter table public.farm_operations enable row level security;
alter table public.farm_tasks enable row level security;

create policy "parcelles : lecture par les membres" on public.farm_plots for select to authenticated using (public.is_business_member(business_id));
create policy "parcelles : ajout par les membres" on public.farm_plots for insert to authenticated with check (public.is_business_member(business_id));
create policy "parcelles : modification par les membres" on public.farm_plots for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "cultures : lecture par les membres" on public.farm_crops for select to authenticated using (public.is_business_member(business_id));
create policy "cultures : ajout par les membres" on public.farm_crops for insert to authenticated
  with check (public.is_business_member(business_id) and exists (select 1 from public.farm_plots p where p.id = plot_id and p.business_id = farm_crops.business_id and not p.archived));
create policy "cultures : modification par les membres" on public.farm_crops for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "journal agricole : lecture par les membres" on public.farm_operations for select to authenticated using (public.is_business_member(business_id));
create policy "travaux prévus : lecture par les membres" on public.farm_tasks for select to authenticated using (public.is_business_member(business_id));
create policy "travaux prévus : ajout par les membres" on public.farm_tasks for insert to authenticated
  with check (public.is_business_member(business_id) and exists (select 1 from public.farm_crops c where c.id = crop_id and c.business_id = farm_tasks.business_id));
create policy "travaux prévus : modification par les membres" on public.farm_tasks for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

-- Une culture ne peut pas occuper plus que la surface de sa parcelle.
create function public.check_crop_area() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plot_area bigint;
begin
  select area_m2 into v_plot_area from public.farm_plots where id = new.plot_id;
  if new.area_m2 > v_plot_area then
    raise exception 'La surface cultivée dépasse celle de la parcelle.' using errcode = 'GL422';
  end if;
  return new;
end;
$$;
create trigger farm_crops_area before insert or update of area_m2 on public.farm_crops for each row execute function public.check_crop_area();

-- Enregistre une opération du journal et met à jour le stock de récolte dans la même opération.
-- Récolte et sorties : p_quantity dans l’unité p_unit (kg, tonne, ou sac, cageot, panier de p_unit_kg kg).
create function public.record_farm_operation(
  p_business_id uuid,
  p_crop_id uuid,
  p_kind text,
  p_quantity numeric default null,
  p_unit text default null,
  p_unit_kg numeric default null,
  p_amount bigint default 0,
  p_occurred_on date default null,
  p_work_type text default null,
  p_input_type text default null,
  p_label text default null,
  p_note text default null
) returns public.farm_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crop public.farm_crops;
  v_operation public.farm_operations;
  v_today date;
  v_amount bigint := coalesce(p_amount, 0);
  v_kg numeric := 0;
  v_delta numeric := 0;
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  select * into v_crop from public.farm_crops where id = p_crop_id and business_id = p_business_id for update;
  if not found then
    raise exception 'Culture introuvable.' using errcode = 'GL403';
  end if;
  if p_kind is null or p_kind not in ('work', 'input', 'rental', 'expense', 'harvest', 'sale', 'consumption', 'loss') then
    raise exception 'Type d’opération inconnu.' using errcode = 'GL422';
  end if;
  if v_crop.status = 'closed' and p_kind not in ('sale', 'consumption', 'loss') then
    raise exception 'La culture « % » est clôturée : seules les sorties du stock restent possibles.', v_crop.crop_label using errcode = 'GL410';
  end if;
  if v_amount < 0 or v_amount > 1000000000000 then
    raise exception 'Montant invalide.' using errcode = 'GL422';
  end if;
  if p_quantity is not null and (p_quantity < 0 or p_quantity > 100000000000 or round(p_quantity, 3) <> p_quantity) then
    raise exception 'La quantité doit être un nombre positif (trois décimales au plus).' using errcode = 'GL422';
  end if;
  if p_label is not null and char_length(p_label) > 120 or p_note is not null and char_length(p_note) > 500 or v_unit is not null and char_length(v_unit) > 20 then
    raise exception 'Un texte est trop long.' using errcode = 'GL422';
  end if;
  v_today := public.business_today(p_business_id);
  if p_occurred_on is not null and p_occurred_on > v_today then
    raise exception 'La date ne peut pas être dans le futur.' using errcode = 'GL422';
  end if;

  if p_kind in ('harvest', 'sale', 'consumption', 'loss') then
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'Indiquez la quantité.' using errcode = 'GL422';
    end if;
    v_unit := coalesce(v_unit, 'kg');
    if v_unit = 'kg' then
      v_kg := p_quantity;
    elsif v_unit = 'tonne' then
      v_kg := p_quantity * 1000;
    elsif v_unit in ('sac', 'cageot', 'panier') then
      if p_unit_kg is null or p_unit_kg <= 0 or p_unit_kg > 1000 then
        raise exception 'Indiquez le poids d’un % en kg.', v_unit using errcode = 'GL422';
      end if;
      v_kg := round(p_quantity * p_unit_kg, 3);
    else
      raise exception 'Unité de récolte inconnue.' using errcode = 'GL422';
    end if;
    v_delta := case when p_kind = 'harvest' then v_kg else -v_kg end;
    if v_crop.stock_kg + v_delta < 0 then
      raise exception 'Stock de récolte insuffisant pour « % » : il reste % kg.', v_crop.crop_label, trim(trailing '.' from trim(trailing '0' from v_crop.stock_kg::text)) using errcode = 'GL409';
    end if;
    if p_kind <> 'sale' then
      v_amount := 0;
    end if;
  elsif p_kind = 'work' then
    if p_work_type is null or p_work_type not in ('soil_prep', 'sowing', 'weeding', 'fertilizing', 'treatment', 'irrigation', 'harvesting', 'other') then
      raise exception 'Choisissez le type de travail.' using errcode = 'GL422';
    end if;
  elsif p_kind = 'input' then
    if p_input_type is null or p_input_type not in ('seed', 'fertilizer', 'manure', 'treatment_product', 'other') then
      raise exception 'Choisissez le type d’intrant.' using errcode = 'GL422';
    end if;
  elsif v_amount <= 0 then
    raise exception 'Indiquez le montant de la dépense.' using errcode = 'GL422';
  end if;

  update public.farm_crops set
    stock_kg = stock_kg + v_delta,
    harvested_kg = harvested_kg + case when p_kind = 'harvest' then v_kg else 0 end
  where id = p_crop_id;

  insert into public.farm_operations (business_id, crop_id, kind, work_type, input_type, label, quantity, unit, quantity_kg, stock_delta, amount, note, occurred_on, created_by)
  values (p_business_id, p_crop_id, p_kind,
    case when p_kind = 'work' then p_work_type end,
    case when p_kind = 'input' then p_input_type end,
    nullif(btrim(p_label), ''), p_quantity, v_unit, v_kg, v_delta, v_amount,
    nullif(btrim(p_note), ''), coalesce(p_occurred_on, v_today), auth.uid())
  returning * into v_operation;
  return v_operation;
end;
$$;

-- Annule une opération (propriétaire) : le stock de récolte revient, l’opération reste visible.
create function public.cancel_farm_operation(p_business_id uuid, p_operation_id uuid, p_reason text default null) returns public.farm_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.farm_operations;
  v_crop public.farm_crops;
begin
  if auth.uid() is null or not public.is_business_owner(p_business_id) then
    raise exception 'Seul le propriétaire peut annuler une opération.' using errcode = 'GL403';
  end if;
  select * into v_operation from public.farm_operations where id = p_operation_id and business_id = p_business_id for update;
  if not found then
    raise exception 'Opération introuvable.' using errcode = 'GL403';
  end if;
  if v_operation.status = 'cancelled' then
    raise exception 'Cette opération est déjà annulée.' using errcode = 'GL409';
  end if;
  select * into v_crop from public.farm_crops where id = v_operation.crop_id for update;
  if v_crop.stock_kg - v_operation.stock_delta < 0 then
    raise exception 'Annulation impossible : une partie de cette récolte est déjà sortie du stock.' using errcode = 'GL409';
  end if;
  update public.farm_crops set
    stock_kg = stock_kg - v_operation.stock_delta,
    harvested_kg = harvested_kg - case when v_operation.kind = 'harvest' then v_operation.quantity_kg else 0 end
  where id = v_operation.crop_id;
  update public.farm_operations set status = 'cancelled', cancel_reason = nullif(btrim(left(p_reason, 500)), '') where id = p_operation_id returning * into v_operation;
  return v_operation;
end;
$$;

-- Travail prévu marqué comme fait : il entre au journal (avec la main-d’œuvre payée, s’il y en a).
create function public.complete_farm_task(p_business_id uuid, p_task_id uuid, p_done_on date default null, p_amount bigint default 0) returns public.farm_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.farm_tasks;
  v_operation public.farm_operations;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  select * into v_task from public.farm_tasks where id = p_task_id and business_id = p_business_id for update;
  if not found then
    raise exception 'Travail introuvable.' using errcode = 'GL403';
  end if;
  if v_task.status <> 'planned' then
    raise exception 'Ce travail n’est plus prévu.' using errcode = 'GL409';
  end if;
  v_operation := public.record_farm_operation(p_business_id, v_task.crop_id, 'work', null, null, null, coalesce(p_amount, 0), p_done_on, v_task.work_type, null, v_task.label, null);
  update public.farm_tasks set status = 'done', done_on = v_operation.occurred_on, operation_id = v_operation.id where id = p_task_id returning * into v_task;
  return v_task;
end;
$$;

-- Résultats des cultures d’une année (toutes saisons), opérations non annulées.
create function public.farm_crop_results(p_business_id uuid, p_year integer)
returns table (
  crop_id uuid,
  crop text,
  crop_label text,
  plot_id uuid,
  plot_name text,
  season text,
  year integer,
  status text,
  area_m2 bigint,
  harvested_kg numeric,
  yield_kg_per_ha bigint,
  sold_kg numeric,
  consumed_kg numeric,
  lost_kg numeric,
  stock_kg numeric,
  input_cost bigint,
  labour_cost bigint,
  rental_cost bigint,
  other_cost bigint,
  total_cost bigint,
  sales_revenue bigint,
  estimated_margin bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'Année invalide.' using errcode = 'GL422';
  end if;

  return query
  with o as (
    select op.crop_id,
      coalesce(sum(op.quantity_kg) filter (where op.kind = 'harvest'), 0) as harvested,
      coalesce(sum(op.quantity_kg) filter (where op.kind = 'sale'), 0) as sold,
      coalesce(sum(op.quantity_kg) filter (where op.kind = 'consumption'), 0) as consumed,
      coalesce(sum(op.quantity_kg) filter (where op.kind = 'loss'), 0) as lost,
      coalesce(sum(op.amount) filter (where op.kind = 'input'), 0)::bigint as inputs,
      coalesce(sum(op.amount) filter (where op.kind = 'work'), 0)::bigint as labour,
      coalesce(sum(op.amount) filter (where op.kind = 'rental'), 0)::bigint as rental,
      coalesce(sum(op.amount) filter (where op.kind = 'expense'), 0)::bigint as other,
      coalesce(sum(op.amount) filter (where op.kind = 'sale'), 0)::bigint as revenue
    from public.farm_operations op
    where op.business_id = p_business_id and op.status = 'recorded'
    group by op.crop_id
  )
  select c.id, c.crop, c.crop_label, p.id, p.name, c.season, c.year, c.status, c.area_m2,
    coalesce(o.harvested, 0), round(coalesce(o.harvested, 0) * 10000 / c.area_m2)::bigint,
    coalesce(o.sold, 0), coalesce(o.consumed, 0), coalesce(o.lost, 0), c.stock_kg,
    coalesce(o.inputs, 0), coalesce(o.labour, 0), coalesce(o.rental, 0), coalesce(o.other, 0),
    (coalesce(o.inputs, 0) + coalesce(o.labour, 0) + coalesce(o.rental, 0) + coalesce(o.other, 0))::bigint,
    coalesce(o.revenue, 0),
    (coalesce(o.revenue, 0) - coalesce(o.inputs, 0) - coalesce(o.labour, 0) - coalesce(o.rental, 0) - coalesce(o.other, 0))::bigint
  from public.farm_crops c
  join public.farm_plots p on p.id = c.plot_id
  left join o on o.crop_id = c.id
  where c.business_id = p_business_id and c.year = p_year
  order by c.season, p.name, c.crop_label;
end;
$$;

revoke execute on function public.check_crop_area() from public, anon, authenticated;
revoke execute on function public.record_farm_operation(uuid, uuid, text, numeric, text, numeric, bigint, date, text, text, text, text) from public, anon;
revoke execute on function public.cancel_farm_operation(uuid, uuid, text) from public, anon;
revoke execute on function public.complete_farm_task(uuid, uuid, date, bigint) from public, anon;
revoke execute on function public.farm_crop_results(uuid, integer) from public, anon;
grant execute on function public.record_farm_operation(uuid, uuid, text, numeric, text, numeric, bigint, date, text, text, text, text) to authenticated;
grant execute on function public.cancel_farm_operation(uuid, uuid, text) to authenticated;
grant execute on function public.complete_farm_task(uuid, uuid, date, bigint) to authenticated;
grant execute on function public.farm_crop_results(uuid, integer) to authenticated;
