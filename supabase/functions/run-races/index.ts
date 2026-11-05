// @ts-nocheck
// =====================================================================
// PitWall Manager — run-races (OTOMATİK OLUŞTURULDU, elle düzenleme)
// Kaynak: shared/data.js + shared/engine.js + server/runner.js + server/edge-entry.ts
// Yeniden oluşturmak için: node tools/build-edge.js
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
/* =========================================================
   PitWall Manager — OYUN VERİLERİ (ortak dosya)
   Bu dosya hem tarayıcıda hem sunucuda kullanılacak.
   ========================================================= */
(function (g) {
  // Lastikler: offset = tur süresine etkisi (eksi = hızlı), wear = tur başına aşınma (%)
  const COMPOUNDS = {
    S: { name: "Yumuşak", offset: -0.5, wear: 5.2 },
    M: { name: "Orta",    offset: -0.22, wear: 3.2 },
    H: { name: "Sert",    offset:  0.0, wear: 2.2 },
  };

  // Sürüş modları
  const MODES = {
    push:   { name: "Atak",   pace: -0.35, wear: 1.45 },
    normal: { name: "Normal", pace:  0,    wear: 1.0 },
    save:   { name: "Koru",   pace:  0.45, wear: 0.6 },
  };

  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  // Araç parçaları (garajda geliştirilir)
  const PARTS = {
    engine:      { name: "Motor",        desc: "Düz hız. Hızlı pistlerde daha etkili." },
    aero:        { name: "Aerodinamik",  desc: "Viraj hızı. Teknik pistlerde daha etkili." },
    chassis:     { name: "Şasi",         desc: "Genel hız ve daha az lastik aşınması." },
    reliability: { name: "Güvenilirlik", desc: "Mekanik arıza riskini azaltır." },
    pitcrew:     { name: "Pit ekibi",    desc: "Daha hızlı ve hatasız pit stop." },
  };

  // Pilot özellikleri (her yarıştan sonra gelişim puanı kazanılır)
  const DRIVER_ATTRS = {
    pace:        { name: "Hız",              desc: "Tur süresi. En önemli özellik." },
    racecraft:   { name: "Sollama/Savunma",  desc: "Sollama yapma ve pozisyon koruma başarısı." },
    tyres:       { name: "Lastik yönetimi",  desc: "Lastiği daha az aşındırır, daha uzun stint." },
    consistency: { name: "İstikrar",         desc: "Daha az hata ve daha düzenli turlar." },
  };
  // Bir özelliği +1 yapmanın puan bedeli (yükseldikçe pahalanır)
  function trainCost(v) { return v < 60 ? 1 : v < 70 ? 2 : v < 80 ? 3 : v < 90 ? 4 : 5; }
  // Yarış sonrası kazanılan gelişim puanı: her yarış 1, ilk 10 +1, podyum +1
  function devPointsFor(pos, dnf) { return 1 + (dnf ? 0 : (pos <= 10 ? 1 : 0) + (pos <= 3 ? 1 : 0)); }
  // Piyasa değeri ve maaş (veritabanındaki driver_value ile birebir aynı)
  function driverValue(skill, pot, age) {
    const s = skill == null ? 50 : skill, p = pot == null ? s : pot, a = age == null ? 25 : age;
    const ageF = a <= 22 ? 1.2 : a <= 29 ? 1.0 : a <= 35 ? 0.8 : 0.5;
    const potF = a <= 22 ? 2 : a <= 26 ? 1.3 : 0.6;
    return Math.round((15000 * Math.pow(Math.max(s - 35, 1), 1.8) * ageF + 60000 * Math.max(p - s, 0) * potF) / 10000) * 10000;
  }
  const driverSalary = (skill, pot, age) => Math.round(driverValue(skill, pot, age) * 0.02 / 1000) * 1000;
  const MARKET = { botMarkup: 1.3, refundRate: 0.5, maxTransfers: 4 };
  const driverOverall = (d) => Math.round(((d.pace ?? d.skill) + (d.racecraft ?? d.skill) + (d.tyres ?? d.skill) + (d.consistency ?? d.skill)) / 4);

  // Ekonomi
  const ECONOMY = {
    startMoney: 2000000,
    baseStat: 50,              // yeni araç parçaları ve pilot ortalaması
    upgradeBaseCost: 1000000,  // ilk geliştirmenin fiyatı
    upgradeGrowth: 1.5,        // her seviye bir öncekinden %50 pahalı
    statMax: 99,
    prizeBase: 300000,         // yarışa katılan herkese
    prizePerPoint: 50000,      // kazanılan her puan için
    catchUpPerRank: 100000,    // şampiyonada geride olan takımlara destek
  };

  // Zirveye yaklaştıkça geliştirme etkisi azalır (70 altı +3, 85 altı +2, üstü +1)
  function upgradeGain(stat) { return stat < 70 ? 3 : stat < 85 ? 2 : 1; }

  function upgradeCost(level) {
    return Math.round(ECONOMY.upgradeBaseCost * Math.pow(ECONOMY.upgradeGrowth, level) / 10000) * 10000;
  }

  // standingRank: takımın şampiyonadaki sırası (1 = lider)
  function prizeFor(points, standingRank) {
    return ECONOMY.prizeBase + points * ECONOMY.prizePerPoint + (standingRank - 1) * ECONOMY.catchUpPerRank;
  }

  // Pist tipleri: hangi parçanın ne kadar önemli olduğu
  const TRACK_TYPES = {
    power:     { name: "Hızlı",   w: { engine: 0.50, aero: 0.25, chassis: 0.25 } },
    balanced:  { name: "Dengeli", w: { engine: 0.34, aero: 0.33, chassis: 0.33 } },
    technical: { name: "Teknik",  w: { engine: 0.20, aero: 0.45, chassis: 0.35 } },
  };

  // 25 yarışlık takvim. overtake: sollama kolaylığı (1 = normal, 0.3 = neredeyse imkânsız)
  const TRACKS = [
    { id: "bhr", name: "Bahreyn GP",         flag: "🇧🇭", type: "balanced",  laps: 57, baseLap: 94,  pitLoss: 22, degMult: 1.20, overtake: 1.1 },
    { id: "sau", name: "Suudi Arabistan GP", flag: "🇸🇦", type: "power",     laps: 50, baseLap: 90,  pitLoss: 21, degMult: 0.85, overtake: 1.0 },
    { id: "aus", name: "Avustralya GP",      flag: "🇦🇺", type: "balanced",  laps: 58, baseLap: 80,  pitLoss: 19, degMult: 0.95, overtake: 0.9 },
    { id: "jpn", name: "Japonya GP",         flag: "🇯🇵", type: "technical", laps: 53, baseLap: 92,  pitLoss: 22, degMult: 1.15, overtake: 0.8 },
    { id: "chn", name: "Çin GP",             flag: "🇨🇳", type: "balanced",  laps: 56, baseLap: 95,  pitLoss: 23, degMult: 1.05, overtake: 1.1 },
    { id: "mia", name: "Miami GP",           flag: "🇺🇸", type: "balanced",  laps: 57, baseLap: 90,  pitLoss: 20, degMult: 1.00, overtake: 0.9 },
    { id: "imo", name: "İmola GP",           flag: "🇮🇹", type: "technical", laps: 63, baseLap: 78,  pitLoss: 27, degMult: 0.90, overtake: 0.6 },
    { id: "mon", name: "Monako GP",          flag: "🇲🇨", type: "technical", laps: 78, baseLap: 74,  pitLoss: 20, degMult: 0.70, overtake: 0.3 },
    { id: "can", name: "Kanada GP",          flag: "🇨🇦", type: "power",     laps: 70, baseLap: 75,  pitLoss: 19, degMult: 0.95, overtake: 1.2 },
    { id: "esp", name: "İspanya GP",         flag: "🇪🇸", type: "technical", laps: 66, baseLap: 78,  pitLoss: 21, degMult: 1.20, overtake: 0.8 },
    { id: "aut", name: "Avusturya GP",       flag: "🇦🇹", type: "power",     laps: 71, baseLap: 67,  pitLoss: 20, degMult: 1.00, overtake: 1.2 },
    { id: "gbr", name: "Britanya GP",        flag: "🇬🇧", type: "balanced",  laps: 52, baseLap: 89,  pitLoss: 20, degMult: 1.10, overtake: 1.0 },
    { id: "hun", name: "Macaristan GP",      flag: "🇭🇺", type: "technical", laps: 70, baseLap: 79,  pitLoss: 20, degMult: 1.05, overtake: 0.6 },
    { id: "bel", name: "Belçika GP",         flag: "🇧🇪", type: "power",     laps: 44, baseLap: 106, pitLoss: 21, degMult: 1.00, overtake: 1.2 },
    { id: "ned", name: "Hollanda GP",        flag: "🇳🇱", type: "technical", laps: 72, baseLap: 73,  pitLoss: 21, degMult: 1.00, overtake: 0.6 },
    { id: "ita", name: "İtalya GP",          flag: "🇮🇹", type: "power",     laps: 53, baseLap: 82,  pitLoss: 24, degMult: 0.80, overtake: 1.2 },
    { id: "aze", name: "Azerbaycan GP",      flag: "🇦🇿", type: "power",     laps: 51, baseLap: 104, pitLoss: 20, degMult: 0.85, overtake: 1.1 },
    { id: "sgp", name: "Singapur GP",        flag: "🇸🇬", type: "technical", laps: 62, baseLap: 95,  pitLoss: 28, degMult: 1.00, overtake: 0.6 },
    { id: "tur", name: "İstanbul GP",        flag: "🇹🇷", type: "balanced",  laps: 58, baseLap: 88,  pitLoss: 21, degMult: 1.00, overtake: 1.0 },
    { id: "usa", name: "ABD GP",             flag: "🇺🇸", type: "balanced",  laps: 56, baseLap: 97,  pitLoss: 21, degMult: 1.10, overtake: 1.0 },
    { id: "mex", name: "Meksika GP",         flag: "🇲🇽", type: "power",     laps: 71, baseLap: 79,  pitLoss: 22, degMult: 0.85, overtake: 0.9 },
    { id: "bra", name: "Brezilya GP",        flag: "🇧🇷", type: "balanced",  laps: 71, baseLap: 72,  pitLoss: 21, degMult: 0.95, overtake: 1.1 },
    { id: "lvg", name: "Las Vegas GP",       flag: "🇺🇸", type: "power",     laps: 50, baseLap: 95,  pitLoss: 21, degMult: 0.80, overtake: 1.1 },
    { id: "qat", name: "Katar GP",           flag: "🇶🇦", type: "balanced",  laps: 57, baseLap: 84,  pitLoss: 25, degMult: 1.25, overtake: 0.9 },
    { id: "abu", name: "Abu Dabi GP",        flag: "🇦🇪", type: "balanced",  laps: 58, baseLap: 87,  pitLoss: 22, degMult: 0.90, overtake: 0.9 },
  ];

  // Deneme ligi: 11 takım, 22 pilot (online sürümde her ülke ligi bu yapıda olacak)
  const c = (engine, aero, chassis, reliability, pitcrew) => ({ engine, aero, chassis, reliability, pitcrew });
  const DEMO_TEAMS = [
    { id: "volt",     name: "Volt Racing",        color: "#3b5bdb", car: c(94, 96, 94, 88, 92), drivers: [{ id: "volt-1", name: "Erik Vandermeer", skill: 94 }, { id: "volt-2", name: "Tomás Ribeiro", skill: 83 }] },
    { id: "arancia",  name: "Arancia Motorsport", color: "#f76707", car: c(93, 95, 93, 90, 88), drivers: [{ id: "arancia-1", name: "Callum Hayes", skill: 92 }, { id: "arancia-2", name: "Noah Whitfield", skill: 88 }] },
    { id: "rosso",    name: "Rosso Veloce",       color: "#e03131", car: c(95, 91, 92, 86, 85), drivers: [{ id: "rosso-1", name: "Luca Ferraro", skill: 91 }, { id: "rosso-2", name: "Julien Moreau", skill: 89 }] },
    { id: "argento",  name: "Argento GP",         color: "#adb5bd", car: c(93, 89, 91, 92, 90), drivers: [{ id: "argento-1", name: "Henrik Lund", skill: 90 }, { id: "argento-2", name: "Mateo Rossi", skill: 84 }] },
    { id: "verde",    name: "Verde Atlas",        color: "#2b8a3e", car: c(86, 87, 85, 84, 82), drivers: [{ id: "verde-1", name: "Rafael Castillo", skill: 88 }, { id: "verde-2", name: "Ethan Brooks", skill: 79 }] },
    { id: "alpen",    name: "Alpen Blau",         color: "#4dabf7", car: c(85, 83, 84, 82, 84), drivers: [{ id: "alpen-1", name: "Pierre Duval", skill: 85 }, { id: "alpen-2", name: "Kenji Morita", skill: 82 }] },
    { id: "bogazici", name: "Boğaziçi Racing",    color: "#12b886", car: c(83, 84, 82, 83, 83), drivers: [{ id: "bogazici-1", name: "Emre Aydın", skill: 84 }, { id: "bogazici-2", name: "Can Özkan", skill: 81 }] },
    { id: "nordwind", name: "Nordwind GP",        color: "#845ef7", car: c(84, 80, 81, 80, 80), drivers: [{ id: "nordwind-1", name: "Lars Eklund", skill: 82 }, { id: "nordwind-2", name: "Yuki Tanabe", skill: 80 }] },
    { id: "phoenix",  name: "Phoenix Racing",     color: "#fab005", car: c(80, 79, 79, 78, 80), drivers: [{ id: "phoenix-1", name: "Marcus Webb", skill: 81 }, { id: "phoenix-2", name: "Daniel Okafor", skill: 78 }] },
    { id: "condor",   name: "Condor Racing",      color: "#c2774a", car: c(79, 78, 78, 80, 77), drivers: [{ id: "condor-1", name: "Diego Herrera", skill: 80 }, { id: "condor-2", name: "Oliver Grant", skill: 77 }] },
    { id: "sakura",   name: "Sakura Racing",      color: "#f06595", car: c(76, 78, 77, 76, 78), drivers: [{ id: "sakura-1", name: "Haruto Sato", skill: 79 }, { id: "sakura-2", name: "Felix Brandt", skill: 76 }] },
  ];

  g.PW_DATA = { COMPOUNDS, MODES, POINTS, PARTS, ECONOMY, TRACK_TYPES, TRACKS, DEMO_TEAMS, upgradeCost, upgradeGain, prizeFor, DRIVER_ATTRS, trainCost, devPointsFor, driverOverall, driverValue, driverSalary, MARKET };
})(typeof globalThis !== "undefined" ? globalThis : window);

