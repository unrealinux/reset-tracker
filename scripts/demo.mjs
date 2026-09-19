#!/usr/bin/env node
/**
 * Publishes the local site on a public HTTPS URL, and keeps it up.
 *
 *   npm run demo                          # auto: try the fixed name, fall back
 *   npm run demo -- --subdomain whenreset # preferred subdomain on serveo
 *   npm run demo -- --no-build            # reuse the last build
 *   TUNNEL_PROVIDER=serveo npm run demo   # force one relay
 *
 * Behaviour
 *   - Tries the preferred subdomain first when one is configured.
 *   - If the relay refuses it (rate limit, name taken), falls back to a random
 *     address on the same relay, then to the next relay in the list, so you
 *     always end up with *something* shareable.
 *   - Retries the preferred subdomain every few minutes in the background and
 *     switches back as soon as it is accepted.
 *   - Rewrites SITE_URL whenever the address changes and restarts the server,
 *     so canonical links, OG images and feeds never point at a dead host.
 *
 * Secrets are generated into .env.local when missing, so a published site never
 * keeps the development password.
 *
 * This needs this machine to stay on. For a permanent address see the
 * Deployment section of the README (Zeabur / a VPS).
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envFile = path.join(root, ".env.local");
const port = process.env.PORT ?? "3000";
const skipBuild = process.argv.includes("--no-build");

const subdomainArg = process.argv.indexOf("--subdomain");
const preferredSubdomain =
  subdomainArg >= 0 ? process.argv[subdomainArg + 1] : (process.env.TUNNEL_SUBDOMAIN ?? "");

const RETRY_PREFERRED_MS = 5 * 60_000;
const RECONNECT_DELAY_MS = 5_000;

const RELAYS = {
  serveo: {
    label: "serveo.net",
    pattern: /https:\/\/[a-z0-9-]+\.serveousercontent\.com|https:\/\/[a-z0-9-]+\.serveo\.net/,
    args: (sub) =>
      sub
        ? ["-R", `${sub}:80:localhost:${port}`, "serveo.net"]
        : ["-R", `80:localhost:${port}`, "serveo.net"],
  },
  "localhost.run": {
    label: "localhost.run",
    pattern: /https:\/\/[a-z0-9-]+\.lhr\.life/,
    args: (sub) =>
      sub
        ? ["-R", `${sub}:80:localhost:${port}`, "nokey@localhost.run"]
        : ["-R", `80:localhost:${port}`, "nokey@localhost.run"],
  },
};

const forced = process.env.TUNNEL_PROVIDER;
const relayOrder = forced ? [forced] : ["serveo", "localhost.run"];
for (const name of relayOrder) {
  if (!RELAYS[name]) {
    console.error(`Unknown TUNNEL_PROVIDER "${name}". Use serveo or localhost.run.`);
    process.exit(1);
  }
}

// --- .env.local --------------------------------------------------------------

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
  fs.writeFileSync(
    envFile,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  );
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
  env.SITE_URL = env.SITE_URL || `http://localhost:${port}`;

  writeEnvFile(env);
  if (generated.length) console.log(`  已生成强密钥: ${generated.join(", ")}`);
  return env;
}

// --- processes ---------------------------------------------------------------

const children = [];
const isWindows = process.platform === "win32";
let stopping = false;

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
  stopping = true;
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function run(command, args) {
  // No `shell: true`: it concatenates arguments instead of escaping them, and
  // spawning `npm.cmd` that way fails on Windows with EINVAL.
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  return child;
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1500);
  }
  return false;
}

async function startServer() {
  const child = run(process.execPath, [nextBin, "start"]);
  child.stderr.on("data", (d) => {
    const text = d.toString();
    if (!/EADDRINUSE/.test(text)) process.stderr.write(`    ${text}`);
  });
  return (await waitForServer(`http://localhost:${port}/api/health`)) ? child : null;
}

/** Kills the server and waits for the port to actually free before rebinding. */
async function stopServer(child) {
  if (!child) return;
  killTree(child);
  const index = children.indexOf(child);
  if (index >= 0) children.splice(index, 1);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const alive = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(1200),
    })
      .then(() => true)
      .catch(() => false);
    if (!alive) return;
    await sleep(500);
  }
}

