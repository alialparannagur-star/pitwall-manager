-- =========================================================
-- PitWall Manager — YAŞ, UYRUK ve 50 ÖLÇEĞİ (7. aşama)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- 01, 02, 05, 06 ve 07 daha önce çalıştırılmış olmalı.
--
-- • Pilotlar ve araçlar artık 50 civarından başlar (en fazla 99).
-- • Her pilotun yaşı ve uyruğu var; isimler uyruğa uygun.
-- • Sezon sonunda yaşlanma: 16-22 hızlı gelişim, 23-29 orta, 30-35 yavaş,
--   36-40 sabit, 41+ düşüş. 45'te (41-44 arası bazen) emeklilik, yerine genç pilot.
-- • Her pilotun bir POTANSİYELİ var: genel ortalaması bunu geçemez, tek bir özellik en fazla 6 üstüne çıkabilir.
-- • Mevcut veriler bir kez 50 ölçeğine çevrilir (dosyayı tekrar çalıştırmak güvenlidir).
-- =========================================================

alter table public.drivers add column if not exists nationality text references public.countries(code);
alter table public.drivers add column if not exists age int;
alter table public.drivers add column if not exists potential int;  -- ulaşabileceği en yüksek değer
alter table public.teams alter column engine set default 50;
alter table public.teams alter column aero set default 50;
alter table public.teams alter column chassis set default 50;
alter table public.teams alter column reliability set default 50;
alter table public.teams alter column pitcrew set default 50;

-- Emeklilik kayıtları (sezon arası haberleri için)
create table if not exists public.retirements (
  id             uuid primary key default gen_random_uuid(),
  season_number  int  not null,
  team_id        uuid references public.teams(id) on delete cascade,
  old_name       text not null,
  old_age        int  not null,
  old_nat        text,
  new_name       text not null,
  new_age        int  not null,
  new_nat        text,
  created_at     timestamptz not null default now()
);
alter table public.retirements enable row level security;
drop policy if exists "herkes okur" on public.retirements;
create policy "herkes okur" on public.retirements for select using (true);

-- Tek seferlik işlemleri takip etmek için
create table if not exists public.pw_migrations (name text primary key, done_at timestamptz not null default now());
alter table public.pw_migrations enable row level security;

-- ---------- Uyruk ve isim ----------
-- Bir ülkenin liginde pilotların yaklaşık üçte biri o ülkeden olur
create or replace function public.pick_nationality(p_league_country text)
returns text language plpgsql volatile set search_path = public as $$
declare v text;
begin
  if p_league_country is not null and p_league_country <> 'INT' and random() < 0.34 then
    return p_league_country;
  end if;
  select code into v from countries where code <> 'INT' order by random() limit 1;
  return v;
end;
$$;

create or replace function public.driver_name(p_nat text)
returns text language plpgsql volatile as $$
declare
  grp text;
  f text[];
  l text[];
