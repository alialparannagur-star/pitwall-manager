"use strict";
/* =========================================================
   PitWall Manager — v0.2 arayüz
   Bu sürüm tek oyunculu bir "deneme ligi". Kurallar online
   sürümle aynı: yarış öncesi strateji → yarış → para → garaj.
   Online sürümde yarışı sunucu koşturacak, bu ekranlar aynen kalacak.
   ========================================================= */
const { COMPOUNDS, MODES, PARTS, ECONOMY, TRACK_TYPES, TRACKS, DEMO_TEAMS, upgradeCost, upgradeGain, prizeFor } = PW_DATA;
const E = PW_ENGINE;
const SAVE_KEY = "pitwall_lab_v2";

let S = null;        // kayıtlı oyun durumu
let current = null;  // aktif yarış hafta sonu
const replay = { i: 0, timer: null, speed: 400, rt: 0, last: 0 };

/* ---------- Yardımcılar ---------- */
const $ = (sel) => document.querySelector(sel);
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  $("#" + id).classList.remove("hidden");
  window.scrollTo(0, 0);
}
const money = (n) => "$" + Math.round(n).toLocaleString("tr-TR");
function fmtLap(t) {
  if (t == null || !isFinite(t)) return "—";
  const m = Math.floor(t / 60);
  return m + ":" + (t - m * 60).toFixed(3).padStart(6, "0");
}
function fmtRaceTime(t) {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60).toFixed(3).padStart(6, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}
const wearColor = (w) => (w < 50 ? "#2fbf71" : w < 70 ? "#ffd43b" : "#ff5c5c");
const degLabel = (m) => (m >= 1.15 ? "Yüksek" : m <= 0.9 ? "Düşük" : "Orta");
const otLabel = (o) => (o >= 1.1 ? "Kolay" : o <= 0.6 ? "Çok zor" : "Normal");
const team = (id) => DEMO_TEAMS.find((t) => t.id === id);
const allDrivers = () => DEMO_TEAMS.flatMap((t) => t.drivers.map((d) => ({ ...d, team: t })));
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- Kayıt ---------- */
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

function newCareer(myTeam) {
  S = { myTeam, round: 0, seasonSeed: Math.floor(Math.random() * 1e9), teams: {}, driverPts: {}, teamPts: {}, history: [] };
  DEMO_TEAMS.forEach((t) => {
    S.teams[t.id] = { car: { ...t.car }, levels: { engine: 0, aero: 0, chassis: 0, reliability: 0, pitcrew: 0 }, money: ECONOMY.startMoney };
    S.teamPts[t.id] = 0;
    t.drivers.forEach((d) => (S.driverPts[d.id] = 0));
  });
  save();
  showHub();
}

function teamRanking() {
  return DEMO_TEAMS.map((t) => t.id).sort((a, b) => S.teamPts[b] - S.teamPts[a]);
}

/* ---------- MENÜ ---------- */
function renderMenu() {
  $("#topInfo").textContent = "";
  $("#continueBtn").classList.toggle("hidden", !load());
  const grid = $("#teamGrid");
  grid.innerHTML = "";
  DEMO_TEAMS.forEach((t) => {
    const avg = Math.round((t.car.engine + t.car.aero + t.car.chassis) / 3);
    const el = document.createElement("button");
    el.className = "team-card";
    el.innerHTML = `
      <div class="team-stripe" style="background:${t.color}"></div>
      <h3>${t.name}</h3>
      <div class="stat">Araç performansı: <b>${avg}</b></div>
      <div class="ratingbar"><div style="width:${(avg - 60) * 2.5}%;background:${t.color}"></div></div>
      <div class="drivers">${t.drivers.map((d) => `${d.name} (${d.skill})`).join("<br>")}</div>`;
    el.onclick = () => newCareer(t.id);
    grid.appendChild(el);
  });
  show("menu");
}

