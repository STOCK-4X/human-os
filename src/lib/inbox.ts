import { z } from "zod";
import { METRIC_RANGES } from "./csv";
import { addDays, dayKey } from "./date";
import type { ActivityType, DailyMetric, DayKey, MetricKey, SleepRecord, Workout } from "./types";

/**
 * Apple Health inbox payload — what the iOS Shortcut sends each morning.
 * Everything is optional and forgiving (Shortcuts sends numbers as strings,
 * sometimes with a decimal comma), but every value is range-checked, and
 * anything missing simply stays missing.
 */

const num = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return v;
}, z.number().finite().optional());

const instant = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
  z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "not a date").optional(),
);

/** Shortcuts' "Request Body: JSON" is easiest with flat keys, so accept sleepStart/sleepEnd/sleepAsleepMin too. */
function liftFlatSleep(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  if (o.sleep !== undefined || (o.sleepStart === undefined && o.sleepEnd === undefined)) return v;
  const { sleepStart, sleepEnd, sleepAsleepMin, ...rest } = o;
  return { ...rest, sleep: { start: sleepStart, end: sleepEnd, asleepMin: sleepAsleepMin } };
}

const PayloadObject = z.object({
  /** The morning this report belongs to (local day). Defaults to the day of `sentAt`. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sentAt: instant,
  sleep: z
    .object({
      start: instant,
      end: instant,
      asleepMin: num,
      deepMin: num,
      remMin: num,
      coreMin: num,
      awakeMin: num,
    })
    .optional(),
  /** Morning values (attributed to `day`). */
  restingHR: num,
  hrv: num,
  respiration: num,
  /** Totals for the previous day (attributed to `day − 1`). */
  steps: num,
  activeEnergyKcal: num,
  exerciseMin: num,
  workouts: z
    .array(
      z.object({
        type: z.string().max(60).optional(),
        start: instant,
        end: instant,
        durationMin: num,
        distanceKm: num,
        kcal: num,
        avgHR: num,
      }),
    )
    .max(20)
    .optional(),
});

export const HealthPayloadSchema = z.preprocess(liftFlatSleep, PayloadObject);

export type HealthPayload = z.infer<typeof HealthPayloadSchema>;

export interface InboxRecords {
  sleep?: Omit<SleepRecord, "id" | "createdAt" | "updatedAt">;
  metrics: Omit<DailyMetric, "id" | "createdAt" | "updatedAt">[];
  workouts: Omit<Workout, "id" | "createdAt" | "updatedAt">[];
  rejected: string[];
}

const TYPES: [RegExp, ActivityType][] = [
  [/run/i, "run"],
  [/walk|hik/i, "walk"],
  [/strength|weight|functional/i, "strength"],
  [/swim/i, "swim"],
  [/cycl|bik/i, "cycle"],
  [/yoga|pilates/i, "yoga"],
  [/stretch|flexib|mobility|cooldown/i, "mobility"],
];

/** Turn one inbox payload into app records (source "health"), validating ranges. */
export function inboxToRecords(p: HealthPayload, tz: string): InboxRecords {
  const day: DayKey = p.day ?? dayKey(p.sentAt ?? new Date().toISOString(), tz);
  const prev = addDays(day, -1);
  const out: InboxRecords = { metrics: [], workouts: [], rejected: [] };

  const metric = (date: DayKey, key: MetricKey, v: number | undefined) => {
    if (v === undefined) return;
    const [lo, hi] = METRIC_RANGES[key];
    if (v < lo || v > hi) return void out.rejected.push(`${key}=${v} outside ${lo}–${hi}`);
    out.metrics.push({ date, metric: key, value: Math.round(v * 10) / 10, source: "health" });
  };
  metric(day, "rhr", p.restingHR);
  metric(day, "hrv", p.hrv);
  metric(day, "respiration", p.respiration);
  metric(prev, "steps", p.steps === undefined ? undefined : Math.round(p.steps));
  metric(prev, "calories", p.activeEnergyKcal === undefined ? undefined : Math.round(p.activeEnergyKcal));
  metric(prev, "activeMin", p.exerciseMin === undefined ? undefined : Math.round(p.exerciseMin));

  const s = p.sleep;
  if (s?.start && s.end) {
    const tib = (Date.parse(s.end) - Date.parse(s.start)) / 60_000;
    if (tib <= 0 || tib > 16 * 60) out.rejected.push("sleep: time in bed must be 0–16 h");
    else {
      const staged = [s.deepMin, s.remMin, s.coreMin].filter((x): x is number => x !== undefined);
      const asleep = s.asleepMin ?? (staged.length ? staged.reduce((a, b) => a + b, 0) : undefined);
      const valid = asleep === undefined || (asleep >= 0 && asleep <= tib);
      if (!valid) out.rejected.push("sleep: asleep time exceeds time in bed");
      out.sleep = {
        date: dayKey(s.end, tz),
        bedtime: new Date(s.start).toISOString(),
        wakeTime: new Date(s.end).toISOString(),
        asleepMin: valid && asleep !== undefined ? Math.round(asleep) : undefined,
        deepMin: s.deepMin === undefined ? undefined : Math.round(s.deepMin),
        remMin: s.remMin === undefined ? undefined : Math.round(s.remMin),
        lightMin: s.coreMin === undefined ? undefined : Math.round(s.coreMin),
        awakeMin: s.awakeMin === undefined ? undefined : Math.round(s.awakeMin),
        source: "health",
      };
    }
  }

  for (const w of p.workouts ?? []) {
    if (!w.start) {
      out.rejected.push("workout without start time");
      continue;
    }
    const dur = w.durationMin ?? (w.end ? (Date.parse(w.end) - Date.parse(w.start)) / 60_000 : undefined);
    if (dur === undefined || dur <= 0 || dur > 1440) {
      out.rejected.push(`workout ${w.type ?? ""}: unreadable duration`);
      continue;
    }
    const type = TYPES.find(([re]) => re.test(w.type ?? ""))?.[1] ?? "other";
    const startAt = new Date(w.start).toISOString();
    out.workouts.push({
      date: dayKey(startAt, tz),
      startAt,
      type,
      title: w.type,
      durationMin: Math.round(dur * 10) / 10,
      distanceKm: w.distanceKm === undefined ? undefined : Math.round(w.distanceKm * 100) / 100,
      calories: w.kcal === undefined ? undefined : Math.round(w.kcal),
      avgHr: w.avgHR === undefined ? undefined : Math.round(w.avgHR),
      source: "health",
      externalId: `health:${startAt}:${type}`,
    });
  }
  return out;
}