begin
  grp := case p_nat
    when 'TR' then 'tr'
    when 'AZ' then 'tr'
    when 'DE' then 'de'
    when 'AT' then 'de'
    when 'CH' then 'de'
    when 'GB' then 'en'
    when 'US' then 'en'
    when 'CA' then 'en'
    when 'AU' then 'en'
    when 'NZ' then 'en'
    when 'ZA' then 'en'
    when 'FR' then 'fr'
    when 'BE' then 'nl'
    when 'NL' then 'nl'
    when 'IT' then 'it'
    when 'ES' then 'es'
    when 'MX' then 'es'
    when 'AR' then 'es'
    when 'CO' then 'es'
    when 'PT' then 'pt'
    when 'BR' then 'pt'
    when 'SE' then 'nordic'
    when 'NO' then 'nordic'
    when 'DK' then 'nordic'
    when 'FI' then 'nordic'
    when 'PL' then 'slavic'
    when 'CZ' then 'slavic'
    when 'HU' then 'hu'
    when 'RO' then 'ro'
    when 'GR' then 'gr'
    when 'JP' then 'jp'
    when 'CN' then 'cn'
    when 'KR' then 'kr'
    when 'IN' then 'in'
    when 'ID' then 'id'
    when 'AE' then 'ar'
    when 'SA' then 'ar'
    when 'EG' then 'ar'
    when 'MA' then 'ar'
    else 'en' end;
  case grp
    when 'tr' then f := array['Emre','Arda','Kerem','Can','Mert','Burak','Efe','Deniz','Kaan','Barış','Ozan','Yiğit','Alp','Umut']; l := array['Yıldız','Demir','Aydın','Özkan','Kaya','Şahin','Çelik','Arslan','Koç','Kurt','Aksoy','Erdem','Polat','Güler'];
    when 'de' then f := array['Max','Leon','Lukas','Jonas','Felix','Paul','Niklas','Tim','Moritz','Jan','Elias','Finn']; l := array['Müller','Schmidt','Fischer','Weber','Wagner','Becker','Hoffmann','Keller','Brandt','Hartmann','Krüger','Vogel'];
    when 'en' then f := array['Oliver','Jack','Harry','George','Liam','Noah','Callum','Ethan','Lewis','James','Ryan','Mason']; l := array['Smith','Hayes','Brooks','Webb','Grant','Turner','Walker','Bennett','Carter','Hughes','Mitchell','Ward'];
    when 'fr' then f := array['Pierre','Julien','Théo','Hugo','Lucas','Louis','Antoine','Mathis','Nathan','Clément','Esteban','Victor']; l := array['Moreau','Laurent','Duval','Lefèvre','Girard','Bernard','Dubois','Fontaine','Rousseau','Mercier','Blanc','Garnier'];
    when 'it' then f := array['Luca','Marco','Matteo','Andrea','Lorenzo','Alessandro','Davide','Giorgio','Riccardo','Simone','Tommaso','Federico']; l := array['Ferraro','Rossi','Bianchi','Romano','Colombo','Ricci','Marino','Greco','Conti','Gallo','Fontana','Esposito'];
    when 'es' then f := array['Diego','Carlos','Mateo','Pablo','Sergio','Javier','Andrés','Rafael','Álvaro','Nicolás','Santiago','Tomás']; l := array['García','Herrera','Castillo','Romero','Ortega','Navarro','Morales','Vargas','Ramos','Delgado','Medina','Torres'];
    when 'pt' then f := array['João','Pedro','Rafael','Gabriel','Lucas','Thiago','Felipe','Bruno','Rodrigo','Gustavo','Tiago','Miguel']; l := array['Silva','Santos','Ribeiro','Costa','Ferreira','Oliveira','Almeida','Pereira','Carvalho','Barbosa','Rocha','Moura'];
    when 'nl' then f := array['Daan','Sem','Lars','Bram','Thijs','Ruben','Jesse','Stijn','Milan','Niels','Joost','Ties']; l := array['Jansen','Bakker','Visser','Smit','Mulder','Dekker','Peeters','Janssens','Hendriks','Vermeulen','Willems','Maes'];
    when 'nordic' then f := array['Lars','Erik','Mikael','Oskar','Henrik','Anders','Elias','Nils','Mathias','Emil','Jonas','Aleksi']; l := array['Lund','Eklund','Berg','Lindqvist','Nilsson','Hansen','Johansen','Virtanen','Korhonen','Andersen','Holm','Dahl'];
    when 'slavic' then f := array['Jakub','Kacper','Tomasz','Michał','Piotr','Adam','Filip','Ondřej','Lukáš','Marek','Jan','Kamil']; l := array['Kowalski','Nowak','Wiśniewski','Zieliński','Lewandowski','Novák','Dvořák','Svoboda','Černý','Mazur','Wójcik','Král'];
    when 'hu' then f := array['Bence','Máté','Dániel','Levente','Ádám','Balázs','Gergő','Zsolt','Péter','Tamás','Bálint','Krisztián']; l := array['Nagy','Kovács','Tóth','Szabó','Horváth','Varga','Kiss','Molnár','Németh','Farkas','Balogh','Papp'];
    when 'ro' then f := array['Andrei','Alexandru','Mihai','Stefan','Vlad','Radu','Cristian','Bogdan','Ionuț','Darius','Matei','Sorin']; l := array['Popescu','Ionescu','Dumitru','Stan','Constantin','Marin','Stoica','Georgescu','Moldovan','Munteanu','Lazăr','Barbu'];
    when 'gr' then f := array['Nikos','Giorgos','Kostas','Dimitris','Yannis','Alexandros','Stavros','Panos','Christos','Michalis','Vasilis','Thanos']; l := array['Papadopoulos','Georgiou','Nikolaou','Dimitriou','Konstantinou','Ioannou','Vlachos','Pappas','Karras','Makris','Antoniou','Doukas'];
    when 'jp' then f := array['Haruto','Yuki','Kenji','Ren','Sota','Takumi','Daichi','Riku','Kaito','Hiroshi','Yuto','Sho']; l := array['Sato','Tanaka','Morita','Tanabe','Nakamura','Suzuki','Takahashi','Watanabe','Ito','Yamamoto','Kobayashi','Kato'];
    when 'cn' then f := array['Wei','Jun','Hao','Yu','Lei','Bo','Jian','Ming','Tao','Kai','Zihan','Yichen']; l := array['Wang','Li','Zhang','Liu','Chen','Yang','Huang','Zhao','Wu','Zhou','Xu','Sun'];
    when 'kr' then f := array['Min-jun','Seo-jun','Ji-ho','Do-yun','Ha-jun','Joon-young','Hyun-woo','Sung-min','Tae-yang','Woo-jin','Jae-won','Dong-hyun']; l := array['Kim','Lee','Park','Choi','Jung','Kang','Cho','Yoon','Jang','Lim','Han','Shin'];
    when 'in' then f := array['Arjun','Rohan','Aditya','Vikram','Karan','Rahul','Aarav','Ishaan','Kabir','Siddharth','Dev','Nikhil']; l := array['Sharma','Patel','Singh','Kumar','Reddy','Gupta','Mehta','Rao','Iyer','Kapoor','Joshi','Nair'];
    when 'id' then f := array['Rizky','Dimas','Fajar','Bagas','Arif','Rio','Andi','Yoga','Galih','Putra','Bima','Reza']; l := array['Pratama','Saputra','Wijaya','Santoso','Haryanto','Gunawan','Setiawan','Kusuma','Hidayat','Nugroho','Susanto','Halim'];
    when 'ar' then f := array['Omar','Khalid','Youssef','Ahmed','Karim','Hamza','Faisal','Tariq','Ziad','Nasser','Rami','Adel']; l := array['Haddad','Farouk','Mansour','Saleh','Benali','Khalil','Hamdan','Aziz','Rahman','Darwish','Qasim','Zayed'];
  end case;
  return f[1 + floor(random() * array_length(f, 1))::int] || ' ' || l[1 + floor(random() * array_length(l, 1))::int];
