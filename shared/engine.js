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
