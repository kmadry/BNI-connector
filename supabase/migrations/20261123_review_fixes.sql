-- Poprawki po przeglądzie: retencja wg aktywności, liczniki zbiorcze, limity dla kont gości, limit nie blokuje edycji.
-- 1) Retencja: gość jest usuwany po 90 dniach bez logowania ORAZ bez zmian w swoich danych
create or replace function public.purge_stale_guests() returns integer
language sql security definer set search_path = public, auth, pg_temp as $$
  with d as (
    delete from auth.users u where u.is_anonymous
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '90 days'
      and not exists (select 1 from public.bni_cards c where c.owner = u.id and c.updated_at > now() - interval '90 days')
      and not exists (select 1 from public.bni_contacts c where c.owner = u.id and c.updated_at > now() - interval '90 days')
    returning 1)
  select count(*)::int from d
$$;
revoke all on function public.purge_stale_guests() from public, anon, authenticated;

-- 2) Liczniki zbiorcze (rodzaj, dzień): jeden wiersz na dobę zamiast wiersza na zdarzenie
create table if not exists public.bni_event_counts (
  kind text not null check (kind in ('card_created','wish_print','wish_check','wish_confirm')),
  day date not null default current_date,
  n integer not null default 0,
  primary key (kind, day)
);
alter table public.bni_event_counts enable row level security;
revoke all on public.bni_event_counts from anon, authenticated;
insert into public.bni_event_counts(kind, day, n)
  select kind, created_at::date, count(*) from public.bni_events group by 1, 2 on conflict (kind, day) do update set n = public.bni_event_counts.n + excluded.n;
drop table if exists public.bni_events;
create or replace function public.record_event(p_kind text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.bni_event_counts(kind, day, n) select p_kind, current_date, 1 where p_kind in ('card_created','wish_print','wish_check','wish_confirm')
  on conflict (kind, day) do update set n = public.bni_event_counts.n + 1
$$;
revoke all on function public.record_event(text) from public;
grant execute on function public.record_event(text) to anon, authenticated;

-- 3) Limity: nie blokują edycji istniejących wierszy; konta gości mają mniejsze limity
create or replace function public.bni_row_cap() returns trigger language plpgsql set search_path = public, pg_temp as $$
declare n int; ex boolean; guest boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
        cap int;
begin
  execute format('select exists(select 1 from public.%I where id = $1)', tg_table_name) into ex using new.id;
  if ex then return new; end if;                       -- upsert istniejącego wiersza
  cap := case when guest then case tg_table_name when 'bni_cards' then 3 else 0 end
              else case tg_table_name when 'bni_contacts' then 5000 when 'bni_links' then 5000 else 1000 end end;
  execute format('select count(*) from public.%I where owner = $1', tg_table_name) into n using new.owner;
  if n >= cap then raise exception 'Limit % wierszy w %', cap, tg_table_name using errcode = '54000'; end if;
  return new;
end $$;
