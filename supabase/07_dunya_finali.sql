-- =========================================================
-- PitWall Manager — DÜNYA TURNUVASI ve SEZON GEÇİŞİ (6. aşama)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- 01, 02, 05 ve 06 daha önce çalıştırılmış olmalı.
--
-- Sezon akışı (30 gün):
--   1-25. gün : ülke ligleri (her ülke kendi saatiyle 20:00)
--   26. gün   : ELEME   — ülke ikincileri 4 grupta, grup birincileri devam eder
--   27-28. gün: GRUPLAR — ülke şampiyonları + 4 eleme galibi, 11'erli 4 grup, 2 yarış, ilk 3 devam eder
--   29-30. gün: FİNAL   — 12 takım, 2 yarış, dünya şampiyonu belirlenir
--   Sonra     : kupalar, ödüller, kısmi sıfırlama ve yeni sezon
-- Dünya yarışları herkes için aynı anda: 18:00 UTC (Türkiye saatiyle 21:00).
-- =========================================================

-- ---------- Yarışlara sezon ve dünya grubu bilgisi ----------
alter table public.races add column if not exists season_id int references public.seasons(id);
update public.races r set season_id = l.season_id from public.leagues l where l.id = r.league_id and r.season_id is null;
alter table public.races alter column league_id drop not null;
alter table public.races drop constraint if exists races_round_check;
alter table public.races add constraint races_round_check check (round between 1 and 30);
alter table public.races drop constraint if exists races_league_id_round_key;
create unique index if not exists races_league_season_round on public.races (league_id, season_id, round) where league_id is not null;
alter table public.races add column if not exists world_group_id uuid;
alter table public.races add column if not exists title text;

-- Lig yarışı eklenirken sezonu ligden otomatik al
create or replace function public.races_fill_season()
returns trigger language plpgsql as $$
begin
  if new.season_id is null and new.league_id is not null then
    select season_id into new.season_id from public.leagues where id = new.league_id;
  end if;
  return new;
end;
$$;
drop trigger if exists races_fill_season on public.races;
create trigger races_fill_season before insert on public.races
  for each row execute function public.races_fill_season();

