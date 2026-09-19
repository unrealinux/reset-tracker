import { ImageResponse } from "next/og";
import { allProviderStatuses } from "@/lib/repo";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  const statuses = allProviderStatuses();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f6f4ec",
          color: "#16150f",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              background: "#16150f",
              color: "#f6f4ec",
              padding: "4px 16px",
              borderRadius: 10,
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            WR
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            whenreset<span style={{ color: "#cf6b45", marginLeft: 2 }}>.</span>
          </div>
        </div>

        <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.05, marginTop: 34, letterSpacing: -2 }}>
          Codex, Claude &amp; Grok reset tracker
        </div>
        <div style={{ fontSize: 26, color: "#6f6c5e", marginTop: 12 }}>
          Last official usage reset for every provider, with the original announcement.
        </div>

        <div style={{ display: "flex", gap: 22, marginTop: "auto" }}>
          {statuses.map((status) => {
            const accent =
              status.provider.id === "codex"
                ? "#0f9d76"
                : status.provider.id === "claude"
                  ? "#cf6b45"
                  : "#5b5bd6";
            return (
              <div
                key={status.provider.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  border: "4px solid #16150f",
                  borderRadius: 20,
                  padding: 24,
                  background: "#fffdf6",
                  borderTop: `14px solid ${accent}`,
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 700 }}>{status.provider.name}</div>
                <div style={{ fontSize: 44, fontWeight: 800, marginTop: 8 }}>
                  {status.stats.lastResetAt
                    ? formatShortDate(status.stats.lastResetAt, "en", "UTC")
                    : "—"}
                </div>
                <div style={{ fontSize: 20, color: "#6f6c5e" }}>
                  {status.stats.daysSinceLast !== null
                    ? `${status.stats.daysSinceLast.toFixed(1)} days waiting`
                    : "no history"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
