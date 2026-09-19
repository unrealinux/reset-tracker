import { config } from "./config";
import { getProvider } from "./providers";
import {
  alreadyDelivered,
  listPushSubscriptions,
  recordDelivery,
  removePushSubscription,
  subscribersFor,
  type PushSubscriptionRecord,
} from "./repo";
import { extractAddress, parseSmtpUrl, sendMail } from "./smtp";
import { authorLabel, formatDateTime, resetTypeLabel, truncate } from "./format";
import { sendPush, type VapidKeys } from "./webpush";
import type { ProviderId, ResetRecord, Subscriber } from "./types";

export interface NotifyResult {
  channel: string;
  target: string;
  ok: boolean;
  detail?: string;
}

function vapidKeys(): VapidKeys | null {
  if (!config.vapid.publicKey || !config.vapid.privateKey) return null;
  return { publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey };
}

export function notificationTitle(record: ResetRecord): string {
  const provider = getProvider(record.provider);
  const name = provider?.name ?? record.provider;
  return `${name} ${resetTypeLabel(record.resetType).toLowerCase()}`;
}

export function notificationBody(record: ResetRecord): string {
  return truncate(record.text, 240);
}

function matches(subscriptionProviders: string[], provider: ProviderId): boolean {
  return subscriptionProviders.includes("all") || subscriptionProviders.includes(provider);
}

