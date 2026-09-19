# Reference-site analysis

Two live trackers were studied before writing any code.

| | whenreset.dev | codex-resets.com |
|---|---|---|
| Scope | Codex + Claude + Grok | Codex only |
| Stack | Next.js App Router (RSC, `_next/static/chunks`) | Vite SPA + JSON API, Swagger docs |
| Data | Server-rendered HTML + RSC payload | `GET /api/v1/status`, `GET /api/v1/resets` |
| i18n | 7 locales (`/es`, `/ja`, `/ko`, `/ru`, `/zh-cn`, `/zh-tw`) | 5 locales (`/zh-CN`, `/zh-TW`, `/ja`, `/ko`), `?lang=` |
| Extras | Wiki, Prompts, per-provider pages | Charts, email subscribe, Telegram, MCP server, sponsors |

## 1. Core domain model

A **reset record** is one public announcement that usage limits were cleared.
Fields observed on both sites:

- `provider` — `codex` | `claude` | `grok`
- `reset_type` — `regular` (usage reset) | `banked` (a reset card credited to the account)
- `announced_at` — timestamp of the announcement (UTC)
- `applies_to` — `All users`, `Paid users`, `Max plan users`, `Some users`, …
- `reason` — `New model`, `Fix`, `Milestone`, `Unstated`, `Weekend`, …
- `reason_detail` — free-text explanation
- `text` — the announcement body, preserved verbatim
- `source` — original X post URL + author (`@thsottiaux`, `@ClaudeDevs`, `@grok`, `@elonmusk`)
- `follow_ups` — later posts that belong to the same announcement

Derived, per provider:

- **time waiting** = now − last reset
- **next estimate** = last reset + average interval
- **avg. reset interval**, **longest wait**, **total resets**
- **calendar heatmap** of events per day, with `regular` / `banked` / `no reset` states
- **active watch** — an elevated-probability forecast window with a source post

## 2. Features to reproduce

### Data + API
1. Public read API with cursor pagination, `from`/`to`/`order` filters, problem+JSON errors.
2. `status` endpoint returning latest reset, scheduled reset, active watch and aggregate stats.
3. OpenAPI document + Swagger UI at `/api/docs`.
4. RSS/Atom/JSON feeds per provider, plus an iCal calendar feed.
5. Free-to-use, no API key, link-back attribution.

### Web UI
6. Home page: hero, per-provider cards with a live "waiting" countdown, quick stats.
7. Per-provider page: headline stats, next-estimate countdown, calendar heatmap, full record table.
8. History page: searchable / filterable list of every announcement.
9. Wiki: usage-limit knowledge base, one article per question, official doc quotes + links.
10. Prompts: copy-ready prompts to spend spare tokens, grouped by "inside a project" vs "existing conversation".
11. About / privacy / cookie pages.
12. Dark + light theme, responsive layout, accessible tables.

### Notifications ("Remind me")
13. Browser push (Web Push / VAPID).
14. Telegram channel + per-user webhook subscriptions.
15. Slack and Discord incoming-webhook subscriptions.
16. Email subscribe.
17. JSON API / RSS for self-hosted bots.

### Operations
18. Ingestion pipeline with pluggable source adapters, dedupe and change detection.
19. Cron endpoints for polling and notification fan-out.
20. Admin panel for curating records.
21. PWA (manifest + service worker), SEO (sitemap, robots, JSON-LD, OG images).
22. MCP server so agents can query reset data.

## 3. What this project implements

Everything above, in one dependency-light Next.js app:

- **Zero native dependencies** — persistence uses Node's built-in `node:sqlite`.
- **Web Push implemented on `node:crypto`** (RFC 8291 `aes128gcm` + RFC 8292 VAPID) so no extra package is required.
- **7 locales** with middleware-rewritten `/{locale}/…` paths.
- **Multi-provider** from day one, seeded with the real Codex/Claude/Grok history.
- **Live ingestion** from the public codex-resets API plus X-account adapters, with
  follow-up posts folded into the announcement they belong to.
- **Forecasts** from a trimmed mean of the interval history, with a confidence bucket derived
  from the coefficient of variation, so a bursty week cannot fake a precise-looking ETA.

### Verification

- `npm run selftest` — 30 assertions covering the classifier, statistics, feed builders,
session signing, i18n coverage and the RFC 8291 payload frame. No network, no framework.
- `npm run typecheck` and `npm run build` both pass clean (no warnings).
- Seeded counts track the reference trackers: Codex 53, Claude 13, Grok 5 (the Grok feed grew
  from 3 to 5 during development; `npm run seed:harvest` re-snapshots it).
- After seeding, live ingestion is a clean no-op (`0 new / 0 updated / 71 unchanged`), which
  proves the snapshot and the live pipeline agree.
- Every route and endpoint answers 200 (404 for unknown providers) under **both** `next start`
  and the standalone server, with `<html lang>` asserted per locale.

### Two standalone-server findings

The Docker image and most PaaS builders run Next's **standalone** server, which behaves
differently from `next start` in ways that silently broke i18n:

1. **Request headers set during a rewrite are dropped.** The original design inferred the
   locale from an `x-locale` header injected by middleware. Under `next start` that worked;
   under standalone every non-default locale rendered in English. Fixed by making the locale a
   real path segment (`src/app/[locale]/…`), so nothing depends on header propagation.
2. **The middleware is replayed against rewritten requests.** That made the
   `/en/codex → /codex` canonical redirect loop forever (`/` → `/en` → `/`). Fixed by letting
   `/en/…` render as an alias and pointing `canonical` at the unprefixed URL.

Both were caught by building the standalone artifact, copying it into a scratch directory the
way the Dockerfile does, and running the real `server.js` — not by trusting the dev server.
That check is worth repeating whenever the middleware or routing changes.

See `README.md` for the route map, deployment constraints and how to run it.