/* ---------- MERKEZ ---------- */
function showHub() {
  if (S.round >= TRACKS.length) { showSeasonEnd(); return; }
  const tr = TRACKS[S.round];
  const t = team(S.myTeam);
  $("#topInfo").textContent = `${t.name} · Yarış ${S.round + 1}/${TRACKS.length}`;
  const w = TRACK_TYPES[tr.type].w;
  const key = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
  $("#hubRace").innerHTML = `
    <h2>${tr.flag} ${tr.name}</h2>
    <p class="muted">Yarış ${S.round + 1} / ${TRACKS.length} · ${tr.laps} tur · Pit kaybı ~${tr.pitLoss} sn</p>
    <p>Pist tipi: <b>${TRACK_TYPES[tr.type].name}</b> (en önemli parça: ${PARTS[key].name}) · Lastik aşınması: <b>${degLabel(tr.degMult)}</b> · Sollama: <b>${otLabel(tr.overtake)}</b></p>`;
  $("#hubTeam").textContent = t.name;
  $("#hubTeam").style.color = t.color;
  $("#hubMoney").textContent = money(S.teams[S.myTeam].money);
  $("#hubCar").innerHTML = carStatsHtml();
  renderStandings($("#hubStandings"));
  show("hub");
}

function leagueAvg(part) {
  const v = Object.values(S.teams).map((x) => x.car[part]);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function carStatsHtml() {
  const car = S.teams[S.myTeam].car;
  return `<div class="carstats">${Object.keys(PARTS).map((p) => `
    <span>${PARTS[p].name}</span>
    <div class="statbar"><div class="fill" style="width:${(car[p] - 60) * 2.5}%"></div><div class="avg" style="left:${(leagueAvg(p) - 60) * 2.5}%" title="Lig ortalaması"></div></div>
    <b class="num">${car[p]}</b>`).join("")}</div>
    <p class="muted small">Beyaz çizgi: lig ortalaması</p>`;
}

function renderStandings(el) {
  const drivers = allDrivers().map((d) => ({ ...d, pts: S.driverPts[d.id] || 0 })).sort((a, b) => b.pts - a.pts);
  const teams = DEMO_TEAMS.map((t) => ({ ...t, pts: S.teamPts[t.id] || 0 })).sort((a, b) => b.pts - a.pts);
  el.innerHTML = `
    <div class="tabs-2">
      <div><h3>Pilotlar</h3><table class="mini">
        ${drivers.map((d, i) => `<tr class="${d.team.id === S.myTeam ? "me" : ""}"><td>${i + 1}</td><td><span class="dot" style="background:${d.team.color}"></span>${d.name}</td><td class="num">${d.pts}</td></tr>`).join("")}
      </table></div>
      <div><h3>Takımlar</h3><table class="mini">
        ${teams.map((t, i) => `<tr class="${t.id === S.myTeam ? "me" : ""}"><td>${i + 1}</td><td><span class="dot" style="background:${t.color}"></span>${t.name}</td><td class="num">${t.pts}</td></tr>`).join("")}
      </table></div>
    </div>`;
}

/* ---------- GARAJ ---------- */
function showGarage() {
  const my = S.teams[S.myTeam];
  $("#garageMoney").textContent = money(my.money);
  $("#parts").innerHTML = Object.entries(PARTS).map(([p, info]) => {
    const lvl = my.levels[p], cost = upgradeCost(lvl), val = my.car[p];
    const maxed = val >= ECONOMY.statMax;
    return `<div class="part">
      <div>
        <div class="name">${info.name} <span class="muted small">· Seviye ${lvl}</span></div>
        <div class="desc">${info.desc}</div>
        <div class="statbar"><div class="fill" style="width:${(val - 60) * 2.5}%"></div><div class="avg" style="left:${(leagueAvg(p) - 60) * 2.5}%"></div></div>
        <div class="small muted" style="margin-top:4px">Değer: <b style="color:var(--text)">${val}</b> · Lig ortalaması: ${leagueAvg(p).toFixed(1)}</div>
      </div>
      <button class="btn ${!maxed && my.money >= cost ? "primary" : ""}" data-buy="${p}" ${maxed || my.money < cost ? "disabled" : ""}>
        ${maxed ? "Maksimum" : `+${upgradeGain(val)} · ${money(cost)}`}
      </button>
    </div>`;
  }).join("");
  $("#parts").querySelectorAll("[data-buy]").forEach((b) => (b.onclick = () => { buyUpgrade(S.myTeam, b.dataset.buy); save(); showGarage(); }));
  show("garage");
}

function buyUpgrade(teamId, part) {
  const t = S.teams[teamId];
  const cost = upgradeCost(t.levels[part]);
  if (t.money < cost || t.car[part] >= ECONOMY.statMax) return false;
  t.money -= cost;
  t.levels[part]++;
  t.car[part] = Math.min(ECONOMY.statMax, t.car[part] + upgradeGain(t.car[part]));
  return true;
}

// Botlar parasını en zayıf parçasına harcar
function botsSpend() {
  DEMO_TEAMS.forEach((tm) => {
    if (tm.id === S.myTeam) return;
    const t = S.teams[tm.id];
    for (let k = 0; k < 3; k++) {
      const group = Math.random() < 0.75 ? ["engine", "aero", "chassis"] : ["reliability", "pitcrew"];
      const part = group.sort((a, b) => t.car[a] - t.car[b])[0];
      if (!buyUpgrade(tm.id, part)) break;
    }
  });
}

/* ---------- STRATEJİ ---------- */
function showStrategy() {
  const tr = TRACKS[S.round];
  const car = S.teams[S.myTeam].car;
  const sugg = E.suggestStrategies(tr, car, 4);
  current = { track: tr, sugg, plans: [clone(sugg[0].plan), clone(sugg[Math.min(1, sugg.length - 1)].plan)] };
  $("#stratTitle").textContent = `${tr.flag} ${tr.name}`;
  $("#stratInfo").textContent = `${tr.laps} tur · Lastik aşınması: ${degLabel(tr.degMult)} · Sollama: ${otLabel(tr.overtake)} · Pit kaybı ~${tr.pitLoss} sn`;
  renderPlans();
  show("strategy");
}

function tyreChips(key, sel) {
  return PW_DATA.DRY.map((k) =>
    `<button class="chip ${sel === k ? "active" : ""}" data-tyre="${key}:${k}"><span class="tyre ${k}">${k}</span>${COMPOUNDS[k].name}</button>`).join("");
}

function renderPlans() {
  const tr = current.track;
  const car = S.teams[S.myTeam].car;
  const best = current.sugg[0].est.time;
  const t = team(S.myTeam);
  const box = $("#plans");
  box.innerHTML = "";

  t.drivers.forEach((d, k) => {
    const plan = current.plans[k];
    const est = E.estimatePlan(tr, car, plan);
    const msgs = [];
    if (!est.twoCompounds) msgs.push(`<div class="warn">⚠️ En az 2 farklı lastik kullanmalısın, yoksa +20 sn ceza alırsın.</div>`);
    if (est.maxWear > plan.wearLimit) msgs.push(`<div class="warn">⚠️ Bir bölümde lastik %${Math.round(est.maxWear)} aşınacak. Güvenlik sınırın (%${plan.wearLimit}) devreye girip seni erken pite sokabilir.</div>`);
    const diff = est.time - best;
    msgs.push(diff < 1 ? `<div class="ok">✓ Çok iyi bir plan (en iyi tahmine yakın)</div>` : `<div class="warn">Tahmini kayıp: en iyi plana göre +${diff.toFixed(1)} sn</div>`);

    const card = document.createElement("div");
    card.className = "card plan driver-panel";
    card.style.borderLeftColor = t.color;
    card.innerHTML = `
      <h2>${d.name} <span class="muted small">Yetenek ${d.skill}</span></h2>
      <div class="dp-label">Başlangıç lastiği</div>
      <div class="row">${tyreChips("start", plan.start)}</div>

      <div class="dp-label">Pit stoplar</div>
      ${plan.stops.map((s, j) => `
        <div class="stop-row">
          <b>${j + 1}. pit:</b> Tur <input type="number" data-stoplap="${j}" min="1" max="${tr.laps - 1}" value="${s.lap}"> sonunda →
          ${tyreChips("stop" + j, s.tyre)}
          <button class="x-btn" data-del="${j}" title="Sil">✕</button>
        </div>`).join("")}
      ${plan.stops.length < 3 ? `<button class="chip" data-add="1">+ Pit stop ekle</button>` : ""}

      <div class="dp-label">Plan önizleme</div>
      <div class="stints">${est.stints.map((s) => `<div class="stint ${s.tyre}" style="flex:${Math.max(1, s.laps)}">${s.tyre} · ${s.laps}</div>`).join("")}</div>
      <div class="stint-notes">${est.stints.map((s) => `${COMPOUNDS[s.tyre].name}: ${s.laps} tur → aşınma ~%${Math.round(s.endWear)}`).join(" · ")}</div>
      ${msgs.join("")}

      <div class="dp-label">Sürüş modu</div>
      <div class="row">${Object.entries(MODES).map(([m, info]) => `<button class="chip ${plan.mode === m ? "active" : ""}" data-mode="${m}">${info.name}</button>`).join("")}</div>
      <label class="small" style="display:block;margin-top:8px"><input type="checkbox" data-pushend ${plan.pushEnd ? "checked" : ""}> Son 8 turda atak yap (lastik izin verirse)</label>

      <div class="dp-label">Lastik güvenlik sınırı: aşınma bu değere ulaşırsa erken pite gir</div>
      <div class="row">${[75, 85, 95].map((v) => `<button class="chip ${plan.wearLimit === v ? "active" : ""}" data-limit="${v}">%${v}</button>`).join("")}</div>

      <div class="dp-label">Mühendislerin önerileri</div>
      <div class="sugg">${current.sugg.map((o, i) => `
        <button class="chip" data-sugg="${i}">
          <span><b>${o.label}</b> · pit: tur ${o.plan.stops.map((s) => s.lap).join(", ")}</span>
          <span class="muted">${i === 0 ? "en hızlı tahmin" : "+" + (o.est.time - best).toFixed(1) + " sn"}</span>
        </button>`).join("")}</div>`;

    card.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.tyre) {
        const [key, val] = b.dataset.tyre.split(":");
        if (key === "start") plan.start = val; else plan.stops[+key.slice(4)].tyre = val;
      } else if (b.dataset.del) {
        plan.stops.splice(+b.dataset.del, 1);
      } else if (b.dataset.add) {
        const last = plan.stops.length ? plan.stops[plan.stops.length - 1].lap : 0;
        const lap = Math.min(tr.laps - 1, Math.round((last + tr.laps) / 2));
        plan.stops.push({ lap, tyre: plan.start === "H" ? "M" : "H" });
      } else if (b.dataset.mode) {
        plan.mode = b.dataset.mode;
      } else if (b.dataset.limit) {
        plan.wearLimit = +b.dataset.limit;
      } else if (b.dataset.sugg) {
        current.plans[k] = clone(current.sugg[+b.dataset.sugg].plan);
      } else return;
      renderPlans();
    });
    card.addEventListener("change", (ev) => {
      const el = ev.target;
      if (el.dataset.stoplap) {
        plan.stops[+el.dataset.stoplap].lap = Math.max(1, Math.min(tr.laps - 1, Math.round(+el.value || 1)));
        plan.stops.sort((a, b) => a.lap - b.lap);
      } else if (el.hasAttribute("data-pushend")) {
        plan.pushEnd = el.checked;
      }
      renderPlans();
    });
    box.appendChild(card);
  });
}

