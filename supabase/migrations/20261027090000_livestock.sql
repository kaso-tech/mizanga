-- Gilli — Espace Business, onglet Élevage : lots et troupeaux, animaux suivis un par un, journal,
-- santé (vaccins, traitements, rappels) et résultats par lot.
--
-- Règles :
-- * l’effectif d’un lot ne change que par le journal (fonctions record_livestock_event et
--   cancel_livestock_event) : naissance et achat l’augmentent, vente et mortalité le diminuent,
--   l’inventaire le corrige ; il n’est jamais négatif ;
-- * un lot « individuel » (bovins le plus souvent) suit chaque animal par son numéro : chaque entrée
--   ou sortie concerne un animal ;
-- * calculs (déterministes, en entiers dans la devise de l’entreprise) sur une période de jours :
--   effectif au début = somme des variations enregistrées avant la période (plus l’effectif de départ
--   d’un lot créé pendant la période) ;
--   taux de mortalité = morts ÷ (effectif au début + naissances + achats) × 100, arrondi à 0,1 ;
--   coûts = achats d’animaux + alimentation + frais de santé (journal et soins faits) + autres frais ;
--   marge estimée = ventes d’animaux − coûts. Ce n’est pas un résultat comptable ou fiscal certifié ;
-- * ces résultats restent séparés de ceux du Commerce.

create table public.livestock_herds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  species text not null check (species in ('poultry', 'small_ruminant', 'cattle', 'pig')),
  tracking text not null default 'group' check (tracking in ('group', 'individual')),
  headcount integer not null default 0 check (headcount >= 0),
  started_on date not null,
  note text check (char_length(note) <= 500),
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index livestock_herds_business_idx on public.livestock_herds (business_id, archived, name);
create trigger livestock_herds_updated_at before update on public.livestock_herds for each row execute function public.set_updated_at();

