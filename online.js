"use strict";
/* =========================================================
   PitWall Manager — ONLINE OYUN ARAYÜZÜ (v0.4)
   Giriş/kayıt → takım devralma → merkez, garaj, strateji
   (Yarışları sunucuda koşturma 4. aşamada eklenecek)
   ========================================================= */
const { COMPOUNDS, PARTS, ECONOMY, TRACK_TYPES, TRACKS, upgradeCost, upgradeGain, DRIVER_ATTRS, trainCost, driverOverall, driverValue, driverSalary, MARKET } = PW_DATA;
const E = PW_ENGINE;
const TRACK = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
const PART_KEYS = Object.keys(PARTS);

const ME = { user: null, team: null, league: null, teams: [], races: [] };
let strat = null;
let countdownTimer = null;

/* ---------- Yardımcılar ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Math.round(n).toLocaleString(LOCALE());
const clone = (o) => JSON.parse(JSON.stringify(o));
const degLabel = (m) => T(m >= 1.15 ? "Yüksek" : m <= 0.9 ? "Düşük" : "Orta");
const otLabel = (o) => T(o >= 1.1 ? "Kolay" : o <= 0.6 ? "Çok zor" : "Normal");
const fmtDate = (iso) => new Date(iso).toLocaleString(LOCALE(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const flagOf = (code) => (code && ME.flags && ME.flags[code]) || "";
const agePhase = (a) => (a == null ? "" : T(a <= 22 ? "🚀 hızlı gelişim" : a <= 29 ? "📈 gelişiyor" : a <= 35 ? "↗️ yavaş gelişim" : a <= 40 ? "➖ zirvede, sabit" : "📉 düşüşte"));
const driverTag = (d) => `${flagOf(d.nationality)} ${esc(d.name)}${d.age ? ` <span class="muted small">${d.age}</span>` : ""}`;
const raceLabel = (r) => (r.title ? trStored(r.title) : T("Yarış {n} / 25", { n: r.round }));
const carOf = (t) => ({ engine: t.engine, aero: t.aero, chassis: t.chassis, reliability: t.reliability, pitcrew: t.pitcrew });

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  $("#" + id).classList.remove("hidden");
  window.scrollTo(0, 0);
}

let toastTimer = null;
function toast(msg, bad) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (bad ? " bad" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

// Buton tıklanınca işlem bitene kadar kilitle
async function busy(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = T("Bekle…");
  try { return await fn(); }
  finally { btn.disabled = false; btn.textContent = old; }
}

/* ---------- AÇILIŞ ---------- */
// Dil düğmesi: şu anki dilin tersini gösterir
document.documentElement.lang = PW_I18N.lang;
$("#langBtn").textContent = PW_I18N.lang === "tr" ? "🌐 EN" : "🌐 TR";
$("#langBtn").onclick = () => PW_I18N.setLang(PW_I18N.lang === "tr" ? "en" : "tr");
PW_I18N.applyStatic();

// Tema düğmesi: açık (Pit Şeridi) / koyu (Takım Boyası). Seçim bu cihazda saklanır.
function paintThemeBtn() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  $("#themeBtn").textContent = dark ? "☀️" : "🌙";
  $("#themeBtn").title = dark ? T("Açık temaya geç") : T("Koyu temaya geç");
}
$("#themeBtn").onclick = () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("pitwall_theme", next); } catch (e) {}
  paintThemeBtn();
};
paintThemeBtn();

// Koyu temada arayüz takım rengini alır. Çok koyu renkler okunur olsun diye açılır.
function applyTeamColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return;
  let rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (c) => {
    const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const panel = lum([35, 38, 43]);
  for (let i = 0; i < 12 && (lum(rgb) + 0.05) / (panel + 0.05) < 3; i++) rgb = rgb.map((v) => Math.round(v + (255 - v) * 0.15));
  const col = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  const on = lum(rgb) > 0.36 ? "#111111" : "#ffffff";
  const root = document.documentElement.style;
  root.setProperty("--team", col);
  root.setProperty("--on-team", on);
  try { localStorage.setItem("pitwall_team_color", JSON.stringify([col, on])); } catch (e) {}
}

async function boot() {
  show("loading");
  try {
    ME.user = await api.getUser();
    if (!ME.user) { showAuth(); return; }
    await enter();
  } catch (e) {
    $("#loading").innerHTML = `<div class="card narrow center"><p class="bad-text">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tekrar dene</button></div>`;
  }
}

async function enter() {
  $("#logoutBtn").classList.remove("hidden");
  const team = await api.myTeam();
  if (!team) { await showJoin(); return; }
  ME.team = team;
  applyTeamColor(team.color);
  ME.league = team.leagues;
  if (!ME.flags) {
    try {
      const list = await api.countries();
      ME.flags = Object.fromEntries(list.map((c) => [c.code, c.flag]));
      PW_I18N.rememberCountries(list);
    } catch (e) { ME.flags = {}; }
    window.PW_FLAGS = ME.flags;
  }
  document.querySelector(".nav").classList.remove("hidden");
  await loadLeague();
  showHub();
}

async function loadLeague() {
  const [teams, races, world] = await Promise.all([
    api.leagueTeams(ME.league.id),
    api.leagueRaces(ME.league.id, ME.league.season_id),
    api.myWorldRaces(ME.team.id, ME.league.season_id).catch(() => []),
  ]);
  ME.teams = teams;
  // Lig yarışları + (katılıyorsa) dünya turnuvası yarışları, tarih sırasıyla
  ME.races = races.concat(world).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const fresh = teams.find((t) => t.id === ME.team.id);
  if (fresh) ME.team = Object.assign({}, ME.team, fresh);
}

/* ---------- GİRİŞ / KAYIT ---------- */
let authMode = "login";
function showAuth() {
  $("#logoutBtn").classList.add("hidden");
  $("#topInfo").textContent = "";
  show("landing");
}
function openAuth(mode) { setAuthMode(mode); show("auth"); $("#authEmail").focus(); }
$("#lpSignup").onclick = () => openAuth("signup");
$("#lpSignup2").onclick = () => openAuth("signup");
$("#lpLogin").onclick = () => openAuth("login");
$("#authBack").onclick = () => show("landing");
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-authmode]").forEach((b) => b.classList.toggle("active", b.dataset.authmode === mode));
  $("#authSubmit").textContent = T(mode === "login" ? "Giriş yap" : "Kayıt ol");
  $("#authPass").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#authMsg").textContent = "";
}
document.querySelectorAll("[data-authmode]").forEach((b) => (b.onclick = () => setAuthMode(b.dataset.authmode)));

$("#authForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const email = $("#authEmail").value.trim();
  const pass = $("#authPass").value;
  const msg = $("#authMsg");
  msg.className = "form-msg";
  msg.textContent = "";
  try {
    await busy($("#authSubmit"), async () => {
      if (authMode === "signup") {
        const r = await api.signUp(email, pass);
        if (r.needsConfirm) {
          msg.className = "form-msg ok";
          msg.textContent = T("Kayıt alındı! E-postana gelen bağlantıyla hesabını onayla, sonra giriş yap.");
          return;
        }
      } else {
        await api.signIn(email, pass);
      }
      ME.user = await api.getUser();
      await enter();
    });
  } catch (e) {
    msg.className = "form-msg bad";
    msg.textContent = e.message;
  }
};

$("#logoutBtn").onclick = async () => {
  await api.signOut();
  document.querySelector(".nav").classList.add("hidden");
  Object.assign(ME, { user: null, team: null, league: null, teams: [], races: [] });
  clearInterval(countdownTimer);
  showAuth();
};

