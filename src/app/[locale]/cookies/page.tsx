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
    title: t("about.cookies"),
    alternates: buildAlternates("/cookies", locale),
  };
}

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  const href = (path: string) => localizedPath(path, locale);

  const rows = [
    {
      name: "wr_locale",
      purpose: "Remembers the language you selected.",
      lifetime: "1 year",
      type: "First party",
    },
    {
      name: "wr_tz",
      purpose: "Timezone hint so dates render in your local zone.",
      lifetime: "1 year",
      type: "First party",
    },
    {
      name: "wr_admin",
      purpose:
        "Signed session cookie, set only after a successful admin sign-in. Not set for regular visitors.",
      lifetime: "12 hours",
      type: "First party, essential",
    },
    {
      name: "wr_theme",
      purpose: "Your light/dark/system preference. Stored in local storage, not a cookie.",
      lifetime: "Persistent",
      type: "Local storage",
    },
  ];

  return (
    <article className="prose">
      <nav className="row tiny muted" aria-label="Breadcrumb" style={{ marginBottom: 8 }}>
        <Link href={href("/about")}>{t("about.title")}</Link>
        <span>/</span>
        <span>{t("about.cookies")}</span>
      </nav>
      <h1 className="h1" style={{ fontSize: "clamp(24px,3.2vw,34px)" }}>
        {t("about.cookies")}
      </h1>
      <p className="eyebrow">Updated 2026-09-17</p>

      <p>
        This site uses no advertising or analytics cookies, so there is no consent banner to
        dismiss. Everything listed below exists to make the site work the way you configured it.
      </p>

      <div className="table-wrap" style={{ margin: "18px 0" }}>
        <table className="records">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Purpose</th>
              <th scope="col">Lifetime</th>
              <th scope="col">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="mono">{row.name}</td>
                <td>{row.purpose}</td>
                <td className="mono">{row.lifetime}</td>
                <td>{row.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Controlling them</h2>
      <p>
        Every browser lets you block or delete cookies and site data. Blocking them costs you the
        saved language, timezone and theme, but nothing else stops working. The admin cookie is
        required only to sign in to the admin panel.
      </p>

      <h2>Embedded content</h2>
      <p>
        Announcement links open on X (Twitter) in a new tab. That site may set its own cookies once
        you arrive; those are outside this project&rsquo;s control.
      </p>
    </article>
  );
}
