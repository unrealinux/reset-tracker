import type { Metadata } from "next";
import { LOCALES, localizedPath } from "./i18n";

/**
 * Canonical URL plus the full hreflang set for a page.
 *
 * A page-level `generateMetadata` replaces the parent layout's `alternates`
 * wholesale, so every page has to build its own — otherwise the hreflang links
 * silently disappear on exactly the pages that need them most.
 */
export function buildAlternates(path: string, locale: string): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const item of LOCALES) {
    languages[item.htmlLang] = localizedPath(path, item.code);
  }
  // Points crawlers at the default-locale URL when no language matches.
  languages["x-default"] = localizedPath(path, "en");

  return { canonical: localizedPath(path, locale), languages };
}
