/**
 * Optional in-process scheduler.
 *
 * Most one-click hosts (Zeabur, Railway, Render, Fly, a single VPS container)
 * have no external cron. Setting `ENABLE_SCHEDULER=1` makes the server ingest on
 * its own, so a freshly deployed instance starts collecting data with no extra
 * moving parts.
 *
 * Leave it off when you run more than one replica — each replica would poll
 * independently. Ingestion is idempotent, so the only cost is duplicate
 * outbound requests. With multiple replicas, or on a serverless platform that
 * freezes between requests, use the external cron endpoints instead:
 *
 *   POST /api/cron/poll    -H "x-cron-secret: $CRON_SECRET"
 *   POST /api/cron/notify  -H "x-cron-secret: $CRON_SECRET"
 */

const globalForScheduler = globalThis as typeof globalThis & {
  __resetTrackerSchedulerRunning?: boolean;
};

const INITIAL_DELAY_MS = 20_000;
const MIN_INTERVAL_MINUTES = 5;

export async function register() {
  // Only ever run inside the Node.js server runtime, never in the edge
  // middleware bundle or during `next build`.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.ENABLE_SCHEDULER !== "1") return;
  if (globalForScheduler.__resetTrackerSchedulerRunning) return;
  globalForScheduler.__resetTrackerSchedulerRunning = true;

  const configured = Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? "60");
  const minutes = Number.isFinite(configured)
    ? Math.max(MIN_INTERVAL_MINUTES, Math.trunc(configured))
    : 60;

  const { runIngestion } = await import("./lib/ingest");

  const tick = async (label: string) => {
    try {
      const report = await runIngestion({ notify: true });
      console.log(
        `[scheduler] ${label} ingestion: ${report.inserted} new, ${report.updated} updated, ` +
          `${report.skipped} unchanged, ${report.mergedFollowUps} merged`,
      );
    } catch (error) {
      // A failing source must never take the web server down.
      console.error(
        `[scheduler] ${label} ingestion failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  };

  // Let the HTTP server finish booting before the first outbound request.
  const initial = setTimeout(() => void tick("initial"), INITIAL_DELAY_MS);
  const recurring = setInterval(() => void tick("scheduled"), minutes * 60_000);

  // Do not hold the event loop open on shutdown.
  initial.unref?.();
  recurring.unref?.();

  console.log(
    `[scheduler] in-process ingestion enabled: first run in ${INITIAL_DELAY_MS / 1000}s, ` +
      `then every ${minutes} min`,
  );
}
