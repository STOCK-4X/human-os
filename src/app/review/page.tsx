"use client";

import { ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Card, Empty, Field, Loading, Notice, Page, Segmented, SourceBadge, Stat, cx } from "@/components/ui";
import { useDataSet, useOnline, useToday } from "@/hooks/data";
import { buildCoachPayload } from "@/lib/coach";
import { askCoach } from "@/lib/coach-client";
import { db } from "@/lib/db";
import { addDays, formatDay, formatDuration, nowIso, weekStart } from "@/lib/date";
import { analyzeExperiment, EXPERIMENT_METRICS } from "@/lib/experiments";
import { scoreHistory } from "@/lib/scores";
import { mean } from "@/lib/stats";
import { compare, summarize, type Change, type DataSet, type PeriodSummary } from "@/lib/reports";
import type { DayKey, Reflection } from "@/lib/types";

function monthBounds(day: DayKey): [DayKey, DayKey] {
  const start = `${day.slice(0, 7)}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return [start, addDays(next.toISOString().slice(0, 10), -1)];
}

function Review() {
  const params = useSearchParams();
  const router = useRouter();
  const period = params.get("period") === "month" ? "month" : "week";
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);

  return (
    <Page title="Review">
      <Segmented
        label="Period"
        value={period}
        onChange={(p) => router.replace(`/review?period=${p}`, { scroll: false })}
        options={[
          { value: "week", label: "Weekly" },
          { value: "month", label: "Monthly" },
        ]}
      />
      {!data || !today ? <Loading /> : <Period key={period} data={data} today={today} period={period} />}
    </Page>
  );
}

function Period({ data, today, period }: { data: DataSet; today: DayKey; period: "week" | "month" }) {
  // Weekly view opens on the last complete week; monthly on the current month.
  const [offset, setOffset] = useState(period === "week" ? -1 : 0);
  return <Body data={data} today={today} period={period} offset={offset} setOffset={setOffset} />;
}

function Body({ data, today, period, offset, setOffset }: { data: DataSet; today: DayKey; period: "week" | "month"; offset: number; setOffset: (n: number) => void }) {
  let from: DayKey, to: DayKey, pFrom: DayKey, pTo: DayKey;
  if (period === "week") {
    from = addDays(weekStart(today), offset * 7);
    to = addDays(from, 6);
    pFrom = addDays(from, -7);
    pTo = addDays(from, -1);
  } else {
    const anchor = new Date(`${today.slice(0, 7)}-15T00:00:00Z`);
    anchor.setUTCMonth(anchor.getUTCMonth() + offset);
    [from, to] = monthBounds(anchor.toISOString().slice(0, 10));
    [pFrom, pTo] = monthBounds(addDays(from, -1));
  }
  const cur = summarize(data, from, to > today ? today : to);
  const prev = summarize(data, pFrom, pTo);
  const changes = compare(cur, prev);
  const hist = scoreHistory(data, from, to > today ? today : to);
  const avgOf = (k: "energy" | "recovery" | "sleep" | "bodyBattery") => {
    const v = hist.flatMap((p) => (p[k] === undefined ? [] : [p[k]!]));
    return { value: mean(v), n: v.length };
  };
  const sc = { energy: avgOf("energy"), recovery: avgOf("recovery"), sleep: avgOf("sleep"), bodyBattery: avgOf("bodyBattery") };
  const label = period === "week" ? `${formatDay(from, "d MMM")} – ${formatDay(to, "d MMM")}` : formatDay(from, "MMMM yyyy");
  const ref = period === "week" ? from : from.slice(0, 7);

  return (
    <>
      <div className="flex items-center justify-between">
        <button className="btn-quiet px-2" aria-label="Previous period" onClick={() => setOffset(offset - 1)}><ChevronLeft size={20} /></button>
        <span className="font-medium">{label}{to >= today && from <= today && <span className="text-muted"> · in progress</span>}</span>
        <button className="btn-quiet px-2" aria-label="Next period" disabled={to >= today} onClick={() => setOffset(offset + 1)}><ChevronRight size={20} /></button>
      </div>

      <Card title="Summary" action={<SourceBadge source="calculated" />}>
        <div className="grid grid-cols-2 gap-4">
          <Stat label={`Avg sleep${cur.sleepIncludesEstimates ? " (incl. est.)" : ""}`} value={cur.avgSleepMin === undefined ? undefined : formatDuration(cur.avgSleepMin)} hint={`${cur.nights} nights logged`} />
          <Stat label="Bedtime consistency" value={cur.bedtimeSdMin === undefined ? undefined : `±${Math.round(cur.bedtimeSdMin)}m`} hint={cur.avgBedtime && `avg ${cur.avgBedtime}`} />
          <Stat label="HRV" unit="ms" value={cur.avgHrv === undefined ? undefined : Math.round(cur.avgHrv)} hint={`${cur.hrvDays} days`} />
          <Stat label="Resting HR" unit="bpm" value={cur.avgRhr === undefined ? undefined : Math.round(cur.avgRhr)} hint={`${cur.rhrDays} days`} />
          <Stat label="Training" unit="min" value={cur.workoutMin || undefined} hint={`${cur.workouts} sessions`} />
          <Stat label="Habit consistency" value={cur.habitRate === undefined ? undefined : `${Math.round(cur.habitRate * 100)}%`} />
          <Stat label="Energy" unit="/10" value={cur.avgEnergy?.toFixed(1)} hint={`${cur.energyDays} check-ins`} />
          <Stat label="Avg steps" value={cur.avgSteps === undefined ? undefined : Math.round(cur.avgSteps).toLocaleString()} hint={`${cur.stepsDays} days`} />
        </div>
      </Card>

      <Card title="Energy & recovery" action={<SourceBadge source="calculated" />}>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Avg recovery" unit="%" value={sc.recovery.value === undefined ? undefined : Math.round(sc.recovery.value)} hint={`${sc.recovery.n} days scored`} />
          <Stat label="Avg energy" unit="/100" value={sc.energy.value === undefined ? undefined : Math.round(sc.energy.value)} hint={`${sc.energy.n} days scored`} />
          <Stat label="Avg sleep score" unit="/100" value={sc.sleep.value === undefined ? undefined : Math.round(sc.sleep.value)} hint={`${sc.sleep.n} nights`} />
          <Stat label="Avg Body Battery" value={sc.bodyBattery.value === undefined ? undefined : Math.round(sc.bodyBattery.value)} hint={sc.bodyBattery.n ? `Garmin · ${sc.bodyBattery.n} days` : "no data"} />
        </div>
        <p className="mt-2 text-xs text-muted">Recovery, energy and sleep scores are Human OS estimates. Body Battery is Garmin&apos;s value.</p>
      </Card>

      <Card title={`Compared with previous ${period}`}>
        {changes.length === 0 ? (
          <Empty title="Not enough data in both periods to compare" />
        ) : (
          <ul className="divide-y divide-line">
            {changes.map((c) => (
              <li key={c.label} className="flex items-center justify-between py-2 text-sm">
                <span>{c.label}</span>
                <span className="tabular flex items-center gap-2 text-muted">
                  {c.detail}
                  <span className={cx("rounded-full px-2 py-0.5 text-xs", c.direction === "improved" && "bg-good/10 text-good", c.direction === "worsened" && "bg-warn/10 text-warn", c.direction === "stable" && "bg-surface-2")}>
                    {c.direction}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Small differences are treated as stable — normal variation isn&apos;t a trend.</p>
      </Card>

      <Card title="Habits">
        {cur.habitRates.length === 0 ? (
          <Empty title="No habits tracked" />
        ) : (
          <ul className="space-y-2">
            {[...cur.habitRates].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)).map((h) => (
              <li key={h.habitId}>
                <div className="flex justify-between text-sm">
                  <span>{h.name}</span>
                  <span className="tabular text-muted">{h.rate === undefined ? "—" : `${Math.round(h.rate * 100)}%`}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(h.rate ?? 0) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {period === "month" && <MonthExtras data={data} from={from} to={to} today={today} />}

      <Reflect kind={period === "week" ? "weekly" : "monthly"} refKey={ref} today={today} />
      {period === "week" && <AiReview data={data} from={from} today={today} />}

      <button className="btn-ghost w-full" onClick={() => downloadReport(label, cur, changes, period, sc)}>
        <Download size={16} /> Download report
      </button>
    </>
  );
}

function MonthExtras({ data, from, to, today }: { data: DataSet; from: DayKey; to: DayKey; today: DayKey }) {
  const exps = useLiveQuery(() => db.experiments.toArray(), []);
  const logs = useLiveQuery(() => db.experimentLogs.toArray(), []);
  const relevant = (exps ?? []).filter((e) => e.endDate >= from && e.startDate <= to);
  if (!relevant.length) return null;
  return (
    <Card title="Experiments this month">
      <ul className="space-y-3">
        {relevant.map((e) => {
          const r = analyzeExperiment(data, e, logs ?? [], today);
          return (
            <li key={e.id}>
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-xs text-muted">
                {r.metrics.map((m) => `${EXPERIMENT_METRICS[m.metric].label}: ${m.verdict}`).join(" · ")}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Reflect({ kind, refKey, today }: { kind: "weekly" | "monthly"; refKey: string; today: DayKey }) {
  const existing = useLiveQuery(async () => (await db.reflections.where("ref").equals(refKey).and((r) => r.kind === kind).first()) ?? null, [refKey, kind]);
  if (existing === undefined) return null;
  return <ReflectForm key={`${refKey}-${existing?.id ?? "new"}`} kind={kind} refKey={refKey} today={today} existing={existing ?? undefined} />;
}

function ReflectForm({ kind, refKey, today, existing }: { kind: "weekly" | "monthly"; refKey: string; today: DayKey; existing?: Reflection }) {
  const [r, setR] = useState<Partial<Reflection>>(existing ?? {});
  const [saved, setSaved] = useState(false);
  async function save() {
    await db.reflections.put({ ...(existing ?? {}), kind, ref: refKey, date: today, worked: r.worked, difficult: r.difficult, change: r.change, updatedAt: nowIso() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <Card title="Reflect">
      <div className="space-y-3">
        <Field label="What worked well?">{(id) => <textarea id={id} rows={2} className="input py-2" value={r.worked ?? ""} onChange={(e) => setR({ ...r, worked: e.target.value })} />}</Field>
        <Field label="What was difficult?">{(id) => <textarea id={id} rows={2} className="input py-2" value={r.difficult ?? ""} onChange={(e) => setR({ ...r, difficult: e.target.value })} />}</Field>
        <Field label="What will you change next?">{(id) => <textarea id={id} rows={2} className="input py-2" value={r.change ?? ""} onChange={(e) => setR({ ...r, change: e.target.value })} />}</Field>
        <button className="btn-primary w-full" onClick={save}>{saved ? "Saved" : "Save reflection"}</button>
      </div>
    </Card>
  );
}

function AiReview({ data, from, today }: { data: DataSet; from: DayKey; today: DayKey }) {
  const online = useOnline();
  const isLastWeek = from === addDays(weekStart(today), -7);
  const saved = useLiveQuery(() => db.aiSummaries.where("kind").equals("weekly").and((s) => s.date >= addDays(from, 7)).toArray(), [from]);
  const memory = useLiveQuery(() => db.coachMemory.toArray(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const latest = saved?.at(-1);
  if (!data.profile.aiEnabled) return null;
  if (!isLastWeek && !latest) return null;
  return (
    <Card title="AI weekly review" action={<SourceBadge source="ai" />}>
      {latest ? (
        <Markdown text={latest.content} />
      ) : (
        <p className="text-sm text-muted">A short narrative review of last week with one or two realistic priorities.</p>
      )}
      {error && <div className="mt-2"><Notice tone="warn">{error}</Notice></div>}
      {isLastWeek && (
        <button
          className="btn-ghost mt-3 w-full"
          disabled={busy || !online}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            const res = await askCoach(buildCoachPayload(data, "weekly", (memory ?? []).map((m) => m.text)), data.profile.coachToken);
            if (res.ok) await db.aiSummaries.add({ kind: "weekly", date: today, content: res.content, model: res.model, createdAt: nowIso() });
            else setError(res.message);
            setBusy(false);
          }}
        >
          <Sparkles size={16} /> {busy ? "Writing…" : latest ? "Regenerate" : "Generate weekly review"}
        </button>
      )}
    </Card>
  );
}

type ScoreAvgs = Record<"energy" | "recovery" | "sleep" | "bodyBattery", { value?: number; n: number }>;

function downloadReport(label: string, s: PeriodSummary, changes: Change[], period: string, sc: ScoreAvgs) {
  const f = (v: number | undefined, fn: (n: number) => string) => (v === undefined ? "no data" : fn(v));
  const lines = [
    `# Human OS ${period}ly report — ${label}`,
    "",
    "All values are calculated from records stored in the app. Missing data is reported as 'no data'.",
    "",
    "## Summary",
    `- Average sleep: ${f(s.avgSleepMin, formatDuration)} over ${s.nights} nights${s.sleepIncludesEstimates ? " (includes time-in-bed estimates)" : ""}`,
    `- Bedtime consistency: ${f(s.bedtimeSdMin, (n) => `±${Math.round(n)} min`)}; average bedtime ${s.avgBedtime ?? "no data"}, wake ${s.avgWake ?? "no data"}`,
    `- HRV: ${f(s.avgHrv, (n) => `${Math.round(n)} ms`)} (${s.hrvDays} days)`,
    `- Resting HR: ${f(s.avgRhr, (n) => `${Math.round(n)} bpm`)} (${s.rhrDays} days)`,
    `- Steps: ${f(s.avgSteps, (n) => Math.round(n).toLocaleString())} (${s.stepsDays} days)`,
    `- Training: ${s.workouts} sessions, ${Math.round(s.workoutMin)} min`,
    `- Habit consistency: ${f(s.habitRate, (n) => `${Math.round(n * 100)}%`)}`,
    `- Felt energy: ${f(s.avgEnergy, (n) => n.toFixed(1))} / 10 (${s.energyDays} check-ins)`,
    `- Recovery score (Human OS estimate): ${f(sc.recovery.value, (n) => `${Math.round(n)}%`)} (${sc.recovery.n} days)`,
    `- Energy score (Human OS estimate): ${f(sc.energy.value, (n) => `${Math.round(n)}/100`)} (${sc.energy.n} days)`,
    `- Sleep score (Human OS estimate): ${f(sc.sleep.value, (n) => `${Math.round(n)}/100`)} (${sc.sleep.n} nights)`,
    `- Garmin Body Battery: ${f(sc.bodyBattery.value, (n) => `${Math.round(n)}`)} (${sc.bodyBattery.n} days)`,
    "",
    "## Changes vs previous period",
    ...changes.map((c) => `- ${c.label}: ${c.detail} (${c.direction})`),
    "",
    "## Habits",
    ...s.habitRates.map((h) => `- ${h.name}: ${h.rate === undefined ? "no data" : `${Math.round(h.rate * 100)}%`}`),
    "",
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `human-os-${period}-${s.from}.md` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<Page title="Review"><Loading /></Page>}>
      <Review />
    </Suspense>
  );
}
