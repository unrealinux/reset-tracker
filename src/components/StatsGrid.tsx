import { formatClock, formatDate, formatDays, formatShortDate } from "@/lib/format";
import { estimateLabel } from "@/lib/labels";
import type { Translate } from "@/lib/i18n";
import type { Forecast, ResetStats } from "@/lib/types";

export function StatsGrid({
  stats,
  forecast,
  t,
  locale,
  timeZone,
}: {
  stats: ResetStats;
  forecast: Forecast;
  t: Translate;
  locale: string;
  timeZone: string;
}) {
  const confidence = t(`stats.confidence.${forecast.confidence}`);

  return (
    <div className="stat-grid">
      <div className="stat">
        <div className="stat__label">{t("stats.lastReset")}</div>
        <div className="stat__value">
          {stats.lastResetAt ? formatShortDate(stats.lastResetAt, locale, timeZone) : "—"}
          {stats.lastResetAt && <small>{formatClock(stats.lastResetAt, locale, timeZone)}</small>}
        </div>
        <div className="stat__sub">
          {stats.daysSinceLast !== null
            ? `${formatDays(stats.daysSinceLast)} ${t("stats.days")}`
            : t("stats.notEnough")}
        </div>
      </div>

      <div className="stat stat--highlight">
        <div className="stat__label">{t("stats.nextEstimated")}</div>
        <div className="stat__value">
          {forecast.estimatedAt ? formatShortDate(forecast.estimatedAt, locale, timeZone) : "—"}
        </div>
        <div className="stat__sub">
          {forecast.daysRemaining === null
            ? t("stats.notEnough")
            : estimateLabel(forecast.daysRemaining, t)}
          {" · "}
          {t("stats.confidence")}: {confidence}
          {forecast.basisDays !== null
            ? ` · ${t("stats.basis")} ${formatDays(forecast.basisDays)} ${t("common.days")}`
            : ""}
        </div>
      </div>

      <div className="stat">
        <div className="stat__label">{t("stats.avgInterval")}</div>
        <div className="stat__value">
          {formatDays(stats.avgIntervalDays)}
          <small>{t("stats.days")}</small>
        </div>
        <div className="stat__sub">
          {t("stats.longestWait")} {formatDays(stats.longestWaitDays)} {t("stats.days")}
        </div>
      </div>

      <div className="stat">
        <div className="stat__label">{t("stats.totalResets")}</div>
        <div className="stat__value">{stats.total}</div>
        <div className="stat__sub">
          {stats.regular} {t("type.regular.short")} · {stats.banked} {t("type.banked.short")}
        </div>
      </div>

      <div className="stat">
        <div className="stat__label">30 / 90</div>
        <div className="stat__value">
          {stats.last30d}
          <small>/ {stats.last90d}</small>
        </div>
        <div className="stat__sub">
          {stats.firstResetAt ? formatDate(stats.firstResetAt, locale, timeZone) : "—"}
        </div>
      </div>
    </div>
  );
}
