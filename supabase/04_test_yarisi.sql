-- =========================================================
-- TEST: Türkiye 1. Lig'in 1. yarışını hemen koşulacak hale getirir.
-- Çalıştırdıktan sonra en fazla 5 dakika bekle (ya da run-races
-- fonksiyonunu panelden "Test" ile elle çalıştır) ve oyunu yenile.
-- Not: Yayına almadan önce sezonu sıfırlayacağız, test sonuçları kalmayacak.
-- =========================================================
update public.races
set scheduled_at = now() - interval '1 minute', status = 'scheduled', claimed_at = null
where round = 1
  and status in ('scheduled', 'running')
  and league_id = (select id from public.leagues where country_code = 'TR' and tier = 1 order by created_at limit 1);

select round, track_id, status, scheduled_at from public.races
where league_id = (select id from public.leagues where country_code = 'TR' and tier = 1 order by created_at limit 1)
order by round limit 2;
