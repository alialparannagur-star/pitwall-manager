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
  function wearRate(track, car, tyre, mode, drv, w) {
    const tyresAttr = drv ? driverAttrs(drv).tyres : 50;
    w = w || 0;
    // Islakta kaygan lastik serin kalır; ıslak lastikler kuruyan pistte hızla erir
    const wx = tyre === "I" ? 1 + 2.5 * Math.max(0, 0.3 - w) / 0.3
      : tyre === "W" ? 1 + 3 * Math.max(0, 0.65 - w) / 0.65
      : 1 - 0.5 * Math.min(1, w);
    return D.COMPOUNDS[tyre].wear * track.degMult * wearMult(car) * (1 - (tyresAttr - 50) * 0.007) * D.MODES[mode || "normal"].wear * wx;
  }
  // Lastiğin pist ıslaklığına (0-1) göre tur süresi farkı
  function tyrePace(tyre, w) {
    if (tyre === "I") return 1.1 + 9 * (w - 0.45) * (w - 0.45);
    if (tyre === "W") return 1.9 + 5 * (w - 0.95) * (w - 0.95);
    return D.COMPOUNDS[tyre].offset + 16 * Math.pow(w, 1.4);
  }

  /* ---------- HAVA DURUMU ---------- */
  // Tahmin herkese açıktır: yarışın kimliğinden üretilir, oyuncu stratejisini buna göre kurar.
  function forecast(track, raceKey) {
    const r = rngFrom(hashSeed(String(raceKey) + ":wx"));
    let p = (track.rain || 0) * (0.3 + r() * 1.4);
    p = p < 0.1 ? 0 : Math.min(0.9, Math.round(p * 20) / 20);
    const wetStart = r() < 0.12;
    const len = Math.round(track.laps * (0.15 + r() * 0.3));
    const center = wetStart ? Math.round(len * 0.3) : Math.round(track.laps * (0.2 + r() * 0.65));
    const from = Math.max(0, wetStart ? 0 : center - Math.round(len / 2));
    const to = Math.min(track.laps, from + len);
    return { p, from, to, heavy: r() < 0.45 };
  }
  // Gerçekte ne olacağı: sunucu yarış anında gizli bir rastgele sayıyla belirler
  function rollWeather(track, fc, rng) {
    const out = { rain: false, from: 0, to: 0, peak: 0, drizzle: null };
    if (!fc || !fc.p) return out;
    if (rng() < fc.p) {
      const shift = Math.round(gauss(rng) * track.laps * 0.08);
      const len = Math.max(4, Math.round((fc.to - fc.from) * (0.6 + rng() * 0.8)));
      out.rain = true;
      out.from = fc.from === 0 && rng() < 0.75 ? 0 : Math.max(1, Math.min(track.laps - 4, fc.from + shift));
      out.to = Math.min(track.laps, out.from + len);
      out.peak = fc.heavy ? 0.7 + rng() * 0.3 : 0.38 + rng() * 0.3;
    } else if (rng() < 0.3) {
      // Yağmur gelmedi ama kısa bir çiseleme olabilir: erken davranan yanılabilir
      const from = Math.max(1, Math.min(track.laps - 6, fc.from + Math.round(gauss(rng) * 4)));
      out.drizzle = { from, to: from + 3 + Math.round(rng() * 5), peak: 0.08 + rng() * 0.1 };
    }
    return out;
  }
  // Tur tur yağış (r) ve pist ıslaklığı (w), 0..laps
  function wetSeries(track, wx) {
    const n = track.laps, r = new Array(n + 1).fill(0), w = new Array(n + 1).fill(0);
    if (wx && wx.rain) for (let l = wx.from; l < wx.to && l <= n; l++) r[l] = wx.peak;
    if (wx && wx.drizzle) for (let l = wx.drizzle.from; l < wx.drizzle.to && l <= n; l++) r[l] = Math.max(r[l], wx.drizzle.peak);
    w[0] = r[0];
    for (let l = 1; l <= n; l++) {
      const prev = w[l - 1];
      w[l] = r[l] > prev ? prev + (r[l] - prev) * 0.5 : Math.max(r[l], prev - 0.05);
    }
    return { r, w };
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
      const plan = { start: seq[0], stops, mode: "normal", pushEnd: true, wearLimit: 85, wetCall: "normal" };
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
    const q = rng();
    plan.wetCall = q < 0.25 ? "early" : q < 0.75 ? "normal" : "late";
    return plan;
  }

  // Kullanıcıdan gelen planı güvenli hale getir (sunucu da bunu kullanır)
  function normalizePlan(plan, track) {
    const p = Object.assign({ start: "M", stops: [], mode: "normal", pushEnd: true, wearLimit: 85, wetCall: "normal" }, plan && typeof plan === "object" ? plan : {});
    const dry = (x) => D.DRY.includes(x);
    p.stops = (Array.isArray(p.stops) ? p.stops : []).filter((s) => s && dry(s.tyre))
      .map((s) => ({ lap: Math.max(1, Math.min(track.laps - 1, Math.round(+s.lap || 1))), tyre: s.tyre }))
      .sort((a, b) => a.lap - b.lap).slice(0, 3);
    if (!dry(p.start)) p.start = "M";
    if (!D.WET_CALLS[p.wetCall]) p.wetCall = "normal";
    if (!D.MODES[p.mode]) p.mode = "normal";
    if (![75, 85, 95].includes(p.wearLimit)) p.wearLimit = 85;
    p.pushEnd = !!p.pushEnd;
    return { start: p.start, stops: p.stops, mode: p.mode, pushEnd: p.pushEnd, wearLimit: p.wearLimit, wetCall: p.wetCall };
  }

  /* ---------- YARIŞ SİMÜLASYONU ---------- */
  // entries: [{ id, name, skill, teamId, teamName, color, car:{...}, strategy:plan }]
  function simulateRace({ track, entries, seed, weather }) {
    const rng = rngFrom(seed);
    const WX = wetSeries(track, weather);
    const W = WX.w;
    const slickFor = (lapsLeft) => (lapsLeft <= 18 ? "S" : lapsLeft <= 32 ? "M" : "H");
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
      call: D.WET_CALLS[e.strategy.wetCall] || D.WET_CALLS.normal,
    }));
    // Islak başlangıç: mühendis ıslak lastik takar
    cars.forEach((c) => {
      if (W[0] >= c.call.toI) { c.compound = W[0] >= c.call.toW ? "W" : "I"; c.used.add(c.compound); }
    });

    // Sıralama turları
    cars.forEach((c) => {
      c.quali = track.baseLap - 1.5 + (100 - c.perf) * 0.045 + (100 - c.a.pace) * 0.012 + c.form + gauss(rng) * 0.15 * (1 + (100 - c.a.consistency) / 60) * (1 + W[0] * 2);
    });
    cars.sort((a, b) => a.quali - b.quali);
    cars.forEach((c, i) => { c.grid = i + 1; c.total = i * 0.25; });
    ev(0, `🏁 Pole pozisyonu: ${cars[0].name}`, [cars[0].id], "pole");
    if (W[0] >= 0.15) ev(0, `🌧️ Yarış ıslak pistte başlıyor`, [], "wet_start");

    const snap = (lap) => ({
      lap, w: Math.round(W[lap] * 100),
      cars: cars.map((c) => ({ id: c.id, t: +c.total.toFixed(3), c: c.compound, a: c.tyreAge, w: Math.round(c.wear), p: c.pitThisLap ? 1 : 0, d: c.dnf ? 1 : 0, l: c.lastLap == null ? null : +c.lastLap.toFixed(3) })),
    });
    const laps = [snap(0)];

    let heavySaid = false, drySaid = true;
    for (let lap = 1; lap <= track.laps; lap++) {
      const lapsLeft = track.laps - lap;
      const w = W[lap];
      // Hava olayları
      const rNow = WX.r[lap], rPrev = WX.r[lap - 1];
      if (rNow > 0 && rPrev === 0) { ev(lap, rNow < 0.25 ? "🌦️ Hafif çiseleme başladı" : "🌧️ Yağmur başladı!", [], rNow < 0.25 ? "drizzle" : "rain_start"); drySaid = false; }
      if (!heavySaid && w >= 0.65) { heavySaid = true; ev(lap, "⛈️ Yağmur şiddetlendi, pist çok ıslak", [], "rain_heavy"); }
      if (rNow === 0 && rPrev > 0) ev(lap, "🌤️ Yağmur durdu, pist kurumaya başlıyor", [], "rain_stop");
      if (!drySaid && rNow === 0 && w < 0.15 && W[lap - 1] >= 0.15) { drySaid = true; ev(lap, "☀️ Kuru bir çizgi oluştu", [], "dry_line"); }
      const order = cars.filter((c) => !c.dnf).sort((a, b) => a.total - b.total);

      // a) Tur süreleri
      order.forEach((c, i) => {
        if (rng() < 0.0004 + (100 - c.car.reliability) * 0.000016) {
          c.dnf = true; c.pitThisLap = false;
          ev(lap, `💥 ${c.name} mekanik arıza nedeniyle yarış dışı!`, [c.id], "dnf");
          return;
        }
        // Islakta kaygan lastikle (ya da sadece ıslakta) kaza riski
        const slick = !D.COMPOUNDS[c.compound].wet;
        const crashP = (slick ? Math.max(0, w - 0.28) * 0.06 : 0) + w * 0.0012;
        if (crashP > 0 && rng() < crashP * Math.max(0.5, 1 + (60 - c.a.consistency) / 80)) {
          c.dnf = true; c.pitThisLap = false;
          ev(lap, `💥 ${c.name} ıslak pistte kontrolü kaybetti, yarış dışı!`, [c.id], "crash");
          return;
        }
        if (c.plan.pushEnd && lapsLeft < 8 && c.wear < 65) c.mode = "push";

        let t = track.baseLap;
        t += (100 - c.perf) * 0.045;
        t += (100 - c.a.pace) * 0.012;                         // pilot hızı
        t += c.form;
        t += tyrePace(c.compound, w) + D.MODES[c.mode].pace + w * 4;
        t += wearPenalty(c.wear);
        t += lapsLeft * 0.03;                                   // yakıt ağırlığı
        t += (gauss(rng) * 0.22 * (1 + (100 - c.a.consistency) / 100) + (100 - c.a.consistency) * 0.006) * (1 + w * 0.8); // istikrarsızlık / şans
        if (lap > 1 && rng() < (100 - c.a.consistency) * 0.0004 * (1 + w * 4)) {      // sürüş hatası (ıslakta daha sık)
          const lost = 2 + rng() * 3;
          t += lost;
          ev(lap, `😬 ${c.name} hata yaptı, ${lost.toFixed(1)} sn kaybetti`, [c.id], "mistake", { sec: +lost.toFixed(1) });
        }
        if (lap === 1) t += 2 + i * 0.15 - (c.a.racecraft - 50) * 0.03; // kalkış turu (iyi yarışçı pozisyon kazanır)

        c.wear = Math.min(100, c.wear + wearRate(track, c.car, c.compound, c.mode, c.a, w));
        c.tyreAge++;

        // Pit kararı: plana göre, ya da lastik güvenlik sınırını geçtiyse erken
        c.pitThisLap = false;
        let pitTo = null, wxPit = false;
        const limit = c.plan.wearLimit || 85;
        // Hava kararı: mühendis bir sonraki turun durumunu da görür (radar)
        const wNext = W[Math.min(track.laps, lap + 1)];
        const wObs = (w + wNext) / 2;
        const rising = wNext > w + 0.005, falling = wNext < w - 0.005;
        const onWet = D.COMPOUNDS[c.compound].wet;
        let want = null;
        if (!onWet) { if (wObs >= c.call.toI && !falling) want = Math.max(wObs, wNext) >= c.call.toW ? "W" : "I"; }
        else if (c.compound === "I") { if (wObs >= c.call.toW && !falling && (c.tyreAge >= 4 || w >= 0.9)) want = "W"; else if (wObs < c.call.toSlick && !rising) want = slickFor(lapsLeft); }
        else if (wObs < c.call.fromW && !rising) want = wObs < c.call.toSlick ? slickFor(lapsLeft) : "I";
        if (onWet) while (c.stops[c.stopIdx] && c.stops[c.stopIdx].lap <= lap + 5) c.stopIdx++; // ıslakken planlı stoplar atlanır
        if (want && lapsLeft >= 2) {
          pitTo = want; wxPit = true;
          if (!D.COMPOUNDS[want].wet) while (c.stops[c.stopIdx] && c.stops[c.stopIdx].lap <= lap + 6) c.stopIdx++;
        }
        const next = c.stops[c.stopIdx];
        if (!pitTo && lapsLeft > 0) {
          if (onWet) {
            if (c.wear >= limit && lapsLeft > 3) { pitTo = c.compound; ev(lap, `⚠️ ${c.name} lastik sınırına ulaştı, erken pite giriyor`, [c.id], "pit_early"); }
          } else if (next && lap >= next.lap) {
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
          ev(lap, `🔧 ${c.name} pite girdi → ${D.COMPOUNDS[pitTo].name}${wxPit ? " (hava)" : ""}`, [c.id], "pit", wxPit ? { tyre: pitTo, wx: 1 } : { tyre: pitTo });
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
      if (c.used.size < 2 && !c.used.has("I") && !c.used.has("W")) { c.penalty = 20; c.total += 20; ev(track.laps, `⚠️ ${c.name}: 2 farklı lastik kullanmadığı için +20 sn ceza`, [c.id], "penalty"); }
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
    return { seed, trackId: track.id, results, laps, events, weather: weather || null };
  }

  g.PW_ENGINE = { rngFrom, hashSeed, gauss, carPerf, driverAttrs, wearRate, tyrePace, forecast, rollWeather, wetSeries, planStints, estimatePlan, suggestStrategies, autoStrategy, normalizePlan, simulateRace };
})(typeof globalThis !== "undefined" ? globalThis : window);
