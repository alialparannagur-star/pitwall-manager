-- =========================================================
-- PitWall Manager — PİLOT PAZARI (8. aşama)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- 01, 02, 05, 06, 07 ve 08 daha önce çalıştırılmış olmalı.
--
-- • Serbest pilot havuzu (~150 pilot), her sezon yeni çaylaklarla yenilenir.
-- • Piyasa değeri = genel puan + potansiyel + yaş. Maaş = değerin %2'si, her lig yarışında ödenir.
-- • Transfer: bir pilot alırken bir pilotunu bırakırsın.
--     serbest pilot → piyasa değeri; bot takımın pilotu → değerin 1,3 katı (bıraktığın pilot o takıma gider)
--     bıraktığın pilotun değerinin yarısı sana geri döner. Sezonda en fazla 4 transfer.
-- =========================================================

-- Serbest pilotlar hiçbir takımda değildir (team_id boş)
alter table public.drivers alter column team_id drop not null;
alter table public.drivers alter column seat drop not null;
alter table public.drivers add column if not exists salary int not null default 0;
alter table public.drivers add column if not exists retired boolean not null default false;
create index if not exists drivers_free_idx on public.drivers(team_id) where team_id is null;

alter table public.race_team_results add column if not exists salaries bigint not null default 0;

-- Transfer kayıtları
create table if not exists public.transfers (
  id           uuid primary key default gen_random_uuid(),
  season_id    int  not null references public.seasons(id),
  driver_id    uuid references public.drivers(id) on delete set null,
  driver_name  text not null,
  from_team    uuid references public.teams(id) on delete set null,
  to_team      uuid references public.teams(id) on delete set null,
  price        bigint not null,
  kind         text not null,    -- 'free_agent' | 'from_bot' | 'released'
  created_at   timestamptz not null default now()
);
create index if not exists transfers_to_idx on public.transfers(to_team, season_id);
alter table public.transfers enable row level security;
drop policy if exists "herkes okur" on public.transfers;
create policy "herkes okur" on public.transfers for select using (true);

-- ---------- Piyasa değeri ve maaş (shared/data.js ile aynı formül) ----------
create or replace function public.driver_value(p_skill int, p_pot int, p_age int)
returns bigint language sql immutable as $$
  select (round((
      15000 * power(greatest(coalesce(p_skill, 50) - 35, 1), 1.8)
        * case when coalesce(p_age, 25) <= 22 then 1.2 when p_age <= 29 then 1.0 when p_age <= 35 then 0.8 else 0.5 end
    + 60000 * greatest(coalesce(p_pot, p_skill) - p_skill, 0)
        * case when coalesce(p_age, 25) <= 22 then 2 when p_age <= 26 then 1.3 else 0.6 end
  ) / 10000) * 10000)::bigint;
$$;

create or replace function public.driver_salary(p_skill int, p_pot int, p_age int)
returns int language sql immutable as $$
  select (round(public.driver_value(p_skill, p_pot, p_age) * 0.02 / 1000) * 1000)::int;
$$;

