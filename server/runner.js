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
