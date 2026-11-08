/* =========================================================
   PitWall Manager — Web Push gönderici (ek kütüphane kullanmaz)
   RFC 8291 (aes128gcm şifreleme) + RFC 8292 (VAPID) — yalnızca Web Crypto ile.
   Node 18+ ve Deno'da çalışır.
   ========================================================= */
(function (g) {
  const subtle = g.crypto.subtle;
  const enc = new TextEncoder();

  const b64uToBytes = (s) => {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const bytesToB64u = (b) => {
    let s = "";
    const u = new Uint8Array(b);
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const concat = (...arrs) => {
    const len = arrs.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  };
  async function hmac(key, data) {
    const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await subtle.sign("HMAC", k, data));
  }

  // Anahtarları kopyala-yapıştırdan gelebilecek boşluk, satır sonu, tırnak ve standart base64 karakterlerinden arındır
  const cleanKey = (s) => String(s || "").replace(/[\s"'`“”‘’]/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // VAPID özel anahtarını (32 bayt, base64url) ve açık anahtarını (65 bayt) imza anahtarına çevir
  async function vapidSigningKey(publicB64u, privateB64u) {
    const pub = b64uToBytes(cleanKey(publicB64u));
    if (pub.length !== 65 || pub[0] !== 4) throw new Error(`VAPID_PUBLIC_KEY geçersiz (${pub.length} bayt, 65 olmalı)`);
    const priv = b64uToBytes(cleanKey(privateB64u));
    if (priv.length !== 32) throw new Error(`VAPID_PRIVATE_KEY geçersiz (${priv.length} bayt, 32 olmalı)`);
    const jwk = { kty: "EC", crv: "P-256", d: bytesToB64u(priv), x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), ext: true };
    return subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  }

  async function vapidHeader(endpoint, vapid) {
    const aud = new URL(endpoint).origin;
    const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const payload = bytesToB64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: String(vapid.subject || "").trim() })));
    const key = await vapidSigningKey(vapid.publicKey, vapid.privateKey);
    const sig = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + payload)));
    return `vapid t=${header}.${payload}.${bytesToB64u(sig)}, k=${cleanKey(vapid.publicKey)}`;
  }

  // RFC 8291: içeriği aboneliğin anahtarlarıyla şifrele
  async function encrypt(sub, plaintext, testing) {
    const uaPublic = b64uToBytes(sub.keys.p256dh);
    const authSecret = b64uToBytes(sub.keys.auth);
    const asKeys = testing && testing.asKeys ? testing.asKeys : await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const asPublic = new Uint8Array(await subtle.exportKey("raw", asKeys.publicKey));
    const uaKey = await subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const ecdhSecret = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
    const salt = testing && testing.salt ? testing.salt : g.crypto.getRandomValues(new Uint8Array(16));

    const prkKey = await hmac(authSecret, ecdhSecret);
    const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
    const ikm = await hmac(prkKey, keyInfo);
    const prk = await hmac(salt, ikm);
    const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
    const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

    const data = concat(typeof plaintext === "string" ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));
    const aes = await subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, data));
    const rs = new Uint8Array([0, 0, 16, 0]); // 4096
    return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
  }

  // Bildirimi gönder. Dönen: { status } — 404/410 aboneliğin artık geçersiz olduğunu gösterir.
  async function send(sub, payload, vapid, opts) {
    opts = opts || {};
    const body = await encrypt(sub, typeof payload === "string" ? payload : JSON.stringify(payload));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(sub.endpoint, vapid),
        TTL: String(opts.ttl || 6 * 3600),
        Urgency: opts.urgency || "normal",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
      },
      body,
    });
    let text = "";
    try { text = await res.text(); } catch (e) {}
    return { status: res.status, text: text.slice(0, 200) };
  }

  g.PW_WEBPUSH = { send, encrypt, vapidHeader, b64uToBytes, bytesToB64u, cleanKey };
})(typeof globalThis !== "undefined" ? globalThis : window);