/* ---------- YARIŞ ---------- */
function runRace() {
  const tr = current.track;
  const botRng = E.rngFrom(E.hashSeed(`${S.seasonSeed}:${S.round}:bots`));
  const entries = DEMO_TEAMS.flatMap((t) => t.drivers.map((d, k) => ({
    id: d.id, name: d.name, skill: d.skill, teamId: t.id, teamName: t.name, color: t.color,
    car: { ...S.teams[t.id].car },
    strategy: t.id === S.myTeam ? clone(current.plans[k]) : E.autoStrategy(tr, S.teams[t.id].car, botRng),
  })));
  const seed = E.hashSeed(`${S.seasonSeed}:${S.round}:race`);
  const result = E.simulateRace({ track: tr, entries, seed });
  current.entries = entries;
  current.result = result;
  current.byId = Object.fromEntries(entries.map((e) => [e.id, e]));

  // Puanlar ve ödüller (online sürümde bunu sunucu yapacak)
  const rankBefore = teamRanking();
  const teamPoints = {};
  result.results.forEach((r) => {
    S.driverPts[r.id] += r.points;
    teamPoints[r.teamId] = (teamPoints[r.teamId] || 0) + r.points;
  });
  current.prizes = {};
  DEMO_TEAMS.forEach((t) => {
    const pts = teamPoints[t.id] || 0;
    const prize = prizeFor(pts, rankBefore.indexOf(t.id) + 1);
    S.teamPts[t.id] += pts;
    S.teams[t.id].money += prize;
    current.prizes[t.id] = { pts, prize, rank: rankBefore.indexOf(t.id) + 1 };
  });
  botsSpend();
  S.history.push({ track: tr.id, winner: result.results[0].id });
  S.round++;
  save();

  // Tekrar izleme hazırlığı: her tur için pit sayısı
  const pitCount = {};
  current.pitsAt = result.laps.map((snap) => {
    snap.cars.forEach((c) => { if (c.p) pitCount[c.id] = (pitCount[c.id] || 0) + 1; });
    return { ...pitCount };
  });
  current.grid = Object.fromEntries(result.results.map((r) => [r.id, r.grid]));
  // Pist haritası (ui/trackmap.js)
  current.map = window.PW_RACEMAP && $("#trackMap") ? PW_RACEMAP.create($("#trackMap"), {
    trackId: tr.id,
    laps: result.laps.map((snap) => entries.map((e) => snap.cars.find((c) => c.id === e.id))),
    cars: entries.map((e) => ({ color: e.color, name: e.name, team: e.teamName })),
    mine: new Set(entries.map((e, i) => (e.teamId === S.myTeam ? i : -1)).filter((i) => i >= 0)),
    sc: result.laps.map((snap) => snap.sc || 0), wx: result.laps.map((snap) => snap.w || 0),
    allowFollow: window.innerWidth > 700 && replay.speed === 2000,
  }) : null;
  replay.rt = 0;

  $("#raceTitle").textContent = `${tr.flag} ${tr.name}`;
  $("#scrub").max = tr.laps;
  $("#playBtn").textContent = "▶ İzle";
  stopReplay();
  replay.i = 0;
  setSpeed(replay.speed);
  renderReplay();
  show("race");
}

