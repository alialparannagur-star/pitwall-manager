/* =========================================================
   PitWall Manager — bildirim metinleri ve gönderimi (yarış sunucusunda çalışır)
   ========================================================= */
(function (g) {
  const D = g.PW_DATA;
  // İngilizce pist adları (ui/i18n.js içindeki listeyle aynı; derlemede eklenir)
  const TRACK_EN = g.PW_TRACK_EN || {};
  const ACH = {
    first_points: ["🎯", "İlk puan", "First points"], fastest_lap: ["🟣", "En hızlı tur", "Fastest lap"],
    double_points: ["🤝", "Takım işi", "Teamwork"], first_podium: ["🥉", "İlk podyum", "First podium"],
    first_win: ["🏁", "İlk galibiyet", "First win"], comeback: ["⬆️", "Geriden gelen", "Comeback"],
    car_70: ["🔧", "Mühendislik harikası", "Engineering marvel"], sponsor_10: ["💼", "Sponsorun gözdesi", "Sponsor's favourite"],
    double_podium: ["🍾", "Çifte podyum", "Double podium"], rain_win: ["🌧️", "Yağmur ustası", "Rain master"],
    one_two: ["👑", "Bire-iki", "One-two"], wins_5: ["🔥", "Seri galip", "Serial winner"], races_50: ["📅", "Emektar", "Veteran"],
    league_champ: ["🏅", "Lig şampiyonu", "League champion"], wins_25: ["💎", "Efsane", "Legend"],
    world_podium: ["🌍", "Dünya sahnesi", "World stage"], world_champ: ["🏆", "Dünya şampiyonu", "World champion"],
  };
  const money = (n, en) => "$" + Math.round(n || 0).toLocaleString(en ? "en-GB" : "tr-TR");

  function compose(item) {
    const en = item.lang === "en";
    const d = item.data || {};
    const tr = d.track_id && D ? D.TRACKS.find((t) => t.id === d.track_id) : null;
    const track = tr ? `${tr.flag} ${en ? TRACK_EN[tr.id] || tr.name : tr.name}` : "";
    if (item.kind === "result") {
      const parts = (d.drivers || []).map((x) => `${x.name.split(" ").slice(-1)[0]} ${x.dnf ? "DNF" : "P" + x.pos}${x.points ? ` (+${x.points})` : ""}`);
      const best = Math.min(...(d.drivers || []).filter((x) => !x.dnf).map((x) => x.pos).concat([99]));
      const icon = best === 1 ? "🏆" : best <= 3 ? "🍾" : "🏁";
      return {
        title: `${icon} ${track} ${en ? "— race finished" : "— yarış bitti"}`,
        body: parts.join(" · ") + (d.net != null ? ` · ${d.net >= 0 ? "+" : "−"}${money(Math.abs(d.net), en)}` : "") + (en ? " · Tap to watch the replay." : " · Tekrarı izlemek için dokun."),
        tag: "result", url: "./",
      };
    }
    if (item.kind === "remind") {
      return {
        title: en ? `⏱️ ${track} starts in ${d.minutes} min` : `⏱️ ${track} ${d.minutes} dk sonra başlıyor`,
        body: en ? "You haven't saved a strategy for both drivers yet. Set it now or your engineers' plan will be used."
                 : "İki pilotun için de strateji kaydetmedin. Şimdi kur, yoksa mühendislerin planı kullanılacak.",
        tag: "remind", url: "./",
      };
    }
    if (item.kind === "ach") {
      const a = ACH[d.code] || ["🏅", d.code, d.code];
      return {
        title: en ? `🏅 New badge: ${a[0]} ${a[2]}` : `🏅 Yeni rozet: ${a[0]} ${a[1]}`,
        body: en ? `+${money(d.reward, true)} has been added to your team budget.` : `Takım kasana +${money(d.reward)} eklendi.`,
        tag: "ach-" + d.code, url: "./",
      };
    }
    return {
      title: en ? "🔔 PitWall test notification" : "🔔 PitWall deneme bildirimi",
      body: en ? "Notifications work on this device. See you at the races! 🏁" : "Bildirimler bu cihazda çalışıyor. Yarışlarda görüşürüz! 🏁",
      tag: "test", url: "./",
    };
  }

  // Bekleyen bildirimleri toplar ve gönderir. VAPID anahtarları yoksa hiçbir şey yapmaz.
  async function sendPending(rpc, vapid) {
    if (!vapid || !vapid.publicKey || !vapid.privateKey) return { skipped: "VAPID anahtarı yok" };
    const items = (await rpc("push_collect", {})) || [];
    let sent = 0, failed = 0, removed = 0, lastError = null;
    const dead = new Set();
    for (const it of items) {
      if (dead.has(it.endpoint)) continue;
      try {
        const r = await g.PW_WEBPUSH.send({ endpoint: it.endpoint, keys: { p256dh: it.p256dh, auth: it.auth } }, compose(it), vapid,
          { urgency: it.kind === "remind" ? "high" : "normal", ttl: it.kind === "remind" ? 3600 : 6 * 3600 });
        if (r.status >= 200 && r.status < 300) sent++;
        else if (r.status === 404 || r.status === 410) { removed++; dead.add(it.endpoint); await rpc("push_remove", { p_endpoint: it.endpoint }); }
        else { failed++; lastError = `HTTP ${r.status} ${new URL(it.endpoint).host}: ${r.text}`; }
      } catch (e) {
        failed++; lastError = String((e && e.message) || e).slice(0, 300);
      }
    }
    if (items.length) await rpc("push_report", { p_sent: sent, p_failed: failed, p_removed: removed, p_error: lastError });
    return { items: items.length, sent, failed, removed, lastError };
  }

  g.PW_NOTIFY = { compose, sendPending };
})(typeof globalThis !== "undefined" ? globalThis : window);
