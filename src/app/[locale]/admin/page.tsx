import Link from "next/link";
import type { Metadata } from "next";
import { AdminForm, AdminInlineAction } from "@/components/AdminForm";
import { isAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { PROVIDERS } from "@/lib/providers";
import {
  deliveryStats,
  listResets,
  listSubscribers,
  lastPoll,
  recentAudit,
  getReset,
} from "@/lib/repo";
import { formatDateTime } from "@/lib/format";
import { getRequestContext } from "@/lib/server-context";
import {
  deleteRecordAction,
  deleteSubscriberAction,
  loginAction,
  logoutAction,
  runPollAction,
  saveRecordAction,
  testNotifyAction,
  toggleSubscriberAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const search = await searchParams;
  const { locale, timeZone, t } = await getRequestContext(requestedLocale);
  const authed = await isAdmin();

  if (!authed) {
    return (
      <section style={{ maxWidth: 420, margin: "40px auto" }}>
        <h1 className="h1" style={{ fontSize: 30 }}>
          {t("admin.title")}
        </h1>
        <p className="muted small">
          Sign in to curate records, trigger ingestion and manage subscriptions. The password is set
          with <code>ADMIN_PASSWORD</code>.
        </p>
        <div className="card">
          <AdminForm action={loginAction} submitLabel={t("admin.login")}>
            <div className="field">
              <label htmlFor="password">{t("admin.password")}</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </AdminForm>
        </div>
        <p className="tiny muted">
          <Link href="/">← Back to the tracker</Link>
        </p>
      </section>
    );
  }

  const editing = search.edit ? getReset(search.edit) : null;
  const records = listResets({ limit: 40, includePending: true });
  const subscribers = listSubscribers();
  const deliveries = deliveryStats();
  const auditEntries = recentAudit(20);
  const poll = lastPoll();

  return (
    <section className="stack" style={{ gap: 26 }}>
      <div className="spread">
        <div>
          <p className="eyebrow">whenreset</p>
          <h1 className="h1" style={{ fontSize: 30, marginBottom: 4 }}>
            {t("admin.title")}
          </h1>
          <p className="muted small" style={{ margin: 0 }}>
            {poll
              ? `Last ingestion ${formatDateTime(poll.finished_at ?? poll.started_at, locale, timeZone)} · ${poll.source} · ${poll.inserted} new, ${poll.updated} updated${poll.error ? ` · ${poll.error}` : ""}`
              : "No ingestion has run yet."}
          </p>
        </div>
        <div className="row">
          <AdminForm action={runPollAction} submitLabel={t("admin.poll")} className="row">
            <span />
          </AdminForm>
          <AdminForm action={logoutAction} submitLabel={t("admin.logout")} className="row">
            <span />
          </AdminForm>
        </div>
      </div>

      <div className="card">
        <h2 className="h3">{editing ? `Edit ${editing.id}` : t("admin.addRecord")}</h2>
        <AdminForm action={saveRecordAction} submitLabel={t("admin.save")}>
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="provider">Provider</label>
              <select id="provider" name="provider" defaultValue={editing?.provider ?? "codex"}>
                {PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="resetType">Type</label>
              <select id="resetType" name="resetType" defaultValue={editing?.resetType ?? "regular"}>
                <option value="regular">{t("type.regular")}</option>
                <option value="banked">{t("type.banked")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="announcedAt">Announced at (UTC)</label>
              <input
                id="announcedAt"
                name="announcedAt"
                type="datetime-local"
                defaultValue={toLocalInput(editing?.announcedAt ?? new Date().toISOString())}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="appliesTo">Applies to</label>
              <input id="appliesTo" name="appliesTo" defaultValue={editing?.appliesTo ?? ""} placeholder="All users" />
            </div>
            <div className="field">
              <label htmlFor="reason">Reason</label>
              <input id="reason" name="reason" defaultValue={editing?.reason ?? ""} placeholder="New model" />
            </div>
            <div className="field">
              <label htmlFor="sourceAuthor">Source author</label>
              <input
                id="sourceAuthor"
                name="sourceAuthor"
                defaultValue={editing?.sourceAuthor ?? "thsottiaux"}
              />
            </div>
            <div className="field">
              <label htmlFor="sourceUrl">Source URL</label>
              <input
                id="sourceUrl"
                name="sourceUrl"
                type="text"
                defaultValue={editing?.sourceUrl ?? ""}
                placeholder="https://x.com/…/status/…"
              />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={editing?.status ?? "confirmed"}>
                <option value="confirmed">confirmed</option>
                <option value="pending">pending</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="appliesToDetail">Applies-to detail</label>
            <input id="appliesToDetail" name="appliesToDetail" defaultValue={editing?.appliesToDetail ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="reasonDetail">Reason detail</label>
            <input id="reasonDetail" name="reasonDetail" defaultValue={editing?.reasonDetail ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="text">Announcement text</label>
            <textarea id="text" name="text" defaultValue={editing?.text ?? ""} required />
          </div>
        </AdminForm>
        {editing && (
          <p className="small">
            <Link href="/admin">← Cancel edit</Link>
          </p>
        )}
      </div>

      <div>
        <h2 className="h2">{t("admin.records")}</h2>
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th>When</th>
                <th>Provider</th>
                <th>Type</th>
                <th>Status</th>
                <th>Text</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="cell-date">
                    {formatDateTime(record.announcedAt, locale, timeZone)}
                  </td>
                  <td>{record.provider}</td>
                  <td>
                    <span className={`pill pill--${record.resetType}`}>{record.resetType}</span>
                  </td>
                  <td>{record.status}</td>
                  <td className="cell-why">{record.text.slice(0, 120)}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Link className="btn btn--sm" href={`/admin?edit=${encodeURIComponent(record.id)}`}>
                        Edit
                      </Link>
                      <AdminInlineAction
                        action={deleteRecordAction}
                        fields={{ id: record.id }}
                        label={t("admin.delete")}
                        confirm="Delete this record?"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="h2">{t("admin.subscribers")}</h2>
        {subscribers.length === 0 ? (
          <p className="muted small">No subscriptions yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Providers</th>
                  <th>Target</th>
                  <th>Verified</th>
                  <th>Active</th>
                  <th>Last sent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {subscribers.map((subscriber) => (
                  <tr key={subscriber.id}>
                    <td>{subscriber.channel}</td>
                    <td>{subscriber.provider}</td>
                    <td className="mono tiny">
                      {subscriber.target
                        ? `${subscriber.target.slice(0, 42)}${subscriber.target.length > 42 ? "…" : ""}`
                        : "—"}
                    </td>
                    <td>{subscriber.verified ? "yes" : "no"}</td>
                    <td>{subscriber.active ? "yes" : "no"}</td>
                    <td className="tiny">
                      {subscriber.lastNotifiedAt
                        ? formatDateTime(subscriber.lastNotifiedAt, locale, timeZone)
                        : "—"}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <AdminInlineAction
                          action={toggleSubscriberAction}
                          fields={{ id: subscriber.id, active: subscriber.active ? "0" : "1" }}
                          label={subscriber.active ? "Pause" : "Resume"}
                        />
                        <AdminInlineAction
                          action={deleteSubscriberAction}
                          fields={{ id: subscriber.id }}
                          label={t("admin.delete")}
                          confirm="Delete this subscription?"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="h3">{t("admin.testNotify")}</h2>
        <AdminForm action={testNotifyAction} submitLabel={t("admin.testNotify")}>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="channel">Channel</label>
              <select id="channel" name="channel" defaultValue="push">
                <option value="push">browser push</option>
                <option value="telegram">telegram</option>
                <option value="slack">slack</option>
                <option value="discord">discord</option>
                <option value="email">email</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="target">Target (optional)</label>
              <input id="target" name="target" placeholder="webhook URL, chat id or address" />
            </div>
          </div>
        </AdminForm>
        <p className="tiny muted">
          VAPID {config.vapid.publicKey ? "configured" : "not configured"} · Telegram{" "}
          {config.telegram.botToken ? "configured" : "not configured"} · SMTP{" "}
          {config.mail.smtpUrl ? "configured" : "not configured"}
        </p>
      </div>

      <div className="doc-layout">
        <div className="card">
          <h2 className="h3">{t("admin.deliveries")}</h2>
          {deliveries.length === 0 ? (
            <p className="muted small">Nothing delivered yet.</p>
          ) : (
            <ul className="small mono">
              {deliveries.map((entry) => (
                <li key={`${entry.channel}-${entry.status}`}>
                  {entry.channel} · {entry.status}: {entry.count}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2 className="h3">{t("admin.audit")}</h2>
          <ul className="small mono">
            {auditEntries.map((entry) => (
              <li key={entry.id}>
                {entry.at} · {entry.actor} · {entry.action}
                {entry.detail ? ` — ${entry.detail.slice(0, 60)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