end;
$$;

-- Toplamı sabit, dağılımı rastgele özellikler (p_spread: ne kadar farklı olabilecekleri)
create or replace function public.random_attrs2(p_total int, p_spread int)
returns int[] language plpgsql volatile as $$
declare
  base int := p_total / 4 - p_spread;
  a int[];
  k int;
  i int;
begin
  a := array[base, base, base, base];
  for i in 1..(p_total - base * 4) loop
    k := 1 + floor(random() * 4)::int;
    a[k] := least(99, a[k] + 1);
  end loop;
  return a;
end;
$$;

-- Potansiyel: gençlerin büyüme alanı fazla. Çoğu pilot 65-80 arası, nadir yetenekler 90+.
create or replace function public.potential_for(p_skill int, p_age int)
returns int language sql volatile as $$
  select least(97, greatest(coalesce(p_skill, 50) + 2,
    coalesce(p_skill, 50) + case
      when coalesce(p_age, 25) <= 22 then 10 + floor(power(random(), 1.4) * 32)::int
      when p_age <= 29 then 5 + floor(power(random(), 1.4) * 22)::int
      when p_age <= 35 then 2 + floor(random() * 8)::int
      else floor(random() * 4)::int end));
$$;

-- Yeni pilot: uyruk, isim, yaş ve özellikleri otomatik doldur.
-- Takımın 1. pilotu ortalama 52, 2. pilotu ortalama 48 ile başlar (her takımda aynı toplam).
create or replace function public.drivers_fill_attrs()
returns trigger language plpgsql as $$
declare
  a int[];
  v_country text;
