import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { LOCALES, localizedPath } from "@/lib/i18n";
import { PROVIDERS } from "@/lib/providers";
import { wikiArticles } from "@/lib/content/wiki";
import { prompts } from "@/lib/content/prompts";
import { listResets } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = config.siteUrl;
  const now = new Date();

  const staticPaths = [
    "/",
    "/history",
    "/wiki",
    "/prompts",
    "/about",
    "/privacy",
    "/cookies",
    ...PROVIDERS.map((p) => `/${p.id}`),
    ...wikiArticles.map((a) => `/wiki/${a.slug}`),
    ...prompts.map((p) => `/prompts/${p.slug}`),
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const path of staticPaths) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${base}${localizedPath(path, locale.code)}`,
        lastModified: now,
        changeFrequency: path === "/" || path === "/history" ? "daily" : "weekly",
        priority: path === "/" ? 1 : path.startsWith("/wiki/") || path.startsWith("/prompts/") ? 0.6 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            LOCALES.map((item) => [item.htmlLang, `${base}${localizedPath(path, item.code)}`]),
          ),
        },
      });
    }
  }

  const latest = listResets({ limit: 1 })[0];
  if (latest) {
    entries.push({
      url: `${base}/api/v1/status`,
      lastModified: new Date(latest.announcedAt),
      changeFrequency: "hourly",
      priority: 0.4,
    });
  }

  return entries;
}
