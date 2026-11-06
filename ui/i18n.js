/* =========================================================
   PitWall Manager — DİL DESTEĞİ (Türkçe / English)
   Kodda metinler Türkçe yazılır ve T("...") ile sarılır.
   İngilizce seçiliyse aşağıdaki EN sözlüğünden karşılığı gelir.
   Yeni bir metin eklersen EN sözlüğüne de bir satır ekle.
   Eksikleri bulmak için: node tools/i18n-keys.js --check
   ========================================================= */
(function (g) {
  const LS_KEY = "pitwall_lang";
  let lang = "tr";
  try {
    const saved = g.localStorage && g.localStorage.getItem(LS_KEY);
    lang = saved || ((g.navigator && (g.navigator.language || "")).toLowerCase().startsWith("tr") ? "tr" : "en");
  } catch (e) { lang = "en"; }

  /* ---------- Sözlük: Türkçe → English ---------- */
  const EN = {
    // Genel
    "PitWall Manager": "PitWall Manager", "PITWALL": "PITWALL", "MANAGER": "MANAGER",
    "🏠 Merkez": "🏠 Home", "🌍 Ligler": "🌍 Leagues", "🏆 Dünya": "🏆 World", "🔄 Pazar": "🔄 Market", "Pazar": "Market",
    "Çevrimiçi yarış menajerliği": "Online racing manager",
    "Yarışı sen": "Win the race",
    "pit duvarından": "from the pit wall",
    "kazan.": "yourself.",
    "Ülkenin liginde bir yarış takımını devral. Pilotlarını geliştir, aracını yükselt, her yarıştan önce lastik ve pit stratejini kur. Sonra yarışı tur tur izle.": "Take over a racing team in your country's league. Develop your drivers, upgrade your car and set your tyre and pit strategy before every race. Then watch it unfold lap by lap.",
    "Ücretsiz kayıt ol": "Sign up free",
    "CANLI": "LIVE",
    "Tur 34 / 57": "Lap 34 / 57",
    "takım, her ülkede bir lig": "teams in every country's league",
    "pilot, hepsi gelişiyor": "drivers, all developing",
    "yarışlık sezon, her gün bir yarış": "race season, one race a day",
    "ülke, sonunda dünya finali": "countries, then a world final",
    "Nasıl oynanır?": "How it works",
    "Takımını devral": "Take over a team",
    "Ülkeni seç, ligdeki boş bir takımın başına geç. Boş takımları botlar yönetir, sen geldikçe onların yerini oyuncular alır.": "Pick your country and take charge of a free team in its league. Bots run the empty teams until players take their place.",
    "Stratejini kur": "Set your strategy",
    "Her pilot için başlangıç lastiği, pit turları ve sürüş modu. Pistin aşınmasına ve sollama zorluğuna göre plan yap.": "Starting tyre, pit laps and driving mode for each driver. Plan around the track's tyre wear and how hard it is to overtake.",
    "Yarışı izle": "Watch the race",
    "Yarışlar her gün belli saatte otomatik koşulur. Sollamaları, pit stoplarını ve hataları tur tur tekrar izle.": "Races run automatically at a set time every day. Replay the overtakes, pit stops and mistakes lap by lap.",
    "Büyü ve şampiyon ol": "Grow and win titles",
    "Ödül parasıyla aracını geliştir, pilotlarını eğit, transfer yap. Ligini kazan, dünya turnuvasına katıl.": "Use prize money to upgrade your car, train your drivers and make transfers. Win your league and enter the world tournament.",
    "Pit duvarı seni bekliyor": "The pit wall is waiting",
    "Kayıt ücretsiz, bir dakika sürer. Sadece e-posta ve şifre yeterli.": "Signing up is free and takes a minute. All you need is an email and a password.",
    "Kayıt alındı! E-postana gelen bağlantıya tıklayarak hesabını onayla. Bağlantı seni doğrudan oyuna getirecek. E-posta gelmezse spam klasörüne bak.": "You're signed up! Click the link we emailed you to confirm your account. It will take you straight into the game. If the email doesn't arrive, check your spam folder.",
    "Şifremi unuttum": "Forgot my password",
    "Onay e-postasını tekrar gönder": "Resend confirmation email",
    "E-posta adresini yaz, sana yeni şifre belirleyebileceğin bir bağlantı gönderelim.": "Enter your email and we'll send you a link to set a new password.",
    "Bağlantıyı gönder": "Send link",
    "Yeni şifre belirle": "Set a new password",
    "Hesabın için yeni bir şifre seç. En az 6 karakter.": "Choose a new password for your account. At least 6 characters.",
    "Yeni şifre": "New password",
    "Yeni şifre (tekrar)": "New password (again)",
    "Şifreyi kaydet": "Save password",
    "Bu bağlantının süresi dolmuş ya da daha önce kullanılmış. Yeniden iste.": "This link has expired or was already used. Request a new one.",
    "Bağlantı geçersiz. Yeniden iste.": "This link is invalid. Request a new one.",
    "Onay e-postası tekrar gönderildi. Spam klasörüne de bak.": "Confirmation email sent again. Check your spam folder too.",
    "Bu adresle bir hesap varsa sıfırlama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.": "If an account exists for this address, a reset link has been sent. Check your inbox and spam folder.",
    "İki şifre aynı değil.": "The two passwords don't match.",
    "Şifren değişti.": "Your password has been changed.",
    "Yeni şifre eskisiyle aynı olamaz.": "The new password can't be the same as the old one.",
    "Bağlantının süresi dolmuş. Şifre sıfırlamayı yeniden iste.": "The link has expired. Request a new password reset.",
    "E-posta gönderilemedi. Biraz sonra tekrar dene.": "The email couldn't be sent. Try again in a little while.",
    "Geri bildirim": "Feedback",
    "Bir hata mı buldun, aklına bir fikir mi geldi? Yaz, doğrudan geliştiriciye gider.": "Found a bug or have an idea? Write it here and it goes straight to the developer.",
    "🐞 Hata": "🐞 Bug",
    "💡 Öneri": "💡 Idea",
    "💬 Diğer": "💬 Other",
    "💬 Geri bildirim": "💬 Feedback",
    "Ne oldu? Hangi ekrandaydın, ne yapınca oldu?": "What happened? Which screen were you on and what did you do?",
    "Oyuna ne eklenmeli ya da ne değişmeli?": "What should be added or changed in the game?",
    "Aklındakini yaz.": "Tell us what's on your mind.",
    "Gönder": "Send",
    "Mesaj çok kısa.": "The message is too short.",
    "Teşekkürler! Mesajın ulaştı.": "Thanks! Your message was sent.",
    "Önce giriş yapmalısın.": "You need to log in first.",
    "Bugünlük mesaj sınırına ulaştın (10). Yarın tekrar yazabilirsin.": "You've reached today's message limit (10). You can write again tomorrow.",
    "Ara": "Inter",
    "Yağmur": "Wet",
    "Erken": "Early",
    "Geç": "Late",
    "Kuru hava bekleniyor": "Dry weather expected",
    "yarış ıslak başlayabilir": "the race may start wet",
    "en olası: {a}.–{b}. turlar": "most likely laps {a}–{b}",
    "Yağmur ihtimali": "Chance of rain",
    "şiddetli": "heavy",
    "hafif": "light",
    "Yağmur gelirse: ara ve yağmur lastiğine ne zaman geçilsin?": "If it rains: when should we switch to intermediates and wets?",
    "Erken: ilk damlalarda ara lastiğe geçer, pist kururken kaygan lastiğe de erken döner. Yağmur gerçekten gelirse kazandırır; sadece çiseleyip geçerse boşa pit stop yapmış olursun.": "Early: switches to intermediates at the first drops and back to slicks early as the track dries. Pays off if the rain really comes; if it only drizzles, you'll have made a wasted pit stop.",
    "Normal: pist belirgin şekilde ıslanınca geçer. Çoğu durumda güvenli orta yol.": "Normal: switches once the track is clearly wet. The safe middle ground most of the time.",
    "Geç: kaygan lastikle olabildiğince dayanır. Kısa ve hafif yağmurda zaman kazandırır; yağmur şiddetlenirse kayıp ve kaza riski artar.": "Late: stays on slicks as long as possible. Gains time in short, light showers; if the rain gets heavy, you lose time and the crash risk rises.",
    "Tahmin her zaman tutmaz. Yağmur gelirse mühendislerin seçtiğin tepkiye göre lastik değiştirir.": "Forecasts aren't always right. If it rains, your engineers change tyres according to the reaction you choose.",
    "Kuru": "Dry",
    "Nemli": "Damp",
    "Islak": "Wet",
    "Çok ıslak": "Very wet",
    "Yağmur tepkisi": "Rain reaction",
    "Çıkış": "Log out", "Açık temaya geç": "Switch to light theme", "Koyu temaya geç": "Switch to dark theme", "Yükleniyor…": "Loading…", "Bekle…": "Please wait…", "Sil": "Delete", "Vazgeç": "Cancel",
    "← Geri": "← Back", "← Merkez": "← Home", "← Merkeze dön": "← Back to home", "Merkeze dön →": "Back to home →",
    "oyuncu": "player", "bot": "bot", "Bot takım": "Bot team", "Menajer": "Manager",
    "Yüksek": "High", "Orta": "Medium", "Düşük": "Low", "Kolay": "Easy", "Normal": "Normal", "Çok zor": "Very hard",
    "sn": "s", "tur": "laps", "Tur": "Lap", "T": "L", "yarış": "race", "Yarış": "Race", "Puan": "Pts", "Pilot": "Driver", "Takım": "Team",
    "Yaş": "Age", "Genel": "Overall", "Pot.": "Pot.", "Değer": "Value", "Fiyat": "Price", "Maaş": "Salary", "Potansiyel": "Potential",
    "GENEL": "OVERALL", "POTANSİYEL": "POTENTIAL", "SIRA": "RANK", "PUAN": "POINTS", "YARIŞ": "RACES",
    "{n} tur": "{n} laps", "{n} yaş": "age {n}", "{n} yaşında": "{n} years old", "{n} puan": "{n} pts", "{n} pilot": "{n} drivers",
    "{n} gün ": "{n}d ", "Sezon {n}": "Season {n}", "Seviye {n}": "Level {n}", "Yarış {n} / 25": "Race {n} / 25",

    // Giriş / kayıt / katılma
    "Pit duvarına hoş geldin": "Welcome to the pit wall",
    "Ülkenin liginde bir takım yönet. Her gün bir yarış, 25 yarışlık sezon, sonunda dünya finali.": "Run a team in your country's league. One race a day, a 25-race season and a world final at the end.",
    "Giriş yap": "Log in", "Kayıt ol": "Sign up", "E-posta": "Email", "Şifre": "Password",
    "Önce denemek mi istersin? <a href=\"deneme.html\">Çevrimdışı deneme ligini oyna →</a>": "Want to try first? <a href=\"deneme.html\">Play the offline practice league →</a>",
    "Kayıt alındı! E-postana gelen bağlantıyla hesabını onayla, sonra giriş yap.": "You're signed up! Confirm your account with the link we emailed you, then log in.",
    "Takımını al": "Get your team",
    "Ülkeni seç, oradaki ligde botların yönettiği bir takımı devral. Lig doluysa senin için yeni bir lig açılır.": "Pick your country and take over a bot-run team in its league. If the league is full, a new one opens for you.",
    "Kullanıcı adı": "Username", "(3-20 karakter, herkes görecek)": "(3-20 characters, visible to everyone)",
    "Ülke": "Country", "(sezon boyunca değiştirilemez)": "(can't be changed during the season)",
    "Takım adı": "Team name", "(isteğe bağlı, boş bırakırsan devraldığın takımın adı kalır)": "(optional — leave empty to keep the team's current name)",
    "Takımımı al 🏎️": "Get my team 🏎️", "Ülkeni seç…": "Choose your country…", "Bir ülke seç.": "Choose a country.",
    "Takımın hazır! Hoş geldin 🏁": "Your team is ready! Welcome 🏁",

    // Merkez
    "Sıradaki yarış": "Next race", "Strateji kur →": "Set strategy →", "🔧 Garaj": "🔧 Garage", "👤 Pilotlar": "👤 Drivers",
    "Son yarış": "Last race", "Takımın": "Your team", "Sezon takvimi": "Season calendar",
    "Pist tipi": "Track type", "en önemli parça": "key part", "Lastik aşınması": "Tyre wear", "Sollama": "Overtaking",
    "Hızlı": "Fast", "Dengeli": "Balanced", "Teknik": "Technical",
    "{d}{h} sa {m} dk {s} sn sonra başlıyor": "starts in {d}{h}h {m}m {s}s",
    "✓ Stratejin kaydedildi": "✓ Your strategy is saved",
    "Henüz strateji kaydetmedin. Kaydetmezsen mühendislerin önerdiği plan kullanılır.": "You haven't saved a strategy yet. If you don't, your engineers' suggested plan will be used.",
    "Bu sezon için planlanmış başka yarış yok.": "No more races scheduled this season.",
    "🏁 Yarış şu an koşuluyor. Sonuçlar birkaç dakika içinde gelecek.": "🏁 The race is running now. Results will arrive in a few minutes.",
    "↻ Yenile": "↻ Refresh", "▶ Yarışı izle": "▶ Watch race", "+{x} kazandın": "you earned +{x}", "maaşlar": "salaries",
    "Planlandı": "Scheduled", "Koşuluyor": "Running", "Bitti": "Finished", "Atlandı": "Skipped", "▶ İzle": "▶ Watch",
    "DÜNYA TURNUVASI": "WORLD TOURNAMENT",
    "Pilot maaşları: {x} / yarış": "Driver salaries: {x} / race",
    "Lig ortalaması": "League average", "Beyaz çizgi: lig ortalaması": "White line: league average",
    "Takımlar": "Teams", "Pilotlar": "Drivers", "Takım sayfasını aç": "Open team page",
    "📰 Sezon arası": "📰 Off-season news",
    "<b>{old}</b> {age} yaşında emekli oldu. Yerine genç yetenek <b>{new}</b> ({nage}) takıma katıldı.": "<b>{old}</b> retired at {age}. Young talent <b>{new}</b> ({nage}) has joined the team.",
    "Bu yarışın tekrarı yok.": "There's no replay for this race.",

    // Garaj
    "🔧 Garaj": "🔧 Garage",
    "Her geliştirme parçayı güçlendirir: 70'e kadar +3, 85'e kadar +2, sonrası +1. Her seviye bir öncekinden %50 daha pahalıdır. Sezon sonunda kurallar değişir ve parçalar 50'ye doğru yarı yarıya geri çekilir. Beyaz çizgi lig ortalamasıdır.": "Each upgrade improves the part: +3 up to 70, +2 up to 85, +1 after that. Each level costs 50% more than the last. At the end of the season the rules change and parts drop halfway back towards 50. The white line is the league average.",
    "Maksimum": "Maximum", "{part} geliştirildi! 🔧": "{part} upgraded! 🔧",
    "Motor": "Engine", "Aerodinamik": "Aerodynamics", "Şasi": "Chassis", "Güvenilirlik": "Reliability", "Pit ekibi": "Pit crew",
    "Düz hız. Hızlı pistlerde daha etkili.": "Straight-line speed. Matters most on fast tracks.",
    "Viraj hızı. Teknik pistlerde daha etkili.": "Cornering speed. Matters most on technical tracks.",
    "Genel hız ve daha az lastik aşınması.": "Overall pace and less tyre wear.",
    "Mekanik arıza riskini azaltır.": "Lowers the risk of mechanical failures.",
    "Daha hızlı ve hatasız pit stop.": "Faster, cleaner pit stops.",

    // Pilotlar
    "👤 Pilotların": "👤 Your drivers",
    "Pilotlar her yarıştan sonra <b>gelişim puanı</b> kazanır: her yarış 1 puan, ilk 10'a giren +1, podyuma çıkan +1. Her pilotun bir <b>potansiyeli</b> var: genel ortalaması bu değeri geçemez, tek bir özelliği ise en fazla 6 puan üstüne (çubuktaki sarı çizgi) çıkabilir. Yani pilotunu bir alanda uzmanlaştırabilirsin. Genç pilotların büyüme alanı daha fazladır. Puanları istediğin özelliğe harca. Özellik yükseldikçe bedeli artar: 60'a kadar 1, 70'e kadar 2, 80'e kadar 3, 90'a kadar 4, sonrası 5 puan.":
      "Drivers earn <b>development points</b> after every race: 1 per race, +1 for a top-10 finish, +1 for a podium. Every driver has a <b>potential</b>: their overall average can't go above it, but a single attribute can go up to 6 points higher (the yellow line on the bar), so you can specialise a driver. Young drivers have more room to grow. Spend points on any attribute. The higher an attribute, the more it costs: 1 point up to 60, 2 up to 70, 3 up to 80, 4 up to 90, 5 after that.",
    "🎂 Pilotlar her sezon sonunda bir yaş büyür. 16-22 yaş: hızlı gelişim (+12), 23-29: orta (+6), 30-35: yavaş (+2), 36-40: sabit, 41 ve üstü: düşüş (−8). 45 yaşında (41-44 arasında bazen) emekli olurlar, yerlerine genç bir pilot gelir.":
      "🎂 Drivers get one year older at the end of each season. Age 16-22: fast growth (+12), 23-29: medium (+6), 30-35: slow (+2), 36-40: steady, 41+: decline (−8). They retire at 45 (sometimes between 41 and 44) and are replaced by a young driver.",
    "Gelişim puanı": "Development points", "Potansiyelde": "At potential", "Piyasa değeri": "Market value",
    "{s}. pilot · {r} yarış · {p} şampiyona puanı": "driver {s} · {r} races · {p} championship pts",
    "{p} puan · {r} yarış": "{p} pts · {r} races",
    "🚀 hızlı gelişim": "🚀 fast growth", "📈 gelişiyor": "📈 improving", "↗️ yavaş gelişim": "↗️ slow growth", "➖ zirvede, sabit": "➖ at peak, steady", "📉 düşüşte": "📉 declining",
    "Hız": "Pace", "Sollama/Savunma": "Racecraft", "Lastik yönetimi": "Tyre management", "İstikrar": "Consistency",
    "Tur süresi. En önemli özellik.": "Lap time. The most important attribute.",
    "Sollama yapma ve pozisyon koruma başarısı.": "Overtaking and defending positions.",
    "Lastiği daha az aşındırır, daha uzun stint.": "Wears tyres less, allowing longer stints.",
    "Daha az hata ve daha düzenli turlar.": "Fewer mistakes and steadier laps.",

    // Strateji
    "Yarış öncesi strateji": "Pre-race strategy", "💾 Stratejiyi kaydet": "💾 Save strategy",
    "Başlangıç lastiği": "Starting tyre", "Pit stoplar": "Pit stops", "sonunda": "end", "+ Pit stop ekle": "+ Add pit stop",
    "Plan önizleme": "Plan preview", "aşınma": "wear", "Sürüş modu": "Driving mode",
    "Son 8 turda atak yap (lastik izin verirse)": "Push in the last 8 laps (if the tyres allow)",
    "Lastik güvenlik sınırı: aşınma bu değere ulaşırsa erken pite gir": "Tyre safety limit: pit early if wear reaches this level",
    "Mühendislerin önerileri": "Engineers' suggestions", "en hızlı tahmin": "fastest estimate",
    "En az 2 farklı lastik kullanmalısın, yoksa +20 sn ceza alırsın.": "You must use at least 2 different compounds or you'll get a +20s penalty.",
    "Bir bölümde lastik %{w} aşınacak. Güvenlik sınırın (%{l}) devreye girip seni erken pite sokabilir.": "One stint will wear the tyres to {w}%. Your safety limit ({l}%) may call you in early.",
    "Çok iyi bir plan (en iyi tahmine yakın)": "Very good plan (close to the best estimate)",
    "Tahmini kayıp: en iyi plana göre +{x} sn": "Estimated loss: +{x}s vs. the best plan",
    "● Kaydedilmemiş değişiklikler var": "● Unsaved changes", "✓ Strateji kayıtlı": "✓ Strategy saved",
    "Mühendislerin önerisi yüklendi, henüz kaydedilmedi": "Engineers' suggestion loaded, not saved yet",
    "Yarış başladı, strateji artık değiştirilemez.": "The race has started; the strategy can't be changed anymore.",
    "Strateji kaydedildi ✓": "Strategy saved ✓", "Kaydedilmemiş değişiklikler var. Çıkmak için tekrar tıkla.": "You have unsaved changes. Click again to leave.",
    "Pit kaybı ~{n} sn": "Pit loss ~{n}s",
    "Yumuşak": "Soft", "Sert": "Hard", "Atak": "Push", "Koru": "Save",

    // Yarış tekrarı ve sonuç
    "▶ İzle": "▶ Watch", "Hız:": "Speed:", "Sonucu göster ⏭": "Show result ⏭", "Sonuçları gör →": "See results →",
    "Yarış olayları": "Race events", "Sadece benim pilotlarım": "Only my drivers", "▶ Tekrar izle": "▶ Watch again",
    "▶ Baştan izle": "▶ Watch from start", "⏸ Duraklat": "⏸ Pause", "Başlangıç dizilişi": "Starting grid", "Damalı bayrak!": "Chequered flag!",
    "senin planın": "your plan", "mühendis önerisi": "engineers' plan", "Aşınma": "Wear",
    "Süre / Fark": "Time / Gap", "Fark": "Gap", "Son tur": "Last lap", "Lastik": "Tyre", "En iyi tur": "Best lap", "Sonuçlar": "Results", "Bu yarıştan kazancın": "Your earnings from this race",
    "Maaşlar": "Salaries", "Katılım": "Entry", "şampiyona desteği": "championship support",

    // Takım ve lig sayfaları
    "Araç": "Car", "Sezon sonuçları": "Season results", "Henüz koşulmuş yarış yok.": "No races yet.",
    "🌍 Ülkeler ve ligler": "🌍 Countries and leagues",
    "Her ülkenin kendi ligi var. Oyuncusu olmayan takımları botlar yönetiyor. Bir lige tıklayıp puan durumuna, takımlarına ve yarış tekrarlarına bakabilirsin.": "Every country has its own league. Teams without a player are run by bots. Click a league to see its standings, teams and race replays.",
    "🔍 Ülke ara…": "🔍 Search country…", "{c} ülke · {l} lig · {p} oyuncu": "{c} countries · {l} leagues · {p} players",
    "senin ligin": "your league", "Lider": "Leader", "Henüz yarış yok": "No races yet", "Henüz lig yok.": "No leagues yet.",

    // Dünya turnuvası
    "🏆 Büyük Final": "🏆 Grand Final", "Grup aşaması": "Group stage", "Eleme turu": "Play-in round", "Büyük final": "Grand final",
    "12 takım, 2 yarış. En çok puanı toplayan dünya şampiyonu olur.": "12 teams, 2 races. Whoever scores the most points becomes world champion.",
    "Ülke şampiyonları ve eleme galipleri. 2 yarış, her grubun ilk 3'ü finale çıkar.": "Country champions and play-in winners. 2 races; the top 3 in each group reach the final.",
    "Ülke ikincileri. 1 yarış, her grubun birincisi grup aşamasına çıkar.": "Country runners-up. 1 race; each group winner reaches the group stage.",
    "Sezon {n} kazananları": "Season {n} winners", "Dünya turnuvası": "World tournament",
    "Lig sezonu bitince 40 ülkenin en iyileri dünya şampiyonluğu için yarışır. Bot takımlar da katılır.": "When the league season ends, the best teams from 40 countries race for the world title. Bot teams take part too.",
    "Ülke ikincileri 4 grupta yarışır. Her grubun birincisi devam eder.": "Country runners-up race in 4 groups. Each group winner goes through.",
    "Ülke şampiyonları + 4 eleme galibi, 11'erli 4 grup, 2 yarış. Her grubun ilk 3'ü finale çıkar.": "Country champions + 4 play-in winners, 4 groups of 11, 2 races. The top 3 in each group reach the final.",
    "12 takım, 2 yarış. Dünya şampiyonu belirlenir.": "12 teams, 2 races. The world champion is crowned.",
    "ve ertesi gün": "and the next day",
    "Ödüller: şampiyon {a}, ikinci {b}, üçüncü {c}, diğer finalistler {d}, grup aşaması katılımcıları {e}. Ayrıca kalıcı kupa rozetleri.": "Prizes: champion {a}, runner-up {b}, third {c}, other finalists {d}, group stage teams {e}. Plus permanent trophy badges.",
    "Takımını oraya taşımak için ligini ilk iki sırada bitir!": "Finish your league in the top two to get there!",
    "tamamlandı": "completed",

    // Pazar ve teklifler
    "🔄 Pilot pazarı": "🔄 Driver market",
    "Bir pilot alırken pilotlarından birini bırakırsın; bıraktığın pilotun değerinin yarısı sana geri döner. <b>Serbest pilotlar</b> piyasa değerine imzalanır. <b>Bot takımlarının pilotları</b> değerinin 1,3 katına alınır ve bıraktığın pilot o takıma gider. Pilotlar her lig yarışında maaş alır. Sezonda en fazla 4 transfer yapabilirsin.":
      "When you sign a driver you release one of yours and get half of their value back. <b>Free agents</b> sign for their market value. <b>Bot teams' drivers</b> cost 1.3× their value, and the driver you release joins that team. Drivers are paid a salary every league race. You can make up to 4 transfers per season.",
    "Serbest pilotlar": "Free agents", "Bot takımlarının pilotları": "Bot teams' drivers", "Oyuncu takımları": "Player teams",
    "🔍 İsim ara…": "🔍 Search name…", "Sırala: Genel": "Sort: Overall", "Sırala: Potansiyel": "Sort: Potential", "Sırala: En genç": "Sort: Youngest",
    "Sırala: En ucuz": "Sort: Cheapest", "Sırala: Hız": "Sort: Pace", "Tüm yaşlar": "All ages", "21 ve altı": "21 and under", "25 ve altı": "25 and under",
    "30 ve altı": "30 and under", "Tüm potansiyeller": "Any potential", "Potansiyel 70+": "Potential 70+", "Potansiyel 80+": "Potential 80+",
    "Potansiyel 90+": "Potential 90+", "Sadece alabileceklerim": "Only ones I can afford", "ilk 80 gösteriliyor": "showing the first 80",
    "H / S / L / İ": "P / R / T / C", "Genç cevher": "Young gem", "Al": "Sign", "Teklif yap": "Make offer", "Transferi onayla": "Confirm transfer",
    "Yerine hangi pilotunu bırakacaksın?": "Which of your drivers will you release?", "Sana geri dönecek": "You get back",
    "Transfer bedeli (değerin 1,3 katı)": "Transfer fee (1.3× value)", "İmza bedeli (piyasa değeri)": "Signing fee (market value)",
    "Bıraktığın pilottan geri dönen": "Refund from the released driver", "Ödeyeceğin": "You pay", "Kasan transferden sonra": "Your cash after the transfer",
    "Yeni maaş (yarış başına)": "New salary (per race)", "Bıraktığın pilot {team} takımına geçecek.": "The released driver will join {team}.",
    "Bıraktığın pilot serbest pilotlar havuzuna gidecek.": "The released driver will join the free-agent pool.",
    "Bu sezon transfer hakkını doldurdun.": "You've used all your transfers this season.", "Bu transfer için yeterli paran yok.": "You don't have enough money for this transfer.",
    "{name} artık senin pilotun! 🤝": "{name} is now your driver! 🤝",
    "Karşılığında hangi pilotunu vereceksin?": "Which of your drivers will you offer in exchange?",
    "Pilotuna ek olarak teklif ettiğin para": "Cash you offer on top of your driver", "Kasan": "Your cash",
    "Teklif 48 saat geçerlidir. Karşı taraf kabul ederse pilotlar yer değiştirir ve para hemen el değiştirir.": "Offers are valid for 48 hours. If accepted, the drivers swap teams and the money changes hands immediately.",
    "Teklifi gönder": "Send offer", "Teklif ettiğin para kasandakinden fazla.": "You're offering more cash than you have.",
    "Teklifin gönderildi. Karşı taraf cevap verince merkezde göreceksin. 📨": "Offer sent. You'll see the reply on your home screen. 📨",
    "Transfer teklifleri": "Transfer offers", "{team} senin pilotun {target} için teklif yaptı:": "{team} has made an offer for your driver {target}:",
    "{team} takımının pilotu {target} için teklifin bekliyor:": "Your offer for {team}'s driver {target} is pending:",
    "Kabul et": "Accept", "Reddet": "Reject", "Teklifi geri çek": "Withdraw offer", "Teklifin": "Your offer", "Gelen teklif": "Incoming offer",
    "✅ kabul edildi": "✅ accepted", "❌ reddedildi": "❌ rejected", "⌛ geçersiz": "⌛ expired", "iptal": "cancelled",
    "Transfer tamamlandı! 🤝": "Transfer complete! 🤝", "Teklif reddedildi.": "Offer rejected.", "Teklif geri çekildi.": "Offer withdrawn.",

    // Sunucu ve hata mesajları
    "E-posta veya şifre hatalı.": "Wrong email or password.", "Bu e-posta ile zaten kayıt olunmuş. Giriş yapmayı dene.": "This email is already registered. Try logging in.",
    "Şifre en az 6 karakter olmalı.": "Password must be at least 6 characters.", "E-postanı henüz onaylamadın. Gelen kutunu kontrol et.": "You haven't confirmed your email yet. Check your inbox.",
    "Geçerli bir e-posta adresi yaz.": "Enter a valid email address.", "Bu kullanıcı adı alınmış, başka bir tane dene.": "That username is taken, try another.",
    "Kullanıcı adı 3-20 karakter olmalı.": "Username must be 3-20 characters.", "Çok fazla deneme yapıldı, biraz bekleyip tekrar dene.": "Too many attempts. Wait a bit and try again.",
    "Bu işlem artık yapılamaz (yarış başlamış olabilir).": "This can't be done anymore (the race may have started).",
    "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.": "Couldn't reach the server. Check your internet connection.",
    "Yeterli gelişim puanın yok.": "Not enough development points.", "Bu sezon transfer hakkını doldurdun (en fazla 4).": "You've used all your transfers this season (max 4).",
    "Bu pilot bir oyuncunun takımında. Oyuncular arası transfer yakında!": "This driver belongs to a player's team. Make them an offer instead!",
    "Önce giriş yapmalısın": "You need to log in first", "Aktif sezon yok": "No active season", "Takımın bulunamadı": "Your team wasn't found",
    "Yeterli paran yok": "Not enough money", "Bu parça zaten en üst seviyede": "This part is already maxed out",
    "Bu pilot senin takımında değil": "This driver isn't in your team", "Bu özellik zaten en üst seviyede": "This attribute is already maxed out",
    "Bu özellik pilotun potansiyelinin sınırına ulaştı": "This attribute has reached the driver's potential limit",
    "Yeterli gelişim puanın yok": "Not enough development points", "Bu sezon transfer hakkını doldurdun (en fazla 4)": "You've used all your transfers this season (max 4)",
    "Bırakacağın pilot senin takımında değil": "The driver you're releasing isn't in your team", "Pilot bulunamadı": "Driver not found",
    "Bu pilot zaten senin takımında": "This driver is already in your team", "Geçersiz teklif tutarı": "Invalid offer amount",
    "Bu pilot bir bot takımında, pazardan doğrudan alabilirsin": "This driver is in a bot team; you can sign them directly in the market",
    "Aynı anda en fazla 5 bekleyen teklifin olabilir": "You can have at most 5 pending offers at once",
    "Bu pilota zaten bekleyen bir teklifin var": "You already have a pending offer for this driver",
    "Teklif bulunamadı": "Offer not found", "Bu teklif artık geçerli değil": "This offer is no longer valid", "Bu teklifin süresi dolmuş": "This offer has expired",
    "Pilotlardan biri artık o takımda değil, teklif geçersiz oldu": "One of the drivers has left that team, so the offer is void",
    "Teklifi yapan takımın parası artık yetmiyor": "The bidding team no longer has enough money",
    "Teklifi yapan takım bu sezonki transfer hakkını doldurmuş": "The bidding team has used all its transfers this season",
    "Yarış bulunamadı": "Race not found", "Bu bir dünya yarışı değil": "This isn't a world race",
  };

  // Değişken içeren sunucu mesajları
  const PATTERNS = [
    [/^Pilot potansiyeline \((\d+)\) ulaştı$/, "The driver has reached their potential ($1)"],
    [/^Ülke bulunamadı: (.*)$/, "Country not found: $1"],
    [/^Geçersiz parça: (.*)$/, "Invalid part: $1"],
    [/^Geçersiz özellik: (.*)$/, "Invalid attribute: $1"],
    [/^Yarış işlenmeye hazır değil \(durum: (.*)\)$/, "Race isn't ready to be processed (status: $1)"],
  ];

  const COUNTRY_EN = {
    TR: "Türkiye", DE: "Germany", GB: "United Kingdom", FR: "France", IT: "Italy", ES: "Spain", NL: "Netherlands", BE: "Belgium",
    AT: "Austria", CH: "Switzerland", PL: "Poland", PT: "Portugal", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
    GR: "Greece", RO: "Romania", HU: "Hungary", CZ: "Czechia", AZ: "Azerbaijan", US: "United States", CA: "Canada", MX: "Mexico",
    BR: "Brazil", AR: "Argentina", CO: "Colombia", JP: "Japan", CN: "China", KR: "South Korea", IN: "India", ID: "Indonesia",
    AU: "Australia", NZ: "New Zealand", AE: "United Arab Emirates", SA: "Saudi Arabia", EG: "Egypt", ZA: "South Africa",
    MA: "Morocco", INT: "International",
  };
  const TRACK_EN = {
    bhr: "Bahrain GP", sau: "Saudi Arabian GP", aus: "Australian GP", jpn: "Japanese GP", chn: "Chinese GP", mia: "Miami GP",
    imo: "Imola GP", mon: "Monaco GP", can: "Canadian GP", esp: "Spanish GP", aut: "Austrian GP", gbr: "British GP",
    hun: "Hungarian GP", bel: "Belgian GP", ned: "Dutch GP", ita: "Italian GP", aze: "Azerbaijan GP", sgp: "Singapore GP",
    tur: "Istanbul GP", usa: "United States GP", mex: "Mexican GP", bra: "Brazilian GP", lvg: "Las Vegas GP", qat: "Qatar GP",
    abu: "Abu Dhabi GP",
  };
  // Türkçe ülke adı → kod (sunucudan gelen Türkçe metinleri çevirmek için)
  let TR_COUNTRY_CODE = {};

  /* ---------- Fonksiyonlar ---------- */
  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s);
  function matchPattern(s) {
    for (const [re, rep] of PATTERNS) if (re.test(s)) return s.replace(re, rep);
    return null;
  }
  function T(s, vars) {
    if (s == null) return "";
    if (lang === "en") {
      if (Object.prototype.hasOwnProperty.call(EN, s)) return fill(EN[s], vars);
      const p = matchPattern(s);
      if (p) return fill(p, vars);
    }
    return fill(s, vars);
  }
  const LOCALE = () => (lang === "tr" ? "tr-TR" : "en-GB");
  const countryName = (code, trName) => (lang === "en" ? COUNTRY_EN[code] || trName || code : trName || COUNTRY_EN[code] || code);
  const trackName = (tr) => (lang === "en" ? TRACK_EN[tr.id] || tr.name : tr.name);
  function leagueName(l) {
    if (!l) return "";
    if (lang === "tr" || !l.country_code) return l.name || "";
    return `${countryName(l.country_code)} · Division ${l.tier || 1}`;
  }
  function rememberCountries(list) {
    TR_COUNTRY_CODE = {};
    (list || []).forEach((c) => (TR_COUNTRY_CODE[c.name] = c.code));
  }
  const cEN = (trName) => (TR_COUNTRY_CODE[trName] ? COUNTRY_EN[TR_COUNTRY_CODE[trName]] : trName);

  // Sunucuda Türkçe saklanan metinler (grup adları, yarış başlıkları, kupa adları...)
  function trStored(s) {
    if (!s || lang === "tr") return s || "";
    let m;
    if ((m = s.match(/^Eleme ([A-P])$/))) return `Play-in ${m[1]}`;
    if ((m = s.match(/^Grup ([A-P])$/))) return `Group ${m[1]}`;
    if (s === "Büyük Final") return "Grand Final";
    if ((m = s.match(/^(Eleme|Grup) ([A-P]) · (\d)\. yarış$/))) return `${m[1] === "Eleme" ? "Play-in" : "Group"} ${m[2]} · Race ${m[3]}`;
    if ((m = s.match(/^Büyük Final · (\d)\. yarış$/))) return `Grand Final · Race ${m[1]}`;
    if ((m = s.match(/^(.+) şampiyonu$/))) return `${cEN(m[1])} champion`;
    if ((m = s.match(/^(.+) ikincisi$/))) return `${cEN(m[1])} runner-up`;
    if ((m = s.match(/^Eleme ([A-P]) galibi$/))) return `Play-in ${m[1]} winner`;
    if ((m = s.match(/^Grup ([A-P]) (\d+)\.$/))) return `Group ${m[1]} #${m[2]}`;
    if ((m = s.match(/^(.+) (\d+)\. Lig$/))) return `${cEN(m[1])} · Division ${m[2]}`;
    if ((m = s.match(/^(🏆|🥈|🥉|🌍) (Dünya Şampiyonu|Dünya İkincisi|Dünya Üçüncüsü|Dünya Finalisti) · Sezon (\d+)$/)))
      return `${m[1]} ${{ "Dünya Şampiyonu": "World Champion", "Dünya İkincisi": "World Runner-up", "Dünya Üçüncüsü": "World Third Place", "Dünya Finalisti": "World Finalist" }[m[2]]} · Season ${m[3]}`;
    if ((m = s.match(/^🏅 (.+) (\d+)\. Lig Şampiyonu · Sezon (\d+)$/))) return `🏅 ${cEN(m[1])} Division ${m[2]} Champion · Season ${m[3]}`;
    return s;
  }

  // Yarış olayları (sunucu Türkçe metin + tür + parametre kaydeder)
  function eventText(ev, entries) {
    if (lang === "tr" || !ev.kind) return ev.text;
    const n = (k) => (entries[ev.ids[k]] ? entries[ev.ids[k]].name : "?");
    const p = ev.params || {};
    const tyre = (c) => ({ S: "Soft", M: "Medium", H: "Hard", I: "Intermediate", W: "Wet" }[c] || c);
    const txt = ev.text || "";
    let kind = ev.kind;
    if (kind === "pit" && !p.tyre) { // eski kayıtlar
      if (/yavaş pit/.test(txt)) kind = "pit_slow";
      else if (/lastik sınırına/.test(txt)) kind = "pit_early";
      else if (/acil pit/.test(txt)) kind = "pit_emergency";
    }
    const sec = p.sec != null ? p.sec : ((txt.match(/(\d+\.\d)/) || [])[1] || "?");
    switch (kind) {
      case "pole": return `🏁 Pole position: ${n(0)}`;
      case "dnf": return `💥 ${n(0)} retires with a mechanical failure!`;
      case "mistake": return `😬 ${n(0)} made a mistake and lost ${sec}s`;
      case "pit_early": return `⚠️ ${n(0)} reached the tyre limit and pits early`;
      case "pit_emergency": return `⚠️ ${n(0)} makes an unplanned emergency stop`;
      case "pit_slow": return `🐢 Slow pit stop for ${n(0)}! (+${sec}s)`;
      case "pit": {
        const c = p.tyre || ({ "Yumuşak": "S", "Orta": "M", "Sert": "H" }[(txt.match(/→ (\S+)$/) || [])[1]]);
        return `🔧 ${n(0)} pits → ${tyre(c)}${p.wx ? " (weather)" : ""}`;
      }
      case "overtake": return /liderliği/.test(txt) ? `👑 ${n(0)} takes the lead!` : `⚔️ ${n(0)} overtakes ${n(1)}`;
      case "lead": return `👑 ${n(0)} takes the lead!`;
      case "penalty": return `⚠️ ${n(0)}: +20s penalty for not using two tyre compounds`;
      case "crash": return `💥 ${n(0)} lost control on the wet track and is out!`;
      case "wet_start": return "🌧️ The race starts on a wet track";
      case "drizzle": return "🌦️ A light drizzle has started";
      case "rain_start": return "🌧️ It's raining!";
      case "rain_heavy": return "⛈️ The rain is getting heavier, the track is very wet";
      case "rain_stop": return "🌤️ The rain has stopped, the track is starting to dry";
      case "dry_line": return "☀️ A dry line has appeared";
      default: return txt;
    }
  }

  // Sayfadaki sabit metinleri çevir (index.html)
  function applyStatic(root) {
    if (lang === "tr" || !g.document) return;
    root = root || g.document.body;
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = norm(el.innerHTML);
      if (EN[key]) el.innerHTML = EN[key];
    });
    const walker = g.document.createTreeWalker(root, 4 /* TEXT */);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      if (n.parentElement && n.parentElement.closest("[data-i18n-html],script,style")) return;
      const key = norm(n.nodeValue);
      if (key && Object.prototype.hasOwnProperty.call(EN, key)) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), EN[key]);
    });
    root.querySelectorAll("[placeholder]").forEach((el) => { const k = el.getAttribute("placeholder"); if (EN[k]) el.setAttribute("placeholder", EN[k]); });
    root.querySelectorAll("[title]").forEach((el) => { const k = el.getAttribute("title"); if (EN[k]) el.setAttribute("title", EN[k]); });
  }

  function setLang(l) {
    try { g.localStorage.setItem(LS_KEY, l); } catch (e) {}
    g.location.reload();
  }

  g.PW_I18N = { EN, PATTERNS, matchPattern, get lang() { return lang; }, setLang, applyStatic, rememberCountries };
  Object.assign(g, { T, LOCALE, countryName, trackName, leagueName, trStored, eventText });
})(typeof globalThis !== "undefined" ? globalThis : window);
