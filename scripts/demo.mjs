#!/usr/bin/env node
/**
 * One command from a local checkout to a public HTTPS URL you can share.
 *
 *   npm run demo                                  # build if needed, serve, tunnel
 *   npm run demo -- --no-build                    # reuse the last build
 *   npm run demo -- --subdomain whenreset         # stable name (serveo: needs a registered key)
 *   TUNNEL_PROVIDER=localhost.run npm run demo    # use the other relay
 *
 * The tunnel is kept alive: if the relay drops the session, this reconnects and
 * rewrites SITE_URL, restarting the local server so canonical links and OG
 * images always point at the live address.
 *
 * Secrets are generated into .env.local when missing, so a published site never
 * keeps the development password.
 *
 * This is for showing the site to people, not for production: it needs this
 * machine to stay on. For a permanent address see the Deployment section of the
 * README (Zeabur / a VPS).
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
const subdomain =
  subdomainArg >= 0 ? process.argv[subdomainArg + 1] : (process.env.TUNNEL_SUBDOMAIN ?? "");

const PROVIDERS = {
  serveo: {
    label: "serveo.net",
    pattern: /https:\/\/[a-z0-9-]+\.serveousercontent\.com|https:\/\/[a-z0-9-]+\.serveo\.net/,
    args: (sub) => [...(sub ? ["-R", `${sub}:80:localhost:${port}`] : ["-R", `80:localhost:${port}`]), "serveo.net"],
  },
  "localhost.run": {
    label: "localhost.run",
    pattern: /https:\/\/[a-z0-9-]+\.lhr\.life/,
    args: (sub) => [
      ...(sub ? ["-R", `${sub}:80:localhost:${port}`] : ["-R", `80:localhost:${port}`]),
      "nokey@localhost.run",
    ],
  },
};

const providerName = process.env.TUNNEL_PROVIDER ?? "serveo";
const provider = PROVIDERS[providerName];
if (!provider) {
  console.error(`Unknown TUNNEL_PROVIDER "${providerName}". Use serveo or localhost.run.`);
  process.exit(1);
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
  // No `shell: true`: it concatenates arguments instead of escaping them, and on
  // Windows spawning `npm.cmd` that way fails outright.
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  return child;
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

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

async function startServer() {
  const child = run(process.execPath, [nextBin, "start"]);
  child.stderr.on("data", (d) => {
    const text = d.toString();
    if (!/EADDRINUSE/.test(text)) process.stderr.write(`    ${text}`);
  });
  const ok = await waitForServer(`http://localhost:${port}/api/health`);
  return ok ? child : null;
}

/** Kills the server and waits for the port to actually free up before rebinding. */
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
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
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

console.log(`3/4 公网隧道 (${provider.label})`);

/** Opens one tunnel session; resolves with its URL, or null if it never came up. */
function openTunnel() {
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
      ...provider.args(subdomain),
    ]);

    let buffer = "";
    let settled = false;
    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ process: tunnel, url });
    };
    const timer = setTimeout(() => finish(null), 45_000);

    const inspect = (chunk) => {
      buffer += chunk.toString();
      if (!subdomain && /register your SSH public key/i.test(buffer)) {
        const link = buffer.match(/https:\/\/console\.serveo\.net\/ssh\/keys[^\s]*/);
        if (link) {
          console.log("    想让地址固定下来？注册这个 key（用手机完成登录即可）:");
          console.log(`    ${link[0]}`);
        }
      }
      const match = buffer.match(provider.pattern);
      if (match) finish(match[0]);
    };

    tunnel.stdout.on("data", inspect);
    tunnel.stderr.on("data", inspect);
    tunnel.on("exit", () => finish(null));
  });
}

let server = null;
let currentUrl = null;

console.log("4/4 启动服务并对外发布");
for (;;) {
  const { process: tunnel, url } = await openTunnel();

  if (!url) {
    console.error("    隧道建立失败，10 秒后重试（可换后端：TUNNEL_PROVIDER=localhost.run npm run demo）");
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    continue;
  }

  // Each relay session gets a fresh address, so SITE_URL has to follow it or
  // canonical links and OG images would point at the dead one.
  if (url !== currentUrl) {
    currentUrl = url;
    const fresh = readEnvFile();
    fresh.SITE_URL = url;
    writeEnvFile(fresh);
    await stopServer(server);
    server = await startServer();
  }

  if (!server) {
    console.error("    本地服务未能就绪，10 秒后重试");
    killTree(tunnel);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    continue;
  }

  const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(25_000) })
    .then((r) => r.json())
    .catch(() => null);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  现在就发给别人   ${url}`);
  console.log(`  管理后台         ${url}/admin`);
  console.log(`  后台密码         ${env.ADMIN_PASSWORD}`);
  console.log(`  API 文档         ${url}/api/docs`);
  if (health) {
    console.log(
      `  数据             ${health.providers.map((p) => `${p.id} ${p.records}`).join(" · ")}`,
    );
  }
  console.log("=".repeat(70));
  console.log("\n隧道断开会自动重连（届时地址会变，重新看这里）。保持本窗口开着，Ctrl+C 结束。");
  console.log("要一个永不改变的地址：README 的 Deployment 章节（Zeabur / VPS）。\n");

  // Block until this session dies, then reconnect.
  await new Promise((resolve) => {
    if (!tunnel || tunnel.exitCode !== null) return resolve();
    tunnel.once("exit", resolve);
  });

  if (stopping) break;
  console.log("隧道断开，5 秒后自动重连…");
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
