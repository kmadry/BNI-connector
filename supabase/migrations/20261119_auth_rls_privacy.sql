-- Referra: logowanie + prywatność danych (Supabase Auth + RLS per właściciel).
-- Uruchom w Supabase (SQL editor) albo przez MCP apply_migration. Wersja bez usuwania obiektów:
-- stare, otwarte polityki są PRZESTAWIANE (ALTER POLICY) na właścicielskie, a ustawienia używają id „logo:<uid>”.

-- 1) Właściciel wiersza i flaga udostępnienia karty
alter table public.bni_cards    add column if not exists owner uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.bni_cards    add column if not exists shared boolean not null default false;
alter table public.bni_contacts add column if not exists owner uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.bni_links    add column if not exists owner uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.bni_settings add column if not exists owner uuid default auth.uid() references auth.users(id) on delete cascade;

create index if not exists bni_cards_owner_idx    on public.bni_cards (owner);
create index if not exists bni_contacts_owner_idx on public.bni_contacts (owner);
create index if not exists bni_links_owner_idx    on public.bni_links (owner);
create index if not exists bni_settings_owner_idx on public.bni_settings (owner);

-- 2) Walidacja i limity rozmiaru (ochrona przed zapchaniem bazy); NOT VALID = nie sprawdza starych wierszy
alter table public.bni_cards    add constraint bni_cards_limits    check (id ~ '^[A-Za-z0-9_-]{1,40}$' and pg_column_size(data) < 80000) not valid;
alter table public.bni_contacts add constraint bni_contacts_limits check (id ~ '^[A-Za-z0-9_-]{1,40}$' and pg_column_size(data) < 10000) not valid;
alter table public.bni_links    add constraint bni_links_limits    check (id ~ '^[A-Za-z0-9_-]{1,40}$' and length(note) < 500) not valid;
alter table public.bni_settings add constraint bni_settings_limits check (pg_column_size(data) < 400000) not valid;

-- 3) RLS: tylko właściciel i tylko zalogowani (role anon traci dostęp do tabel)
alter policy bni_cards_all    on public.bni_cards    to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy bni_contacts_all on public.bni_contacts to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy bni_links_all    on public.bni_links    to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy bni_settings_all on public.bni_settings to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- 4) Publiczny odczyt TYLKO udostępnionej wizytówki (cel kodu QR).
--    Listy osób są zwracane tylko, gdy właściciel na to pozwolił (data.showLists != false).
create or replace function public.get_public_card(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'card', case when coalesce((c.data->>'showLists')::boolean, true) then c.data else (c.data - 'offered' - 'sought') end,
    'logo', (select s.data from public.bni_settings s where s.id = 'logo:' || c.owner::text and s.owner = c.owner)
  )
  from public.bni_cards c
  where c.id = p_id and c.shared
  limit 1
$$;
revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;

-- Stare, fikcyjne wiersze demonstracyjne mają owner = NULL, więc po tej migracji są niewidoczne dla wszystkich.
-- Opcjonalne sprzątanie (kasuje dane!):
--   delete from public.bni_links    where owner is null;
--   delete from public.bni_cards    where owner is null;
--   delete from public.bni_contacts where owner is null;
--   delete from public.bni_settings where owner is null;
