-- =========================================================
-- PitWall Manager — VERİTABANI KURULUMU (2. aşama)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- =========================================================

-- ---------- TABLOLAR ----------

-- Ülkeler: her ülkenin yarışı kendi saatiyle akşam koşar
create table public.countries (
  code       text primary key,
  name       text not null,
  flag       text not null,
  timezone   text not null,
  race_hour  int  not null default 20
);

-- Sezonlar: 25 gün lig + 5 gün dünya finali
create table public.seasons (
  id          serial primary key,
  number      int  not null unique,
  start_date  date not null,
  status      text not null default 'active' check (status in ('active', 'finished'))
);

-- Ligler: her ülkede 1. Lig, dolunca 2. Lig...
create table public.leagues (
  id            uuid primary key default gen_random_uuid(),
  season_id     int  not null references public.seasons(id),
  country_code  text not null references public.countries(code),
  tier          int  not null default 1,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (season_id, country_code, tier)
);

-- Kullanıcı profilleri (giriş bilgileri Supabase'in kendi auth sisteminde durur)
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (char_length(username) between 3 and 20),
  country_code  text not null references public.countries(code),
  created_at    timestamptz not null default now()
);

-- Takımlar: owner_id boşsa takımı bot yönetir. Herkes aynı güçte araçla başlar.
create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  owner_id     uuid references public.profiles(id) on delete set null,
  name         text not null,
  color        text not null,
  money        bigint not null default 2000000,
  engine       int not null default 80,
  aero         int not null default 80,
  chassis      int not null default 80,
  reliability  int not null default 80,
  pitcrew      int not null default 80,
  levels       jsonb not null default '{"engine":0,"aero":0,"chassis":0,"reliability":0,"pitcrew":0}',
  points       int not null default 0,
  created_at   timestamptz not null default now()
);
create index teams_league_idx on public.teams(league_id);
create index teams_owner_idx  on public.teams(owner_id);

-- Pilotlar: her takımda 2 pilot
create table public.drivers (
  id       uuid primary key default gen_random_uuid(),
  team_id  uuid not null references public.teams(id) on delete cascade,
  seat     smallint not null check (seat in (1, 2)),
  name     text not null,
  skill    int  not null default 80,
  points   int  not null default 0,
  unique (team_id, seat)
);

-- Yarışlar: her lig için 25 yarış, her gün bir tane
create table public.races (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  round         int  not null check (round between 1 and 25),
  track_id      text not null,
  scheduled_at  timestamptz not null,
  status        text not null default 'scheduled' check (status in ('scheduled', 'finished', 'skipped')),
  seed          bigint not null,
  replay        jsonb,
  unique (league_id, round)
);
create index races_due_idx on public.races(status, scheduled_at);

-- Stratejiler: yarıştan önce kullanıcının kurduğu plan (rakipler göremez)
create table public.strategies (
  race_id     uuid not null references public.races(id) on delete cascade,
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  plan        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (race_id, driver_id)
);

