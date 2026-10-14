"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, updateProfile } from "@/lib/db";
import { formatInstant } from "@/lib/date";
import { syncInbox, type InboxSyncResult } from "@/lib/inbox-sync";
import type { Profile } from "@/lib/types";
import { Card, Field, Notice, Sheet } from "./ui";

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold tracking-wide text-muted uppercase">{label}</span>
        <span className="block truncate font-mono text-xs">{display ?? value}</span>
      </span>
      <button
        className="btn-quiet min-h-9 px-2"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : <Copy size={16} />}
      </button>
    </div>
  );
}

const STEPS: { title: string; body: string }[] = [
  { title: "Garmin → Apple Health", body: "Garmin Connect app → More → Settings → Connected Apps → Apple Health → turn on everything offered. Then in the Health app check Sources → Garmin Connect." },
  { title: "Create the automation", body: "Shortcuts → Automation → + → Time of Day → 07:30, Daily → Run Immediately → New Blank Automation." },
  { title: "Resting heart rate", body: "Add “Find Health Samples”: Type Resting Heart Rate, Start Date is Today, Sort by Start Date, Latest First, Limit 1. Then “Get Details of Health Samples” → Value. Name the result RHR." },
  { title: "HRV (if your watch writes it)", body: "Same as above with Type Heart Rate Variability → name it HRV. Skip it if Health has no HRV from Garmin." },
  { title: "Steps yesterday", body: "“Find Health Samples”: Steps, Start Date is Yesterday → “Calculate Statistics”: Sum → name it Steps." },
  { title: "Sleep window", body: "“Find Health Samples”: Sleep Analysis, Start Date is in the last 18 hours, Sort by Start Date, Oldest First. “Get First Item” → Get Details: Start Date → “Format Date” ISO 8601 → SleepStart. “Get Last Item” of the same samples → End Date → ISO 8601 → SleepEnd." },
  { title: "Send it", body: "“Get Contents of URL”: URL below, Method POST, Header Authorization = Bearer + your token, Request Body JSON with keys: restingHR = RHR, hrv = HRV, steps = Steps, sleepStart = SleepStart, sleepEnd = SleepEnd." },
  { title: "Test", body: "Tap ▶ in the automation once, then come back here and press Sync now." },
];

export function AppleHealthCard({ profile }: { profile: Profile }) {
  const [configured, setConfigured] = useState<boolean>();
  const [result, setResult] = useState<InboxSyncResult>();
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const [token, setToken] = useState(profile.coachToken ?? "");
  const last = useLiveQuery(() => db.syncLogs.where("provider").equals("health").last(), []);
  const endpoint = typeof window === "undefined" ? "/api/inbox" : `${window.location.origin}/api/inbox`;

  useEffect(() => {
    fetch("/api/inbox/status")
      .then((r) => r.json())
      .then((j) => setConfigured(Boolean(j.configured)))
      .catch(() => setConfigured(undefined));
  }, []);

  async function sync() {
    setBusy(true);
    setResult(await syncInbox(profile.coachToken));
    setBusy(false);
  }

  return (
    <Card title="Apple Health (via Shortcuts)">
      <p className="text-sm text-muted">
        Garmin writes sleep, steps and heart rate into Apple Health. An iOS Shortcut sends a small morning summary to your server inbox (encrypted, deleted once
        imported), and the app collects it automatically. Body Battery and stress usually don&apos;t reach Apple Health.
      </p>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>Server inbox</span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{configured === undefined ? "Checking…" : configured ? "Ready" : "Not configured"}</span>
      </div>
      {configured === false && (
        <div className="mt-2">
          <Notice tone="warn">The server needs Supabase + an encryption key first — see docs/APPLE_HEALTH.md.</Notice>
        </div>
      )}
      <div className="mt-3">
        <Field label="Server access token" hint="The same value as COACH_ACCESS_TOKEN in Vercel. Stored only on this device.">
          {(id) => (
            <input
              id={id}
              type="password"
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={() => token !== (profile.coachToken ?? "") && updateProfile({ coachToken: token.trim() || undefined })}
            />
          )}
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-primary" onClick={sync} disabled={busy || !profile.coachToken}>
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Sync now
        </button>
        <button className="btn-ghost" onClick={() => setGuide(true)}>
          Set up Shortcut
        </button>
      </div>
      {result && (
        <div className="mt-2">
          <Notice tone={result.status === "ok" || result.status === "empty" ? "info" : "warn"}>{result.message}</Notice>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Last import: {last ? `${formatInstant(last.at, profile.timeZone, "d MMM HH:mm")} · ${last.message}` : "never"}
      </p>

      <Sheet open={guide} onClose={() => setGuide(false)} title="Set up the Shortcut">
        <div className="space-y-3">
          <CopyRow label="URL" value={endpoint} />
          <CopyRow label="Authorization header value" value={`Bearer ${profile.coachToken ?? ""}`} display={`Bearer ${profile.coachToken ? "•".repeat(10) : "<add your token first>"}`} />
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{i + 1}</span>
                <span>
                  <span className="block text-sm font-semibold">{s.title}</span>
                  <span className="block text-sm text-muted">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <Notice>Any value you leave out is simply missing in the app — never zero. You can add more keys later (see docs/APPLE_HEALTH.md).</Notice>
        </div>
      </Sheet>
    </Card>
  );
}
