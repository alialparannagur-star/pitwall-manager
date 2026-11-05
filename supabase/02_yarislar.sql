-- =========================================================
-- PitWall Manager — GÜNLÜK YARIŞLAR (4. aşama)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- 01_kurulum.sql daha önce çalıştırılmış olmalı.
-- =========================================================

-- Yarış durumu: 'running' (sunucu şu an hesaplıyor) eklendi
alter table public.races drop constraint if exists races_status_check;
alter table public.races add constraint races_status_check
  check (status in ('scheduled', 'running', 'finished', 'skipped'));
alter table public.races add column if not exists claimed_at timestamptz;
alter table public.races add column if not exists finished_at timestamptz;

-- Takım bazında yarış sonucu: puan ve kazanılan para
create table if not exists public.race_team_results (
  race_id      uuid not null references public.races(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  points       int not null default 0,
  prize        bigint not null default 0,
  rank_before  int not null,
  primary key (race_id, team_id)
);
alter table public.race_team_results enable row level security;
drop policy if exists "herkes okur" on public.race_team_results;
create policy "herkes okur" on public.race_team_results for select using (true);

-- ---------- 1) Zamanı gelen yarışları "kap" ----------
-- Aynı yarışın iki kez koşulmasını engeller. 10 dakikadan uzun süre
-- "running" kalan (yarıda kesilmiş) yarışlar yeniden denenir.
create or replace function public.claim_due_races(p_limit int default 20)
returns setof public.races language plpgsql security definer set search_path = public as $$
begin
  return query
  update races r set status = 'running', claimed_at = now()
  where r.id in (
    select x.id from races x
    where (x.status = 'scheduled' and x.scheduled_at <= now())
       or (x.status = 'running' and x.claimed_at < now() - interval '10 minutes')
    order by x.scheduled_at
    limit p_limit
    for update skip locked
  )
  returning r.*;
end;
$$;

-- ---------- 2) Yarış için gereken her şeyi tek seferde ver ----------
create or replace function public.race_input(p_race uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'race_id', r.id,
    'track_id', r.track_id,
    'seed', r.seed,
    'round', r.round,
    'teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color, 'owner_id', t.owner_id,
        'engine', t.engine, 'aero', t.aero, 'chassis', t.chassis,
        'reliability', t.reliability, 'pitcrew', t.pitcrew,
        'drivers', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'seat', d.seat, 'name', d.name, 'skill', d.skill) order by d.seat), '[]'::jsonb)
                    from drivers d where d.team_id = t.id)
      ) order by t.id), '[]'::jsonb)
      from teams t where t.league_id = r.league_id
    ),
    'strategies', (
      select coalesce(jsonb_agg(jsonb_build_object('driver_id', s.driver_id, 'plan', s.plan)), '[]'::jsonb)
      from strategies s where s.race_id = r.id
    )
  )
  from races r where r.id = p_race;
$$;

-- ---------- 3) Sonuçları yaz: puanlar, para ödülleri, bot geliştirmeleri ----------
-- Puanı eşit takımlar aynı sırayı paylaşır (ilk yarışta herkes 1.).
-- Ödül kuralları shared/data.js ile aynı:
--   katılım 300.000 + puan × 50.000 + (şampiyona sırası - 1) × 100.000
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
      exit when v_bot.money < v_cost or v_stat >= 99;
      update teams set
        money       = money - v_cost,
        levels      = jsonb_set(levels, array[v_part], to_jsonb(v_level + 1)),
        engine      = case when v_part = 'engine'      then least(99, engine      + case when engine      < 90 then 2 else 1 end) else engine end,
        aero        = case when v_part = 'aero'        then least(99, aero        + case when aero        < 90 then 2 else 1 end) else aero end,
        chassis     = case when v_part = 'chassis'     then least(99, chassis     + case when chassis     < 90 then 2 else 1 end) else chassis end,
        reliability = case when v_part = 'reliability' then least(99, reliability + case when reliability < 90 then 2 else 1 end) else reliability end,
        pitcrew     = case when v_part = 'pitcrew'     then least(99, pitcrew     + case when pitcrew     < 90 then 2 else 1 end) else pitcrew end
      where id = v_bot.id;
    end loop;
  end loop;

  update races set status = 'finished', replay = p_replay, finished_at = now() where id = p_race;
end;
$$;

-- Bu üç fonksiyonu sadece sunucu (yarış fonksiyonu) çağırabilir, oyuncular çağıramaz
revoke execute on function public.claim_due_races(int)            from public, anon, authenticated;
revoke execute on function public.race_input(uuid)                 from public, anon, authenticated;
revoke execute on function public.finish_race(uuid, jsonb, jsonb)  from public, anon, authenticated;
grant  execute on function public.claim_due_races(int)            to service_role;
grant  execute on function public.race_input(uuid)                 to service_role;
grant  execute on function public.finish_race(uuid, jsonb, jsonb)  to service_role;

-- Yarış tekrar verisi (replay) büyük olabilir; liste sorgularında çekilmez,
-- sadece yarış izlenirken çekilir. Okuma izni 01'deki "herkes okur" kuralıyla var.