begin
  if tg_op = 'INSERT' and new.nationality is null then
    select l.country_code into v_country from teams t join leagues l on l.id = t.league_id where t.id = new.team_id;
    new.nationality := public.pick_nationality(v_country);
    new.name := public.driver_name(new.nationality);
  end if;
  if tg_op = 'INSERT' and new.age is null then
    new.age := 18 + floor(random() * 21)::int;
  end if;
  if new.pace is null or new.racecraft is null or new.tyres is null or new.consistency is null then
    a := public.random_attrs2(case when new.seat = 1 then 208 else 192 end, 8);
    new.pace := a[1]; new.racecraft := a[2]; new.tyres := a[3]; new.consistency := a[4];
  end if;
  new.skill := round((new.pace + new.racecraft + new.tyres + new.consistency) / 4.0);
  if new.potential is null then new.potential := public.potential_for(new.skill, new.age); end if;
  return new;
end;
$$;

-- ---------- Mevcut verileri 50 ölçeğine çevir (sadece bir kez) ----------
do $$
begin
  if not exists (select 1 from public.pw_migrations where name = '08_olcek_50') then
    update public.teams set
      engine = greatest(20, engine - 30), aero = greatest(20, aero - 30), chassis = greatest(20, chassis - 30),
      reliability = greatest(20, reliability - 30), pitcrew = greatest(20, pitcrew - 30);

    update public.drivers d set
      nationality = public.pick_nationality(l.country_code),
      age         = 18 + floor(random() * 21)::int,
      pace        = greatest(20, d.pace - 30),
      racecraft   = greatest(20, d.racecraft - 30),
      tyres       = greatest(20, d.tyres - 30),
      consistency = greatest(20, d.consistency - 30)
    from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = d.team_id;

    update public.drivers set name = public.driver_name(nationality);
    insert into public.pw_migrations (name) values ('08_olcek_50');
  end if;
end $$;
-- Potansiyeli olmayan pilotlara potansiyel ver
update public.drivers set potential = public.potential_for(skill, age) where potential is null;

-- ---------- Sezon sonu yaşlanma ve emeklilik ----------
create or replace function public.age_drivers(p_season int, p_season_number int)
returns void language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_amt int;
  v_attr text;
  v_nat text;
  v_name text;
  v_age int;
  a int[];
  k int;
