-- =========================================================
-- PitWall Manager — PİLOT ÖZELLİKLERİ ve GELİŞİM (5. aşama)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- 01 ve 02 daha önce çalıştırılmış olmalı.
-- =========================================================

-- ---------- Yeni sütunlar ----------
alter table public.drivers add column if not exists pace        int;  -- Hız
alter table public.drivers add column if not exists racecraft   int;  -- Sollama / savunma
alter table public.drivers add column if not exists tyres       int;  -- Lastik yönetimi
alter table public.drivers add column if not exists consistency int;  -- İstikrar
alter table public.drivers add column if not exists dev_points  int not null default 5;  -- harcanmamış gelişim puanı (5 başlangıç bonusu)
alter table public.drivers add column if not exists races       int not null default 0;  -- koştuğu yarış sayısı

-- ---------- Rastgele ama adil özellik dağılımı ----------
-- Toplam aynı kalır (örn. 82 ortalamalı pilot = 328 puan), sadece dağılım farklıdır.
-- Böylece her pilotun bir karakteri olur ama hiçbir takım baştan avantajlı olmaz.
create or replace function public.random_attrs(p_total int)
returns int[] language plpgsql volatile as $$
declare
  base int := p_total / 4 - 4;
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

-- Yeni pilot eklenince özellikleri otomatik doldur; "skill" her zaman ortalama olsun
create or replace function public.drivers_fill_attrs()
returns trigger language plpgsql as $$
declare a int[];
begin
  if new.pace is null or new.racecraft is null or new.tyres is null or new.consistency is null then
    a := public.random_attrs(coalesce(new.skill, 80) * 4);
    new.pace := a[1]; new.racecraft := a[2]; new.tyres := a[3]; new.consistency := a[4];
  end if;
  new.skill := round((new.pace + new.racecraft + new.tyres + new.consistency) / 4.0);
  return new;
end;
$$;

drop trigger if exists drivers_fill_attrs on public.drivers;
create trigger drivers_fill_attrs before insert or update on public.drivers
  for each row execute function public.drivers_fill_attrs();

-- Mevcut pilotları doldur (tetikleyici boş özellikleri dolduracak)
update public.drivers set skill = skill where pace is null;

-- ---------- Yarış girdisine pilot özelliklerini ekle ----------
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
        'drivers', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', d.id, 'seat', d.seat, 'name', d.name, 'skill', d.skill,
                      'pace', d.pace, 'racecraft', d.racecraft, 'tyres', d.tyres, 'consistency', d.consistency
                    ) order by d.seat), '[]'::jsonb)
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
revoke execute on function public.race_input(uuid) from public, anon, authenticated;
grant  execute on function public.race_input(uuid) to service_role;

-- ---------- Yarış bitince gelişim puanı dağıt ----------
-- Kurallar shared/data.js ile aynı: bitiren 2, ilk 10 +1, podyum +1, DNF 1 puan.
-- Botlar puanlarını hemen harcar (en zayıf özelliklerinden başlayarak).
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
      dev_points = dr.dev_points + case when rr.dnf then 1 else 2 + (rr.pos <= 10)::int + (rr.pos <= 3)::int end,
      races = dr.races + 1
    from race_results rr
    where rr.race_id = new.id and rr.driver_id = dr.id;

    select array_agg(dr.id) into v_ids
    from drivers dr join teams t on t.id = dr.team_id
    where t.league_id = new.league_id and t.owner_id is null;

    foreach v_id in array coalesce(v_ids, '{}') loop
      for k in 1..8 loop
        select * into d from drivers where id = v_id;
        select x.a into v_attr from (values ('pace', d.pace - 3), ('racecraft', d.racecraft), ('tyres', d.tyres), ('consistency', d.consistency)) as x(a, val)
        order by x.val + random() * 6 limit 1;
        v_val := case v_attr when 'pace' then d.pace when 'racecraft' then d.racecraft when 'tyres' then d.tyres else d.consistency end;
        v_cost := case when v_val < 80 then 1 when v_val < 88 then 2 when v_val < 94 then 3 else 4 end;
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

drop trigger if exists races_award_dev on public.races;
create trigger races_award_dev after update of status on public.races
  for each row execute function public.races_award_dev();

-- ---------- Oyuncu: gelişim puanı harca ----------
-- Bedel: 80 altı 1, 88 altı 2, 94 altı 3, üstü 4 puan. En fazla 99.
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
  c := case when v < 80 then 1 when v < 88 then 2 when v < 94 then 3 else 4 end;
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

revoke execute on function public.train_driver(uuid, text) from public, anon;
grant  execute on function public.train_driver(uuid, text) to authenticated;
revoke execute on function public.random_attrs(int) from public, anon, authenticated;

-- Kontrol: pilotlar artık özellikli olmalı
select name, skill, pace, racecraft, tyres, consistency, dev_points from public.drivers order by skill desc limit 5;