-- ---------- Dünya turnuvası tabloları ----------
create table if not exists public.world_groups (
  id          uuid primary key default gen_random_uuid(),
  season_id   int  not null references public.seasons(id),
  stage       text not null check (stage in ('playin', 'group', 'final')),
  name        text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.world_group_teams (
  group_id   uuid not null references public.world_groups(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  seed_info  text,                    -- örn. "Türkiye şampiyonu"
  points     int  not null default 0,
  best_pos   int,
  primary key (group_id, team_id)
);

alter table public.races drop constraint if exists races_world_group_fk;
alter table public.races add constraint races_world_group_fk
  foreign key (world_group_id) references public.world_groups(id) on delete cascade;
create index if not exists races_world_group_idx on public.races(world_group_id);
create index if not exists races_season_idx on public.races(season_id);

-- Kupalar (kalıcı; takım silinse bile kayıt kalır)
create table if not exists public.trophies (
  id             uuid primary key default gen_random_uuid(),
  season_number  int  not null,
  team_id        uuid references public.teams(id) on delete set null,
  owner_id       uuid references public.profiles(id) on delete set null,
  team_name      text not null,
  kind           text not null,
  label          text not null,
  created_at     timestamptz not null default now()
);
create index if not exists trophies_team_idx on public.trophies(team_id);

alter table public.world_groups      enable row level security;
alter table public.world_group_teams enable row level security;
alter table public.trophies          enable row level security;
drop policy if exists "herkes okur" on public.world_groups;
drop policy if exists "herkes okur" on public.world_group_teams;
drop policy if exists "herkes okur" on public.trophies;
create policy "herkes okur" on public.world_groups      for select using (true);
create policy "herkes okur" on public.world_group_teams for select using (true);
create policy "herkes okur" on public.trophies          for select using (true);

-- ---------- Sıralama yardımcıları ----------
-- Lig sıralaması: puan, sonra galibiyet sayısı, sonra isim
create or replace function public.league_ranking(p_league uuid, p_season int)
returns table (team_id uuid, rk int) language sql stable set search_path = public as $$
  select t.id,
         (row_number() over (order by t.points desc,
           (select count(*) from race_results rr join races r on r.id = rr.race_id
            where rr.team_id = t.id and rr.pos = 1 and r.season_id = p_season) desc,
           t.name))::int
  from teams t where t.league_id = p_league;
$$;

-- Dünya grubu sıralaması: puan, sonra en iyi bitiriş, sonra isim
create or replace function public.world_group_ranking(p_group uuid)
returns table (team_id uuid, rk int) language sql stable set search_path = public as $$
  select g.team_id, (row_number() over (order by g.points desc, coalesce(g.best_pos, 99), t.name))::int
  from world_group_teams g join teams t on t.id = g.team_id
  where g.group_id = p_group;
$$;

-- ---------- Bir ligin sezon takvimini oluştur ----------
create or replace function public.create_league_races(p_league uuid, p_season int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tracks text[] := array['bhr','sau','aus','jpn','chn','mia','imo','mon','can','esp','aut','gbr','hun',
                           'bel','ned','ita','aze','sgp','tur','usa','mex','bra','lvg','qat','abu'];
  v_country countries%rowtype;
  v_season seasons%rowtype;
  v_when timestamptz;
  i int;
begin
  select c.* into v_country from leagues l join countries c on c.code = l.country_code where l.id = p_league;
  select * into v_season from seasons where id = p_season;
  for i in 1..25 loop
    v_when := ((v_season.start_date + (i - 1))::timestamp + make_time(v_country.race_hour, 0, 0)) at time zone v_country.timezone;
    insert into races (league_id, season_id, round, track_id, scheduled_at, status, seed)
    values (p_league, p_season, i, v_tracks[i], v_when,
            case when v_when < now() then 'skipped' else 'scheduled' end,
            floor(random() * 4294967295)::bigint);
  end loop;
end;
$$;

-- ---------- Dünya yarışı ekle (18:00 UTC) ----------
create or replace function public.world_add_race(p_group uuid, p_season int, p_day int, p_track text, p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_season seasons%rowtype;
  v_when timestamptz;
begin
  select * into v_season from seasons where id = p_season;
  v_when := ((v_season.start_date + (p_day - 1))::timestamp + time '18:00') at time zone 'UTC';
  -- Aşama geç oluştuysa oyunculara strateji kurmaları için en az 30 dakika ver
  if v_when < now() + interval '30 minutes' then v_when := now() + interval '30 minutes'; end if;
  insert into races (league_id, world_group_id, season_id, round, track_id, scheduled_at, status, seed, title)
  values (null, p_group, p_season, p_day, p_track, v_when, 'scheduled', floor(random() * 4294967295)::bigint, p_title);
end;
$$;

-- Takımları gruplara dağıt (kura) ve her gruba yarışlarını ekle
create or replace function public.world_make_stage(
  p_season int, p_stage text, p_prefix text, p_ids uuid[], p_infos text[], p_groups int,
  p_days int[], p_tracks text[], p_titles text[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  letters text := 'ABCDEFGHIJKLMNOP';
  v_groups uuid[] := '{}';
  v_gid uuid;
  v_name text;
  n int := coalesce(array_length(p_ids, 1), 0);
  i int;
  k int;
begin
  for i in 1..greatest(1, p_groups) loop
    v_name := case when p_groups <= 1 then p_prefix else p_prefix || ' ' || substr(letters, i, 1) end;
    insert into world_groups (season_id, stage, name, sort) values (p_season, p_stage, v_name, i) returning id into v_gid;
    v_groups := v_groups || v_gid;
    if n > 0 then
      for k in 1..array_length(p_days, 1) loop
        perform world_add_race(v_gid, p_season, p_days[k], p_tracks[k], v_name || p_titles[k]);
      end loop;
    end if;
  end loop;
  for i in 1..n loop
    insert into world_group_teams (group_id, team_id, seed_info)
    values (v_groups[1 + (i - 1) % greatest(1, p_groups)], p_ids[i], p_infos[i]);
  end loop;
end;
$$;

-- ---------- Aşamaları otomatik ilerlet ----------
-- Sunucu fonksiyonu bunu her 5 dakikada bir çağırır. Ne yapılacaksa yapar,
-- yapacak bir şey yoksa hiçbir şeyi değiştirmez (tekrar çağırmak güvenlidir).
create or replace function public.advance_world()
returns text language plpgsql security definer set search_path = public as $$
declare
  s seasons%rowtype;
  v_ids uuid[];
  v_infos text[];
  n int;
begin
  select * into s from seasons where status = 'active' order by number desc limit 1;
  if not found then return 'aktif sezon yok'; end if;

  -- Aynı anda iki çağrı gelirse ikincisi beklesin
  perform pg_advisory_xact_lock(hashtext('pitwall_advance_world'));

  -- 1) ELEME: lig sezonu bitince
  if not exists (select 1 from world_groups where season_id = s.id) then
    if now() < ((s.start_date + 25)::timestamp at time zone 'UTC') then return 'lig sezonu sürüyor'; end if;
    if exists (select 1 from races where season_id = s.id and league_id is not null and status in ('scheduled', 'running')) then
      return 'son lig yarışları bekleniyor';
    end if;
    select array_agg(q.team_id order by q.rnd), array_agg(q.info order by q.rnd) into v_ids, v_infos
    from (select lr.team_id, c.name || ' ikincisi' as info, random() as rnd
          from leagues l join countries c on c.code = l.country_code
          cross join lateral league_ranking(l.id, s.id) lr
          where l.season_id = s.id and l.tier = 1 and lr.rk = 2) q;
    n := coalesce(array_length(v_ids, 1), 0);
    perform world_make_stage(s.id, 'playin', 'Eleme', v_ids, v_infos, least(4, greatest(1, n / 2)),
                             array[26], array['tur'], array['']);
    return 'eleme turu oluşturuldu (' || n || ' takım)';
  end if;

  -- 2) GRUPLAR: eleme bitince
  if not exists (select 1 from world_groups where season_id = s.id and stage = 'group') then
    if exists (select 1 from races r join world_groups g on g.id = r.world_group_id
               where g.season_id = s.id and g.stage = 'playin' and r.status <> 'finished') then
      return 'eleme sürüyor';
    end if;
    select array_agg(q.team_id order by q.rnd), array_agg(q.info order by q.rnd) into v_ids, v_infos
    from (
      select lr.team_id, c.name || ' şampiyonu' as info, random() as rnd
      from leagues l join countries c on c.code = l.country_code
      cross join lateral league_ranking(l.id, s.id) lr
      where l.season_id = s.id and l.tier = 1 and lr.rk = 1
      union all
      select wr.team_id, g.name || ' galibi', random()
      from world_groups g cross join lateral world_group_ranking(g.id) wr
      where g.season_id = s.id and g.stage = 'playin' and wr.rk = 1
    ) q;
    n := coalesce(array_length(v_ids, 1), 0);
    perform world_make_stage(s.id, 'group', 'Grup', v_ids, v_infos, greatest(1, ceil(n / 11.0)::int),
                             array[27, 28], array['bel', 'jpn'], array[' · 1. yarış', ' · 2. yarış']);
    return 'grup aşaması oluşturuldu (' || n || ' takım)';
  end if;

  -- 3) FİNAL: gruplar bitince, her grubun ilk 3'ü
  if not exists (select 1 from world_groups where season_id = s.id and stage = 'final') then
    if exists (select 1 from races r join world_groups g on g.id = r.world_group_id
               where g.season_id = s.id and g.stage = 'group' and r.status <> 'finished') then
      return 'grup aşaması sürüyor';
    end if;
    select array_agg(q.team_id order by q.rnd), array_agg(q.info order by q.rnd) into v_ids, v_infos
    from (select wr.team_id, g.name || ' ' || wr.rk || '.' as info, random() as rnd
          from world_groups g cross join lateral world_group_ranking(g.id) wr
          where g.season_id = s.id and g.stage = 'group' and wr.rk <= 3) q;
    perform world_make_stage(s.id, 'final', 'Büyük Final', v_ids, v_infos, 1,
                             array[29, 30], array['bra', 'abu'], array[' · 1. yarış', ' · 2. yarış']);
    return 'final oluşturuldu (' || coalesce(array_length(v_ids, 1), 0) || ' takım)';
  end if;

  -- 4) SEZON SONU: final bitince
  if exists (select 1 from races r join world_groups g on g.id = r.world_group_id
             where g.season_id = s.id and g.stage = 'final' and r.status <> 'finished') then
    return 'final sürüyor';
  end if;
  perform finish_season(s.id);
  return 'sezon ' || s.number || ' bitti, yeni sezon başladı';
end;
$$;

-- ---------- Dünya yarışı sonucunu yaz ----------
create or replace function public.finish_world_race(p_race uuid, p_results jsonb, p_replay jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_race races%rowtype;
begin
  select * into v_race from races where id = p_race for update;
  if not found then raise exception 'Yarış bulunamadı'; end if;
  if v_race.world_group_id is null then raise exception 'Bu bir dünya yarışı değil'; end if;
  if v_race.status <> 'running' then raise exception 'Yarış işlenmeye hazır değil (durum: %)', v_race.status; end if;

  insert into race_results (race_id, driver_id, team_id, pos, grid, points, total, best, dnf, pits)
  select p_race, (x->>'driver_id')::uuid, (x->>'team_id')::uuid, (x->>'pos')::int, (x->>'grid')::int,
         (x->>'points')::int, (x->>'total')::numeric, nullif(x->>'best', '')::numeric,
         coalesce((x->>'dnf')::boolean, false), coalesce((x->>'pits')::int, 0)
  from jsonb_array_elements(p_results) x;

  update world_group_teams gt set
    points   = gt.points + x.pts,
    best_pos = least(coalesce(gt.best_pos, 99), x.bp)
  from (select team_id, sum(points)::int as pts, min(case when dnf then 99 else pos end) as bp
        from race_results where race_id = p_race group by team_id) x
  where gt.group_id = v_race.world_group_id and gt.team_id = x.team_id;

  update races set status = 'finished', replay = p_replay, finished_at = now() where id = p_race;
end;
$$;

-- ---------- Sezonu bitir: kupalar, ödüller, kısmi sıfırlama, yeni sezon ----------
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

  -- Takımlar: araç 80'e doğru yarı yarıya geri çekilir, geliştirme seviyeleri yarıya iner,
  -- para: 2.000.000 + kalan paranın dörtte biri + dünya turnuvası ödülü
  update teams t set
    points      = 0,
    engine      = 80 + (t.engine - 80) / 2,
    aero        = 80 + (t.aero - 80) / 2,
    chassis     = 80 + (t.chassis - 80) / 2,
    reliability = 80 + (t.reliability - 80) / 2,
    pitcrew     = 80 + (t.pitcrew - 80) / 2,
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

  -- Pilotlar: şampiyona puanı sıfırlanır, 80 üstündeki özellikler %25 geri çekilir (gelişim puanları kalır)
  update drivers d set
    points      = 0,
    pace        = d.pace        - greatest(0, round((d.pace - 80) * 0.25))::int,
    racecraft   = d.racecraft   - greatest(0, round((d.racecraft - 80) * 0.25))::int,
    tyres       = d.tyres       - greatest(0, round((d.tyres - 80) * 0.25))::int,
    consistency = d.consistency - greatest(0, round((d.consistency - 80) * 0.25))::int
  from teams t join leagues l on l.id = t.league_id
  where d.team_id = t.id and l.season_id = p_season;

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

-- ---------- Yarış girdisi: dünya yarışlarında takımlar gruptan gelir ----------
create or replace function public.race_input(p_race uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'race_id', r.id,
    'track_id', r.track_id,
    'seed', r.seed,
    'round', r.round,
    'title', r.title,
    'teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color, 'owner_id', t.owner_id,
        'engine', t.engine, 'aero', t.aero, 'chassis', t.chassis,
        'reliability', t.reliability, 'pitcrew', t.pitcrew,
        'drivers', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', d.id, 'seat', d.seat, 'name', d.name, 'skill', d.skill,
                      'pace', d.pace, 'racecraft', d.racecraft, 'tyres', d.tyres, 'consistency', d.consistency
                    ) order by d.seat), '[]'::jsonb)
                    from drivers d where d.team_id = t.id)
      ) order by t.id), '[]'::jsonb)
      from teams t
      where (r.league_id is not null and t.league_id = r.league_id)
         or (r.world_group_id is not null and t.id in (select team_id from world_group_teams where group_id = r.world_group_id))
    ),
    'strategies', (
      select coalesce(jsonb_agg(jsonb_build_object('driver_id', s.driver_id, 'plan', s.plan)), '[]'::jsonb)
      from strategies s where s.race_id = r.id
    )
  )
  from races r where r.id = p_race;
$$;

-- ---------- Yetkiler: bunları sadece sunucu çağırabilir ----------
revoke execute on function public.race_input(uuid)                         from public, anon, authenticated;
revoke execute on function public.advance_world()                          from public, anon, authenticated;
revoke execute on function public.finish_world_race(uuid, jsonb, jsonb)    from public, anon, authenticated;
revoke execute on function public.finish_season(int)                       from public, anon, authenticated;
revoke execute on function public.create_league_races(uuid, int)           from public, anon, authenticated;
revoke execute on function public.world_add_race(uuid, int, int, text, text) from public, anon, authenticated;
revoke execute on function public.world_make_stage(int, text, text, uuid[], text[], int, int[], text[], text[]) from public, anon, authenticated;
grant  execute on function public.race_input(uuid)                         to service_role;
grant  execute on function public.advance_world()                          to service_role;
grant  execute on function public.finish_world_race(uuid, jsonb, jsonb)    to service_role;

-- Kontrol
select public.advance_world() as dunya_durumu;
