-- Gilli — étape 4 : ventes, dépenses et calculs.
--
-- Règles de calcul (déterministes, en entiers dans la devise de l’entreprise) :
-- * montant d’une ligne de vente = arrondi(quantité × prix unitaire) ; coût = arrondi(quantité × prix d’achat
--   du produit au moment de la vente), figé dans la ligne ;
-- * chiffre d’affaires = somme des ventes non annulées de la période ; coût des produits vendus = somme de
--   leurs coûts ; marge brute = chiffre d’affaires − coût des produits vendus ;
-- * résultat estimé = marge brute − dépenses de la période. Ce n’est pas un résultat comptable ou fiscal.
-- * les achats de marchandises entrent dans le stock (étape 3) : ils deviennent un coût quand ils sont
--   vendus, et ne doivent pas être saisis en dépenses (sinon ils compteraient deux fois).
-- Les périodes sont des jours du calendrier local de l’entreprise (fuseau horaire de businesses.timezone).

-- Bornes [début, fin) d’une période de jours locaux, en instants absolus.
create function public.business_period(p_business_id uuid, p_start date, p_end date, out period_start timestamptz, out period_end timestamptz)
language sql
stable
set search_path = ''
as $$
  select (p_start::timestamp at time zone b.timezone), ((p_end + 1)::timestamp at time zone b.timezone)
  from public.businesses b where b.id = p_business_id;
$$;

