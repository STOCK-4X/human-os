"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { TrendChart } from "@/components/charts";
import { AnalyticsView } from "@/components/train/AnalyticsView";
import { ACTIVITY_LABEL, WorkoutForm } from "@/components/forms/WorkoutForm";
import { Card, Empty, Loading, Notice, Page, Segmented, Sheet, SourceBadge, Stat, cx } from "@/components/ui";
import { useDataSet, useToday } from "@/hooks/data";
import { buildBriefing } from "@/lib/briefing";
import { addDays, formatDay, formatDuration, formatInstant, weekStart } from "@/lib/date";
import type { DataSet } from "@/lib/reports";
import { dailyLoads } from "@/lib/analytics";
import { PHASE_INFO, seasonPlan } from "@/lib/performance";
import Link from "next/link";
import { formatPace, pace, strengthProgress } from "@/lib/training";
import { bestVdot, vdotHistory } from "@/lib/performance";
import { e1rmHistory, weeklySets } from "@/lib/strength";
import { todayKey } from "@/lib/date";
import { weekSessions } from "@/lib/prescribe";
import { SessionCard, planInput } from "@/components/train/SessionCard";
import type { DayKey, Workout } from "@/lib/types";

export default function TrainPage() {
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);
  const [edit, setEdit] = useState<Workout | "new">();
  return (
    <Page
      title="Train"
      action={
        <button className="btn-primary" onClick={() => setEdit("new")}>
          <Plus size={16} /> Log
        </button>
      }
    >
      {!data || !today ? <Loading /> : <Train data={data} today={today} onEdit={setEdit} />}
      <Sheet open={Boolean(edit)} onClose={() => setEdit(undefined)} title={edit === "new" ? "Log workout" : "Edit workout"}>
        {edit && data && today && (
          <WorkoutForm key={edit === "new" ? "new" : edit.id} profile={data.profile} date={today} existing={edit === "new" ? undefined : edit} onDone={() => setEdit(undefined)} />
        )}
      </Sheet>
    </Page>
  );
}