/** Opens one relay session. Resolves with its public URL, or null. */
function openTunnel(relay, subdomain) {
  return new Promise((resolve) => {
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
      ...relay.args(subdomain),
    ]);

    let buffer = "";
    let settled = false;
    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ process: tunnel, url });
    };
    const timer = setTimeout(() => finish(null), 40_000);

    const inspect = (chunk) => {
      buffer += chunk.toString();
      if (subdomain && /only allowed|not available|already in use|denied/i.test(buffer)) {
        console.log(`    ${relay.label} 拒绝子域名 "${subdomain}"`);
      }
      const match = buffer.match(relay.pattern);
      if (match) finish(match[0]);
    };

    tunnel.stdout.on("data", inspect);
    tunnel.stderr.on("data", inspect);
    tunnel.on("exit", () => finish(null));
  });
}

/**
 * Walks the relay list until one accepts a session. The preferred subdomain is
 * attempted first only while we are not already using it.
 */
async function acquireTunnel({ allowPreferred }) {
  for (const name of relayOrder) {
    const relay = RELAYS[name];

    if (allowPreferred && preferredSubdomain) {
      const attempt = await openTunnel(relay, preferredSubdomain);
      if (attempt.url && attempt.url.includes(preferredSubdomain)) {
        return { ...attempt, relay, fixed: true };
      }
      if (attempt.process) killTree(attempt.process);
    }

    const random = await openTunnel(relay, "");
    if (random.url) return { ...random, relay, fixed: false };
    if (random.process) killTree(random.process);
  }
  return null;
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
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`构建失败 (${code})`))));
  });
} else {
  console.log("2/4 使用已有构建产物（--no-build）");
}

if (preferredSubdomain) {
  console.log(`3/4 公网隧道（优先固定域名 "${preferredSubdomain}"，被拒则自动降级）`);
} else {
  console.log(`3/4 公网隧道（随机地址；加 --subdomain 名字 可固定）`);
}

let server = null;
let currentUrl = null;
let lastPreferredAttempt = 0;
let usingFixed = false;

console.log("4/4 启动服务并对外发布");
for (;;) {
  // Retry the nicer address periodically while running on a random one.
  const allowPreferred =
    Boolean(preferredSubdomain) &&
    (!usingFixed || currentUrl === null) &&
    Date.now() - lastPreferredAttempt > RETRY_PREFERRED_MS;
  if (allowPreferred) lastPreferredAttempt = Date.now();

  const acquired = await acquireTunnel({ allowPreferred });

  if (!acquired) {
    console.error("    所有 relay 均不可用，15 秒后重试（常见原因：临时限流）");
    await sleep(15_000);
    continue;
  }

  const { process: tunnel, url, relay, fixed } = acquired;
  usingFixed = fixed;

  if (url !== currentUrl) {
    const previous = currentUrl;
    currentUrl = url;
    const fresh = readEnvFile();
    fresh.SITE_URL = url;
    writeEnvFile(fresh);

    if (!server) {
      server = await startServer();
    } else if (previous) {
      // Address changed: restart so canonical/OG/feeds reflect the live host.
      await stopServer(server);
      server = await startServer();
    }
  }

  if (!server) {
    console.error("    本地服务未能就绪，10 秒后重试");
    killTree(tunnel);
    await sleep(10_000);
    continue;
  }

  const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(25_000) })
    .then((r) => r.json())
    .catch(() => null);

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  现在就发给别人   ${url}`);
  console.log(`  地址类型         ${fixed ? `固定域名（${preferredSubdomain}）` : `临时随机地址 · ${relay.label}`}`);
  console.log(`  管理后台         ${url}/admin`);
  console.log(`  后台密码         ${env.ADMIN_PASSWORD}`);
  console.log(`  API 文档         ${url}/api/docs`);
  if (health) {
    console.log(
      `  数据             ${health.providers.map((p) => `${p.id} ${p.records}`).join(" · ")}`,
    );
  }
  if (!fixed && preferredSubdomain) {
    console.log(`  提示             已排入后台重试，固定域名一旦可用会自动切过去`);
  }
  console.log("=".repeat(72));
  console.log("\n保持本窗口开着；隧道断开会自动重连。Ctrl+C 结束。\n");

  await new Promise((resolve) => {
    if (!tunnel || tunnel.exitCode !== null) return resolve();
    tunnel.once("exit", resolve);
  });

  if (stopping) break;
  console.log("隧道断开，5 秒后自动重连…");
  await sleep(RECONNECT_DELAY_MS);
}
