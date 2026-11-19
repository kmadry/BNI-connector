-- Utwardzenie po przeglądzie bezpieczeństwa.
-- 1) Uprawnienia: anon nie ma żadnego dostępu do tabel; zalogowani tylko SELECT/INSERT/UPDATE/DELETE (bez TRUNCATE itd.)
revoke all on public.bni_cards, public.bni_links, public.bni_contacts, public.bni_settings from anon;
revoke truncate, references, trigger on public.bni_cards, public.bni_links, public.bni_contacts, public.bni_settings from authenticated;

-- 2) Powiązania: oba końce muszą być moimi kartami (brak „wyroczni” istnienia cudzych id)
drop policy if exists bni_links_all on public.bni_links;
create policy bni_links_sel on public.bni_links for select to authenticated using (owner = (select auth.uid()));
create policy bni_links_del on public.bni_links for delete to authenticated using (owner = (select auth.uid()));
create policy bni_links_ins on public.bni_links for insert to authenticated
  with check (owner = (select auth.uid())
    and exists (select 1 from public.bni_cards c where c.id = from_id and c.owner = (select auth.uid()))
    and exists (select 1 from public.bni_cards c where c.id = to_id and c.owner = (select auth.uid())));
create policy bni_links_upd on public.bni_links for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid())
    and exists (select 1 from public.bni_cards c where c.id = from_id and c.owner = (select auth.uid()))
    and exists (select 1 from public.bni_cards c where c.id = to_id and c.owner = (select auth.uid())));

-- 3) Ustawienia: tylko własny klucz logo
alter table public.bni_settings drop constraint if exists bni_settings_id_shape;
alter table public.bni_settings add constraint bni_settings_id_shape check (id = 'logo:' || owner::text) not valid;

-- 4) Limit liczby wierszy na użytkownika (ochrona przed zapchaniem bazy)
create or replace function public.bni_row_cap() returns trigger language plpgsql set search_path = public, pg_temp as $$
declare n int; cap int := case tg_table_name when 'bni_contacts' then 5000 when 'bni_links' then 5000 else 1000 end;
begin
  execute format('select count(*) from public.%I where owner = $1', tg_table_name) into n using new.owner;
  if n >= cap then raise exception 'Limit % wierszy w %', cap, tg_table_name using errcode = '54000'; end if;
  return new;
end $$;
drop trigger if exists bni_cards_cap on public.bni_cards; create trigger bni_cards_cap before insert on public.bni_cards for each row execute function public.bni_row_cap();
drop trigger if exists bni_links_cap on public.bni_links; create trigger bni_links_cap before insert on public.bni_links for each row execute function public.bni_row_cap();
drop trigger if exists bni_contacts_cap on public.bni_contacts; create trigger bni_contacts_cap before insert on public.bni_contacts for each row execute function public.bni_row_cap();

-- 5) Funkcja publiczna: odporna na dziwne wartości showLists, search_path z pg_temp na końcu
create or replace function public.get_public_card(p_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'card', case when c.data->'showLists' = 'false'::jsonb then (c.data - 'offered' - 'sought') else c.data end,
    'logo', (select s.data from public.bni_settings s where s.id = 'logo:' || c.owner::text and s.owner = c.owner)
  )
  from public.bni_cards c where c.id = p_id and c.shared limit 1
$$;
revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;
