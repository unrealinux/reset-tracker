import crypto from "node:crypto";

/**
 * Minimal Web Push implementation.
 *
 * Implements RFC 8291 (`aes128gcm` payload encryption) and RFC 8292 (VAPID)
 * with nothing but `node:crypto`, so the project needs no extra dependency to
 * deliver browser notifications.
 */

const b64url = (buf: Buffer | Uint8Array): string =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Generates a fresh VAPID keypair (uncompressed P-256 public key + raw scalar). */
export function generateVapidKeys(): VapidKeys {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: b64url(ecdh.getPublicKey()),
    privateKey: b64url(ecdh.getPrivateKey()),
  };
}

function vapidPrivateKey(keys: VapidKeys) {
  const pub = fromB64url(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) {
    throw new Error("VAPID public key must be an uncompressed P-256 point");
  }
  return crypto.createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: b64url(fromB64url(keys.privateKey)),
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
  });
}

interface VapidJwtOptions {
  audience: string;
  subject: string;
  expiresInSeconds?: number;
}

export function vapidJwt(keys: VapidKeys, options: VapidJwtOptions): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: options.audience,
        exp: now + (options.expiresInSeconds ?? 12 * 3600),
        sub: options.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: vapidPrivateKey(keys),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Encrypts `payload` for a subscription using `aes128gcm` (RFC 8188).
 */
export function encryptPayload(
  subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  payload: Buffer | string,
  recordSize = 4096,
): Buffer {
  const uaPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth);
  if (uaPublic.length !== 65) throw new Error("p256dh must be a 65-byte P-256 point");
  if (authSecret.length !== 16) throw new Error("auth must be a 16-byte secret");

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  // IKM = HKDF(salt = auth_secret, ikm = ecdh_secret, info = key_info)
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(
    crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32),
  );

  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12),
  );

  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  // A single record ends with the 0x02 padding delimiter.
  const plaintext = Buffer.concat([body, Buffer.from([0x02])]);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header.writeUInt8(asPublic.length, 20);

  return Buffer.concat([header, asPublic, ciphertext]);
}

export interface SendResult {
  ok: boolean;
  status: number;
  body?: string;
  /** True when the subscription is permanently gone (404/410). */
  expired: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  provider?: string;
  announcedAt?: string;
}

export async function sendPush(
  keys: VapidKeys,
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
  options: { subject: string; ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high" },
): Promise<SendResult> {
  const endpoint = new URL(subscription.endpoint);
  const audience = `${endpoint.protocol}//${endpoint.host}`;
  const jwt = vapidJwt(keys, { audience, subject: options.subject });

  const body = encryptPayload(subscription, JSON.stringify(payload));

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttlSeconds ?? 86400),
      Urgency: options.urgency ?? "normal",
    },
    body: new Uint8Array(body),
  });

  return {
    ok: response.ok,
    status: response.status,
    body: response.ok ? undefined : await response.text().catch(() => ""),
    expired: response.status === 404 || response.status === 410,
  };
}
