-- Gilli — étape 3 : produits et stocks.
--
-- La quantité en stock ne se modifie qu’à travers ces fonctions : chaque changement est inscrit au journal
-- des mouvements (stock_movements), dans la même transaction, et le stock ne peut jamais devenir négatif.
-- Elles s’exécutent avec des droits élevés (SECURITY DEFINER) : elles vérifient donc elles-mêmes que
-- l’utilisateur est membre de l’entreprise concernée.
--
-- Codes d’erreur (repris par le serveur de Gilli pour afficher un message clair) :
--   GL403 accès refusé ou produit introuvable · GL409 stock insuffisant · GL410 produit archivé
--   GL422 donnée invalide

-- Crée un produit et, s’il y en a, inscrit son stock initial au journal.
create function public.create_product(
  p_business_id uuid,
  p_name text,
  p_unit text default 'unité',
  p_purchase_price bigint default 0,
  p_sale_price bigint default 0,
  p_alert_threshold numeric default 0,
  p_initial_quantity numeric default 0,
  p_sku text default null
) returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_initial_quantity is null or p_initial_quantity < 0 then
    raise exception 'La quantité initiale ne peut pas être négative.' using errcode = 'GL422';
  end if;
  if p_purchase_price is null or p_purchase_price < 0 or p_sale_price is null or p_sale_price < 0 then
    raise exception 'Les prix ne peuvent pas être négatifs.' using errcode = 'GL422';
  end if;
  if p_alert_threshold is null or p_alert_threshold < 0 then
    raise exception 'Le seuil d’alerte ne peut pas être négatif.' using errcode = 'GL422';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Le nom du produit doit faire entre 1 et 120 caractères.' using errcode = 'GL422';
  end if;

  insert into public.products (business_id, name, unit, purchase_price, sale_price, alert_threshold, sku, quantity)
  values (
    p_business_id,
    btrim(p_name),
    coalesce(nullif(btrim(p_unit), ''), 'unité'),
    p_purchase_price,
    p_sale_price,
    p_alert_threshold,
    nullif(btrim(p_sku), ''),
    p_initial_quantity
  )
  returning * into v_product;

  if p_initial_quantity > 0 then
    insert into public.stock_movements (business_id, product_id, kind, quantity_delta, unit_cost, note, created_by)
    values (p_business_id, v_product.id, 'initial', p_initial_quantity, p_purchase_price, 'Stock initial', auth.uid());
  end if;

  return v_product;
end;
$$;

-- Mouvement de stock saisi par le commerçant :
--   purchase (achat, entrée), return (retour d’un client) : quantité ajoutée ;
--   loss (perte, casse, vol) : quantité retirée ;
--   adjustment (correction après inventaire) : quantité positive ou négative.
-- Les mouvements « initial », « sale » et « sale_cancelled » sont réservés à la création des produits
-- et aux ventes (étape 4).
create function public.record_stock_movement(
  p_business_id uuid,
  p_product_id uuid,
  p_kind public.stock_movement_kind,
  p_quantity numeric,
  p_unit_cost bigint default null,
  p_note text default null
) returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_delta numeric;
  v_movement public.stock_movements;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  if p_kind not in ('purchase', 'return', 'loss', 'adjustment') then
    raise exception 'Ce type de mouvement ne peut pas être saisi directement.' using errcode = 'GL422';
  end if;
  if p_quantity is null or p_quantity = 0 or (p_kind <> 'adjustment' and p_quantity < 0) then
    raise exception 'La quantité doit être un nombre positif.' using errcode = 'GL422';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Le coût ne peut pas être négatif.' using errcode = 'GL422';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'La note ne peut pas dépasser 500 caractères.' using errcode = 'GL422';
  end if;

  -- Verrou sur le produit : deux mouvements simultanés ne peuvent pas fausser le stock.
  select * into v_product from public.products
  where id = p_product_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'GL403';
  end if;
  if v_product.archived then
    raise exception 'Ce produit est archivé.' using errcode = 'GL410';
  end if;

  v_delta := case when p_kind = 'loss' then -p_quantity else p_quantity end;
  if v_product.quantity + v_delta < 0 then
    raise exception 'Stock insuffisant : il reste % %.', trim(trailing '.' from trim(trailing '0' from v_product.quantity::text)), v_product.unit
      using errcode = 'GL409';
  end if;

  update public.products set quantity = quantity + v_delta where id = v_product.id;

  insert into public.stock_movements (business_id, product_id, kind, quantity_delta, unit_cost, note, created_by)
  values (
    p_business_id,
    v_product.id,
    p_kind,
    v_delta,
    coalesce(p_unit_cost, case when p_kind = 'purchase' then v_product.purchase_price end),
    nullif(btrim(p_note), ''),
    auth.uid()
  )
  returning * into v_movement;

  return v_movement;
end;
$$;

revoke execute on function public.create_product(uuid, text, text, bigint, bigint, numeric, numeric, text) from public, anon;
revoke execute on function public.record_stock_movement(uuid, uuid, public.stock_movement_kind, numeric, bigint, text) from public, anon;
grant execute on function public.create_product(uuid, text, text, bigint, bigint, numeric, numeric, text) to authenticated;
grant execute on function public.record_stock_movement(uuid, uuid, public.stock_movement_kind, numeric, bigint, text) to authenticated;
