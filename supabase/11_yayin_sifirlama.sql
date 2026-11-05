-- =========================================================
-- PitWall Manager — YAYIN İÇİN TEMİZ BAŞLANGIÇ
-- ⚠️ DİKKAT: Bütün ligleri, takımları, pilotları, yarışları, sonuçları,
-- transferleri ve kupaları SİLER ve dünyayı baştan kurar.
-- Kullanıcı hesapları ve profiller KALIR: her oyuncu kendi ülkesinde
-- yeni bir takımı devralır, takım adı korunur.
-- Yeni sezon YARIN başlar (her ülkede yerel saatle 20:00).
-- =========================================================
do $$
declare
  v_start date := current_date + 1;
  v_season int;
  p record;
  v_team uuid;
  v_league uuid;
  c record;
begin
  -- Oyuncuların ülkesini ve takım adını sakla
  create temp table _keep on commit drop as
    select pr.id as uid, pr.country_code,
           (select t.name from public.teams t where t.owner_id = pr.id order by t.created_at desc limit 1) as team_name
    from public.profiles pr;

  -- Her şeyi temizle (hesaplar ve profiller hariç)
  delete from public.offers;
  delete from public.transfers;
  delete from public.trophies;
  delete from public.retirements;
  delete from public.world_groups;   -- dünya yarışları da silinir
  delete from public.leagues;        -- takımlar, pilotlar, lig yarışları, sonuçlar da silinir
  delete from public.drivers;        -- serbest pilotlar
  delete from public.seasons;

  -- 1. sezon ve her ülkede bir lig
  insert into public.seasons (number, start_date) values (1, v_start) returning id into v_season;
  for c in select code from public.countries order by code loop
    perform public.create_league(c.code, v_season);
  end loop;

  -- Oyuncuları ülkelerindeki bir takıma yerleştir
  for p in select * from _keep loop
    select t.id into v_team from public.teams t join public.leagues l on l.id = t.league_id
    where l.country_code = p.country_code and t.owner_id is null
    order by l.tier, random() limit 1;
    if v_team is null then
      v_league := public.create_league(p.country_code, v_season);
      select id into v_team from public.teams where league_id = v_league order by random() limit 1;
    end if;
    update public.teams set owner_id = p.uid, name = coalesce(nullif(p.team_name, ''), name) where id = v_team;
  end loop;

  -- Serbest pilot havuzu ve maaşlar
  perform public.fill_free_agents(150);
  update public.drivers set salary = public.driver_salary(skill, potential, age);
end $$;

-- Kontrol
select
  (select start_date from public.seasons where status = 'active') as sezon_baslangici,
  (select count(*) from public.leagues) as lig,
  (select count(*) from public.teams where owner_id is not null) as oyuncu_takimi,
  (select count(*) from public.races) as yaris,
  (select count(*) from public.drivers where team_id is null) as serbest_pilot;
