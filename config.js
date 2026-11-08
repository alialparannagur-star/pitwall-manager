/* Supabase bağlantı bilgileri.
   Bu anahtar (publishable) herkese açık olacak şekilde tasarlanmıştır; burada durması güvenlidir.
   ⚠️ "secret" / "service_role" anahtarını ASLA bu dosyaya ya da başka bir web dosyasına yazma! */
window.PW_CONFIG = {
  SUPABASE_URL: "https://sonbiftqdrjlhqzaorgz.supabase.co",
  SUPABASE_KEY: "sb_publishable_KpYbD23LBXJmveoC-iW6xg_uPYeRL_u",
  // Telefon bildirimleri için açık anahtar (tools/bildirim-anahtari.html ile oluştur). Boşsa bildirimler kapalı kalır.
  VAPID_PUBLIC_KEY: "BCnlmEElwxXkI2H1EkN0LjGY2kf60pw_NfRkdZ2__prKB9Cu8QTAiig9O-YLWzcJjDWg5SQ1ePcj1nVur4xRmzA",
};