-- ---------- Serbest pilot üret ----------
-- p_kind: 'rookie' (17-20, düşük ama potansiyelli), 'mid' (21-30), 'vet' (31-37)
create or replace function public.make_free_agent(p_kind text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_nat text := pick_nationality(null);
  v_age int;
  v_total int;
  v_pot int;
  a int[];
  v_id uuid;
begin
  if p_kind = 'rookie' then
    v_age := 17 + floor(random() * 4)::int;
    v_total := 4 * (38 + floor(random() * 12)::int);
  elsif p_kind = 'vet' then
    v_age := 31 + floor(random() * 7)::int;
    v_total := 4 * (50 + floor(random() * 13)::int);
  else
    v_age := 21 + floor(random() * 10)::int;
    v_total := 4 * (44 + floor(random() * 17)::int);
  end if;
  a := random_attrs2(v_total, 8);
  v_pot := case p_kind
    when 'rookie' then least(97, greatest(v_total / 4 + 8, 58 + floor(power(random(), 2.5) * 40)::int))
    else potential_for(v_total / 4, v_age) end;
  insert into drivers (team_id, seat, nationality, name, age, pace, racecraft, tyres, consistency, potential, dev_points, points, races)
  values (null, null, v_nat, driver_name(v_nat), v_age, a[1], a[2], a[3], a[4], v_pot, 0, 0, 0)
  returning id into v_id;
  update drivers set salary = driver_salary(skill, potential, age) where id = v_id;
  return v_id;
end;
$$;

-- Havuzu belirli bir sayıya tamamla
create or replace function public.fill_free_agents(p_target int)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  k int := 0;
  r float;
begin
  select count(*) into n from drivers where team_id is null and not retired;
  while n + k < p_target loop
    r := random();
    perform make_free_agent(case when r < 0.35 then 'rookie' when r < 0.8 then 'mid' else 'vet' end);
    k := k + 1;
  end loop;
  return k;
end;
$$;

-- ---------- Transfer ----------
create or replace function public.sign_driver(p_target uuid, p_out uuid)
returns public.drivers language plpgsql security definer set search_path = public as $$
declare
  me teams%rowtype;
  src teams%rowtype;
  tgt drivers%rowtype;
  outd drivers%rowtype;
  v_season int;
  v_price bigint;
  v_back bigint;
  v_seat int;
  v_tseat int;
  v_count int;
begin
  select t.* into me from teams t
    join leagues l on l.id = t.league_id
    join seasons s on s.id = l.season_id and s.status = 'active'
  where t.owner_id = auth.uid()
  limit 1 for update of t;
  if not found then raise exception 'Takımın bulunamadı'; end if;
  select l.season_id into v_season from leagues l where l.id = me.league_id;

  select count(*) into v_count from transfers where to_team = me.id and season_id = v_season and kind <> 'released';
  if v_count >= 4 then raise exception 'Bu sezon transfer hakkını doldurdun (en fazla 4)'; end if;

  select * into outd from drivers where id = p_out and team_id = me.id for update;
  if not found then raise exception 'Bırakacağın pilot senin takımında değil'; end if;

  select * into tgt from drivers where id = p_target for update;
  if not found or tgt.retired then raise exception 'Pilot bulunamadı'; end if;
  if tgt.team_id = me.id then raise exception 'Bu pilot zaten senin takımında'; end if;

  if tgt.team_id is not null then
    select * into src from teams where id = tgt.team_id for update;
    if src.owner_id is not null then raise exception 'Bu pilot bir oyuncunun takımında. Oyuncular arası transfer yakında!'; end if;
    v_price := round(driver_value(tgt.skill, tgt.potential, tgt.age) * 1.3 / 10000) * 10000;
  else
    v_price := driver_value(tgt.skill, tgt.potential, tgt.age);
  end if;
  v_back := round(driver_value(outd.skill, outd.potential, outd.age) * 0.5 / 10000) * 10000;
  if me.money + v_back < v_price then raise exception 'Yeterli paran yok'; end if;

  v_seat := outd.seat;
  v_tseat := tgt.seat;
  -- 1) Hedef pilotu geçici olarak boşa al, 2) bırakılan pilotu yerine koy, 3) hedef pilotu takımına al
  update drivers set team_id = null, seat = null where id = tgt.id;
  update drivers set team_id = src.id, seat = case when src.id is null then null else v_tseat end where id = outd.id;
  update drivers set team_id = me.id, seat = v_seat, salary = driver_salary(skill, potential, age) where id = tgt.id
  returning * into tgt;

  update teams set money = money - v_price + v_back where id = me.id;
  if src.id is not null then update teams set money = money + v_price where id = src.id; end if;

  -- Bu pilotların henüz koşulmamış yarışlar için kayıtlı stratejileri silinir
  delete from strategies where driver_id in (tgt.id, outd.id)
    and race_id in (select id from races where status = 'scheduled');

  insert into transfers (season_id, driver_id, driver_name, from_team, to_team, price, kind)
  values (v_season, tgt.id, tgt.name, src.id, me.id, v_price, case when src.id is null then 'free_agent' else 'from_bot' end),
         (v_season, outd.id, outd.name, me.id, src.id, v_back, 'released');
  return tgt;
end;
$$;

