-- Suppression définitive des anciens modules Élevage et Agriculture (retirés de l’application lors de
-- la refonte en marketplace), avec leurs données et leurs conversations d’assistant.

delete from public.conversations where kind in ('elevage', 'agriculture');
alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('general', 'commerce'));

drop function public.farm_crop_results(uuid, integer);
drop function public.complete_farm_task(uuid, uuid, date, bigint);
drop function public.cancel_farm_operation(uuid, uuid, text);
drop function public.record_farm_operation(uuid, uuid, text, numeric, text, numeric, bigint, date, text, text, text, text);
drop table public.farm_tasks, public.farm_operations, public.farm_crops, public.farm_plots;
drop function public.check_crop_area();

drop function public.livestock_summary(uuid, date, date);
drop function public.cancel_livestock_event(uuid, uuid, text);
drop function public.record_livestock_event(uuid, uuid, text, integer, bigint, date, text, text, uuid, jsonb);
drop function public.create_herd(uuid, text, text, text, integer, date, text);
drop table public.livestock_health, public.livestock_events, public.livestock_animals, public.livestock_herds;
drop function public.business_today(uuid);