/* ---------- OYUNA KATILMA ---------- */
async function showJoin() {
  $("#topInfo").textContent = "";
  const sel = $("#joinCountry");
  if (!sel.options.length) {
    const list = await api.countries();
    PW_I18N.rememberCountries(list);
    sel.innerHTML = `<option value="">${T("Ülkeni seç…")}</option>` +
      list.slice().sort((a, b) => countryName(a.code, a.name).localeCompare(countryName(b.code, b.name), LOCALE())).map((c) => `<option value="${esc(c.code)}">${esc(c.flag)} ${esc(countryName(c.code, c.name))}</option>`).join("");
    if (list.some((c) => c.code === "TR")) sel.value = "TR";
  }
  show("join");
}

$("#joinForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const msg = $("#joinMsg");
  msg.className = "form-msg";
  msg.textContent = "";
  const username = $("#joinUser").value.trim();
  const country = $("#joinCountry").value;
  if (!country) { msg.className = "form-msg bad"; msg.textContent = T("Bir ülke seç."); return; }
  try {
    await busy($("#joinSubmit"), async () => {
      await api.joinGame(username, country, $("#joinTeam").value.trim());
      await enter();
      toast(T("Takımın hazır! Hoş geldin 🏁"));
    });
  } catch (e) {
    msg.className = "form-msg bad";
    msg.textContent = e.message;
  }
};

/* ---------- MERKEZ ---------- */
function nextRace() {
  const now = Date.now();
  return ME.races.find((r) => r.status === "scheduled" && new Date(r.scheduled_at).getTime() > now) || null;
}

function leagueAvg(part) {
  if (!ME.teams.length) return 80;
  return ME.teams.reduce((s, t) => s + t[part], 0) / ME.teams.length;
}

function carStatsHtml(t) {
  return `<div class="carstats">${PART_KEYS.map((p) => `
    <span>${T(PARTS[p].name)}</span>
    <div class="statbar"><div class="fill" style="width:${t[p]}%"></div><div class="avg" style="left:${leagueAvg(p)}%" title="${T("Lig ortalaması")}"></div></div>
    <b class="num">${t[p]}</b>`).join("")}</div>
    <p class="muted small">${T("Beyaz çizgi: lig ortalaması")}</p>`;
}

function showHub() {
  const t = ME.team, L = ME.league;
  $("#topInfo").textContent = `${t.name} · ${L.countries.flag} ${leagueName(L)}`;
  $("#hubTeam").textContent = t.name;
  $("#hubTeam").style.color = t.color;
  $("#hubLeague").textContent = `${L.countries.flag} ${leagueName(L)} · ${T("Sezon {n}", { n: L.seasons.number })}`;
  $("#hubMoney").innerHTML = `${money(t.money)}<div class="small muted" style="font-weight:400">${T("Pilot maaşları: {x} / yarış", { x: money((t.drivers || []).reduce((n, d) => n + (d.salary || 0), 0)) })}</div>`;
  $("#hubCar").innerHTML = carStatsHtml(t);
  const unspent = (ME.team.drivers || []).reduce((n, d) => n + (d.dev_points || 0), 0);
  $("#goPilotsBtn").innerHTML = `👤 ${T("Pilotlar")}${unspent ? ` <span class="badge">${unspent}</span>` : ""}`;
  renderNextRace();
  renderLastRace();
  renderNews();
  renderOffers();
  renderCalendar();
  renderStandings();
  show("hub");
}

// Saati gelmiş ama sonucu henüz yazılmamış yarış (sunucu birkaç dakika içinde koşturur)
function liveRace() {
  const now = Date.now();
  return ME.races.find((r) => (r.status === "scheduled" || r.status === "running") && new Date(r.scheduled_at).getTime() <= now) || null;
}

function renderLastRace() {
  const done = ME.races.filter((r) => r.status === "finished");
  const card = $("#lastRaceCard");
  const live = liveRace();
  if (!done.length && !live) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  if (live) {
    const tr = TRACK[live.track_id];
    $("#lastRace").innerHTML = `<h2>${tr.flag} ${trackName(tr)}</h2><p class="warn-text">${T("🏁 Yarış şu an koşuluyor. Sonuçlar birkaç dakika içinde gelecek.")}</p>
      <button class="btn" id="refreshBtn">${T("↻ Yenile")}</button>`;
    $("#refreshBtn").onclick = async () => { await loadLeague(); showHub(); };
    return;
  }
  const r = done[done.length - 1];
  const tr = TRACK[r.track_id];
  $("#lastRace").innerHTML = `<h2>${tr.flag} ${trackName(tr)} <span class="muted small">${esc(raceLabel(r))}</span></h2><div id="lastRaceInfo" class="muted">${T("Yükleniyor…")}</div>
    <div class="btn-row"><button class="btn primary" data-watch="${r.id}">${T("▶ Yarışı izle")}</button></div>`;
  api.raceSummary(r.id, ME.team.id).then(({ results, team }) => {
    const el = $("#lastRaceInfo");
    if (!el) return;
    const drivers = ME.team.drivers.slice().sort((a, b) => a.seat - b.seat);
    const parts = drivers.map((d) => {
      const x = results.find((y) => y.driver_id === d.id);
      return x ? `${esc(d.name)}: <b>${x.dnf ? "DNF" : "P" + x.pos}</b>${x.points ? ` (+${x.points})` : ""}` : "";
    }).filter(Boolean);
    el.innerHTML = `${parts.join(" · ")}${team ? `<div class="money" style="font-size:16px;margin:6px 0 0">${T("+{x} kazandın", { x: money(team.prize) })}${team.salaries ? ` <span class="muted small" style="font-weight:400">(${T("maaşlar")} −${money(team.salaries)})</span>` : ""}</div>` : ""}`;
  }).catch(() => {});
}

// Sezon arası haberleri: geçen sezon sonunda takımda emekli olan pilotlar
function renderNews() {
  const card = $("#newsCard");
  card.classList.add("hidden");
  const n = ME.league.seasons.number;
  if (n <= 1) return;
  api.retirements(ME.team.id, n - 1).then((list) => {
    if (!list.length) return;
    card.innerHTML = `<div class="label">${T("📰 Sezon arası")}</div>` + list.map((r) =>
      `<p>👋 ${T("<b>{old}</b> {age} yaşında emekli oldu. Yerine genç yetenek <b>{new}</b> ({nage}) takıma katıldı.", {
        old: flagOf(r.old_nat) + " " + esc(r.old_name), age: r.old_age, new: flagOf(r.new_nat) + " " + esc(r.new_name), nage: r.new_age })}</p>`).join("");
    card.classList.remove("hidden");
  }).catch(() => {});
}

// Yarış izlendikten sonra dönülecek ekran (varsayılan: merkez)
let afterReplay = null;
async function watchRace(raceId) {
  try {
    const r = await api.raceDetail(raceId);
    if (!r.replay) { toast(T("Bu yarışın tekrarı yok."), true); return; }
    clearInterval(countdownTimer);
    const back = afterReplay || (async () => { await loadLeague(); showHub(); });
    PW_Replay.open({ replay: r.replay, myTeamId: ME.team.id, teamResults: r.race_team_results || [], onBack: back });
  } catch (e) { toast(e.message, true); }
}

// Sayfanın her yerindeki "İzle" ve takım bağlantıları
document.addEventListener("click", (ev) => {
  const w = ev.target.closest("[data-watch]");
  if (w) { watchRace(w.dataset.watch); return; }
  const t = ev.target.closest("[data-team]");
  if (t) { showTeam(t.dataset.team); return; }
  const l = ev.target.closest("[data-league]");
  if (l) { showLeague(l.dataset.league); return; }
});

