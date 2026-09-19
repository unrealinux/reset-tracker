import { cookies } from "next/headers";
import { createTranslator, resolveLocale, TZ_COOKIE, type Translate } from "./i18n";
import { parseTimeZone } from "./format";

export interface RequestContext {
  locale: string;
  timeZone: string;
  t: Translate;
}

/**
 * Locale always arrives as a validated path segment, never as a request header,
 * so this function only has to normalise it. The timezone is a genuine
 * per-visitor preference and still comes from a cookie.
 */
export async function getTimeZone(): Promise<string> {
  const store = await cookies();
  return parseTimeZone(store.get(TZ_COOKIE)?.value);
}

export async function getRequestContext(localeInput: string): Promise<RequestContext> {
  const locale = resolveLocale(localeInput);
  const timeZone = await getTimeZone();
  return { locale, timeZone, t: createTranslator(locale) };
}