/* =========================================================
   PitWall Manager — YARIŞ MOTORU (ortak dosya)
   - Oyuncu müdahalesi yok: herkes yarıştan önce strateji kurar.
   - Aynı "seed" (tohum) ile aynı yarış her zaman aynı sonucu verir.
     Böylece sunucuda koşan yarış, tarayıcıda birebir tekrar izlenebilir.
   - Tarayıcıda, Node'da ve Supabase (Deno) sunucusunda çalışır.
   ========================================================= */
(function (g) {
  const D = g.PW_DATA;

  /* ---------- Tohumlu rastgele sayı üretici ---------- */
  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261;
    for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------- Araç hesapları ---------- */
  function carPerf(car, track) {
    const w = D.TRACK_TYPES[track.type].w;
    return car.engine * w.engine + car.aero * w.aero + car.chassis * w.chassis;
  }
  // Pilot özellikleri: hız, sollama, lastik yönetimi, istikrar.
  // Eski veride sadece "skill" varsa hepsi ona eşit sayılır.
  function driverAttrs(d) {
    const base = d && d.skill != null ? d.skill : 50;
    const v = (k) => (d && d[k] != null ? d[k] : base);
    return { pace: v("pace"), racecraft: v("racecraft"), tyres: v("tyres"), consistency: v("consistency") };
  }
  // İyi şasi ve lastik yönetimi iyi pilot, lastiği daha az yorar
  function wearMult(car) { return 1 - (car.chassis - 50) * 0.003; }
  function wearRate(track, car, tyre, mode, drv) {
    const tyresAttr = drv ? driverAttrs(drv).tyres : 50;
    return D.COMPOUNDS[tyre].wear * track.degMult * wearMult(car) * (1 - (tyresAttr - 50) * 0.007) * D.MODES[mode || "normal"].wear;
  }
  // Aşınmanın tur süresine etkisi (%70 üstünde sert düşüş)
  function wearPenalty(w) { return w * 0.018 + Math.max(0, w - 70) * 0.09; }

  /* ---------- Strateji tahmini ve öneri ---------- */
  // plan = { start:'M', stops:[{lap:24, tyre:'H'}], mode:'normal', pushEnd:true, wearLimit:85 }
  function planStints(track, plan) {
    const stints = [];
    let from = 0, tyre = plan.start;
    (plan.stops || []).forEach((s) => { stints.push({ tyre, from, to: s.lap }); from = s.lap; tyre = s.tyre; });
    stints.push({ tyre, from, to: track.laps });
    return stints.map((s) => ({ ...s, laps: s.to - s.from }));
  }

  function estimatePlan(track, car, plan, drv) {
    const mode = plan.mode || "normal";
    const rate = (t) => wearRate(track, car, t, mode, drv);
    let time = 0, maxWear = 0;
    const stints = planStints(track, plan).map((s) => {
      let w = 0, t = 0;
      for (let k = 0; k < s.laps; k++) { t += D.COMPOUNDS[s.tyre].offset + wearPenalty(w); w = Math.min(100, w + rate(s.tyre)); }
      time += t; maxWear = Math.max(maxWear, w);
      return { ...s, endWear: w };
    });
    time += (plan.stops || []).length * (track.pitLoss + (100 - car.pitcrew) * 0.03);
    const compounds = new Set(stints.map((s) => s.tyre));
    return { time, maxWear, stints, twoCompounds: compounds.size >= 2 };
  }

  // Olası tüm 1 ve 2 stoplu stratejileri dener, en hızlıları döndürür
  function suggestStrategies(track, car, count = 3, drv) {
    const T = ["S", "M", "H"];
    const seqs = [];
    T.forEach((a) => T.forEach((b) => { if (a !== b) seqs.push([a, b]); }));
    T.forEach((a) => T.forEach((b) => T.forEach((c) => { if (new Set([a, b, c]).size >= 2) seqs.push([a, b, c]); })));

    const out = [];
    seqs.forEach((seq) => {
      // Her lastiğe ömrüyle orantılı tur ver
      const caps = seq.map((t) => 72 / wearRate(track, car, t, "normal", drv));
      const sum = caps.reduce((x, y) => x + y, 0);
      let acc = 0;
      const stops = [];
      for (let i = 0; i < seq.length - 1; i++) {
        acc += caps[i] / sum * track.laps;
        stops.push({ lap: Math.max(1, Math.min(track.laps - 1, Math.round(acc))), tyre: seq[i + 1] });
      }
      const plan = { start: seq[0], stops, mode: "normal", pushEnd: true, wearLimit: 85 };
      const est = estimatePlan(track, car, plan, drv);
      if (est.maxWear <= 92) out.push({ plan, est, label: seq.join(" → ") });
    });
    out.sort((a, b) => a.est.time - b.est.time);
    return out.slice(0, count);
  }

  // Botların stratejisi: iyi seçeneklerden birini biraz rastgelelikle seçer
  function autoStrategy(track, car, rng, drv) {
    const opts = suggestStrategies(track, car, 3, drv);
    const r = rng();
    const pick = opts[r < 0.55 ? 0 : r < 0.85 ? Math.min(1, opts.length - 1) : opts.length - 1];
    const plan = JSON.parse(JSON.stringify(pick.plan));
    plan.stops.forEach((s) => { s.lap = Math.max(1, Math.min(track.laps - 1, s.lap + Math.round((rng() - 0.5) * 4))); });
    return plan;
  }

  // Kullanıcıdan gelen planı güvenli hale getir (sunucu da bunu kullanır)
  function normalizePlan(plan, track) {
    const p = Object.assign({ start: "M", stops: [], mode: "normal", pushEnd: true, wearLimit: 85 }, plan && typeof plan === "object" ? plan : {});
    p.stops = (Array.isArray(p.stops) ? p.stops : []).filter((s) => s && D.COMPOUNDS[s.tyre])
      .map((s) => ({ lap: Math.max(1, Math.min(track.laps - 1, Math.round(+s.lap || 1))), tyre: s.tyre }))
      .sort((a, b) => a.lap - b.lap).slice(0, 3);
    if (!D.COMPOUNDS[p.start]) p.start = "M";
    if (!D.MODES[p.mode]) p.mode = "normal";
    if (![75, 85, 95].includes(p.wearLimit)) p.wearLimit = 85;
    p.pushEnd = !!p.pushEnd;
    return { start: p.start, stops: p.stops, mode: p.mode, pushEnd: p.pushEnd, wearLimit: p.wearLimit };
  }

  /* ---------- YARIŞ SİMÜLASYONU ---------- */
  // entries: [{ id, name, skill, teamId, teamName, color, car:{...}, strategy:plan }]
  function simulateRace({ track, entries, seed }) {
    const rng = rngFrom(seed);
    const events = [];
    const ev = (lap, text, ids, kind, params) => events.push({ lap, text, ids, kind: kind || "info", params: params || null });

    const cars = entries.map((e) => ({
      e, id: e.id, name: e.name, car: e.car, a: driverAttrs(e),
      plan: e.strategy, perf: carPerf(e.car, track),
      form: gauss(rng) * 0.18,
      total: 0, lastLap: null, best: Infinity, lapsDone: 0,
      compound: e.strategy.start, wear: 0, tyreAge: 0, used: new Set([e.strategy.start]),
      stops: (e.strategy.stops || []).map((s) => ({ ...s })), stopIdx: 0, pits: 0,
      mode: e.strategy.mode || "normal", dnf: false, penalty: 0, pitThisLap: false,
    }));

    // Sıralama turları
    cars.forEach((c) => {
      c.quali = track.baseLap - 1.5 + (100 - c.perf) * 0.045 + (100 - c.a.pace) * 0.012 + c.form + gauss(rng) * 0.15 * (1 + (100 - c.a.consistency) / 60);
    });
    cars.sort((a, b) => a.quali - b.quali);
    cars.forEach((c, i) => { c.grid = i + 1; c.total = i * 0.25; });
    ev(0, `🏁 Pole pozisyonu: ${cars[0].name}`, [cars[0].id], "pole");

    const snap = (lap) => ({
      lap,
      cars: cars.map((c) => ({ id: c.id, t: +c.total.toFixed(3), c: c.compound, a: c.tyreAge, w: Math.round(c.wear), p: c.pitThisLap ? 1 : 0, d: c.dnf ? 1 : 0, l: c.lastLap == null ? null : +c.lastLap.toFixed(3) })),
    });
    const laps = [snap(0)];

    for (let lap = 1; lap <= track.laps; lap++) {
      const lapsLeft = track.laps - lap;
      const order = cars.filter((c) => !c.dnf).sort((a, b) => a.total - b.total);

      // a) Tur süreleri
      order.forEach((c, i) => {
        if (rng() < 0.0004 + (100 - c.car.reliability) * 0.000016) {
          c.dnf = true; c.pitThisLap = false;
          ev(lap, `💥 ${c.name} mekanik arıza nedeniyle yarış dışı!`, [c.id], "dnf");
          return;
        }
        if (c.plan.pushEnd && lapsLeft < 8 && c.wear < 65) c.mode = "push";

        let t = track.baseLap;
        t += (100 - c.perf) * 0.045;
        t += (100 - c.a.pace) * 0.012;                         // pilot hızı
        t += c.form;
        t += D.COMPOUNDS[c.compound].offset + D.MODES[c.mode].pace;
        t += wearPenalty(c.wear);
        t += lapsLeft * 0.03;                                   // yakıt ağırlığı
        t += gauss(rng) * 0.22 * (1 + (100 - c.a.consistency) / 100) + (100 - c.a.consistency) * 0.006; // istikrarsızlık / şans
        if (lap > 1 && rng() < (100 - c.a.consistency) * 0.0004) {      // sürüş hatası
          const lost = 2 + rng() * 3;
          t += lost;
          ev(lap, `😬 ${c.name} hata yaptı, ${lost.toFixed(1)} sn kaybetti`, [c.id], "mistake", { sec: +lost.toFixed(1) });
        }
        if (lap === 1) t += 2 + i * 0.15 - (c.a.racecraft - 50) * 0.03; // kalkış turu (iyi yarışçı pozisyon kazanır)

        c.wear = Math.min(100, c.wear + wearRate(track, c.car, c.compound, c.mode, c.a));
        c.tyreAge++;

        // Pit kararı: plana göre, ya da lastik güvenlik sınırını geçtiyse erken
        c.pitThisLap = false;
        let pitTo = null;
        const next = c.stops[c.stopIdx];
        const limit = c.plan.wearLimit || 85;
        if (lapsLeft > 0) {
          if (next && lap >= next.lap) {
            pitTo = next.tyre; c.stopIdx++;
          } else if (c.wear >= limit && lapsLeft > 3) {
            if (next) {
              const shift = next.lap - lap;
              pitTo = next.tyre; c.stopIdx++;
              c.stops.slice(c.stopIdx).forEach((s) => (s.lap -= shift));
              ev(lap, `⚠️ ${c.name} lastik sınırına ulaştı, erken pite giriyor`, [c.id], "pit_early");
            } else if (lapsLeft > 8) {
              pitTo = lapsLeft <= 18 ? "S" : lapsLeft <= 30 ? "M" : "H";
              ev(lap, `⚠️ ${c.name} planda olmayan acil pit stop yapıyor`, [c.id], "pit_emergency");
            }
          }
        }
        if (pitTo) {
          let loss = track.pitLoss + (100 - c.car.pitcrew) * 0.03 + rng() * 1.2;
          if (rng() < 0.02 + (100 - c.car.pitcrew) * 0.001) {
            const extra = 3 + rng() * 4;
            loss += extra;
            ev(lap, `🐢 ${c.name} yavaş pit stop! (+${extra.toFixed(1)} sn)`, [c.id], "pit_slow", { sec: +extra.toFixed(1) });
          }
          t += loss;
          c.compound = pitTo; c.wear = 0; c.tyreAge = 0; c.used.add(pitTo); c.pits++; c.pitThisLap = true;
          ev(lap, `🔧 ${c.name} pite girdi → ${D.COMPOUNDS[pitTo].name}`, [c.id], "pit", { tyre: pitTo });
        }
        c.lastLap = t;
        c.newTotal = c.total + t;
      });

      // b) Trafik ve sollamalar
      const alive = order.filter((c) => !c.dnf);
      for (let i = 1; i < alive.length; i++) {
        const c = alive[i], a = alive[i - 1];
        if (c.pitThisLap || a.pitThisLap) continue;
        if (c.total - a.total < 1.2 && c.newTotal < a.newTotal + 0.15) {
          const paceDelta = a.lastLap - c.lastLap;
          const chance = Math.max(0.05, Math.min(0.85, (0.15 + paceDelta * 0.45 + (c.a.racecraft - a.a.racecraft) * 0.035) * track.overtake));
          if (rng() < chance) {
            if (c.newTotal >= a.newTotal) c.newTotal = a.newTotal - 0.1 - rng() * 0.3;
            ev(lap, i === 1 ? `👑 ${c.name} liderliği aldı!` : `⚔️ ${c.name} sollamayı yaptı, ${a.name} geride kaldı`, [c.id, a.id], i === 1 ? "lead" : "overtake");
          } else {
            c.newTotal = a.newTotal + (0.25 + rng() * 0.35) * Math.max(0.3, 1 - (c.a.racecraft - 50) * 0.012);
          }
          c.lastLap = c.newTotal - c.total;
        }
      }

      // c) Toplamları güncelle
      alive.forEach((c) => {
        c.total = c.newTotal; c.lapsDone++;
        if (!c.pitThisLap && lap > 1 && c.lastLap < c.best) c.best = c.lastLap;
      });
      laps.push(snap(lap));
    }

    // d) Kurallar ve sonuç
    cars.filter((c) => !c.dnf).forEach((c) => {
      if (c.used.size < 2) { c.penalty = 20; c.total += 20; ev(track.laps, `⚠️ ${c.name}: 2 farklı lastik kullanmadığı için +20 sn ceza`, [c.id], "penalty"); }
    });
    const alive = cars.filter((c) => !c.dnf).sort((a, b) => a.total - b.total);
    const out = cars.filter((c) => c.dnf).sort((a, b) => b.lapsDone - a.lapsDone);
    const final = alive.concat(out);
    const fastest = alive.reduce((x, y) => (y.best < x.best ? y : x), alive[0]);
    const results = final.map((c, i) => ({
      id: c.id, teamId: c.e.teamId, pos: i + 1, grid: c.grid,
      total: +c.total.toFixed(3), gap: c.dnf ? null : +(c.total - alive[0].total).toFixed(3),
      best: isFinite(c.best) ? +c.best.toFixed(3) : null, pits: c.pits, dnf: c.dnf, penalty: c.penalty,
      fastest: c === fastest,
      points: !c.dnf && i < D.POINTS.length ? D.POINTS[i] : 0,
    }));
    if (laps.length) laps[laps.length - 1].cars.forEach((s) => { const c = cars.find((x) => x.id === s.id); s.t = +c.total.toFixed(3); });
    return { seed, trackId: track.id, results, laps, events };
  }

  g.PW_ENGINE = { rngFrom, hashSeed, gauss, carPerf, driverAttrs, wearRate, planStints, estimatePlan, suggestStrategies, autoStrategy, normalizePlan, simulateRace };
})(typeof globalThis !== "undefined" ? globalThis : window);