async function deliverPush(record: ResetRecord): Promise<NotifyResult[]> {
  const keys = vapidKeys();
  if (!keys) {
    return [{ channel: "push", target: "*", ok: false, detail: "VAPID keys are not configured" }];
  }
  const title = notificationTitle(record);
  const body = notificationBody(record);
  const results: NotifyResult[] = [];

  for (const sub of listPushSubscriptions() as PushSubscriptionRecord[]) {
    if (!matches(sub.providers, record.provider)) continue;
    if (alreadyDelivered(sub.endpoint, record.id)) continue;
    try {
      const result = await sendPush(
        keys,
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title,
          body,
          url: record.sourceUrl ?? "/history",
          tag: `${record.provider}-${record.id}`,
          provider: record.provider,
          announcedAt: record.announcedAt,
        },
        { subject: config.vapid.subject },
      );
      recordDelivery(sub.endpoint, record.id, "push", result.ok ? "sent" : "failed", result.body);
      if (result.expired) removePushSubscription(sub.endpoint);
      results.push({
        channel: "push",
        target: sub.endpoint.slice(0, 48),
        ok: result.ok,
        detail: result.ok ? undefined : `HTTP ${result.status}`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      recordDelivery(sub.endpoint, record.id, "push", "failed", detail);
      results.push({ channel: "push", target: sub.endpoint.slice(0, 48), ok: false, detail });
    }
  }
  return results;
}

interface WebhookMessage {
  text: string;
  blocks?: unknown[];
  embeds?: unknown[];
}

function slackMessage(record: ResetRecord): WebhookMessage {
  const provider = getProvider(record.provider);
  const heading = notificationTitle(record);
  const lines = [
    `*${heading}* — ${provider?.name ?? record.provider}`,
    truncate(record.text, 400),
    `Applies to: ${record.appliesTo ?? "—"}${record.reason ? ` · Reason: ${record.reason}` : ""}`,
    `Announced: ${formatDateTime(record.announcedAt)} UTC · @${record.sourceAuthor ?? "official"}`,
  ];
  return {
    text: lines.join("\n"),
    blocks: [
      { type: "header", text: { type: "plain_text", text: heading, emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: truncate(record.text, 500) } },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*${record.appliesTo ?? "—"}*${record.reason ? ` · ${record.reason}` : ""} · ${formatDateTime(record.announcedAt)} UTC`,
          },
        ],
      },
      ...(record.sourceUrl
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "View announcement" },
                  url: record.sourceUrl,
                },
              ],
            },
          ]
        : []),
    ],
  };
}

function discordMessage(record: ResetRecord): WebhookMessage {
  const provider = getProvider(record.provider);
  return {
    text: `${notificationTitle(record)} — ${provider?.name ?? record.provider}`,
    embeds: [
      {
        title: notificationTitle(record),
        description: truncate(record.text, 900),
        url: record.sourceUrl ?? undefined,
        color: record.resetType === "banked" ? 0xf5b942 : 0x36c98b,
        fields: [
          { name: "Applies to", value: record.appliesTo ?? "—", inline: true },
          { name: "Reason", value: record.reason ?? "—", inline: true },
          { name: "Announced", value: `${formatDateTime(record.announcedAt)} UTC`, inline: false },
        ],
        footer: { text: `Source: @${record.sourceAuthor ?? "official"}` },
      },
    ],
  };
}

async function postWebhook(url: string, message: WebhookMessage): Promise<NotifyResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    return {
      channel: "webhook",
      target: url.slice(0, 48),
      ok: response.ok,
      detail: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      channel: "webhook",
      target: url.slice(0, 48),
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function deliverWebhooks(
  record: ResetRecord,
  channel: "slack" | "discord",
): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  for (const sub of subscribersFor(record.provider, channel)) {
    if (!sub.target) continue;
    if (alreadyDelivered(sub.id, record.id)) continue;
    const message = channel === "slack" ? slackMessage(record) : discordMessage(record);
    const result = await postWebhook(sub.target, message);
    recordDelivery(sub.id, record.id, channel, result.ok ? "sent" : "failed", result.detail);
    results.push({ ...result, channel });
  }
  return results;
}

async function deliverTelegram(record: ResetRecord): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  if (!config.telegram.botToken) {
    return results;
  }
  const line = [
    `*${notificationTitle(record)}*`,
    truncate(record.text, 500),
    "",
    `${record.appliesTo ?? ""}${record.reason ? ` · ${record.reason}` : ""}`,
    record.sourceUrl ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const targets = new Set<string>();
  if (config.telegram.chatId) targets.add(config.telegram.chatId);
  for (const sub of subscribersFor(record.provider, "telegram")) {
    if (sub.target) targets.add(sub.target);
  }

  for (const chatId of targets) {
    const key = `telegram:${chatId}`;
    if (alreadyDelivered(key, record.id)) continue;
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: line,
            parse_mode: "Markdown",
            disable_web_page_preview: false,
          }),
        },
      );
      const ok = response.ok;
      recordDelivery(key, record.id, "telegram", ok ? "sent" : "failed", ok ? undefined : `HTTP ${response.status}`);
      results.push({ channel: "telegram", target: chatId, ok });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      recordDelivery(key, record.id, "telegram", "failed", detail);
      results.push({ channel: "telegram", target: chatId, ok: false, detail });
    }
  }
  return results;
}

async function deliverEmail(record: ResetRecord): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  const subs = subscribersFor(record.provider, "email").filter((s) => s.target);
  if (subs.length === 0) return results;
  if (!config.mail.smtpUrl) {
    return subs.map((s) => ({
      channel: "email",
      target: s.target as string,
      ok: false,
      detail: "SMTP_URL is not configured",
    }));
  }

  const transport = parseSmtpUrl(config.mail.smtpUrl, config.mail.from);
  const subject = `${notificationTitle(record)} — ${getProvider(record.provider)?.name}`;
  const text = [
    notificationTitle(record),
    "",
    record.text,
    "",
    `Applies to: ${record.appliesTo ?? "—"}`,
    record.reason ? `Reason: ${record.reason}` : "",
    `Announced: ${formatDateTime(record.announcedAt)} UTC`,
    record.sourceUrl ?? "",
    "",
    "You are receiving this because you subscribed to reset announcements.",
  ]
    .filter(Boolean)
    .join("\n");

  for (const sub of subs) {
    if (alreadyDelivered(sub.id, record.id)) continue;
    try {
      await sendMail(transport, {
        to: extractAddress(sub.target as string),
        subject,
        text,
        html: renderEmail(record),
      });
      recordDelivery(sub.id, record.id, "email", "sent");
      results.push({ channel: "email", target: sub.target as string, ok: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      recordDelivery(sub.id, record.id, "email", "failed", detail);
      results.push({ channel: "email", target: sub.target as string, ok: false, detail });
    }
  }
  return results;
}

export function renderEmail(record: ResetRecord): string {
  const provider = getProvider(record.provider);
  const link = record.sourceUrl
    ? `<p><a href="${record.sourceUrl}">Read the original announcement</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px">
  <p style="text-transform:uppercase;letter-spacing:.08em;font-size:12px;color:#666">${provider?.vendor ?? ""}</p>
  <h1 style="font-size:20px;margin:0 0 12px">${notificationTitle(record)}</h1>
  <p style="white-space:pre-wrap;line-height:1.55">${record.text.replace(/</g, "&lt;")}</p>
  <ul style="color:#444;font-size:14px">
    <li>Applies to: ${record.appliesTo ?? "—"}</li>
    ${record.reason ? `<li>Reason: ${record.reason}</li>` : ""}
    <li>Announced: ${formatDateTime(record.announcedAt)} UTC</li>
    <li>Source: ${authorLabel(record)}</li>
  </ul>
  ${link}
</div>`;
}

export interface DispatchSummary {
  resetId: string;
  results: NotifyResult[];
}

/** Fans a newly recorded reset out to every configured channel. */
export async function dispatchReset(record: ResetRecord): Promise<DispatchSummary> {
  const results = [
    ...(await deliverPush(record)),
    ...(await deliverTelegram(record)),
    ...(await deliverWebhooks(record, "slack")),
    ...(await deliverWebhooks(record, "discord")),
    ...(await deliverEmail(record)),
  ];
  return { resetId: record.id, results };
}

export async function sendTestNotification(
  channel: Subscriber["channel"],
  target: string | null,
): Promise<NotifyResult> {
  const sample: ResetRecord = {
    id: `test-${Date.now()}`,
    provider: "codex",
    resetType: "regular",
    announcedAt: new Date().toISOString(),
    appliesTo: "All users",
    appliesToDetail: null,
    reason: "Test",
    reasonDetail: "Test notification from the admin panel.",
    text: "This is a test notification. Real messages only ever report official reset announcements.",
    sourceType: "manual",
    sourceAuthor: "thsottiaux",
    sourceUrl: "https://example.com/",
    followUps: [],
    status: "confirmed",
  };

  switch (channel) {
    case "slack":
      return target
        ? postWebhook(target, slackMessage(sample))
        : { channel, target: "", ok: false, detail: "Missing webhook URL" };
    case "discord":
      return target
        ? postWebhook(target, discordMessage(sample))
        : { channel, target: "", ok: false, detail: "Missing webhook URL" };
    case "push": {
      const keys = vapidKeys();
      if (!keys) return { channel, target: "", ok: false, detail: "VAPID keys are not configured" };
      const subs = listPushSubscriptions().filter(
        (s) => !target || s.endpoint === target,
      );
      if (subs.length === 0) return { channel, target: "", ok: false, detail: "No push subscriptions" };
      const results = await Promise.all(
        subs.map((sub) =>
          sendPush(
            keys,
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            { title: "Test notification", body: "Reset alerts are working.", tag: "test" },
            { subject: config.vapid.subject },
          ),
        ),
      );
      return {
        channel,
        target: `${subs.length} subscription(s)`,
        ok: results.every((r) => r.ok),
        detail: results.every((r) => r.ok) ? undefined : "Some subscriptions failed",
      };
    }
    case "telegram": {
      if (!config.telegram.botToken) {
        return { channel, target: target ?? "", ok: false, detail: "TELEGRAM_BOT_TOKEN is not configured" };
      }
      const chatId = target || config.telegram.chatId;
      if (!chatId) return { channel, target: "", ok: false, detail: "No chat id" };
      const response = await fetch(
        `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: "Test notification from the reset tracker." }),
        },
      );
      return { channel, target: chatId, ok: response.ok };
    }
    case "email": {
      if (!config.mail.smtpUrl) {
        return { channel, target: target ?? "", ok: false, detail: "SMTP_URL is not configured" };
      }
      if (!target) return { channel, target: "", ok: false, detail: "Missing address" };
      try {
        await sendMail(parseSmtpUrl(config.mail.smtpUrl, config.mail.from), {
          to: extractAddress(target),
          subject: "Test notification",
          text: "Reset alerts are working.",
        });
        return { channel, target, ok: true };
      } catch (error) {
        return {
          channel,
          target,
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }
    default:
      return { channel, target: target ?? "", ok: false, detail: "Unsupported channel" };
  }
}
