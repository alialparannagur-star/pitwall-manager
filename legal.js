/* Yasal sayfalar için küçük yardımcı: tema, dil ve kimlik bilgilerini doldurur */
(function () {
  var L = window.PW_LEGAL || {};
  var lang = "tr";
  try {
    var saved = localStorage.getItem("pitwall_lang");
    lang = saved === "en" || saved === "tr" ? saved
      : ((navigator.language || "").toLowerCase().indexOf("tr") === 0 ? "tr" : "en");
  } catch (e) {}
  var q = /[?&]lang=(tr|en)/.exec(location.search);
  if (q) lang = q[1];

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-lang]").forEach(function (el) { el.hidden = el.getAttribute("data-lang") !== lang; });
    document.querySelectorAll("[data-legal]").forEach(function (el) {
      var k = el.getAttribute("data-legal");
      var v = k === "updated" && lang === "en" ? L.updatedEn : L[k];
      if (v == null) return;
      if (k === "email") { el.textContent = v; if (/@/.test(v)) el.href = "mailto:" + v; }
      else el.textContent = v;
    });
    var b = document.getElementById("langSwitch");
    if (b) b.textContent = lang === "tr" ? "🌐 English" : "🌐 Türkçe";
    document.title = (lang === "tr" ? document.body.getAttribute("data-title-tr") : document.body.getAttribute("data-title-en")) + " · PitWall Manager";
  }
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("langSwitch");
    if (b) b.onclick = function () { lang = lang === "tr" ? "en" : "tr"; try { localStorage.setItem("pitwall_lang", lang); } catch (e) {} apply(); };
    apply();
  });
})();
