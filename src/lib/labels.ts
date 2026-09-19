import type { Translate } from "./i18n";

export interface DurationLabels {
  day: string;
  days: string;
  hour: string;
  hours: string;
  minute: string;
  minutes: string;
  dayShort: string;
}

export interface TableLabels {
  date: string;
  type: string;
  appliesTo: string;
  reason: string;
  post: string;
  landed: string;
  followUp: string;
  viewOnX: string;
  postPlus: string;
  empty: string;
  showAll: string;
  showFewer: string;
  swipe: string;
  search: string;
  results: string;
  all: string;
  typeRegular: string;
  typeBanked: string;
  title: string;
}

/**
 * Renders the forecast delta the way the reference trackers do:
 * "2.4 days to go", "Overdue by 3 days", "5 hours to go".
 */
export function estimateLabel(daysRemaining: number, t: Translate): string {
  const abs = Math.abs(daysRemaining);
  const overdue = daysRemaining < 0;

  if (abs < 1 / 24) return t("stats.lessThanHour");

  if (abs < 1) {
    const hours = Math.max(1, Math.round(abs * 24));
    const unit = hours === 1 ? t("common.hour") : t("common.hours");
    return overdue
      ? `${t("stats.overdue")} ${hours} ${unit}`
      : `${hours} ${unit} ${t("stats.toGo")}`;
  }

  const days = Math.round(abs);
  const unit = days === 1 ? t("common.day") : t("common.days");
  return overdue
    ? `${t("stats.overdue")} ${days} ${unit}`
    : `${days} ${unit} ${t("stats.toGo")}`;
}

/** Builds the table labels from a translator (server-safe). */
export function tableLabels(t: Translate): TableLabels {
  return {
    date: t("table.date"),
    type: t("table.type"),
    appliesTo: t("table.appliesTo"),
    reason: t("table.reason"),
    post: t("table.post"),
    landed: t("table.landed"),
    followUp: t("table.followUp"),
    viewOnX: t("table.viewOnX"),
    postPlus: t("table.postPlus"),
    empty: t("table.empty"),
    showAll: t("table.showAll"),
    showFewer: t("table.showFewer"),
    swipe: t("table.swipe"),
    search: t("table.search"),
    results: t("table.results"),
    all: t("table.all"),
    typeRegular: t("type.regular"),
    typeBanked: t("type.banked"),
    title: t("table.title"),
  };
}

export function durationLabels(t: Translate): DurationLabels {
  return {
    day: t("common.day"),
    days: t("common.days"),
    hour: t("common.hour"),
    hours: t("common.hours"),
    minute: t("common.minute"),
    minutes: t("common.minutes"),
    dayShort: t("common.dayShort"),
  };
}
