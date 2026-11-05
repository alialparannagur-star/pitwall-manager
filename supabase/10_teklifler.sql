-- =========================================================
-- PitWall Manager — OYUNCULAR ARASI TRANSFER TEKLİFLERİ (9. aşama)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- 09_pilot_pazari.sql daha önce çalıştırılmış olmalı.
--
-- Teklif = karşı takımın pilotu ← senin bir pilotun + para.
-- Karşı taraf kabul ederse pilotlar yer değiştirir, para el değiştirir.
-- Teklifler 48 saat geçerlidir. Kabul anında her şey yeniden kontrol edilir.
-- =========================================================

create table if not exists public.offers (
  id            uuid primary key default gen_random_uuid(),
  season_id     int  not null references public.seasons(id),
  buyer_team    uuid not null references public.teams(id) on delete cascade,
  seller_team   uuid not null references public.teams(id) on delete cascade,
  target_driver uuid not null references public.drivers(id) on delete cascade,
  out_driver    uuid not null references public.drivers(id) on delete cascade,
  price         bigint not null check (price >= 0),
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '48 hours',
  decided_at    timestamptz
);
create index if not exists offers_buyer_idx  on public.offers(buyer_team, status);
create index if not exists offers_seller_idx on public.offers(seller_team, status);

-- Teklifleri sadece iki taraf görebilir
alter table public.offers enable row level security;
drop policy if exists "taraflar görür" on public.offers;
create policy "taraflar görür" on public.offers for select using (
  exists (select 1 from public.teams t where t.owner_id = auth.uid() and t.id in (buyer_team, seller_team))
);

-- Kullanıcının aktif sezondaki takımı
create or replace function public.my_active_team()
returns uuid language sql stable security definer set search_path = public as $$
  select t.id from teams t
  join leagues l on l.id = t.league_id
  join seasons s on s.id = l.season_id and s.status = 'active'
  where t.owner_id = auth.uid() limit 1;
$$;

