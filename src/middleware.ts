import { NextResponse, type NextRequest } from "next/server";

/**
 * Locale routing.
 *
 * The locale is a real path segment (`/ja/codex`) and this middleware only
 * normalises the URL:
 *
 *   /codex    → rewrite → /en/codex      (default locale is unprefixed)
 *   /ja/codex → pass through
 *   /en/codex → pass through            (alias; canonical points to /codex)
 *   ?lang=ja  → 301      → /ja/...
 *
 * There is deliberately no request-header injection. The standalone server used
 * by Docker and most PaaS builders drops headers set during a rewrite, so the
 * locale has to be derivable from the URL alone. For the same reason the
 * default locale's prefixed alias is not redirected: the standalone server
 * replays the middleware against the rewritten request, which would turn
 * `/` → `/en` → `/` into an infinite loop.
 */

const LOCALES = ["en", "zh-cn", "zh-tw", "ja", "ko", "es", "ru"] as const;

const CANONICAL: Record<string, string> = {
  en: "en",
  "zh-cn": "zh-CN",
  "zh-tw": "zh-TW",
  ja: "ja",
  ko: "ko",
  es: "es",
  ru: "ru",
};

const DEFAULT_LOCALE = "en";
const TZ_COOKIE = "wr_tz";
const ONE_YEAR = 60 * 60 * 24 * 365;
const PUBLIC_FILE = /\.[a-zA-Z0-9]+$/;

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/sw.js" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (isPublicAsset(pathname)) return NextResponse.next();

  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0]?.toLowerCase();
  const hasLocalePrefix = first !== undefined && (LOCALES as readonly string[]).includes(first);

  // `?lang=xx` canonicalises into a prefixed path. This runs before the prefix
  // check so that `/ja/codex?lang=ko` honours the explicit request.
  const langParam = searchParams.get("lang");
  if (langParam) {
    const code = CANONICAL[langParam.toLowerCase()] ?? DEFAULT_LOCALE;
    const rest = hasLocalePrefix ? segments.slice(1).join("/") : segments.join("/");
    const url = request.nextUrl.clone();
    url.pathname = code === DEFAULT_LOCALE ? `/${rest}` : `/${code}${rest ? `/${rest}` : ""}`;
    url.searchParams.delete("lang");
    return NextResponse.redirect(url, 301);
  }

  // A prefixed path is already canonical for its locale.
  if (hasLocalePrefix) return NextResponse.next();

  // Unprefixed path → render the default locale without changing the URL.
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  const response = NextResponse.rewrite(url);

  // Remember the visitor's timezone once so dates can be rendered server-side
  // in their zone without a client round-trip.
  if (!request.cookies.get(TZ_COOKIE)) {
    const tz = request.headers.get("x-vercel-ip-timezone") ?? request.headers.get("cf-timezone");
    if (tz) response.cookies.set(TZ_COOKIE, tz, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