function renderNextRace() {
  clearInterval(countdownTimer);
  const r = nextRace();
  if (!r) {
    $("#nextRace").innerHTML = `<p class="muted">${T("Bu sezon için planlanmış başka yarış yok.")}</p>`;
    $("#goStrategyBtn").disabled = true;
    return;
  }
  $("#goStrategyBtn").disabled = false;
  const tr = TRACK[r.track_id];
  const key = Object.entries(TRACK_TYPES[tr.type].w).sort((a, b) => b[1] - a[1])[0][0];
  $("#nextRace").innerHTML = `
    <h2>${tr.flag} ${trackName(tr)}</h2>
    ${r.title ? `<div class="world-tag">🌍 ${T("DÜNYA TURNUVASI")} · ${esc(trStored(r.title))}</div>` : ""}
    <p class="muted">${r.title ? "" : esc(raceLabel(r)) + " · "}${fmtDate(r.scheduled_at)} · ${T("{n} tur", { n: tr.laps })}</p>
    <p>${T("Pist tipi")}: <b>${T(TRACK_TYPES[tr.type].name)}</b> (${T("en önemli parça")}: ${T(PARTS[key].name)}) · ${T("Lastik aşınması")}: <b>${degLabel(tr.degMult)}</b> · ${T("Sollama")}: <b>${otLabel(tr.overtake)}</b></p>
    <div class="countdown" id="countdown"></div>
    <div id="stratState" class="small muted"></div>`;
  const tick = () => {
    const ms = new Date(r.scheduled_at).getTime() - Date.now();
    if (ms <= 0) { clearInterval(countdownTimer); renderNextRace(); renderLastRace(); renderCalendar(); return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    $("#countdown").textContent = "⏱ " + T("{d}{h} sa {m} dk {s} sn sonra başlıyor", { d: d ? T("{n} gün ", { n: d }) : "", h, m, s });
  };
  tick();
  countdownTimer = setInterval(tick, 1000);

  api.myStrategies(r.id).then((rows) => {
    const el = $("#stratState");
    if (!el) return;
    el.innerHTML = rows.length >= 2
      ? `<span class="ok-text">${T("✓ Stratejin kaydedildi")}</span>`
      : `<span class="warn-text">${T("Henüz strateji kaydetmedin. Kaydetmezsen mühendislerin önerdiği plan kullanılır.")}</span>`;
  }).catch(() => {});
}

function renderCalendar() {
  const next = nextRace();
  $("#calendar").innerHTML = calendarHtml(ME.races, next && next.id);
}

function calendarHtml(races, highlightId) {
  const label = { scheduled: T("Planlandı"), running: T("Koşuluyor"), finished: T("Bitti"), skipped: T("Atlandı") };
  return races.map((r) => {
    const tr = TRACK[r.track_id];
    return `<tr class="${r.id === highlightId ? "me" : ""}">
      <td>${r.title ? "🌍" : r.round}</td><td>${tr.flag} ${trackName(tr)}${r.title ? `<div class="small muted">${esc(trStored(r.title))}</div>` : ""}</td>
      <td class="muted">${fmtDate(r.scheduled_at)}</td>
      <td class="small">${r.status === "finished" ? `<button class="chip" data-watch="${r.id}">${T("▶ İzle")}</button>` : label[r.status] || r.status}</td></tr>`;
  }).join("");
}

function renderStandings() {
  $("#hubStandings").innerHTML = standingsHtml(ME.teams);
}

// Puan tablosu (her lig için kullanılır). Takım satırına tıklayınca takım sayfası açılır.
function standingsHtml(teamList) {
  const teams = teamList.slice().sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const drivers = teamList.flatMap((t) => (t.drivers || []).map((d) => ({ ...d, team: t })))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const mine = ME.team ? ME.team.id : null;
  return `
    <div class="tabs-2">
      <div><h3>${T("Takımlar")}</h3><table class="mini clickable">
        ${teams.map((t, i) => `<tr class="${t.id === mine ? "me" : ""}" data-team="${t.id}" title="${T("Takım sayfasını aç")}">
          <td>${i + 1}</td>
          <td><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}
            <div class="small muted">${t.owner_id ? "👤 " + esc(t.profiles ? t.profiles.username : T("oyuncu")) : "🤖 " + T("bot")}</div></td>
          <td class="num">${t.points}</td></tr>`).join("")}
      </table></div>
      <div><h3>${T("Pilotlar")}</h3><table class="mini clickable">
        ${drivers.map((d, i) => `<tr class="${d.team.id === mine ? "me" : ""}" data-team="${d.team.id}">
          <td>${i + 1}</td><td><span class="dot" style="background:${esc(d.team.color)}"></span>${flagOf(d.nationality)} ${esc(d.name)}
            <span class="muted small">${driverOverall(d)}</span></td>
          <td class="num">${d.points}</td></tr>`).join("")}
      </table></div>
    </div>`;
}

/* ---------- TAKIM SAYFASI ---------- */
let teamBack = null;
async function showTeam(teamId) {
  const cur = currentScreen();
  const backTo = ["race", "results", "teamPage"].includes(cur) ? teamBack : cur;
  try {
    const [t, results] = await Promise.all([api.team(teamId), api.teamResults(teamId)]);
    const leagueTeams = t.league_id === ME.league.id ? ME.teams : await api.leagueTeams(t.league_id);
    const avg = (p) => leagueTeams.reduce((s, x) => s + x[p], 0) / leagueTeams.length;
    const rank = leagueTeams.slice().sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).findIndex((x) => x.id === t.id) + 1;
    const L = t.leagues;
    const drivers = (t.drivers || []).slice().sort((a, b) => a.seat - b.seat);

    // Yarış yarış sonuçlar (iki pilot yan yana)
    const byRound = {};
    results.forEach((r) => {
      if (!r.races) return;
      const k = r.races.round;
      byRound[k] = byRound[k] || { round: k, track: r.races.track_id, raceId: r.race_id, cells: {}, pts: 0 };
      byRound[k].cells[r.driver_id] = r;
      byRound[k].pts += r.points;
    });
    const rounds = Object.values(byRound).sort((a, b) => b.round - a.round);
    const posCls = (x) => (!x ? "" : x.dnf ? "res-dnf" : x.pos === 1 ? "res-win" : x.pos <= 3 ? "res-pod" : x.pos <= 10 ? "res-pts" : "");

    $("#teamPageBody").innerHTML = `
      <div class="team-hero" style="border-top:6px solid ${esc(t.color)}">
        <div>
          <h1 style="color:${esc(t.color)}">${esc(t.name)}</h1>
          <div class="muted">${t.owner_id ? "👤 " + T("Menajer") + ": <b>" + esc(t.profiles ? t.profiles.username : T("oyuncu")) + "</b>" : "🤖 " + T("Bot takım")}
            · <a href="#" data-league="${L.id}">${esc(L.countries.flag)} ${esc(leagueName(L))}</a></div>
        </div>
        <div class="hero-stats">
          <div><span>${rank}.</span><small>${T("SIRA")}</small></div>
          <div><span>${t.points}</span><small>${T("PUAN")}</small></div>
          <div><span>${rounds.length}</span><small>${T("YARIŞ")}</small></div>
        </div>
      </div>

      <div id="teamTrophies" class="trophies"></div>
      <div class="team-grid-2">
        <div>
          <h3>${T("Araç")}</h3>
          <div class="carstats">${PART_KEYS.map((p) => `
            <span>${T(PARTS[p].name)}</span>
            <div class="statbar"><div class="fill" style="width:${t[p]}%;background:${esc(t.color)}"></div><div class="avg" style="left:${avg(p)}%"></div></div>
            <b class="num">${t[p]}</b>`).join("")}</div>
          <p class="muted small">${T("Beyaz çizgi: lig ortalaması")}</p>
        </div>
        <div>
          <h3>${T("Pilotlar")}</h3>
          ${drivers.map((d) => `
            <div class="mini-pilot">
              <div class="mp-head"><b>${driverTag(d)}</b><span class="mp-ovr">${driverOverall(d)}${d.potential ? `<small class="muted"> / ${d.potential}</small>` : ""}</span></div>
              <div class="mp-attrs">${Object.entries(DRIVER_ATTRS).map(([a, info]) => `<span>${T(info.name)} <b>${d[a] ?? "—"}</b></span>`).join("")}</div>
              <div class="muted small">${T("{p} puan · {r} yarış", { p: d.points || 0, r: d.races || 0 })}</div>
            </div>`).join("")}
        </div>
      </div>

      <h3 style="margin-top:18px">${T("Sezon sonuçları")}</h3>
      ${rounds.length ? `<table class="mini res-table">
        <tr><th>#</th><th>${T("Yarış")}</th>${drivers.map((d) => `<th>${esc(d.name.split(" ").slice(-1)[0])}</th>`).join("")}<th class="num">${T("Puan")}</th><th></th></tr>
        ${rounds.map((r) => `<tr>
          <td>${r.round > 25 ? "🌍" : r.round}</td><td>${TRACK[r.track].flag} ${trackName(TRACK[r.track])}</td>
          ${drivers.map((d) => { const x = r.cells[d.id]; return `<td><span class="res ${posCls(x)}">${!x ? "—" : x.dnf ? "DNF" : "P" + x.pos}</span></td>`; }).join("")}
          <td class="num">${r.pts || ""}</td>
          <td><button class="chip" data-watch="${r.raceId}">▶</button></td></tr>`).join("")}
      </table>` : `<p class="muted">${T("Henüz koşulmuş yarış yok.")}</p>`}`;

    teamBack = backTo;
    afterReplay = async () => { afterReplay = null; await showTeam(teamId); };
    show("teamPage");
    api.trophies(teamId).then((list) => {
      const el = $("#teamTrophies");
      if (el && list.length) el.innerHTML = list.map((x) => `<span class="trophy ${esc(x.kind)}">${esc(trStored(x.label))}</span>`).join("");
    }).catch(() => {});
  } catch (e) { toast(e.message, true); }
}