begin
  for d in
    select dr.id, dr.age, dr.name, dr.nationality, dr.team_id, l.country_code
    from drivers dr join teams t on t.id = dr.team_id join leagues l on l.id = t.league_id
    where l.season_id = p_season
  loop
    v_amt := case when d.age <= 22 then 12 when d.age <= 29 then 6 when d.age <= 35 then 2 when d.age <= 40 then 0 else -8 end;
    for k in 1..abs(v_amt) loop
      if v_amt > 0 then
        -- Sadece potansiyelin altındaki özellikler büyür
        v_attr := null;
        select x.a into v_attr from drivers dd,
          lateral (values ('pace', dd.pace), ('racecraft', dd.racecraft), ('tyres', dd.tyres), ('consistency', dd.consistency)) as x(a, v)
        where dd.id = d.id and x.v < least(99, coalesce(dd.potential, 99) + 6)
          and dd.pace + dd.racecraft + dd.tyres + dd.consistency < 4 * coalesce(dd.potential, 99)
        order by random() limit 1;
        exit when v_attr is null;
        update drivers set
          pace = least(99, pace + (v_attr = 'pace')::int), racecraft = least(99, racecraft + (v_attr = 'racecraft')::int),
          tyres = least(99, tyres + (v_attr = 'tyres')::int), consistency = least(99, consistency + (v_attr = 'consistency')::int)
        where id = d.id;
      else
        -- Yaşlanınca önce hız ve istikrar düşer
        v_attr := (array['pace', 'pace', 'consistency', 'consistency', 'racecraft', 'tyres'])[1 + floor(random() * 6)::int];
        update drivers set
          pace = greatest(20, pace - (v_attr = 'pace')::int), racecraft = greatest(20, racecraft - (v_attr = 'racecraft')::int),
          tyres = greatest(20, tyres - (v_attr = 'tyres')::int), consistency = greatest(20, consistency - (v_attr = 'consistency')::int)
        where id = d.id;
      end if;
    end loop;

    if d.age + 1 >= 45 or (d.age + 1 >= 41 and random() < 0.25) then
      -- Emeklilik: yerine 17-19 yaşında bir çaylak gelir
      v_nat := pick_nationality(d.country_code);
      v_name := driver_name(v_nat);
      v_age := 17 + floor(random() * 3)::int;
      a := random_attrs2(184, 8);  -- çaylak: ortalama 46
      insert into retirements (season_number, team_id, old_name, old_age, old_nat, new_name, new_age, new_nat)
      values (p_season_number, d.team_id, d.name, d.age + 1, d.nationality, v_name, v_age, v_nat);
      update drivers set
        name = v_name, nationality = v_nat, age = v_age,
        pace = a[1], racecraft = a[2], tyres = a[3], consistency = a[4],
        potential = least(97, 58 + floor(power(random(), 1.6) * 40)::int),
        dev_points = 0, points = 0, races = 0
      where id = d.id;
    else
      update drivers set age = age + 1 where id = d.id;
    end if;
  end loop;
end;
$$;

-- ---------- Yeni kurallarla güncellenen fonksiyonlar ----------
-- Garaj: 70 altı +3, 85 altı +2, üstü +1 (fiyat = 1.000.000 × 1,5^seviye, en fazla 99)
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
  v_gain := case when v_stat < 70 then 3 when v_stat < 85 then 2 else 1 end;

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

-- Yarış sonucu (botların geliştirmeleri yeni kurala göre)
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

-- Gelişim puanı bedeli: 60'a kadar 1, 70'e kadar 2, 80'e kadar 3, 90'a kadar 4, sonrası 5
create or replace function public.races_award_dev()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d drivers%rowtype;
  v_ids uuid[];
  v_id uuid;
  v_attr text;
  v_val int;
  v_cost int;
  k int;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    update drivers dr set
      dev_points = dr.dev_points + 1 + case when rr.dnf then 0 else (rr.pos <= 10)::int + (rr.pos <= 3)::int end,
      races = dr.races + 1
    from race_results rr
    where rr.race_id = new.id and rr.driver_id = dr.id;

    select array_agg(dr.id) into v_ids
    from drivers dr join teams t on t.id = dr.team_id
    where t.league_id = new.league_id and t.owner_id is null;

    foreach v_id in array coalesce(v_ids, '{}') loop
      for k in 1..8 loop
        select * into d from drivers where id = v_id;
        v_attr := null;
        select x.a into v_attr from (values ('pace', d.pace, d.pace - 3), ('racecraft', d.racecraft, d.racecraft), ('tyres', d.tyres, d.tyres), ('consistency', d.consistency, d.consistency)) as x(a, raw, val)
        where x.raw < least(99, coalesce(d.potential, 99) + 6)
          and d.pace + d.racecraft + d.tyres + d.consistency < 4 * coalesce(d.potential, 99)
        order by random() * case when x.a = 'pace' then 0.6 else 1 end limit 1;
        exit when v_attr is null;
        v_val := case v_attr when 'pace' then d.pace when 'racecraft' then d.racecraft when 'tyres' then d.tyres else d.consistency end;
        v_cost := case when v_val < 60 then 1 when v_val < 70 then 2 when v_val < 80 then 3 when v_val < 90 then 4 else 5 end;
        exit when d.dev_points < v_cost or v_val >= 99;
        update drivers set
          dev_points  = dev_points - v_cost,
          pace        = pace        + (v_attr = 'pace')::int,
          racecraft   = racecraft   + (v_attr = 'racecraft')::int,
          tyres       = tyres       + (v_attr = 'tyres')::int,
          consistency = consistency + (v_attr = 'consistency')::int
        where id = v_id;
      end loop;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.train_driver(p_driver uuid, p_attr text)
