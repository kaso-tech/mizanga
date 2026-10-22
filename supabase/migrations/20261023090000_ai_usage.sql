-- Gilli — étape 5 : limites d’utilisation et suivi de la consommation de l’IA par utilisateur.
--
-- Chaque question à l’assistant Business réserve d’abord une ligne dans ai_usage (statut « pending ») :
-- la limite quotidienne est vérifiée et la réservation faite dans la même transaction, ce qui empêche de
-- la dépasser en envoyant plusieurs questions à la fois. Le serveur complète ensuite la ligne avec le
-- modèle, les jetons consommés et le coût estimé (« completed »), ou la marque « failed » si le moteur
-- n’a pas répondu ; une question échouée ne compte pas dans la limite.
-- La journée est celle du fuseau horaire de l’entreprise ; la limite vient de la formule de son
-- abonnement, ou de la formule « test » s’il n’y en a pas.

alter table public.ai_usage
  add column status text not null default 'completed' check (status in ('pending', 'completed', 'failed'));

create index ai_usage_user_feature_idx on public.ai_usage (user_id, feature, created_at desc);

-- Consommation du jour et limite de l’utilisateur connecté pour une entreprise dont il est membre.
create function public.ai_quota(p_business_id uuid, p_feature text default 'business_assistant')
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
    coalesce(
      (select p.daily_ai_requests from public.subscriptions s join public.plans p on p.id = s.plan_id
        where s.business_id = p_business_id and s.status in ('test', 'active') and p.active),
      (select p.daily_ai_requests from public.plans p where p.id = 'test'),
      0
    ),
    v_day_start + interval '1 day';
end;
$$;

-- Réserve une demande si la limite du jour n’est pas atteinte ; renvoie l’identifiant de la réservation.
create function public.begin_ai_request(p_business_id uuid, p_feature text default 'business_assistant')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_limit integer;
  v_id bigint;
begin
  if p_feature is distinct from 'business_assistant' then
    raise exception 'Fonction d’IA inconnue.' using errcode = 'GL422';
  end if;
  -- Une seule réservation à la fois par utilisateur : deux demandes simultanées ne passent pas toutes
  -- les deux sous la limite.
  perform pg_advisory_xact_lock(hashtext('gilli-ai-' || auth.uid()::text));
  select q.used, q.daily_limit into v_used, v_limit from public.ai_quota(p_business_id, p_feature) q;
  if v_used >= v_limit then
    raise exception 'Limite du jour atteinte (% questions). Elle sera renouvelée demain.', v_limit using errcode = 'GL429';
  end if;
  insert into public.ai_usage (user_id, business_id, feature, provider, model, status)
  values (auth.uid(), p_business_id, p_feature, '', '', 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

-- Complète une réservation de l’utilisateur connecté (une seule fois) : moteur, jetons et coût estimé.
create function public.finish_ai_request(
  p_id bigint,
  p_status text,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_micro_usd bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'Statut invalide.' using errcode = 'GL422';
  end if;
  update public.ai_usage
  set status = p_status,
      provider = left(coalesce(p_provider, ''), 40),
      model = left(coalesce(p_model, ''), 80),
      input_tokens = least(greatest(coalesce(p_input_tokens, 0), 0), 10000000),
      output_tokens = least(greatest(coalesce(p_output_tokens, 0), 0), 10000000),
      estimated_cost_micro_usd = least(greatest(coalesce(p_estimated_cost_micro_usd, 0), 0), 1000000000)
  where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Demande introuvable ou déjà terminée.' using errcode = 'GL409';
  end if;
end;
$$;

revoke execute on function public.ai_quota(uuid, text) from public, anon;
revoke execute on function public.begin_ai_request(uuid, text) from public, anon;
revoke execute on function public.finish_ai_request(bigint, text, text, text, integer, integer, bigint) from public, anon;
grant execute on function public.ai_quota(uuid, text) to authenticated;
grant execute on function public.begin_ai_request(uuid, text) to authenticated;
grant execute on function public.finish_ai_request(bigint, text, text, text, integer, integer, bigint) to authenticated;