function currentScreen() {
  const s = [...document.querySelectorAll(".screen")].find((x) => !x.classList.contains("hidden"));
  return s ? s.id : "hub";
}

// Geri: takım sayfasını hangi ekrandan açtıysan oraya döner
async function goBackFrom(page) {
  afterReplay = null;
  const target = page === "teamPage" ? teamBack : leagueBack;
  if (target === "leaguePage" && currentLeagueId) return showLeague(currentLeagueId);
  if (target === "leagues") return showLeagues();
  if (target === "world") return showWorld();
  await loadLeague();
  showHub();
}

/* ---------- LİGLER (TÜM ÜLKELER) ---------- */
async function showLeagues() {
  afterReplay = null;
  try {
    const list = await api.leaguesOverview(ME.league.season_id);
    const byCountry = {};
    list.forEach((l) => { (byCountry[l.country_code] = byCountry[l.country_code] || { c: { ...l.countries, code: l.country_code }, leagues: [] }).leagues.push(l); });
    const countries = Object.values(byCountry).sort((a, b) =>
      b.leagues.reduce((n, l) => n + l.teams.filter((t) => t.owner_id).length, 0) - a.leagues.reduce((n, l) => n + l.teams.filter((t) => t.owner_id).length, 0) || a.c.name.localeCompare(b.c.name));
    const players = list.reduce((n, l) => n + l.teams.filter((t) => t.owner_id).length, 0);
    $("#leaguesSummary").textContent = T("{c} ülke · {l} lig · {p} oyuncu", { c: countries.length, l: list.length, p: players });
    $("#leaguesBody").innerHTML = countries.length ? countries.map(({ c, leagues }) => `
      <div class="country-block" data-search="${esc((c.name + " " + countryName(c.code, c.name)).toLocaleLowerCase(LOCALE()))}">
        <h3 class="country-name">${esc(c.flag)} ${esc(countryName(c.code, c.name))}</h3>
        <div class="league-cards">
          ${leagues.sort((a, b) => a.tier - b.tier).map((l) => {
            const humans = l.teams.filter((t) => t.owner_id).length;
            const leader = l.teams.slice().sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0];
            return `<button class="league-card ${l.id === ME.league.id ? "mine" : ""}" data-league="${l.id}">
              <div class="lc-name">${esc(leagueName(l))}${l.id === ME.league.id ? ` <span class="badge">${T("senin ligin")}</span>` : ""}</div>
              <div class="muted small">👤 ${humans} oyuncu · 🤖 ${l.teams.length - humans} bot</div>
              ${leader && leader.points ? `<div class="small">${T("Lider")}: <span class="dot" style="background:${esc(leader.color)}"></span>${esc(leader.name)} (${leader.points})</div>` : `<div class="small muted">${T("Henüz yarış yok")}</div>`}
            </button>`;
          }).join("")}
        </div>
      </div>`).join("") : `<p class="muted">${T("Henüz lig yok.")}</p>`;
    filterLeagues();
    show("leagues");
  } catch (e) { toast(e.message, true); }
}

function filterLeagues() {
  const q = $("#leagueSearch").value.trim().toLocaleLowerCase(LOCALE());
  document.querySelectorAll("#leaguesBody .country-block").forEach((b) => b.classList.toggle("hidden", !!q && !b.dataset.search.includes(q)));
}
$("#leagueSearch").oninput = filterLeagues;

/* ---------- PİLOT PAZARI ---------- */
const MK = { tab: "free", free: null, bots: null, humans: null, used: 0, buying: null };

async function showMarket() {
  afterReplay = null;
  try {
    const [free, used] = await Promise.all([api.freeAgents(), api.transfersUsed(ME.team.id, ME.league.season_id)]);
    MK.free = free; MK.used = used; MK.bots = null; MK.humans = null;
    if (MK.tab === "bots") MK.bots = await api.botDrivers();
    if (MK.tab === "humans") MK.humans = await api.humanDrivers(ME.team.id);
    renderMarket();
    show("market");
  } catch (e) { toast(e.message, true); }
}

const priceOf = (d) => {
  const v = driverValue(d.skill, d.potential, d.age);
  return d.team_id ? Math.round(v * MARKET.botMarkup / 10000) * 10000 : v;
};
const refundOf = (d) => Math.round(driverValue(d.skill, d.potential, d.age) * MARKET.refundRate / 10000) * 10000;

