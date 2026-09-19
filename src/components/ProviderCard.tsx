import Link from "next/link";
import { formatClock, formatShortDate, humanDuration, durationBetween } from "@/lib/format";
import { durationLabels, estimateLabel } from "@/lib/labels";
import { LiveDuration } from "./LiveDuration";
import type { Translate } from "@/lib/i18n";
import type { ProviderStatus } from "@/lib/types";

export function ProviderCard({
  status,
  t,
  locale,
  timeZone,
  href,
  showFoot = true,
}: {
  status: ProviderStatus;
  t: Translate;
  locale: string;
  timeZone: string;
  href: string;
  showFoot?: boolean;
}) {
  const { provider, stats, forecast, latest, watch } = status;

  const waitingFallback =
    latest && stats.daysSinceLast !== null
      ? humanDuration(
          durationBetween(new Date(), latest.announcedAt),
          "coarse",
          durationLabels(t),
        )
      : t("stats.notEnough");

  const estimateFallback =
    forecast.daysRemaining === null
      ? t("stats.notEnough")
      : estimateLabel(forecast.daysRemaining, t);

  return (
    <article className={`provider-card provider-card--${provider.accent}`} data-provider={provider.id}>
      <div className="provider-card__top">
        <span className="provider-card__name">
          <span className="provider-card__avatar" aria-hidden="true">
            {provider.name.slice(0, 2).toUpperCase()}
          </span>
          {provider.name}
        </span>
        {watch ? (
          <span className="pill pill--banked">⚡ {t("stats.activeWatch")}</span>
        ) : (
          <span className="pill">{provider.vendor}</span>
        )}
      </div>

      <div>
        <p className="eyebrow">{t("home.timeWaiting")}</p>
        <p className="provider-card__waiting">
          {latest ? (
            <LiveDuration
              mode="since"
              from={latest.announcedAt}
              fallback={waitingFallback}
              labels={durationLabels(t)}
              style="clock"
            />
          ) : (
            <span className="mono muted">—</span>
          )}
        </p>
        <p className="provider-card__meta">
          {latest ? (
            <span>
              {t("home.lastReset")}{" "}
              <b className="mono">
                {formatShortDate(latest.announcedAt, locale, timeZone)}{" "}
                {formatClock(latest.announcedAt, locale, timeZone)}
              </b>{" "}
              · {latest.resetType === "banked" ? t("type.banked") : t("type.regular")}
            </span>
          ) : (
            <span>{t("stats.notEnough")}</span>
          )}
          <span>
            {t("stats.nextEstimated")}:{" "}
            {forecast.estimatedAt ? (
              <b className="mono">{formatShortDate(forecast.estimatedAt, locale, timeZone)}</b>
            ) : (
              <span className="muted">—</span>
            )}{" "}
            {forecast.daysRemaining !== null && (
              <span className="muted">({estimateFallback})</span>
            )}
          </span>
        </p>
      </div>

      {showFoot && (
        <div className="provider-card__foot">
          <span className="tiny muted mono">
            {stats.total} {t("stats.totalResets").toLowerCase()}
            {stats.avgIntervalDays !== null ? ` · ⌀ ${stats.avgIntervalDays.toFixed(1)}${t("common.dayShort")}` : ""}
          </span>
          <Link href={href} className="link-arrow">
            {t("home.viewProvider")}
          </Link>
        </div>
      )}
    </article>
  );
}
