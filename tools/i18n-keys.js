// Çevrilecek bütün metinleri bulur ve sözlükte eksik olanları listeler: node tools/i18n-keys.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const files = ["online.js", "ui/api.js", "ui/replay.js", "ui/strategy.js"];
const keys = new Set();
// T("...") çağrıları (ternary içindekiler dahil: T(a ? "x" : "y"))
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  for (const m of src.matchAll(/\bT\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    for (const s of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s[1]) && !/^(login|player|tr|en)$/.test(s[1])) keys.add(s[1]);
    }
  }
}
// api.js içindeki Türkçe hata mesajları ve veritabanından gelen hata mesajları
for (const m of fs.readFileSync(path.join(root, "ui/api.js"), "utf8").matchAll(/\],?\s*"((?:[^"\\]|\\.)*)"\]/g)) keys.add(m[1]);
for (const f of fs.readdirSync(path.join(root, "supabase")).filter((x) => x.endsWith(".sql")))
  for (const m of fs.readFileSync(path.join(root, "supabase", f), "utf8").matchAll(/raise exception '((?:[^']|'')*)'/g)) keys.add(m[1].replace(/''/g, "'"));
// Veri isimleri
require(path.join(root, "shared/data.js"));
const D = globalThis.PW_DATA;
[D.COMPOUNDS, D.MODES, D.PARTS, D.TRACK_TYPES, D.DRIVER_ATTRS].forEach((o) => Object.values(o).forEach((v) => { keys.add(v.name); if (v.desc) keys.add(v.desc); }));
// index.html metinleri (etiketler arasındaki düz metinler)
let html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
html = html.replace(/<(\w+)([^>]*data-i18n-html[^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, attrs, inner) => { keys.add(inner.replace(/\s+/g, " ").trim()); return ""; });
for (const m of html.matchAll(/>([^<>]+)</g)) { const t = m[1].replace(/\s+/g, " ").trim(); if (/[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(t)) keys.add(t); }
for (const m of html.matchAll(/placeholder="([^"]+)"/g)) keys.add(m[1]);
const out = [...keys].sort();
if (process.argv[2] === "--check") {
  globalThis.window = globalThis; globalThis.localStorage = { getItem: () => "en", setItem() {} }; globalThis.navigator = { language: "en" };
  require(path.join(root, "ui/i18n.js"));
  const missing = out.filter((k) => !(k in globalThis.PW_I18N.EN) && !globalThis.PW_I18N.matchPattern(k));
  console.log("Toplam:", out.length, "· Eksik:", missing.length);
  missing.forEach((k) => console.log(JSON.stringify(k)));
} else { console.log(out.length); out.forEach((k) => console.log(JSON.stringify(k))); }
