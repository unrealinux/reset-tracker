import Link from "next/link";
import type { Metadata } from "next";
import { wikiArticles } from "@/lib/content/wiki";
import { localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  return {
    title: `${t("wiki.title")} — ${t("wiki.sub")}`,
    description: t("wiki.sub"),
    alternates: buildAlternates("/wiki", locale),
  };
}

export default async function WikiIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  const href = (path: string) => localizedPath(path, locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("wiki.title"),
    itemListElement: wikiArticles.map((article, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: article.question,
      url: `${href(`/wiki/${article.slug}`)}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section>
        <p className="eyebrow">{t("wiki.compiled")}</p>
        <h1 className="h1" style={{ fontSize: "clamp(26px,3.6vw,38px)" }}>
          {t("wiki.title")}
        </h1>
        <p className="lead">{t("wiki.sub")}</p>
      </section>

      <section className="section doc-layout">
        <aside className="toc">
          <p className="toc__title">{t("wiki.contents")}</p>
          <ul>
            {wikiArticles.map((article) => (
              <li key={article.slug}>
                <Link href={href(`/wiki/${article.slug}`)}>{article.topic}</Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="stack" style={{ gap: 14 }}>
          {wikiArticles.map((article) => (
            <article key={article.slug} className="card">
              <div className="spread">
                <span className="tag">{article.topic}</span>
                <span className="tiny muted mono">
                  {t("wiki.sourcesChecked")} {article.sourcesChecked}
                </span>
              </div>
              <h2 className="h3" style={{ marginTop: 10 }}>
                <Link href={href(`/wiki/${article.slug}`)}>{article.question}</Link>
              </h2>
              <p className="muted small" style={{ marginBottom: 10 }}>
                {article.summary}
              </p>
              <div className="row">
                <span className="pill pill--codex">Codex</span>
                <span className="small muted">{article.short.codex}</span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <span className="pill pill--claude">Claude</span>
                <span className="small muted">{article.short.claude}</span>
              </div>
              <p style={{ marginBottom: 0, marginTop: 12 }}>
                <Link className="link-arrow" href={href(`/wiki/${article.slug}`)}>
                  {t("wiki.read")}
                </Link>
              </p>
            </article>
          ))}
          <p className="tiny muted">{t("wiki.disclaimer")}</p>
        </div>
      </section>
    </>
  );
}
