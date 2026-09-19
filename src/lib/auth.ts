import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySessionToken } from "./session";

export {
  ADMIN_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
  timingSafeEquals,
  verifySessionToken,
} from "./session";

/** Reads the signed session cookie. Only callable from a server request scope. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}