function stopReplay() { if (replay.timer) cancelAnimationFrame(replay.timer); replay.timer = null; }
const mapEnd = () => (current.map ? current.map.model.endT : 0);
function drawMap() { if (current.map) current.map.draw(replay.rt, replay.i); }
function togglePlay() {
  if (replay.timer) { stopReplay(); $("#playBtn").textContent = "▶ İzle"; return; }
  if (replay.i >= current.track.laps) { replay.i = 0; replay.rt = 0; renderReplay(); }
  replay.last = performance.now();
  replay.timer = requestAnimationFrame(frame);
  $("#playBtn").textContent = "⏸ Duraklat";
}
// Zaman tabanlı oynatma: 1x'te bir tur ≈ 3 sn
function frame(now) {
  const dt = Math.min(100, now - replay.last); replay.last = now;
  if (!current.map) { // harita yoksa eski tur tur oynatma
    replay.rt += dt; if (replay.rt < replay.speed) { replay.timer = requestAnimationFrame(frame); return; }
    replay.rt = 0; replay.i++; renderReplay();
    if (replay.i >= current.track.laps) { stopReplay(); $("#playBtn").textContent = "▶ Baştan izle"; return; }
    replay.timer = requestAnimationFrame(frame); return;
  }
  const M = current.map.model;
  replay.rt = Math.min(M.endT, replay.rt + (dt / 1000) * (M.medLap / (replay.speed * 3 / 1000)));
  const k = replay.rt >= M.endT ? current.track.laps : Math.min(current.track.laps, current.map.lapAt(replay.rt));
  if (k !== replay.i) { replay.i = k; renderReplay(); } else drawMap();
  if (replay.rt >= M.endT) { stopReplay(); $("#playBtn").textContent = "▶ Baştan izle"; return; }
  replay.timer = requestAnimationFrame(frame);
}
function setSpeed(ms) {
  replay.speed = ms;
  if (current && current.map && current.map.setFollowAllowed) current.map.setFollowAllowed(window.innerWidth > 700 && ms === 2000);
  document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("active", +b.dataset.speed === ms));
}

