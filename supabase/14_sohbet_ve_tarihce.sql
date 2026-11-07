-- =========================================================
-- PitWall Manager — LİG SOHBETİ + TARİHÇE VE REKORLAR
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- =========================================================

-- ---------- 1) LİG SOHBETİ ----------
create table if not exists public.league_messages (
  id          bigint generated always as identity primary key,
  league_id   uuid not null references public.leagues(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  team_id     uuid references public.teams(id) on delete set null,
  username    text not null,
  team_name   text not null,
  team_color  text not null default '#888888',
  body        text not null check (char_length(body) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index if not exists league_messages_idx on public.league_messages(league_id, id desc);

-- Mesajları sadece o ligde takımı olan oyuncular okur
alter table public.league_messages enable row level security;
drop policy if exists "lig üyesi okur" on public.league_messages;
create policy "lig üyesi okur" on public.league_messages for select
  using (exists (select 1 from teams t where t.league_id = league_messages.league_id and t.owner_id = auth.uid()));

-- Mesaj gönder: 3 saniyede bir, günde en fazla 200 mesaj
create or replace function public.send_league_message(p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_active_team();
  t teams%rowtype;
  v_body text := trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
begin
  if v_team is null then raise exception 'Takımın yok.'; end if;
  if char_length(v_body) < 1 then raise exception 'Mesaj boş.'; end if;
  if char_length(v_body) > 300 then raise exception 'Mesaj en fazla 300 karakter olabilir.'; end if;
  if exists (select 1 from league_messages where user_id = auth.uid() and created_at > now() - interval '3 seconds') then
    raise exception 'Biraz yavaş! Birkaç saniye bekle.';
  end if;
  if (select count(*) from league_messages where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 200 then
    raise exception 'Bugünlük mesaj sınırına ulaştın.';
  end if;
  select * into t from teams where id = v_team;
  insert into league_messages (league_id, user_id, team_id, username, team_name, team_color, body)
  values (t.league_id, auth.uid(), t.id, coalesce((select username from profiles where id = auth.uid()), '?'), t.name, t.color, v_body);
end;
$$;

-- Kendi mesajını sil
create or replace function public.delete_league_message(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from league_messages where id = p_id and user_id = auth.uid();
end;
$$;

grant select on public.league_messages to authenticated;
grant execute on function public.send_league_message(text) to authenticated;
grant execute on function public.delete_league_message(bigint) to authenticated;

-- Canlı sohbet: yeni mesajlar sayfayı yenilemeden gelsin
do $$ begin
  alter publication supabase_realtime add table public.league_messages;
exception when others then null;  -- zaten ekliyse ya da yayın yoksa sorun değil
end $$;

-- ---------- 2) TARİHÇE: geçmiş sezonların şampiyonları ----------
create or replace function public.season_history()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'season')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'season', tr.season_number,
      'world', coalesce((select jsonb_agg(jsonb_build_object('kind', w.kind, 'team', w.team_name, 'color', t.color,
                          'user', p.username, 'flag', c.flag, 'country', c.code)
                          order by case w.kind when 'world_champion' then 1 when 'world_second' then 2 when 'world_third' then 3 else 4 end)
                 from trophies w left join teams t on t.id = w.team_id left join profiles p on p.id = w.owner_id
                 left join leagues l on l.id = t.league_id left join countries c on c.code = l.country_code
                 where w.season_number = tr.season_number and w.kind in ('world_champion', 'world_second', 'world_third')), '[]'::jsonb),
      'leagues', coalesce((select jsonb_agg(jsonb_build_object('team', lc.team_name, 'color', t.color, 'user', p.username,
                          'flag', c.flag, 'country', c.code, 'tier', l.tier, 'league', l.name)
                          order by c.code, l.tier)
                 from trophies lc left join teams t on t.id = lc.team_id left join profiles p on p.id = lc.owner_id
                 left join leagues l on l.id = t.league_id left join countries c on c.code = l.country_code
                 where lc.season_number = tr.season_number and lc.kind = 'league_champion'), '[]'::jsonb)
    ) as x
    from (select distinct season_number from trophies) tr
  ) q;
$$;

-- ---------- 3) REKORLAR (tüm zamanlar; ülke verilirse sadece o ülkenin ligleri) ----------
create or replace function public.all_time_records(p_country text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  out jsonb := '{}'::jsonb;
begin
  -- Kapsamdaki yarışlar
  drop table if exists _rr;
  create temp table _rr on commit drop as
    select rr.*, r.track_id, r.season_id, r.league_id
    from race_results rr join races r on r.id = rr.race_id
    left join leagues l on l.id = r.league_id
    where r.status = 'finished' and (p_country is null or l.country_code = p_country);

  out := out || jsonb_build_object('wins', coalesce((select jsonb_agg(z) from (
    select d.name, d.nationality, d.retired, tm.name as team, tm.color, count(*) as n
    from _rr x join drivers d on d.id = x.driver_id left join teams tm on tm.id = d.team_id
    where x.pos = 1 and not x.dnf group by d.id, d.name, d.nationality, d.retired, tm.name, tm.color
    order by n desc, d.name limit 10) z), '[]'::jsonb));

  out := out || jsonb_build_object('podiums', coalesce((select jsonb_agg(z) from (
    select d.name, d.nationality, d.retired, tm.name as team, tm.color, count(*) as n
    from _rr x join drivers d on d.id = x.driver_id left join teams tm on tm.id = d.team_id
    where x.pos <= 3 and not x.dnf group by d.id, d.name, d.nationality, d.retired, tm.name, tm.color
    order by n desc, d.name limit 10) z), '[]'::jsonb));

  out := out || jsonb_build_object('team_wins', coalesce((select jsonb_agg(z) from (
    select tm.name, tm.color, p.username as "user", count(*) as n
    from _rr x join teams tm on tm.id = x.team_id left join profiles p on p.id = tm.owner_id
    where x.pos = 1 and not x.dnf group by tm.id, tm.name, tm.color, p.username
    order by n desc, tm.name limit 10) z), '[]'::jsonb));

  out := out || jsonb_build_object('titles', coalesce((select jsonb_agg(z) from (
    select tr.team_name as name, tm.color, p.username as "user",
           count(*) filter (where tr.kind = 'world_champion') as world,
           count(*) filter (where tr.kind = 'league_champion') as league
    from trophies tr left join teams tm on tm.id = tr.team_id left join profiles p on p.id = tm.owner_id
    left join leagues l on l.id = tm.league_id
    where tr.kind in ('world_champion', 'league_champion') and (p_country is null or l.country_code = p_country)
    group by tr.team_id, tr.team_name, tm.color, p.username
    order by world desc, league desc, tr.team_name limit 10) z), '[]'::jsonb));

  out := out || jsonb_build_object('season_points', coalesce((select jsonb_agg(z) from (
    select tm.name, tm.color, p.username as "user", s.number as season, sum(x.points) as n
    from _rr x join teams tm on tm.id = x.team_id left join profiles p on p.id = tm.owner_id
    join seasons s on s.id = x.season_id
    where x.league_id is not null
    group by tm.id, tm.name, tm.color, p.username, s.number
    order by n desc limit 10) z), '[]'::jsonb));

  out := out || jsonb_build_object('comebacks', coalesce((select jsonb_agg(z) from (
    select d.name, d.nationality, tm.name as team, tm.color, x.track_id, s.number as season, x.grid
    from _rr x join drivers d on d.id = x.driver_id join teams tm on tm.id = x.team_id join seasons s on s.id = x.season_id
    where x.pos = 1 and not x.dnf
    order by x.grid desc, s.number desc limit 5) z), '[]'::jsonb));

  out := out || jsonb_build_object('fastest', coalesce((select jsonb_agg(z order by z.track_id) from (
    select distinct on (x.track_id) x.track_id, x.best, d.name, d.nationality, tm.name as team, tm.color, s.number as season
    from _rr x join drivers d on d.id = x.driver_id join teams tm on tm.id = x.team_id join seasons s on s.id = x.season_id
    where x.best is not null and x.best > 0
    order by x.track_id, x.best asc) z), '[]'::jsonb));

  return out;
end;
$$;

grant execute on function public.season_history() to authenticated, anon;
grant execute on function public.all_time_records(text) to authenticated, anon;