function renderMarket() {
  $("#marketMoney").textContent = money(ME.team.money);
  $("#marketTransfers").textContent = `Bu sezon transfer: ${MK.used} / ${MARKET.maxTransfers}`;
  document.querySelectorAll("[data-mtab]").forEach((b) => b.classList.toggle("active", b.dataset.mtab === MK.tab));
  const list = MK[MK.tab];
  if (!list) { $("#marketTable").innerHTML = `<tr><td class="muted">${T("Yükleniyor…")}</td></tr>`; return; }

  const q = $("#mSearch").value.trim().toLocaleLowerCase(LOCALE());
  const maxAge = +$("#mAge").value, minPot = +$("#mPot").value, afford = $("#mAfford").checked;
  const bestRefund = Math.max(...ME.team.drivers.map(refundOf));
  let rows = list.filter((d) => d.age <= maxAge && (d.potential || 0) >= minPot
    && (!q || d.name.toLocaleLowerCase(LOCALE()).includes(q))
    && (!afford || MK.tab === "humans" || priceOf(d) <= ME.team.money + bestRefund));
  const sorters = {
    skill: (a, b) => b.skill - a.skill || b.potential - a.potential,
    potential: (a, b) => b.potential - a.potential || b.skill - a.skill,
    young: (a, b) => a.age - b.age || b.potential - a.potential,
    cheap: (a, b) => priceOf(a) - priceOf(b),
    pace: (a, b) => b.pace - a.pace,
  };
  rows.sort(sorters[$("#mSort").value]);
  $("#marketCount").textContent = T("{n} pilot", { n: rows.length }) + (rows.length > 80 ? " · " + T("ilk 80 gösteriliyor") : "");
  rows = rows.slice(0, 80);

  $("#marketTable").innerHTML = `<tr><th>${T("Pilot")}</th><th>${T("Yaş")}</th><th>${T("Genel")}</th><th>${T("Pot.")}</th><th>${T("H / S / L / İ")}</th><th class="num">${MK.tab === "bots" ? T("Fiyat") : T("Değer")}</th><th class="num">${T("Maaş")}</th><th></th></tr>` +
    rows.map((d) => {
      const owner = d.teams && d.teams.profiles ? ` · 👤 ${esc(d.teams.profiles.username)}` : "";
      const team = d.teams ? `<div class="small muted"><span class="dot" style="background:${esc(d.teams.color)}"></span>${esc(d.teams.name)}${owner} · ${esc(d.teams.leagues ? d.teams.leagues.countries.flag + " " + leagueName(d.teams.leagues) : "")}</div>` : "";
      const gem = d.age <= 21 && d.potential >= 85 ? ` <span class="gem" title="${T("Genç cevher")}">💎</span>` : "";
      return `<tr>
        <td>${flagOf(d.nationality)} <b>${esc(d.name)}</b>${gem}${team}</td>
        <td>${d.age}</td>
        <td><b>${d.skill}</b></td>
        <td class="pot-cell">${d.potential}</td>
        <td class="small">${d.pace} / ${d.racecraft} / ${d.tyres} / ${d.consistency}</td>
        <td class="num">${money(MK.tab === "humans" ? driverValue(d.skill, d.potential, d.age) : priceOf(d))}</td>
        <td class="num small">${money(driverSalary(d.skill, d.potential, d.age))}</td>
        <td>${MK.tab === "humans" ? `<button class="chip" data-offer-driver="${d.id}">${T("Teklif yap")}</button>` : `<button class="chip" data-buy-driver="${d.id}">${T("Al")}</button>`}</td>
      </tr>`;
    }).join("");
}

document.querySelectorAll("[data-mtab]").forEach((b) => (b.onclick = async () => {
  MK.tab = b.dataset.mtab;
  renderMarket();
  try {
    if (MK.tab === "bots" && !MK.bots) { MK.bots = await api.botDrivers(); renderMarket(); }
    if (MK.tab === "humans" && !MK.humans) { MK.humans = await api.humanDrivers(ME.team.id); renderMarket(); }
  } catch (e) { toast(e.message, true); }
}));
["#mSearch", "#mSort", "#mAge", "#mPot", "#mAfford"].forEach((id) => ($(id).oninput = renderMarket));

// Satın alma penceresi
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-buy-driver]");
  if (!b) return;
  const list = MK[MK.tab] || [];
  const d = list.find((x) => x.id === b.dataset.buyDriver);
  if (d) openBuy(d);
});

/* ---------- OYUNCULAR ARASI TEKLİFLER ---------- */
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-offer-driver]");
  if (!b) return;
  const d = (MK.humans || []).find((x) => x.id === b.dataset.offerDriver);
  if (d) openOffer(d);
});

function openOffer(d) {
  MK.buying = { d, out: null, offer: true, price: 0 };
  const mine = ME.team.drivers.slice().sort((a, b) => a.seat - b.seat);
  const value = driverValue(d.skill, d.potential, d.age);
  const renderBody = () => {
    const out = mine.find((x) => x.id === MK.buying.out);
    $("#buyBody").innerHTML = `
      <h2>${flagOf(d.nationality)} ${esc(d.name)} <span class="muted small">${T("{n} yaş", { n: d.age })}</span></h2>
      <p class="small muted"><span class="dot" style="background:${esc(d.teams.color)}"></span>${esc(d.teams.name)} · 👤 ${esc(d.teams.profiles ? d.teams.profiles.username : "")}</p>
      <div class="buy-stats">
        <div><span>${d.skill}</span><small>${T("GENEL")}</small></div><div><span class="pot-cell">${d.potential}</span><small>${T("POTANSİYEL")}</small></div>
        ${Object.entries(DRIVER_ATTRS).map(([a, info]) => `<div><span>${d[a]}</span><small>${T(info.name).toLocaleUpperCase(LOCALE())}</small></div>`).join("")}
      </div>
      <p class="small">${T("Piyasa değeri")}: <b>${money(value)}</b></p>
      <div class="dp-label">${T("Karşılığında hangi pilotunu vereceksin?")}</div>
      <div class="out-choices">${mine.map((x) => `
        <button class="out-choice ${MK.buying.out === x.id ? "active" : ""}" data-out="${x.id}">
          <b>${flagOf(x.nationality)} ${esc(x.name)}</b> <span class="muted small">${T("{n} yaş", { n: x.age })}</span>
          <div class="small">${T("Genel")} ${x.skill} · ${T("Potansiyel")} ${x.potential}</div>
          <div class="small muted">${T("Piyasa değeri")}: ${money(driverValue(x.skill, x.potential, x.age))}</div>
        </button>`).join("")}</div>
      <label class="dp-label" style="display:block">${T("Pilotuna ek olarak teklif ettiğin para")}
        <input id="offerPrice" type="number" min="0" step="100000" value="${MK.buying.price}" class="offer-input"></label>
      <p class="small muted">${T("Kasan")}: ${money(ME.team.money)}. ${T("Teklif 48 saat geçerlidir. Karşı taraf kabul ederse pilotlar yer değiştirir ve para hemen el değiştirir.")}</p>`;
    const invalid = !out || MK.buying.price < 0 || MK.buying.price > ME.team.money;
    $("#buyConfirm").disabled = invalid;
    $("#buyConfirm").textContent = T("Teklifi gönder");
    $("#buyMsg").className = "form-msg bad";
    $("#buyMsg").textContent = MK.buying.price > ME.team.money ? T("Teklif ettiğin para kasandakinden fazla.") : "";
    $("#buyBody").querySelectorAll("[data-out]").forEach((bb) => (bb.onclick = () => { MK.buying.out = bb.dataset.out; renderBody(); }));
    $("#offerPrice").onchange = (e) => { MK.buying.price = Math.max(0, Math.round(+e.target.value || 0)); renderBody(); };
  };
  renderBody();
  $("#buyModal").classList.remove("hidden");
}

// Merkezdeki teklifler kartı
async function renderOffers() {
  const card = $("#offersCard");
  let list = [];
  try { list = await api.myOffers(); } catch (e) { card.classList.add("hidden"); return; }
  const now = Date.now();
  const mineId = ME.team.id;
  const live = (o) => o.status === "pending" && new Date(o.expires_at).getTime() > now;
  const incoming = list.filter((o) => o.seller_team === mineId && live(o));
  const outgoing = list.filter((o) => o.buyer_team === mineId && live(o));
  const recent = list.filter((o) => !live(o) && o.status !== "cancelled").slice(0, 3);
  $("#navMarket").innerHTML = `🔄 ${T("Pazar")}${incoming.length ? ` <span class="badge">${incoming.length}</span>` : ""}`;
  if (!incoming.length && !outgoing.length && !recent.length) { card.classList.add("hidden"); return; }
  const who = (t) => `${esc(t.name)}${t.profiles ? ` (👤 ${esc(t.profiles.username)})` : ""}`;
  const drv = (d) => `${flagOf(d.nationality)} <b>${esc(d.name)}</b> <span class="muted small">${d.skill}/${d.potential} · ${T("{n} yaş", { n: d.age })}</span>`;
  const status = { accepted: T("✅ kabul edildi"), rejected: T("❌ reddedildi"), expired: T("⌛ geçersiz"), cancelled: T("iptal") };
  card.innerHTML = `<div class="label">📨 ${T("Transfer teklifleri")}</div>` +
    incoming.map((o) => `<div class="offer">
      <div>${T("{team} senin pilotun {target} için teklif yaptı:", { team: who(o.buyer), target: drv(o.target) })}</div>
      <div class="offer-terms">↔ ${drv(o.outd)}${o.price ? ` + <b>${money(o.price)}</b>` : ""}</div>
      <div class="btn-row" style="margin-top:6px"><button class="btn primary small-btn" data-accept="${o.id}">${T("Kabul et")}</button>
        <button class="btn ghost small-btn" data-reject="${o.id}">${T("Reddet")}</button></div></div>`).join("") +
    outgoing.map((o) => `<div class="offer mine">
      <div>${T("{team} takımının pilotu {target} için teklifin bekliyor:", { team: who(o.seller), target: drv(o.target) })}</div>
      <div class="offer-terms">↔ ${drv(o.outd)}${o.price ? ` + <b>${money(o.price)}</b>` : ""}</div>
      <div class="btn-row" style="margin-top:6px"><button class="btn ghost small-btn" data-cancel-offer="${o.id}">${T("Teklifi geri çek")}</button></div></div>`).join("") +
    recent.map((o) => `<div class="offer old small">${o.buyer_team === mineId ? T("Teklifin") : T("Gelen teklif")}: ${drv(o.target)} ↔ ${drv(o.outd)} — ${status[o.status] || o.status}</div>`).join("");
  card.classList.remove("hidden");
}

