/* =========================================================
   Yeni oyuncu rehberi: ekrandaki öğeleri sırayla vurgulayıp anlatır.
   PW_Tour.start(steps, { onDone }) — her adım: { el, title, text, action? }
   el: CSS seçici, öğe, öğe dizisi ya da bunları döndüren fonksiyon. Boşsa ekranın ortasında gösterilir.
   ========================================================= */
(function () {
  let box = null, spot = null, steps = [], idx = 0, opts = {};

  const resolve = (el) => {
    if (typeof el === "function") el = el();
    if (typeof el === "string") el = document.querySelector(el);
    const list = (Array.isArray(el) ? el : [el]).filter((x) => x && x.getClientRects().length && getComputedStyle(x).visibility !== "hidden");
    return list.length ? list : null;
  };
  const unionRect = (els) => {
    const rs = els.map((e) => e.getBoundingClientRect());
    const r = { top: Math.min(...rs.map((x) => x.top)), left: Math.min(...rs.map((x) => x.left)), bottom: Math.max(...rs.map((x) => x.bottom)), right: Math.max(...rs.map((x) => x.right)) };
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    return r;
  };

  function build() {
    spot = document.createElement("div");
    spot.className = "tour-spot";
    box = document.createElement("div");
    box.className = "tour-box card";
    box.setAttribute("role", "dialog");
    document.body.appendChild(spot);
    document.body.appendChild(box);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (!box) return;
    if (e.key === "Escape") end(true);
    else if (e.key === "ArrowRight" || e.key === "Enter") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  }

  function render() {
    const s = steps[idx];
    const last = idx === steps.length - 1;
    box.innerHTML = `
      <div class="tour-count">${idx + 1} / ${steps.length}</div>
      ${s.title ? `<h3>${s.title}</h3>` : ""}
      <p>${s.text}</p>
      <div class="tour-btns">
        ${last ? "" : `<button class="btn ghost small-btn" data-t="skip">${T("Rehberi geç")}</button>`}
        <span style="flex:1"></span>
        ${idx > 0 ? `<button class="btn small-btn" data-t="prev">← ${T("Geri")}</button>` : ""}
        <button class="btn primary small-btn" data-t="next">${last ? (s.doneLabel || T("Başlayalım! 🏁")) : T("İleri") + " →"}</button>
      </div>`;
    box.querySelector('[data-t="next"]').onclick = () => go(1);
    const p = box.querySelector('[data-t="prev"]'); if (p) p.onclick = () => go(-1);
    const k = box.querySelector('[data-t="skip"]'); if (k) k.onclick = () => end(true);
    const els = resolve(s.el);
    if (els) els[0].scrollIntoView({ block: "center" });
    place();
    box.querySelector('[data-t="next"]').focus();
  }

  function place() {
    if (!box) return;
    const s = steps[idx];
    const els = resolve(s.el);
    const pad = 8, vw = innerWidth, vh = innerHeight;
    box.style.maxWidth = Math.min(380, vw - 24) + "px";
    if (!els) {
      spot.style.cssText = "top:50%;left:50%;width:0;height:0;";
      box.style.left = Math.max(12, (vw - box.offsetWidth) / 2) + "px";
      box.style.top = Math.max(12, (vh - box.offsetHeight) / 2) + "px";
      return;
    }
    const r = unionRect(els);
    spot.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let top = r.bottom + pad + 12;
    if (top + bh > vh - 12) top = r.top - pad - 12 - bh;          // altta yer yoksa üstte
    if (top < 12) top = Math.min(vh - bh - 12, Math.max(12, r.top + 12)); // ikisi de olmuyorsa öğenin üstüne bindir
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(12, Math.min(vw - bw - 12, left));
    box.style.top = top + "px";
    box.style.left = left + "px";
  }

  function go(d) {
    const s = steps[idx];
    if (d > 0 && idx === steps.length - 1) { end(false); if (s.action) s.action(); return; }
    idx = Math.max(0, Math.min(steps.length - 1, idx + d));
    // Görünmeyen öğesi olan adımları atla (son adım hariç)
    let guard = steps.length;
    while (guard-- > 0 && steps[idx].el && !resolve(steps[idx].el) && idx > 0 && idx < steps.length - 1) idx += d > 0 ? 1 : -1;
    render();
  }

  function end(skipped) {
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
    if (box) box.remove();
    if (spot) spot.remove();
    box = spot = null;
    if (opts.onDone) opts.onDone(skipped);
  }

  window.PW_Tour = {
    start(list, o) {
      if (box) end(true);
      steps = list; idx = 0; opts = o || {};
      build();
      render();
    },
    active: () => !!box,
  };
})();
