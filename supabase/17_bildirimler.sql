-- =========================================================
-- PitWall Manager — TELEFON BİLDİRİMLERİ (Web Push)
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- Bildirimler yarış sunucusu (run-races) tarafından her 5 dakikada bir gönderilir.
-- =========================================================

-- Oyuncuların bildirim abonelikleri (cihaz başına bir satır). Kimse doğrudan okuyamaz.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  lang        text not null default 'tr',
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

-- Aynı bildirimi iki kez göndermemek için kayıt
create table if not exists public.push_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  ref        text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.push_log enable row level security;

-- Oyuncunun istediği deneme bildirimleri
create table if not exists public.push_tests (
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.push_tests enable row level security;

-- Son gönderim özeti (hata ayıklamak için; kişisel veri içermez, herkes okuyabilir)
create table if not exists public.push_status (
  id         int primary key default 1 check (id = 1),
  last_run   timestamptz,
  sent       int not null default 0,
  failed     int not null default 0,
  removed    int not null default 0,
  last_error text
);
insert into public.push_status (id) values (1) on conflict do nothing;
alter table public.push_status enable row level security;
drop policy if exists "herkes okur" on public.push_status;
create policy "herkes okur" on public.push_status for select using (true);
grant select on public.push_status to anon, authenticated;

-- Rozet bildirimleri için: daha önce kazanılmış rozetler için bildirim gönderilmez
alter table public.achievements_earned add column if not exists pushed boolean not null default false;
update public.achievements_earned set pushed = true where not pushed;

-- ---------- Oyuncu tarafı ----------
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın.'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Geçersiz abonelik'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth, lang)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, case when p_lang = 'en' then 'en' else 'tr' end)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang;
  -- Cihaz başına sınır: bir oyuncunun en fazla 5 cihazı
  delete from push_subscriptions where user_id = auth.uid() and endpoint not in
    (select endpoint from push_subscriptions where user_id = auth.uid() order by created_at desc limit 5);
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.request_test_push()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın.'; end if;
  if not exists (select 1 from push_subscriptions where user_id = auth.uid()) then
    raise exception 'Önce bu cihazda bildirimleri aç.';
  end if;
  if exists (select 1 from push_tests where user_id = auth.uid() and created_at > now() - interval '2 minutes') then
    raise exception 'Deneme bildirimi zaten sırada. Birkaç dakika içinde gelecek.';
  end if;
  insert into push_tests (user_id) values (auth.uid());
end;
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.request_test_push() to authenticated;

-- ---------- Sunucu tarafı (yalnızca yarış sunucusu) ----------
-- Gönderilecek bildirimleri toplar ve "gönderildi" olarak işaretler.
create or replace function public.push_collect()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  items jsonb := '[]'::jsonb;
  r record;