function renderReplay() {
  const tr = current.track;
  const i = replay.i;
  const snap = current.result.laps[i];
  const last = i >= tr.laps;
  $("#scrub").value = i;
  $("#lapInfo").innerHTML = i === 0 ? "Başlangıç dizilişi" : last ? "<b>Damalı bayrak!</b> 🏁" : `Tur <b>${i}</b> / ${tr.laps}`;

  let order;
  if (last) {
    order = current.result.results.map((r) => snap.cars.find((c) => c.id === r.id));
  } else {
    const alive = snap.cars.filter((c) => !c.d).sort((a, b) => a.t - b.t);
    const out = snap.cars.filter((c) => c.d).sort((a, b) => b.t - a.t);
    order = alive.concat(out);
  }
  const leader = order[0];
  const pits = current.pitsAt[i];
  let rows = `<tr><th>#</th><th>Pilot</th><th>Fark</th><th>Son tur</th><th>Lastik</th><th>Pit</th></tr>`;
  order.forEach((c, idx) => {
    const e = current.byId[c.id];
    const diff = current.grid[c.id] - (idx + 1);
    const arrow = i === 0 || c.d || diff === 0 ? "" : diff > 0 ? `<span class="up">▲${diff}</span>` : `<span class="down">▼${-diff}</span>`;
    const gap = c.d ? "DNF" : c === leader ? (i === 0 ? "Pole" : "Lider") : "+" + (c.t - leader.t).toFixed(3);
    rows += `<tr class="${e.teamId === S.myTeam ? "player" : ""} ${c.d ? "dnf" : ""}">
      <td class="pos">${idx + 1}</td>
      <td><span class="teambar" style="background:${e.color}"></span>${e.name} ${arrow}</td>
      <td>${gap}</td>
      <td>${fmtLap(c.l)}</td>
      <td><span class="tyre ${c.c}">${c.c}</span> <small>${c.a}</small></td>
      <td>${pits[c.id] || 0}${c.p ? ' <span class="pitflag">PIT</span>' : ""}</td>
    </tr>`;
  });
  $("#board").innerHTML = rows;

  // Benim pilotlarım
  $("#myCars").innerHTML = order.map((c, idx) => ({ c, idx })).filter(({ c }) => current.byId[c.id].teamId === S.myTeam).map(({ c, idx }) => {
    const e = current.byId[c.id];
    return `<div class="card driver-panel" style="border-left-color:${e.color}">
      <div class="dp-head"><span class="dp-pos">${c.d ? "DNF" : "P" + (idx + 1)}</span><span class="dp-name">${e.name}</span>
        <span class="dp-gap">${c.d || c === leader ? "" : "+" + (c.t - leader.t).toFixed(1) + " sn"}</span></div>
      <div class="dp-tyre"><span class="tyre ${c.c}">${c.c}</span><span>${COMPOUNDS[c.c].name} · ${c.a} tur · Aşınma %${c.w}</span></div>
      <div class="wearbar"><div class="wearfill" style="width:${c.w}%;background:${wearColor(c.w)}"></div></div>
      <div class="small muted">Plan: ${e.strategy.start} → ${e.strategy.stops.map((s) => `${s.tyre} (tur ${s.lap})`).join(" → ")} · ${MODES[e.strategy.mode].name}</div>
    </div>`;
  }).join("");

  // Olaylar
  const mine = $("#onlyMine").checked;
  const myIds = new Set(current.entries.filter((e) => e.teamId === S.myTeam).map((e) => e.id));
  const evs = current.result.events.filter((ev) => ev.lap <= i && (!mine || ev.ids.some((id) => myIds.has(id))));
  $("#log").innerHTML = evs.slice().reverse().slice(0, 80).map((ev) => {
    const isMine = ev.ids.some((id) => myIds.has(id));
    return `<li class="${isMine ? "player" : ""} ${ev.kind === "dnf" && isMine ? "bad" : ""}"><span class="lapno">T${ev.lap}</span>${ev.text}</li>`;
  }).join("");

  $("#toEndBtn").textContent = last ? "Sonuçları gör →" : "Sonucu göster ⏭";
  drawMap();
}

