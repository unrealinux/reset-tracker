"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export interface LocaleOption {
  code: string;
  label: string;
}

export function LocaleSwitcher({
  locale,
  options,
  label,
}: {
  locale: string;
  options: LocaleOption[];
  label: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const target = (code: string) => {
    // Strip any existing locale prefix from the current path.
    const segments = pathname.split("/").filter(Boolean);
    const codes = options.map((o) => o.code.toLowerCase());
    const rest = codes.includes((segments[0] ?? "").toLowerCase())
      ? segments.slice(1)
      : segments;
    const base = `/${rest.join("/")}`;
    if (code === "en") return base === "/" ? "/" : base;
    return base === "/" ? `/${code}` : `/${code}${base}`;
  };

  const choose = (code: string) => {
    setPending(code);
    router.push(target(code));
    setOpen(false);
  };

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">🌐</span>
        <span className="mono tiny">{pending ?? locale}</span>
      </button>
      {open && (
        <div className="dropdown" role="menu">
          {options.map((option) => (
            <button
              key={option.code}
              type="button"
              role="menuitemradio"
              aria-checked={option.code === locale}
              onClick={() => choose(option.code)}
            >
              <span>{option.label}</span>
              <span className="mono tiny muted">{option.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
