/* =========================================================
   PitWall Manager — OYUN VERİLERİ (ortak dosya)
   Bu dosya hem tarayıcıda hem sunucuda kullanılacak.
   ========================================================= */
(function (g) {
  // Lastikler: offset = tur süresine etkisi (eksi = hızlı), wear = tur başına aşınma (%)
  const COMPOUNDS = {
    S: { name: "Yumuşak", offset: -0.5, wear: 5.2 },
    M: { name: "Orta",    offset: -0.22, wear: 3.2 },
    H: { name: "Sert",    offset:  0.0, wear: 2.2 },
  };

  // Sürüş modları
  const MODES = {
    push:   { name: "Atak",   pace: -0.35, wear: 1.45 },
    normal: { name: "Normal", pace:  0,    wear: 1.0 },
    save:   { name: "Koru",   pace:  0.45, wear: 0.6 },
  };

  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  // Araç parçaları (garajda geliştirilir)
  const PARTS = {
    engine:      { name: "Motor",        desc: "Düz hız. Hızlı pistlerde daha etkili." },
    aero:        { name: "Aerodinamik",  desc: "Viraj hızı. Teknik pistlerde daha etkili." },
    chassis:     { name: "Şasi",         desc: "Genel hız ve daha az lastik aşınması." },
    reliability: { name: "Güvenilirlik", desc: "Mekanik arıza riskini azaltır." },
    pitcrew:     { name: "Pit ekibi",    desc: "Daha hızlı ve hatasız pit stop." },
  };

  // Pilot özellikleri (her yarıştan sonra gelişim puanı kazanılır)
  const DRIVER_ATTRS = {
    pace:        { name: "Hız",              desc: "Tur süresi. En önemli özellik." },
    racecraft:   { name: "Sollama/Savunma",  desc: "Sollama yapma ve pozisyon koruma başarısı." },
    tyres:       { name: "Lastik yönetimi",  desc: "Lastiği daha az aşındırır, daha uzun stint." },
    consistency: { name: "İstikrar",         desc: "Daha az hata ve daha düzenli turlar." },
  };
  // Bir özelliği +1 yapmanın puan bedeli (yükseldikçe pahalanır)
  function trainCost(v) { return v < 60 ? 1 : v < 70 ? 2 : v < 80 ? 3 : v < 90 ? 4 : 5; }
  // Yarış sonrası kazanılan gelişim puanı: her yarış 1, ilk 10 +1, podyum +1
  function devPointsFor(pos, dnf) { return 1 + (dnf ? 0 : (pos <= 10 ? 1 : 0) + (pos <= 3 ? 1 : 0)); }
  // Piyasa değeri ve maaş (veritabanındaki driver_value ile birebir aynı)
  function driverValue(skill, pot, age) {
    const s = skill == null ? 50 : skill, p = pot == null ? s : pot, a = age == null ? 25 : age;
    const ageF = a <= 22 ? 1.2 : a <= 29 ? 1.0 : a <= 35 ? 0.8 : 0.5;
    const potF = a <= 22 ? 2 : a <= 26 ? 1.3 : 0.6;
    return Math.round((15000 * Math.pow(Math.max(s - 35, 1), 1.8) * ageF + 60000 * Math.max(p - s, 0) * potF) / 10000) * 10000;
  }
  const driverSalary = (skill, pot, age) => Math.round(driverValue(skill, pot, age) * 0.02 / 1000) * 1000;
  const MARKET = { botMarkup: 1.3, refundRate: 0.5, maxTransfers: 4 };
  const driverOverall = (d) => Math.round(((d.pace ?? d.skill) + (d.racecraft ?? d.skill) + (d.tyres ?? d.skill) + (d.consistency ?? d.skill)) / 4);

  // Ekonomi
  const ECONOMY = {
    startMoney: 2000000,
    baseStat: 50,              // yeni araç parçaları ve pilot ortalaması
    upgradeBaseCost: 1000000,  // ilk geliştirmenin fiyatı
    upgradeGrowth: 1.5,        // her seviye bir öncekinden %50 pahalı
    statMax: 99,
    prizeBase: 300000,         // yarışa katılan herkese
    prizePerPoint: 50000,      // kazanılan her puan için
    catchUpPerRank: 100000,    // şampiyonada geride olan takımlara destek
  };

  // Zirveye yaklaştıkça geliştirme etkisi azalır (70 altı +3, 85 altı +2, üstü +1)
  function upgradeGain(stat) { return stat < 70 ? 3 : stat < 85 ? 2 : 1; }

  function upgradeCost(level) {
    return Math.round(ECONOMY.upgradeBaseCost * Math.pow(ECONOMY.upgradeGrowth, level) / 10000) * 10000;
  }

  // standingRank: takımın şampiyonadaki sırası (1 = lider)
  function prizeFor(points, standingRank) {
    return ECONOMY.prizeBase + points * ECONOMY.prizePerPoint + (standingRank - 1) * ECONOMY.catchUpPerRank;
  }

  // Pist tipleri: hangi parçanın ne kadar önemli olduğu
  const TRACK_TYPES = {
    power:     { name: "Hızlı",   w: { engine: 0.50, aero: 0.25, chassis: 0.25 } },
    balanced:  { name: "Dengeli", w: { engine: 0.34, aero: 0.33, chassis: 0.33 } },
    technical: { name: "Teknik",  w: { engine: 0.20, aero: 0.45, chassis: 0.35 } },
  };

  // 25 yarışlık takvim. overtake: sollama kolaylığı (1 = normal, 0.3 = neredeyse imkânsız)
  const TRACKS = [
    { id: "bhr", name: "Bahreyn GP",         flag: "🇧🇭", type: "balanced",  laps: 57, baseLap: 94,  pitLoss: 22, degMult: 1.20, overtake: 1.1 },
    { id: "sau", name: "Suudi Arabistan GP", flag: "🇸🇦", type: "power",     laps: 50, baseLap: 90,  pitLoss: 21, degMult: 0.85, overtake: 1.0 },
    { id: "aus", name: "Avustralya GP",      flag: "🇦🇺", type: "balanced",  laps: 58, baseLap: 80,  pitLoss: 19, degMult: 0.95, overtake: 0.9 },
    { id: "jpn", name: "Japonya GP",         flag: "🇯🇵", type: "technical", laps: 53, baseLap: 92,  pitLoss: 22, degMult: 1.15, overtake: 0.8 },
    { id: "chn", name: "Çin GP",             flag: "🇨🇳", type: "balanced",  laps: 56, baseLap: 95,  pitLoss: 23, degMult: 1.05, overtake: 1.1 },
    { id: "mia", name: "Miami GP",           flag: "🇺🇸", type: "balanced",  laps: 57, baseLap: 90,  pitLoss: 20, degMult: 1.00, overtake: 0.9 },
    { id: "imo", name: "İmola GP",           flag: "🇮🇹", type: "technical", laps: 63, baseLap: 78,  pitLoss: 27, degMult: 0.90, overtake: 0.6 },
    { id: "mon", name: "Monako GP",          flag: "🇲🇨", type: "technical", laps: 78, baseLap: 74,  pitLoss: 20, degMult: 0.70, overtake: 0.3 },
    { id: "can", name: "Kanada GP",          flag: "🇨🇦", type: "power",     laps: 70, baseLap: 75,  pitLoss: 19, degMult: 0.95, overtake: 1.2 },
    { id: "esp", name: "İspanya GP",         flag: "🇪🇸", type: "technical", laps: 66, baseLap: 78,  pitLoss: 21, degMult: 1.20, overtake: 0.8 },
    { id: "aut", name: "Avusturya GP",       flag: "🇦🇹", type: "power",     laps: 71, baseLap: 67,  pitLoss: 20, degMult: 1.00, overtake: 1.2 },
    { id: "gbr", name: "Britanya GP",        flag: "🇬🇧", type: "balanced",  laps: 52, baseLap: 89,  pitLoss: 20, degMult: 1.10, overtake: 1.0 },
    { id: "hun", name: "Macaristan GP",      flag: "🇭🇺", type: "technical", laps: 70, baseLap: 79,  pitLoss: 20, degMult: 1.05, overtake: 0.6 },
    { id: "bel", name: "Belçika GP",         flag: "🇧🇪", type: "power",     laps: 44, baseLap: 106, pitLoss: 21, degMult: 1.00, overtake: 1.2 },
    { id: "ned", name: "Hollanda GP",        flag: "🇳🇱", type: "technical", laps: 72, baseLap: 73,  pitLoss: 21, degMult: 1.00, overtake: 0.6 },
    { id: "ita", name: "İtalya GP",          flag: "🇮🇹", type: "power",     laps: 53, baseLap: 82,  pitLoss: 24, degMult: 0.80, overtake: 1.2 },
    { id: "aze", name: "Azerbaycan GP",      flag: "🇦🇿", type: "power",     laps: 51, baseLap: 104, pitLoss: 20, degMult: 0.85, overtake: 1.1 },
    { id: "sgp", name: "Singapur GP",        flag: "🇸🇬", type: "technical", laps: 62, baseLap: 95,  pitLoss: 28, degMult: 1.00, overtake: 0.6 },
    { id: "tur", name: "İstanbul GP",        flag: "🇹🇷", type: "balanced",  laps: 58, baseLap: 88,  pitLoss: 21, degMult: 1.00, overtake: 1.0 },
    { id: "usa", name: "ABD GP",             flag: "🇺🇸", type: "balanced",  laps: 56, baseLap: 97,  pitLoss: 21, degMult: 1.10, overtake: 1.0 },
    { id: "mex", name: "Meksika GP",         flag: "🇲🇽", type: "power",     laps: 71, baseLap: 79,  pitLoss: 22, degMult: 0.85, overtake: 0.9 },
    { id: "bra", name: "Brezilya GP",        flag: "🇧🇷", type: "balanced",  laps: 71, baseLap: 72,  pitLoss: 21, degMult: 0.95, overtake: 1.1 },
    { id: "lvg", name: "Las Vegas GP",       flag: "🇺🇸", type: "power",     laps: 50, baseLap: 95,  pitLoss: 21, degMult: 0.80, overtake: 1.1 },
    { id: "qat", name: "Katar GP",           flag: "🇶🇦", type: "balanced",  laps: 57, baseLap: 84,  pitLoss: 25, degMult: 1.25, overtake: 0.9 },
    { id: "abu", name: "Abu Dabi GP",        flag: "🇦🇪", type: "balanced",  laps: 58, baseLap: 87,  pitLoss: 22, degMult: 0.90, overtake: 0.9 },
  ];

  // Deneme ligi: 11 takım, 22 pilot (online sürümde her ülke ligi bu yapıda olacak)
  const c = (engine, aero, chassis, reliability, pitcrew) => ({ engine, aero, chassis, reliability, pitcrew });
  const DEMO_TEAMS = [
    { id: "volt",     name: "Volt Racing",        color: "#3b5bdb", car: c(94, 96, 94, 88, 92), drivers: [{ id: "volt-1", name: "Erik Vandermeer", skill: 94 }, { id: "volt-2", name: "Tomás Ribeiro", skill: 83 }] },
    { id: "arancia",  name: "Arancia Motorsport", color: "#f76707", car: c(93, 95, 93, 90, 88), drivers: [{ id: "arancia-1", name: "Callum Hayes", skill: 92 }, { id: "arancia-2", name: "Noah Whitfield", skill: 88 }] },
    { id: "rosso",    name: "Rosso Veloce",       color: "#e03131", car: c(95, 91, 92, 86, 85), drivers: [{ id: "rosso-1", name: "Luca Ferraro", skill: 91 }, { id: "rosso-2", name: "Julien Moreau", skill: 89 }] },
    { id: "argento",  name: "Argento GP",         color: "#adb5bd", car: c(93, 89, 91, 92, 90), drivers: [{ id: "argento-1", name: "Henrik Lund", skill: 90 }, { id: "argento-2", name: "Mateo Rossi", skill: 84 }] },
    { id: "verde",    name: "Verde Atlas",        color: "#2b8a3e", car: c(86, 87, 85, 84, 82), drivers: [{ id: "verde-1", name: "Rafael Castillo", skill: 88 }, { id: "verde-2", name: "Ethan Brooks", skill: 79 }] },
    { id: "alpen",    name: "Alpen Blau",         color: "#4dabf7", car: c(85, 83, 84, 82, 84), drivers: [{ id: "alpen-1", name: "Pierre Duval", skill: 85 }, { id: "alpen-2", name: "Kenji Morita", skill: 82 }] },
    { id: "bogazici", name: "Boğaziçi Racing",    color: "#12b886", car: c(83, 84, 82, 83, 83), drivers: [{ id: "bogazici-1", name: "Emre Aydın", skill: 84 }, { id: "bogazici-2", name: "Can Özkan", skill: 81 }] },
    { id: "nordwind", name: "Nordwind GP",        color: "#845ef7", car: c(84, 80, 81, 80, 80), drivers: [{ id: "nordwind-1", name: "Lars Eklund", skill: 82 }, { id: "nordwind-2", name: "Yuki Tanabe", skill: 80 }] },
    { id: "phoenix",  name: "Phoenix Racing",     color: "#fab005", car: c(80, 79, 79, 78, 80), drivers: [{ id: "phoenix-1", name: "Marcus Webb", skill: 81 }, { id: "phoenix-2", name: "Daniel Okafor", skill: 78 }] },
    { id: "condor",   name: "Condor Racing",      color: "#c2774a", car: c(79, 78, 78, 80, 77), drivers: [{ id: "condor-1", name: "Diego Herrera", skill: 80 }, { id: "condor-2", name: "Oliver Grant", skill: 77 }] },
    { id: "sakura",   name: "Sakura Racing",      color: "#f06595", car: c(76, 78, 77, 76, 78), drivers: [{ id: "sakura-1", name: "Haruto Sato", skill: 79 }, { id: "sakura-2", name: "Felix Brandt", skill: 76 }] },
  ];

  g.PW_DATA = { COMPOUNDS, MODES, POINTS, PARTS, ECONOMY, TRACK_TYPES, TRACKS, DEMO_TEAMS, upgradeCost, upgradeGain, prizeFor, DRIVER_ATTRS, trainCost, devPointsFor, driverOverall, driverValue, driverSalary, MARKET };
})(typeof globalThis !== "undefined" ? globalThis : window);