/* ---------- SONUÇ ---------- */
function showResults() {
  stopReplay();
  const tr = current.track;
  const res = current.result.results;
  const winner = res[0];
  let rows = `<tr><th>#</th><th>Pilot</th><th>Takım</th><th>Süre / Fark</th><th>En iyi tur</th><th>Puan</th></tr>`;
  res.forEach((r) => {
    const e = current.byId[r.id];
    const time = r.dnf ? "DNF" : r === winner ? fmtRaceTime(r.total) : "+" + r.gap.toFixed(3);
    rows += `<tr class="${e.teamId === S.myTeam ? "player" : ""} ${r.dnf ? "dnf" : ""}">
      <td class="pos">${r.pos}</td>
      <td><span class="teambar" style="background:${e.color}"></span>${e.name}${r.penalty ? " ⚠️" : ""}</td>
      <td>${e.teamName}</td><td>${time}</td>
      <td>${fmtLap(r.best)}${r.fastest ? " 🟣" : ""}</td>
      <td class="num">${r.points || ""}</td></tr>`;
  });
  const p = current.prizes[S.myTeam];
  const catchUp = (p.rank - 1) * ECONOMY.catchUpPerRank;
  $("#resPrize").innerHTML = `💰 Bu yarıştan kazancın: <b>${money(p.prize)}</b>
    <div class="small muted">Katılım ${money(ECONOMY.prizeBase)} + ${p.pts} puan × ${money(ECONOMY.prizePerPoint)}${catchUp ? ` + şampiyona desteği ${money(catchUp)}` : ""} · Kasandaki toplam: ${money(S.teams[S.myTeam].money)}</div>`;
  $("#resTitle").textContent = `${tr.flag} ${tr.name} — Sonuçlar`;
  $("#resTable").innerHTML = rows;
  show("results");
}

