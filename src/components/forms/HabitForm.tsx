"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/date";
import type { Habit, HabitCategory, HabitFrequency } from "@/lib/types";
import { Field, Notice, Segmented, cx } from "../ui";

export const CATEGORY_LABEL: Record<HabitCategory, string> = {
  sleep: "Sleep",
  movement: "Movement",
  training: "Training",
  nutrition: "Nutrition",
  hydration: "Hydration",
  mind: "Mind",
  routine: "Routine",
  other: "Other",
};
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function HabitForm({ existing, defaults, onDone }: { existing?: Habit; defaults?: Partial<Habit>; onDone: () => void }) {
  const base = existing ?? defaults;
  const [name, setName] = useState(base?.name ?? "");
  const [category, setCategory] = useState<HabitCategory>(base?.category ?? "other");
  const [freq, setFreq] = useState<HabitFrequency>(base?.frequency ?? { type: "daily" });
  const [routine, setRoutine] = useState<"none" | "morning" | "evening">(base?.routine ?? "none");
  const [scheduled, setScheduled] = useState(base?.scheduledTime ?? "");
  const [duration, setDuration] = useState(base?.durationMin?.toString() ?? "");
  const [reminder, setReminder] = useState(base?.reminderTime ?? "");
  const [minimum, setMinimum] = useState(base?.minimumVersion ?? "");
  const [criteria, setCriteria] = useState(base?.criteria ?? "");
  const [description, setDescription] = useState(base?.description ?? "");
  const [error, setError] = useState<string>();

  async function save() {
    if (!name.trim()) return setError("Give the habit a name.");
    if (freq.type === "days" && !freq.days.length) return setError("Pick at least one day.");
    const now = nowIso();
    const order = existing?.order ?? (await db.habits.count());
    await db.habits.put({
      ...(existing ?? { createdAt: now, archived: false }),
      name: name.trim(),
      category,
      frequency: freq,
      routine: routine === "none" ? undefined : routine,
      scheduledTime: scheduled || undefined,
      durationMin: duration ? Number(duration) : undefined,
      reminderTime: reminder || undefined,
      minimumVersion: minimum.trim() || undefined,
      criteria: criteria.trim() || undefined,
      description: description.trim() || undefined,
      order,
      updatedAt: now,
    });
    onDone();
  }

  return (
    <div className="space-y-4">
      <Field label="Name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning walk" />}</Field>
      <div>
        <span className="label">Category</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_LABEL) as HabitCategory[]).map((c) => (
            <button key={c} className={c === category ? "chip-on" : "chip"} aria-pressed={c === category} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">How often</span>
        <Segmented
          label="Frequency"
          value={freq.type}
          onChange={(t) => setFreq(t === "daily" ? { type: "daily" } : t === "days" ? { type: "days", days: [1, 2, 3, 4, 5] } : { type: "weekly", timesPerWeek: 3 })}
          options={[
            { value: "daily", label: "Daily" },
            { value: "days", label: "Some days" },
            { value: "weekly", label: "× per week" },
          ]}
        />
        {freq.type === "days" && (
          <div className="mt-2 flex justify-between gap-1">
            {DAYS.map((d, i) => {
              const on = freq.days.includes(i);
              return (
                <button
                  key={i}
                  aria-pressed={on}
                  aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                  onClick={() => setFreq({ type: "days", days: on ? freq.days.filter((x) => x !== i) : [...freq.days, i].sort() })}
                  className={cx("h-11 flex-1 rounded-xl border text-sm font-medium", on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
        {freq.type === "weekly" && (
          <div className="mt-2 flex items-center gap-2">
            <input
              aria-label="Times per week"
              type="number"
              min={1}
              max={7}
              className="input w-20"
              value={freq.timesPerWeek}
              onChange={(e) => setFreq({ type: "weekly", timesPerWeek: Math.max(1, Math.min(7, Number(e.target.value) || 1)) })}
            />
            <span className="text-sm text-muted">times per week, any days</span>
          </div>
        )}
      </div>
      <div>
        <span className="label">Part of a routine</span>
        <Segmented
          label="Routine"
          value={routine}
          onChange={setRoutine}
          options={[
            { value: "none", label: "None" },
            { value: "morning", label: "Morning" },
            { value: "evening", label: "Evening" },
          ]}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Time">{(id) => <input id={id} type="time" className="input" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />}</Field>
        <Field label="Minutes">{(id) => <input id={id} inputMode="numeric" className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />}</Field>
        <Field label="Reminder">{(id) => <input id={id} type="time" className="input" value={reminder} onChange={(e) => setReminder(e.target.value)} />}</Field>
      </div>
      <Field label="Minimum version" hint="The smallest version that still counts on a hard day.">
        {(id) => <input id={id} className="input" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="e.g. 5 minutes around the block" />}
      </Field>
      <Field label="Done when…">{(id) => <input id={id} className="input" value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="e.g. 20 minutes outside" />}</Field>
      <Field label="Why it matters">{(id) => <input id={id} className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />}</Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex gap-2">
        {existing?.id && (
          <button
            className="btn-ghost"
            onClick={async () => {
              await db.habits.update(existing.id!, { archived: !existing.archived, updatedAt: nowIso() });
              onDone();
            }}
          >
            {existing.archived ? "Restore" : "Archive"}
          </button>
        )}
        <button className="btn-primary flex-1" onClick={save}>
          Save habit
        </button>
      </div>
    </div>
  );
}
