import { METRIC_RANGES } from "./csv";
import type { ActivityType, DailyMetric, MetricKey, SleepRecord, Workout } from "./types";

/**
 * Maps Garmin Connect Personal API responses into Human OS records.
 * Field names verified against live responses (Nov 2026). Garmin's own values
 * (sleep score, Body Battery, stress) are stored unchanged and labelled "garmin";
 * nothing is estimated here, and missing fields stay missing.
 *
 * Deliberately NOT stored: GPS coordinates, location names, owner name/photo.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const n = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const s = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const day = (v: unknown): string | undefined => {
  const x = s(v);
  return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined;
};

export type GarminRecords = {
  sleep: Omit<SleepRecord, "id" | "createdAt" | "updatedAt">[];
  metrics: Omit<DailyMetric, "id" | "createdAt" | "updatedAt">[];
  workouts: Omit<Workout, "id" | "createdAt" | "updatedAt">[];
  rejected: string[];
};

export const emptyGarmin = (): GarminRecords => ({ sleep: [], metrics: [], workouts: [], rejected: [] });

function pushMetric(out: GarminRecords, date: string, key: MetricKey, v: number | undefined) {
  if (v === undefined) return;
  const [lo, hi] = METRIC_RANGES[key];
  if (v < lo || v > hi) return void out.rejected.push(`${date} ${key}=${v}`);
  out.metrics.push({ date, metric: key, value: Math.round(v * 10) / 10, source: "garmin" });
}

/** /usersummary-service/v2/dailysummaries → { data: [...] } */
export function mapDailySummaries(json: unknown, out: GarminRecords) {
  const rows = Array.isArray(obj(json)?.data) ? (obj(json)!.data as unknown[]) : [];
  for (const r of rows.map(obj)) {
    const date = day(r?.calendarDate);
    if (!r || !date) continue;
    const steps = obj(obj(r.movement)?.steps);
    const hr = obj(r.heartRate);
    const cal = obj(r.calories);
    const im = obj(r.intensityMinutes);
    const stress = obj(r.stress);
    const bb = obj(r.bodyBattery);
    pushMetric(out, date, "steps", n(steps?.value));
    pushMetric(out, date, "rhr", n(hr?.restingValue));
    pushMetric(out, date, "calories", n(cal?.burnedActive));
    const mod = n(im?.moderate);
    const vig = n(im?.vigorous);
    pushMetric(out, date, "activeMin", mod === undefined && vig === undefined ? undefined : (mod ?? 0) + (vig ?? 0));
    // Garmin reports -1/-2 for "not enough data"; those are not measurements.
    const avgStress = n(stress?.avgLevel);
    pushMetric(out, date, "stress", avgStress !== undefined && avgStress >= 0 ? avgStress : undefined);
    // Daily high ≈ how charged you woke up; comparable from day to day.
    pushMetric(out, date, "bodyBattery", n(bb?.maxValue));
  }
}

/** /sleep-service/sleep/dailySleepSummariesByDate → [...] (days without sleep are all-null) */
export function mapSleepSummaries(json: unknown, out: GarminRecords) {
  const rows = Array.isArray(json) ? json : [];
  for (const r of rows.map(obj)) {
    const date = day(r?.calendarDate);
    const start = n(r?.sleepStartTimestampGMT);
    const end = n(r?.sleepEndTimestampGMT);
    const asleepSec = n(r?.sleepTimeSeconds);
    if (!r || !date || start === undefined || end === undefined || asleepSec === undefined) continue;
    if (end <= start || end - start > 16 * 3_600_000) {
      out.rejected.push(`${date} sleep window`);
      continue;
    }
    const min = (v: unknown) => (n(v) === undefined ? undefined : Math.round(n(v)! / 60));
    const score = n(obj(obj(r.sleepScores)?.overall)?.value);
    out.sleep.push({
      date,
      bedtime: new Date(start).toISOString(),
      wakeTime: new Date(end).toISOString(),
      asleepMin: Math.round(asleepSec / 60),
      deepMin: min(r.deepSleepSeconds),
      lightMin: min(r.lightSleepSeconds),
      remMin: min(r.remSleepSeconds),
      awakeMin: min(r.awakeSleepSeconds),
      awakenings: n(r.awakeCount),
      score: score !== undefined && score >= 0 && score <= 100 ? score : undefined,
      source: "garmin",
      externalId: `garmin-sleep:${date}`,
    });
    // Overnight breathing rate and SpO₂ belong to the morning they end on.
    pushMetric(out, date, "respiration", n(r.averageRespirationValue));
    pushMetric(out, date, "spo2", n(r.averageSpO2Value));
  }
}