create table public.livestock_animals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  herd_id uuid not null references public.livestock_herds (id) on delete cascade,
  tag text not null check (char_length(btrim(tag)) between 1 and 40),
  name text check (char_length(name) <= 60),
  sex text not null default 'unknown' check (sex in ('female', 'male', 'unknown')),
  born_on date,
  status text not null default 'present' check (status in ('present', 'sold', 'dead', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Un numéro désigne un seul animal présent ou passé du lot (un animal retiré par annulation libère son numéro).
create unique index livestock_animals_tag_idx on public.livestock_animals (herd_id, lower(btrim(tag))) where status <> 'removed';
create trigger livestock_animals_updated_at before update on public.livestock_animals for each row execute function public.set_updated_at();

create table public.livestock_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  herd_id uuid not null references public.livestock_herds (id) on delete cascade,
  animal_id uuid references public.livestock_animals (id) on delete set null,
  kind text not null check (kind in ('start', 'birth', 'purchase', 'sale', 'death', 'count', 'feed', 'health', 'expense')),
  -- Nombre d’animaux concernés ; pour un inventaire, l’effectif compté.
  quantity integer not null default 0 check (quantity between 0 and 10000000),
  headcount_delta integer not null default 0,
  amount bigint not null default 0 check (amount between 0 and 1000000000000),
  cause text check (char_length(cause) <= 200),
  note text check (char_length(note) <= 500),
  occurred_on date not null,
  status text not null default 'recorded' check (status in ('recorded', 'cancelled')),
  cancel_reason text check (char_length(cancel_reason) <= 500),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index livestock_events_business_idx on public.livestock_events (business_id, occurred_on desc, created_at desc);
create index livestock_events_herd_idx on public.livestock_events (herd_id, occurred_on);

create table public.livestock_health (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  herd_id uuid not null references public.livestock_herds (id) on delete cascade,
  animal_id uuid references public.livestock_animals (id) on delete set null,
  kind text not null check (kind in ('vaccination', 'treatment', 'deworming', 'vet_visit', 'other')),
  product text not null check (char_length(btrim(product)) between 1 and 120),
  due_on date,
  done_on date,
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  cost bigint not null default 0 check (cost between 0 and 1000000000000),
  note text check (char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'planned' or due_on is not null),
  check (status <> 'done' or done_on is not null)
);
create index livestock_health_business_idx on public.livestock_health (business_id, status, due_on);
create trigger livestock_health_updated_at before update on public.livestock_health for each row execute function public.set_updated_at();

-- Lecture pour les membres ; écriture des lots, animaux et journal uniquement par les fonctions ci-dessous.
revoke all on public.livestock_herds, public.livestock_animals, public.livestock_events, public.livestock_health from anon, authenticated;
grant select on public.livestock_herds, public.livestock_animals, public.livestock_events, public.livestock_health to authenticated;
grant update (name, note, archived) on public.livestock_herds to authenticated;
grant update (name, sex, born_on) on public.livestock_animals to authenticated;
grant insert (business_id, herd_id, animal_id, kind, product, due_on, done_on, status, cost, note) on public.livestock_health to authenticated;
grant update (kind, product, due_on, done_on, status, cost, note) on public.livestock_health to authenticated;
alter table public.livestock_herds enable row level security;
alter table public.livestock_animals enable row level security;
alter table public.livestock_events enable row level security;
alter table public.livestock_health enable row level security;

create policy "lots : lecture par les membres" on public.livestock_herds for select to authenticated using (public.is_business_member(business_id));
create policy "lots : modification par les membres" on public.livestock_herds for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "animaux : lecture par les membres" on public.livestock_animals for select to authenticated using (public.is_business_member(business_id));
create policy "animaux : modification par les membres" on public.livestock_animals for update to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "journal d’élevage : lecture par les membres" on public.livestock_events for select to authenticated using (public.is_business_member(business_id));
create policy "soins : lecture par les membres" on public.livestock_health for select to authenticated using (public.is_business_member(business_id));
create policy "soins : ajout par les membres" on public.livestock_health for insert to authenticated
  with check (public.is_business_member(business_id) and exists (select 1 from public.livestock_herds h where h.id = herd_id and h.business_id = livestock_health.business_id)
    and (animal_id is null or exists (select 1 from public.livestock_animals a where a.id = animal_id and a.herd_id = livestock_health.herd_id)));
create policy "soins : modification par les membres" on public.livestock_health for update to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

-- Jour du calendrier local de l’entreprise.
create function public.business_today(p_business_id uuid) returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone b.timezone)::date from public.businesses b where b.id = p_business_id;
$$;

-- Crée un lot (ou troupeau) ; l’effectif de départ d’un lot suivi en groupe entre au journal.
create function public.create_herd(
  p_business_id uuid,
  p_name text,
  p_species text,
  p_tracking text default 'group',
  p_initial_count integer default 0,
  p_started_on date default null,
  p_note text default null
) returns public.livestock_herds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_herd public.livestock_herds;
  v_today date;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Donnez un nom au lot (80 caractères au plus).' using errcode = 'GL422';
  end if;
  if p_species is null or p_species not in ('poultry', 'small_ruminant', 'cattle', 'pig') then
    raise exception 'Choisissez une espèce.' using errcode = 'GL422';
  end if;
  if p_tracking is null or p_tracking not in ('group', 'individual') then
    raise exception 'Choisissez le type de suivi.' using errcode = 'GL422';
  end if;
  if p_initial_count is null or p_initial_count < 0 or p_initial_count > 10000000 then
    raise exception 'L’effectif de départ doit être un nombre entier positif.' using errcode = 'GL422';
  end if;
  if p_tracking = 'individual' and p_initial_count > 0 then
    raise exception 'Dans un suivi individuel, ajoutez chaque animal avec son numéro.' using errcode = 'GL422';
  end if;
  v_today := public.business_today(p_business_id);
  if p_started_on is not null and p_started_on > v_today then
    raise exception 'La date de début ne peut pas être dans le futur.' using errcode = 'GL422';
  end if;

  insert into public.livestock_herds (business_id, name, species, tracking, headcount, started_on, note, created_by)
  values (p_business_id, btrim(p_name), p_species, p_tracking, p_initial_count, coalesce(p_started_on, v_today), nullif(btrim(left(p_note, 500)), ''), auth.uid())
  returning * into v_herd;
  if p_initial_count > 0 then
    insert into public.livestock_events (business_id, herd_id, kind, quantity, headcount_delta, occurred_on, note, created_by)
    values (p_business_id, v_herd.id, 'start', p_initial_count, p_initial_count, v_herd.started_on, 'Effectif de départ', auth.uid());
  end if;
  return v_herd;
end;
$$;

-- Enregistre un événement du journal et met à jour l’effectif dans la même opération.
-- p_kind : birth, purchase, sale, death, count (inventaire), feed, health, expense.
-- Lot individuel : naissance ou achat → p_animal {"tag", "name", "sex", "born_on"} ; vente ou mort → p_animal_id.
create function public.record_livestock_event(
  p_business_id uuid,
  p_herd_id uuid,
  p_kind text,
  p_quantity integer default 0,
  p_amount bigint default 0,
  p_occurred_on date default null,
  p_cause text default null,
  p_note text default null,
  p_animal_id uuid default null,
  p_animal jsonb default null
) returns public.livestock_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_herd public.livestock_herds;
  v_animal public.livestock_animals;
  v_event public.livestock_events;
  v_today date;
  v_quantity integer := coalesce(p_quantity, 0);
  v_amount bigint := coalesce(p_amount, 0);
  v_delta integer := 0;
  v_tag text;
  v_sex text;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  select * into v_herd from public.livestock_herds where id = p_herd_id and business_id = p_business_id for update;
  if not found then
    raise exception 'Lot introuvable.' using errcode = 'GL403';
  end if;
  if v_herd.archived then
    raise exception 'Le lot « % » est archivé.', v_herd.name using errcode = 'GL410';
  end if;
  if p_kind is null or p_kind not in ('birth', 'purchase', 'sale', 'death', 'count', 'feed', 'health', 'expense') then
    raise exception 'Type d’événement inconnu.' using errcode = 'GL422';
  end if;
  if v_quantity < 0 or v_quantity > 10000000 or v_amount < 0 or v_amount > 1000000000000 then
    raise exception 'Nombre ou montant invalide.' using errcode = 'GL422';
  end if;
  if p_cause is not null and char_length(p_cause) > 200 or p_note is not null and char_length(p_note) > 500 then
    raise exception 'La cause ou la note est trop longue.' using errcode = 'GL422';
  end if;
  v_today := public.business_today(p_business_id);
  if p_occurred_on is not null and p_occurred_on > v_today then
    raise exception 'La date ne peut pas être dans le futur.' using errcode = 'GL422';
  end if;

  if p_kind in ('feed', 'health', 'expense') then
    if v_amount <= 0 then
      raise exception 'Indiquez le montant de la dépense.' using errcode = 'GL422';
    end if;
    v_quantity := 0;
  elsif p_kind = 'count' then
    if v_herd.tracking = 'individual' then
      raise exception 'Dans un suivi individuel, l’effectif suit les animaux enregistrés.' using errcode = 'GL422';
    end if;
    v_delta := v_quantity - v_herd.headcount;
    v_amount := 0;
  elsif v_herd.tracking = 'individual' then
    v_quantity := 1;
    if p_kind in ('birth', 'purchase') then
      v_tag := btrim(coalesce(p_animal ->> 'tag', ''));
      v_sex := coalesce(nullif(p_animal ->> 'sex', ''), 'unknown');
      if char_length(v_tag) not between 1 and 40 then
        raise exception 'Indiquez le numéro de l’animal (boucle ou marque).' using errcode = 'GL422';
      end if;
      if v_sex not in ('female', 'male', 'unknown') then
        raise exception 'Sexe de l’animal invalide.' using errcode = 'GL422';
      end if;
      if exists (select 1 from public.livestock_animals where herd_id = p_herd_id and status <> 'removed' and lower(btrim(tag)) = lower(v_tag)) then
        raise exception 'Le numéro « % » existe déjà dans ce lot.', v_tag using errcode = 'GL409';
      end if;
      insert into public.livestock_animals (business_id, herd_id, tag, name, sex, born_on)
      values (p_business_id, p_herd_id, v_tag, nullif(btrim(left(p_animal ->> 'name', 60)), ''), v_sex,
        case when p_kind = 'birth' then coalesce(p_occurred_on, v_today) else nullif(p_animal ->> 'born_on', '')::date end)
      returning * into v_animal;
      v_delta := 1;
    else
      select * into v_animal from public.livestock_animals where id = p_animal_id and herd_id = p_herd_id for update;
      if not found then
        raise exception 'Choisissez l’animal concerné.' using errcode = 'GL422';
      end if;
      if v_animal.status <> 'present' then
        raise exception 'L’animal « % » n’est plus dans le lot.', v_animal.tag using errcode = 'GL409';
      end if;
      update public.livestock_animals set status = case when p_kind = 'sale' then 'sold' else 'dead' end where id = v_animal.id;
      v_delta := -1;
    end if;
  else
    if v_quantity <= 0 then
      raise exception 'Indiquez le nombre d’animaux.' using errcode = 'GL422';
    end if;
    v_delta := case when p_kind in ('birth', 'purchase') then v_quantity else -v_quantity end;
  end if;

  if p_kind in ('birth', 'death', 'count') then
    v_amount := 0;
  end if;
  if v_herd.headcount + v_delta < 0 then
    raise exception 'Effectif insuffisant dans « % » : il reste % animaux.', v_herd.name, v_herd.headcount using errcode = 'GL409';
  end if;
  update public.livestock_herds set headcount = headcount + v_delta where id = p_herd_id;

  insert into public.livestock_events (business_id, herd_id, animal_id, kind, quantity, headcount_delta, amount, cause, note, occurred_on, created_by)
  values (p_business_id, p_herd_id, v_animal.id, p_kind, v_quantity, v_delta, v_amount,
    case when p_kind = 'death' then nullif(btrim(left(p_cause, 200)), '') end,
    nullif(btrim(left(p_note, 500)), ''), coalesce(p_occurred_on, v_today), auth.uid())
  returning * into v_event;
  return v_event;
end;
$$;

-- Annule un événement du journal (propriétaire) : l’effectif revient, l’événement reste visible.
create function public.cancel_livestock_event(p_business_id uuid, p_event_id uuid, p_reason text default null) returns public.livestock_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.livestock_events;
  v_herd public.livestock_herds;
begin
  if auth.uid() is null or not public.is_business_owner(p_business_id) then
    raise exception 'Seul le propriétaire peut annuler un événement.' using errcode = 'GL403';
  end if;
  select * into v_event from public.livestock_events where id = p_event_id and business_id = p_business_id for update;
  if not found then
    raise exception 'Événement introuvable.' using errcode = 'GL403';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'Cet événement est déjà annulé.' using errcode = 'GL409';
  end if;
  if v_event.kind in ('start', 'count') then
    raise exception 'Un effectif de départ ou un inventaire se corrige par un nouvel inventaire.' using errcode = 'GL422';
  end if;
  select * into v_herd from public.livestock_herds where id = v_event.herd_id for update;
  if v_herd.headcount - v_event.headcount_delta < 0 then
    raise exception 'Annulation impossible : l’effectif deviendrait négatif.' using errcode = 'GL409';
  end if;
  if v_event.animal_id is not null then
    if v_event.kind in ('birth', 'purchase') then
      if exists (select 1 from public.livestock_events where animal_id = v_event.animal_id and id <> v_event.id and status = 'recorded' and kind in ('sale', 'death')) then
        raise exception 'Annulez d’abord la vente ou la mort de cet animal.' using errcode = 'GL409';
      end if;
      update public.livestock_animals set status = 'removed' where id = v_event.animal_id;
    elsif v_event.kind in ('sale', 'death') then
      update public.livestock_animals set status = 'present' where id = v_event.animal_id;
    end if;
  end if;
  update public.livestock_herds set headcount = headcount - v_event.headcount_delta where id = v_event.herd_id;
  update public.livestock_events set status = 'cancelled', cancel_reason = nullif(btrim(left(p_reason, 500)), '') where id = p_event_id returning * into v_event;
  return v_event;
end;
$$;

-- Résultats par lot sur une période de jours (événements non annulés, soins faits).
create function public.livestock_summary(p_business_id uuid, p_start date, p_end date)
returns table (
  herd_id uuid,
  herd_name text,
  species text,
  tracking text,
  archived boolean,
  headcount integer,
  opening_headcount bigint,
  closing_headcount bigint,
  births bigint,
  purchases bigint,
  sales bigint,
  deaths bigint,
  count_adjustment bigint,
  mortality_rate numeric,
  purchase_cost bigint,
  feed_cost bigint,
  health_cost bigint,
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
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    raise exception 'Période invalide (366 jours au plus).' using errcode = 'GL422';
  end if;

  return query
  with e as (
    select ev.herd_id,
      -- Effectif au début : variations d’avant la période, plus l’effectif de départ d’un lot créé pendant la période.
      coalesce(sum(ev.headcount_delta) filter (where ev.occurred_on < p_start or ev.kind = 'start' and ev.occurred_on <= p_end), 0)::bigint as opening,
      coalesce(sum(ev.headcount_delta) filter (where ev.occurred_on <= p_end), 0)::bigint as closing,
      coalesce(sum(ev.quantity) filter (where ev.kind = 'birth' and ev.occurred_on between p_start and p_end), 0)::bigint as births,
      coalesce(sum(ev.quantity) filter (where ev.kind = 'purchase' and ev.occurred_on between p_start and p_end), 0)::bigint as purchases,
      coalesce(sum(ev.quantity) filter (where ev.kind = 'sale' and ev.occurred_on between p_start and p_end), 0)::bigint as sales,
      coalesce(sum(ev.quantity) filter (where ev.kind = 'death' and ev.occurred_on between p_start and p_end), 0)::bigint as deaths,
      coalesce(sum(ev.headcount_delta) filter (where ev.kind = 'count' and ev.occurred_on between p_start and p_end), 0)::bigint as adjustment,
      coalesce(sum(ev.amount) filter (where ev.kind = 'purchase' and ev.occurred_on between p_start and p_end), 0)::bigint as purchase_cost,
      coalesce(sum(ev.amount) filter (where ev.kind = 'feed' and ev.occurred_on between p_start and p_end), 0)::bigint as feed_cost,
      coalesce(sum(ev.amount) filter (where ev.kind = 'health' and ev.occurred_on between p_start and p_end), 0)::bigint as health_events,
      coalesce(sum(ev.amount) filter (where ev.kind = 'expense' and ev.occurred_on between p_start and p_end), 0)::bigint as other_cost,
      coalesce(sum(ev.amount) filter (where ev.kind = 'sale' and ev.occurred_on between p_start and p_end), 0)::bigint as revenue
    from public.livestock_events ev
    where ev.business_id = p_business_id and ev.status = 'recorded'
    group by ev.herd_id
  ), care as (
    select c.herd_id, coalesce(sum(c.cost), 0)::bigint as cost
    from public.livestock_health c
    where c.business_id = p_business_id and c.status = 'done' and c.done_on between p_start and p_end
    group by c.herd_id
  ), totals as (
    select h.id, h.name, h.species, h.tracking, h.archived, h.headcount,
      coalesce(e.opening, 0) as opening, coalesce(e.closing, 0) as closing,
      coalesce(e.births, 0) as births, coalesce(e.purchases, 0) as purchases, coalesce(e.sales, 0) as sales,
      coalesce(e.deaths, 0) as deaths, coalesce(e.adjustment, 0) as adjustment,
      coalesce(e.purchase_cost, 0) as purchase_cost, coalesce(e.feed_cost, 0) as feed_cost,
      coalesce(e.health_events, 0) + coalesce(care.cost, 0) as health_cost, coalesce(e.other_cost, 0) as other_cost,
      coalesce(e.revenue, 0) as revenue
    from public.livestock_herds h
    left join e on e.herd_id = h.id
    left join care on care.herd_id = h.id
    where h.business_id = p_business_id and h.started_on <= p_end
  )
  select t.id, t.name, t.species, t.tracking, t.archived, t.headcount, t.opening, t.closing, t.births, t.purchases, t.sales, t.deaths, t.adjustment,
    case when t.opening + t.births + t.purchases > 0 then round(t.deaths * 100.0 / (t.opening + t.births + t.purchases), 1) end,
    t.purchase_cost, t.feed_cost, t.health_cost, t.other_cost,
    (t.purchase_cost + t.feed_cost + t.health_cost + t.other_cost)::bigint,
    t.revenue,
    (t.revenue - t.purchase_cost - t.feed_cost - t.health_cost - t.other_cost)::bigint
  from totals t
  where not t.archived or t.closing > 0 or t.revenue > 0 or t.purchase_cost + t.feed_cost + t.health_cost + t.other_cost > 0
  order by t.archived, t.name;
end;
$$;

revoke execute on function public.business_today(uuid) from public, anon;
revoke execute on function public.create_herd(uuid, text, text, text, integer, date, text) from public, anon;
revoke execute on function public.record_livestock_event(uuid, uuid, text, integer, bigint, date, text, text, uuid, jsonb) from public, anon;
revoke execute on function public.cancel_livestock_event(uuid, uuid, text) from public, anon;
revoke execute on function public.livestock_summary(uuid, date, date) from public, anon;
grant execute on function public.business_today(uuid) to authenticated;
grant execute on function public.create_herd(uuid, text, text, text, integer, date, text) to authenticated;
grant execute on function public.record_livestock_event(uuid, uuid, text, integer, bigint, date, text, text, uuid, jsonb) to authenticated;
grant execute on function public.cancel_livestock_event(uuid, uuid, text) to authenticated;
grant execute on function public.livestock_summary(uuid, date, date) to authenticated;
