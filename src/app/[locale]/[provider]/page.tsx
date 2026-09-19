import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProviderCard } from "@/components/ProviderCard";
import { RecordsTable } from "@/components/RecordsTable";
import { ResetCalendar } from "@/components/ResetCalendar";
import { SiteFaq } from "@/components/SiteFaq";
import { StatsGrid } from "@/components/StatsGrid";
import { tableLabels } from "@/lib/labels";
import { PROVIDERS, getProvider } from "@/lib/providers";
import { allResetsFor, providerStatus } from "@/lib/repo";
import { localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { wikiArticles } from "@/lib/content/wiki";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return PROVIDERS.map((provider) => ({ provider: provider.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; provider: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale, provider: id } = await params;
  const provider = getProvider(id);
  if (!provider) return {};
  const { locale, t } = await getRequestContext(requestedLocale);
  const canonical = localizedPath(`/${provider.id}`, locale);
  return {
    title: t(`page.${provider.id}.title`),
    description: t(`page.${provider.id}.sub`),
    alternates: buildAlternates(`/${provider.id}`, locale),
    openGraph: {
      title: t(`page.${provider.id}.title`),
      description: t(`page.${provider.id}.sub`),
      url: canonical,
      type: "website",
    },
  };
}

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ locale: string; provider: string }>;
}) {
  const { locale: requestedLocale, provider: id } = await params;
  const provider = getProvider(id);
  if (!provider) notFound();

  const { locale, timeZone, t } = await getRequestContext(requestedLocale);
  const status = providerStatus(provider);
  const records = allResetsFor(provider.id);
  const href = (path: string) => localizedPath(path, locale);

  const faq = [
    { q: t(`faq.q.today`).replace("{provider}", provider.name), a: t("faq.a.today") },
    { q: t("faq.q.whatIsReset"), a: t("faq.a.whatIsReset") },
    { q: t("faq.q.difference"), a: t("faq.a.difference") },
    { q: t("faq.q.ownLimit"), a: t("faq.a.ownLimit") },
    { q: t("faq.q.notify"), a: t("faq.a.notify") },
    { q: t("faq.q.estimate"), a: t("faq.a.estimate") },
    { q: t("faq.q.missing"), a: t("faq.a.missing") },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
      {
        "@type": "Dataset",
        name: `${provider.name} usage reset history`,
        description: `Announced ${provider.name} usage-limit resets with links to the original posts.`,
        url: `${config.siteUrl}${href(`/${provider.id}`)}`,
        creator: { "@type": "Organization", name: "whenreset" },
        temporalCoverage:
          status.stats.firstResetAt && status.stats.lastResetAt
            ? `${status.stats.firstResetAt}/${status.stats.lastResetAt}`
            : undefined,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="row tiny muted" aria-label="Breadcrumb" style={{ marginBottom: 10 }}>
        <Link href={href("/")}>{t("nav.home")}</Link>
        <span>/</span>
        <span>{provider.name}</span>
      </nav>

      <section>
        <div className="spread">
          <div style={{ maxWidth: "64ch" }}>
            <p className="eyebrow">{provider.vendor}</p>
            <h1 className="h1" style={{ fontSize: "clamp(26px,3.6vw,38px)" }}>
              {t(`page.${provider.id}.title`)}
            </h1>
            <p className="lead">{t(`page.${provider.id}.sub`)}</p>
            <p className="small muted">
              {t("page.keepingTrack", {
                sources: provider.sources
                  .map((source) => `@${source.handle}`)
                  .join(", "),
              })}{" "}
              {t("page.aboutProvider")}
            </p>
          </div>

          <div className="stack" style={{ minWidth: 260 }}>
            <a className="btn" href={provider.usageUrl} target="_blank" rel="noreferrer">
              {t("page.checkOwn")} ↗
            </a>
            <a className="btn" href={provider.statusUrl} target="_blank" rel="noreferrer">
              {t("page.statusPage")} ↗
            </a>
            <a className="btn" href={`/api/feed?provider=${provider.id}&format=rss`}>
              RSS · {provider.name}
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <StatsGrid
          stats={status.stats}
          forecast={status.forecast}
          t={t}
          locale={locale}
          timeZone={timeZone}
        />
      </section>

      {status.watch && (
        <section className="section">
          <div className="banner">
            <span aria-hidden="true">⚡</span>
            <div>
              <strong>{t("stats.activeWatch")}</strong>
              <p style={{ margin: "4px 0 0" }}>{status.watch.text}</p>
              <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                {status.watch.forecastWindow} · {formatDateTime(status.watch.observedAt, locale, timeZone)}
                {status.watch.resetChancePercent !== null
                  ? ` · ${status.watch.resetChancePercent}%`
                  : ""}
              </p>
            </div>
          </div>
        </section>
      )}

      {status.scheduled && (
        <section className="section">
          <div className="banner banner--info">
            <span aria-hidden="true">🗓</span>
            <div>
              <strong>{t("stats.scheduled")}</strong>
              <p style={{ margin: "4px 0 0" }}>{status.scheduled.text}</p>
              {status.scheduled.scheduledFor && (
                <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                  {formatDateTime(status.scheduled.scheduledFor, locale, timeZone)}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="card">
          <h2 className="h3">{t("chart.title")}</h2>
          <ResetCalendar
            records={records}
            t={t}
            locale={locale}
            timeZone={timeZone}
            weeks={26}
          />
        </div>
      </section>

      <section className="section">
        <RecordsTable
          records={records}
          labels={tableLabels(t)}
          locale={locale}
          timeZone={timeZone}
          initial={12}
          searchable
          showTitle
        />
      </section>

      <section className="section">
        <div className="provider-grid">
          {PROVIDERS.filter((p) => p.id !== provider.id).map((other) => (
            <ProviderCard
              key={other.id}
              status={providerStatus(other)}
              t={t}
              locale={locale}
              timeZone={timeZone}
              href={href(`/${other.id}`)}
            />
          ))}
        </div>
      </section>

      <section className="section doc-layout">
        <aside className="toc">
          <p className="toc__title">{t("wiki.title")}</p>
          <ul>
            {wikiArticles.map((article) => (
              <li key={article.slug}>
                <Link href={href(`/wiki/${article.slug}`)}>{article.topic}</Link>
              </li>
            ))}
          </ul>
        </aside>
        <div>
          <h2 className="h2">{t("faq.title")}</h2>
          <SiteFaq items={faq} />
          <div className="card card--flat" style={{ marginTop: 18 }}>
            <h3 className="h3">{t("page.checkOwn")}</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              {t("faq.a.ownLimit")}
            </p>
            <ul className="small">
              <li>
                <a href={provider.usageUrl} target="_blank" rel="noreferrer">
                  {provider.usageLabel}
                </a>
              </li>
              <li>
                <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                  {provider.vendor} documentation
                </a>
              </li>
              <li>
                <a href={provider.statusUrl} target="_blank" rel="noreferrer">
                  {provider.vendor} status
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
