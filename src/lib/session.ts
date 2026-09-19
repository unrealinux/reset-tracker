import crypto from "node:crypto";
import { config } from "./config";

/**
 * Admin session helpers. Kept free of `next/headers` so CLI scripts and tests
 * can import them directly.
 */

export const ADMIN_COOKIE = "wr_admin";
const TTL_SECONDS = 60 * 60 * 12;
export const SESSION_MAX_AGE = TTL_SECONDS;

function sign(payload: string): string {
  return crypto.createHmac("sha256", config.adminSecret).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()): string {
  const payload = JSON.stringify({ sub: "admin", exp: Math.floor(now / 1000) + TTL_SECONDS });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      exp: number;
    };
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function checkPassword(password: string): boolean {
  const expected = Buffer.from(config.adminPassword);
  const given = Buffer.from(password);
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

export function timingSafeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
