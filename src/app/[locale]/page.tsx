import Link from "next/link";
import { ProviderCard } from "@/components/ProviderCard";
import { RecordsTable } from "@/components/RecordsTable";
import { SiteFaq } from "@/components/SiteFaq";
import { durationLabels, tableLabels } from "@/lib/labels";
import { allProviderStatuses, latestRecords } from "@/lib/repo";
import { config } from "@/lib/config";
import { localizedPath } from "@/lib/i18n";
import { getRequestContext } from "@/lib/server-context";
import { PROVIDERS } from "@/lib/providers";
import { formatDate, humanDuration, durationBetween } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const { locale, timeZone, t } = await getRequestContext(requestedLocale);
  const statuses = allProviderStatuses();
  const records = latestRecords(14);
  const href = (path: string) => localizedPath(path, locale);
  const overall = statuses.reduce(
    (acc, status) => acc + status.stats.total,
    0,
  );

  const faq = [
    { q: t("faq.q.today"), a: t("faq.a.today") },
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
        "@type": "WebSite",
        name: "whenreset",
        url: config.siteUrl,
        description: t("site.description"),
        inLanguage: locale,
      },
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
        name: "Usage limit reset history",
        description:
          "Official usage-limit reset announcements for Codex, Claude and Grok with links to the original posts.",
        license: "https://creativecommons.org/licenses/by/4.0/",
        creator: { "@type": "Organization", name: "whenreset" },
        variableMeasured: statuses.map((status) => ({
          "@type": "PropertyValue",
          name: `${status.provider.name} resets`,
          value: status.stats.total,
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section>
        <p className="eyebrow">{t("home.eyebrow")}</p>
        <h1 className="h1">{t("home.h1")}</h1>
        <p className="lead">{t("home.sub")}</p>
        <div className="row" style={{ marginTop: 16 }}>
          <Link href={href("/history")} className="btn btn--primary">
            {t("nav.history")}
          </Link>
          <a href="#remind" className="btn">
            🔔 {t("home.remindFree")}
          </a>
          <a className="btn" href="/api/feed?format=rss">
            RSS
          </a>
          <span className="tiny muted mono">
            {overall} {t("stats.totalResets").toLowerCase()} ·{" "}
            {statuses
              .map((status) =>
                status.stats.lastResetAt
                  ? `${status.provider.name} ${humanDuration(
                      durationBetween(new Date(), status.stats.lastResetAt),
                      "coarse",
                      durationLabels(t),
                    )}`
                  : "",
              )
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </section>

      <section className="section">
        <div className="provider-grid">
          {statuses.map((status) => (
            <ProviderCard
              key={status.provider.id}
              status={status}
              t={t}
              locale={locale}
              timeZone={timeZone}
              href={href(`/${status.provider.id}`)}
            />
          ))}
        </div>
      </section>

      <section className="section" id="remind">
        <div className="card card--pad-lg">
          <div className="spread">
            <div>
              <h2 className="h2">🔔 {t("remind.title")}</h2>
              <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
                {t("remind.sub")} {t("faq.a.notify")}
              </p>
            </div>
            <div className="row">
              <Link href={href("/history")} className="btn">
                {t("nav.history")}
              </Link>
              <a className="btn btn--accent" href="#top">
                ↑
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="h2" style={{ margin: 0 }}>
            {t("home.recent")}
          </h2>
          <Link href={href("/history")} className="link-arrow">
            {t("nav.history")}
          </Link>
        </div>
        <RecordsTable
          records={records}
          labels={tableLabels(t)}
          locale={locale}
          timeZone={timeZone}
          initial={8}
          searchable
        />
      </section>

      <section className="section">
        <h2 className="h2">{t("stats.daysSince")}</h2>
        <div className="stat-grid">
          {statuses.map((status) => (
            <div className="stat" key={status.provider.id}>
              <div className="stat__label">{status.provider.name}</div>
              <div className="stat__value">
                {status.stats.daysSinceLast !== null
                  ? status.stats.daysSinceLast.toFixed(1)
                  : "—"}
                <small>{t("stats.days")}</small>
              </div>
              <div className="stat__sub">
                {status.stats.lastResetAt
                  ? formatDate(status.stats.lastResetAt, locale, timeZone)
                  : t("stats.notEnough")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="h2" style={{ margin: 0 }}>
            {t("faq.title")}
          </h2>
          <Link href={href("/wiki")} className="link-arrow">
            {t("wiki.title")}
          </Link>
        </div>
        <SiteFaq items={faq} />
      </section>

      <section className="section">
        <div className="card card--flat">
          <h2 className="h3">{t("api.title")}</h2>
          <p className="muted small">{t("api.sub")}</p>
          <div className="row mono tiny">
            <code>GET /api/v1/status</code>
            <code>GET /api/v1/resets?limit=50</code>
            <code>GET /api/feed?format=rss</code>
            <code>GET /api/ical</code>
            <Link href="/api/docs" className="link-arrow">
              {t("footer.docs")}
            </Link>
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            {PROVIDERS.flatMap((p) => p.sources.map((s) => `@${s.handle}`)).join(", ")}
          </p>
        </div>
      </section>
    </>
  );
}
