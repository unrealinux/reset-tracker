import net from "node:net";
import tls from "node:tls";

/**
 * Tiny SMTP client (plain, STARTTLS and implicit TLS) with AUTH PLAIN / LOGIN.
 * Enough to deliver a plain-text or simple HTML notification without pulling in
 * a mail dependency.
 */

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  rejectUnauthorized?: boolean;
}

export function parseSmtpUrl(url: string, from: string): SmtpOptions {
  const parsed = new URL(url);
  const secure = parsed.protocol === "smtps:";
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
    secure,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    pass: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    from,
  };
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface Session {
  socket: net.Socket | tls.TLSSocket;
  buffer: string;
  read: () => Promise<string>;
  write: (line: string) => void;
  upgrade: () => Promise<void>;
  close: () => void;
}

function makeSession(socket: net.Socket | tls.TLSSocket, host: string): Session {
  let buffer = "";
  const waiters: ((value: string) => void)[] = [];

  const onData = (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    // A complete SMTP reply ends with "CODE text\r\n" where text may span lines.
    const lines = buffer.split("\r\n");
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (/^\d{3} /.test(lines[i])) {
        const reply = lines.slice(0, i + 1).join("\r\n");
        buffer = lines.slice(i + 1).join("\r\n");
        const waiter = waiters.shift();
        if (waiter) waiter(reply);
        return;
      }
    }
  };

  socket.on("data", onData);
  socket.setEncoding("utf8");

  const session: Session = {
    socket,
    get buffer() {
      return buffer;
    },
    set buffer(v: string) {
      buffer = v;
    },
    read: () =>
      new Promise<string>((resolve) => {
        waiters.push(resolve);
      }),
    write: (line: string) => {
      socket.write(`${line}\r\n`);
    },
    upgrade: async () => {
      socket.removeListener("data", onData);
      const secured = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const t = tls.connect({ socket: socket as net.Socket, servername: host }, () =>
          resolve(t),
        );
        t.once("error", reject);
      });
      session.socket = secured;
      secured.setEncoding("utf8");
      secured.on("data", onData);
      socket = secured;
    },
    close: () => {
      try {
        socket.end();
      } catch {
        /* already closed */
      }
    },
  };
  return session;
}

async function command(session: Session, line: string, expect: number[]): Promise<string> {
  session.write(line);
  const reply = await session.read();
  const code = Number(reply.slice(0, 3));
  if (!expect.includes(code)) {
    throw new Error(`SMTP ${line.split(" ")[0]} failed: ${reply.trim()}`);
  }
  return reply;
}

function encodeHeader(value: string): string {
  // RFC 2047 encoded word for non-ASCII subjects.
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildMessage(options: SmtpOptions, mail: Mail): string {
  const boundary = `wr-${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${options.from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
  ];

  if (!mail.html) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      mail.text,
    ].join("\r\n");
  }

  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

export async function sendMail(options: SmtpOptions, mail: Mail): Promise<void> {
  const connect = () =>
    new Promise<net.Socket>((resolve, reject) => {
      const socket = options.secure
        ? tls.connect(
            {
              host: options.host,
              port: options.port,
              servername: options.host,
              rejectUnauthorized: options.rejectUnauthorized ?? true,
            },
            () => resolve(socket as unknown as net.Socket),
          )
        : net.connect({ host: options.host, port: options.port }, () => resolve(socket));
      socket.once("error", reject);
      socket.setTimeout(20_000, () => {
        socket.destroy(new Error("SMTP connection timed out"));
      });
    });

  const raw = await connect();
  const session = makeSession(raw, options.host);

  try {
    const greeting = await session.read();
    if (!greeting.startsWith("220")) throw new Error(`SMTP greeting failed: ${greeting.trim()}`);

    const ehlo = await command(session, `EHLO ${options.host}`, [250]);

    if (!options.secure && /STARTTLS/i.test(ehlo)) {
      await command(session, "STARTTLS", [220]);
      await session.upgrade();
      await command(session, `EHLO ${options.host}`, [250]);
    }

    if (options.user && options.pass) {
      const authPlain = Buffer.from(`\0${options.user}\0${options.pass}`, "utf8").toString("base64");
      try {
        await command(session, `AUTH PLAIN ${authPlain}`, [235]);
      } catch {
        await command(session, "AUTH LOGIN", [334]);
        await command(session, Buffer.from(options.user, "utf8").toString("base64"), [334]);
        await command(session, Buffer.from(options.pass, "utf8").toString("base64"), [235]);
      }
    }

    await command(session, `MAIL FROM:<${extractAddress(options.from)}>`, [250]);
    await command(session, `RCPT TO:<${extractAddress(mail.to)}>`, [250, 251]);
    await command(session, "DATA", [354]);

    const message = buildMessage(options, mail).replace(/\r?\n\./g, "\r\n..");
    session.write(`${message}\r\n.`);
    await session.read();

    await command(session, "QUIT", [221]);
  } finally {
    session.close();
  }
}

export function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match ? match[1] : value.trim();
}
