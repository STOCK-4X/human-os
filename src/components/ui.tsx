"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Provenance } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Page({ title, eyebrow, subtitle, action, children }: { title: string; eyebrow?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-32 fade-in">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="tabular text-xs font-semibold tracking-[0.06em] text-muted uppercase">{eyebrow}</div>}
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
        </div>
        {action}
      </header>
      <div className="space-y-4">{children}</div>
    </main>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const SOURCE_LABEL: Record<Provenance, string> = {
  garmin: "Garmin",
  device: "Device",
  csv: "Imported",
  manual: "You",
  calculated: "Calculated",
  ai: "AI",
};

/** Small label that tells you where a number came from. */
export function SourceBadge({ source }: { source: Provenance }) {
  return (
    <span
      title={
        source === "calculated"
          ? "Calculated by the app from your data"
          : source === "ai"
            ? "AI interpretation — not a measurement"
            : source === "manual"
              ? "Entered by you"
              : source === "csv"
                ? "Imported from a file"
                : "Measured by a device (an estimate)"
      }
      className={cx(
        "rounded-full px-1.5 py-px text-[10px] font-medium tracking-wide uppercase",
        source === "ai" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  source,
  hint,
  tone,
}: {
  label: string;
  value?: ReactNode;
  unit?: string;
  source?: Provenance;
  hint?: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  const missing = value === undefined || value === null || value === "";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-xs text-muted">{label}</span>
        {!missing && source && <SourceBadge source={source} />}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={cx(
            "tabular text-xl font-semibold tracking-tight",
            missing && "text-muted",
            tone === "good" && "text-good",
            tone === "warn" && "text-warn",
            tone === "bad" && "text-bad",
          )}
        >
          {missing ? "—" : value}
        </span>
        {!missing && unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-xs text-sm text-muted">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-9 flex-1 rounded-lg px-2 text-sm font-medium transition-colors",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1–5 rating buttons. Tapping the selected value clears it. */
export function Rating({
  value,
  onChange,
  low,
  high,
  label,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  low: string;
  high: string;
  label: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted">
          {low} → {high}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(value === n ? undefined : n)}
            className={cx(
              "tabular min-h-11 rounded-xl border text-sm font-medium",
              value === n ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line")}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 sm:m-auto sm:max-w-lg"
    >
      {open && (
        <div className="sheet-in max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] text-ink sm:rounded-3xl">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="btn-quiet -mr-2 px-2" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function LinkRow({ href, icon, title, hint }: { href: string; icon: ReactNode; title: string; hint?: string }) {
  return (
    <Link href={href} className="flex min-h-12 items-center gap-3 rounded-xl px-1 active:bg-surface-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      <span className="text-muted">›</span>
    </Link>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: ReactNode }) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx(
        "rounded-xl px-3 py-2.5 text-sm",
        tone === "info" && "bg-surface-2 text-muted",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "bad" && "bg-bad/10 text-bad",
      )}
    >
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-28 animate-pulse bg-surface-2" />
      ))}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}
