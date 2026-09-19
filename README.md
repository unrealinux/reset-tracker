# whenreset — Codex, Claude & Grok usage-reset tracker

A complete, self-hosted implementation of the reset-tracker product: it records official
usage-limit reset announcements for **Codex**, **Claude** and **Grok**, turns them into
history, statistics and forecasts, and pushes them out over five notification channels.

Built from a feature-by-feature analysis of [whenreset.dev](https://whenreset.dev) and
[codex-resets.com](https://codex-resets.com) — see [`docs/ANALYSIS.md`](docs/ANALYSIS.md).

```
Next.js 16 (App Router)  ·  React 19  ·  TypeScript  ·  Tailwind CSS 4
Node 24  ·  node:sqlite (no native deps)  ·  Web Push on node:crypto (no deps)  ·  7 locales
```

---

## Quick start

Requires **Node 24 or newer** — persistence uses the built-in `node:sqlite`, which needs
`--experimental-sqlite` on 22.x. Deploying? Read [Deployment](#deployment) first; the one
trap is that the database lives in a file, so the host needs a persistent volume.

```bash
npm install
cp .env.example .env.local     # every value has a safe development default
npm run dev                    # http://localhost:3000
```

The database is created and seeded with 69 real records (Codex 53, Claude 13, Grok 3) on
first request. No external service is required to boot.

```bash
npm run build && npm start     # production
npm run selftest               # 30 logic tests, no network, no server
npm run poll                   # ingest from the live sources
npm run keys                   # generate VAPID keys for browser push
npm run db:reset               # wipe and re-seed records
```

---

## What it does

### Data collection

| Source | Adapter | Notes |
|---|---|---|
| `codex-resets.com/api/v1` | `codexResetsApiSource` | Full Codex history with verbatim announcement text |
| `whenreset.dev/api/reset-feed` | `whenResetFeedSource` | Claude and Grok announcements as RSS |
| Any Nitter-compatible mirror | `accountFeedSource` | Optional direct polling of `@thsottiaux`, `@ClaudeDevs` (set `NITTER_BASE_URL`) |
| Admin panel | `upsertManualRecord` | Hand-curated corrections |

The pipeline normalises, de-duplicates by source post id, classifies the affected scope and
reason with documented heuristics, folds follow-up posts into the record they belong to, and
only writes when the announcement actually changed.

### Derived intelligence

- **Time waiting** per provider, with a live countdown in the browser.
- **Next estimated reset** — a trimmed mean of every interval between resets, so one 68-day
  outlier cannot dominate. Banked reset cards are excluded because a card does not restore
  usage until it is redeemed.
- **Confidence** from the coefficient of variation: a choppy history is labelled *low* even
  when the mean looks tidy.
- Average / median interval, longest and shortest wait, 30- and 90-day counts, active days.
- A 26-week calendar heatmap distinguishing usage resets from reset cards.

### Notification channels

| Channel | How it works | Config |
|---|---|---|
| Browser push | RFC 8291 `aes128gcm` + RFC 8292 VAPID, implemented on `node:crypto` | `VAPID_*`, `npm run keys` |
| Telegram | Bot API, to a channel and/or per-subscriber chat ids | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Slack | Incoming webhook with Block Kit message | created in the reminder panel |
| Discord | Incoming webhook with an embed | created in the reminder panel |
| Email | Built-in SMTP client (plain / STARTTLS / implicit TLS, AUTH PLAIN + LOGIN) | `SMTP_URL` |

Every delivery is recorded, and `alreadyDelivered()` guarantees a subscriber never receives
the same announcement twice — so `npm run notify` and `/api/cron/notify` are safe to retry.

### Public API

Everything is free, needs no key, and asks only for a link back.

```
GET /api/v1/status              current status, stats and forecast per provider
GET /api/v1/resets              cursor pagination, provider/type/date/text filters
GET /api/v1/providers           tracked providers and their announcement accounts
GET /api/v1/stats               aggregates + per-provider totals
GET /api/v1/openapi.json        OpenAPI 3.1 document
GET /api/docs                   Swagger UI
GET /api/feed?format=rss|atom|json
GET /api/ical                   iCalendar feed
GET /api/mcp                    MCP server (Streamable HTTP, JSON response mode)
GET /api/health                 liveness + record counts
POST /api/subscribe             create a notification subscription
POST /api/push/subscribe        register a Web Push subscription
POST /api/cron/poll             run ingestion           (x-cron-secret)
POST /api/cron/notify           re-dispatch a window    (x-cron-secret)
```

Errors use RFC 9457 `application/problem+json` with a `code`, a `parameter` where relevant
and a `request_id`. Read endpoints are rate limited per IP and send `RateLimit-*` headers.

### Web pages

`/` home · `/[provider]` per-provider tracker · `/history` searchable archive with filters ·
`/wiki` + `/wiki/[slug]` usage-limit reference · `/prompts` + `/prompts/[slug]` copy-ready
prompts · `/about` `/privacy` `/cookies` · `/admin` curation panel.

### Platform features

- **7 locales** — `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `ru` — served at `/{locale}/…`,
  with `?lang=` as a canonicalising shortcut. 100% key coverage. The locale is a real path
  segment, so `<html lang>`, canonical URLs and hreflang are correct in the first byte and
  never depend on a request header surviving a rewrite.
- **Dark / light / system theme** applied before first paint, no flash.
- **PWA** — manifest, offline shell, installable, Web Push service worker.
- **SEO** — per-page metadata, `hreflang` alternates, OpenAPI-driven API docs, dynamic OG
  images at `/api/og` (see `docs/og-preview.png`), `sitemap.xml` covering every locale,
  JSON-LD for `WebSite`, `FAQPage`, `Dataset`, `Article`, `ItemList` and `HowTo`.
- **MCP server** — stdio (`npm run mcp`) and HTTP (`/api/mcp`) exposing `get_status`,
  `list_resets`, `get_stats` and `explain_reset_type`, so agents can answer
  "did Codex reset today?" directly.

---

## Project layout

```
src/
  app/
    globals.css
    [locale]/                     locale is a real path segment, not a header
      layout.tsx  page.tsx  not-found.tsx
      [provider]/ history/ wiki/ prompts/ about/ privacy/ cookies/ admin/
    api/            v1/ status resets providers stats openapi.json
                    feed ical subscribe subscribe/verify subscriptions/[id]
                    push/public-key push/subscribe cron/poll cron/notify
                    mcp og docs health
    sitemap.ts robots.ts manifest.ts
  components/       SiteHeader SiteFooter ProviderCard StatsGrid ResetCalendar
                    RecordsTable LiveDuration ReminderPanel ThemeToggle
                    LocaleSwitcher CopyButton AdminForm SiteFaq
  lib/
    db.ts schema.ts repo.ts ingest.ts sources.ts classify.ts stats.ts
    notify.ts webpush.ts smtp.ts feeds.ts openapi.ts api.ts auth.ts session.ts
    i18n.ts dictionaries/* labels.ts format.ts providers.ts config.ts types.ts
    mcp-tools.ts server-context.ts content/{wiki,prompts}.ts
  data/seed.ts      71 real reset records (regenerate: npm run seed:harvest)
  instrumentation.ts  optional in-process ingestion scheduler
  middleware.ts     locale normalisation only
mcp/server.mjs      stdio MCP server (shares src/lib/mcp-tools.ts with /api/mcp)
scripts/            seed poll notify keys selftest harvest _env ts-hooks
public/sw.js        service worker (offline shell + push)
Dockerfile  docker-compose.yml  .dockerignore
```

## Configuration

All of `.env.example` is optional; see that file for the full list. The values that change
behaviour most:

| Variable | Default | Effect |
|---|---|---|
| `SITE_URL` | `http://localhost:3000` | Canonical URLs, feed links, VAPID audience |
| `DATA_DIR` | `./data` | Where the SQLite file lives. Point this at a mounted volume in production |
| `ENABLE_SCHEDULER` | `0` | Run ingestion in-process (single replica only) |
| `SCHEDULER_INTERVAL_MINUTES` | `60` | In-process poll interval, minimum 5 |
| `ADMIN_PASSWORD` / `ADMIN_SECRET` | `admin` / `dev-admin-secret` | **Change both in production** |
| `CRON_SECRET` | `dev-cron-secret` | **Change in production** |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | empty | Enables browser push |
| `SOURCE_CODEX_RESETS_API` | `1` | Pull Codex history from the public API |
| `NITTER_BASE_URL` | empty | Poll announcement accounts directly |

### Scheduling ingestion

```bash
# cron / Task Scheduler / GitHub Actions
curl -fsS -X POST "https://your-host/api/cron/poll" -H "x-cron-secret: $CRON_SECRET"
curl -fsS -X POST "https://your-host/api/cron/notify?hours=24" -H "x-cron-secret: $CRON_SECRET"
```

`/api/cron/poll` folds follow-up posts into the announcement they belong to, at both ends of
the pipeline: the RSS source folds a short restatement into its parent before it is stored, and
`mergeFollowUps()` audits already-stored rows the same way. That is what keeps the event count
matching the reference trackers (Grok: 3 events, not 5).

On a freshly seeded database the first poll reports `0 new / 2 updated / 67 unchanged` — it is
reconciling two second-level timestamps against the seed. Every run after that is a no-op,
which is the property worth checking when you change an adapter.

## Deployment

### Pick a path

| Goal | Path | Time | Cost |
|---|---|---|---|
| **A public URL right now** | Render free + `render.yaml` | ~5 min | free |
| Public URL, data survives redeploys, no server admin | Zeabur / Sealos / ClawCloud | ~10 min | ~$5/mo |
| Cheapest long term, full control, custom domain | VPS + `docker compose` | ~20 min | ~$4/mo |
| CLI deploy with a persistent volume | Fly.io + `fly.toml` | ~10 min | usage-based |
| Just showing someone locally | `cloudflared tunnel --url http://localhost:3000` | ~1 min | free |

Every option except the tunnel gives you **HTTPS on a public hostname automatically**. All of
them except Render's free tier keep the database across redeploys.

### Option 1 — Render (fastest, free)

1. Push the repository to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo.
3. It reads `render.yaml`, generates `CRON_SECRET` and `ADMIN_SECRET`, and asks you for
   `ADMIN_PASSWORD` and `SITE_URL`.
4. Deploy. You get `https://<name>.onrender.com` with TLS.

Trade-offs to know about before choosing it:

- The free instance **sleeps after ~15 minutes idle** and takes ~30s to wake.
- There is **no persistent disk on `free`**, so a redeploy resets the database to the bundled
  71-record snapshot. Notification subscriptions are lost; everything else recovers, because
  the seed is complete and ingestion is idempotent.
- Uncomment the `disk:` block and set `plan: starter` to keep data permanently.

Tip: point a free cron service at `POST https://<name>.onrender.com/api/cron/poll` with the
`x-cron-secret` header, once an hour. That refreshes the data **and** keeps the instance awake.

### Option 2 — Zeabur / Sealos (no server admin, persistent volume)

These take a Dockerfile directly, so there is nothing to configure beyond the environment:

1. Create a project, connect the GitHub repo, let it detect `Dockerfile`.
2. Add a **persistent volume** mounted at `/app/data`.
3. Add the environment variables — at minimum `SITE_URL`, `CRON_SECRET`, `ADMIN_PASSWORD`,
   `ADMIN_SECRET`, and `ENABLE_SCHEDULER=1`.
4. Deploy, then attach your own domain (automatic TLS).

The volume is the only step that matters. Without it the container filesystem is wiped on every
redeploy and the database starts over from the seed.

### Option 3 — VPS with Docker Compose

```bash
# on a fresh 1 GB box with Docker installed
git clone <your-repo> && cd reset-tracker
cp .env.example .env
#   set SITE_URL to your domain, plus CRON_SECRET / ADMIN_PASSWORD / ADMIN_SECRET
docker compose up -d --build
```

Then put a TLS proxy in front. Caddy is two lines:

```caddyfile
resets.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy obtains and renews the certificate by itself. Point an `A` record at the server first.
For mainland-China hosting, a domestic provider (阿里云/腾讯云轻量) plus an ICP filing is the
only way to get consistently fast access; overseas VPS hostnames are reachable but slow.

### Option 4 — Fly.io

```bash
fly launch --no-deploy --copy-config
fly volumes create reset_data --size 1
fly secrets set ADMIN_PASSWORD=... ADMIN_SECRET=... CRON_SECRET=... SITE_URL=https://<app>.fly.dev
fly deploy
```

`fly.toml` keeps one machine running so the in-process scheduler works (`auto_stop_machines =
"off"`). Setting it to `"suspend"` saves money but stops ingestion between requests — in that
case set `ENABLE_SCHEDULER=0` and drive `/api/cron/poll` from an external cron.

### Reachability notes

| Hostname | Notes |
|---|---|
| `*.onrender.com` | Free tier sleeps; access from mainland China is inconsistent |
| `*.zeabur.app`, `*.sealos.io` | Generally reachable, region-dependent |
| `*.fly.dev` | Reachable, latency depends on the region you pick (`nrt` = Tokyo) |
| Own domain on a domestic VPS | Fastest and most reliable in mainland China, requires an ICP filing |

### Hard constraints

These decide which platforms can host this app at all:

| Constraint | Why |
|---|---|
| **Node ≥ 24** | Persistence is Node's built-in `node:sqlite`, which needs `--experimental-sqlite` on 22.x–23.3 |
| **A persistent disk** | The SQLite file *is* the database. An ephemeral filesystem silently loses every record on redeploy |
| **A long-running process** | Every page reads the database; there is nothing to statically export |
| **One replica** | SQLite is a single-writer store |
| **Outbound network** | Ingestion fetches the public reference feeds |

Avoid NFS-style volumes: SQLite runs in WAL mode, which is unreliable over network filesystems.

### Platform fit

| Platform | Fit | Notes |
|---|---|---|
| VPS / 轻量云 + Docker | ★★★★★ | Cheapest and most predictable. `docker compose up -d` and you are done |
| Zeabur, Sealos, ClawCloud | ★★★★★ | Docker deploy + persistent volume, Chinese UI, no server admin |
| Railway | ★★★★☆ | Add a volume, otherwise the database resets on every deploy |
| Render | ★★★★☆ | Docker runtime + a paid persistent disk |
| Fly.io | ★★★★☆ | `fly volumes create` then mount it at `/app/data` |
| Koyeb / Northflank | ★★★★☆ | Docker + volume |
| Vercel / Netlify | ✗ | Read-only, ephemeral filesystem. Needs the storage layer swapped (see below) |
| Cloudflare Workers | ✗ | No `node:sqlite`, no filesystem |

Whichever you pick, the only two things that must be right are **`DATA_DIR` pointing at a
mounted volume** and **the volume being writable by uid 1001** (the image's `nextjs` user).

### Docker

```bash
cp .env.example .env
#   set CRON_SECRET, ADMIN_PASSWORD, ADMIN_SECRET — compose refuses to start without them
#   optionally add VAPID_* from `npm run keys`
docker compose up -d --build
```

The compose file starts one replica, mounts a named volume at `/app/data`, sets
`ENABLE_SCHEDULER=1` so ingestion runs in-process, and ships a healthcheck against
`/api/health`. Because the volume is created from the image, Docker copies the correct
ownership onto it and SQLite can write immediately.

Building the image by hand:

```bash
docker build -t reset-tracker .
docker run -d --name reset-tracker -p 3000:3000 \
  -v reset-data:/app/data \
  -e SITE_URL=https://example.com \
  -e CRON_SECRET=... -e ADMIN_PASSWORD=... -e ADMIN_SECRET=... \
  -e ENABLE_SCHEDULER=1 \
  reset-tracker
```

With a bind mount instead of a named volume, chown it first:

```bash
mkdir -p ./data && sudo chown -R 1001:1001 ./data
```

The image builds with `output: "standalone"`, so `node server.js` serves a ~150 MB runtime
layer. `npm start` remains the local development command.

### Scheduling

Pick one:

- **In-process** (default in the compose file): `ENABLE_SCHEDULER=1`, with
  `SCHEDULER_INTERVAL_MINUTES=60`. Single replica only.
- **External cron**: hit the endpoints from cron, GitHub Actions, or the platform's scheduler.

  ```bash
  curl -fsS -X POST "$SITE/api/cron/poll"   -H "x-cron-secret: $CRON_SECRET"
  curl -fsS -X POST "$SITE/api/cron/notify?hours=24" -H "x-cron-secret: $CRON_SECRET"
  ```

Both paths are idempotent: a poll that finds nothing new changes nothing, and a subscriber
never receives the same announcement twice.

### On Vercel and other serverless hosts

It works, but the storage layer has to change first:

1. Replace `src/lib/db.ts` with a `libSQL`/Turso or Postgres client. `src/lib/repo.ts` is the
   only module that issues SQL, so the blast radius is one file plus `openDatabase`.
2. Move ingestion to a scheduled job (Vercel Cron), since there is no long-running process.
3. Drop the in-process scheduler and keep one external cron entry.

Everything else — the API, feeds, notifications, i18n and the UI — is platform-agnostic.

### A note on standalone builds

The standalone server replays the middleware against internally rewritten requests. Two
consequences are baked into `src/middleware.ts`, and both were found by testing the real
standalone artifact rather than `next start`:

- Request headers set during a rewrite do **not** survive into the render. Locale therefore
  travels as a path segment (`/ja/codex`) and nothing depends on `x-locale`.
- Redirecting the default locale's prefixed alias (`/en/codex` → `/codex`) loops forever,
  because `/` rewrites to `/en` and the middleware runs again. `/en/...` renders as an alias
  instead, with `canonical` pointing at the unprefixed URL.

## Testing

```bash
npm run selftest      # 30 assertions over classifiers, stats, feeds, auth, i18n, Web Push
npm run typecheck     # tsc --noEmit
npm run build         # production build
```

`selftest` imports the app's TypeScript directly through a small Node resolve hook
(`scripts/ts-hooks.mjs`) plus Node's built-in type stripping — no test framework, no build
step, no network.

## Attribution

Codex history is ingested from the free public [codex-resets.com](https://codex-resets.com)
API, and Claude/Grok announcements from [whenreset.dev](https://whenreset.dev). Both are
credited in the site footer, as their terms ask.

This is an independent project. It is not affiliated with OpenAI, Anthropic or xAI, and a
recorded reset is not a promise that any particular account receives one.
