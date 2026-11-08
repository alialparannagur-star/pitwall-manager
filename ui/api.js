/* =========================================================
   PitWall Manager — VERİTABANI KATMANI
   Oyunun Supabase ile konuştuğu her şey bu dosyada.
   ========================================================= */
(function () {
  // E-postadaki bağlantılardan dönüşte adresin sonunda bilgi olur (#type=recovery, #error=...).
  // Supabase bunu okuyup sildiği için önce kendimiz bakıyoruz.
  const HASH = location.hash || "";
  let recovery = /type=recovery/.test(HASH);
  const linkError = /error_code=otp_expired/.test(HASH) ? "expired" : /[#&]error=/.test(HASH) ? "invalid" : null;
  const SITE = location.href.split("#")[0].split("?")[0];
  const db = supabase.createClient(PW_CONFIG.SUPABASE_URL, PW_CONFIG.SUPABASE_KEY);
  db.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") recovery = true; });

  // Supabase'in İngilizce hata mesajlarını Türkçeye çevir
  const TR = [
    [/Invalid login credentials/i, "E-posta veya şifre hatalı."],
    [/User already registered/i, "Bu e-posta ile zaten kayıt olunmuş. Giriş yapmayı dene."],
    [/Password should be at least/i, "Şifre en az 6 karakter olmalı."],
    [/Email not confirmed/i, "E-postanı henüz onaylamadın. Gelen kutunu kontrol et."],
    [/Unable to validate email|invalid format/i, "Geçerli bir e-posta adresi yaz."],
    [/profiles_username_key/i, "Bu kullanıcı adı alınmış, başka bir tane dene."],
    [/profiles_username_check/i, "Kullanıcı adı 3-20 karakter olmalı."],
    [/rate limit|security purposes|only request this after/i, "Çok fazla deneme yapıldı, biraz bekleyip tekrar dene."],
    [/should be different from the old/i, "Yeni şifre eskisiyle aynı olamaz."],
    [/Auth session missing/i, "Bağlantının süresi dolmuş. Şifre sıfırlamayı yeniden iste."],
    [/Error sending|sending (confirmation|recovery) email/i, "E-posta gönderilemedi. Biraz sonra tekrar dene."],
    [/Yeterli gelişim puanın yok/i, "Yeterli gelişim puanın yok."],
    [/transfer hakkını doldurdun/i, "Bu sezon transfer hakkını doldurdun (en fazla 4)."],
    [/oyuncunun takımında/i, "Bu pilot bir oyuncunun takımında. Oyuncular arası transfer yakında!"],
    [/row-level security/i, "Bu işlem artık yapılamaz (yarış başlamış olabilir)."],
    [/Failed to fetch|NetworkError/i, "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et."],
  ];
  function fail(err) {
    const msg = (err && err.message) || String(err);
    const hit = TR.find(([re]) => re.test(msg));
    throw new Error(T(hit ? hit[1] : msg));
  }
  const must = (r) => { if (r.error) fail(r.error); return r.data; };

  window.api = {
    // --- Giriş / kayıt ---
    async getUser() {
      const { data } = await db.auth.getSession();
      return data.session ? data.session.user : null;
    },
    isRecovery() { return recovery; },
    linkError() { return linkError; },
    async signUp(email, password) {
      const r = await db.auth.signUp({ email, password, options: { emailRedirectTo: SITE } });
      if (r.error) fail(r.error);
      return { needsConfirm: !r.data.session };
    },
    async signIn(email, password) {
      const r = await db.auth.signInWithPassword({ email, password });
      if (r.error) fail(r.error);
    },
    async signOut() { await db.auth.signOut(); },
    async resetPassword(email) {
      const r = await db.auth.resetPasswordForEmail(email, { redirectTo: SITE });
      if (r.error) fail(r.error);
    },
    async updatePassword(password) {
      const r = await db.auth.updateUser({ password });
      if (r.error) fail(r.error);
      recovery = false;
    },
    async sendFeedback(kind, message, screen, browser) {
      must(await db.rpc("send_feedback", { p_kind: kind, p_message: message, p_screen: screen, p_browser: browser }));
    },
    async resendConfirm(email) {
      const r = await db.auth.resend({ type: "signup", email, options: { emailRedirectTo: SITE } });
      if (r.error) fail(r.error);
    },

    // --- Oyun verileri ---
    async countries() {
      return must(await db.from("countries").select("*").order("name"));
    },
    // Kullanıcının aktif sezondaki takımı (yoksa null)
    async myTeam() {
      const user = await this.getUser();
      if (!user) return null;
      const rows = must(await db.from("teams")
        .select("*, drivers(*), leagues(id, name, tier, country_code, season_id, seasons(id, number, start_date, status), countries(name, flag, timezone))")
        .eq("owner_id", user.id));
      return rows.find((t) => t.leagues && t.leagues.seasons && t.leagues.seasons.status === "active") || null;
    },
    async joinGame(username, country, teamName) {
      return must(await db.rpc("join_game", { p_username: username, p_country: country, p_team_name: teamName || null }));
    },
    async leagueTeams(leagueId) {
      return must(await db.from("teams").select("*, drivers(*), profiles(username)").eq("league_id", leagueId));
    },
    // Ligin bu sezonki yarışları
    async leagueRaces(leagueId, seasonId) {
      let q = db.from("races").select("id, round, track_id, scheduled_at, status, title").eq("league_id", leagueId);
      if (seasonId) q = q.eq("season_id", seasonId);
      return must(await q.order("round"));
    },
    // Takımın bu sezonki dünya turnuvası yarışları (katılıyorsa)
    async myWorldRaces(teamId, seasonId) {
      const g = must(await db.from("world_group_teams").select("group_id, world_groups!inner(season_id)")
        .eq("team_id", teamId).eq("world_groups.season_id", seasonId));
      if (!g.length) return [];
      return must(await db.from("races").select("id, round, track_id, scheduled_at, status, title, world_group_id")
        .in("world_group_id", g.map((x) => x.group_id)));
    },
    // Dünya turnuvası: bütün gruplar, takımlar ve yarışlar
    async worldOverview(seasonId) {
      return must(await db.from("world_groups")
        .select("id, stage, name, sort, world_group_teams(team_id, seed_info, points, best_pos, teams(id, name, color, owner_id, profiles(username), leagues(countries(flag, name)))), races(id, round, track_id, scheduled_at, status, title)")
        .eq("season_id", seasonId));
    },
    async retirements(teamId, seasonNumber) {
      return must(await db.from("retirements").select("*").eq("team_id", teamId).eq("season_number", seasonNumber));
    },
    async trophies(teamId) {
      return must(await db.from("trophies").select("season_number, kind, label").eq("team_id", teamId).order("season_number", { ascending: false }));
    },
    async lastWorldWinners(seasonNumber) {
      return must(await db.from("trophies").select("season_number, kind, label, team_name, team_id")
        .eq("season_number", seasonNumber).in("kind", ["world_champion", "world_second", "world_third"]).order("kind"));
    },
    async myStrategies(raceId) {
      return must(await db.from("strategies").select("driver_id, plan, updated_at").eq("race_id", raceId));
    },
    async saveStrategies(raceId, items) {
      const now = new Date().toISOString();
      must(await db.from("strategies").upsert(items.map((x) => ({ race_id: raceId, driver_id: x.driverId, plan: x.plan, updated_at: now }))));
    },
    // Yarış tekrarı + takım kazançları (sadece yarış izlenirken çekilir, veri büyük)
    async raceDetail(raceId) {
      return must(await db.from("races")
        .select("id, round, track_id, status, replay, race_team_results(team_id, points, prize, rank_before, salaries)")
        .eq("id", raceId).single());
    },
    // Hub'daki "son yarış" kartı için küçük özet
    async raceSummary(raceId, teamId) {
      const [res, tr] = await Promise.all([
        db.from("race_results").select("driver_id, pos, grid, points, dnf").eq("race_id", raceId).eq("team_id", teamId),
        db.from("race_team_results").select("points, prize, salaries, sponsor").eq("race_id", raceId).eq("team_id", teamId).maybeSingle(),
      ]);
      return { results: must(res), team: must(tr) };
    },
    // Takım sayfası
    async team(teamId) {
      return must(await db.from("teams")
        .select("*, drivers(*), profiles(username), leagues(id, name, tier, season_id, country_code, countries(name, flag))")
        .eq("id", teamId).single());
    },
    async teamResults(teamId) {
      return must(await db.from("race_results")
        .select("race_id, driver_id, pos, points, dnf, races(round, track_id)")
        .eq("team_id", teamId));
    },
    // Ligler sayfası: sezonun bütün ligleri ve takımlarının kısa bilgisi
    async leaguesOverview(seasonId) {
      return must(await db.from("leagues")
        .select("id, name, tier, country_code, countries(name, flag), teams(id, name, color, points, owner_id)")
        .eq("season_id", seasonId));
    },
    async league(leagueId) {
      return must(await db.from("leagues")
        .select("id, name, tier, country_code, season_id, countries(name, flag), seasons(number)")
        .eq("id", leagueId).single());
    },
    // Pilot pazarı
    async freeAgents() {
      return must(await db.from("drivers")
        .select("id, name, nationality, age, pace, racecraft, tyres, consistency, skill, potential, salary")
        .is("team_id", null).eq("retired", false));
    },
    async botDrivers() {
      return must(await db.from("drivers")
        .select("id, name, nationality, age, pace, racecraft, tyres, consistency, skill, potential, salary, team_id, teams!inner(name, color, owner_id, leagues(name, tier, country_code, countries(flag)))")
        .is("teams.owner_id", null));
    },
    async transfersUsed(teamId, seasonId) {
      const r = await db.from("transfers").select("id", { count: "exact", head: true })
        .eq("to_team", teamId).eq("season_id", seasonId).neq("kind", "released");
      if (r.error) fail(r.error);
      return r.count || 0;
    },
    // Oyuncu takımlarının pilotları (kendi takımım hariç)
    async humanDrivers(myTeamId) {
      return must(await db.from("drivers")
        .select("id, name, nationality, age, pace, racecraft, tyres, consistency, skill, potential, salary, team_id, teams!inner(name, color, owner_id, profiles(username), leagues(name, tier, country_code, countries(flag)))")
        .not("teams.owner_id", "is", null).neq("team_id", myTeamId));
    },
    async myOffers() {
      const since = new Date(Date.now() - 3 * 864e5).toISOString();
      const D = "name, nationality, age, skill, potential";
      return must(await db.from("offers")
        .select(`*, target:drivers!offers_target_driver_fkey(${D}), outd:drivers!offers_out_driver_fkey(${D}),
                 buyer:teams!offers_buyer_team_fkey(name, color, profiles(username)), seller:teams!offers_seller_team_fkey(name, color, profiles(username))`)
        .gte("created_at", since).order("created_at", { ascending: false }));
    },
    async makeOffer(targetId, outId, price) {
      return must(await db.rpc("make_offer", { p_target: targetId, p_out: outId, p_price: price }));
    },
    async respondOffer(offerId, accept) {
      return must(await db.rpc("respond_offer", { p_offer: offerId, p_accept: accept }));
    },
    async cancelOffer(offerId) {
      return must(await db.rpc("cancel_offer", { p_offer: offerId }));
    },
    async leagueMessages(leagueId) {
      const rows = must(await db.from("league_messages").select("id, user_id, username, team_name, team_color, body, created_at")
        .eq("league_id", leagueId).order("id", { ascending: false }).limit(60));
      return (rows || []).reverse();
    },
    async sendMessage(body) {
      must(await db.rpc("send_league_message", { p_body: body }));
    },
    async deleteMessage(id) {
      must(await db.rpc("delete_league_message", { p_id: id }));
    },
    // Canlı sohbet: yeni mesaj gelince cb çağrılır; dönen fonksiyon aboneliği kapatır
    subscribeMessages(leagueId, cb) {
      try {
        const ch = db.channel("league-chat-" + leagueId)
          .on("postgres_changes", { event: "*", schema: "public", table: "league_messages", filter: "league_id=eq." + leagueId }, () => cb())
          .subscribe();
        return () => { try { db.removeChannel(ch); } catch (e) {} };
      } catch (e) { return () => {}; }
    },
    async achievements(userId) {
      return must(await db.from("achievements_earned").select("code, reward, earned_at, seen").eq("user_id", userId)) || [];
    },
    async markAchievementsSeen() {
      must(await db.rpc("mark_achievements_seen"));
    },
    async savePush(endpoint, p256dh, auth, lang) {
      must(await db.rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_lang: lang }));
    },
    async deletePush(endpoint) {
      must(await db.rpc("delete_push_subscription", { p_endpoint: endpoint }));
    },
    async requestTestPush() {
      must(await db.rpc("request_test_push"));
    },
    async myTerms() {
      return must(await db.rpc("my_terms"));
    },
    async acceptTerms(version) {
      must(await db.rpc("accept_terms", { p_version: version }));
    },
    async deleteAccount(confirm) {
      must(await db.rpc("delete_my_account", { p_confirm: confirm }));
      try { await db.auth.signOut({ scope: "local" }); } catch (e) {}
    },
    async seasonHistory() {
      return must(await db.rpc("season_history")) || [];
    },
    async records(country) {
      return must(await db.rpc("all_time_records", { p_country: country || null })) || {};
    },
    async sponsorDeal(teamId, seasonId) {
      return must(await db.from("sponsor_deals").select("*").eq("team_id", teamId).eq("season_id", seasonId).maybeSingle());
    },
    async sponsorOffers(teamId) {
      return must(await db.rpc("sponsor_offers", { p_team: teamId })) || [];
    },
    async signSponsor(kind) {
      must(await db.rpc("sign_sponsor", { p_kind: kind }));
    },
    async signDriver(targetId, outId) {
      return must(await db.rpc("sign_driver", { p_target: targetId, p_out: outId }));
    },
    async trainDriver(driverId, attr) {
      return must(await db.rpc("train_driver", { p_driver: driverId, p_attr: attr }));
    },
    async buyUpgrade(part) {
      return must(await db.rpc("buy_upgrade", { p_part: part }));
    },
  };
})();
