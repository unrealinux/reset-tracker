import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { LOCALES, isLocaleCode, localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";
import { PROVIDERS } from "@/lib/providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { themeBootstrapScript } from "@/components/ThemeToggle";
import { allProviderStatuses } from "@/lib/repo";
import "../globals.css";

/**
 * This is the application's root layout: locale is a real path segment
 * (`/ja/codex`), never inferred from a request header. That keeps a hard
 * refresh, a shared link, a crawler and the standalone server all in agreement,
 * and it lets `<html lang>` be correct on the very first byte.
 */

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale: locale.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requested } = await params;
  const { locale, t } = await getRequestContext(requested);

  return {
    metadataBase: new URL(config.siteUrl),
    title: { default: t("site.title"), template: "%s | whenreset" },
    description: t("site.description"),
    applicationName: "whenreset",
    alternates: buildAlternates("/", locale),
    openGraph: {
      type: "website",
      siteName: "whenreset.dev",
      title: t("site.title"),
      description: t("site.description"),
      url: localizedPath("/", locale),
      images: [{ url: "/api/og", width: 1200, height: 630, alt: "whenreset" }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("site.title"),
      description: t("site.description"),
      images: ["/api/og"],
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: requested } = await params;
  // The segment is validated here, so a hand-typed /xx/... is a 404 rather
  // than a page rendered in a language that does not exist.
  if (!isLocaleCode(requested)) notFound();

  const { locale, timeZone, t } = await getRequestContext(requested);
  const meta = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  const statuses = allProviderStatuses();
  const sourceHandles = PROVIDERS.flatMap((p) => p.sources.map((s) => `@${s.handle}`)).filter(
    (handle, index, list) => list.indexOf(handle) === index,
  );

  const href = (path: string) => localizedPath(path, locale);

  return (
    <html lang={meta.htmlLang} dir={meta.dir} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Reset announcements"
          href="/api/feed?format=rss"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Codex resets"
          href="/api/feed?provider=codex&format=rss"
        />
      </head>
      <body>
        <SiteHeader
          locale={locale}
          homeHref={href("/")}
          nav={[
            { href: href("/"), label: t("nav.home"), match: ["/", "/codex", "/claude", "/grok"] },
            { href: href("/history"), label: t("nav.history") },
            { href: href("/wiki"), label: t("nav.wiki") },
            { href: href("/prompts"), label: t("nav.prompts") },
            { href: href("/about"), label: t("nav.about") },
          ]}
          localeOptions={LOCALES.map((l) => ({ code: l.code, label: l.label }))}
          labels={{
            theme: t("common.theme"),
            auto: t("common.theme.auto"),
            light: t("common.theme.light"),
            dark: t("common.theme.dark"),
            remind: t("home.remind"),
            language: t("common.language"),
            menu: "Menu",
          }}
          remindLabels={{
            title: t("remind.title"),
            sub: t("remind.sub"),
            browser: t("remind.browser"),
            browserOn: t("remind.browser.on"),
            browserOff: t("remind.browser.off"),
            browserBlocked: t("remind.browser.blocked"),
            browserUnsupported: t("remind.browser.unsupported"),
            telegram: t("remind.telegram"),
            slack: t("remind.slack"),
            discord: t("remind.discord"),
            email: t("remind.email"),
            emailPlaceholder: t("remind.email.placeholder"),
            emailSend: t("remind.email.send"),
            emailSent: t("remind.email.sent"),
            webhookCreate: t("remind.webhook.create"),
            webhookCopy: t("remind.webhook.copy"),
            webhookCopied: t("remind.webhook.copied"),
            webhookHint: t("remind.webhook.hint"),
            webhookProviders: t("remind.webhook.providers"),
            close: t("remind.close"),
            pushEnabled: t("remind.push.enabled"),
            pushDenied: t("remind.push.denied"),
            pushError: t("remind.push.error"),
            followAll: t("remind.followAll"),
          }}
          providers={statuses.map((s) => ({ id: s.provider.id, name: s.provider.name }))}
          telegramUrl={config.telegram.channelUrl || null}
          vapidPublicKey={config.vapid.publicKey || null}
        />
        <main>
          <div className="shell">{children}</div>
        </main>
        <SiteFooter t={t} locale={locale} sourceHandles={sourceHandles} />
        <span hidden data-timezone={timeZone} />
      </body>
    </html>
  );
}
