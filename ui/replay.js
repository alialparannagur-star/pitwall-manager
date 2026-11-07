/* =========================================================
   PitWall Manager — YARIŞ TEKRARI ve SONUÇ EKRANI
   PW_Replay.open({ replay, myTeamId, teamResults, onBack })
   replay: sunucunun kaydettiği sıkıştırılmış veri (v2)
   ========================================================= */
(function () {
  const { COMPOUNDS, MODES, TRACKS, ECONOMY } = PW_DATA;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Math.round(n).toLocaleString(LOCALE());
  const wearColor = (w) => (w < 50 ? "#2fbf71" : w < 70 ? "#ffd43b" : "#ff5c5c");
  function fmtLap(t) {
    if (t == null || !isFinite(t)) return "—";
    const m = Math.floor(t / 60);
    return m + ":" + (t - m * 60).toFixed(3).padStart(6, "0");
  }
  function fmtRaceTime(t) {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60).toFixed(3).padStart(6, "0");
    return `${h}:${String(m).padStart(2, "0")}:${s}`;
  }

  // Pist durumu rozeti (ıslaklık 0-100)
  function wxBadge(wx, i) {
    if (!wx || !wx.some((x) => x > 0)) return "";
    const w = wx[Math.min(i, wx.length - 1)] || 0;
    const [icon, label, cls] = w < 5 ? ["☀️", "Kuru", "dry"] : w < 22 ? ["🌦️", "Nemli", "damp"] : w < 60 ? ["🌧️", "Islak", "wet"] : ["⛈️", "Çok ıslak", "vwet"];
    return ` <span class="wx-badge ${cls}">${icon} ${T(label)}${w >= 5 ? ` · ${PW_I18N.lang === "en" ? w + "%" : "%" + w}` : ""}</span>`;
  }
  const wetCallName = (plan) => (PW_DATA.WET_CALLS[plan.wetCall] || PW_DATA.WET_CALLS.normal).name;
  const flag = (e) => (e.nat && window.PW_FLAGS && window.PW_FLAGS[e.nat] ? window.PW_FLAGS[e.nat] + " " : "");
  let S = null; // aktif tekrar
  const view = { i: 0, timer: null, speed: 400 };

  // Sıkıştırılmış veriyi okunur hale getir
  function expand(rep) {
    const entries = rep.entries;
    return {
      track: TRACKS.find((t) => t.id === rep.trackId),
      round: rep.round,
      entries,
      results: rep.results.map((r) => ({ ...r, e: entries[r.i] })),
      laps: rep.laps.map((row) => row.map((c, i) => ({ i, t: c[0], c: c[1], a: c[2], w: c[3], p: c[4], d: c[5], l: c[6] }))),
      events: rep.events.map((e) => ({ lap: e[0], text: e[1], ids: e[2], kind: e[3], params: e[4] || null })),
      wx: rep.wx || null,
      sc: rep.sc || null,
    };
  }

  function open({ replay, myTeamId, teamResults, onBack }) {
    stop();
    const R = expand(replay);
    const mine = new Set(R.entries.map((e, i) => (e.teamId === myTeamId ? i : -1)).filter((i) => i >= 0));
    const grid = {};
    R.results.forEach((r) => (grid[r.i] = r.grid));
    // Her tur için toplam pit sayısı
    const cnt = {};
    const pitsAt = R.laps.map((row) => { row.forEach((c) => { if (c.p) cnt[c.i] = (cnt[c.i] || 0) + 1; }); return { ...cnt }; });
    S = { R, mine, grid, pitsAt, myTeamId, teamResults: teamResults || [], onBack };

    $("#raceTitle").textContent = `${R.track.flag} ${trackName(R.track)} · ${replay.title ? "🌍 " + trStored(replay.title) : T("Yarış") + " " + R.round}`;
    $("#scrub").max = R.laps.length - 1;
    $("#playBtn").textContent = T("▶ İzle");
    view.i = 0;
    setSpeed(view.speed);
    render();
    showScreen("race");
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
    $("#" + id).classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  const lastIdx = () => S.R.laps.length - 1;
  function stop() { clearInterval(view.timer); view.timer = null; }
  function togglePlay() {
    if (view.timer) { stop(); $("#playBtn").textContent = T("▶ İzle"); return; }
    if (view.i >= lastIdx()) view.i = 0;
    view.timer = setInterval(step, view.speed);
    $("#playBtn").textContent = T("⏸ Duraklat");
  }
  function step() {
    view.i++;
    render();
    if (view.i >= lastIdx()) { stop(); $("#playBtn").textContent = T("▶ Baştan izle"); }
  }
  function setSpeed(ms) {
    view.speed = ms;
    document.querySelectorAll("#race [data-speed]").forEach((b) => b.classList.toggle("active", +b.dataset.speed === ms));
    if (view.timer) { clearInterval(view.timer); view.timer = setInterval(step, ms); }
  }

  function render() {
    const { R, mine, grid, pitsAt } = S;
    const i = view.i, last = i >= lastIdx();
    const row = R.laps[i];
    $("#scrub").value = i;
    $("#lapInfo").innerHTML = (i === 0 ? T("Başlangıç dizilişi") : last ? `<b>${T("Damalı bayrak!")}</b> 🏁` : `${T("Tur")} <b>${i}</b> / ${R.track.laps}`) + wxBadge(R.wx, i) + (R.sc && R.sc[i] ? ` <span class="sc-badge">🚨 ${T("Güvenlik aracı")}</span>` : "");

    const order = last
      ? R.results.map((r) => row[r.i])
      : row.filter((c) => !c.d).sort((a, b) => a.t - b.t).concat(row.filter((c) => c.d).sort((a, b) => b.t - a.t));
    const leader = order[0];
    let html = `<tr><th>#</th><th>${T("Pilot")}</th><th>${T("Fark")}</th><th>${T("Son tur")}</th><th>${T("Lastik")}</th><th>Pit</th></tr>`;
    order.forEach((c, k) => {
      const e = R.entries[c.i];
      const diff = grid[c.i] - (k + 1);
      const arrow = i === 0 || c.d || diff === 0 ? "" : diff > 0 ? `<span class="up">▲${diff}</span>` : `<span class="down">▼${-diff}</span>`;
      const gap = c.d ? "DNF" : c === leader ? (i === 0 ? "Pole" : T("Lider")) : "+" + (c.t - leader.t).toFixed(2);
      html += `<tr class="${mine.has(c.i) ? "player" : ""} ${c.d ? "dnf" : ""}">
        <td class="pos">${k + 1}</td>
        <td><span class="teambar" style="background:${esc(e.color)}"></span>${flag(e)}${esc(e.name)} <span class="muted small">${esc(e.teamName)}</span> ${arrow}</td>
        <td>${gap}</td><td>${fmtLap(c.l)}</td>
        <td><span class="tyre ${c.c}">${c.c}</span> <small>${c.a}</small></td>
        <td>${pitsAt[i][c.i] || 0}${c.p ? ' <span class="pitflag">PIT</span>' : ""}</td></tr>`;
    });
    $("#board").innerHTML = html;

    $("#myCars").innerHTML = order.map((c, k) => ({ c, k })).filter(({ c }) => mine.has(c.i)).map(({ c, k }) => {
      const e = R.entries[c.i];
      const src = T(e.source === "player" ? "senin planın" : "mühendis önerisi");
      return `<div class="card driver-panel" style="border-left-color:${esc(e.color)}">
        <div class="dp-head"><span class="dp-pos">${c.d ? "DNF" : "P" + (k + 1)}</span><span class="dp-name">${esc(e.name)}</span>
          <span class="dp-gap">${c.d || c === leader ? "" : "+" + (c.t - leader.t).toFixed(1) + " sn"}</span></div>
        <div class="dp-tyre"><span class="tyre ${c.c}">${c.c}</span><span>${T(COMPOUNDS[c.c].name)} · ${T("{n} tur", { n: c.a })} · ${T("Aşınma")} %${c.w}</span></div>
        <div class="wearbar"><div class="wearfill" style="width:${c.w}%;background:${wearColor(c.w)}"></div></div>
        <div class="small muted">Plan (${src}): ${e.plan.start} → ${e.plan.stops.map((s) => `${s.tyre} (${T("tur")} ${s.lap})`).join(" → ")} · ${T(MODES[e.plan.mode].name)}${R.wx && R.wx.some((x) => x > 0) ? ` · ${T("Yağmur tepkisi")}: ${T(wetCallName(e.plan))}` : ""}</div>
      </div>`;
    }).join("");

    const onlyMine = $("#onlyMine").checked;
    const evs = R.events.filter((ev) => ev.lap <= i && (!onlyMine || ev.ids.some((x) => mine.has(x))));
    $("#log").innerHTML = evs.slice().reverse().slice(0, 80).map((ev) => {
      const isMine = ev.ids.some((x) => mine.has(x));
      return `<li class="${isMine ? "player" : ""} ${ev.kind === "dnf" && isMine ? "bad" : ""}"><span class="lapno">${T("T")}${ev.lap}</span>${esc(eventText(ev, R.entries))}</li>`;
    }).join("");

    $("#toEndBtn").textContent = T(last ? "Sonuçları gör →" : "Sonucu göster ⏭");
  }

  function showResults() {
    stop();
    const { R, mine, myTeamId, teamResults } = S;
    const winner = R.results[0];
    let html = `<tr><th>#</th><th>${T("Pilot")}</th><th>${T("Takım")}</th><th>${T("Süre / Fark")}</th><th>${T("En iyi tur")}</th><th>${T("Puan")}</th></tr>`;
    R.results.forEach((r) => {
      const time = r.dnf ? "DNF" : r === winner ? fmtRaceTime(r.total) : "+" + r.gap.toFixed(3);
      html += `<tr class="${mine.has(r.i) ? "player" : ""} ${r.dnf ? "dnf" : ""}">
        <td class="pos">${r.pos}</td>
        <td><span class="teambar" style="background:${esc(r.e.color)}"></span>${esc(r.e.name)}${r.penalty ? " ⚠️" : ""}</td>
        <td>${esc(r.e.teamName)}</td><td>${time}</td>
        <td>${fmtLap(r.best)}${r.fastest ? " 🟣" : ""}</td>
        <td class="num">${r.points || ""}</td></tr>`;
    });
    const my = teamResults.find((x) => x.team_id === myTeamId);
    if (my) {
      const catchUp = (my.rank_before - 1) * ECONOMY.catchUpPerRank;
      const sal = my.salaries || 0;
      $("#resPrize").innerHTML = `💰 ${T("Bu yarıştan kazancın")}: <b>${money(my.prize)}</b>${sal ? ` · ${T("Maaşlar")}: <b class="bad-text">−${money(sal)}</b> · Net: <b>${money(my.prize - sal)}</b>` : ""}
        <div class="small muted">${T("Katılım")} ${money(ECONOMY.prizeBase)} + ${T("{n} puan", { n: my.points })} × ${money(ECONOMY.prizePerPoint)}${catchUp ? ` + ${T("şampiyona desteği")} ${money(catchUp)}` : ""}</div>`;
      $("#resPrize").classList.remove("hidden");
    } else {
      $("#resPrize").classList.add("hidden");
    }
    $("#resTitle").textContent = `${R.track.flag} ${trackName(R.track)} — ${T("Sonuçlar")}`;
    $("#resTable").innerHTML = html;
    showScreen("results");
  }

  // Butonlar (sayfa yüklenince bir kez bağlanır)
  function wire() {
    $("#playBtn").onclick = togglePlay;
    $("#toEndBtn").onclick = () => {
      if (view.i >= lastIdx()) { showResults(); return; }
      stop(); view.i = lastIdx(); render(); $("#playBtn").textContent = T("▶ Baştan izle");
    };
    $("#scrub").oninput = (e) => { view.i = +e.target.value; render(); };
    $("#onlyMine").onchange = render;
    document.querySelectorAll("#race [data-speed]").forEach((b) => (b.onclick = () => setSpeed(+b.dataset.speed)));
    $("#raceBack").onclick = () => { stop(); S.onBack && S.onBack(); };
    $("#resBack").onclick = () => { S.onBack && S.onBack(); };
    $("#resReplay").onclick = () => { view.i = 0; render(); $("#playBtn").textContent = T("▶ İzle"); showScreen("race"); };
  }
  document.addEventListener("DOMContentLoaded", wire);
  if (document.readyState !== "loading") wire();

  window.PW_Replay = { open, showResults, stop };
})();