document.addEventListener("click", async (ev) => {
  const a = ev.target.closest("[data-accept],[data-reject],[data-cancel-offer]");
  if (!a) return;
  try {
    await busy(a, async () => {
      if (a.dataset.accept) { await api.respondOffer(a.dataset.accept, true); toast(T("Transfer tamamlandı! 🤝")); }
      else if (a.dataset.reject) { await api.respondOffer(a.dataset.reject, false); toast(T("Teklif reddedildi.")); }
      else { await api.cancelOffer(a.dataset.cancelOffer); toast(T("Teklif geri çekildi.")); }
      const fresh = await api.myTeam();
      ME.team = fresh; ME.league = fresh.leagues;
      await loadLeague();
    });
    showHub();
  } catch (e) { toast(e.message, true); renderOffers(); }
});


function openBuy(d) {
  MK.buying = { d, out: null };
  $("#buyConfirm").textContent = T("Transferi onayla");
  const mine = ME.team.drivers.slice().sort((a, b) => a.seat - b.seat);
  const price = priceOf(d);
  const renderBody = () => {
    const out = mine.find((x) => x.id === MK.buying.out);
    const back = out ? refundOf(out) : 0;
    const net = price - back;
    $("#buyBody").innerHTML = `
      <h2>${flagOf(d.nationality)} ${esc(d.name)} <span class="muted small">${T("{n} yaş", { n: d.age })}</span></h2>
      <div class="buy-stats">
        <div><span>${d.skill}</span><small>${T("GENEL")}</small></div><div><span class="pot-cell">${d.potential}</span><small>${T("POTANSİYEL")}</small></div>
        ${Object.entries(DRIVER_ATTRS).map(([a, info]) => `<div><span>${d[a]}</span><small>${T(info.name).toLocaleUpperCase(LOCALE())}</small></div>`).join("")}
      </div>
      <div class="dp-label">${T("Yerine hangi pilotunu bırakacaksın?")}</div>
      <div class="out-choices">${mine.map((x) => `
        <button class="out-choice ${MK.buying.out === x.id ? "active" : ""}" data-out="${x.id}">
          <b>${flagOf(x.nationality)} ${esc(x.name)}</b> <span class="muted small">${T("{n} yaş", { n: x.age })}</span>
          <div class="small">${T("Genel")} ${x.skill} · ${T("Potansiyel")} ${x.potential}</div>
          <div class="small muted">${T("Sana geri dönecek")}: ${money(refundOf(x))}</div>
        </button>`).join("")}</div>
      <table class="mini buy-sum">
        <tr><td>${d.team_id ? T("Transfer bedeli (değerin 1,3 katı)") : T("İmza bedeli (piyasa değeri)")}</td><td class="num">${money(price)}</td></tr>
        <tr><td>${T("Bıraktığın pilottan geri dönen")}</td><td class="num">${out ? "−" + money(back) : "—"}</td></tr>
        <tr class="me"><td><b>${T("Ödeyeceğin")}</b></td><td class="num"><b>${out ? money(net) : "—"}</b></td></tr>
        <tr><td>${T("Kasan transferden sonra")}</td><td class="num ${out && ME.team.money - net < 0 ? "bad-text" : ""}">${out ? money(ME.team.money - net) : "—"}</td></tr>
        <tr><td>${T("Yeni maaş (yarış başına)")}</td><td class="num">${money(driverSalary(d.skill, d.potential, d.age))}</td></tr>
      </table>
      ${d.team_id ? `<p class="small muted">${T("Bıraktığın pilot {team} takımına geçecek.", { team: esc(d.teams.name) })}</p>` : `<p class="small muted">${T("Bıraktığın pilot serbest pilotlar havuzuna gidecek.")}</p>`}`;
    $("#buyConfirm").disabled = !out || ME.team.money - net < 0 || MK.used >= MARKET.maxTransfers;
    $("#buyMsg").className = "form-msg bad";
    $("#buyMsg").textContent = MK.used >= MARKET.maxTransfers ? T("Bu sezon transfer hakkını doldurdun.") : out && ME.team.money - net < 0 ? T("Bu transfer için yeterli paran yok.") : "";
    $("#buyBody").querySelectorAll("[data-out]").forEach((bb) => (bb.onclick = () => { MK.buying.out = bb.dataset.out; renderBody(); }));
  };
  renderBody();
  $("#buyModal").classList.remove("hidden");
}

$("#buyCancel").onclick = () => $("#buyModal").classList.add("hidden");
$("#buyModal").onclick = (ev) => { if (ev.target.id === "buyModal") $("#buyModal").classList.add("hidden"); };
$("#buyConfirm").onclick = async () => {
  const { d, out, offer, price } = MK.buying || {};
  if (!d || !out) return;
  if (offer) {
    try {
      await busy($("#buyConfirm"), () => api.makeOffer(d.id, out, price));
      $("#buyModal").classList.add("hidden");
      toast(T("Teklifin gönderildi. Karşı taraf cevap verince merkezde göreceksin. 📨"));
    } catch (e) { $("#buyMsg").className = "form-msg bad"; $("#buyMsg").textContent = e.message; }
    return;
  }
  try {
    await busy($("#buyConfirm"), async () => {
      await api.signDriver(d.id, out);
      const fresh = await api.myTeam();
      ME.team = fresh; ME.league = fresh.leagues;
      await loadLeague();
    });
    $("#buyModal").classList.add("hidden");
    toast(T("{name} artık senin pilotun! 🤝", { name: d.name }));
    await showMarket();
  } catch (e) {
    $("#buyMsg").className = "form-msg bad";
    $("#buyMsg").textContent = e.message;
  }
};

/* ---------- DÜNYA TURNUVASI ---------- */
const STAGES = [
  { key: "final",  title: () => T("🏆 Büyük Final"), desc: () => T("12 takım, 2 yarış. En çok puanı toplayan dünya şampiyonu olur."), qualify: 0 },
  { key: "group",  title: () => T("Grup aşaması"), desc: () => T("Ülke şampiyonları ve eleme galipleri. 2 yarış, her grubun ilk 3'ü finale çıkar."), qualify: 3 },
  { key: "playin", title: () => T("Eleme turu"), desc: () => T("Ülke ikincileri. 1 yarış, her grubun birincisi grup aşamasına çıkar."), qualify: 1 },
];

