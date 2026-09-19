"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { authorLabel, formatClock, formatDate, formatShortDate } from "@/lib/format";
import type { TableLabels } from "@/lib/labels";
import type { ResetRecord } from "@/lib/types";

export type { TableLabels };

export function RecordsTable({
  records,
  labels,
  locale,
  timeZone,
  initial = 10,
  searchable = false,
  showTitle = false,
}: {
  records: ResetRecord[];
  labels: TableLabels;
  locale: string;
  timeZone: string;
  initial?: number;
  searchable?: boolean;
  showTitle?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "regular" | "banked">("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (typeFilter !== "all" && record.resetType !== typeFilter) return false;
      if (!needle) return true;
      return (
        record.text.toLowerCase().includes(needle) ||
        (record.reason ?? "").toLowerCase().includes(needle) ||
        (record.appliesTo ?? "").toLowerCase().includes(needle) ||
        (record.sourceAuthor ?? "").toLowerCase().includes(needle)
      );
    });
  }, [records, query, typeFilter]);

  const visible = expanded ? filtered : filtered.slice(0, initial);
  const typeLabel = (record: ResetRecord) =>
    record.resetType === "banked" ? labels.typeBanked : labels.typeRegular;

  if (records.length === 0) {
    return <div className="empty">{labels.empty}</div>;
  }

  return (
    <div className="stack">
      <div className="spread">
        {showTitle && <h2 className="h2" style={{ margin: 0 }}>{labels.title}</h2>}
        {searchable && (
          <div className="row" style={{ marginLeft: "auto" }}>
            <input
              type="search"
              value={query}
              placeholder={labels.search}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={labels.search}
              style={{ minWidth: 200, width: "auto" }}
            />
            <div className="chip-row">
              {(["all", "regular", "banked"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="chip"
                  aria-pressed={typeFilter === option}
                  onClick={() => setTypeFilter(option)}
                >
                  {option === "all"
                    ? labels.all
                    : option === "regular"
                      ? labels.typeRegular
                      : labels.typeBanked}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="tiny muted mono" style={{ margin: 0 }}>
        {labels.results.replace("{n}", String(filtered.length))} · {labels.swipe}
      </p>

      <div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th scope="col">{labels.date}</th>
              <th scope="col">{labels.type}</th>
              <th scope="col">{labels.appliesTo}</th>
              <th scope="col">{labels.reason}</th>
              <th scope="col">{labels.post}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((record) => (
              <tr key={record.id}>
                <td className="cell-date">
                  {formatShortDate(record.announcedAt, locale, timeZone)}
                  <small>{formatClock(record.announcedAt, locale, timeZone)}</small>
                </td>
                <td>
                  <span className={`pill pill--${record.resetType}`}>{typeLabel(record)}</span>
                </td>
                <td>
                  {record.appliesTo ?? "—"}
                  {record.appliesToDetail && (
                    <div className="tiny muted">{record.appliesToDetail}</div>
                  )}
                </td>
                <td className="cell-why">
                  {record.reason && <span className="tag">{record.reason}</span>}
                  {record.reasonDetail && <p>{record.reasonDetail}</p>}
                  {record.followUps.length > 0 && (
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      {record.followUps.map((followUp, index) => (
                        <div key={`${record.id}-f-${index}`}>
                          {labels.followUp}
                          {followUp.at ? ` ${formatDate(followUp.at, locale, timeZone)}` : ""}
                          {followUp.url && (
                            <>
                              {" · "}
                              <a href={followUp.url} target="_blank" rel="noreferrer">
                                {labels.viewOnX}
                              </a>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {record.sourceUrl ? (
                    <a
                      className="link-arrow"
                      href={record.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`${labels.viewOnX} · @${record.sourceAuthor ?? "official"}`}
                    >
                      {record.followUps.length > 0
                        ? labels.postPlus.replace("{n}", String(record.followUps.length))
                        : authorLabel(record)}
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  {labels.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > initial && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? `↑ ${labels.showFewer}` : `↓ ${labels.showAll.replace("{n}", String(filtered.length))}`}
          </button>
        </div>
      )}

      <noscript>
        <p className="small muted">
          <Link href="/history">Open the full history page</Link> to browse every record without
          JavaScript.
        </p>
      </noscript>
    </div>
  );
}