returns public.drivers language plpgsql security definer set search_path = public as $$
declare
  d drivers%rowtype;
  v int;
  c int;
begin
  if p_attr not in ('pace', 'racecraft', 'tyres', 'consistency') then
    raise exception 'Geçersiz özellik: %', p_attr;
  end if;

  select dr.* into d from drivers dr join teams t on t.id = dr.team_id
  where dr.id = p_driver and t.owner_id = auth.uid()
  for update of dr;
  if not found then raise exception 'Bu pilot senin takımında değil'; end if;

  v := case p_attr when 'pace' then d.pace when 'racecraft' then d.racecraft when 'tyres' then d.tyres else d.consistency end;
  if v >= 99 then raise exception 'Bu özellik zaten en üst seviyede'; end if;
  if v >= least(99, coalesce(d.potential, 99) + 6) then raise exception 'Bu özellik pilotun potansiyelinin sınırına ulaştı'; end if;
  if d.pace + d.racecraft + d.tyres + d.consistency >= 4 * coalesce(d.potential, 99) then raise exception 'Pilot potansiyeline (%) ulaştı', d.potential; end if;
  c := case when v < 60 then 1 when v < 70 then 2 when v < 80 then 3 when v < 90 then 4 else 5 end;
  if d.dev_points < c then raise exception 'Yeterli gelişim puanın yok'; end if;

  update drivers set
    dev_points  = dev_points - c,
    pace        = pace        + (p_attr = 'pace')::int,
    racecraft   = racecraft   + (p_attr = 'racecraft')::int,
    tyres       = tyres       + (p_attr = 'tyres')::int,
    consistency = consistency + (p_attr = 'consistency')::int
  where id = p_driver
  returning * into d;
  return d;
end;
$$;

-- Sezon sonu: araç 50'ye doğru yarı yarıya, pilotlar yaşlanır
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

-- Yarış girdisi: pilot uyruğu ve yaşı da gider
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
                      'pace', d.pace, 'racecraft', d.racecraft, 'tyres', d.tyres, 'consistency', d.consistency,
                      'nationality', d.nationality, 'age', d.age
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

revoke execute on function public.race_input(uuid) from public, anon, authenticated;
grant  execute on function public.race_input(uuid) to service_role;
revoke execute on function public.age_drivers(int, int) from public, anon, authenticated;
revoke execute on function public.finish_season(int) from public, anon, authenticated;
revoke execute on function public.finish_race(uuid, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.finish_race(uuid, jsonb, jsonb) to service_role;
revoke execute on function public.buy_upgrade(text) from public, anon;
grant  execute on function public.buy_upgrade(text) to authenticated;
revoke execute on function public.train_driver(uuid, text) from public, anon;
grant  execute on function public.train_driver(uuid, text) to authenticated;

-- Kontrol: pilotlar ve araçlar
select
  (select round(avg(skill), 1) from public.drivers) as pilot_ortalama,
  (select min(age) || '-' || max(age) from public.drivers) as yas_araligi,
  (select count(distinct nationality) from public.drivers) as uyruk_sayisi,
  (select round(avg(potential), 1) from public.drivers) as potansiyel_ortalama,
  (select round(avg(engine), 1) from public.teams) as motor_ortalama;
