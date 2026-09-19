import { buildCalendar } from "@/lib/stats";
import { formatDate } from "@/lib/format";
import type { Translate } from "@/lib/i18n";
import type { ResetRecord } from "@/lib/types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function ResetCalendar({
  records,
  t,
  locale,
  timeZone,
  weeks = 26,
  now,
}: {
  records: ResetRecord[];
  t: Translate;
  locale: string;
  timeZone: string;
  weeks?: number;
  now?: Date;
}) {
  const calendar = buildCalendar(records, now ?? new Date(), weeks);

  return (
    <div className="stack">
      <div className="calendar" role="img" aria-label={t("chart.title")}>
        <div className="calendar__weekdays" aria-hidden="true">
          {WEEKDAYS.map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>
        <div className="calendar__body">
          <div className="calendar__months" aria-hidden="true">
            {calendar.map((week) => (
              <span key={week.start}>{week.monthLabel ?? ""}</span>
            ))}
          </div>
          <div className="calendar__grid">
            {calendar.map((week) =>
              week.days.map((day) => {
                const classes = ["calendar__day"];
                if (day.total === 0 && day.weekend) classes.push("calendar__day--weekend");
                if (day.regular > 0 && day.banked > 0) classes.push("calendar__day--both");
                else if (day.banked > 0) classes.push("calendar__day--banked");
                else if (day.regular > 0) classes.push("calendar__day--regular");

                const label =
                  day.total === 0
                    ? `${formatDate(`${day.date}T00:00:00Z`, locale, timeZone)}, ${t("chart.noEvents")}`
                    : `${formatDate(`${day.date}T00:00:00Z`, locale, timeZone)}, ${day.total} ${t("chart.events")}`;

                return (
                  <button
                    key={day.date}
                    type="button"
                    className={classes.join(" ")}
                    title={label}
                    aria-label={label}
                    tabIndex={-1}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="legend">
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: "var(--codex)", borderColor: "var(--line)" }} />
          {t("chart.legend.regular")}
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: "var(--warn)", borderColor: "var(--line)" }} />
          {t("chart.legend.banked")}
        </span>
        <span className="legend__item">
          <span className="legend__swatch" />
          {t("chart.legend.none")}
        </span>
      </div>
    </div>
  );
}
