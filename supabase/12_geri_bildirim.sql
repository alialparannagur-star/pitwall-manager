-- =========================================================
-- PitWall Manager — GERİ BİLDİRİM KUTUSU
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
--
-- Oyuncular oyunun içinden hata bildirimi / öneri gönderir.
-- Mesajları Supabase > Table Editor > feedback tablosunda görürsün
-- (en yeniler için created_at sütununa tıklayıp yeniden eskiye sırala).
-- Oyuncular sadece kendi mesajlarını görebilir; herkesin mesajını sadece sen görürsün.
-- =========================================================

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  username    text,
  kind        text not null check (kind in ('bug', 'idea', 'other')),
  message     text not null check (char_length(message) between 3 and 2000),
  screen      text,          -- oyuncu hangi ekrandaydı
  browser     text,          -- tarayıcı / cihaz bilgisi (hata ayıklamak için)
  status      text not null default 'yeni' check (status in ('yeni', 'okundu', 'yapıldı', 'yapılmayacak')),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback(user_id, created_at desc);

alter table public.feedback enable row level security;
drop policy if exists "kendi mesajını görür" on public.feedback;
create policy "kendi mesajını görür" on public.feedback for select using (user_id = auth.uid());

-- Gönderme: sadece giriş yapmış oyuncular, günde en fazla 10 mesaj
create or replace function public.send_feedback(p_kind text, p_message text, p_screen text, p_browser text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın.'; end if;
  if p_kind not in ('bug', 'idea', 'other') then raise exception 'Geçersiz tür'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 3 then raise exception 'Mesaj çok kısa.'; end if;
  select count(*) into v_count from feedback where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if v_count >= 10 then raise exception 'Bugünlük mesaj sınırına ulaştın (10). Yarın tekrar yazabilirsin.'; end if;
  insert into feedback (user_id, username, kind, message, screen, browser)
  values (auth.uid(),
          (select username from profiles where id = auth.uid()),
          p_kind, left(trim(p_message), 2000), left(p_screen, 40), left(p_browser, 300));
end $$;