async function showWorld() {
  afterReplay = null;
  try {
    const S = ME.league.seasons;
    const groups = await api.worldOverview(ME.league.season_id);
    const startDay = (n) => { const d = new Date(S.start_date + "T18:00:00Z"); d.setUTCDate(d.getUTCDate() + n - 1); return d; };
    const fmtDay = (d) => d.toLocaleString(LOCALE(), { day: "numeric", month: "long", weekday: "long", hour: "2-digit", minute: "2-digit" });
    let html = "";

    // Geçen sezonun kazananları
    if (S.number > 1) {
      const prev = await api.lastWorldWinners(S.number - 1).catch(() => []);
      if (prev.length) {
        const order = { world_champion: 1, world_second: 2, world_third: 3 };
        html += `<div class="card"><h3>${T("Sezon {n} kazananları", { n: S.number - 1 })}</h3><div class="podium">${prev.sort((a, b) => order[a.kind] - order[b.kind]).map((x) =>
          `<div class="pod pod-${order[x.kind]}" ${x.team_id ? `data-team="${x.team_id}"` : ""}><div class="pod-medal">${["🏆", "🥈", "🥉"][order[x.kind] - 1]}</div><b>${esc(x.team_name)}</b></div>`).join("")}</div></div>`;
      }
    }

    if (!groups.length) {
      html += `<div class="card">
        <h2>🌍 ${T("Dünya turnuvası")}</h2>
        <p>${T("Lig sezonu bitince 40 ülkenin en iyileri dünya şampiyonluğu için yarışır. Bot takımlar da katılır.")}</p>
        <div class="world-steps">
          <div><b>1. ${T("Eleme turu")}</b><span>${fmtDay(startDay(26))}</span><p class="muted small">${T("Ülke ikincileri 4 grupta yarışır. Her grubun birincisi devam eder.")}</p></div>
          <div><b>2. ${T("Grup aşaması")}</b><span>${fmtDay(startDay(27))} ${T("ve ertesi gün")}</span><p class="muted small">${T("Ülke şampiyonları + 4 eleme galibi, 11'erli 4 grup, 2 yarış. Her grubun ilk 3'ü finale çıkar.")}</p></div>
          <div><b>3. ${T("Büyük final")}</b><span>${fmtDay(startDay(29))} ${T("ve ertesi gün")}</span><p class="muted small">${T("12 takım, 2 yarış. Dünya şampiyonu belirlenir.")}</p></div>
        </div>
        <p class="muted small">${T("Ödüller: şampiyon {a}, ikinci {b}, üçüncü {c}, diğer finalistler {d}, grup aşaması katılımcıları {e}. Ayrıca kalıcı kupa rozetleri.", { a: money(5e6), b: money(3e6), c: money(2e6), d: money(1e6), e: money(5e5) })}</p>
        <p class="muted small">${T("Takımını oraya taşımak için ligini ilk iki sırada bitir!")}</p>
      </div>`;
    }

    STAGES.forEach((st) => {
      const gs = groups.filter((g) => g.stage === st.key).sort((a, b) => a.sort - b.sort);
      if (!gs.length) return;
      html += `<div class="stage"><h2>${st.title()}</h2><p class="muted small">${st.desc()}</p><div class="world-groups ${st.key === "final" ? "single" : ""}">`;
      gs.forEach((g) => {
        const rows = (g.world_group_teams || []).slice().sort((a, b) => b.points - a.points || (a.best_pos || 99) - (b.best_pos || 99) || a.teams.name.localeCompare(b.teams.name));
        const races = (g.races || []).slice().sort((a, b) => a.round - b.round);
        const done = races.length && races.every((r) => r.status === "finished");
        html += `<div class="card world-group">
          <h3>${esc(trStored(g.name))}${done ? ` <span class="muted small">· ${T("tamamlandı")}</span>` : ""}</h3>
          <table class="mini clickable">${rows.map((x, i) => {
            const t = x.teams;
            const q = st.qualify ? i < st.qualify : i === 0;
            const flag = t.leagues && t.leagues.countries ? t.leagues.countries.flag : "";
            return `<tr class="${t.id === ME.team.id ? "me" : ""}" data-team="${t.id}">
              <td>${i + 1}</td>
              <td>${q && done ? (st.key === "final" ? "🏆 " : "✅ ") : ""}${esc(flag)} <span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}
                <div class="small muted">${esc(trStored(x.seed_info || ""))} · ${t.owner_id ? "👤 " + esc(t.profiles ? t.profiles.username : T("oyuncu")) : "🤖 " + T("bot")}</div></td>
              <td class="num">${x.points}</td></tr>`;
          }).join("")}</table>
          <div class="world-races">${races.map((r) => {
            const tr = TRACK[r.track_id];
            return `<div class="wr-row"><span>${tr.flag} ${trackName(tr)}</span><span class="muted small">${fmtDate(r.scheduled_at)}</span>
              ${r.status === "finished" ? `<button class="chip" data-watch="${r.id}">${T("▶ İzle")}</button>` : `<span class="small muted">${r.status === "running" ? T("Koşuluyor") : T("Planlandı")}</span>`}</div>`;
          }).join("")}</div>
        </div>`;
      });
      html += `</div></div>`;
    });

    $("#worldBody").innerHTML = html;
    afterReplay = async () => { afterReplay = null; await showWorld(); };
    show("world");
  } catch (e) { toast(e.message, true); }
}

/* ---------- LİG SAYFASI ---------- */
let currentLeagueId = null, leagueBack = null;
async function showLeague(leagueId) {
  if (leagueId === ME.league.id && currentScreen() !== "leagues") { await loadLeague(); showHub(); return; }
  const cur = currentScreen();
  const backTo = ["race", "results", "leaguePage"].includes(cur) ? leagueBack : cur;
  try {
    const L = await api.league(leagueId);
    const [teams, races] = await Promise.all([api.leagueTeams(leagueId), api.leagueRaces(leagueId, L.season_id)]);
    const now = Date.now();
    const next = races.find((r) => r.status === "scheduled" && new Date(r.scheduled_at).getTime() > now);
    $("#leagueTitle").innerHTML = `${esc(L.countries.flag)} ${esc(leagueName(L))} <span class="muted small">${T("Sezon {n}", { n: L.seasons.number })}</span>`;
    $("#leagueStandings").innerHTML = standingsHtml(teams);
    $("#leagueCalendar").innerHTML = calendarHtml(races, next && next.id);
    currentLeagueId = leagueId;
    leagueBack = backTo === "teamPage" || !backTo ? "leagues" : backTo;
    afterReplay = async () => { afterReplay = null; await showLeague(leagueId); };
    show("leaguePage");
  } catch (e) { toast(e.message, true); }
}

/* ---------- GARAJ ---------- */
function showGarage() {
  const t = ME.team;
  $("#garageMoney").textContent = money(t.money);
  $("#parts").innerHTML = PART_KEYS.map((p) => {
    const lvl = (t.levels && t.levels[p]) || 0, cost = upgradeCost(lvl), val = t[p];
    const maxed = val >= ECONOMY.statMax;
    const can = !maxed && t.money >= cost;
    return `<div class="part">
      <div>
        <div class="name">${T(PARTS[p].name)} <span class="muted small">· ${T("Seviye {n}", { n: lvl })}</span></div>
        <div class="desc">${T(PARTS[p].desc)}</div>
        <div class="statbar"><div class="fill" style="width:${val}%"></div><div class="avg" style="left:${leagueAvg(p)}%"></div></div>
        <div class="small muted" style="margin-top:4px">${T("Değer")}: <b style="color:var(--text)">${val}</b> · ${T("Lig ortalaması")}: ${leagueAvg(p).toFixed(1)}</div>
      </div>
      <button class="btn ${can ? "primary" : ""}" data-buy="${p}" ${can ? "" : "disabled"}>
        ${maxed ? T("Maksimum") : `+${upgradeGain(val)} · ${money(cost)}`}
      </button>
    </div>`;
  }).join("");
  $("#parts").querySelectorAll("[data-buy]").forEach((b) => (b.onclick = async () => {
    try {
      await busy(b, async () => {
        const updated = await api.buyUpgrade(b.dataset.buy);
        Object.assign(ME.team, updated);
        const i = ME.teams.findIndex((x) => x.id === ME.team.id);
        if (i >= 0) Object.assign(ME.teams[i], updated);
        toast(T("{part} geliştirildi! 🔧", { part: T(PARTS[b.dataset.buy].name) }));
      });
      showGarage();
    } catch (e) { toast(e.message, true); }
  }));
  show("garage");
}

