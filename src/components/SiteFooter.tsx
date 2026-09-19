import Link from "next/link";
import { lastPoll } from "@/lib/repo";
import { PROVIDERS } from "@/lib/providers";
import { localizedPath, type Translate } from "@/lib/i18n";

export function SiteFooter({
  t,
  locale,
  sourceHandles,
}: {
  t: Translate;
  locale: string;
  sourceHandles: string[];
}) {
  const poll = lastPoll();
  const lastChecked = poll?.finished_at ?? poll?.started_at ?? null;
  const href = (path: string) => localizedPath(path, locale);

  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="site-footer__grid">
          <div>
            <h4>whenreset</h4>
            <p className="small muted" style={{ marginTop: 0 }}>
              {t("footer.independent")}
            </p>
            <p className="small muted">{t("footer.dataFrom", { handles: sourceHandles.join(", ") })}</p>
          </div>

          <div>
            <h4>{t("nav.home")}</h4>
            <ul>
              {PROVIDERS.map((provider) => (
                <li key={provider.id}>
                  <Link href={href(`/${provider.id}`)}>{provider.name}</Link>
                </li>
              ))}
              <li>
                <Link href={href("/history")}>{t("nav.history")}</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>{t("nav.wiki")}</h4>
            <ul>
              <li>
                <Link href={href("/wiki")}>{t("wiki.title")}</Link>
              </li>
              <li>
                <Link href={href("/prompts")}>{t("prompts.title")}</Link>
              </li>
              <li>
                <Link href={href("/about")}>{t("footer.about")}</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>{t("api.title")}</h4>
            <ul>
              <li>
                <a href="/api/v1/status">GET /api/v1/status</a>
              </li>
              <li>
                <a href="/api/v1/resets">GET /api/v1/resets</a>
              </li>
              <li>
                <a href="/api/docs">{t("footer.docs")}</a>
              </li>
              <li>
                <a href="/api/feed?format=rss">{t("footer.rss")}</a>
              </li>
              <li>
                <a href="/api/ical">{t("footer.ical")}</a>
              </li>
            </ul>
          </div>

          <div>
            <h4>{t("about.title")}</h4>
            <ul>
              <li>
                <Link href={href("/privacy")}>{t("footer.privacy")}</Link>
              </li>
              <li>
                <Link href={href("/cookies")}>{t("footer.cookies")}</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-note">
          <span>
            {t("footer.dataFrom", { handles: sourceHandles.join(", ") })}
            {lastChecked ? ` · ${t("footer.lastChecked")} ${lastChecked.slice(0, 16).replace("T", " ")} UTC` : ""}
          </span>
          <span>
            {t("footer.independent")} ·{" "}
            <a href="https://codex-resets.com" target="_blank" rel="noreferrer">
              Data from Codex Resets
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