/* =========================================================
   PitWall Manager — SUNUCU YARIŞ YÖNETİCİSİ
   Zamanı gelen yarışları bulur, motoru çalıştırır, sonuçları yazar.
   rpc: (fonksiyonAdı, parametreler) => Promise<sonuç>
   ========================================================= */
(function (g) {
  const D = g.PW_DATA, E = g.PW_ENGINE;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // Veritabanından gelen bilgiyle yarışı simüle eder
  function simulateFromInput(input) {
    const track = D.TRACKS.find((t) => t.id === input.track_id);
    if (!track) throw new Error("Bilinmeyen pist: " + input.track_id);
    const botRng = E.rngFrom(E.hashSeed(input.race_id + ":bots"));
    const saved = {};
    (input.strategies || []).forEach((s) => (saved[s.driver_id] = s.plan));

    const entries = [];
    input.teams.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((t) => {
      const car = { engine: t.engine, aero: t.aero, chassis: t.chassis, reliability: t.reliability, pitcrew: t.pitcrew };
      t.drivers.slice().sort((a, b) => a.seat - b.seat).forEach((d, k) => {
        let plan, source;
        if (!t.owner_id) { plan = E.autoStrategy(track, car, botRng, d); source = "bot"; }
        else if (saved[d.id]) { plan = E.normalizePlan(saved[d.id], track); source = "player"; }
        else {
          // Strateji kaydedilmediyse: arayüzde gösterilen mühendis önerisiyle aynı plan
          const sugg = E.suggestStrategies(track, car, 4, d);
          plan = clone(sugg[Math.min(k, sugg.length - 1)].plan); source = "engineer";
        }
        entries.push({
          id: d.id, name: d.name, skill: d.skill, pace: d.pace, racecraft: d.racecraft, tyres: d.tyres, consistency: d.consistency,
          nat: d.nationality || null, age: d.age || null,
          teamId: t.id, teamName: t.name, color: t.color, car, strategy: plan, source,
        });
      });
    });

    const sim = E.simulateRace({ track, entries, seed: Number(input.seed) });
    const results = sim.results.map((r) => ({
      driver_id: r.id, team_id: r.teamId, pos: r.pos, grid: r.grid, points: r.points,
      total: r.total, best: r.best, dnf: r.dnf, pits: r.pits,
    }));
    // Tekrar verisini sıkıştır: her tur, her araç için [süre, lastik, lastik yaşı, aşınma, pit, dnf, son tur]
    // Araçlar uzun kimlik yerine entries listesindeki sıra numarasıyla tutulur.
    const idx = Object.fromEntries(entries.map((e, i) => [e.id, i]));
    const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
    const replay = {
      v: 2, trackId: track.id, round: input.round, title: input.title || null,
      entries: entries.map((e) => ({ id: e.id, name: e.name, skill: e.skill, nat: e.nat, age: e.age, teamId: e.teamId, teamName: e.teamName, color: e.color, plan: e.strategy, source: e.source })),
      results: sim.results.map((r) => ({ i: idx[r.id], pos: r.pos, grid: r.grid, total: r.total, gap: r.gap, best: r.best, pits: r.pits, dnf: r.dnf, penalty: r.penalty, fastest: r.fastest, points: r.points })),
      laps: sim.laps.map((s) => {
        const row = new Array(entries.length);
        s.cars.forEach((c) => (row[idx[c.id]] = [r2(c.t), c.c, c.a, c.w, c.p, c.d, r2(c.l)]));
        return row;
      }),
      events: sim.events.map((e) => (e.params ? [e.lap, e.text, e.ids.map((id) => idx[id]), e.kind, e.params] : [e.lap, e.text, e.ids.map((id) => idx[id]), e.kind])),
    };
    const winner = entries.find((e) => e.id === results[0].driver_id);
    return { results, replay, winnerName: winner ? winner.name : "?" };
  }

  async function runDueRaces(rpc, limit) {
    const report = [];
    // Önce dünya turnuvası / sezon aşamalarını ilerlet (yapacak iş yoksa bir şey değiştirmez)
    try { report.push({ world: await rpc("advance_world", {}) }); }
    catch (e) { report.push({ world: "hata: " + String((e && e.message) || e) }); }
    const races = (await rpc("claim_due_races", { p_limit: limit || 50 })) || [];
    for (const race of races) {
      try {
        const input = await rpc("race_input", { p_race: race.id });
        const { results, replay, winnerName } = simulateFromInput(input);
        await rpc(race.world_group_id ? "finish_world_race" : "finish_race", { p_race: race.id, p_results: results, p_replay: replay });
        report.push({ race: race.id, round: race.round, ok: true, winner: winnerName });
      } catch (e) {
        report.push({ race: race.id, round: race.round, ok: false, error: String((e && e.message) || e) });
      }
    }
    return report;
  }

  g.PW_RUNNER = { simulateFromInput, runDueRaces };
})(typeof globalThis !== "undefined" ? globalThis : window);

// ---------- Supabase Edge Function giriş noktası ----------

function serviceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (k) return k;
  // Yeni anahtar sistemi: SUPABASE_SECRET_KEYS = {"default":"sb_secret_..."}
  try {
    const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return all.default || Object.values(all)[0] as string;
  } catch (_) { return ""; }
}

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(fn + ": " + error.message);
    return data;
  };
  try {
    const report = await (globalThis as any).PW_RUNNER.runDueRaces(rpc, 50);
    return new Response(JSON.stringify({ ok: true, processed: report.filter((r: any) => r.race).length, report }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
