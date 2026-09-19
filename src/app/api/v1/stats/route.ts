import { getDb } from "@/lib/db";
import { apiMeta, serializeForecast, serializeStats } from "@/lib/openapi";
import { json } from "@/lib/api";
import { PROVIDERS } from "@/lib/providers";
import { providerStatus } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDb();
  const totals = db
    .prepare(
      "SELECT provider, COUNT(*) AS total, SUM(reset_type = 'banked') AS banked FROM resets WHERE status = 'confirmed' GROUP BY provider",
    )
    .all() as unknown as { provider: string; total: number; banked: number }[];

  const data = PROVIDERS.map((provider) => {
    const status = providerStatus(provider);
    return {
      provider: provider.id,
      stats: serializeStats(status.stats),
      forecast: serializeForecast(status.forecast),
    };
  });

  return json(
    {
      data,
      totals: totals.map((row) => ({
        provider: row.provider,
        total: Number(row.total),
        banked: Number(row.banked ?? 0),
        regular: Number(row.total) - Number(row.banked ?? 0),
      })),
      meta: apiMeta(),
    },
    { maxAge: 60 },
  );
}
