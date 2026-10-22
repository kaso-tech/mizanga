-- Gilli — étape 6 : abonnements, en mode test (aucun paiement).
--
-- * Chaque nouveau commerce reçoit automatiquement un abonnement à la formule « test » (gratuite).
-- * Le nombre de commerces qu’un utilisateur peut créer suit sa formule : la plus généreuse des formules
--   actives de ses commerces, ou la formule « test » s’il n’en a pas encore.
-- * business_subscription donne au commerce sa formule, ses limites et sa consommation du jour.
-- Les formules payantes, leurs prix et le moyen de paiement seront décidés plus tard : un changement de
-- formule se fait pour l’instant par l’administrateur, directement dans la base.

-- Abonnement « test » à la création d’un commerce (après l’ajout du propriétaire).
create function public.add_test_subscription() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (business_id, plan_id, status) values (new.id, 'test', 'test');
  return new;
end;
$$;

create trigger businesses_add_test_subscription after insert on public.businesses
  for each row execute function public.add_test_subscription();

-- Commerces créés avant cette migration.
insert into public.subscriptions (business_id, plan_id, status)
select b.id, 'test', 'test' from public.businesses b
where not exists (select 1 from public.subscriptions s where s.business_id = b.id);

-- Nombre de commerces autorisés pour l’utilisateur connecté.
create function public.allowed_businesses(p_user_id uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select max(p.max_businesses)
      from public.business_members m
      join public.subscriptions s on s.business_id = m.business_id and s.status in ('test', 'active')
      join public.plans p on p.id = s.plan_id and p.active
      where m.user_id = p_user_id and m.role = 'owner'), 0),
    coalesce((select max_businesses from public.plans where id = 'test'), 1)
  );
$$;

-- Refuse un commerce de trop. Les opérations faites directement dans la base (sans utilisateur
-- connecté, par l’administrateur) ne sont pas limitées.
create function public.check_business_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owned integer;
  v_allowed integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('gilli-business-' || auth.uid()::text));
  select count(*) into v_owned from public.business_members where user_id = auth.uid() and role = 'owner';
  v_allowed := public.allowed_businesses(auth.uid());
  if v_owned >= v_allowed then
    raise exception 'Votre formule permet % commerce(s) : vous avez atteint cette limite.', v_allowed using errcode = 'GL409';
  end if;
  return new;
end;
$$;

create trigger businesses_check_limit before insert on public.businesses
  for each row execute function public.check_business_limit();

-- Formule, limites et consommation du jour d’un commerce (membres uniquement).
create function public.business_subscription(p_business_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Accès refusé à cette entreprise.' using errcode = 'GL403';
  end if;
  select jsonb_build_object(
    'planId', p.id,
    'planName', p.name,
    'isTest', p.is_test,
    'status', s.status,
    'monthlyPrice', p.monthly_price,
    'currency', p.currency,
    'dailyAiRequests', p.daily_ai_requests,
    'maxBusinesses', public.allowed_businesses(auth.uid()),
    'currentPeriodEnd', s.current_period_end,
    'aiUsedToday', (select q.used from public.ai_quota(p_business_id) q)
  ) into v_result
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.business_id = p_business_id;
  if v_result is null then
    raise exception 'Aucun abonnement pour ce commerce.' using errcode = 'GL403';
  end if;
  return v_result;
end;
$$;

revoke execute on function public.add_test_subscription(), public.check_business_limit() from public, anon, authenticated;
revoke execute on function public.allowed_businesses(uuid) from public, anon, authenticated;
revoke execute on function public.business_subscription(uuid) from public, anon;
grant execute on function public.business_subscription(uuid) to authenticated;
