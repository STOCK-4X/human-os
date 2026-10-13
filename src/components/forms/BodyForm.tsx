"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/date";
import type { BodyEntry, DayKey, Profile } from "@/lib/types";
import { Field, Notice, Segmented } from "../ui";

const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
const LB = 0.45359237;
const IN = 2.54;

export function BodyForm({ profile, date, existing, onDone }: { profile: Profile; date: DayKey; existing?: BodyEntry; onDone: () => void }) {
  const imp = profile.units === "imperial";
  const show = (v: number | undefined, f: number) => (v === undefined ? "" : String(Math.round((imp ? v / f : v) * 10) / 10));
  const [day, setDay] = useState(existing?.date ?? date);
  const [weight, setWeight] = useState(show(existing?.weightKg, LB));
  const [waist, setWaist] = useState(show(existing?.waistCm, IN));
  const [fat, setFat] = useState(existing?.bodyFatPct?.toString() ?? "");
  const [muscle, setMuscle] = useState(show(existing?.muscleKg, LB));
  const [source, setSource] = useState<"manual" | "device">(existing?.source === "device" ? "device" : "manual");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string>();

  async function save() {
    const w = n(weight);
    const f = n(fat);
    if (w === undefined && n(waist) === undefined && f === undefined && n(muscle) === undefined) return setError("Enter at least one value.");
    if (f !== undefined && (f < 2 || f > 70)) return setError("Body fat % looks out of range.");
    const now = nowIso();
    const conv = (v: number | undefined, fac: number) => (v === undefined ? undefined : imp ? v * fac : v);
    await db.body.put({
      ...(existing ?? { createdAt: now }),
      date: day,
      weightKg: conv(w, LB),
      waistCm: conv(n(waist), IN),
      bodyFatPct: f,
      muscleKg: conv(n(muscle), LB),
      source,
      notes: notes.trim() || undefined,
      updatedAt: now,
    });
    onDone();
  }

  return (
    <div className="space-y-4">
      <Field label="Date">{(id) => <input id={id} type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Weight (${imp ? "lb" : "kg"})`}>{(id) => <input id={id} inputMode="decimal" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} />}</Field>
        <Field label={`Waist (${imp ? "in" : "cm"})`}>{(id) => <input id={id} inputMode="decimal" className="input" value={waist} onChange={(e) => setWaist(e.target.value)} />}</Field>
        <Field label="Body fat (%)">{(id) => <input id={id} inputMode="decimal" className="input" value={fat} onChange={(e) => setFat(e.target.value)} />}</Field>
        <Field label={`Muscle mass (${imp ? "lb" : "kg"})`}>{(id) => <input id={id} inputMode="decimal" className="input" value={muscle} onChange={(e) => setMuscle(e.target.value)} />}</Field>
      </div>
      <div>
        <span className="label">How was it measured?</span>
        <Segmented
          label="Measurement source"
          value={source}
          onChange={setSource}
          options={[
            { value: "manual", label: "Scale / tape" },
            { value: "device", label: "Smart scale (estimate)" },
          ]}
        />
        <p className="mt-1 text-xs text-muted">Consumer body-composition devices give rough estimates that vary with hydration and time of day.</p>
      </div>
      <Field label="Notes">{(id) => <input id={id} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />}</Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex gap-2">
        {existing?.id && (
          <button
            className="btn-ghost text-bad"
            onClick={async () => {
              if (confirm("Delete this entry?")) {
                await db.body.delete(existing.id!);
                onDone();
              }
            }}
          >
            Delete
          </button>
        )}
        <button className="btn-primary flex-1" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