-- ---------- Teklif yap ----------
create or replace function public.make_offer(p_target uuid, p_out uuid, p_price bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := my_active_team();
  v_seller teams%rowtype;
  v_season int;
  v_id uuid;
  v_money bigint;
begin
  if v_me is null then raise exception 'Takımın bulunamadı'; end if;
  if p_price is null or p_price < 0 then raise exception 'Geçersiz teklif tutarı'; end if;
  if p_price > 1000000000 then raise exception 'Geçersiz teklif tutarı'; end if;

  select t.* into v_seller from teams t join drivers d on d.team_id = t.id where d.id = p_target;
  if not found then raise exception 'Pilot bulunamadı'; end if;
  if v_seller.id = v_me then raise exception 'Bu pilot zaten senin takımında'; end if;
  if v_seller.owner_id is null then raise exception 'Bu pilot bir bot takımında, pazardan doğrudan alabilirsin'; end if;
  if not exists (select 1 from drivers where id = p_out and team_id = v_me) then
    raise exception 'Bırakacağın pilot senin takımında değil';
  end if;

  select money into v_money from teams where id = v_me;
  if v_money < p_price then raise exception 'Yeterli paran yok'; end if;

  if (select count(*) from offers where buyer_team = v_me and status = 'pending' and expires_at > now()) >= 5 then
    raise exception 'Aynı anda en fazla 5 bekleyen teklifin olabilir';
  end if;
  if exists (select 1 from offers where buyer_team = v_me and target_driver = p_target and status = 'pending' and expires_at > now()) then
    raise exception 'Bu pilota zaten bekleyen bir teklifin var';
  end if;

  select l.season_id into v_season from teams t join leagues l on l.id = t.league_id where t.id = v_me;
  insert into offers (season_id, buyer_team, seller_team, target_driver, out_driver, price)
  values (v_season, v_me, v_seller.id, p_target, p_out, p_price)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Teklifi iptal et (teklifi yapan) ----------
create or replace function public.cancel_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update offers set status = 'cancelled', decided_at = now()
  where id = p_offer and buyer_team = my_active_team() and status = 'pending';
  if not found then raise exception 'Teklif bulunamadı'; end if;
end;
$$;

-- ---------- Teklifi kabul et / reddet (pilotun sahibi) ----------
create or replace function public.respond_offer(p_offer uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  o offers%rowtype;
  v_me uuid := my_active_team();
  buyer teams%rowtype;
  seller teams%rowtype;
  tgt drivers%rowtype;
  outd drivers%rowtype;
  v_tseat int;
  v_oseat int;
begin
  select * into o from offers where id = p_offer for update;
  if not found or o.seller_team <> v_me then raise exception 'Teklif bulunamadı'; end if;
  if o.status <> 'pending' then raise exception 'Bu teklif artık geçerli değil'; end if;
  if o.expires_at <= now() then
    update offers set status = 'expired', decided_at = now() where id = o.id;
    raise exception 'Bu teklifin süresi dolmuş';
  end if;

  if not p_accept then
    update offers set status = 'rejected', decided_at = now() where id = o.id;
    return 'rejected';
  end if;

  -- Kilitle (her zaman aynı sırayla, kilitlenme olmasın)
  perform 1 from teams where id in (o.buyer_team, o.seller_team) order by id for update;
  select * into buyer from teams where id = o.buyer_team;
  select * into seller from teams where id = o.seller_team;
  select * into tgt from drivers where id = o.target_driver for update;
  select * into outd from drivers where id = o.out_driver for update;

  if tgt.team_id is distinct from seller.id or outd.team_id is distinct from buyer.id then
    update offers set status = 'expired', decided_at = now() where id = o.id;
    raise exception 'Pilotlardan biri artık o takımda değil, teklif geçersiz oldu';
  end if;
  if buyer.money < o.price then raise exception 'Teklifi yapan takımın parası artık yetmiyor'; end if;
  if (select count(*) from transfers where to_team = buyer.id and season_id = o.season_id and kind <> 'released') >= 4 then
    raise exception 'Teklifi yapan takım bu sezonki transfer hakkını doldurmuş';
  end if;
  if (select count(*) from transfers where to_team = seller.id and season_id = o.season_id and kind <> 'released') >= 4 then
    raise exception 'Bu sezon transfer hakkını doldurdun (en fazla 4)';
  end if;

  -- Pilotlar yer değiştirir
  v_tseat := tgt.seat;
  v_oseat := outd.seat;
  update drivers set team_id = null, seat = null where id = tgt.id;
  update drivers set team_id = seller.id, seat = v_tseat, salary = driver_salary(skill, potential, age) where id = outd.id;
  update drivers set team_id = buyer.id,  seat = v_oseat, salary = driver_salary(skill, potential, age) where id = tgt.id;

  update teams set money = money - o.price where id = buyer.id;
  update teams set money = money + o.price where id = seller.id;

  delete from strategies where driver_id in (tgt.id, outd.id)
    and race_id in (select id from races where status = 'scheduled');

  insert into transfers (season_id, driver_id, driver_name, from_team, to_team, price, kind)
  values (o.season_id, tgt.id, tgt.name, seller.id, buyer.id, o.price, 'offer'),
         (o.season_id, outd.id, outd.name, buyer.id, seller.id, 0, 'offer');

  update offers set status = 'accepted', decided_at = now() where id = o.id;
  -- Bu iki pilotu içeren diğer bekleyen teklifler geçersiz olur
  update offers set status = 'expired', decided_at = now()
  where status = 'pending' and id <> o.id
    and (target_driver in (tgt.id, outd.id) or out_driver in (tgt.id, outd.id));
  return 'accepted';
end;
$$;

revoke execute on function public.make_offer(uuid, uuid, bigint) from public, anon;
revoke execute on function public.cancel_offer(uuid) from public, anon;
revoke execute on function public.respond_offer(uuid, boolean) from public, anon;
grant  execute on function public.make_offer(uuid, uuid, bigint) to authenticated;
grant  execute on function public.cancel_offer(uuid) to authenticated;
grant  execute on function public.respond_offer(uuid, boolean) to authenticated;
grant  execute on function public.my_active_team() to authenticated;

-- Pazar/serbest pilot imzalarken de bekleyen teklifler geçersiz olsun
create or replace function public.offers_invalidate_on_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is distinct from old.team_id then
    update offers set status = 'expired', decided_at = now()
    where status = 'pending' and (target_driver = new.id or out_driver = new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists offers_invalidate_on_move on public.drivers;
create trigger offers_invalidate_on_move after update of team_id on public.drivers
  for each row execute function public.offers_invalidate_on_move();

-- Kontrol
select count(*) as teklif_tablosu_hazir from public.offers;
