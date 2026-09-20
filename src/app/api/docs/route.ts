import { PROBLEM_CODES } from "@/lib/api";

export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reset Tracker API — reference</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f6f4ec; }
      .banner {
        margin: 20px; padding: 16px 20px; border: 3px solid #16150f; background: #fff3b0;
        box-shadow: 6px 6px 0 #16150f; max-width: 1360px; box-sizing: border-box; font-size: 15px;
      }
      .banner a { color: #16150f; font-weight: 700; }
      .banner code { background: #fff; border: 1px solid #16150f; padding: 2px 6px; }
      .banner summary { cursor: pointer; }
      .banner ul { margin: 10px 0 0; padding-left: 22px; }
      .banner li { margin: 2px 0; }
      .banner li:target { background: #fff3b0; outline: 2px solid #16150f; }
      #swagger-ui { max-width: 1400px; margin: 0 auto 40px; }
      @media (min-width: 1440px) { .banner { margin-left: auto; margin-right: auto; } }
    </style>
  </head>
  <body>
    <div class="banner" role="note">
      <strong>Free to use — please link back.</strong>
      This API needs no key. In return, credit
      <a href="/">whenreset</a> with a link wherever you display the data, for example
      <code>Data from &lt;a href="/"&gt;whenreset&lt;/a&gt;</code>.
    </div>
    <details class="banner" id="errors" role="note">
      <summary><strong>Error responses</strong> — JSON Problem Details (RFC 9457)</summary>
      <p style="margin:10px 0 0">
        Failures come back as <code>application/problem+json</code> with the fields
        <code>type</code>, <code>title</code>, <code>status</code>, <code>code</code>,
        <code>detail</code> and <code>request_id</code>. The <code>type</code> URL anchors at the
        matching entry below.
      </p>
      <ul>${PROBLEM_CODES.map((code) => `<li id="${code}"><code>${code}</code></li>`).join("")}</ul>
    </details>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin="anonymous"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          dom_id: "#swagger-ui",
          url: "/api/v1/openapi.json",
          deepLinking: true,
          displayRequestDuration: true,
          defaultModelsExpandDepth: 1,
          tryItOutEnabled: true,
        });
      };
    </script>
  </body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
