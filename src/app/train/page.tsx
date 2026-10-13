"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { TrendChart } from "@/components/charts";
import { ACTIVITY_LABEL, WorkoutForm } from "@/components/forms/WorkoutForm";
import { Card, Empty, Loading, Notice, Page, Segmented, Sheet, SourceBadge, Stat, cx } from "@/components/ui";
import { useDataSet, useToday } from "@/hooks/data";
import { buildBriefing } from "@/lib/briefing";
import { addDays, formatDay, formatDuration, formatInstant, weekStart } from "@/lib/date";
import type { DataSet } from "@/lib/reports";
import { adjustForReadiness, formatPace, pace, strengthProgress, weeklyPlan, type PlannedSession } from "@/lib/training";
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
  const [view, setView] = useState<"plan" | "run" | "strength" | "history">("plan");
  const { profile } = data;
  const brief = buildBriefing(data, today);
  const plan = weeklyPlan(profile, today);
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
          { value: "plan", label: "Week" },
          { value: "run", label: "Running" },
          { value: "strength", label: "Strength" },
          { value: "history", label: "History" },
        ]}
      />

      {view === "plan" && (
        <>
          <Card title="This week's plan" action={<SourceBadge source="calculated" />}>
            {plan.length === 0 ? (
              <Empty title="No training days set">Choose your available days in Profile.</Empty>
            ) : (
              <ul className="space-y-2">
                {plan.map((s) => {
                  const done = data.workouts.some((w) => w.date === s.day);
                  const shown: PlannedSession & { adjusted?: string } = s.day === today ? adjustForReadiness(s, brief.training.intensity) : s;
                  return (
                    <li key={s.day} className={cx("rounded-xl border p-3", s.day === today ? "border-accent" : "border-line", s.day < today && !done && "opacity-60")}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">{formatDay(s.day, "EEEE")}{s.day === today && " · today"}</span>
                        {done && <span className="text-xs font-medium text-good">Done</span>}
                      </div>
                      <div className="font-medium">{shown.title} <span className="text-sm font-normal text-muted">· {shown.durationMin} min</span></div>
                      <p className="text-sm text-muted">{shown.detail}</p>
                      {shown.adjusted && <p className="mt-1 text-xs text-accent">{shown.adjusted}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">A gentle template from your days, activities and level. Swap, shorten or skip freely — consistency over intensity.</p>
          </Card>
          <Card title="Weekly volume">
            <div className="mb-2 grid grid-cols-3 gap-3">
              <Stat label="This week" value={thisWeek.reduce((a, w) => a + w.durationMin, 0) || undefined} unit="min" source="calculated" />
              <Stat label="Sessions" value={thisWeek.length || undefined} source="calculated" />
              <Stat label="Planned" value={plan.length} source="calculated" />
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