-- ---------- Maaşlar: her lig yarışından sonra ödenir ----------
create or replace function public.races_pay_salaries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and new.league_id is not null then
    update race_team_results r set salaries = x.sal
    from (select d.team_id, sum(d.salary)::bigint as sal from drivers d join teams t on t.id = d.team_id
          where t.league_id = new.league_id group by d.team_id) x
    where r.race_id = new.id and r.team_id = x.team_id;
    update teams t set money = t.money - x.sal
    from (select d.team_id, sum(d.salary)::bigint as sal from drivers d join teams tt on tt.id = d.team_id
          where tt.league_id = new.league_id group by d.team_id) x
    where t.id = x.team_id;
  end if;
  return new;
end;
$$;
drop trigger if exists races_pay_salaries on public.races;
create trigger races_pay_salaries after update of status on public.races
  for each row execute function public.races_pay_salaries();

-- ---------- Sezon başı: havuzu yaşlandır/yenile, maaşları güncelle ----------
create or replace function public.market_new_season(p_new_season int)
returns void language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_amt int;
  v_attr text;
  k int;
begin
  -- Serbest pilotlar da yaşlanır (antrenmansız oldukları için daha yavaş gelişir)
  for d in select id, age from drivers where team_id is null and not retired loop
    v_amt := case when d.age <= 22 then 6 when d.age <= 29 then 3 else 0 end;
    for k in 1..v_amt loop
      v_attr := null;
      select x.a into v_attr from drivers dd,
        lateral (values ('pace', dd.pace), ('racecraft', dd.racecraft), ('tyres', dd.tyres), ('consistency', dd.consistency)) as x(a, v)
      where dd.id = d.id and x.v < least(99, coalesce(dd.potential, 99) + 6)
        and dd.pace + dd.racecraft + dd.tyres + dd.consistency < 4 * coalesce(dd.potential, 99)
      order by random() limit 1;
      exit when v_attr is null;
      update drivers set pace = pace + (v_attr = 'pace')::int, racecraft = racecraft + (v_attr = 'racecraft')::int,
        tyres = tyres + (v_attr = 'tyres')::int, consistency = consistency + (v_attr = 'consistency')::int where id = d.id;
    end loop;
    update drivers set age = age + 1, retired = (age + 1 >= 38) where id = d.id;
  end loop;

  perform fill_free_agents(150);

  -- Herkesin maaşı yeni değerine göre güncellenir
  update drivers set salary = driver_salary(skill, potential, age) where not retired;
end;
$$;

-- Sezon sonu fonksiyonu: yaşlanmadan sonra pazar da yenilenir
create or replace function public.finish_season(p_season int)
returns void language plpgsql security definer set search_path = public as $$
declare
  s seasons%rowtype;
  v_new int;
  v_final uuid;
  v_league record;
