import Link from "next/link";
import type { Metadata } from "next";
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
    title: t("about.privacy"),
    alternates: buildAlternates("/privacy", locale),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  const href = (path: string) => localizedPath(path, locale);

  return (
    <article className="prose">
      <nav className="row tiny muted" aria-label="Breadcrumb" style={{ marginBottom: 8 }}>
        <Link href={href("/about")}>{t("about.title")}</Link>
        <span>/</span>
        <span>{t("about.privacy")}</span>
      </nav>
      <h1 className="h1" style={{ fontSize: "clamp(24px,3.2vw,34px)" }}>
        {t("about.privacy")}
      </h1>
      <p className="eyebrow">Updated 2026-09-17</p>

      <h2>What this site stores</h2>
      <ul>
        <li>
          <strong>Cookies.</strong> Three first-party cookies: <code>wr_locale</code> (the language
          you picked), <code>wr_tz</code> (a timezone hint used to render dates) and{" "}
          <code>wr_admin</code> (a signed session cookie, only set after you sign in to the admin
          panel). None of them are used for advertising or cross-site tracking.
        </li>
        <li>
          <strong>Local storage.</strong> Your theme choice (<code>wr_theme</code>) is kept in your
          browser&rsquo;s local storage. It never leaves your device.
        </li>
        <li>
          <strong>Notification subscriptions.</strong> If you enable notifications we store the
          minimum needed to deliver them: for push, the endpoint URL and the two encryption keys
          your browser generated; for Slack or Discord, the webhook URL you created; for email, the
          address you entered and a confirmation token. Nothing else is collected.
        </li>
        <li>
          <strong>Server logs.</strong> Aggregated request counts are kept in memory for rate
          limiting and are discarded within a minute. No IP addresses are written to the database.
        </li>
      </ul>

      <h2>What this site does not do</h2>
      <ul>
        <li>No advertising identifiers, no third-party analytics scripts, no fingerprinting.</li>
        <li>No sale or sharing of personal data.</li>
        <li>
          No reading of your usage limits. This site only records public announcements; it has no
          access to your account with any vendor.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Disable notifications at any time in your browser, or remove the subscription.</li>
        <li>
          Deleting the cookies and local storage entries for this site resets your language, timezone
          and theme preferences.
        </li>
        <li>
          To have a notification subscription or email address removed, send the request through a
          contact channel on the <Link href={href("/about")}>about page</Link>. Include the channel
          and the target so it can be located.
        </li>
      </ul>

      <h2>Third parties</h2>
      <p>
        Announcement links point to X (Twitter) and to vendor documentation. Following those links
        puts you under the destination site&rsquo;s own privacy policy. Codex history is ingested
        from the public codex-resets.com API; no personal data is exchanged in that direction.
      </p>

      <h2>Data retention</h2>
      <p>
        Reset announcements are historical records and are kept indefinitely. Delivery records are
        kept so a repeated announcement is never sent twice. Notification subscriptions are removed
        when the endpoint or webhook becomes permanently invalid.
      </p>

      <p className="tiny muted">
        This page describes the reference implementation shipped with this project. Operators running
        their own copy should adapt it to their jurisdiction and infrastructure.
      </p>
    </article>
  );
}
