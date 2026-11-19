-- Retencja: konta gości bez aktywności przez 90 dni są usuwane razem z danymi (kaskada po owner).
create or replace function public.purge_stale_guests() returns integer
language sql security definer set search_path = public, auth, pg_temp as $$
  with d as (delete from auth.users where is_anonymous and coalesce(last_sign_in_at, created_at) < now() - interval '90 days' returning 1)
  select count(*)::int from d
$$;
revoke all on function public.purge_stale_guests() from public, anon, authenticated;
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-stale-guests', '17 3 * * *', 'select public.purge_stale_guests()');
exception when others then raise notice 'pg_cron niedostępny (%): włącz go w Database → Extensions i zaplanuj select public.purge_stale_guests() raz dziennie', sqlerrm;
end $$;
-- Liczniki zdarzeń: bez danych osobowych, kasujemy po roku
delete from public.bni_events where created_at < now() - interval '1 year';
