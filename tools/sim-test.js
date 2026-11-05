// Motor testi: node tools/sim-test.js
require("../shared/data.js"); require("../shared/engine.js");
const D = globalThis.PW_DATA, E = globalThis.PW_ENGINE;
const wins = {}, pts = {}; let dnfs = 0, races = 0, pitsTotal = 0;
for (let s = 0; s < 250; s++) {
  const track = D.TRACKS[s % 25];
  const rng = E.rngFrom(E.hashSeed("bots" + s));
  const entries = D.DEMO_TEAMS.flatMap((t) => t.drivers.map((d) => ({ ...d, teamId: t.id, teamName: t.name, color: t.color, car: t.car, strategy: E.autoStrategy(track, t.car, rng) })));
  const r = E.simulateRace({ track, entries, seed: s });
  races++; wins[r.results[0].teamId] = (wins[r.results[0].teamId] || 0) + 1;
  r.results.forEach((x) => { pts[x.teamId] = (pts[x.teamId] || 0) + x.points; if (x.dnf) dnfs++; pitsTotal += x.pits; });
}
console.log("Galibiyetler:", wins);
console.log("Puan/yarış:", Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, (v / races).toFixed(1)])));
console.log("DNF/yarış:", (dnfs / races).toFixed(2), " Pit/araç:", (pitsTotal / races / 22).toFixed(2));
// Aynı tohum = aynı sonuç mu?
const t = D.TRACKS[0];
const mk = () => D.DEMO_TEAMS.flatMap((tm) => tm.drivers.map((d) => ({ ...d, teamId: tm.id, car: tm.car, strategy: E.suggestStrategies(t, tm.car)[0].plan })));
const a = JSON.stringify(E.simulateRace({ track: t, entries: mk(), seed: 42 }).results);
const b = JSON.stringify(E.simulateRace({ track: t, entries: mk(), seed: 42 }).results);
console.log("Tekrarlanabilir:", a === b ? "EVET" : "HAYIR");
D.TRACKS.slice(0, 8).forEach((tr) => console.log(tr.name.padEnd(20), E.suggestStrategies(tr, D.DEMO_TEAMS[6].car).map((o) => o.label + " @" + o.plan.stops.map((s) => s.lap).join("/") + " " + o.est.time.toFixed(1)).join(" | ")));
