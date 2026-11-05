-- =========================================================
-- PitWall Manager — HER ÜLKEDE BİR LİG (botlarla dolu)
-- Henüz ligi olmayan her ülke için 11 bot takımlı bir 1. Lig açar.
-- Oyuncular katıldıkça bu liglerdeki bot takımları devralır.
-- Dosyayı tekrar çalıştırmak güvenlidir: ligi olan ülkeye dokunmaz.
-- =========================================================
do $$
declare
  c record;
  s int;
begin
  select id into s from public.seasons where status = 'active' order by number desc limit 1;
  if s is null then raise exception 'Aktif sezon yok'; end if;

  for c in
    select code from public.countries
    where code not in (select country_code from public.leagues where season_id = s)
    order by code
  loop
    perform public.create_league(c.code, s);
  end loop;
end $$;

-- Kontrol: kaç lig, kaç takım, kaç yarış var?
select
  (select count(*) from public.leagues l join public.seasons s on s.id = l.season_id and s.status = 'active') as lig,
  (select count(*) from public.teams t join public.leagues l on l.id = t.league_id join public.seasons s on s.id = l.season_id and s.status = 'active') as takim,
  (select count(*) from public.races r join public.leagues l on l.id = r.league_id join public.seasons s on s.id = l.season_id and s.status = 'active') as yaris;
