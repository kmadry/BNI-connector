-- Anonimowe liczniki: ile osób utworzyło wizytówkę i które przyszłe funkcje wzbudzają zainteresowanie. Bez danych osobowych.
create table if not exists public.bni_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('card_created','wish_print','wish_check','wish_confirm')),
  created_at timestamptz not null default now()
);
alter table public.bni_events enable row level security;
revoke all on public.bni_events from anon, authenticated;
create or replace function public.record_event(p_kind text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.bni_events(kind) select p_kind where p_kind in ('card_created','wish_print','wish_check','wish_confirm')
$$;
revoke all on function public.record_event(text) from public;
grant execute on function public.record_event(text) to anon, authenticated;