-- Yarış sonuçları
create table public.race_results (
  race_id    uuid not null references public.races(id) on delete cascade,
  driver_id  uuid not null references public.drivers(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  pos        int  not null,
  grid       int  not null,
  points     int  not null default 0,
  total      numeric,
  best       numeric,
  dnf        boolean not null default false,
  pits       int not null default 0,
  primary key (race_id, driver_id)
);

-- ---------- GÜVENLİK KURALLARI (Row Level Security) ----------
-- Herkes tabloları OKUYABİLİR, ama kimse doğrudan YAZAMAZ.
-- Para, puan, takım gibi şeyler sadece aşağıdaki güvenli fonksiyonlarla değişir.
alter table public.countries    enable row level security;
alter table public.seasons      enable row level security;
alter table public.leagues      enable row level security;
alter table public.profiles     enable row level security;
alter table public.teams        enable row level security;
alter table public.drivers      enable row level security;
alter table public.races        enable row level security;
alter table public.strategies   enable row level security;
alter table public.race_results enable row level security;

create policy "herkes okur" on public.countries    for select using (true);
create policy "herkes okur" on public.seasons      for select using (true);
create policy "herkes okur" on public.leagues      for select using (true);
create policy "herkes okur" on public.profiles     for select using (true);
create policy "herkes okur" on public.teams        for select using (true);
create policy "herkes okur" on public.drivers      for select using (true);
create policy "herkes okur" on public.races        for select using (true);
create policy "herkes okur" on public.race_results for select using (true);

-- Strateji: sadece kendi pilotlarının stratejisini görür ve değiştirir,
-- ve sadece yarış başlamadan önce.
create or replace function public.owns_driver(p_driver uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from drivers d join teams t on t.id = d.team_id
    where d.id = p_driver and t.owner_id = auth.uid()
  );
$$;

create or replace function public.race_open(p_race uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from races r where r.id = p_race and r.status = 'scheduled' and r.scheduled_at > now());
$$;

create policy "kendi stratejimi okurum" on public.strategies for select
  using (public.owns_driver(driver_id));
create policy "kendi stratejimi eklerim" on public.strategies for insert
  with check (public.owns_driver(driver_id) and public.race_open(race_id));
create policy "kendi stratejimi güncellerim" on public.strategies for update
  using (public.owns_driver(driver_id) and public.race_open(race_id))
  with check (public.owns_driver(driver_id) and public.race_open(race_id));

-- ---------- YARDIMCI: yeni lig oluşturma ----------
-- 11 bot takım, 22 pilot ve 25 yarışlık takvim kurar.
create or replace function public.create_league(p_country text, p_season int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_league uuid;
  v_tier int;
  v_team uuid;
  v_country countries%rowtype;
  v_season seasons%rowtype;
  v_when timestamptz;
  v_tracks text[] := array['bhr','sau','aus','jpn','chn','mia','imo','mon','can','esp','aut','gbr','hun',
                           'bel','ned','ita','aze','sgp','tur','usa','mex','bra','lvg','qat','abu'];
  v_team_names text[] := array['Volt Racing','Arancia Motorsport','Rosso Veloce','Argento GP','Verde Atlas',
    'Alpen Blau','Nordwind GP','Phoenix Racing','Condor Racing','Sakura Racing','Aurora Motorsport',
    'Titan GP','Falcon Racing','Kraken Motorsport','Meridian Racing','Orion GP'];
  v_colors text[] := array['#3b5bdb','#f76707','#e03131','#adb5bd','#2b8a3e','#4dabf7','#845ef7',
    '#fab005','#c2774a','#f06595','#20c997','#868e96','#e64980','#5c7cfa','#94d82d','#fd7e14'];
  v_first text[] := array['Erik','Tomás','Luca','Julien','Callum','Noah','Henrik','Mateo','Rafael','Ethan',
    'Pierre','Kenji','Lars','Yuki','Marcus','Daniel','Diego','Oliver','Haruto','Felix','Emre','Can',
    'Arda','Kerem','Max','Leon','Hugo','Nico','Sven','Andrés','Ivan','Kai','Theo','Adrian','Mikael','Rui'];
  v_last text[] := array['Vandermeer','Ribeiro','Ferraro','Moreau','Hayes','Whitfield','Lund','Rossi',
    'Castillo','Brooks','Duval','Morita','Eklund','Tanabe','Webb','Okafor','Herrera','Grant','Sato',
    'Brandt','Aydın','Özkan','Yıldız','Demir','Keller','Novak','Silva','Laurent','Berg','Costa',
    'Fischer','Nakamura','Lindqvist','Romero','Kowalski','Hartmann'];
  v_order int[];
  i int;
begin
  select * into v_country from countries where code = p_country;
  if not found then raise exception 'Ülke bulunamadı: %', p_country; end if;
  select * into v_season from seasons where id = p_season;

  select coalesce(max(tier), 0) + 1 into v_tier from leagues where season_id = p_season and country_code = p_country;

  insert into leagues (season_id, country_code, tier, name)
  values (p_season, p_country, v_tier, v_country.name || ' ' || v_tier || '. Lig')
  returning id into v_league;

  -- Takım isimlerini karıştır, ilk 11'ini kullan
  select array_agg(n order by random()) into v_order from generate_series(1, array_length(v_team_names, 1)) n;
  for i in 1..11 loop
    insert into teams (league_id, name, color)
    values (v_league, v_team_names[v_order[i]], v_colors[v_order[i]])
    returning id into v_team;

    insert into drivers (team_id, seat, name, skill) values
      (v_team, 1, v_first[1 + floor(random() * array_length(v_first, 1))::int] || ' ' || v_last[1 + floor(random() * array_length(v_last, 1))::int], 82),
      (v_team, 2, v_first[1 + floor(random() * array_length(v_first, 1))::int] || ' ' || v_last[1 + floor(random() * array_length(v_last, 1))::int], 80);
  end loop;

  -- 25 yarış: sezonun her günü, ülke saatiyle akşam
  for i in 1..25 loop
    v_when := ((v_season.start_date + (i - 1))::timestamp + make_time(v_country.race_hour, 0, 0)) at time zone v_country.timezone;
    insert into races (league_id, round, track_id, scheduled_at, status, seed)
    values (v_league, i, v_tracks[i], v_when,
            case when v_when < now() then 'skipped' else 'scheduled' end,
            floor(random() * 4294967295)::bigint);
  end loop;

  return v_league;
end;
$$;

-- ---------- OYUNA KATILMA ----------
-- Kullanıcı kayıt olduktan sonra çağırır: profil açılır, ülkesindeki boş bir
-- bot takımı devralır. Ülkede boş takım yoksa yeni lig açılır.
create or replace function public.join_game(p_username text, p_country text, p_team_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_season int;
  v_team uuid;
  v_league uuid;
begin
  if v_uid is null then raise exception 'Önce giriş yapmalısın'; end if;

  select id into v_season from seasons where status = 'active' order by number desc limit 1;
  if v_season is null then raise exception 'Aktif sezon yok'; end if;

  -- Zaten bu sezon bir takımı varsa onu döndür
  select t.id into v_team from teams t join leagues l on l.id = t.league_id
  where t.owner_id = v_uid and l.season_id = v_season limit 1;
  if v_team is not null then return v_team; end if;

  insert into profiles (id, username, country_code) values (v_uid, trim(p_username), p_country)
  on conflict (id) do nothing;

  -- Ülkedeki en üst ligden başlayarak boş (bot) takım ara
  select t.id into v_team
  from teams t join leagues l on l.id = t.league_id
  where l.season_id = v_season and l.country_code = (select country_code from profiles where id = v_uid)
    and t.owner_id is null
  order by l.tier, random()
  limit 1
  for update of t skip locked;

  if v_team is null then
    v_league := create_league((select country_code from profiles where id = v_uid), v_season);
    select id into v_team from teams where league_id = v_league order by random() limit 1;
  end if;

  update teams
  set owner_id = v_uid,
      name = coalesce(nullif(trim(p_team_name), ''), name)
  where id = v_team;

  return v_team;
end;
$$;

-- ---------- GARAJ: GELİŞTİRME SATIN ALMA ----------
-- Kurallar shared/data.js ile aynı: fiyat = 1.000.000 × 1,5^seviye, 90 altı +2, üstü +1, en fazla 99
create or replace function public.buy_upgrade(p_part text)
returns public.teams language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype;
  v_level int;
  v_stat int;
  v_cost bigint;
  v_gain int;
begin
  if p_part not in ('engine', 'aero', 'chassis', 'reliability', 'pitcrew') then
    raise exception 'Geçersiz parça: %', p_part;
  end if;

  select t.* into v_team from teams t
  join leagues l on l.id = t.league_id
  join seasons s on s.id = l.season_id and s.status = 'active'
  where t.owner_id = auth.uid()
  limit 1
  for update of t;
  if not found then raise exception 'Takımın bulunamadı'; end if;

  v_level := coalesce((v_team.levels ->> p_part)::int, 0);
  execute format('select %I from teams where id = $1', p_part) into v_stat using v_team.id;
  v_cost := round(1000000 * power(1.5, v_level) / 10000) * 10000;
  v_gain := case when v_stat < 90 then 2 else 1 end;

  if v_stat >= 99 then raise exception 'Bu parça zaten en üst seviyede'; end if;
  if v_team.money < v_cost then raise exception 'Yeterli paran yok'; end if;

  update teams set
    money       = money - v_cost,
    levels      = jsonb_set(levels, array[p_part], to_jsonb(v_level + 1)),
    engine      = case when p_part = 'engine'      then least(99, engine + v_gain)      else engine end,
    aero        = case when p_part = 'aero'        then least(99, aero + v_gain)        else aero end,
    chassis     = case when p_part = 'chassis'     then least(99, chassis + v_gain)     else chassis end,
    reliability = case when p_part = 'reliability' then least(99, reliability + v_gain) else reliability end,
    pitcrew     = case when p_part = 'pitcrew'     then least(99, pitcrew + v_gain)     else pitcrew end
  where id = v_team.id
  returning * into v_team;

  return v_team;
end;
$$;

-- Lig oluşturmayı sadece sistem yapabilir; kullanıcılar katılma ve satın alma fonksiyonlarını çağırabilir
revoke execute on function public.create_league(text, int) from public, anon, authenticated;
revoke execute on function public.join_game(text, text, text) from public, anon;
revoke execute on function public.buy_upgrade(text) from public, anon;
grant  execute on function public.join_game(text, text, text) to authenticated;
grant  execute on function public.buy_upgrade(text) to authenticated;

-- ---------- BAŞLANGIÇ VERİLERİ ----------
insert into public.countries (code, name, flag, timezone) values
  ('TR', 'Türkiye',            '🇹🇷', 'Europe/Istanbul'),
  ('DE', 'Almanya',            '🇩🇪', 'Europe/Berlin'),
  ('GB', 'Birleşik Krallık',   '🇬🇧', 'Europe/London'),
  ('FR', 'Fransa',             '🇫🇷', 'Europe/Paris'),
  ('IT', 'İtalya',             '🇮🇹', 'Europe/Rome'),
  ('ES', 'İspanya',            '🇪🇸', 'Europe/Madrid'),
  ('NL', 'Hollanda',           '🇳🇱', 'Europe/Amsterdam'),
  ('BE', 'Belçika',            '🇧🇪', 'Europe/Brussels'),
  ('AT', 'Avusturya',          '🇦🇹', 'Europe/Vienna'),
  ('CH', 'İsviçre',            '🇨🇭', 'Europe/Zurich'),
  ('PL', 'Polonya',            '🇵🇱', 'Europe/Warsaw'),
  ('PT', 'Portekiz',           '🇵🇹', 'Europe/Lisbon'),
  ('SE', 'İsveç',              '🇸🇪', 'Europe/Stockholm'),
  ('NO', 'Norveç',             '🇳🇴', 'Europe/Oslo'),
  ('DK', 'Danimarka',          '🇩🇰', 'Europe/Copenhagen'),
  ('FI', 'Finlandiya',         '🇫🇮', 'Europe/Helsinki'),
  ('GR', 'Yunanistan',         '🇬🇷', 'Europe/Athens'),
  ('RO', 'Romanya',            '🇷🇴', 'Europe/Bucharest'),
  ('HU', 'Macaristan',         '🇭🇺', 'Europe/Budapest'),
  ('CZ', 'Çekya',              '🇨🇿', 'Europe/Prague'),
  ('AZ', 'Azerbaycan',         '🇦🇿', 'Asia/Baku'),
  ('US', 'ABD',                '🇺🇸', 'America/New_York'),
  ('CA', 'Kanada',             '🇨🇦', 'America/Toronto'),
  ('MX', 'Meksika',            '🇲🇽', 'America/Mexico_City'),
  ('BR', 'Brezilya',           '🇧🇷', 'America/Sao_Paulo'),
  ('AR', 'Arjantin',           '🇦🇷', 'America/Argentina/Buenos_Aires'),
  ('CO', 'Kolombiya',          '🇨🇴', 'America/Bogota'),
  ('JP', 'Japonya',            '🇯🇵', 'Asia/Tokyo'),
  ('CN', 'Çin',                '🇨🇳', 'Asia/Shanghai'),
  ('KR', 'Güney Kore',         '🇰🇷', 'Asia/Seoul'),
  ('IN', 'Hindistan',          '🇮🇳', 'Asia/Kolkata'),
  ('ID', 'Endonezya',          '🇮🇩', 'Asia/Jakarta'),
  ('AU', 'Avustralya',         '🇦🇺', 'Australia/Sydney'),
  ('NZ', 'Yeni Zelanda',       '🇳🇿', 'Pacific/Auckland'),
  ('AE', 'Birleşik Arap Emirlikleri', '🇦🇪', 'Asia/Dubai'),
  ('SA', 'Suudi Arabistan',    '🇸🇦', 'Asia/Riyadh'),
  ('EG', 'Mısır',              '🇪🇬', 'Africa/Cairo'),
  ('ZA', 'Güney Afrika',       '🇿🇦', 'Africa/Johannesburg'),
  ('MA', 'Fas',                '🇲🇦', 'Africa/Casablanca'),
  ('INT','Uluslararası',       '🌍', 'UTC');

-- 1. sezon bir hafta sonra başlar (yayına alırken tarihi birlikte güncelleyeceğiz)
insert into public.seasons (number, start_date) values (1, current_date + 7);

-- Türkiye için ilk lig hazır olsun
select public.create_league('TR', (select id from public.seasons where number = 1));
