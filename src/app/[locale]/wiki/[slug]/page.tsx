import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getWikiArticle, wikiArticles, wikiNeighbours } from "@/lib/content/wiki";
import { localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return wikiArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  const article = getWikiArticle(slug);
  if (!article) return {};
  const { locale } = await getRequestContext(requestedLocale);
  return {
    title: article.question,
    description: article.summary,
    alternates: buildAlternates(`/wiki/${article.slug}`, locale),
    openGraph: {
      title: article.question,
      description: article.summary,
      type: "article",
    },
  };
}

export default async function WikiArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: requestedLocale, slug } = await params;
  const article = getWikiArticle(slug);
  if (!article) notFound();

  const { locale, t } = await getRequestContext(requestedLocale);
  const { previous, next } = wikiNeighbours(slug);
  const href = (path: string) => localizedPath(path, locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.question,
    description: article.summary,
    dateModified: article.lastReviewed,
    inLanguage: locale,
    publisher: { "@type": "Organization", name: "whenreset", url: config.siteUrl },
    citation: article.quotes.map((quote) => ({
      "@type": "CreativeWork",
      name: quote.source,
      url: quote.url,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="doc-layout">
        <aside className="toc">
          <p className="toc__title">{t("wiki.contents")}</p>
          <ul>
            {wikiArticles.map((item) => (
              <li key={item.slug}>
                <Link
                  href={href(`/wiki/${item.slug}`)}
                  aria-current={item.slug === slug ? "page" : undefined}
                >
                  {item.topic}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <article className="prose">
          <nav className="row tiny muted" aria-label="Breadcrumb" style={{ marginBottom: 8 }}>
            <Link href={href("/wiki")}>{t("wiki.title")}</Link>
            <span>/</span>
            <span>{article.topic}</span>
          </nav>

          <span className="tag">{article.topic}</span>
          <h1 className="h1" style={{ fontSize: "clamp(24px,3.2vw,34px)" }}>
            {article.question}
          </h1>
          <p className="lead">{article.summary}</p>
          <p className="tiny muted mono">
            {t("wiki.compiled")} · {t("wiki.sourcesChecked")} {article.sourcesChecked}
          </p>

          <div className="answer-split" style={{ marginTop: 18 }}>
            {article.answers.map((answer) => (
              <section key={answer.provider} className={`answer answer--${answer.provider}`}>
                <h2 style={{ marginTop: 0, fontSize: 17 }}>
                  {answer.provider === "codex" ? "Codex" : "Claude"}
                </h2>
                <p className="small" style={{ fontWeight: 700, marginTop: 0 }}>
                  {answer.verdict}
                </p>
                {answer.body.map((paragraph, index) => (
                  <p key={index} className="small">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <h2>{t("wiki.officialDocs")}</h2>
          {article.quotes.map((quote, index) => (
            <blockquote key={index}>
              {quote.text}
              <cite>
                <a href={quote.url} target="_blank" rel="noreferrer">
                  {quote.source}
                </a>
              </cite>
            </blockquote>
          ))}

          <h2>{t("wiki.inPractice")}</h2>
          <ul>
            {article.practice.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>

          <p className="tiny muted">{t("wiki.disclaimer")}</p>

          <div className="divider" />

          <nav className="spread">
            <div>
              {previous && (
                <Link className="link-arrow" href={href(`/wiki/${previous.slug}`)}>
                  ← {t("wiki.previous")}: {previous.topic}
                </Link>
              )}
            </div>
            <div>
              {next && (
                <Link className="link-arrow" href={href(`/wiki/${next.slug}`)}>
                  {t("wiki.next")}: {next.topic} →
                </Link>
              )}
            </div>
          </nav>
        </article>
      </section>
    </>
  );
}
