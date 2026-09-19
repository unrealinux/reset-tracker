import Link from "next/link";
import type { Metadata } from "next";
import { PROVIDERS } from "@/lib/providers";
import { lastPoll } from "@/lib/repo";
import { formatDateTime } from "@/lib/format";
import { localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";
import { wikiArticles } from "@/lib/content/wiki";
import { prompts } from "@/lib/content/prompts";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  return {
    title: t("about.title"),
    description: t("about.sub"),
    alternates: buildAlternates("/about", locale),
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const { locale, timeZone, t } = await getRequestContext(requestedLocale);
  const href = (path: string) => localizedPath(path, locale);
  const poll = lastPoll();

  return (
    <section className="doc-layout">
      <aside className="toc">
        <p className="toc__title">{t("about.title")}</p>
        <ul>
          <li>
            <Link href={href("/wiki")}>{t("wiki.title")}</Link>
          </li>
          <li>
            <Link href={href("/prompts")}>{t("prompts.title")}</Link>
          </li>
          <li>
            <Link href={href("/privacy")}>{t("about.privacy")}</Link>
          </li>
          <li>
            <Link href={href("/cookies")}>{t("about.cookies")}</Link>
          </li>
          <li>
            <a href="/api/docs">{t("footer.docs")}</a>
          </li>
        </ul>
      </aside>

      <article className="prose">
        <p className="eyebrow">{t("about.updated")} 2026-09-17</p>
        <h1 className="h1" style={{ fontSize: "clamp(26px,3.4vw,36px)" }}>
          {t("about.title")}
        </h1>
        <p className="lead">{t("about.sub")}</p>

        <h2>About this project</h2>
        <p>
          This site gathers official Codex, Claude and Grok usage-limit reset announcements, links
          every record to its original post, and adds practical reference material. It is an
          independent informational project. It does not represent OpenAI, Anthropic, xAI or their
          support teams, and a listed reset is not a promise that any particular account receives
          one.
        </p>

        <h2>{t("about.dataSources")}</h2>
        <ul>
          {PROVIDERS.map((provider) => (
            <li key={provider.id}>
              <strong>{provider.name}</strong> —{" "}
              {provider.sources.map((source, index) => (
                <span key={source.handle}>
                  {index > 0 ? ", " : ""}
                  <a href={source.url} target="_blank" rel="noreferrer">
                    @{source.handle}
                  </a>
                </span>
              ))}
              . Usage settings:{" "}
              <a href={provider.usageUrl} target="_blank" rel="noreferrer">
                {provider.usageLabel}
              </a>
              .
            </li>
          ))}
          <li>
            Codex history is ingested from the free public{" "}
            <a href="https://codex-resets.com" target="_blank" rel="noreferrer">
              codex-resets.com
            </a>{" "}
            API, with attribution shown in the footer.
          </li>
        </ul>

        {poll && (
          <p className="small muted">
            {t("footer.lastChecked")}:{" "}
            <b>
              {formatDateTime(poll.finished_at ?? poll.started_at, locale, timeZone)}
            </b>{" "}
            · source <code>{poll.source}</code> · {poll.inserted} new, {poll.updated} updated,{" "}
            {poll.skipped} unchanged
            {poll.error ? ` · error: ${poll.error}` : ""}
          </p>
        )}

        <h2>Sources and editorial approach</h2>
        <p>
          Records keep the announcement text verbatim and link the original post. Scope and reason
          are taken from the source table when available; otherwise they are inferred with
          documented heuristics and can be corrected by hand in the admin panel. Collection and
          review can be delayed, so a missing record does not prove that no reset happened.
        </p>
        <p>
          The <Link href={href("/wiki")}>{wikiArticles.length} reference articles</Link> cite
          official vendor documentation with quotes and links. The{" "}
          <Link href={href("/prompts")}>{prompts.length} prompts</Link> are original material
          written for this project. Whole-history statistics are computed over confirmed records
          only; records awaiting review are hidden from the public pages and the API.
        </p>

        <h2>Forecasts</h2>
        <p>
          The &ldquo;next, estimated&rdquo; date is a trimmed mean of every interval between consecutive
          resets, so a single unusually long or short gap cannot distort it. Banked reset cards are
          excluded, because a card does not restore usage until it is redeemed. Confidence is
          reported from how much the interval history varies — a choppy series is labelled low even
          when the mean looks tidy. It is not an official schedule, and it is not your personal
          quota reset time.
        </p>

        <h2>{t("about.contact")}</h2>
        <p>
          Found a missing announcement, a wrong scope or a broken link? Send the original post URL
          through any contact channel listed here. Do not post subscription tokens, webhook URLs or
          other personal information.
        </p>

        <h2>Attribution</h2>
        <p>
          The API and feeds are free to use and need no key. In return, please credit this site with
          a link wherever you display the data, for example:{" "}
          <code>Data from &lt;a href=&quot;{href("/")}&quot;&gt;whenreset&lt;/a&gt;</code>.
        </p>

        <div className="card card--flat">
          <h3 style={{ marginTop: 0 }}>{t("api.endpoints")}</h3>
          <ul className="mono small">
            <li>GET /api/v1/status</li>
            <li>GET /api/v1/resets?limit=50&amp;provider=codex&amp;order=desc</li>
            <li>GET /api/v1/providers</li>
            <li>GET /api/feed?provider=all&amp;format=rss|atom|json</li>
            <li>GET /api/ical?provider=all</li>
            <li>
              <a href="/api/docs">GET /api/docs</a> — Swagger UI
            </li>
            <li>
              <a href="/api/v1/openapi.json">GET /api/v1/openapi.json</a>
            </li>
          </ul>
        </div>
      </article>
    </section>
  );
}
