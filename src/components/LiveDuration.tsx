"use client";

import { useEffect, useState } from "react";
import type { DurationLabels } from "@/lib/labels";

export type { DurationLabels };

interface LiveDurationProps {
  /** Direction: elapsed since `from`, or remaining until `to`. */
  mode: "since" | "until";
  from?: string | null;
  to?: string | null;
  fallback: string;
  labels: DurationLabels;
  /** `clock` shows `3d 04:12:09`, `coarse` shows the largest unit only. */
  style?: "coarse" | "clock";
  className?: string;
}

const DAY = 86_400_000;

export function LiveDuration({
  mode,
  from,
  to,
  fallback,
  labels,
  style = "coarse",
  className,
}: LiveDurationProps) {
  const [text, setText] = useState(fallback);

  useEffect(() => {
    const anchor = mode === "since" ? from : to;
    if (!anchor) {
      setText(fallback);
      return;
    }

    const compute = () => {
      const diff =
        mode === "since" ? Date.now() - +new Date(anchor) : +new Date(anchor) - Date.now();
      const abs = Math.abs(diff);
      const days = Math.floor(abs / DAY);
      const hours = Math.floor((abs % DAY) / 3_600_000);
      const minutes = Math.floor((abs % 3_600_000) / 60_000);
      const seconds = Math.floor((abs % 60_000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");

      if (style === "clock") {
        setText(
          days > 0
            ? `${days}${labels.dayShort} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
            : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
        );
        return;
      }

      if (days >= 1) setText(`${days} ${days === 1 ? labels.day : labels.days}`);
      else if (hours >= 1) setText(`${hours} ${hours === 1 ? labels.hour : labels.hours}`);
      else if (minutes >= 1) setText(`${minutes} ${labels.minutes}`);
      else setText(`${seconds}s`);
    };

    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [mode, from, to, style, labels, fallback]);

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
