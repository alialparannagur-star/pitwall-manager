-- =========================================================
-- PitWall Manager — BAŞARI ROZETLERİ (para ödüllü)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- Rozetler oyuncuya aittir; her rozet bir kez kazanılır ve ödülü takımın kasasına eklenir.
-- =========================================================

create table if not exists public.achievements_earned (
  user_id    uuid not null references auth.users(id) on delete cascade,
  code       text not null,
  team_id    uuid references public.teams(id) on delete set null,
  reward     bigint not null default 0,
  earned_at  timestamptz not null default now(),
  seen       boolean not null default false,
  primary key (user_id, code)
);
alter table public.achievements_earned enable row level security;
drop policy if exists "herkes okur" on public.achievements_earned;
create policy "herkes okur" on public.achievements_earned for select using (true);
grant select on public.achievements_earned to anon, authenticated;

-- Ödül miktarları (oyundaki rozet listesiyle aynı olmalı: ui/achievements.js)
create or replace function public.achievement_reward(p_code text)
returns bigint language sql immutable as $$
  select case p_code
    when 'first_points'  then 100000
    when 'fastest_lap'   then 150000
    when 'double_points' then 200000
    when 'first_podium'  then 250000
    when 'first_win'     then 500000
    when 'comeback'      then 500000
    when 'car_70'        then 500000
    when 'sponsor_10'    then 500000
    when 'double_podium' then 750000
    when 'rain_win'      then 750000
    when 'one_two'       then 1000000
    when 'wins_5'        then 1000000
    when 'races_50'      then 1000000
    when 'league_champ'  then 2000000
    when 'wins_25'       then 3000000
    when 'world_podium'  then 3000000
    when 'world_champ'   then 5000000
    else 0 end;
$$;

