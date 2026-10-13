"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { db } from "@/lib/db";
import { clockOf, nowIso, zonedToIso } from "@/lib/date";
import type { ActivityType, DayKey, Profile, StrengthSet, Workout } from "@/lib/types";
import { Field, Notice } from "../ui";

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  run: "Run",
  walk: "Walk",
  strength: "Strength",
  swim: "Swim",
  cycle: "Cycle",
  mobility: "Mobility",
  yoga: "Yoga",
  stretch: "Stretch",
  other: "Other",
};

export const EXERCISES = [
  "Squat",
  "Deadlift",
  "Bench press",
  "Overhead press",
  "Barbell row",
  "Pull-up",
  "Push-up",
  "Lunge",
  "Romanian deadlift",
  "Hip thrust",
  "Plank",
  "Dumbbell row",
  "Goblet squat",
  "Step-up",
];

const n = (s: string) => (s.trim() === "" ? undefined : Number(s));

export function WorkoutForm({ profile, date, existing, onDone }: { profile: Profile; date: DayKey; existing?: Workout; onDone: () => void }) {
  const tz = profile.timeZone;
  const imperial = profile.units === "imperial";
  const [type, setType] = useState<ActivityType>(existing?.type ?? profile.preferredActivities[0] ?? "walk");
  const [day, setDay] = useState(existing?.date ?? date);
  const [time, setTime] = useState(existing ? clockOf(existing.startAt, tz) : clockOf(new Date(), tz));
  const [duration, setDuration] = useState(existing?.durationMin.toString() ?? "");
  const [distance, setDistance] = useState(
    existing?.distanceKm !== undefined ? String(Math.round((imperial ? existing.distanceKm / 1.609344 : existing.distanceKm) * 100) / 100) : "",
  );
  const [avgHr, setAvgHr] = useState(existing?.avgHr?.toString() ?? "");
  const [rpe, setRpe] = useState(existing?.rpe?.toString() ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [sets, setSets] = useState<StrengthSet[]>(existing?.sets ?? []);
  const [error, setError] = useState<string>();

  const addSet = () => setSets((s) => [...s, s.length ? { ...s[s.length - 1] } : { exercise: "Squat", reps: 8, weightKg: undefined, restSec: 90 }]);

  async function save() {
    const d = n(duration);
    if (d === undefined || d <= 0 || d > 1440) return setError("Duration is required (minutes).");
    const r = n(rpe);
    if (r !== undefined && (r < 1 || r > 10)) return setError("Effort is 1–10.");
    const dist = n(distance);
    const now = nowIso();
    const w: Workout = {
      ...(existing ?? { createdAt: now, source: "manual" as const }),
      type,
      date: day,
      startAt: zonedToIso(day, time, tz),
      durationMin: d,
      distanceKm: dist === undefined ? undefined : imperial ? dist * 1.609344 : dist,
      avgHr: n(avgHr),
      rpe: r,
      notes: notes.trim() || undefined,
      sets: type === "strength" ? sets.filter((s) => s.exercise && s.reps > 0) : undefined,
      updatedAt: now,
    };
    if (!existing) w.externalId = `manual:${crypto.randomUUID()}`;
    await db.workouts.put(w);
    onDone();
  }

  async function remove() {
    if (existing?.id && confirm("Delete this workout?")) {
      await db.workouts.delete(existing.id);
      onDone();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((t) => (
          <button key={t} className={t === type ? "chip-on" : "chip"} aria-pressed={t === type} onClick={() => setType(t)}>
            {ACTIVITY_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date">{(id) => <input id={id} type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />}</Field>
        <Field label="Start">{(id) => <input id={id} type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
        <Field label="Minutes">{(id) => <input id={id} inputMode="decimal" className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {type !== "strength" && (
          <Field label={`Distance (${type === "swim" ? (imperial ? "mi" : "km") : imperial ? "mi" : "km"})`}>
            {(id) => <input id={id} inputMode="decimal" className="input" value={distance} onChange={(e) => setDistance(e.target.value)} />}
          </Field>
        )}
        <Field label="Avg HR">{(id) => <input id={id} inputMode="numeric" className="input" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} />}</Field>
        <Field label="Effort 1–10">{(id) => <input id={id} inputMode="numeric" className="input" value={rpe} onChange={(e) => setRpe(e.target.value)} />}</Field>
      </div>

      {type === "strength" && (
        <div>
          <span className="label">Sets</span>
          <div className="space-y-2">
            {sets.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_3.5rem_4.5rem_2.5rem] items-center gap-2">
                <input
                  aria-label="Exercise"
                  list="exercise-list"
                  className="input"
                  value={s.exercise}
                  onChange={(e) => setSets((all) => all.map((x, j) => (j === i ? { ...x, exercise: e.target.value } : x)))}
                />
                <input
                  aria-label="Reps"
                  inputMode="numeric"
                  className="input px-2"
                  value={s.reps || ""}
                  placeholder="reps"
                  onChange={(e) => setSets((all) => all.map((x, j) => (j === i ? { ...x, reps: Number(e.target.value) || 0 } : x)))}
                />
                <input
                  aria-label="Weight kg"
                  inputMode="decimal"
                  className="input px-2"
                  value={s.weightKg ?? ""}
                  placeholder="kg"
                  onChange={(e) => setSets((all) => all.map((x, j) => (j === i ? { ...x, weightKg: n(e.target.value) } : x)))}
                />
                <button aria-label="Remove set" className="btn-quiet px-0" onClick={() => setSets((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <datalist id="exercise-list">
            {EXERCISES.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
          <button className="btn-ghost mt-2 w-full" onClick={addSet}>
            <Plus size={16} /> Add set
          </button>
        </div>
      )}
      <Field label="Notes">{(id) => <input id={id} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />}</Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex gap-2">
        {existing?.id && (
          <button className="btn-ghost text-bad" onClick={remove}>
            Delete
          </button>
        )}
        <button className="btn-primary flex-1" onClick={save}>
          Save workout
        </button>
      </div>
    </div>
  );
}
