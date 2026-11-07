"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "../Markdown";
import { SourceBadge, cx } from "../ui";
import { formState, loadFlag, pmc, sleepDebt, volume } from "@/lib/analytics";
import { buildCoachPayload } from "@/lib/coach";
import { askCoach } from "@/lib/coach-client";
import { db } from "@/lib/db";
import { addDays, clockOf, clockToMin, daysBetween, formatDay, formatDuration, nowIso } from "@/lib/date";
import { showNotification } from "@/lib/notifications";
import { bestVdot, hrvTrend } from "@/lib/performance";
import { metricBaseline, metricOn, type DataSet } from "@/lib/reports";
import { deviation } from "@/lib/stats";
import type { DayKey, MetricKey } from "@/lib/types";

/* --------------------------------------------------------------------------- */
/* Morning AI briefing — generated automatically once per morning               */
/* --------------------------------------------------------------------------- */

const TRIED_KEY = "hos-briefing-tried";

export function MorningBriefing({ data, today, online }: { data: DataSet; today: DayKey; online: boolean }) {
  const { profile } = data;
  const summary = useLiveQuery(async () => (await db.aiSummaries.where("date").equals(today).filter((s) => s.kind === "daily").last()) ?? null, [today]);
  const [state, setState] = useState<"idle" | "working" | "unavailable" | "error">("idle");
  const [open, setOpen] = useState(false);
  const started = useRef(false);
  const afterWake = clockToMin(clockOf(new Date(), profile.timeZone)) >= clockToMin(profile.targetWake);

  useEffect(() => {
    if (summary !== null || started.current || !profile.aiEnabled || !online || !afterWake) return;
    let tried = "";
    try {
      tried = sessionStorage.getItem(TRIED_KEY) ?? "";
    } catch {}
    if (tried === today) return;
    started.current = true;
    try {
      sessionStorage.setItem(TRIED_KEY, today);
    } catch {}
    void (async () => {
      setState("working");
      const memory = (await db.coachMemory.toArray()).map((m) => m.text);
      const res = await askCoach(buildCoachPayload(data, "daily", memory), profile.coachToken);
      if (res.ok) {
        await db.aiSummaries.add({ kind: "daily", date: today, content: res.content, model: res.model, createdAt: nowIso() });
        setState("idle");
        if (profile.notifications.enabled && document.visibilityState !== "visible")
          void showNotification({ id: `briefing-${today}`, title: "Your morning briefing is ready", body: "Open Human OS to read it." });
      } else setState(res.error === "not_configured" || res.error === "unauthorized" ? "unavailable" : "error");
    })();
  }, [summary, profile, online, afterWake, today, data]);

  if (!profile.aiEnabled || state === "unavailable") return null;
  if (summary === undefined) return null;
  if (!summary) {
    if (state === "working")
      return (
        <section className="card animate-pulse" aria-busy="true">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Sparkles size={16} className="text-accent" /> Preparing your morning briefing…
          </div>
        </section>
      );
    if (!afterWake) return null;
    return (
      <Link href="/coach" className="card flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" /> {state === "error" ? "Briefing couldn't be generated — try in Coach" : "Get today's AI briefing"}
        </span>
        <ChevronRight size={18} className="text-muted" />
      </Link>
    );
  }
  return (
    <section aria-label="Morning briefing" className="card">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <Sparkles size={16} className="text-accent" /> Morning briefing
        </span>
        <SourceBadge source="ai" />
      </div>
      <div className={cx("relative overflow-hidden", !open && "max-h-44")}>
        <Markdown text={summary.content} />
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <button className="font-semibold text-accent" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Read all"}
        </button>
        <Link href="/coach" className="text-muted">
          Ask a follow-up →
        </Link>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */
/* Training status — the analytics that matter today, in one glance             */
/* --------------------------------------------------------------------------- */

function Tile({ label, value, unit, hint, tone, href }: { label: string; value?: string | number; unit?: string; hint?: string; tone?: "good" | "warn" | "bad"; href?: string }) {
  const body = (
    <>
      <div className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">{label}</div>
      <div className={cx("num mt-0.5 text-[22px] leading-tight font-semibold", value === undefined && "text-muted", tone === "good" && "text-good", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>
        {value ?? "—"}
        {value !== undefined && unit && <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-2xl bg-surface-2 p-3 active:opacity-80">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl bg-surface-2 p-3">{body}</div>
  );
}

export function TrainingStatus({ data, today }: { data: DataSet; today: DayKey }) {
  const { workouts, profile } = data;
  const now = pmc(workouts, today).points.at(-1);
  const form = now ? formState(now.tsb) : undefined;
  const flag = loadFlag(workouts, today);
  const hrv = hrvTrend(data.metrics, today);
  const debt = sleepDebt(data, today);
  const week = volume(workouts, addDays(today, -6), today);
  const goal = profile.goalRace?.date && profile.goalRace.date >= today ? profile.goalRace : undefined;
  const last = [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
  const vdot = bestVdot(workouts, today);
  return (
    <section aria-label="Training status" className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Training status</h2>
        <Link href="/train" className="text-xs font-semibold text-accent">
          Analytics →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Fitness" value={now ? Math.round(now.ctl) : undefined} hint="42-day load" href="/train" />
        <Tile label="Fatigue" value={now ? Math.round(now.atl) : undefined} hint="7-day load" href="/train" />
        <Tile
          label="Form"
          value={now ? `${now.tsb > 0 ? "+" : ""}${Math.round(now.tsb)}` : undefined}
          hint={form?.label}
          tone={form?.key === "overreaching" ? "bad" : form?.key === "absorbing" ? "warn" : undefined}
          href="/train"
        />
        <Tile
          label="Load ratio"
          value={flag.ratio}
          hint={flag.band ? { low: "Below usual", optimal: "In range", caution: "Rising", high: "Spike" }[flag.band] : "needs 3 weeks"}
          tone={flag.band === "high" ? "bad" : flag.band === "caution" ? "warn" : flag.band === "optimal" ? "good" : undefined}
        />
        <Tile
          label="HRV 7-day"
          value={hrv.rolling7}
          unit="ms"
          hint={hrv.status === "ok" ? (hrv.band === "within" ? "Normal range" : hrv.band === "below" ? "Below normal" : "Above normal") : `${hrv.recentNights}/4 nights`}
          tone={hrv.band === "below" ? "warn" : hrv.band === "within" ? "good" : undefined}
        />
        <Tile label="Sleep debt" value={debt.nights ? formatDuration(debt.minutes) : undefined} hint={`last ${debt.nights} nights`} tone={debt.minutes > 180 ? "warn" : undefined} href="/health?tab=sleep" />
        <Tile label="This week" value={week.hours} unit="h" hint={`${week.sessions} sessions`} />
        <Tile
          label={goal ? "Race in" : "Since workout"}
          value={goal ? daysBetween(today, goal.date) : last ? daysBetween(last.date, today) : undefined}
          unit="days"
          hint={goal ? goal.name : last ? formatDay(last.date, "d MMM") : "none yet"}
          href={goal ? "/train" : undefined}
        />
        <Tile label="VDOT" value={vdot?.vdot} hint={vdot ? (vdot.basis === "race" ? "from a race" : "from a training run") : "needs a fast 5–10 km"} href="/train" />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */
/* Body today — every device signal at a glance (no tapping through)            */
/* --------------------------------------------------------------------------- */

const SIGNALS: { key: MetricKey; label: string; unit: string; band: number; goodWhen: "low" | "high" }[] = [
  { key: "hrv", label: "HRV", unit: "ms", band: 4, goodWhen: "high" },
  { key: "rhr", label: "Resting HR", unit: "bpm", band: 3, goodWhen: "low" },
  { key: "bodyBattery", label: "Body Battery", unit: "", band: 10, goodWhen: "high" },
  { key: "stress", label: "Stress", unit: "", band: 8, goodWhen: "low" },
  { key: "respiration", label: "Breathing", unit: "br/min", band: 1, goodWhen: "low" },
  { key: "spo2", label: "SpO₂", unit: "%", band: 2, goodWhen: "high" },
  { key: "steps", label: "Steps", unit: "", band: 2000, goodWhen: "high" },
  { key: "activeMin", label: "Active", unit: "min", band: 15, goodWhen: "high" },
  { key: "calories", label: "Active kcal", unit: "", band: 150, goodWhen: "high" },
];

export function BodyToday({ data, today, onEnter }: { data: DataSet; today: DayKey; onEnter: () => void }) {
  const hidden = new Set(data.profile.hiddenMetrics);
  const rows = SIGNALS.filter((s) => !hidden.has(s.key)).map((s) => {
    const p = metricOn(data.metrics, s.key, today) ?? metricOn(data.metrics, s.key, addDays(today, -1));
    const b = metricBaseline(data.metrics, s.key, p?.date ?? today);
    const dv = p ? deviation(p.value, b, s.band) : "unknown";
    const off = (s.goodWhen === "low" && dv === "above") || (s.goodWhen === "high" && dv === "below");
    return { ...s, p, b, off, stale: p && p.date !== today };
  });
  const anyStale = rows.some((r) => r.stale);
  return (
    <section aria-label="Body signals" className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Body signals</h2>
        <button className="text-xs font-semibold text-accent" onClick={onEnter}>
          Enter
        </button>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-sm">{r.label}</span>
            <span className="text-right text-[11px] leading-tight text-muted">
              {r.b.status === "ok" ? `usual ${Math.round(r.b.low!).toLocaleString()}–${Math.round(r.b.high!).toLocaleString()}` : ""}
            </span>
            <span className={cx("num w-20 text-right text-base font-semibold", !r.p && "text-muted", r.off && "text-warn")}>
              {r.p ? r.p.value.toLocaleString() : "—"}
              {r.p && r.unit && <span className="ml-0.5 text-[11px] font-medium text-muted">{r.unit}</span>}
              {r.stale && <span className="text-[11px] text-muted">*</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        {anyStale ? "* yesterday's value — today's hasn't synced yet. " : ""}Orange = outside your usual range. Device values are estimates.
      </p>
    </section>
  );
}
