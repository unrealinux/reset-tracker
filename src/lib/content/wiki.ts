export interface WikiQuote {
  text: string;
  source: string;
  url: string;
}

export interface WikiProviderAnswer {
  provider: "codex" | "claude";
  verdict: string;
  body: string[];
}

export interface WikiArticle {
  slug: string;
  topic: string;
  question: string;
  summary: string;
  /** One-line answer shown next to the toggle for each provider. */
  short: { codex: string; claude: string };
  answers: WikiProviderAnswer[];
  quotes: WikiQuote[];
  practice: string[];
  sourcesChecked: string;
  lastReviewed: string;
}

export const WIKI_TOPICS = [
  "5-hour window",
  "Weekly limit",
  "Thinking",
  "Subagents",
  "Cache",
  "Web search",
  "Reset card",
] as const;

export const wikiArticles: WikiArticle[] = [
  {
    slug: "5-hour-window",
    topic: "5-hour window",
    question: "How is the 5-hour window counted?",
    summary:
      "Codex opens a fixed 5-hour window at your first message after the previous one ends. Claude runs a rolling 5-hour session. Neither is a fixed number of messages.",
    short: {
      codex: "A window starts with your first message and ends 5 hours later.",
      claude: "A rolling session that starts with your first message.",
    },
    answers: [
      {
        provider: "codex",
        verdict: "Fixed window, opened by your first message.",
        body: [
          "The window is anchored to time, not to a message count. Your first request after the previous window closes opens a new one, and every request inside it draws from the same allowance until the five hours are up.",
          "Because the window is fixed once open, spending your allowance in the first ten minutes does not shorten the wait — the next window still opens five hours after the current one started.",
        ],
      },
      {
        provider: "claude",
        verdict: "Rolling 5-hour session.",
        body: [
          "Claude Code and claude.ai share the same session allowance. The session begins with your first message and refills five hours later; the first message after that opens the next session.",
          "Because the timer is per-account, switching between the CLI, the desktop app and the web does not give you a second, independent window.",
        ],
      },
    ],
    quotes: [
      {
        text: "Your plan's included usage limit will reset every five hours once you reach it. Usage credits don't affect this reset timing.",
        source: "Claude Help Center · Manage usage credits for paid Claude plans",
        url: "https://support.claude.com/",
      },
      {
        text: "Codex usage is measured in five-hour windows that begin with your first message after the previous window ends.",
        source: "OpenAI Help Center · Using Codex with your ChatGPT plan",
        url: "https://help.openai.com/",
      },
    ],
    practice: [
      "Start a window deliberately: the first message you send after a break sets the clock, so a throwaway prompt opens it early.",
      "If only the short window is exhausted, waiting is usually cheaper than switching models — the weekly bar is untouched.",
      "Track the exact time in your own account; an announced reset is an extra clear on top of it, not a replacement.",
    ],
    sourcesChecked: "2026-09-15",
    lastReviewed: "2026-09-15",
  },
  {
    slug: "weekly-limit",
    topic: "Weekly limit",
    question: "How is the weekly limit counted?",
    summary:
      "Claude has a fixed weekly reset time assigned to your account. For Codex, redeeming a banked reset moves the weekly reset date to seven days after your next request.",
    short: {
      codex: "A rolling seven days anchored by your first request after a reset.",
      claude: "A fixed weekly time assigned to your account.",
    },
    answers: [
      {
        provider: "codex",
        verdict: "Anchored to your first request after the last reset.",
        body: [
          "Under normal use the weekly allowance refreshes on the cadence shown in your account. When you redeem a banked reset the weekly clock restarts: the next weekly reset lands seven days after your first request following the redemption.",
          "That is why a redeemed card can move your weekly reset date to a day that has nothing to do with your billing date.",
        ],
      },
      {
        provider: "claude",
        verdict: "A fixed weekly time that belongs to your account.",
        body: [
          "The weekly allowance refills once every seven days at a time assigned to your account — not at Monday midnight, and not on your billing date. Settings › Usage shows the exact instant.",
          "Some plans also carry a model-specific weekly allowance on top of the overall one, which is why two bars can be full at different moments.",
        ],
      },
    ],
    quotes: [
      {
        text: "Using a full banked reset refreshes your 5-hour and weekly Codex usage windows and changes your weekly reset date.",
        source: "OpenAI Help Center · How banked Codex resets work",
        url: "https://help.openai.com/",
      },
      {
        text: "Claude Code drops a window once its resets_at time passes and shows the new one under /usage.",
        source: "Claude Code docs · Customize your status line",
        url: "https://docs.claude.com/en/docs/claude-code/statusline",
      },
    ],
    practice: [
      "Write down your weekly reset instant once. Plan heavy sessions around it instead of guessing.",
      "Redeem a banked reset while both bars are high — a card that finds nothing to refresh stays in your account.",
      "Do not confuse the weekly bar with an announced reset: an announcement clears usage, it does not change your plan's ceiling.",
    ],
    sourcesChecked: "2026-09-15",
    lastReviewed: "2026-09-15",
  },
  {
    slug: "thinking",
    topic: "Thinking",
    question: "Does thinking count toward the limit?",
    summary:
      "Yes on both. Reasoning tokens are usage, so a higher reasoning effort or a larger thinking budget consumes more of the window for the same visible answer.",
    short: {
      codex: "Yes — reasoning tokens are billed as usage.",
      claude: "Yes — extended thinking consumes output tokens.",
    },
    answers: [
      {
        provider: "codex",
        verdict: "Yes, reasoning tokens are usage.",
        body: [
          "Reasoning effort is a direct multiplier on consumption. The same task at a higher effort can spend several times the allowance for a modest quality gain.",
          "Long thinking traces also inflate the context that later turns carry, so the cost compounds within a window rather than staying flat.",
        ],
      },
      {
        provider: "claude",
        verdict: "Yes, thinking tokens are billed like output.",
        body: [
          "Extended thinking produces real tokens, and those tokens count. Raising the thinking budget raises consumption before any tool call happens.",
          "Because thinking tokens stay in the conversation, a single deep-thinking turn keeps costing on every following request in that session.",
        ],
      },
    ],
    quotes: [
      {
        text: "Reasoning tokens are part of the model's output and count toward your usage.",
        source: "OpenAI Help Center · Managing usage",
        url: "https://help.openai.com/",
      },
      {
        text: "Extended thinking tokens are billed as output tokens.",
        source: "Claude docs · Extended thinking",
        url: "https://docs.claude.com/en/docs/build-with-claude/extended-thinking",
      },
    ],
    practice: [
      "Reserve high reasoning effort for genuinely hard turns; keep routine edits at a lower setting.",
      "If a task is nearly done, do not raise effort to squeeze out the last 5% — it is the most expensive way to finish.",
      "Start a fresh conversation after a deep-thinking turn so the trace stops being re-read.",
    ],
    sourcesChecked: "2026-09-15",
    lastReviewed: "2026-09-15",
  },
  {
    slug: "subagents",
    topic: "Subagents",
    question: "Do subagents count toward the limit?",
    summary:
      "Yes on both, and they cost more than a single agent: each subagent runs its own model and tool work against the same shared allowance.",
    short: {
      codex: "Yes — each helper runs its own inference.",
      claude: "Yes — subagent turns bill to the same session.",
    },
    answers: [
      {
        provider: "codex",
        verdict: "Yes. Parallel helpers multiply consumption.",
        body: [
          "Every subagent performs its own model calls and tool calls. Running four helpers in parallel can consume roughly four times the tokens of doing the work inline, before any retries.",
          "Subagent transcripts are also replayed into the orchestrating context, so the parent pays again for what the child already read.",
        ],
      },
      {
        provider: "claude",
        verdict: "Yes. Subagent work bills to the same allowance.",
        body: [
          "Claude Code subagents share the parent session's allowance. A subagent that explores a large repository can spend more than the task it was spawned for.",
          "Nested subagents compound this: each level re-reads context that was already paid for at the level above.",
        ],
      },
    ],
    quotes: [
      {
        text: "Subagents have their own context window and consume usage when they run.",
        source: "Claude Code docs · Subagents",
        url: "https://docs.claude.com/en/docs/claude-code/sub-agents",
      },
      {
        text: "Tool use and parallel agent work increase how much of your allowance a task consumes.",
        source: "OpenAI Help Center · Managing usage with Codex",
        url: "https://help.openai.com/",
      },
    ],
    practice: [
      "Scope a subagent to a directory, not the whole repository.",
      "Prefer two sequential, narrow subagents over five parallel broad ones.",
      "Ask the agent to summarise a subagent's findings instead of pasting its transcript back.",
    ],
    sourcesChecked: "2026-09-15",
    lastReviewed: "2026-09-15",
  },
  {
    slug: "cache",
    topic: "Cache",
    question: "Does prompt caching count toward the limit?",
    summary:
      "Cached input still counts, at a lower rate, on both. Codex does not charge for cache writes; Claude does not count reused project content again. Neither publishes the exact discount inside a subscription window.",
    short: {
      codex: "Cached input counts at a reduced rate.",
      claude: "Cache reads are discounted but not free.",
    },
    answers: [
      {
        provider: "codex",
        verdict: "Cached input is cheaper, not free.",
        body: [
          "Re-reading the same prefix is cheaper than sending it fresh, which is why keeping a stable project context at the top of a conversation helps.",
          "Cache writes themselves are not billed separately, so the first request that establishes a cache is not penalised.",
        ],
      },
      {
        provider: "claude",
        verdict: "Reused project content is discounted, not free.",
        body: [
          "Content already in a cached prefix is not counted again at the full rate, which is what makes long, stable project instructions affordable.",
          "Editing earlier turns invalidates the cache and the next request pays full price for the whole prefix again.",
        ],
      },
    ],
    quotes: [
      {
        text: "Prompt caching lets you reuse a prefix and reduces the cost of the repeated portion.",
        source: "Claude docs · Prompt caching",
        url: "https://docs.claude.com/en/docs/build-with-claude/prompt-caching",
      },
      {
        text: "Cached input is billed at a reduced rate compared with uncached input.",
        source: "OpenAI Help Center · Managing usage",
        url: "https://help.openai.com/",
      },
    ],
    practice: [
      "Keep stable instructions at the top of the conversation; avoid editing early turns mid-task.",
      "Do not start a new chat for every small follow-up — you throw away the cache and pay full price again.",
      "Treat caching as a discount, not as extra allowance: it changes the price, not the ceiling.",
    ],
    sourcesChecked: "2026-09-15",
    lastReviewed: "2026-09-15",
  },
  {
    slug: "web-search",
    topic: "Web search",
    question: "Does web search count toward the limit?",
    summary:
      "Claude: yes — web search and web fetch count. Codex: OpenAI does not document web search separately, but tool use and retrieval are listed as things that raise usage.",
    short: {
      codex: "Not documented separately; tool use raises usage.",
      claude: "Yes — search and fetch are billed as tool use.",
    },
    answers: [
      {
        provider: "codex",
        verdict: "Tool use raises usage; search is not broken out.",
        body: [
          "Search retrieves pages into the context window, and everything in the context window is read on later turns. A single search can therefore cost more than the question that triggered it.",
          "Because retrieved pages stay in the conversation, a long research session keeps paying for pages it no longer needs.",
        ],
      },
      {
        provider: "claude",
        verdict: "Yes. Search and fetch count as tool use.",
        body: [
          "Web search and web fetch are server-side tools: each call adds both its own cost and the fetched content to the conversation.",
          "The fetched text is then part of every subsequent request in that session, so the cost of a search is not a one-off.",
        ],
      },
    ],
    quotes: [
      {
        text: "Web search and web fetch are billed as tool use and contribute to your usage.",
        source: "Claude docs · Web search tool",
        url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool",
      },
      {
        text: "Tool use and retrieval are among the factors that increase how much of your allowance a task consumes.",
        source: "OpenAI Help Center · Managing usage with Codex",
        url: "https://help.openai.com/",
      },
    ],
    practice: [
      "Ask the agent to summarise search results into a short block and then start a new turn with only that block.",
      "Prefer fetching one authoritative page over searching five times.",
      "If you already know the answer, say so — an unnecessary search is pure cost.",
    ],
    sourcesChecked: "2026-09-15",
    lastReviewed: "2026-09-15",
  },
  {
    slug: "reset-card",
    topic: "Reset card",
    question: "Does the countdown change after I use a reset card?",
    summary:
      "Codex: yes. A banked reset refreshes both the 5-hour and weekly windows and moves your weekly reset date. Claude has no reset cards; an announced reset clears usage, and Anthropic does not document how the timers move.",
    short: {
      codex: "Yes — both windows refresh and the weekly date moves.",
      claude: "No reset cards exist; announced resets are applied directly.",
    },
    answers: [
      {
        provider: "codex",
        verdict: "Both windows refresh and the weekly date moves.",
        body: [
          "A banked reset is saved in your account until you use it or it expires. Eligibility, affected windows and expiration depend on the offer and account.",
          "A full banked reset refreshes the 5-hour and weekly windows and changes the weekly reset date. Check Settings → Usage for the updated time.",
          "The card is consumed only when it actually refreshes at least one window. If there is nothing to reset, it stays available.",
          "An automatic or global reset is applied directly and is never saved. No reset raises your plan's limits.",
        ],
      },
      {
        provider: "claude",
        verdict: "No cards; announced resets are applied directly.",
        body: [
          "Anthropic resets are announced and applied immediately. Anthropic does not document how the session or weekly reset time moves afterwards.",
          "Claude Code drops a window once its reset time passes and shows the new one under /usage. Usage credits do not change reset timing.",
        ],
      },
    ],
    quotes: [
      {
        text: "Using a full banked reset refreshes your 5-hour and weekly Codex usage windows and changes your weekly reset date. Check Settings → Usage for your updated reset time.",
        source: "OpenAI Help Center · How banked Codex resets work",
        url: "https://help.openai.com/",
      },
      {
        text: "The reset is consumed only when it successfully refreshes at least one eligible usage window. If there is nothing to reset, it remains available.",
        source: "OpenAI Help Center · How banked Codex resets work",
        url: "https://help.openai.com/",
      },
      {
        text: "Today we are resetting usage limits for all subscribers.",
        source: "Anthropic Engineering · An update on recent Claude Code quality reports",
        url: "https://www.anthropic.com/engineering",
      },
      {
        text: "Usage credits don't affect this reset timing.",
        source: "Claude Help Center · Manage usage credits for paid Claude plans",
        url: "https://support.claude.com/",
      },
    ],
    practice: [
      "Redeem a card when both bars are high; a card that finds nothing to reset stays in your account.",
      "After redeeming, re-check Settings → Usage, because your weekly reset date has moved.",
      "This site records announced resets and cards. The countdown itself only lives in your account.",
    ],
    sourcesChecked: "2026-09-15",
    lastReviewed: "2026-09-15",
  },
];

export function getWikiArticle(slug: string): WikiArticle | undefined {
  return wikiArticles.find((a) => a.slug === slug);
}

export function wikiNeighbours(slug: string): {
  previous: WikiArticle | null;
  next: WikiArticle | null;
} {
  const index = wikiArticles.findIndex((a) => a.slug === slug);
  return {
    previous: index > 0 ? wikiArticles[index - 1] : null,
    next: index >= 0 && index < wikiArticles.length - 1 ? wikiArticles[index + 1] : null,
  };
}
