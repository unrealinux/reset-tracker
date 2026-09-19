"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createTranslator, isLocaleCode, localizedPath } from "@/lib/i18n";

/**
 * Rendered for both unknown providers (`/codex/nope`) and unknown paths. The
 * locale is read from the browser URL, which is the authoritative source now
 * that locale is a real path segment.
 */
export default function NotFound() {
  const pathname = usePathname();
  const first = pathname.split("/").filter(Boolean)[0];
  const locale = first && isLocaleCode(first) ? first : "en";
  const t = createTranslator(locale);
  const href = (path: string) => localizedPath(path, locale);

  return (
    <section style={{ padding: "60px 0", textAlign: "center" }}>
      <p className="eyebrow">404</p>
      <h1 className="h1">{t("notFound.title")}</h1>
      <p className="lead" style={{ margin: "0 auto 20px" }}>
        {t("notFound.body")}
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <Link className="btn btn--primary" href={href("/")}>
          {t("nav.home")}
        </Link>
        <Link className="btn" href={href("/codex")}>
          Codex
        </Link>
        <Link className="btn" href={href("/claude")}>
          Claude
        </Link>
        <Link className="btn" href={href("/grok")}>
          Grok
        </Link>
        <Link className="btn" href={href("/history")}>
          {t("nav.history")}
        </Link>
      </div>
    </section>
  );
}
