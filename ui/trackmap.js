/* =========================================================
   PitWall Manager — PİST HARİTASI
   Her pistin sadeleştirilmiş üstten görünümü (0-100 ızgarada köşe noktaları).
   İlk nokta start/finiş çizgisi; ilk iki nokta arası ana düzlük.
   PW_TRACKMAP.get(trackId) → { d, pitD, at(p), pitAt(p), box }
     at(p): turun p kesrindeki (0..1) pist noktası
     pitAt(p): pit yolundaki nokta (p: pit yolunun başı 0 → sonu 1)
   ========================================================= */
(function () {
  const SHAPES = {
    bhr: [[20,80],[70,80],[78,76],[76,68],[60,62],[58,50],[70,40],[82,30],[80,20],[66,18],[50,26],[40,22],[30,30],[36,42],[28,52],[14,56],[10,68],[14,78]],
    sau: [[42,90],[50,92],[55,80],[60,65],[58,50],[63,35],[60,20],[55,8],[48,6],[44,15],[46,30],[42,45],[45,60],[40,75]],
    aus: [[30,78],[60,80],[75,72],[85,60],[82,45],[88,32],[78,20],[60,18],[48,26],[36,22],[22,30],[16,45],[20,60],[18,72]],
    jpn: [[25,75],[55,78],[68,70],[62,60],[50,55],[40,48],[45,38],[58,32],[72,28],[84,20],[78,10],[64,12],[54,22],[46,32],[36,40],[22,48],[12,58],[14,70]],
    chn: [[22,74],[60,74],[70,66],[66,56],[56,54],[50,44],[60,36],[78,34],[88,26],[84,16],[66,18],[40,20],[22,24],[14,36],[22,48],[14,60]],
    mia: [[20,80],[50,82],[62,74],[58,64],[66,56],[80,54],[86,44],[78,36],[60,38],[40,30],[30,20],[16,24],[12,40],[22,52],[14,66]],
    imo: [[30,80],[60,82],[78,74],[84,60],[76,48],[82,34],[70,20],[52,22],[42,32],[30,26],[18,32],[14,48],[20,62],[16,74]],
    mon: [[40,85],[56,80],[62,70],[70,60],[78,50],[72,42],[60,40],[50,30],[56,22],[48,14],[36,18],[30,30],[34,42],[26,52],[28,66],[34,78]],
    can: [[20,72],[40,76],[60,74],[80,70],[90,62],[84,56],[66,58],[48,56],[30,52],[14,50],[8,58],[12,66]],
    esp: [[20,78],[62,80],[74,72],[70,62],[78,52],[86,40],[78,30],[62,32],[54,24],[40,22],[30,30],[36,40],[26,48],[14,52],[12,64],[16,74]],
    aut: [[20,78],[50,80],[60,72],[78,40],[86,28],[78,22],[66,30],[56,40],[44,36],[30,44],[24,56],[16,64],[14,72]],
    gbr: [[30,78],[56,82],[70,74],[78,62],[72,50],[82,38],[78,24],[62,18],[50,26],[40,18],[26,22],[24,36],[34,44],[26,56],[18,66],[22,76]],
    hun: [[26,80],[60,82],[72,74],[66,64],[54,62],[50,52],[62,46],[76,44],[80,32],[70,22],[54,24],[42,18],[30,24],[34,36],[24,44],[18,56],[20,70]],
    bel: [[46,82],[64,80],[80,76],[88,64],[82,50],[74,38],[82,26],[78,14],[66,16],[58,28],[48,44],[38,60],[28,70],[22,80],[30,86]],
    ned: [[30,76],[60,78],[72,70],[68,58],[78,48],[76,34],[62,26],[48,30],[40,20],[26,24],[20,38],[30,48],[22,60],[22,70]],
    ita: [[20,80],[70,82],[84,76],[86,64],[80,52],[84,36],[78,22],[64,16],[50,20],[44,32],[34,24],[22,30],[14,44],[12,60],[14,72]],
    aze: [[16,80],[80,82],[88,74],[84,64],[70,62],[66,52],[74,44],[70,34],[56,30],[44,22],[34,26],[28,38],[20,40],[14,52],[12,66]],
    sgp: [[24,80],[60,82],[72,74],[78,62],[72,52],[82,42],[80,28],[66,22],[52,28],[44,20],[30,22],[24,34],[32,46],[22,54],[14,64],[18,74]],
    tur: [[26,78],[60,80],[72,72],[68,62],[56,58],[50,48],[58,38],[74,36],[86,28],[84,16],[70,12],[56,18],[42,14],[30,20],[22,32],[30,44],[20,54],[14,66]],
    usa: [[12,82],[28,82],[34,72],[42,62],[54,52],[62,46],[76,44],[88,36],[84,24],[66,22],[44,20],[26,24],[18,34],[28,44],[20,56],[10,66]],
    mex: [[20,80],[70,82],[82,74],[78,62],[66,58],[70,46],[80,36],[72,24],[56,26],[42,20],[30,26],[34,40],[24,46],[16,58],[14,70]],
    bra: [[72,22],[46,18],[28,18],[20,28],[26,40],[40,46],[50,58],[42,70],[30,74],[34,84],[52,86],[70,78],[84,62],[86,44],[80,30]],
    lvg: [[20,80],[80,80],[86,72],[82,64],[70,62],[70,40],[78,30],[74,18],[60,16],[30,16],[18,22],[14,40],[22,50],[14,62],[14,74]],
    qat: [[24,80],[64,82],[78,74],[86,60],[80,48],[86,34],[76,22],[60,24],[48,16],[34,20],[24,32],[30,44],[20,54],[14,66]],
    abu: [[20,80],[50,82],[60,74],[56,62],[70,54],[84,40],[80,24],[66,20],[54,30],[42,24],[30,28],[34,42],[24,50],[14,62],[14,74]],
  };

  // Kapalı Catmull-Rom eğrisi → yoğun nokta listesi
  function spline(pts, steps) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    return out;
  }
  // Yay uzunluğuna göre eşit aralıklı örnekleme tablosu
  function lut(dense, closed) {
    const cum = [0];
    const m = closed ? dense.length : dense.length - 1;
    for (let i = 1; i <= m; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[cum.length - 1];
    const fn = (p) => {
      let x = (closed ? ((p % 1) + 1) % 1 : Math.max(0, Math.min(1, p))) * total;
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= x) lo = mid; else hi = mid; }
      const a = dense[lo], b = dense[(lo + 1) % dense.length];
      const seg = cum[lo + 1] - cum[lo] || 1, k = (x - cum[lo]) / seg;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    fn.total = total;
    return fn;
  }
  const pathD = (pts, closed) => "M" + pts.map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" L") + (closed ? " Z" : "");

  const cache = {};
  function get(trackId) {
    if (cache[trackId]) return cache[trackId];
    const pts = SHAPES[trackId] || SHAPES.bhr;
    const dense = spline(pts, 24);
    const at = lut(dense, true);
    // Pist yönü (saat yönü mü?) → pit yolu hep pistin iç tarafında
    let area = 0;
    for (let i = 0; i < dense.length; i++) { const a = dense[i], b = dense[(i + 1) % dense.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const inward = area > 0 ? 1 : -1;
    // Pit yolu: finişten hemen önce girer, ana düzlük boyunca içeride ilerler
    const PIT_FROM = -0.03, PIT_TO = 0.07, OFF = 5.6;
    const pit = [];
    for (let k = 0; k <= 30; k++) {
      const p = PIT_FROM + (PIT_TO - PIT_FROM) * (k / 30);
      const a = at(p - 0.002), b = at(p + 0.002), c = at(p);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const edge = k < 4 ? k / 4 : k > 26 ? (30 - k) / 4 : 1; // giriş/çıkışta yumuşak geçiş
      pit.push([c[0] - (dy / len) * OFF * inward * edge, c[1] + (dx / len) * OFF * inward * edge]);
    }
    const pitAt = lut(pit, false);
    // Kutuya sığdır
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    dense.concat(pit).forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const pad = 6;
    const g = cache[trackId] = {
      d: pathD(dense, true), pitD: pathD(pit, false), at, pitAt, PIT_FROM, PIT_TO,
      box: [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2],
      start: [at(0), at(0.004)],
    };
    return g;
  }

  /* ---------- Yarış haritası: tekrar verisinden arabaları pistte canlandırır ----------
     PW_RACEMAP.create(svg, { trackId, laps, cars, mine, sc, wx })
       laps[k][i] = { t: tur sonu toplam süre, p: pit, d: dnf }  (k=0 grid dizilişi)
       cars[i]    = { color, name, team }
     → { model, lapAt(rt), draw(rt, lapIdx) } */
  const SVGNS = "http://www.w3.org/2000/svg";
  // Üstten bakış araba silueti (burun +x yönünde)
  const CAR_PATH = "M2.6 0 L1.5 -0.55 L0.9 -0.55 L0.6 -1.05 L-0.6 -1.05 L-0.9 -0.6 L-1.9 -0.6 L-2.2 -1.0 L-2.6 -1.0 L-2.6 1.0 L-2.2 1.0 L-1.9 0.6 L-0.9 0.6 L-0.6 1.05 L0.6 1.05 L0.9 0.55 L1.5 0.55 Z";
  const escX = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function createRaceMap(svg, o) {
    const G = get(o.trackId), laps = o.laps, n = o.cars.length, L = laps.length - 1, mine = o.mine || new Set();
    // Model
    const leaderT = [0];
    for (let k = 1; k <= L; k++) {
      const alive = laps[k].filter((c) => c && !c.d).map((c) => c.t);
      leaderT.push(alive.length ? Math.min(...alive) : leaderT[k - 1]);
    }
    const ls = [];
    laps.forEach((row, k) => k > 0 && row.forEach((c) => { if (c && c.l && !c.p && !c.d) ls.push(c.l); }));
    ls.sort((a, b) => a - b);
    const medLap = ls.length ? ls[Math.floor(ls.length / 2)] : 90;
    // Her turun kendi temposu (güvenlik aracı / yağmur turları yavaş): pit kaybı buna göre hesaplanır
    const lapMed = laps.map((row, k) => {
      if (!k) return medLap;
      const v = row.filter((c) => c && c.l && !c.p && !c.d).map((c) => c.l).sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : medLap;
    });
    const cars = [];
    for (let i = 0; i < n; i++) {
      const g = Math.round((laps[0][i].t || 0) / 0.25);
      let dnfLap = null;
      for (let k = 1; k <= L; k++) if (laps[k][i].d) { dnfLap = k; break; }
      const h = ((i * 2654435761) >>> 0) / 4294967296, stopFrac = 0.15 + 0.7 * h;
      const stopTime = dnfLap ? (dnfLap === 1 ? 0 : laps[dnfLap - 1][i].t) + stopFrac * medLap : Infinity;
      cars.push({ g, dnfLap, stopFrac, stopTime, fin: dnfLap ? null : laps[L][i].t, k: 1 });
    }
    const fins = cars.filter((c) => c.fin != null).map((c) => c.fin);
    const endT = (fins.length ? Math.max(...fins) : leaderT[L]) + medLap * 0.15;
    const model = { L, leaderT, medLap, cars, endT };

    function lapAt(rt) { let k = 0; while (k + 1 < leaderT.length && leaderT[k + 1] <= rt) k++; return k; }
    function carPos(i, rt) {
      const c = cars[i];
      if (c.dnfLap && rt >= c.stopTime) return { lap: c.dnfLap, f: c.stopFrac, out: true };
      if (c.fin != null && rt >= c.fin) return { lap: L + 1, f: Math.min(0.1, ((rt - c.fin) / medLap) * 0.5), done: true };
      let k = Math.max(1, Math.min(c.k, L));
      while (k > 1 && laps[k - 1][i].t > rt) k--;
      while (k < L && laps[k][i].t <= rt) k++;
      c.k = k;
      const t0 = k === 1 ? 0 : laps[k - 1][i].t, t1 = laps[k][i].t, T = Math.max(0.001, t1 - t0);
      let f = Math.max(0, (rt - t0) / T);
      if (k === 1) { const g = c.g * 0.0022; f = f * (1 + g) - g; } // grid dizilişi
      const cell = laps[k][i];
      if (cell.p && !cell.d) {
        // Pit turu: normal hızla gelir, pit yolunda kayıp süre kadar bekler
        const loss = Math.max(0, T - lapMed[k]), norm = T - loss, entry = 1 + G.PIT_FROM, tIn = norm * entry, tt = rt - t0;
        if (tt < tIn) f = tt / norm;
        else {
          const rest = T - tIn, u = (tt - tIn) / rest, hold = loss / rest, a = (1 - hold) / 2;
          const v = u < a ? (u / a) * 0.5 : u < a + hold ? 0.5 : 0.5 + ((u - a - hold) / Math.max(0.001, a)) * 0.5;
          const ff = entry + (1 - entry) * v;
          return { lap: k, f: ff, pit: (ff - 1 - G.PIT_FROM) / (G.PIT_TO - G.PIT_FROM) };
        }
      }
      if (k > 1 && laps[k - 1][i].p && f < G.PIT_TO) return { lap: k, f, T, pit: (f - G.PIT_FROM) / (G.PIT_TO - G.PIT_FROM) };
      return { lap: k, f, T };
    }
    // Çizim
    svg.setAttribute("viewBox", G.box.join(" "));
    const [a, b] = G.start, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * 2.6, ny = dx / len * 2.6;
    svg.innerHTML = `<path class="tm-pit" d="${G.pitD}"/><path class="tm-edge" d="${G.d}"/><path class="tm-road" d="${G.d}"/>
      <line class="tm-start" x1="${a[0] - nx}" y1="${a[1] - ny}" x2="${a[0] + nx}" y2="${a[1] + ny}"/><g class="tm-cars"></g>`;
    const road = svg.querySelector(".tm-road"), grp = svg.querySelector(".tm-cars");
    // Takip kamerası: yakın çekimde mesafeler gerçek ölçekte okunur; araçlar ekranda aynı boyda kalır
    const ZOOM = 4.5;
    const tt = (k) => (window.T ? window.T(k) : k);
    const box = G.box, cam = { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2, z: 1 };
    let mode = (() => { try { return localStorage.getItem("pitwall_cam") || "full"; } catch (e) { return "full"; } })();
    let followOK = o.allowFollow !== false; // telefonda ve hızlı oynatmada kapalı
    let camBtn = svg.parentElement && svg.parentElement.querySelector(".tm-cam");
    if (svg.parentElement && !camBtn) {
      camBtn = document.createElement("button");
      camBtn.type = "button"; camBtn.className = "tm-cam";
      svg.parentElement.appendChild(camBtn);
    }
    const camLabel = () => {
      if (!camBtn) return;
      camBtn.classList.toggle("hidden", !followOK);
      camBtn.textContent = mode === "follow" ? "🗺️ " + tt("Tüm pist") : "🎥 " + tt("Takip kamerası");
    };
    if (camBtn) camBtn.onclick = () => {
      mode = mode === "follow" ? "full" : "follow";
      try { localStorage.setItem("pitwall_cam", mode); } catch (e) {}
      camLabel(); jump();
    };
    camLabel();
    let lastDraw = null, jumping = false;
    const scDot = document.createElementNS(SVGNS, "g");
    scDot.setAttribute("class", "tm-sc hidden");
    scDot.innerHTML = `<rect x="-2.6" y="-1.6" width="5.2" height="3.2" rx="0.8"/><text y="1">SC</text>`;
    grp.appendChild(scDot);
    const dots = [];
    let mineNo = 0;
    o.cars.map((c, i) => i).sort((x, y) => (mine.has(x) ? 1 : 0) - (mine.has(y) ? 1 : 0)).forEach((i) => {
      const c = o.cars[i], my = mine.has(i), el = document.createElementNS(SVGNS, "g");
      el.setAttribute("class", "tm-car" + (my ? " mine" : ""));
      el.innerHTML = `<g class="tm-rot"><path class="tm-body" d="${CAR_PATH}" fill="${escX(c.color)}" transform="scale(${my ? 0.78 : 0.56})"/></g>` +
        (my ? (mineNo++ % 2 ? `<text class="tm-label" x="-3" y="4.4" text-anchor="end">` : `<text class="tm-label" x="3" y="-2.6">`) + `${escX(String(c.name).split(" ").slice(-1)[0])}</text>` : "") +
        `<title>${escX(c.name)}${c.team ? " · " + escX(c.team) : ""}</title>`;
      grp.appendChild(el);
      dots[i] = el;
    });
    // Gerçekçi konum: mesafe = süre farkı. Araçlar yarış çizgisinde arka arkaya gider;
    // yalnızca sollama anında (iki araç üst üste geldiğinde) hızlı olan yana çıkıp geçer, sonra çizgiye döner.
    let NEAR = 0.14 / medLap;             // aynı hiza sayılacak fark (tur kesri)
    let LANE_W = 1.55;                    // yana çıkma mesafesi (pist birimi)
    const laneOf = new Array(n).fill(0);
    function assignLanes(P) {
      const live = [];
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.out || p.done || p.pit != null || (p.lap === 1 && p.f < 0.12)) { laneOf[i] = 0; continue; }
        live.push({ i, x: ((p.f % 1) + 1) % 1, T: p.T || 1e9 });
      }
      live.sort((a, b) => b.x - a.x);
      const next = new Array(n).fill(0);
      for (let k = 1; k < live.length; k++) {
        const ahead = live[k - 1], cur = live[k];
        if (ahead.x - cur.x >= NEAR) continue;
        // Üst üste: bu turda daha hızlı olan atak yapıyor ve yana çıkıyor
        const atk = cur.T < ahead.T ? cur : ahead, def = atk === cur ? ahead : cur;
        if (next[atk.i] !== 0) continue;
        const side = laneOf[atk.i] || (next[def.i] === 1 ? -1 : 1); // önceki tarafı koru
        next[atk.i] = next[def.i] === side ? -side : side;
      }
      for (let i = 0; i < n; i++) laneOf[i] = next[i];
    }
    function draw(rt, lapIdx) {
      lastDraw = [rt, lapIdx];
      let lead = null;
      const P = [];
      for (let i = 0; i < n; i++) P.push(carPos(i, rt));
      // Kamera hedefi: benim en öndeki aracım (yoksa lider)
      let tgt = -1, best = -1;
      for (let i = 0; i < n; i++) {
        const p = P[i]; if (p.out || p.done) continue;
        const d = p.lap + p.f, w = (mine.size ? (mine.has(i) ? 1000 : 0) : 0) + d;
        if (w > best) { best = w; tgt = i; }
      }
      const zT = followOK && mode === "follow" && tgt >= 0 ? ZOOM : 1;
      cam.z += (zT - cam.z) * (jumping ? 1 : 0.12);
      const sc = cam.z > 1.02 ? Math.min(0.72, 1.55 / cam.z) : 0.72; // tüm pistte araçlar biraz küçük
      NEAR = 0.14 / medLap; LANE_W = 1.5 * Math.max(0.42, sc); // yalnızca gerçekten aynı hizadayken (≈0,14 sn) yana çıkar
      assignLanes(P);
      for (let i = 0; i < n; i++) {
        const pos = P[i];
        let xy = pos.pit != null ? G.pitAt(Math.max(0, Math.min(1, pos.pit))) : G.at(pos.f);
        const el = dots[i];
        if (pos.pit == null && !pos.out) {
          let target = laneOf[i] * LANE_W;
          if (pos.lap === 1 && pos.f < 0.12) target = (cars[i].g % 2 ? 1 : -1) * 0.95 * (1 - Math.max(0, pos.f) / 0.12); // iki sıralı start
          const cur = el._lat == null ? target : el._lat;
          el._lat = jumping ? target : cur + (target - cur) * 0.14; // yana çıkış/dönüş yumuşak
          if (Math.abs(el._lat) > 0.01) {
            const p0 = G.at(pos.f - 0.002), p1 = G.at(pos.f + 0.002), ddx = p1[0] - p0[0], ddy = p1[1] - p0[1], ln = Math.hypot(ddx, ddy) || 1;
            xy = [xy[0] - (ddy / ln) * el._lat, xy[1] + (ddx / ln) * el._lat];
          }
        } else el._lat = 0;
        el.setAttribute("transform", `translate(${xy[0].toFixed(2)} ${xy[1].toFixed(2)}) scale(${sc.toFixed(3)})`);
        el._xy = xy;
        // Yön: pistin (ya da pit yolunun) o noktadaki doğrultusu
        if (!pos.out || !el._ang) {
          let q0, q1;
          if (pos.pit != null) { const u = Math.max(0, Math.min(1, pos.pit)); q0 = G.pitAt(Math.max(0, u - 0.02)); q1 = G.pitAt(Math.min(1, u + 0.02)); }
          else { q0 = G.at(pos.f - 0.003); q1 = G.at(pos.f + 0.003); }
          el._ang = (Math.atan2(q1[1] - q0[1], q1[0] - q0[0]) * 180) / Math.PI;
          el.firstChild.setAttribute("transform", `rotate(${el._ang.toFixed(1)})`);
        }
        el.classList.toggle("out", !!pos.out);
        el.classList.toggle("in-pit", pos.pit != null);
        if (!pos.out && !pos.done) { const d = pos.lap + pos.f; if (!lead || d > lead.d) lead = { d, f: pos.f }; }
      }
      const k = Math.min((lapIdx || 0) + 1, L), scOn = o.sc && o.sc[k] && lead && rt < endT - medLap * 0.15;
      scDot.classList.toggle("hidden", !scOn);
      if (scOn) { const xy = G.at(lead.f + 0.03 * Math.max(0.45, sc)); scDot.setAttribute("transform", `translate(${xy[0].toFixed(2)} ${xy[1].toFixed(2)}) scale(${sc.toFixed(3)})`); }
      // Kamera: hedef araca yumuşak takip, pist kutusunun dışına taşmadan
      let cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
      if (zT > 1 && tgt >= 0 && dots[tgt]._xy) { cx = dots[tgt]._xy[0]; cy = dots[tgt]._xy[1]; }
      const k2 = jumping ? 1 : cam.z > 1.02 ? 0.14 : 0.25;
      cam.x += (cx - cam.x) * k2; cam.y += (cy - cam.y) * k2;
      const vw = box[2] / cam.z, vh = box[3] / cam.z;
      const vx = Math.max(box[0], Math.min(box[0] + box[2] - vw, cam.x - vw / 2));
      const vy = Math.max(box[1], Math.min(box[1] + box[3] - vh, cam.y - vh / 2));
      svg.setAttribute("viewBox", `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
      const w = o.wx ? o.wx[Math.min(lapIdx || 0, o.wx.length - 1)] || 0 : 0;
      road.setAttribute("class", "tm-road" + (w >= 60 ? " vwet" : w >= 22 ? " wet" : w >= 5 ? " damp" : ""));
    }
    // Atlama (kaydırma çubuğu) sonrası kamerayı anında yerleştir
    function jump() { if (lastDraw) { const [a, b] = lastDraw; jumping = true; draw(a, b); draw(a, b); jumping = false; } }
    function setFollowAllowed(ok) {
      if (followOK === ok) return;
      followOK = ok; camLabel(); jump();
    }
    return { model, lapAt, draw, jump, setFollowAllowed };
  }

  window.PW_TRACKMAP = { get, ids: Object.keys(SHAPES) };
  window.PW_RACEMAP = { create: createRaceMap };
})();