/* ---------- SEZON SONU ---------- */
function showSeasonEnd() {
  const t = team(S.myTeam);
  const drivers = allDrivers().map((d) => ({ ...d, pts: S.driverPts[d.id] })).sort((a, b) => b.pts - a.pts);
  const rank = teamRanking();
  const champ = team(rank[0]);
  $("#topInfo").textContent = `${t.name} · Sezon bitti`;
  $("#seasonSummary").innerHTML = `
    <p>Pilotlar şampiyonu: <b>${drivers[0].name}</b> (${drivers[0].team.name}) — ${drivers[0].pts} puan</p>
    <p>Takımlar şampiyonu: <b>${champ.name}</b> — ${S.teamPts[champ.id]} puan</p>
    <p>Senin takımın <b style="color:${t.color}">${t.name}</b> sezonu <b>${rank.indexOf(S.myTeam) + 1}.</b> sırada bitirdi.</p>`;
  renderStandings($("#seasonStandings"));
  show("seasonEnd");
}

/* ---------- BUTONLAR ---------- */
$("#continueBtn").onclick = () => { S = load(); if (S) showHub(); };
$("#goStrategyBtn").onclick = showStrategy;
$("#goGarageBtn").onclick = showGarage;
$("#garageBack").onclick = showHub;
$("#stratBack").onclick = showHub;
$("#runRaceBtn").onclick = runRace;
$("#playBtn").onclick = togglePlay;
$("#toEndBtn").onclick = () => {
  if (replay.i >= current.track.laps) { showResults(); return; }
  stopReplay(); replay.i = current.track.laps; replay.rt = mapEnd(); renderReplay(); $("#playBtn").textContent = "▶ Baştan izle";
};
$("#scrub").oninput = (e) => {
  replay.i = +e.target.value;
  replay.rt = !current.map ? 0 : replay.i >= current.track.laps ? mapEnd() : current.map.model.leaderT[replay.i] || 0;
  renderReplay();
};
$("#onlyMine").onchange = renderReplay;
document.querySelectorAll("[data-speed]").forEach((b) => (b.onclick = () => setSpeed(+b.dataset.speed)));
$("#resContinue").onclick = showHub;
$("#resGarage").onclick = showGarage;
$("#newSeasonBtn").onclick = () => { clearSave(); renderMenu(); };

let resetArmed = false;
$("#resetBtn").onclick = () => {
  if (resetArmed) { clearSave(); resetArmed = false; $("#resetBtn").textContent = "Yeni oyun"; renderMenu(); return; }
  resetArmed = true;
  $("#resetBtn").textContent = "Emin misin? Tekrar tıkla";
  setTimeout(() => { resetArmed = false; $("#resetBtn").textContent = "Yeni oyun"; }, 3000);
};

renderMenu();
