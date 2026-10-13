"use client";

import { Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Card, Empty, Field, Loading, Notice, Page, Sheet, SourceBadge, cx } from "@/components/ui";
import { useDataSet, useToday } from "@/hooks/data";
import { db } from "@/lib/db";
import { addDays, formatDay, nowIso } from "@/lib/date";
import { EXPERIMENT_METRICS, analyzeExperiment } from "@/lib/experiments";
import type { DataSet } from "@/lib/reports";
import type { DayKey, Experiment, ExperimentLog, ExperimentMetric } from "@/lib/types";

const PRESETS: Record<string, Pick<Experiment, "title" | "question" | "behavior" | "metrics">> = {
  "Consistent wake time": { title: "Consistent wake time", question: "Does a fixed wake time improve my energy?", behavior: "Wake within 15 minutes of my target every day, weekends included.", metrics: ["energy", "sleepQuality", "bedtimeSd"] },
  "Morning outdoor light": { title: "Morning outdoor light", question: "Does morning daylight help my energy and sleep?", behavior: "10+ minutes outside within an hour of waking.", metrics: ["energy", "sleepMin", "sleepQuality"] },
  "Earlier caffeine cut-off": { title: "Earlier caffeine cut-off", question: "Does stopping caffeine earlier improve my sleep?", behavior: "No caffeine after 12:00.", metrics: ["sleepMin", "sleepQuality", "sleepScore"] },
  "Consistent evening wind-down": { title: "Evening wind-down", question: "Does a wind-down routine make my bedtime more consistent?", behavior: "Start wind-down at the planned time: dim lights, no work, no news.", metrics: ["bedtimeSd", "sleepMin", "energy"] },
  "No screens in bed": { title: "No screens in bed", question: "Does keeping my phone out of bed help me sleep?", behavior: "Phone charges outside the bedroom.", metrics: ["sleepMin", "sleepQuality", "energy"] },
  "Earlier workouts": { title: "Earlier workouts", question: "Does training earlier in the day change my sleep?", behavior: "Finish workouts at least 3 hours before bedtime.", metrics: ["sleepMin", "sleepQuality", "hrv"] },
  "More walking": { title: "More walking", question: "Does walking more improve my energy and mood?", behavior: "A 20-minute walk every day.", metrics: ["energy", "mood", "steps"] },
};

export default function ExperimentsPage() {
  return (
    <Suspense fallback={<Page title="Experiment lab"><Loading /></Page>}>
      <Lab />
    </Suspense>
  );
}

function Lab() {
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);
  const exps = useLiveQuery(() => db.experiments.reverse().toArray(), []);
  const logs = useLiveQuery(() => db.experimentLogs.toArray(), []);
  const params = useSearchParams();
  const [creating, setCreating] = useState<string | boolean>(() => params.get("preset") ?? false);

  return (
    <Page
      title="Experiment lab"
      subtitle="Test one change at a time, against your own baseline."
      action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New</button>}
    >
      {!data || !today || !exps || !logs ? (
        <Loading />
      ) : exps.length === 0 ? (
        <Empty title="No experiments yet" action={<button className="btn-ghost" onClick={() => setCreating(true)}>Design one</button>}>
          Pick a question, a behaviour and what to measure. The app compares the experiment period with the days before it.
        </Empty>
      ) : (
        exps.map((e) => <ExperimentCard key={e.id} e={e} data={data} logs={logs} today={today} />)
      )}
      <Sheet open={Boolean(creating)} onClose={() => setCreating(false)} title="New experiment">
        {creating && today && <NewExperiment preset={typeof creating === "string" ? PRESETS[creating] : undefined} today={today} onDone={() => setCreating(false)} />}
      </Sheet>
    </Page>
  );
}

