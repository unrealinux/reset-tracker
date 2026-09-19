"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "wr_theme";
type Mode = "auto" | "light" | "dark";

function apply(mode: Mode) {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "auto" && prefersDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themeMode = mode;
}

export const themeBootstrapScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}')||'auto';var d=m==='dark'||(m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themeMode=m;}catch(e){}})();`;

export function ThemeToggle({
  labels,
}: {
  labels: { auto: string; light: string; dark: string; title: string };
}) {
  const [mode, setMode] = useState<Mode>("auto");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "auto";
    setMode(stored);
    apply(stored);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if ((localStorage.getItem(STORAGE_KEY) as Mode | null) === "auto") apply("auto");
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const choose = (next: Mode) => {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    setOpen(false);
  };

  const icons: Record<Mode, string> = { auto: "◐", light: "☀", dark: "☾" };

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.title}
        title={labels.title}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{icons[mode]}</span>
      </button>
      {open && (
        <div className="dropdown" role="menu">
          {(["auto", "light", "dark"] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={mode === option}
              onClick={() => choose(option)}
            >
              <span>
                {icons[option]} {labels[option]}
              </span>
              {mode === option && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