begin
  -- 1) Biten yarışların sonuçları (son 30 dakika)
  for r in
    with fin as (
      select ra.id, ra.track_id, ra.title, ra.round from races ra
      where ra.status = 'finished' and ra.finished_at > now() - interval '30 minutes'
    ), tm as (
      select distinct f.id as race_id, f.track_id, f.title, f.round, t.id as team_id, t.owner_id
      from fin f join race_results rr on rr.race_id = f.id join teams t on t.id = rr.team_id
      where t.owner_id is not null
    ), ins as (
      insert into push_log (user_id, kind, ref)
      select owner_id, 'result', race_id::text from tm
      where exists (select 1 from push_subscriptions s where s.user_id = tm.owner_id)
      on conflict do nothing
      returning user_id, ref
    )
    select tm.*, (select jsonb_agg(jsonb_build_object('name', d.name, 'pos', rr.pos, 'dnf', rr.dnf, 'points', rr.points) order by rr.pos)
                  from race_results rr join drivers d on d.id = rr.driver_id where rr.race_id = tm.race_id and rr.team_id = tm.team_id) as drivers,
           (select prize + sponsor - salaries from race_team_results x where x.race_id = tm.race_id and x.team_id = tm.team_id) as net
    from tm join ins on ins.user_id = tm.owner_id and ins.ref = tm.race_id::text
  loop
    items := items || jsonb_build_object('user_id', r.owner_id, 'kind', 'result',
      'data', jsonb_build_object('track_id', r.track_id, 'title', r.title, 'round', r.round, 'drivers', r.drivers, 'net', r.net));
  end loop;

  -- 2) Strateji hatırlatması: 1 saat içinde başlayacak yarış, en az bir pilotun stratejisi kaydedilmemiş
  for r in
    with soon as (
      select ra.* from races ra
      where ra.status = 'scheduled' and ra.scheduled_at > now() + interval '10 minutes' and ra.scheduled_at <= now() + interval '65 minutes'
    ), tm as (
      select s.id as race_id, s.track_id, s.scheduled_at, t.id as team_id, t.owner_id
      from soon s join teams t on (s.league_id is not null and t.league_id = s.league_id)
      where t.owner_id is not null
      union
      select s.id, s.track_id, s.scheduled_at, t.id, t.owner_id
      from soon s join world_group_teams wg on wg.group_id = s.world_group_id join teams t on t.id = wg.team_id
      where s.world_group_id is not null and t.owner_id is not null
    ), need as (
      select tm.* from tm
      where (select count(*) from strategies st join drivers d on d.id = st.driver_id
             where st.race_id = tm.race_id and d.team_id = tm.team_id) < 2
        and exists (select 1 from push_subscriptions s where s.user_id = tm.owner_id)
    ), ins as (
      insert into push_log (user_id, kind, ref)
      select owner_id, 'remind', race_id::text from need
      on conflict do nothing
      returning user_id, ref
    )
    select need.* from need join ins on ins.user_id = need.owner_id and ins.ref = need.race_id::text
  loop
    items := items || jsonb_build_object('user_id', r.owner_id, 'kind', 'remind',
      'data', jsonb_build_object('track_id', r.track_id, 'minutes', greatest(1, round(extract(epoch from (r.scheduled_at - now())) / 60))));
  end loop;

  -- 3) Yeni rozetler
  for r in
    update achievements_earned a set pushed = true where not pushed
    returning a.user_id, a.code, a.reward
  loop
    if exists (select 1 from push_subscriptions s where s.user_id = r.user_id) then
      items := items || jsonb_build_object('user_id', r.user_id, 'kind', 'ach', 'data', jsonb_build_object('code', r.code, 'reward', r.reward));
    end if;
  end loop;

  -- 4) Deneme bildirimleri
  for r in delete from push_tests returning user_id loop
    items := items || jsonb_build_object('user_id', r.user_id, 'kind', 'test', 'data', '{}'::jsonb);
  end loop;

  delete from push_log where created_at < now() - interval '30 days';

  -- Her bildirimi oyuncunun tüm cihazlarına çoğalt
  return coalesce((
    select jsonb_agg(i || jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'lang', s.lang))
    from jsonb_array_elements(items) i join push_subscriptions s on s.user_id = (i->>'user_id')::uuid
  ), '[]'::jsonb);
end;
$$;

create or replace function public.push_remove(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;

create or replace function public.push_report(p_sent int, p_failed int, p_removed int, p_error text)
returns void language sql security definer set search_path = public as $$
  update push_status set last_run = now(), sent = p_sent, failed = p_failed, removed = p_removed,
    last_error = coalesce(p_error, last_error) where id = 1;
$$;

revoke execute on function public.push_collect() from public, anon, authenticated;
revoke execute on function public.push_remove(text) from public, anon, authenticated;
revoke execute on function public.push_report(int, int, int, text) from public, anon, authenticated;
grant execute on function public.push_collect() to service_role;
grant execute on function public.push_remove(text) to service_role;
grant execute on function public.push_report(int, int, int, text) to service_role;

-- Eski bildirim kayıtlarını temizle (30 günden eski)
delete from public.push_log where created_at < now() - interval '30 days';
