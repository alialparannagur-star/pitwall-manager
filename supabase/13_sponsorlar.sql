-- =========================================================
-- PitWall Manager — SPONSORLAR
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
--
-- Her takım sezon başına 3 tekliften birini seçer:
--   Güvenli : her yarış sabit para
--   Dengeli : daha az sabit para + hedef tutarsa prim
--   Riskli  : sabit para yok, hedef tutarsa büyük prim
-- Hedef "en iyi pilotun ilk X'te bitirmesi"dir; X takımın gücüne göre belirlenir.
-- Ödeme her lig yarışından sonra otomatik yapılır. Botlar dengeli teklifi alır;
-- oyuncu 3. yarışa kadar seçim yapmazsa ona da dengeli teklif verilir.
-- =========================================================

create table if not exists public.sponsor_deals (
  team_id    uuid not null references public.teams(id) on delete cascade,
  season_id  int  not null references public.seasons(id),
  kind       text not null check (kind in ('safe', 'balanced', 'risky')),
  name       text not null,
  base       bigint not null,
  bonus      bigint not null default 0,
  goal       int,
  signed_at  timestamptz not null default now(),
  earned     bigint not null default 0,
  hits       int not null default 0,
  races      int not null default 0,
  primary key (team_id, season_id)
);
alter table public.sponsor_deals enable row level security;
drop policy if exists "herkes okur" on public.sponsor_deals;
create policy "herkes okur" on public.sponsor_deals for select using (true);

alter table public.race_team_results add column if not exists sponsor bigint not null default 0;

-- Takımın ligindeki beklenen sırası (araç %60 + pilotlar %40)
create or replace function public.team_expected_rank(p_team uuid)
returns int language sql stable security definer set search_path = public as $$
  with s as (
    select t.id,
           (t.engine + t.aero + t.chassis + t.reliability + t.pitcrew) / 5.0 * 0.6
           + coalesce((select avg(d.skill) from drivers d where d.team_id = t.id), 50) * 0.4 as score
    from teams t where t.league_id = (select league_id from teams where id = p_team)
  )
  select (select count(*) from s where s.score > me.score)::int + 1 from s me where me.id = p_team;
$$;

-- Uydurma sponsor adları (gerçek markalar değil)
create or replace function public.sponsor_name(p_team uuid, p_season int, p_kind text)
returns text language sql immutable as $$
  select (array['Novaflux', 'Atlaro', 'Kervano', 'Zirvex', 'Mavion', 'Polarix', 'Orbitek', 'Lumenta',
                'Ferrox', 'Vortexa', 'Tilkon', 'Quantra', 'Solvane', 'Brontix', 'Kaleon', 'Nimbra'])
         [1 + (abs(hashtext(p_team::text || ':' || p_season)) + case p_kind when 'safe' then 0 when 'balanced' then 5 else 11 end) % 16];
$$;

-- Bir takıma bu sezon için gelen 3 teklif
create or replace function public.sponsor_offers(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_season int;
  e int;
  m int;
begin
  select l.season_id into v_season from teams t join leagues l on l.id = t.league_id where t.id = p_team;
  if v_season is null then return '[]'::jsonb; end if;
  e := coalesce(team_expected_rank(p_team), 6);
  m := round(1.5 * e);
  return jsonb_build_array(
    jsonb_build_object('kind', 'safe',     'name', sponsor_name(p_team, v_season, 'safe'),     'base', 110000, 'bonus', 0,      'goal', null),
    jsonb_build_object('kind', 'balanced', 'name', sponsor_name(p_team, v_season, 'balanced'), 'base', 50000,  'bonus', 120000, 'goal', least(16, m + 1)),
    jsonb_build_object('kind', 'risky',    'name', sponsor_name(p_team, v_season, 'risky'),    'base', 0,      'bonus', 450000, 'goal', greatest(1, least(14, m - 3)))
  );
end;
$$;

-- Oyuncu sponsor seçer (sezonda bir kez)
create or replace function public.sign_sponsor(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_active_team();
  v_season int;
  o jsonb;
begin
  if v_team is null then raise exception 'Takımın yok.'; end if;
  select l.season_id into v_season from teams t join leagues l on l.id = t.league_id where t.id = v_team;
  if exists (select 1 from sponsor_deals where team_id = v_team and season_id = v_season) then
    raise exception 'Bu sezon zaten bir sponsorla anlaştın.';
  end if;
  select x into o from jsonb_array_elements(sponsor_offers(v_team)) x where x->>'kind' = p_kind;
  if o is null then raise exception 'Geçersiz teklif'; end if;
  insert into sponsor_deals (team_id, season_id, kind, name, base, bonus, goal)
  values (v_team, v_season, p_kind, o->>'name', (o->>'base')::bigint, (o->>'bonus')::bigint, nullif(o->>'goal', '')::int);
end;
$$;

-- Ödeme: her lig yarışı bitince
create or replace function public.races_pay_sponsors()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  d record;
  v_best int;
  v_hit boolean;
  v_amt bigint;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and new.league_id is not null then
    v_season := coalesce(new.season_id, (select season_id from leagues where id = new.league_id));
    -- Sponsoru olmayan bot takımlar dengeli teklifi alır; oyuncular 3. yarışa kadar seçmezse onlara da dengeli verilir
    insert into sponsor_deals (team_id, season_id, kind, name, base, bonus, goal)
    select t.id, v_season, 'balanced', o->>'name', (o->>'base')::bigint, (o->>'bonus')::bigint, (o->>'goal')::int
    from teams t, lateral (select x as o from jsonb_array_elements(sponsor_offers(t.id)) x where x->>'kind' = 'balanced') q
    where t.league_id = new.league_id and (t.owner_id is null or new.round >= 3)
      and not exists (select 1 from sponsor_deals s where s.team_id = t.id and s.season_id = v_season);

    for d in select s.* from sponsor_deals s join teams t on t.id = s.team_id
             where t.league_id = new.league_id and s.season_id = v_season loop
      select min(pos) into v_best from race_results where race_id = new.id and team_id = d.team_id and not dnf;
      v_hit := d.goal is not null and v_best is not null and v_best <= d.goal;
      v_amt := d.base + case when v_hit then d.bonus else 0 end;
      update teams set money = money + v_amt where id = d.team_id;
      update race_team_results set sponsor = v_amt where race_id = new.id and team_id = d.team_id;
      update sponsor_deals set earned = earned + v_amt, hits = hits + v_hit::int, races = races + 1
      where team_id = d.team_id and season_id = d.season_id;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists races_pay_sponsors on public.races;
create trigger races_pay_sponsors after update of status on public.races
  for each row execute function public.races_pay_sponsors();

grant execute on function public.sponsor_offers(uuid) to authenticated, anon;
grant execute on function public.sign_sponsor(text) to authenticated;
