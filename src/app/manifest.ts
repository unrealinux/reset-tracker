import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "whenreset — Codex, Claude & Grok reset tracker",
    short_name: "whenreset",
    description:
      "Official usage-limit reset announcements for Codex, Claude and Grok, with history, forecasts and notifications.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f4ec",
    theme_color: "#16150f",
    categories: ["utilities", "productivity", "developer"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Codex resets", url: "/codex" },
      { name: "Claude resets", url: "/claude" },
      { name: "History", url: "/history" },
    ],
  };
}
