// ---------- Supabase Edge Function giriş noktası ----------
import { createClient } from "npm:@supabase/supabase-js@2";

function serviceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (k) return k;
  // Yeni anahtar sistemi: SUPABASE_SECRET_KEYS = {"default":"sb_secret_..."}
  try {
    const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return all.default || Object.values(all)[0] as string;
  } catch (_) { return ""; }
}

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(fn + ": " + error.message);
    return data;
  };
  try {
    const report = await (globalThis as any).PW_RUNNER.runDueRaces(rpc, 50);
    // Telefon bildirimleri (anahtarlar Edge Functions > Secrets bölümünde tanımlıysa). Hata olsa bile yarışları etkilemez.
    let push: unknown = null;
    try {
      push = await (globalThis as any).PW_NOTIFY.sendPending(rpc, {
        publicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
        privateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
        subject: Deno.env.get("VAPID_SUBJECT") || "mailto:pitwall@example.com",
      });
    } catch (e) { push = { error: String((e as Error).message || e) }; }
    return new Response(JSON.stringify({ ok: true, processed: report.filter((r: any) => r.race).length, push, report }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
