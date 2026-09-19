import Link from "next/link";
import type { Metadata } from "next";
import { RecordsTable } from "@/components/RecordsTable";
import { tableLabels } from "@/lib/labels";
import { PROVIDERS, isProviderId } from "@/lib/providers";
import { countResets, listResets, reasonsFor } from "@/lib/repo";
import { localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";
import type { ProviderId, ResetType } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  return {
    title: `${t("nav.history")} — ${t("table.title")}`,
    description: t("site.description"),
    alternates: buildAlternates("/history", locale),
  };
}

interface SearchParams {
  q?: string;
  provider?: string;
  type?: string;
  reason?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: requestedLocale } = await params;
  const search = await searchParams;
  const { locale, timeZone, t } = await getRequestContext(requestedLocale);
  const href = (path: string) => localizedPath(path, locale);

  const provider: ProviderId | "all" =
    search.provider && isProviderId(search.provider) ? search.provider : "all";
  const type: ResetType | "all" =
    search.type === "regular" || search.type === "banked" ? search.type : "all";
  const page = Math.max(1, Number(search.page ?? "1") || 1);

  const query = {
    provider,
    type,
    reason: search.reason ?? "all",
    q: search.q?.trim() || undefined,
    from: search.from ? `${search.from}T00:00:00.000Z` : undefined,
    to: search.to ? `${search.to}T23:59:59.999Z` : undefined,
    order: "desc" as const,
  };

  const total = countResets(query);
  const records = listResets({ ...query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const reasons = reasonsFor(provider);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (overrides: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q: search.q,
      provider: search.provider,
      type: search.type,
      reason: search.reason,
      from: search.from,
      to: search.to,
      page: search.page,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const queryString = next.toString();
    return `${href("/history")}${queryString ? `?${queryString}` : ""}`;
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("table.title"),
    numberOfItems: records.length,
    itemListElement: records.map((record, index) => ({
      "@type": "ListItem",
      position: (page - 1) * PAGE_SIZE + index + 1,
      name: `${record.provider} ${record.resetType} — ${record.announcedAt}`,
      url: record.sourceUrl ?? undefined,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section>
        <p className="eyebrow">{t("nav.history")}</p>
        <h1 className="h1" style={{ fontSize: "clamp(26px,3.6vw,38px)" }}>
          {t("table.title")}
        </h1>
        <p className="lead">{t("site.description")}</p>
      </section>

      <section className="section">
        <form className="card" method="get" action={href("/history")}>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="q">{t("table.search")}</label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={search.q ?? ""}
                placeholder={t("table.search")}
              />
            </div>
            <div className="field">
              <label htmlFor="provider">{t("table.filterProvider")}</label>
              <select id="provider" name="provider" defaultValue={search.provider ?? "all"}>
                <option value="all">{t("table.all")}</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="type">{t("table.filterType")}</label>
              <select id="type" name="type" defaultValue={search.type ?? "all"}>
                <option value="all">{t("table.all")}</option>
                <option value="regular">{t("type.regular")}</option>
                <option value="banked">{t("type.banked")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="reason">{t("table.filterReason")}</label>
              <select id="reason" name="reason" defaultValue={search.reason ?? "all"}>
                <option value="all">{t("table.all")}</option>
                {reasons.map((reason) => (
                  <option key={reason.reason} value={reason.reason}>
                    {reason.reason} ({reason.count})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="from">From</label>
              <input id="from" name="from" type="date" defaultValue={search.from ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="to">To</label>
              <input id="to" name="to" type="date" defaultValue={search.to ?? ""} />
            </div>
            <div className="row">
              <button type="submit" className="btn btn--primary">
                {t("common.filter")}
              </button>
              <Link className="btn" href={href("/history")}>
                {t("table.all")}
              </Link>
            </div>
          </div>
        </form>
      </section>

      <section className="section">
        <RecordsTable
          records={records}
          labels={tableLabels(t)}
          locale={locale}
          timeZone={timeZone}
          initial={PAGE_SIZE}
          showTitle
        />
      </section>

      {pages > 1 && (
        <nav className="row" style={{ justifyContent: "center", marginTop: 18 }} aria-label="Pagination">
          {page > 1 && (
            <Link className="btn btn--sm" href={buildHref({ page: String(page - 1) })}>
              ← {t("common.previous")}
            </Link>
          )}
          <span className="mono small">
            {t("common.page")} {page} {t("common.of")} {pages}
          </span>
          {page < pages && (
            <Link className="btn btn--sm" href={buildHref({ page: String(page + 1) })}>
              {t("common.next")} →
            </Link>
          )}
        </nav>
      )}

      <section className="section">
        <div className="row">
          <a className="btn" href="/api/v1/resets?limit=100">
            GET /api/v1/resets
          </a>
          <a className="btn" href="/api/feed?format=rss">
            RSS
          </a>
          <a className="btn" href="/api/ical">
            {t("footer.ical")}
          </a>
          <span className="tiny muted">
            {t("table.results").replace("{n}", String(total))}
          </span>
        </div>
      </section>
    </>
  );
}