begin
  select * into s from seasons where id = p_season;
  select id into v_final from world_groups where season_id = p_season and stage = 'final' limit 1;

  -- Kupalar: dünya finali
  insert into trophies (season_number, team_id, owner_id, team_name, kind, label)
  select s.number, t.id, t.owner_id, t.name,
         case wr.rk when 1 then 'world_champion' when 2 then 'world_second' when 3 then 'world_third' else 'world_finalist' end,
         case wr.rk when 1 then '🏆 Dünya Şampiyonu' when 2 then '🥈 Dünya İkincisi' when 3 then '🥉 Dünya Üçüncüsü' else '🌍 Dünya Finalisti' end
           || ' · Sezon ' || s.number
  from world_group_ranking(v_final) wr join teams t on t.id = wr.team_id;

  -- Kupalar: lig şampiyonları
  insert into trophies (season_number, team_id, owner_id, team_name, kind, label)
  select s.number, t.id, t.owner_id, t.name, 'league_champion', '🏅 ' || l.name || ' Şampiyonu · Sezon ' || s.number
  from leagues l cross join lateral league_ranking(l.id, p_season) lr join teams t on t.id = lr.team_id
  where l.season_id = p_season and lr.rk = 1;

  -- Yeni sezon (final gününün ertesi günü başlar)
  insert into seasons (number, start_date) values (s.number + 1, greatest(s.start_date + 30, current_date))
  returning id into v_new;
  update seasons set status = 'finished' where id = p_season;

  -- Takımlar: araç 50'ye doğru yarı yarıya geri çekilir (kural değişikliği), geliştirme seviyeleri yarıya iner,
  -- para: 2.000.000 + kalan paranın dörtte biri + dünya turnuvası ödülü
  update teams t set
    points      = 0,
    engine      = 50 + (t.engine - 50) / 2,
    aero        = 50 + (t.aero - 50) / 2,
    chassis     = 50 + (t.chassis - 50) / 2,
    reliability = 50 + (t.reliability - 50) / 2,
    pitcrew     = 50 + (t.pitcrew - 50) / 2,
    levels      = jsonb_build_object(
                    'engine', coalesce((t.levels->>'engine')::int, 0) / 2,
                    'aero', coalesce((t.levels->>'aero')::int, 0) / 2,
                    'chassis', coalesce((t.levels->>'chassis')::int, 0) / 2,
                    'reliability', coalesce((t.levels->>'reliability')::int, 0) / 2,
                    'pitcrew', coalesce((t.levels->>'pitcrew')::int, 0) / 2),
    money       = 2000000 + t.money / 4 + coalesce(
                    (select case wr.rk when 1 then 5000000 when 2 then 3000000 when 3 then 2000000 else 1000000 end
                     from world_group_ranking(v_final) wr where wr.team_id = t.id),
                    (select 500000 from world_group_teams gt join world_groups g on g.id = gt.group_id
                     where g.season_id = p_season and g.stage = 'group' and gt.team_id = t.id limit 1),
                    0)
  from leagues l
  where l.id = t.league_id and l.season_id = p_season;

  -- Pilotlar: şampiyona puanı sıfırlanır, sonra yaşlanır (gelişir / düşer / emekli olur)
  update drivers d set points = 0
  from teams t join leagues l on l.id = t.league_id
  where d.team_id = t.id and l.season_id = p_season;
  perform age_drivers(p_season, s.number);
  perform market_new_season(v_new);

  -- Ligler yeni sezona taşınır ve yeni takvimleri oluşturulur
  for v_league in select id from leagues where season_id = p_season loop
    update leagues set season_id = v_new where id = v_league.id;
    perform create_league_races(v_league.id, v_new);
  end loop;

  -- Yer açmak için eski lig yarışlarının tekrarları ve stratejileri silinir
  -- (sonuçlar ve dünya turnuvası tekrarları kalır)
  update races set replay = null where season_id = p_season and league_id is not null;
  delete from strategies where race_id in (select id from races where season_id = p_season);
end;
$$;

