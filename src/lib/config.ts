import path from "node:path";

function env(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

// `process.cwd()` is only used to resolve the SQLite location; the ignore
// comment keeps Turbopack from tracing the entire project as a dependency.
const dataDir = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  env("DATA_DIR", "./data"),
);

export const config = {
  dataDir,
  dbFile: path.join(dataDir, "reset-tracker.sqlite"),
  siteUrl: env("SITE_URL", "http://localhost:3000").replace(/\/+$/, ""),
  cronSecret: env("CRON_SECRET", "dev-cron-secret"),
  adminPassword: env("ADMIN_PASSWORD", "admin"),
  adminSecret: env("ADMIN_SECRET", "dev-admin-secret"),
  vapid: {
    publicKey: env("VAPID_PUBLIC_KEY"),
    privateKey: env("VAPID_PRIVATE_KEY"),
    subject: env("VAPID_SUBJECT", "mailto:admin@example.com"),
  },
  telegram: {
    botToken: env("TELEGRAM_BOT_TOKEN"),
    chatId: env("TELEGRAM_CHAT_ID"),
    channelUrl: env("TELEGRAM_CHANNEL_URL"),
  },
  sources: {
    codexResetsApi: env("SOURCE_CODEX_RESETS_API", "1") !== "0",
    nitterBaseUrl: env("NITTER_BASE_URL").replace(/\/+$/, ""),
  },
  mail: {
    smtpUrl: env("SMTP_URL"),
    from: env("MAIL_FROM", "resets@example.com"),
  },
} as const;

export const isProd = process.env.NODE_ENV === "production";
