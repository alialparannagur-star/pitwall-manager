// Sunucu fonksiyonunu tek dosyada birleştirir: node tools/build-edge.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const out = [
  "// @ts-nocheck",
  "// =====================================================================",
  "// PitWall Manager — run-races (OTOMATİK OLUŞTURULDU, elle düzenleme)",
  "// Kaynak: shared/data.js + shared/engine.js + server/runner.js + server/webpush.js + server/notify.js + server/edge-entry.ts",
  "// Yeniden oluşturmak için: node tools/build-edge.js",
  "// =====================================================================",
  read("server/edge-entry.ts").split("\n").filter((l) => l.startsWith("import ")).join("\n"),
  read("shared/data.js"), read("shared/engine.js"), read("server/runner.js"),
  // İngilizce pist adlarını arayüz çevirisinden al
  "globalThis.PW_TRACK_EN = " + read("ui/i18n.js").match(/const TRACK_EN = (\{[\s\S]*?\});/)[1] + ";",
  read("server/webpush.js"), read("server/notify.js"),
  read("server/edge-entry.ts").split("\n").filter((l) => !l.startsWith("import ")).join("\n"),
].join("\n");
const dir = path.join(root, "supabase/functions/run-races");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "index.ts"), out);
console.log("Oluşturuldu:", path.join(dir, "index.ts"), (out.length / 1024).toFixed(1) + " KB");