-- Yarış sonucu: botlar maaşlar için yedek para bırakır
create or replace function public.finish_race(p_race uuid, p_results jsonb, p_replay jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_race races%rowtype;
  v_team record;
  v_bot teams%rowtype;
  v_part text;
  v_level int;
  v_stat int;
  v_cost bigint;
  k int;
begin
  select * into v_race from races where id = p_race for update;
  if not found then raise exception 'Yarış bulunamadı'; end if;
  if v_race.status <> 'running' then raise exception 'Yarış işlenmeye hazır değil (durum: %)', v_race.status; end if;

  -- Pilot sonuçları
  insert into race_results (race_id, driver_id, team_id, pos, grid, points, total, best, dnf, pits)
  select p_race, (x->>'driver_id')::uuid, (x->>'team_id')::uuid, (x->>'pos')::int, (x->>'grid')::int,
         (x->>'points')::int, (x->>'total')::numeric, nullif(x->>'best', '')::numeric,
         coalesce((x->>'dnf')::boolean, false), coalesce((x->>'pits')::int, 0)
  from jsonb_array_elements(p_results) x;

  update drivers d set points = d.points + rr.points
  from race_results rr where rr.race_id = p_race and rr.driver_id = d.id;

  -- Takım puanları ve ödüller (destek parası için yarış ÖNCESİ sıralama kullanılır)
  for v_team in
    select t.id,
           rank() over (order by t.points desc) as rank_before,
           coalesce((select sum(rr.points) from race_results rr where rr.race_id = p_race and rr.team_id = t.id), 0)::int as pts
    from teams t where t.league_id = v_race.league_id
  loop
    insert into race_team_results (race_id, team_id, points, prize, rank_before)
    values (p_race, v_team.id, v_team.pts, 300000 + v_team.pts * 50000 + (v_team.rank_before - 1) * 100000, v_team.rank_before);

    update teams set
      points = points + v_team.pts,
      money  = money + 300000 + v_team.pts * 50000 + (v_team.rank_before - 1) * 100000
    where id = v_team.id;
  end loop;

  -- Botlar paralarını harcar (en zayıf parçadan başlayarak, en fazla 3 geliştirme)
  for v_bot in select * from teams where league_id = v_race.league_id and owner_id is null loop
    for k in 1..3 loop
      select * into v_bot from teams where id = v_bot.id;
      if random() < 0.75 then
        select p into v_part from (values ('engine', v_bot.engine), ('aero', v_bot.aero), ('chassis', v_bot.chassis)) as v(p, s) order by s, random() limit 1;
      else
        select p into v_part from (values ('reliability', v_bot.reliability), ('pitcrew', v_bot.pitcrew)) as v(p, s) order by s, random() limit 1;
      end if;
      v_level := coalesce((v_bot.levels ->> v_part)::int, 0);
      v_stat := case v_part when 'engine' then v_bot.engine when 'aero' then v_bot.aero when 'chassis' then v_bot.chassis
                            when 'reliability' then v_bot.reliability else v_bot.pitcrew end;
      v_cost := round(1000000 * power(1.5, v_level) / 10000) * 10000;
      -- Botlar 3 yarışlık maaş kadar yedek para tutar
      exit when v_bot.money - v_cost < 3 * (select coalesce(sum(salary), 0) from drivers where team_id = v_bot.id) or v_stat >= 99;
      update teams set
        money       = money - v_cost,
        levels      = jsonb_set(levels, array[v_part], to_jsonb(v_level + 1)),
        engine      = case when v_part = 'engine'      then least(99, engine      + case when engine < 70 then 3 when engine < 85 then 2 else 1 end) else engine end,
        aero        = case when v_part = 'aero'        then least(99, aero        + case when aero < 70 then 3 when aero < 85 then 2 else 1 end) else aero end,
        chassis     = case when v_part = 'chassis'     then least(99, chassis     + case when chassis < 70 then 3 when chassis < 85 then 2 else 1 end) else chassis end,
        reliability = case when v_part = 'reliability' then least(99, reliability + case when reliability < 70 then 3 when reliability < 85 then 2 else 1 end) else reliability end,
        pitcrew     = case when v_part = 'pitcrew'     then least(99, pitcrew     + case when pitcrew < 70 then 3 when pitcrew < 85 then 2 else 1 end) else pitcrew end
      where id = v_bot.id;
    end loop;
  end loop;

  update races set status = 'finished', replay = p_replay, finished_at = now() where id = p_race;
end;
$$;

revoke execute on function public.finish_race(uuid, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.finish_race(uuid, jsonb, jsonb) to service_role;
-- ---------- Yetkiler ----------
revoke execute on function public.sign_driver(uuid, uuid) from public, anon;
grant  execute on function public.sign_driver(uuid, uuid) to authenticated;
revoke execute on function public.make_free_agent(text) from public, anon, authenticated;
revoke execute on function public.fill_free_agents(int) from public, anon, authenticated;
revoke execute on function public.market_new_season(int) from public, anon, authenticated;
revoke execute on function public.finish_season(int) from public, anon, authenticated;

-- ---------- İlk kurulum: maaşlar ve serbest pilot havuzu ----------
update public.drivers set salary = public.driver_salary(skill, potential, age) where salary = 0;
select public.fill_free_agents(150) as eklenen_serbest_pilot;

-- Kontrol
select
  (select count(*) from public.drivers where team_id is null and not retired) as serbest_pilot,
  (select round(avg(public.driver_value(skill, potential, age)) / 1e6, 2) from public.drivers where team_id is not null) as ort_deger_milyon,
  (select round(avg(salary) / 1e3) from public.drivers where team_id is not null) as ort_maas_bin;
