"use client";

import { useCallback, useEffect, useState } from "react";

export interface ReminderLabels {
  title: string;
  sub: string;
  browser: string;
  browserOn: string;
  browserOff: string;
  browserBlocked: string;
  browserUnsupported: string;
  telegram: string;
  slack: string;
  discord: string;
  email: string;
  emailPlaceholder: string;
  emailSend: string;
  emailSent: string;
  webhookCreate: string;
  webhookCopy: string;
  webhookCopied: string;
  webhookHint: string;
  webhookProviders: string;
  close: string;
  pushEnabled: string;
  pushDenied: string;
  pushError: string;
  followAll: string;
}

export interface ReminderProvider {
  id: string;
  name: string;
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}

type Channel = "browser" | "telegram" | "slack" | "discord" | "email";

export function ReminderPanel({
  labels,
  providers,
  telegramUrl,
  vapidPublicKey,
  open,
  onClose,
}: {
  labels: ReminderLabels;
  providers: ReminderProvider[];
  telegramUrl: string | null;
  vapidPublicKey: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(providers.map((p) => p.id));
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "blocked" | "unsupported">(
    "unknown",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [webhook, setWebhook] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("blocked");
      return;
    }
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setPushState(subscription ? "on" : "off"))
      .catch(() => setPushState("off"));
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleProvider = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id],
    );
  };

  const enableBrowser = useCallback(async () => {
    setMessage(null);
    if (!vapidPublicKey) {
      setMessage(labels.pushError);
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("blocked");
        setMessage(labels.pushDenied);
        return;
      }
      const registration =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          providers: selected,
        }),
      });
      if (!response.ok) throw new Error("subscribe failed");
      setPushState("on");
      setMessage(
        labels.pushEnabled.replace(
          "{providers}",
          selected.length === providers.length
            ? labels.followAll
            : providers
                .filter((p) => selected.includes(p.id))
                .map((p) => p.name)
                .join(", "),
        ),
      );
    } catch {
      setMessage(labels.pushError);
    } finally {
      setBusy(false);
    }
  }, [labels, providers, selected, vapidPublicKey]);

  const createWebhook = useCallback(
    async (channel: "slack" | "discord") => {
      setBusy(true);
      setMessage(null);
      setCopied(false);
      try {
        const response = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, providers: selected }),
        });
        const payload = (await response.json()) as { url?: string; message?: string };
        if (payload.url) setWebhook(payload.url);
        if (payload.message) setMessage(payload.message);
      } catch {
        setMessage(labels.pushError);
      } finally {
        setBusy(false);
      }
    },
    [labels.pushError, selected],
  );

  const subscribeEmail = useCallback(async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "email", email, providers: selected }),
      });
      const payload = (await response.json()) as { message?: string };
      setMessage(payload.message ?? labels.emailSent);
    } catch {
      setMessage(labels.pushError);
    } finally {
      setBusy(false);
    }
  }, [email, labels.emailSent, labels.pushError, selected]);

  const copyWebhook = async () => {
    if (!webhook) return;
    try {
      await navigator.clipboard.writeText(webhook);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!open) return null;

  const channels: { id: Channel; label: string; mark: string; color: string }[] = [
    { id: "browser", label: labels.browser, mark: "◉", color: "#36c98b" },
    { id: "telegram", label: labels.telegram, mark: "✈", color: "#26a5e4" },
    { id: "slack", label: labels.slack, mark: "S", color: "#e01e5a" },
    { id: "discord", label: labels.discord, mark: "D", color: "#5865f2" },
    { id: "email", label: labels.email, mark: "@", color: "#b4690e" },
  ];

  return (
    <div className="remind-backdrop" role="dialog" aria-modal="true" aria-label={labels.title} onClick={onClose}>
      <div className="remind-panel" onClick={(event) => event.stopPropagation()}>
        <div className="remind-panel__head">
          <div>
            <h2 className="h2" style={{ marginBottom: 4 }}>
              🔔 {labels.title}
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              {labels.sub}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={labels.close}>
            ✕
          </button>
        </div>

        <div className="remind-panel__body">
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              {labels.webhookProviders}
            </p>
            <div className="chip-row">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className="chip"
                  aria-pressed={selected.includes(provider.id)}
                  onClick={() => toggleProvider(provider.id)}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          <div className="channel-grid">
            {channels.map((channel) => (
              <div key={channel.id} className="channel">
                <span className="channel__title">
                  <span
                    className="channel__mark"
                    style={{ background: channel.color, color: "#fff" }}
                    aria-hidden="true"
                  >
                    {channel.mark}
                  </span>
                  {channel.label}
                </span>

                {channel.id === "browser" && (
                  <>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      {pushState === "on"
                        ? labels.browserOn
                        : pushState === "blocked"
                          ? labels.browserBlocked
                          : pushState === "unsupported"
                            ? labels.browserUnsupported
                            : labels.browserOff}
                    </p>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={enableBrowser}
                      disabled={busy || pushState === "unsupported" || pushState === "blocked"}
                    >
                      {pushState === "on" ? "✓" : labels.browserOff}
                    </button>
                  </>
                )}

                {channel.id === "telegram" && (
                  <>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      {labels.webhookHint}
                    </p>
                    {telegramUrl ? (
                      <a className="btn btn--sm" href={telegramUrl} target="_blank" rel="noreferrer">
                        {labels.telegram} ↗
                      </a>
                    ) : (
                      <span className="tiny muted">—</span>
                    )}
                  </>
                )}

                {(channel.id === "slack" || channel.id === "discord") && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => createWebhook(channel.id as "slack" | "discord")}
                    disabled={busy}
                  >
                    {labels.webhookCreate}
                  </button>
                )}

                {channel.id === "email" && (
                  <div className="stack" style={{ gap: 6 }}>
                    <input
                      type="email"
                      value={email}
                      placeholder={labels.emailPlaceholder}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-label={labels.email}
                    />
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={subscribeEmail}
                      disabled={busy || !email.includes("@")}
                    >
                      {labels.emailSend}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {webhook && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="code-box">
                <code style={{ flex: 1 }}>{webhook}</code>
                <button type="button" className="btn btn--sm" onClick={copyWebhook}>
                  {copied ? labels.webhookCopied : labels.webhookCopy}
                </button>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>
                {labels.webhookHint}
              </p>
            </div>
          )}

          {message && <div className="banner banner--info">{message}</div>}
        </div>
      </div>
    </div>
  );
}