-- Enregistre une vente et diminue le stock de chaque produit, en une seule opération.
-- p_items : [{"product_id": "…", "quantity": 2.5, "unit_price": 1000}] ; unit_price facultatif (prix de vente du produit).
create function public.record_sale(
  p_business_id uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_note text default null
) returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
  v_product public.products;
  v_quantity numeric;
  v_price bigint;
  v_line_total bigint;
  v_line_cost bigint;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Ajoutez au moins un produit à la vente.' using errcode = 'GL422';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Une vente compte 100 lignes au plus.' using errcode = 'GL422';
  end if;
  if (select count(distinct value ->> 'product_id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'Un même produit apparaît deux fois : regroupez les quantités.' using errcode = 'GL422';
  end if;
  if p_customer_name is not null and char_length(p_customer_name) > 120 or p_note is not null and char_length(p_note) > 500 then
    raise exception 'Le nom du client ou la note est trop long.' using errcode = 'GL422';
  end if;

  insert into public.sales (business_id, customer_name, note, created_by)
  values (p_business_id, nullif(btrim(p_customer_name), ''), nullif(btrim(p_note), ''), auth.uid())
  returning * into v_sale;

  -- Produits traités dans un ordre fixe : deux ventes simultanées ne peuvent pas se bloquer mutuellement.
  for v_item in
    select value from jsonb_array_elements(p_items) order by value ->> 'product_id'
  loop
    begin
      v_quantity := (v_item.value ->> 'quantity')::numeric;
      v_price := (v_item.value ->> 'unit_price')::bigint;
    exception when others then
      raise exception 'Quantité ou prix invalide.' using errcode = 'GL422';
    end;
    if v_quantity is null or v_quantity <= 0 or v_quantity <> round(v_quantity, 3) then
      raise exception 'Chaque quantité doit être un nombre positif (trois décimales au plus).' using errcode = 'GL422';
    end if;
    if v_price is not null and v_price < 0 then
      raise exception 'Un prix ne peut pas être négatif.' using errcode = 'GL422';
    end if;

    select * into v_product from public.products
    where id = (v_item.value ->> 'product_id')::uuid and business_id = p_business_id
    for update;
    if not found then
      raise exception 'Produit introuvable.' using errcode = 'GL403';
    end if;
    if v_product.archived then
      raise exception 'Le produit « % » est archivé.', v_product.name using errcode = 'GL410';
    end if;
    if v_product.quantity < v_quantity then
      raise exception 'Stock insuffisant pour « % » : il reste % %.', v_product.name, trim(trailing '.' from trim(trailing '0' from v_product.quantity::text)), v_product.unit
        using errcode = 'GL409';
    end if;

    v_price := coalesce(v_price, v_product.sale_price);
    v_line_total := round(v_quantity * v_price);
    v_line_cost := round(v_quantity * v_product.purchase_price);

    insert into public.sale_items (business_id, sale_id, product_id, quantity, unit_price, unit_cost, line_total, line_cost)
    values (p_business_id, v_sale.id, v_product.id, v_quantity, v_price, v_product.purchase_price, v_line_total, v_line_cost);
    insert into public.stock_movements (business_id, product_id, kind, quantity_delta, unit_cost, sale_id, created_by)
    values (p_business_id, v_product.id, 'sale', -v_quantity, v_product.purchase_price, v_sale.id, auth.uid());
    update public.products set quantity = quantity - v_quantity where id = v_product.id;
  end loop;

  update public.sales s
  set total_amount = totals.amount, total_cost = totals.cost
  from (select coalesce(sum(line_total), 0) as amount, coalesce(sum(line_cost), 0) as cost from public.sale_items where sale_id = v_sale.id) totals
  where s.id = v_sale.id
  returning s.* into v_sale;

  return v_sale;
end;
$$;

-- Annule une vente (propriétaire uniquement) : elle ne compte plus dans les calculs et le stock est rétabli.
create function public.cancel_sale(p_business_id uuid, p_sale_id uuid, p_reason text default null) returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
begin
  if auth.uid() is null or not public.is_business_owner(p_business_id) then
    raise exception 'Seul le propriétaire peut annuler une vente.' using errcode = 'GL403';
  end if;
  select * into v_sale from public.sales where id = p_sale_id and business_id = p_business_id for update;
  if not found then
    raise exception 'Vente introuvable.' using errcode = 'GL403';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'Cette vente est déjà annulée.' using errcode = 'GL409';
  end if;

  for v_item in select product_id, quantity, unit_cost from public.sale_items where sale_id = p_sale_id order by product_id loop
    perform 1 from public.products where id = v_item.product_id for update;
    update public.products set quantity = quantity + v_item.quantity where id = v_item.product_id;
    insert into public.stock_movements (business_id, product_id, kind, quantity_delta, unit_cost, sale_id, note, created_by)
    values (p_business_id, v_item.product_id, 'sale_cancelled', v_item.quantity, v_item.unit_cost, p_sale_id, nullif(btrim(left(p_reason, 500)), ''), auth.uid());
  end loop;

  update public.sales set status = 'cancelled' where id = p_sale_id returning * into v_sale;
  return v_sale;
end;
$$;

-- Enregistre une dépense datée d’un jour local (midi, pour rester dans le bon jour quel que soit le fuseau).
create function public.record_expense(
  p_business_id uuid,
  p_amount bigint,
  p_category text,
  p_description text default null,
  p_spent_on date default null
) returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_timezone text;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant doit être positif.' using errcode = 'GL422';
  end if;
  if p_category is null or char_length(btrim(p_category)) not between 1 and 40 then
    raise exception 'Choisissez une catégorie.' using errcode = 'GL422';
  end if;
  select timezone into v_timezone from public.businesses where id = p_business_id;
  if p_spent_on is not null and p_spent_on > (now() at time zone v_timezone)::date then
    raise exception 'La date de la dépense ne peut pas être dans le futur.' using errcode = 'GL422';
  end if;

  insert into public.expenses (business_id, amount, category, description, spent_at, created_by)
  values (
    p_business_id,
    p_amount,
    btrim(p_category),
    nullif(btrim(left(p_description, 500)), ''),
    case when p_spent_on is null then now() else ((p_spent_on::timestamp + time '12:00') at time zone v_timezone) end,
    auth.uid()
  )
  returning * into v_expense;
  return v_expense;
end;
$$;

-- Résumé d’une période : chiffres calculés uniquement à partir des ventes et dépenses enregistrées.
create function public.business_summary(p_business_id uuid, p_start date, p_end date)
returns table (
  revenue bigint,
  cost_of_goods_sold bigint,
  gross_margin bigint,
  expenses bigint,
  estimated_result bigint,
  sales_count bigint,
  cancelled_sales_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    raise exception 'Période invalide (366 jours au plus).' using errcode = 'GL422';
  end if;
  select period_start, period_end into v_start, v_end from public.business_period(p_business_id, p_start, p_end);

  return query
  with sales_totals as (
    select
      coalesce(sum(total_amount) filter (where status = 'completed'), 0)::bigint as revenue,
      coalesce(sum(total_cost) filter (where status = 'completed'), 0)::bigint as cost,
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'cancelled') as cancelled
    from public.sales
    where business_id = p_business_id and sold_at >= v_start and sold_at < v_end
  ), expense_totals as (
    select coalesce(sum(amount), 0)::bigint as total
    from public.expenses
    where business_id = p_business_id and spent_at >= v_start and spent_at < v_end
  )
  select s.revenue, s.cost, s.revenue - s.cost, e.total, s.revenue - s.cost - e.total, s.completed, s.cancelled
  from sales_totals s, expense_totals e;
end;
$$;

-- Ventes par produit sur une période (ventes non annulées), du plus gros chiffre d’affaires au plus petit.
create function public.business_product_sales(p_business_id uuid, p_start date, p_end date)
returns table (product_id uuid, product_name text, unit text, quantity numeric, revenue bigint, cost bigint, gross_margin bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    raise exception 'Période invalide (366 jours au plus).' using errcode = 'GL422';
  end if;
  select period_start, period_end into v_start, v_end from public.business_period(p_business_id, p_start, p_end);

  return query
  select p.id, p.name, p.unit, sum(i.quantity), sum(i.line_total)::bigint, sum(i.line_cost)::bigint, (sum(i.line_total) - sum(i.line_cost))::bigint
  from public.sale_items i
  join public.sales s on s.id = i.sale_id
  join public.products p on p.id = i.product_id
  where s.business_id = p_business_id and s.status = 'completed' and s.sold_at >= v_start and s.sold_at < v_end
  group by p.id, p.name, p.unit
  order by sum(i.line_total) desc, p.name;
end;
$$;

-- Ventes d’une période (500 au plus, les plus récentes d’abord), avec leurs lignes, au format JSON.
create function public.list_sales(p_business_id uuid, p_start date, p_end date) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    raise exception 'Période invalide (366 jours au plus).' using errcode = 'GL422';
  end if;
  select period_start, period_end into v_start, v_end from public.business_period(p_business_id, p_start, p_end);

  select coalesce(jsonb_agg(sale order by sold_at desc), '[]'::jsonb) into v_result
  from (
    select s.sold_at, jsonb_build_object(
      'id', s.id,
      'soldAt', s.sold_at,
      'status', s.status,
      'totalAmount', s.total_amount,
      'totalCost', s.total_cost,
      'customerName', s.customer_name,
      'note', s.note,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'productId', i.product_id, 'productName', p.name, 'unit', p.unit,
          'quantity', i.quantity, 'unitPrice', i.unit_price, 'lineTotal', i.line_total
        ) order by p.name), '[]'::jsonb)
        from public.sale_items i join public.products p on p.id = i.product_id
        where i.sale_id = s.id
      )
    ) as sale
    from public.sales s
    where s.business_id = p_business_id and s.sold_at >= v_start and s.sold_at < v_end
    order by s.sold_at desc
    limit 500
  ) recent;
  return v_result;
