-- =========================================================
-- PitWall Manager — KULLANIM KOŞULLARI ONAYI + HESABIMI SİL
-- Supabase > SQL Editor'e bu dosyanın tamamını yapıştırıp "Run" de.
-- =========================================================

-- Oyuncunun kabul ettiği Kullanım Koşulları sürümü
alter table public.profiles add column if not exists terms_version int not null default 0;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- Koşulları kabul et
create or replace function public.accept_terms(p_version int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın.'; end if;
  update profiles set terms_version = greatest(terms_version, p_version), terms_accepted_at = now()
  where id = auth.uid();
end;
$$;

-- Kendi kabul bilgimi oku (profil tablosundaki bu sütunlar herkese gösterilmez)
create or replace function public.my_terms()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select terms_version from profiles where id = auth.uid()), -1);
$$;

-- ---------- HESABIMI SİL ----------
-- Silinenler: giriş bilgileri (e-posta, şifre), profil, sohbet mesajları, stratejiler, bekleyen teklifler.
-- Geri bildirim mesajları kimliksizleştirilir. Takım bota devredilir; yarış sonuçları ve kupalar
-- oyun geçmişi olarak kişiyle bağlantısı olmadan kalır.
create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Önce giriş yapmalısın.'; end if;
  if upper(trim(coalesce(p_confirm, ''))) not in ('SİL', 'SIL', 'DELETE') then
    raise exception 'Onay için SİL yazmalısın.';
  end if;

  delete from public.league_messages where user_id = v_uid;
  update public.feedback set user_id = null, username = null, browser = null where user_id = v_uid;
  update public.offers set status = 'cancelled', decided_at = now()
    where status = 'pending' and (buyer_team in (select id from public.teams where owner_id = v_uid)
                                  or seller_team in (select id from public.teams where owner_id = v_uid));
  delete from public.strategies where driver_id in
    (select d.id from public.drivers d join public.teams t on t.id = d.team_id where t.owner_id = v_uid);
  update public.teams set owner_id = null where owner_id = v_uid;
  update public.trophies set owner_id = null where owner_id = v_uid;

  -- Profil, auth.users silinince otomatik silinir (on delete cascade)
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
grant execute on function public.accept_terms(int) to authenticated;
grant execute on function public.my_terms() to authenticated;
