/* =========================================================
   PitWall Manager — STRATEJİ EDİTÖRÜ (yeniden kullanılabilir)
   PW_Strategy.render(kutu, { track, car, drivers, color, plans, sugg, onChange })
   ========================================================= */
(function () {
  const { COMPOUNDS, MODES } = PW_DATA;
  const E = PW_ENGINE;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function tyreChips(key, sel) {
    return Object.keys(COMPOUNDS).map((k) =>
      `<button class="chip ${sel === k ? "active" : ""}" data-tyre="${key}:${k}"><span class="tyre ${k}">${k}</span>${T(COMPOUNDS[k].name)}</button>`).join("");
  }

  const normalize = (plan, track) => E.normalizePlan(plan, track);

  function render(box, ctx) {
    const { track: tr, car, drivers, color, plans } = ctx;
    box.innerHTML = "";

    drivers.forEach((d, k) => {
      // Öneriler pilota göre değişir (lastik yönetimi iyi olan daha uzun stint yapabilir)
      const sugg = ctx.suggs ? ctx.suggs[k] : ctx.sugg;
      const best = sugg[0].est.time;
      const plan = plans[k];
      const est = E.estimatePlan(tr, car, plan, d);
      const msgs = [];
      if (!est.twoCompounds) msgs.push(`<div class="warn">⚠️ ${T("En az 2 farklı lastik kullanmalısın, yoksa +20 sn ceza alırsın.")}</div>`);
      if (est.maxWear > plan.wearLimit) msgs.push(`<div class="warn">⚠️ ${T("Bir bölümde lastik %{w} aşınacak. Güvenlik sınırın (%{l}) devreye girip seni erken pite sokabilir.", { w: Math.round(est.maxWear), l: plan.wearLimit })}</div>`);
      const diff = est.time - best;
      msgs.push(diff < 1 ? `<div class="ok">✓ ${T("Çok iyi bir plan (en iyi tahmine yakın)")}</div>` : `<div class="warn">${T("Tahmini kayıp: en iyi plana göre +{x} sn", { x: diff.toFixed(1) })}</div>`);

      const card = document.createElement("div");
      card.className = "card plan driver-panel";
      card.style.borderLeftColor = color;
      card.innerHTML = `
        <h2>${(window.PW_FLAGS && window.PW_FLAGS[d.nationality]) || ""} ${esc(d.name)} <span class="muted small">${d.age ? T("{n} yaş", { n: d.age }) + " · " : ""}${T("Genel")} ${PW_DATA.driverOverall(d)}</span></h2>
        ${d.pace != null ? `<div class="small muted">${Object.entries(PW_DATA.DRIVER_ATTRS).map(([a, info]) => `${T(info.name)} <b style="color:var(--text)">${d[a]}</b>`).join(" · ")}</div>` : ""}
        <div class="dp-label">${T("Başlangıç lastiği")}</div>
        <div class="row">${tyreChips("start", plan.start)}</div>

        <div class="dp-label">${T("Pit stoplar")}</div>
        ${plan.stops.map((s, j) => `
          <div class="stop-row">
            <b>${j + 1}. pit:</b> ${T("Tur")} <input type="number" data-stoplap="${j}" min="1" max="${tr.laps - 1}" value="${s.lap}"> ${T("sonunda")} →
            ${tyreChips("stop" + j, s.tyre)}
            <button class="x-btn" data-del="${j}" title="${T("Sil")}">✕</button>
          </div>`).join("")}
        ${plan.stops.length < 3 ? `<button class="chip" data-add="1">${T("+ Pit stop ekle")}</button>` : ""}

        <div class="dp-label">${T("Plan önizleme")}</div>
        <div class="stints">${est.stints.map((s) => `<div class="stint ${s.tyre}" style="flex:${Math.max(1, s.laps)}">${s.tyre} · ${s.laps}</div>`).join("")}</div>
        <div class="stint-notes">${est.stints.map((s) => `${T(COMPOUNDS[s.tyre].name)}: ${T("{n} tur", { n: s.laps })} → ${T("aşınma")} ~%${Math.round(s.endWear)}`).join(" · ")}</div>
        ${msgs.join("")}

        <div class="dp-label">${T("Sürüş modu")}</div>
        <div class="row">${Object.entries(MODES).map(([m, info]) => `<button class="chip ${plan.mode === m ? "active" : ""}" data-mode="${m}">${T(info.name)}</button>`).join("")}</div>
        <label class="small" style="display:block;margin-top:8px"><input type="checkbox" data-pushend ${plan.pushEnd ? "checked" : ""}> ${T("Son 8 turda atak yap (lastik izin verirse)")}</label>

        <div class="dp-label">${T("Lastik güvenlik sınırı: aşınma bu değere ulaşırsa erken pite gir")}</div>
        <div class="row">${[75, 85, 95].map((v) => `<button class="chip ${plan.wearLimit === v ? "active" : ""}" data-limit="${v}">%${v}</button>`).join("")}</div>

        <div class="dp-label">${T("Mühendislerin önerileri")}</div>
        <div class="sugg">${sugg.map((o, i) => `
          <button class="chip" data-sugg="${i}">
            <span><b>${o.label}</b> · pit: ${T("tur")} ${o.plan.stops.map((s) => s.lap).join(", ")}</span>
            <span class="muted">${i === 0 ? T("en hızlı tahmin") : "+" + (o.est.time - best).toFixed(1) + " " + T("sn")}</span>
          </button>`).join("")}</div>`;

      const rerender = () => { if (ctx.onChange) ctx.onChange(); render(box, ctx); };
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
          plan.stops.push({ lap: Math.min(tr.laps - 1, Math.round((last + tr.laps) / 2)), tyre: plan.start === "H" ? "M" : "H" });
        } else if (b.dataset.mode) {
          plan.mode = b.dataset.mode;
        } else if (b.dataset.limit) {
          plan.wearLimit = +b.dataset.limit;
        } else if (b.dataset.sugg) {
          plans[k] = clone(sugg[+b.dataset.sugg].plan);
        } else return;
        rerender();
      });
      card.addEventListener("change", (ev) => {
        const el = ev.target;
        if (el.dataset.stoplap) {
          plan.stops[+el.dataset.stoplap].lap = Math.max(1, Math.min(tr.laps - 1, Math.round(+el.value || 1)));
          plan.stops.sort((a, b) => a.lap - b.lap);
        } else if (el.hasAttribute("data-pushend")) {
          plan.pushEnd = el.checked;
        }
        rerender();
      });
      box.appendChild(card);
    });
  }

  window.PW_Strategy = { render, normalize };
})();