end;
$$;

-- Dépenses d’une période (500 au plus, les plus récentes d’abord), au format JSON.
create function public.list_expenses(p_business_id uuid, p_start date, p_end date) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    raise exception 'Période invalide (366 jours au plus).' using errcode = 'GL422';
  end if;
  select period_start, period_end into v_start, v_end from public.business_period(p_business_id, p_start, p_end);

  select coalesce(jsonb_agg(expense order by spent_at desc), '[]'::jsonb) into v_result
  from (
    select e.spent_at, jsonb_build_object(
      'id', e.id, 'amount', e.amount, 'category', e.category, 'description', e.description,
      'spentAt', e.spent_at, 'createdBy', e.created_by
    ) as expense
    from public.expenses e
    where e.business_id = p_business_id and e.spent_at >= v_start and e.spent_at < v_end
    order by e.spent_at desc
    limit 500
  ) recent;
  return v_result;
end;
$$;

-- Utilisée par les calculs (exécutés avec les droits de l’utilisateur) : ne renvoie que des bornes de dates.
revoke execute on function public.business_period(uuid, date, date) from public, anon;
grant execute on function public.business_period(uuid, date, date) to authenticated;
revoke execute on function public.record_sale(uuid, jsonb, text, text) from public, anon;
revoke execute on function public.cancel_sale(uuid, uuid, text) from public, anon;
revoke execute on function public.record_expense(uuid, bigint, text, text, date) from public, anon;
revoke execute on function public.business_summary(uuid, date, date) from public, anon;
revoke execute on function public.business_product_sales(uuid, date, date) from public, anon;
revoke execute on function public.list_sales(uuid, date, date) from public, anon;
revoke execute on function public.list_expenses(uuid, date, date) from public, anon;
grant execute on function public.record_sale(uuid, jsonb, text, text) to authenticated;
grant execute on function public.cancel_sale(uuid, uuid, text) to authenticated;
grant execute on function public.record_expense(uuid, bigint, text, text, date) to authenticated;
grant execute on function public.business_summary(uuid, date, date) to authenticated;
grant execute on function public.business_product_sales(uuid, date, date) to authenticated;
grant execute on function public.list_sales(uuid, date, date) to authenticated;
grant execute on function public.list_expenses(uuid, date, date) to authenticated;

-- Les dépenses passent désormais par record_expense (date locale, contrôles) ; la suppression reste
-- possible pour le propriétaire (règle RLS existante).
revoke insert (business_id, amount, category, description, spent_at) on public.expenses from authenticated;