function NewExperiment({ preset, today, onDone }: { preset?: (typeof PRESETS)[string]; today: DayKey; onDone: () => void }) {
  const [title, setTitle] = useState(preset?.title ?? "");
  const [question, setQuestion] = useState(preset?.question ?? "");
  const [behavior, setBehavior] = useState(preset?.behavior ?? "");
  const [metrics, setMetrics] = useState<ExperimentMetric[]>(preset?.metrics ?? ["sleepMin", "energy"]);
  const [days, setDays] = useState(14);
  const [custom, setCustom] = useState("");
  const [start, setStart] = useState(today);
  const [baselineDays, setBaselineDays] = useState(14);
  const [error, setError] = useState<string>();
  const length = days === 0 ? Number(custom) : days;

  return (
    <div className="space-y-4">
      {!preset && (
        <div className="flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((k) => (
            <button key={k} className="chip" onClick={() => { const p = PRESETS[k]; setTitle(p.title); setQuestion(p.question); setBehavior(p.behavior); setMetrics(p.metrics); }}>{k}</button>
          ))}
        </div>
      )}
      <Field label="Name">{(id) => <input id={id} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Question">{(id) => <input id={id} className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Does … improve …?" />}</Field>
      <Field label="What you'll do each day">{(id) => <input id={id} className="input" value={behavior} onChange={(e) => setBehavior(e.target.value)} />}</Field>
      <div>
        <span className="label">Measure</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(EXPERIMENT_METRICS) as ExperimentMetric[]).map((m) => {
            const on = metrics.includes(m);
            return (
              <button key={m} aria-pressed={on} className={on ? "chip-on" : "chip"} onClick={() => setMetrics(on ? metrics.filter((x) => x !== m) : [...metrics, m])}>
                {EXPERIMENT_METRICS[m].label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className="label">Duration</span>
        <div className="flex gap-2">
          {[7, 14, 28, 0].map((d) => (
            <button key={d} className={cx("flex-1", days === d ? "chip-on justify-center" : "chip justify-center")} onClick={() => setDays(d)}>{d ? `${d} days` : "Custom"}</button>
          ))}
        </div>
        {days === 0 && <input aria-label="Custom days" inputMode="numeric" className="input mt-2" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Days" />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">{(id) => <input id={id} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Baseline (days before)">
          {(id) => (
            <select id={id} className="input" value={baselineDays} onChange={(e) => setBaselineDays(Number(e.target.value))}>
              {[7, 14, 28].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          )}
        </Field>
      </div>
      <Notice>Change only one thing at a time and keep everything else as normal. Two weeks or more gives a fairer comparison.</Notice>
      {error && <Notice tone="bad">{error}</Notice>}
      <button
        className="btn-primary w-full"
        onClick={async () => {
          if (!title.trim() || !behavior.trim()) return setError("Add a name and the daily behaviour.");
          if (!metrics.length) return setError("Pick at least one metric.");
          if (!Number.isFinite(length) || length < 3 || length > 120) return setError("Duration should be 3–120 days.");
          const now = nowIso();
          await db.experiments.add({
            title: title.trim(),
            question: question.trim(),
            behavior: behavior.trim(),
            metrics,
            baselineDays,
            startDate: start,
            endDate: addDays(start, length - 1),
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          onDone();
        }}
      >
        Start experiment
      </button>
    </div>
  );
}

function ExperimentCard({ e, data, logs, today }: { e: Experiment; data: DataSet; logs: ExperimentLog[]; today: DayKey }) {
  const r = analyzeExperiment(data, e, logs, today);
  const todayLog = logs.find((l) => l.experimentId === e.id && l.date === today);
  const running = e.status === "active" && today >= e.startDate && today <= e.endDate;
  const ended = today > e.endDate || e.status === "completed";
  const fmt = (m: ExperimentMetric, v?: number) => (v === undefined ? "—" : m === "sleepMin" ? `${Math.floor(v / 60)}h ${Math.round(v % 60)}m` : m === "steps" ? Math.round(v).toLocaleString() : m === "bedtimeSd" ? `±${Math.round(v)}m` : v.toFixed(1));

  async function mark(adhered: boolean) {
    if (todayLog?.id) await db.experimentLogs.update(todayLog.id, { adhered });
    else await db.experimentLogs.add({ experimentId: e.id!, date: today, adhered });
  }

  return (
    <Card title={e.title} action={<span className="text-xs text-muted">{formatDay(e.startDate, "d MMM")} – {formatDay(e.endDate, "d MMM")}</span>}>
      <p className="text-sm text-muted">{e.question}</p>
      <p className="mt-1 text-sm"><strong>Daily:</strong> {e.behavior}</p>
      {running && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm">Did it today?</span>
          <button className={todayLog?.adhered === true ? "chip-on" : "chip"} onClick={() => mark(true)}>Yes</button>
          <button className={todayLog?.adhered === false ? "chip-on" : "chip"} onClick={() => mark(false)}>No</button>
        </div>
      )}
      {today < e.startDate && <p className="mt-2 text-sm text-muted">Starts {formatDay(e.startDate)}. Baseline is collected from your normal routine before then.</p>}
      <div className="mt-3 text-xs text-muted">
        Day {Math.min(r.elapsedDays, r.totalDays)}/{r.totalDays}
        {r.adherence !== undefined && ` · adherence ${Math.round(r.adherence * 100)}% (${r.adheredDays} days)`}
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="font-normal">Metric</th>
            <th className="text-right font-normal">Baseline</th>
            <th className="text-right font-normal">During</th>
            <th className="text-right font-normal">Result</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {r.metrics.map((m) => (
            <tr key={m.metric} className="border-t border-line">
              <td className="py-1.5">{EXPERIMENT_METRICS[m.metric].label}</td>
              <td className="text-right text-muted">{fmt(m.metric, m.baseline)} <span className="text-[10px]">n={m.nBaseline}</span></td>
              <td className="text-right">{fmt(m.metric, m.during)} <span className="text-[10px] text-muted">n={m.nDuring}</span></td>
              <td className={cx("text-right text-xs", m.verdict === "improved" && "text-good", m.verdict === "worsened" && "text-warn", (m.verdict === "insufficient" || m.verdict === "no clear change") && "text-muted")}>{m.verdict === "insufficient" ? "too little data" : m.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-1 text-xs text-muted">
        {r.limitations.map((l) => <p key={l}>• {l}</p>)}
      </div>
      {ended && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2"><strong>Suggested next step</strong><SourceBadge source="calculated" /></div>
          {r.nextStep}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {e.status === "active" && ended && <button className="btn-ghost flex-1" onClick={() => db.experiments.update(e.id!, { status: "completed", updatedAt: nowIso() })}>Mark complete</button>}
        {e.status === "active" && !ended && <button className="btn-quiet flex-1" onClick={() => db.experiments.update(e.id!, { status: "abandoned", updatedAt: nowIso() })}>Stop early</button>}
        <button className="btn-quiet text-bad" onClick={async () => { if (confirm("Delete this experiment?")) { await db.experimentLogs.where("experimentId").equals(e.id!).delete(); await db.experiments.delete(e.id!); } }}>Delete</button>
      </div>
    </Card>
  );
}
