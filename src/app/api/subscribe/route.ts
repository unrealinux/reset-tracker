import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { clientId, json, problem, rateLimit, rateLimitHeaders } from "@/lib/api";
import { config } from "@/lib/config";
import { getSubscriber, insertSubscriber } from "@/lib/repo";
import { sendTestNotification } from "@/lib/notify";
import { isProviderId } from "@/lib/providers";
import { extractAddress } from "@/lib/smtp";
import type { Channel, Subscriber } from "@/lib/types";

export const dynamic = "force-dynamic";

const WEBHOOK_HOSTS: Record<string, RegExp[]> = {
  slack: [/^hooks\.slack\.com$/i],
  discord: [/^(?:canary\.|ptb\.)?discord(?:app)?\.com$/i],
};

function normalizeProviders(input: unknown): string[] {
  if (!Array.isArray(input)) return ["all"];
  const values = input.filter((value): value is string => typeof value === "string");
  if (values.length === 0 || values.includes("all")) return ["all"];
  const valid = values.filter(isProviderId);
  return valid.length ? valid : ["all"];
}

function validateTarget(channel: Channel, target: string): string | null {
  if (channel === "email") {
    const address = extractAddress(target);
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) ? null : "invalid_email";
  }
  if (channel === "slack" || channel === "discord") {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return "invalid_url";
    }
    if (url.protocol !== "https:") return "invalid_url";
    const allowed = WEBHOOK_HOSTS[channel].some((re) => re.test(url.hostname));
    return allowed ? null : "invalid_url";
  }
  return null;
}

export async function POST(request: Request) {
  const limit = rateLimit(`subscribe:${clientId(request)}`, 20, 10 * 60_000);
  if (!limit.ok) {
    return problem(429, "rate_limited", "Too many subscription attempts. Try again later.", {
      headers: rateLimitHeaders(limit),
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return problem(400, "invalid_body", "Expected a JSON object.");
  }

  const channel = body.channel;
  if (
    channel !== "slack" &&
    channel !== "discord" &&
    channel !== "email" &&
    channel !== "telegram"
  ) {
    return problem(400, "invalid_channel", "channel must be one of slack, discord, email, telegram.", {
      parameter: "channel",
    });
  }

  const providers = normalizeProviders(body.providers);
  const providerField = providers.length === 1 ? providers[0] : "all";
  const rawTarget =
    typeof body.target === "string"
      ? body.target.trim()
      : typeof body.email === "string"
        ? body.email.trim()
        : "";

  if (channel === "telegram") {
    const chatId = rawTarget || config.telegram.chatId;
    if (!chatId) {
      return problem(400, "missing_target", "A Telegram chat id is required.", {
        parameter: "target",
      });
    }
  } else {
    if (!rawTarget) {
      return problem(400, "missing_target", "A target is required for this channel.", {
        parameter: channel === "email" ? "email" : "target",
      });
    }
    const invalid = validateTarget(channel, rawTarget);
    if (invalid) {
      return problem(
        400,
        invalid,
        channel === "email"
          ? "That does not look like a valid email address."
          : channel === "slack"
            ? "Expected an https://hooks.slack.com/... incoming-webhook URL."
            : "Expected an https://discord.com/api/webhooks/... URL.",
        { parameter: channel === "email" ? "email" : "target" },
      );
    }
  }

  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(16).toString("base64url");
  const isEmail = channel === "email";

  const subscriber: Subscriber = {
    id,
    channel: channel as Channel,
    provider: providerField,
    target: isEmail ? extractAddress(rawTarget) : channel === "telegram" ? rawTarget || config.telegram.chatId : rawTarget,
    label: typeof body.label === "string" ? body.label.slice(0, 80) : null,
    secret,
    verified: !isEmail,
    active: true,
    createdAt: new Date().toISOString(),
    lastNotifiedAt: null,
  };

  insertSubscriber(subscriber);

  const manageUrl = `${config.siteUrl}/api/subscriptions/${id}?secret=${secret}`;

  if (channel === "slack" || channel === "discord") {
    const test = await sendTestNotification(channel, rawTarget);
    return json(
      {
        id,
        channel,
        providers,
        manage_url: manageUrl,
        test_ok: test.ok,
        message: test.ok
          ? "Webhook saved. A test message was delivered."
          : `Webhook saved, but the test message failed${test.detail ? `: ${test.detail}` : ""}.`,
      },
      { status: 201 },
    );
  }

  if (channel === "email") {
    const verifyUrl = `${config.siteUrl}/api/subscribe/verify?token=${secret}`;
    const test = config.mail.smtpUrl
      ? await sendTestNotification("email", subscriber.target)
      : { ok: false, detail: "SMTP is not configured on this instance" };
    return json(
      {
        id,
        channel,
        providers,
        manage_url: manageUrl,
        verify_url: verifyUrl,
        mail_sent: test.ok,
        message: test.ok
          ? "Check your inbox for a confirmation link."
          : "Subscription saved. Confirmation email could not be sent — verify manually with the link below.",
      },
      { status: 201 },
    );
  }

  return json(
    { id, channel, providers, manage_url: manageUrl, message: "Subscription saved." },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const secret = url.searchParams.get("secret");
  if (!id || !secret) {
    return problem(400, "missing_parameter", "id and secret are required.");
  }
  const subscriber = getSubscriber(id);
  if (!subscriber || subscriber.secret !== secret) {
    return problem(404, "not_found", "No subscription matches those credentials.");
  }
  return json({
    id: subscriber.id,
    channel: subscriber.channel,
    provider: subscriber.provider,
    verified: subscriber.verified,
    active: subscriber.active,
    created_at: subscriber.createdAt,
    last_notified_at: subscriber.lastNotifiedAt,
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
