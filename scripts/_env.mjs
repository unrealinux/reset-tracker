import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

// Registered once, at import time. The CLI entry points statically import this
// module and then `await import()` the app's TypeScript, so the hook is active
// by the time those specifiers are resolved.
register("./ts-hooks.mjs", import.meta.url);

/**
 * Minimal .env loader for the CLI scripts. `next` loads these automatically,
 * plain `node` does not.
 */
export function loadEnv(root = process.cwd()) {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