function Train({ data, today, onEdit }: { data: DataSet; today: DayKey; onEdit: (w: Workout) => void }) {
  const [view, setView] = useState<"analytics" | "plan" | "run" | "strength" | "history">("analytics");
  const { profile } = data;
  const brief = buildBriefing(data, today);
  const sessions = weekSessions(planInput(data, today));
  const ws = weekStart(today);
  const thisWeek = data.workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i)));
  const volume = weeks.map((w) => ({
    date: w,
    value: data.workouts.filter((x) => x.date >= w && x.date <= addDays(w, 6)).reduce((a, x) => a + x.durationMin, 0),
  }));
  const imp = profile.units === "imperial";

  return (
    <>
      <Card title="Today">
        <div className="text-[17px] font-medium">{brief.training.headline}</div>
        {brief.training.reasons.length > 0 && <p className="mt-0.5 text-sm text-muted">{brief.training.general ? brief.training.reasons[0] : `Because: ${brief.training.reasons.join(", ")}`}</p>}
        {brief.safety && <div className="mt-2"><Notice tone="bad">{brief.safety}</Notice></div>}
        <p className="mt-2 text-xs text-muted">Based on sleep, recovery metrics, how you feel and recent training together — never a single number.</p>
      </Card>

      <Segmented
        label="Training sections"
        value={view}
        onChange={setView}
        options={[
          { value: "analytics", label: "Analytics" },
          { value: "plan", label: "Week" },
          { value: "run", label: "Running" },
          { value: "strength", label: "Strength" },
          { value: "history", label: "History" },
        ]}
      />

      {view === "analytics" && <AnalyticsView data={data} today={today} />}

      {view === "plan" && (
        <>
          <SeasonCard data={data} today={today} />
          <Card title="This week's plan" action={<SourceBadge source="calculated" />}>
            {sessions.length === 0 ? (
              <Empty title="No training days set">Choose your available days in Profile.</Empty>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li key={s.day} className={cx(s.day < today && !data.workouts.some((w) => w.date === s.day) && "opacity-60")}>
                    <SessionCard s={s} today={today} />
                    {data.workouts.some((w) => w.date === s.day) && <p className="mt-1 text-right text-xs font-medium text-good">Logged ✓</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">Built from your season phase, paces/zones and level; today adapts to your readiness and any injury or illness. Swap, shorten or skip freely. <Link href="/evidence#prescription" className="underline">How</Link></p>
          </Card>
          <Card title="Weekly volume">
            <div className="mb-2 grid grid-cols-3 gap-3">
              <Stat label="This week" value={thisWeek.reduce((a, w) => a + w.durationMin, 0) || undefined} unit="min" source="calculated" />
              <Stat label="Sessions" value={thisWeek.length || undefined} source="calculated" />
              <Stat label="Planned" value={sessions.filter((x) => x.kind !== "rest").length} source="calculated" />
            </div>
            <TrendChart label="Training minutes per week" kind="bar" data={volume} domain={[0, "auto"]} />
          </Card>
        </>
      )}

      {view === "run" && <Running data={data} imp={imp} onEdit={onEdit} />}
      {view === "strength" && <Strength data={data} imp={imp} />}
      {view === "history" && <History data={data} onEdit={onEdit} />}
    </>
  );
}

function Running({ data, imp, onEdit }: { data: DataSet; imp: boolean; onEdit: (w: Workout) => void }) {
  const runs = data.workouts.filter((w) => w.type === "run").sort((a, b) => a.startAt.localeCompare(b.startAt));
  const unit = imp ? "mi" : "km";
  const paceSeries = runs.map((r) => ({ date: r.date, value: pace(r, imp) }));
  const hrSeries = runs.filter((r) => r.avgHr).map((r) => ({ date: r.date, value: r.avgHr }));
  return (
    <>
      <RunningFitness data={data} imp={imp} onEdit={onEdit} />
      <Card title="How to run easy">
        <ul className="space-y-2 text-sm">
          <li><strong>Easy means conversational.</strong> You can talk in full sentences. Most running should feel like this.</li>
          <li><strong>Warm up and cool down</strong> with 5 minutes of brisk walking or very easy jogging.</li>
          <li><strong>Run/walk is real training.</strong> Walk breaks help you go further with less strain.</li>
          <li><strong>Build gradually.</strong> Increase weekly time by small steps, and take an easier week every 3–4 weeks.</li>
        </ul>
      </Card>
      {runs.length ? (
        <>
          <Card title={`Pace (min/${unit})`}>
            <TrendChart label="Running pace" data={paceSeries} fmt={(n) => formatPace(n)} />
            <p className="mt-1 text-xs text-muted">Lower is faster. Pace varies with terrain, heat and effort — compare like with like.</p>
          </Card>
          {hrSeries.length > 1 && (
            <Card title="Average heart rate">
              <TrendChart label="Running heart rate" data={hrSeries} />
            </Card>
          )}
          <Card title="Recent runs">
            <WorkoutList workouts={[...runs].reverse().slice(0, 10)} imp={imp} onEdit={onEdit} tz={data.profile.timeZone} />
          </Card>
        </>
      ) : (
        <Empty title="No runs yet">Log one manually or import your Garmin activities CSV in Profile.</Empty>
      )}
    </>
  );
}

function Strength({ data, imp }: { data: DataSet; imp: boolean }) {
  return (
    <>
      <StrengthDose data={data} imp={imp} />
      <StrengthList data={data} imp={imp} />
    </>
  );
}

function StrengthList({ data, imp }: { data: DataSet; imp: boolean }) {
  const prog = strengthProgress(data.workouts.filter((w) => w.type === "strength"));
  const u = imp ? "lb" : "kg";
  const w = (kg: number) => Math.round((imp ? kg / 0.45359237 : kg) * 10) / 10;
  if (!prog.length) return <Empty title="No strength sessions with sets yet">Log a strength workout and add sets to track progressive overload.</Empty>;
  return (
    <Card title="Exercises" action={<SourceBadge source="calculated" />}>
      <ul className="divide-y divide-line">
        {prog.map((p) => {
          const up = p.previous && (p.last.topWeightKg > p.previous.topWeightKg || p.last.volumeKg > p.previous.volumeKg);
          return (
            <li key={p.exercise} className="py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{p.exercise}</span>
                <span className="text-xs text-muted">{p.sessions} sessions</span>
              </div>
              <div className="tabular mt-0.5 text-sm text-muted">
                {p.best.weightKg ? <>Best {w(p.best.weightKg)} {u} × {p.best.reps} · est. 1RM {w(p.best.e1rm)} {u}</> : <>Bodyweight · best {p.best.reps} reps</>}
              </div>
              <div className="tabular text-sm">
                Last {formatDay(p.last.date, "d MMM")}: top {w(p.last.topWeightKg)} {u}, volume {w(p.last.volumeKg).toLocaleString()} {u}
                {up && <span className="ml-1 text-good">↑ progressed</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">Estimated 1RM uses the Epley formula — an estimate, not a tested max.</p>
    </Card>
  );
}

function History({ data, onEdit }: { data: DataSet; onEdit: (w: Workout) => void }) {
  const all = [...data.workouts].sort((a, b) => b.startAt.localeCompare(a.startAt));
  if (!all.length) return <Empty title="No workouts yet" />;
  return (
    <Card>
      <WorkoutList workouts={all.slice(0, 50)} imp={data.profile.units === "imperial"} onEdit={onEdit} tz={data.profile.timeZone} />
    </Card>
  );
}

function WorkoutList({ workouts, imp, onEdit, tz }: { workouts: Workout[]; imp: boolean; onEdit: (w: Workout) => void; tz: string }) {
  return (
    <ul className="divide-y divide-line">
      {workouts.map((w) => (
        <li key={w.id}>
          <button className="flex min-h-12 w-full items-center justify-between gap-2 py-1 text-left" onClick={() => onEdit(w)}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{w.title || ACTIVITY_LABEL[w.type]}</span>
              <span className="tabular block text-xs text-muted">
                {formatDay(w.date)} {formatInstant(w.startAt, tz)} · {formatDuration(w.durationMin)}
                {w.distanceKm ? ` · ${(imp ? w.distanceKm / 1.609344 : w.distanceKm).toFixed(2)} ${imp ? "mi" : "km"}` : ""}
                {w.avgHr ? ` · ${w.avgHr} bpm` : ""}
                {w.rpe ? ` · RPE ${w.rpe}` : ""}
              </span>
            </span>
            <SourceBadge source={w.source} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function SeasonCard({ data, today }: { data: DataSet; today: DayKey }) {
  const goal = data.profile.goalRace;
  if (!goal || goal.date < today)
    return (
      <Card title="Season plan">
        <p className="text-sm text-muted">Set a goal race in Profile → Performance and Human OS lays out Base → Build → Peak → Taper weeks with load targets.</p>
        <Link href="/profile#performance" className="btn-ghost mt-3 w-full">Set a goal race</Link>
      </Card>
    );
  const weeks = seasonPlan(goal, today);
  const typical = (() => {
    const loads = [...dailyLoads(data.workouts, addDays(today, -27), today).values()];
    return Math.round(loads.reduce((a, b) => a + b, 0) / 4);
  })();
  const thisWeek = weeks[0];
  const actual = [...dailyLoads(data.workouts, thisWeek.weekStart, today).values()].reduce((a, b) => a + b, 0);
  const target = typical ? Math.round(typical * thisWeek.loadFactor) : undefined;
  return (
    <Card title={`Season · ${goal.name}`} action={<span className="text-xs text-muted">{formatDay(goal.date, "d MMM yyyy")}</span>}>
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold">
          {PHASE_INFO[thisWeek.phase].label}
          {thisWeek.deload && " · lighter week"}
        </span>
        <span className="text-xs text-muted">{weeks.length} weeks to go</span>
      </div>
      <p className="mt-1 text-sm text-muted">{PHASE_INFO[thisWeek.phase].focus}</p>
      {target !== undefined && (
        <p className="mt-2 text-sm">
          Load this week: <strong className="num">{actual}</strong> of ≈<strong className="num">{target}</strong>
          <span className="text-muted"> (your usual week {typical})</span>
        </p>
      )}
      <div className="mt-3 flex h-16 items-end gap-[3px]" aria-label="Weekly load targets by phase">
        {weeks.map((w, i) => (
          <span
            key={w.weekStart}
            title={`${formatDay(w.weekStart, "d MMM")} · ${PHASE_INFO[w.phase].label} · ×${w.loadFactor}`}
            className={cx("flex-1 rounded-t", i === 0 ? "bg-accent" : w.phase === "taper" || w.phase === "race" ? "bg-good/60" : w.deload ? "bg-line" : "bg-accent/40")}
            style={{ height: `${Math.max(8, (w.loadFactor / 1.6) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>Now</span>
        <span>Race</span>
      </div>
      <p className="mt-2 text-xs text-muted">Targets are relative to your usual week and grow at most ≈5% a week (capped at +50%). Every 4th loading week is lighter; the taper cuts volume ≈40–60%.</p>
    </Card>
  );
}

function RunningFitness({ data, imp, onEdit }: { data: DataSet; imp: boolean; onEdit: (w: Workout) => void }) {
  const today = todayKey(data.profile.timeZone);
  const est = bestVdot(data.workouts, today);
  const hist = vdotHistory(data.workouts, today);
  const races = data.workouts.filter((w) => w.isRace).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card title="Running fitness over time" action={<SourceBadge source="calculated" />}>
      {est ? (
        <p className="text-sm">
          VDOT <strong className="num text-lg">{est.vdot}</strong> <span className="text-muted">from {est.basis === "race" ? "a race" : "a training split"} ({est.from.label}, {formatDay(est.from.date, "d MMM")})</span>
        </p>
      ) : (
        <p className="text-sm text-muted">No fast 5 km / 10 km efforts yet.</p>
      )}
      {hist.some((h) => h.value) && <TrendChart label="Best VDOT per month" data={hist} fmt={(n) => n.toFixed(0)} />}
      <div className="mt-2">
        <span className="eyebrow">Races</span>
        {races.length ? (
          <ul className="divide-y divide-line">
            {races.map((r) => (
              <li key={r.id}>
                <button className="flex min-h-11 w-full items-center justify-between text-left text-sm" onClick={() => onEdit(r)}>
                  <span>{r.title || "Race"} · {formatDay(r.date, "d MMM yy")}</span>
                  <span className="num font-semibold">{r.distanceKm ? `${(imp ? r.distanceKm / 1.609344 : r.distanceKm).toFixed(2)} ${imp ? "mi" : "km"} · ` : ""}{formatDuration(r.durationMin)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Mark a run as a race (edit it in History) to anchor your VDOT and paces to a real result.</p>
        )}
      </div>
    </Card>
  );
}

function StrengthDose({ data, imp }: { data: DataSet; imp: boolean }) {
  const today = todayKey(data.profile.timeZone);
  const sets = weeklySets(data.workouts, today);
  const exercises = [...new Set(data.workouts.flatMap((w) => (w.sets ?? []).filter((s) => s.weightKg).map((s) => s.exercise.trim())))];
  const [ex, setEx] = useState(exercises[0] ?? "");
  const hist = ex ? e1rmHistory(data.workouts, ex) : [];
  const conv = (kg: number) => Math.round((imp ? kg / 0.45359237 : kg) * 10) / 10;
  return (
    <>
      <Card title="Hard sets this week" action={<SourceBadge source="calculated" />}>
        <ul className="space-y-1.5">
          {sets.map((g) => (
            <li key={g.group} className="flex items-center gap-2 text-sm">
              <span className="w-36 shrink-0">{g.group}</span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="absolute inset-y-0 bg-good/20" style={{ left: "33.3%", width: "33.3%" }} aria-hidden />
                <span className={cx("absolute inset-y-0 left-0 rounded-full", g.status === "in range" ? "bg-good" : g.status === "high" ? "bg-warn" : "bg-accent")} style={{ width: `${Math.min(100, (g.sets / 30) * 100)}%` }} />
              </span>
              <span className="num w-8 text-right">{g.sets}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Shaded band = 10–20 hard sets per muscle group per week, where most people grow. Compound lifts count half for helper muscles; sets with RIR above 4 don&apos;t count.</p>
      </Card>
      {exercises.length > 0 && (
        <Card title="Strength trend (est. 1RM)">
          <select aria-label="Exercise" className="input mb-2" value={ex} onChange={(e) => setEx(e.target.value)}>
            {exercises.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
          {hist.length > 1 ? (
            <TrendChart label={`Estimated 1RM for ${ex}`} data={hist.map((h) => ({ date: h.date, value: conv(h.value) }))} fmt={(n) => `${Math.round(n)}`} />
          ) : (
            <p className="text-sm text-muted">Needs two sessions with weights for this exercise.</p>
          )}
        </Card>
      )}
    </>
  );
}
