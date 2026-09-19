#!/usr/bin/env node
/**
 * One command from a local checkout to a public HTTPS URL.
 *
 *   npm run demo                 # build (if needed), serve, open an SSH tunnel
 *   npm run demo -- --no-build   # skip the build step
 *   TUNNEL_PROVIDER=localhost.run npm run demo
 *
 * It generates strong admin/cron secrets into .env.local if they are missing or
 * still set to the development defaults — publishing a site whose admin password
 * is "admin" is the one mistake worth preventing by default.
 *
 * The tunnel is a third-party relay and is meant for showing the site to
 * someone, not for production. It can drop; rerun the command to get a new URL.
 * For a permanent address deploy to Render / Zeabur / a VPS (see README).
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envFile = path.join(root, ".env.local");
const port = process.env.PORT ?? "3000";
const skipBuild = process.argv.includes("--no-build");

const PROVIDERS = {
  serveo: {
    label: "serveo.net",
    args: ["-R", `80:localhost:${port}`, "serveo.net"],
    pattern: /https:\/\/[a-z0-9-]+\.serveousercontent\.com/,
  },
  "localhost.run": {
    label: "localhost.run",
    args: ["-R", `80:localhost:${port}`, "nokey@localhost.run"],
    pattern: /https:\/\/[a-z0-9]+\.lhr\.life/,
  },
};

const providerName = process.env.TUNNEL_PROVIDER ?? "serveo";
const provider = PROVIDERS[providerName];
if (!provider) {
  console.error(`Unknown TUNNEL_PROVIDER "${providerName}". Use serveo or localhost.run.`);
  process.exit(1);
}

// --- secrets -----------------------------------------------------------------

function readEnvFile() {
  if (!fs.existsSync(envFile)) return {};
  const out = {};
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function writeEnvFile(values) {
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  fs.writeFileSync(envFile, `${body}\n`);
}

const random = (bytes) => crypto.randomBytes(bytes).toString("base64url");
const strong = (value) => Boolean(value) && value.length >= 12 && value !== "admin";

function ensureSecrets() {
  const env = readEnvFile();
  const generated = [];

  if (!strong(env.ADMIN_PASSWORD)) {
    env.ADMIN_PASSWORD = random(14).slice(0, 18);
    generated.push("ADMIN_PASSWORD");
  }
  if (!strong(env.ADMIN_SECRET)) {
    env.ADMIN_SECRET = crypto.randomBytes(32).toString("hex");
    generated.push("ADMIN_SECRET");
  }
  if (!strong(env.CRON_SECRET)) {
    env.CRON_SECRET = crypto.randomBytes(32).toString("hex");
    generated.push("CRON_SECRET");
  }

  env.NODE_ENV = "production";
  env.DATA_DIR = env.DATA_DIR || "./data";
  env.ENABLE_SCHEDULER = env.ENABLE_SCHEDULER || "1";
  env.SCHEDULER_INTERVAL_MINUTES = env.SCHEDULER_INTERVAL_MINUTES || "60";
  env.SOURCE_CODEX_RESETS_API = env.SOURCE_CODEX_RESETS_API || "1";
  env.SITE_URL = env.SITE_URL || "http://localhost:" + port;

  writeEnvFile(env);
  if (generated.length) console.log(`  生成强密钥: ${generated.join(", ")}`);
  return env;
}

// --- process helpers ---------------------------------------------------------

const children = [];
const isWindows = process.platform === "win32";

/** Windows shells spawn a child tree, so kill the whole tree, not just the shell. */
function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (isWindows && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill();
    }
  } catch {
    /* already gone */
  }
}

function shutdown(code = 0) {
  for (const child of children) killTree(child);
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function run(command, args, options = {}) {
  // No `shell: true`: it would concatenate arguments instead of escaping them.
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
  children.push(child);
  return child;
}

// Call Next's binary through the current Node executable. On Windows, spawning
// `npm.cmd` without a shell fails with EINVAL, and `shell: true` would need the
// arguments escaped. This path is identical everywhere.
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

/** Waits until the local server answers, or gives up after `timeoutMs`. */
async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

// --- main --------------------------------------------------------------------

console.log("\n1/4 准备密钥");
const env = ensureSecrets();

const hasBuild = fs.existsSync(path.join(root, ".next", "BUILD_ID"));
if (!skipBuild || !hasBuild) {
  console.log("2/4 构建生产版本（首次约 30 秒）");
  await new Promise((resolve, reject) => {
    const child = run(process.execPath, [nextBin, "build"]);
    child.stdout.on("data", (d) => process.stdout.write(`    ${d}`));
    child.stderr.on("data", (d) => process.stderr.write(`    ${d}`));
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`build failed (${code})`)),
    );
  });
} else {
  console.log("2/4 已有构建产物，跳过（--no-build）");
}

// The tunnel is opened first so the public URL is known before the server
// starts. That way SITE_URL is correct on the very first render — canonical
// links, OG images and feeds never point at localhost — and the server only
// has to be started once.
console.log(`3/4 建立公网隧道 (${provider.label})`);
const tunnel = run("ssh", [
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "ServerAliveInterval=20",
  "-o",
  "ServerAliveCountMax=3",
  "-o",
  "ExitOnForwardFailure=yes",
  "-T",
  ...provider.args,
]);

const publicUrl = await new Promise((resolve) => {
  let buffer = "";
  const timer = setTimeout(() => resolve(null), 45_000);
  const inspect = (chunk) => {
    buffer += chunk.toString();
    const match = buffer.match(provider.pattern);
    if (match) {
      clearTimeout(timer);
      resolve(match[0]);
    }
  };
  tunnel.stdout.on("data", inspect);
  tunnel.stderr.on("data", inspect);
  tunnel.on("exit", () => {
    clearTimeout(timer);
    resolve(null);
  });
});

if (!publicUrl) {
  console.error("    隧道建立失败。换一个再试：TUNNEL_PROVIDER=localhost.run npm run demo");
  shutdown(1);
}
console.log(`    ${publicUrl}`);

// Point canonical URLs, OG images and feeds at the public address before boot.
const fresh = readEnvFile();
fresh.SITE_URL = publicUrl;
writeEnvFile(fresh);

console.log("4/4 启动本地服务");
const server = run(process.execPath, [nextBin, "start"]);
server.stderr.on("data", (d) => process.stderr.write(`    ${d}`));

const localUrl = `http://localhost:${port}`;
if (!(await waitForServer(`${localUrl}/api/health`))) {
  console.error(`    本地服务未能就绪，请检查 ${localUrl}`);
  shutdown(1);
}
console.log(`    就绪: ${localUrl}`);

const check = await fetch(`${publicUrl}/api/health`, { signal: AbortSignal.timeout(25_000) })
  .then((r) => r.json())
  .catch(() => null);

console.log(`\n${"=".repeat(68)}`);
console.log(`  公网地址   ${publicUrl}`);
console.log(`  管理后台   ${publicUrl}/admin`);
console.log(`  后台密码   ${env.ADMIN_PASSWORD}`);
console.log(`  API 文档   ${publicUrl}/api/docs`);
if (check) {
  console.log(`  数据       ${check.providers.map((p) => `${p.id} ${p.records}`).join(" · ")}`);
}
console.log("=".repeat(68));
console.log("\n按 Ctrl+C 结束（隧道关闭后该地址即失效）。");
console.log("要一个永久地址：见 README 的 Deployment 章节（Render / Zeabur / VPS）。\n");
