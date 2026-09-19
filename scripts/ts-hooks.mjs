import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Node ESM resolve hook that lets the CLI scripts import the app's TypeScript
 * modules the same way the bundler does: extensionless relative specifiers
 * (`./config` → `./config.ts`). Node's built-in type stripping handles the rest.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    for (const candidate of [`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`]) {
      try {
        const url = new URL(candidate, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(candidate, context);
      } catch {
        /* fall through to the default resolver */
      }
    }
  }
  return next(specifier, context);
}
