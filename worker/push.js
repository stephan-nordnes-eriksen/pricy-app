// Web Push (RFC 8030 delivery, RFC 8291 aes128gcm encryption, RFC 8292
// VAPID) hand-rolled on WebCrypto — same reasoning as the OAuth stack: the
// protocol is small and fixed, an npm dep would be bigger than this file.
// Keys: VAPID_PUBLIC_KEY var (base64url uncompressed P-256 point, shared
// with the browser via GET /api/push/key) + VAPID_PRIVATE_KEY secret (JWK).

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const te = new TextEncoder();

async function hkdf(ikm, salt, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

// RFC 8291: one aes128gcm record. `test` injects the sender keypair (JWK) and
// salt so the Appendix A vector is byte-checkable — never set in production.
export async function encrypt(payload, p256dh, auth, test) {
  const uaPub = unb64u(p256dh);
  const ua = await crypto.subtle.importKey('raw', uaPub, ECDH, false, []);
  let asPriv, asPub;
  if (test) {
    asPriv = await crypto.subtle.importKey('jwk', test.jwk, ECDH, false, ['deriveBits']);
    asPub = cat(new Uint8Array([4]), unb64u(test.jwk.x), unb64u(test.jwk.y));
  } else {
    const kp = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
    asPriv = kp.privateKey;
    asPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  }
  const salt = test?.salt || crypto.getRandomValues(new Uint8Array(16));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, asPriv, 256));
  const ikm = await hkdf(ecdh, unb64u(auth), cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(ikm, salt, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 pad delimiter = last record; rs 4096 (one record fits any payload we send)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, cat(te.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0, asPub.length]), asPub, ct);
}

async function vapidAuth(endpoint, env) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const claim = (o) => b64u(te.encode(JSON.stringify(o)));
  const unsigned = claim({ typ: 'JWT', alg: 'ES256' }) + '.'
    + claim({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://pricy.no' });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// → HTTP status from the push service. 404/410 = subscription gone, prune it.
export async function sendPush(env, sub, payload) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuth(sub.endpoint, env),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      urgency: 'normal',
    },
    body: await encrypt(JSON.stringify(payload), sub.p256dh, sub.auth),
  });
  return res.status;
}