/* ---------- PİLOTLAR ---------- */
function showPilots() {
  const drivers = ME.team.drivers.slice().sort((a, b) => a.seat - b.seat);
  $("#pilotCards").innerHTML = drivers.map((d) => `
    <div class="card driver-panel pilot-card" style="border-left-color:${esc(ME.team.color)}">
      <div class="pilot-head">
        <div>
          <h2>${flagOf(d.nationality)} ${esc(d.name)}</h2>
          <div class="muted small">${d.age ? `${T("{n} yaşında", { n: d.age })} · ${agePhase(d.age)} · ` : ""}${T("{s}. pilot · {r} yarış · {p} şampiyona puanı", { s: d.seat, r: d.races || 0, p: d.points || 0 })}</div>
          <div class="small">${T("Piyasa değeri")}: <b>${money(driverValue(d.skill, d.potential, d.age))}</b> · ${T("Maaş")}: <b>${money(d.salary || 0)}</b> / ${T("yarış")}</div>
        </div>
        <div class="overall-wrap">
          <div class="overall"><span>${driverOverall(d)}</span><small>${T("GENEL")}</small></div>
          ${d.potential ? `<div class="overall pot"><span>${d.potential}</span><small>${T("POTANSİYEL")}</small></div>` : ""}
        </div>
      </div>
      <div class="devpts">${T("Gelişim puanı")}: <b>${d.dev_points || 0}</b></div>
      ${Object.entries(DRIVER_ATTRS).map(([a, info]) => {
        const pot = d.potential || 99, cap = Math.min(99, pot + 6);
        const sum = d.pace + d.racecraft + d.tyres + d.consistency;
        const v = d[a], cost = trainCost(v), atCap = v >= cap || sum >= pot * 4, can = !atCap && (d.dev_points || 0) >= cost;
        return `<div class="attr-row">
          <div>
            <div class="name">${T(info.name)} <b class="num">${v}</b></div>
            <div class="desc">${T(info.desc)}</div>
            <div class="statbar"><div class="fill" style="width:${v}%"></div><div class="cap" style="left:${cap}%" title="${T("Potansiyel")}"></div></div>
          </div>
          <button class="btn ${can ? "primary" : ""}" data-train="${d.id}:${a}" ${can ? "" : "disabled"}>${atCap ? T("Potansiyelde") : `+1 · ${T("{n} puan", { n: cost })}`}</button>
        </div>`;
      }).join("")}
    </div>`).join("");
  $("#pilotCards").querySelectorAll("[data-train]").forEach((b) => (b.onclick = async () => {
    const [id, attr] = b.dataset.train.split(":");
    try {
      await busy(b, async () => {
        const updated = await api.trainDriver(id, attr);
        const d = ME.team.drivers.find((x) => x.id === id);
        Object.assign(d, updated);
        const lt = ME.teams.find((x) => x.id === ME.team.id);
        if (lt) { const ld = lt.drivers.find((x) => x.id === id); if (ld) Object.assign(ld, updated); }
        toast(`${d.name}: ${T(DRIVER_ATTRS[attr].name)} +1 💪`);
      });
      showPilots();
    } catch (e) { toast(e.message, true); }
  }));
  show("pilots");
}

/* ---------- STRATEJİ ---------- */
async function showStrategy() {
  const r = nextRace();
  if (!r) return;
  const tr = TRACK[r.track_id];
  const car = carOf(ME.team);
  const drivers = ME.team.drivers.slice().sort((a, b) => a.seat - b.seat);
  const suggs = drivers.map((d) => E.suggestStrategies(tr, car, 4, d));

  let saved = [];
  try { saved = await api.myStrategies(r.id); } catch (e) { toast(e.message, true); }
  const plans = drivers.map((d, k) => {
    const s = saved.find((x) => x.driver_id === d.id);
    return s ? PW_Strategy.normalize(s.plan, tr) : clone(suggs[k][Math.min(k, suggs[k].length - 1)].plan);
  });

  strat = { race: r, track: tr, drivers, dirty: false };
  strat.ctx = { track: tr, car, drivers, color: ME.team.color, plans, suggs, onChange: () => { strat.dirty = true; updateStratStatus(saved.length > 0); } };

  $("#stratTitle").textContent = `${tr.flag} ${trackName(tr)} · ${r.title ? "🌍 " + trStored(r.title) : T("Yarış") + " " + r.round}`;
  $("#stratInfo").textContent = `${fmtDate(r.scheduled_at)} · ${T("{n} tur", { n: tr.laps })} · ${T("Lastik aşınması")}: ${degLabel(tr.degMult)} · ${T("Sollama")}: ${otLabel(tr.overtake)} · ${T("Pit kaybı ~{n} sn", { n: tr.pitLoss })}`;
  updateStratStatus(saved.length > 0);
  PW_Strategy.render($("#plans"), strat.ctx);
  show("strategy");
}

function updateStratStatus(hasSaved) {
  $("#stratStatus").innerHTML = strat.dirty
    ? `<span class="warn-text">${T("● Kaydedilmemiş değişiklikler var")}</span>`
    : hasSaved ? `<span class="ok-text">${T("✓ Strateji kayıtlı")}</span>` : `<span class="muted">${T("Mühendislerin önerisi yüklendi, henüz kaydedilmedi")}</span>`;
}

$("#saveStratBtn").onclick = async () => {
  if (!strat) return;
  if (new Date(strat.race.scheduled_at).getTime() <= Date.now()) { toast(T("Yarış başladı, strateji artık değiştirilemez."), true); return; }
  try {
    await busy($("#saveStratBtn"), () => api.saveStrategies(strat.race.id,
      strat.drivers.map((d, k) => ({ driverId: d.id, plan: strat.ctx.plans[k] }))));
    strat.dirty = false;
    updateStratStatus(true);
    toast(T("Strateji kaydedildi ✓"));
  } catch (e) { toast(e.message, true); }
};

$("#stratBack").onclick = () => {
  if (strat && strat.dirty && !confirmLeave()) return;
  showHub();
};
// Kaydedilmemiş değişiklik varsa ilk tıklamada uyar
let leaveArmed = false;
function confirmLeave() {
  if (leaveArmed) { leaveArmed = false; return true; }
  leaveArmed = true;
  toast(T("Kaydedilmemiş değişiklikler var. Çıkmak için tekrar tıkla."), true);
  setTimeout(() => (leaveArmed = false), 3500);
  return false;
}

/* ---------- BUTONLAR ---------- */
$("#goStrategyBtn").onclick = showStrategy;
$("#goGarageBtn").onclick = showGarage;
$("#goPilotsBtn").onclick = showPilots;
$("#navHub").onclick = async () => { afterReplay = null; await loadLeague(); showHub(); };
$("#navLeagues").onclick = showLeagues;
$("#navWorld").onclick = showWorld;
$("#navMarket").onclick = showMarket;
$("#teamBack").onclick = () => goBackFrom("teamPage");
$("#leagueBack").onclick = () => goBackFrom("leaguePage");
$("#pilotsBack").onclick = showHub;
$("#garageBack").onclick = showHub;

boot();
