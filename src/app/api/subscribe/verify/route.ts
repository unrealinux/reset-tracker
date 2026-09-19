import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSubscriber } from "@/lib/repo";
import { problem } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Confirms an email subscription. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return problem(400, "missing_parameter", "A token is required.", { parameter: "token" });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT id FROM subscribers WHERE channel = 'email' AND secret = ?")
    .get(token) as { id: string } | undefined;

  if (!row) {
    return problem(404, "not_found", "This confirmation link is not valid.");
  }

  db.prepare("UPDATE subscribers SET verified = 1, active = 1 WHERE id = ?").run(row.id);
  const subscriber = getSubscriber(row.id);

  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Subscription confirmed</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f4ec;color:#16150f;
      display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
 .card{background:#fffdf6;border:2px solid #16150f;border-radius:14px;box-shadow:6px 6px 0 #16150f;
       padding:28px;max-width:520px}
 h1{margin:0 0 10px;font-size:22px}
 p{margin:0 0 10px;line-height:1.55;color:#3d3b31}
 code{background:#efece1;border:1px solid #16150f;padding:2px 6px;border-radius:4px}
 a.btn{display:inline-block;margin-top:10px;background:#16150f;color:#f6f4ec;text-decoration:none;
       padding:9px 16px;border-radius:10px;font-weight:700}
</style></head>
<body><div class="card">
  <h1>🔔 Subscription confirmed</h1>
  <p>You will now receive an email whenever an official usage reset is announced for
     <strong>${subscriber?.provider === "all" ? "Codex, Claude or Grok" : subscriber?.provider ?? "your providers"}</strong>.</p>
  <p>Your confirmation token is <code>${token.slice(0, 8)}…</code>. Keep the management URL private.</p>
  <a class="btn" href="/">Back to the tracker</a>
</div></body></html>`;

  return new NextResponse(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