/** /hrv-service/hrv/daily/{start}/{end} → { hrvSummaries: [...] } */
export function mapHrv(json: unknown, out: GarminRecords) {
  const rows = Array.isArray(obj(json)?.hrvSummaries) ? (obj(json)!.hrvSummaries as unknown[]) : [];
  for (const r of rows.map(obj)) {
    const date = day(r?.calendarDate);
    if (!r || !date) continue;
    pushMetric(out, date, "hrv", n(r.lastNightAvg));
  }
}

const TYPES: [RegExp, ActivityType][] = [
  [/running|treadmill|trail/, "run"],
  [/walking|hiking/, "walk"],
  [/strength/, "strength"],
  [/swim/, "swim"],
  [/cycling|biking|ride/, "cycle"],
  [/yoga|pilates/, "yoga"],
  [/breathwork|stretch|mobility/, "mobility"],
];

function zones(r: Json): number[] | undefined {
  const z = [1, 2, 3, 4, 5].map((i) => n(r[`hrTimeInZone_${i}`]));
  return z.every((x) => x === undefined) ? undefined : z.map((x) => Math.round(x ?? 0));
}

function splits(r: Json): Workout["bestSplitsSec"] {
  const pick = (k: string) => {
    const v = n(r[k]);
    return v !== undefined && v > 0 ? Math.round(v) : undefined;
  };
  const out = { k1: pick("fastestSplit_1000"), mi: pick("fastestSplit_1609"), k5: pick("fastestSplit_5000"), k10: pick("fastestSplit_10000") };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

/** "2026-11-05 07:12:33" (GMT) → ISO */
const gmt = (v: unknown) => {
  const x = s(v);
  return x ? new Date(`${x.replace(" ", "T")}Z`).toISOString() : undefined;
};

/** /activitylist-service/activities/search/activities → [...] */
export function mapActivities(json: unknown, out: GarminRecords) {
  const rows = Array.isArray(json) ? json : [];
  for (const r of rows.map(obj)) {
    const id = n(r?.activityId);
    const startAt = gmt(r?.startTimeGMT);
    const durSec = n(r?.duration);
    if (!r || id === undefined || !startAt || durSec === undefined || durSec <= 0) continue;
    const typeKey = s(obj(r.activityType)?.typeKey) ?? "";
    const type = TYPES.find(([re]) => re.test(typeKey))?.[1] ?? "other";
    const dist = n(r.distance);
    out.workouts.push({
      // Garmin's local start time gives the calendar day the activity belongs to.
      date: day(s(r.startTimeLocal)?.slice(0, 10)) ?? startAt.slice(0, 10),
      startAt,
      type,
      title: s(r.activityName) ?? typeKey,
      durationMin: Math.round((durSec / 60) * 10) / 10,
      distanceKm: dist && dist > 0 ? Math.round((dist / 1000) * 100) / 100 : undefined,
      avgHr: n(r.averageHR) === undefined ? undefined : Math.round(n(r.averageHR)!),
      maxHr: n(r.maxHR) === undefined ? undefined : Math.round(n(r.maxHR)!),
      cadence: n(r.averageRunningCadenceInStepsPerMinute) === undefined ? undefined : Math.round(n(r.averageRunningCadenceInStepsPerMinute)!),
      elevationM: n(r.elevationGain) === undefined ? undefined : Math.round(n(r.elevationGain)!),
      calories: n(r.calories) === undefined ? undefined : Math.round(n(r.calories)!),
      hrZonesSec: zones(r),
      isRace: s(obj(r.eventType)?.typeKey) === "race" || undefined,
      aerobicTE: n(r.aerobicTrainingEffect),
      anaerobicTE: n(r.anaerobicTrainingEffect),
      bestSplitsSec: splits(r),
      source: "garmin",
      externalId: `garmin:${id}`,
    });
  }
}
