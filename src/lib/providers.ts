import type { Provider, ProviderId } from "./types";

export const PROVIDERS: Provider[] = [
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    blurb:
      "ChatGPT Work and Codex usage limits, reset by the OpenAI Codex team.",
    accent: "codex",
    sortOrder: 1,
    sources: [
      {
        handle: "thsottiaux",
        label: "Tibo",
        url: "https://x.com/thsottiaux",
      },
    ],
    usageUrl: "https://chatgpt.com/codex/settings/usage",
    usageLabel: "chatgpt.com/codex/settings/usage",
    docsUrl: "https://help.openai.com/",
    statusUrl: "https://status.openai.com/",
    enabled: true,
  },
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    blurb:
      "Claude and Claude Code 5-hour and weekly usage limits, reset by Anthropic.",
    accent: "claude",
    sortOrder: 2,
    sources: [
      {
        handle: "ClaudeDevs",
        label: "Claude Developers",
        url: "https://x.com/ClaudeDevs",
      },
      {
        handle: "lydiahallie",
        label: "Lydia Hallie",
        url: "https://x.com/lydiahallie",
      },
    ],
    usageUrl: "https://claude.ai/settings/usage",
    usageLabel: "Settings › Usage on claude.ai",
    docsUrl: "https://docs.claude.com/",
    statusUrl: "https://status.anthropic.com/",
    enabled: true,
  },
  {
    id: "grok",
    name: "Grok",
    vendor: "xAI",
    blurb: "Grok and Grok Bot usage limits, reset by xAI.",
    accent: "grok",
    sortOrder: 3,
    sources: [
      { handle: "grok", label: "Grok", url: "https://x.com/grok" },
      { handle: "bot", label: "Grok Bot", url: "https://x.com/bot" },
      { handle: "elonmusk", label: "Elon Musk", url: "https://x.com/elonmusk" },
    ],
    usageUrl: "https://grok.com/",
    usageLabel: "grok.com",
    docsUrl: "https://docs.x.ai/",
    statusUrl: "https://status.x.ai/",
    enabled: true,
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}