-- Rozeti ver (zaten varsa hiçbir şey yapmaz) ve ödülü takıma ekle
create or replace function public.award_achievement(p_user uuid, p_team uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reward bigint := achievement_reward(p_code);
begin
  if p_user is null then return; end if;
  insert into achievements_earned (user_id, code, team_id, reward)
  values (p_user, p_code, p_team, v_reward)
  on conflict (user_id, code) do nothing;
  if found and p_team is not null then
    update teams set money = money + v_reward where id = p_team;
  end if;
end;
$$;
revoke execute on function public.award_achievement(uuid, uuid, text) from public, anon, authenticated;

-- Her yarıştan sonra (lig ve dünya yarışları). Adı "zz" ile başlar ki maaş/sponsor tetikleyicilerinden sonra çalışsın.
create or replace function public.check_race_achievements(p_race uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  new races%rowtype;
  t record;
  v_best int; v_pts int; v_pod int; v_wet int; v_fast uuid;
begin
  select * into new from races where id = p_race;
  if not found or new.status <> 'finished' then return; end if;

  -- Islak yarış mı? (pist ıslaklığı en az %30'a çıktıysa)
  select coalesce(max((x)::int), 0) into v_wet
  from jsonb_array_elements_text(coalesce(new.replay->'wx', '[]'::jsonb)) x;
  -- En hızlı turu atan pilot
  select (new.replay->'entries'->((r->>'i')::int)->>'id')::uuid into v_fast
  from jsonb_array_elements(coalesce(new.replay->'results', '[]'::jsonb)) r
  where (r->>'fastest')::boolean limit 1;

  for t in
    select distinct tm.id, tm.owner_id, greatest(tm.engine, tm.aero, tm.chassis, tm.reliability, tm.pitcrew) as best_part
    from race_results rr join teams tm on tm.id = rr.team_id
    where rr.race_id = new.id and tm.owner_id is not null
  loop
    select min(pos) filter (where not dnf), count(*) filter (where points > 0), count(*) filter (where pos <= 3 and not dnf)
      into v_best, v_pts, v_pod
    from race_results where race_id = new.id and team_id = t.id;

    if v_pts >= 1 then perform award_achievement(t.owner_id, t.id, 'first_points'); end if;
    if v_pts >= 2 then perform award_achievement(t.owner_id, t.id, 'double_points'); end if;
    if v_best <= 3 then perform award_achievement(t.owner_id, t.id, 'first_podium'); end if;
    if v_best = 1 then perform award_achievement(t.owner_id, t.id, 'first_win'); end if;
    if v_pod >= 2 then perform award_achievement(t.owner_id, t.id, 'double_podium'); end if;
    if exists (select 1 from race_results where race_id = new.id and team_id = t.id and pos = 1 and not dnf)
       and exists (select 1 from race_results where race_id = new.id and team_id = t.id and pos = 2 and not dnf) then
      perform award_achievement(t.owner_id, t.id, 'one_two');
    end if;
    if exists (select 1 from race_results where race_id = new.id and team_id = t.id and pos <= 3 and grid >= 10 and not dnf) then
      perform award_achievement(t.owner_id, t.id, 'comeback');
    end if;
    if v_best = 1 and v_wet >= 30 then perform award_achievement(t.owner_id, t.id, 'rain_win'); end if;
    if v_fast is not null and exists (select 1 from race_results where race_id = new.id and team_id = t.id and driver_id = v_fast) then
      perform award_achievement(t.owner_id, t.id, 'fastest_lap');
    end if;
    if (select count(*) from race_results where team_id = t.id and pos = 1 and not dnf) >= 5 then
      perform award_achievement(t.owner_id, t.id, 'wins_5');
    end if;
    if (select count(*) from race_results where team_id = t.id and pos = 1 and not dnf) >= 25 then
      perform award_achievement(t.owner_id, t.id, 'wins_25');
    end if;
    if (select count(distinct race_id) from race_results where team_id = t.id) >= 50 then
      perform award_achievement(t.owner_id, t.id, 'races_50');
    end if;
    if t.best_part >= 70 then perform award_achievement(t.owner_id, t.id, 'car_70'); end if;
    if exists (select 1 from sponsor_deals where team_id = t.id and hits >= 10) then
      perform award_achievement(t.owner_id, t.id, 'sponsor_10');
    end if;
  end loop;
end;
$$;
revoke execute on function public.check_race_achievements(uuid) from public, anon, authenticated;

create or replace function public.races_zz_achievements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    perform check_race_achievements(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists races_zz_achievements on public.races;
create trigger races_zz_achievements after update of status on public.races
  for each row execute function public.races_zz_achievements();

-- Kupalar verilince (sezon sonu)
create or replace function public.trophies_achievements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null then return new; end if;
  if new.kind = 'league_champion' then perform award_achievement(new.owner_id, new.team_id, 'league_champ'); end if;
  if new.kind in ('world_champion', 'world_second', 'world_third') then perform award_achievement(new.owner_id, new.team_id, 'world_podium'); end if;
  if new.kind = 'world_champion' then perform award_achievement(new.owner_id, new.team_id, 'world_champ'); end if;
  return new;
end;
$$;
drop trigger if exists trophies_achievements on public.trophies;
create trigger trophies_achievements after insert on public.trophies
  for each row execute function public.trophies_achievements();

-- Yeni rozetleri "görüldü" işaretle
create or replace function public.mark_achievements_seen()
returns void language sql security definer set search_path = public as $$
  update achievements_earned set seen = true where user_id = auth.uid() and not seen;
$$;
grant execute on function public.mark_achievements_seen() to authenticated;

-- Şimdiye kadar oynanmış yarışlar ve verilmiş kupalar için geriye dönük rozetler (ödülleriyle birlikte).
-- Tekrar çalıştırılırsa aynı rozet ikinci kez verilmez.
do $$
declare r record;
begin
  for r in select id from races where status = 'finished' order by finished_at nulls first loop
    perform check_race_achievements(r.id);
  end loop;
  for r in select * from trophies where owner_id is not null loop
    if r.kind = 'league_champion' then perform award_achievement(r.owner_id, r.team_id, 'league_champ'); end if;
    if r.kind in ('world_champion', 'world_second', 'world_third') then perform award_achievement(r.owner_id, r.team_id, 'world_podium'); end if;
    if r.kind = 'world_champion' then perform award_achievement(r.owner_id, r.team_id, 'world_champ'); end if;
  end loop;
end $$;
