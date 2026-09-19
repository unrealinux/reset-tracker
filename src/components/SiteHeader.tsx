"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LocaleSwitcher, type LocaleOption } from "./LocaleSwitcher";
import { ReminderPanel, type ReminderLabels, type ReminderProvider } from "./ReminderPanel";
import { ThemeToggle } from "./ThemeToggle";

export interface NavItem {
  href: string;
  label: string;
  match?: string[];
}

export function SiteHeader({
  locale,
  nav,
  localeOptions,
  labels,
  remindLabels,
  providers,
  telegramUrl,
  vapidPublicKey,
  homeHref,
}: {
  locale: string;
  nav: NavItem[];
  localeOptions: LocaleOption[];
  labels: { theme: string; auto: string; light: string; dark: string; remind: string; language: string; menu: string };
  remindLabels: ReminderLabels;
  providers: ReminderProvider[];
  telegramUrl: string | null;
  vapidPublicKey: string | null;
  homeHref: string;
}) {
  const pathname = usePathname();
  const [remindOpen, setRemindOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const isActive = (item: NavItem) => {
    const candidates = item.match ?? [item.href];
    return candidates.some((candidate) =>
      candidate === "/" ? pathname === "/" || /^\/[a-z]{2}(-[A-Z]{2})?$/.test(pathname) : pathname.startsWith(candidate),
    );
  };

  return (
    <>
      <header className="site-header">
        <div className="shell site-header__inner">
          <Link href={homeHref} className="brand" aria-label="whenreset home">
            <span className="brand__mark">WR</span>
            whenreset<span className="brand__dot">.</span>
          </Link>

          <nav className="nav" aria-label="Main" data-open={navOpen}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav__link"
                aria-current={isActive(item) ? "page" : undefined}
                onClick={() => setNavOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="header-tools">
            <button
              type="button"
              className="icon-button"
              onClick={() => setRemindOpen(true)}
              title={labels.remind}
            >
              <span aria-hidden="true">🔔</span>
              <span className="tiny" style={{ fontWeight: 700 }}>
                {labels.remind}
              </span>
            </button>
            <LocaleSwitcher locale={locale} options={localeOptions} label={labels.language} />
            <ThemeToggle
              labels={{
                auto: labels.auto,
                light: labels.light,
                dark: labels.dark,
                title: labels.theme,
              }}
            />
          </div>
        </div>
      </header>

      <ReminderPanel
        labels={remindLabels}
        providers={providers}
        telegramUrl={telegramUrl}
        vapidPublicKey={vapidPublicKey}
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
      />
    </>
  );
}
