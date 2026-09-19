"use client";

import { useActionState } from "react";
import type { AdminAction, ActionResult } from "@/app/[locale]/admin/actions";

export function AdminForm({
  action,
  children,
  submitLabel,
  className = "stack",
  compact = false,
}: {
  action: AdminAction;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
          {pending ? "…" : submitLabel}
        </button>
        {state && (
          <span
            className={`small ${state.ok ? "" : "muted"}`}
            style={{ color: state.ok ? "var(--ok)" : "var(--warn)" }}
            role="status"
          >
            {state.message}
          </span>
        )}
      </div>
      {compact ? null : null}
    </form>
  );
}

export function AdminInlineAction({
  action,
  fields,
  label,
  variant = "",
  confirm,
}: {
  action: AdminAction;
  fields: Record<string, string>;
  label: string;
  variant?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  return (
    <form
      action={formAction}
      style={{ display: "inline" }}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className={`btn btn--sm ${variant}`}
        disabled={pending}
        title={state && !state.ok ? state.message : undefined}
      >
        {pending ? "…" : label}
      </button>
    </form>
  );
}
