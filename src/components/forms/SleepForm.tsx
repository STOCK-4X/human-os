"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { addDays, clockOf, clockToMin, formatDuration, nowIso, zonedToIso } from "@/lib/date";
import { timeInBedMin } from "@/lib/sleep";
import type { DayKey, Profile, SleepRecord } from "@/lib/types";
import { Field, Notice, Rating } from "../ui";

const toNum = (s: string) => (s.trim() === "" ? undefined : Number(s));

export function SleepForm({
  profile,
  date,
  existing,
  onDone,
}: {
  profile: Profile;
  date: DayKey;
  existing?: SleepRecord;
  onDone: () => void;
}) {
  const tz = profile.timeZone;
  const [wakeDay, setWakeDay] = useState(existing?.date ?? date);
  const [bed, setBed] = useState(existing ? clockOf(existing.bedtime, tz) : "23:00");
  const [wake, setWake] = useState(existing ? clockOf(existing.wakeTime, tz) : profile.targetWake);
  const [asleepH, setAsleepH] = useState(existing?.asleepMin !== undefined ? String(Math.floor(existing.asleepMin / 60)) : "");
  const [asleepM, setAsleepM] = useState(existing?.asleepMin !== undefined ? String(existing.asleepMin % 60) : "");
  const [score, setScore] = useState(existing?.score?.toString() ?? "");
  const [deep, setDeep] = useState(existing?.deepMin?.toString() ?? "");
  const [rem, setRem] = useState(existing?.remMin?.toString() ?? "");
  const [awake, setAwake] = useState(existing?.awakeMin?.toString() ?? "");
  const [awakenings, setAwakenings] = useState(existing?.awakenings?.toString() ?? "");
  const [quality, setQuality] = useState(existing?.quality);
  const [alertness, setAlertness] = useState(existing?.alertness);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string>();
  const [showMore, setShowMore] = useState(Boolean(existing?.score || existing?.deepMin));

  // Bedtime belongs to the previous calendar day when it's later than the wake clock (e.g. 23:00 → 06:30).
  const bedDay = clockToMin(bed) > clockToMin(wake) ? addDays(wakeDay, -1) : wakeDay;
  const draft = { bedtime: zonedToIso(bedDay, bed, tz), wakeTime: zonedToIso(wakeDay, wake, tz) };
  const tib = timeInBedMin(draft);

  async function save() {
    setError(undefined);
    const asleep = asleepH || asleepM ? (toNum(asleepH) ?? 0) * 60 + (toNum(asleepM) ?? 0) : undefined;
    const s = toNum(score);
    if (tib <= 0 || tib > 16 * 60) return setError("Time in bed must be between 0 and 16 hours.");
    if (asleep !== undefined && (asleep < 0 || asleep > tib)) return setError("Time asleep can't exceed time in bed.");
    if (s !== undefined && (s < 0 || s > 100)) return setError("Sleep score must be 0–100.");
    const now = nowIso();
    // Corrections to imported nights are stored as a separate manual record, which takes priority.
    const own = existing?.source === "manual" ? existing : undefined;
    const record: SleepRecord = {
      ...(own ?? { createdAt: now, source: "manual" as const }),
      date: wakeDay,
      ...draft,
      asleepMin: asleep,
      score: s,
      deepMin: toNum(deep),
      remMin: toNum(rem),
      awakeMin: toNum(awake),
      awakenings: toNum(awakenings),
      quality,
      alertness,
      notes: notes.trim() || undefined,
      updatedAt: now,
    };
    try {
      if (own?.id) await db.sleep.put(record);
      else {
        const clash = await db.sleep.where("[date+source]").equals([wakeDay, "manual"]).first();
        if (clash?.id) await db.sleep.put({ ...record, id: clash.id, createdAt: clash.createdAt });
        else await db.sleep.add(record);
      }
      onDone();
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    }
  }

  async function remove() {
    if (existing?.id && confirm("Delete this sleep record?")) {
      await db.sleep.delete(existing.id);
      onDone();
    }
  }

  const readOnly = existing && existing.source !== "manual";

  return (
    <div className="space-y-4">
      {readOnly && <Notice>This night was imported. Saving creates your own correction; the imported record is kept.</Notice>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Woke on">{(id) => <input id={id} type="date" className="input" value={wakeDay} onChange={(e) => setWakeDay(e.target.value)} />}</Field>
        <Field label="In bed">{(id) => <input id={id} type="time" className="input" value={bed} onChange={(e) => setBed(e.target.value)} />}</Field>
        <Field label="Woke up">{(id) => <input id={id} type="time" className="input" value={wake} onChange={(e) => setWake(e.target.value)} />}</Field>
      </div>
      <p className="text-sm text-muted">
        Time in bed: <span className="tabular font-medium text-ink">{formatDuration(tib)}</span>{" "}
        <span className="text-xs">(calculated)</span>
      </p>
      <div>
        <span className="label">Time asleep (if your device or you know it)</span>
        <div className="flex gap-2">
          <input aria-label="Hours asleep" inputMode="numeric" className="input" placeholder="h" value={asleepH} onChange={(e) => setAsleepH(e.target.value)} />
          <input aria-label="Minutes asleep" inputMode="numeric" className="input" placeholder="min" value={asleepM} onChange={(e) => setAsleepM(e.target.value)} />
        </div>
        <p className="mt-1 text-xs text-muted">Leave blank and it will be shown as an estimate (time in bed − {profile.sleepLatencyMin} min).</p>
      </div>
      <Rating label="Sleep quality" low="poor" high="great" value={quality} onChange={setQuality} />
      <Rating label="Morning alertness" low="groggy" high="sharp" value={alertness} onChange={setAlertness} />
      <button className="btn-quiet px-0 text-sm" onClick={() => setShowMore((v) => !v)}>
        {showMore ? "Hide" : "Add"} device details (score, stages)
      </button>
      {showMore && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sleep score">{(id) => <input id={id} inputMode="numeric" className="input" value={score} onChange={(e) => setScore(e.target.value)} />}</Field>
          <Field label="Awakenings">{(id) => <input id={id} inputMode="numeric" className="input" value={awakenings} onChange={(e) => setAwakenings(e.target.value)} />}</Field>
          <Field label="Deep (min)">{(id) => <input id={id} inputMode="numeric" className="input" value={deep} onChange={(e) => setDeep(e.target.value)} />}</Field>
          <Field label="REM (min)">{(id) => <input id={id} inputMode="numeric" className="input" value={rem} onChange={(e) => setRem(e.target.value)} />}</Field>
          <Field label="Awake (min)">{(id) => <input id={id} inputMode="numeric" className="input" value={awake} onChange={(e) => setAwake(e.target.value)} />}</Field>
        </div>
      )}
      <Field label="Notes">{(id) => <input id={id} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />}</Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex gap-2">
        {existing?.id && !readOnly && (
          <button className="btn-ghost text-bad" onClick={remove}>
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
