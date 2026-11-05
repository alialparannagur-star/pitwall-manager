-- =========================================================
-- PitWall Manager — OTOMATİK YARIŞ ZAMANLAYICISI (4. aşama)
-- ÖNCE "run-races" fonksiyonunu yükle, SONRA bu dosyayı çalıştır.
-- Her 5 dakikada bir run-races fonksiyonunu çağırır; fonksiyon
-- saati gelmiş yarışları bulup koşturur.
-- =========================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daha önce kurulduysa eskisini kaldır (dosyayı tekrar çalıştırmak güvenli olsun)
select cron.unschedule(jobid) from cron.job where jobname = 'pitwall-run-races';

select cron.schedule(
  'pitwall-run-races',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://sonbiftqdrjlhqzaorgz.supabase.co/functions/v1/run-races',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Kontrol: zamanlayıcı listede görünmeli
select jobid, jobname, schedule, active from cron.job where jobname = 'pitwall-run-races';
