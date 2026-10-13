import { dayKey, zonedToIso } from "./date";
import type { ActivityType, DailyMetric, MetricKey, SleepRecord, Workout } from "./types";

/**
 * CSV import. Pure parsing + validation — no storage here. Three formats:
 *  - Human OS sleep template
 *  - Human OS daily-metrics template
 *  - Garmin Connect "Activities" CSV export (Activities list → Export CSV)
 *
 * Garmin data imported this way is labelled source "csv", never "garmin",
 * because it didn't come through an authorised live connection.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export type CsvKind = "sleep" | "metrics" | "garminActivities" | "unknown";

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function detectKind(headers: string[]): CsvKind {
  const h = headers.map(norm);
  if (h.includes("activity_type") && h.includes("date") && h.includes("time")) return "garminActivities";
  if (h.includes("date") && h.includes("bedtime") && h.includes("wake")) return "sleep";
  if (h.includes("date") && h.some((x) => METRIC_COLUMNS[x])) return "metrics";
  return "unknown";
}

/** Parse a number, treating blanks and Garmin's "--" as missing (never zero). */
export function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const t = v.trim().replace(/,/g, "");
  if (t === "" || t === "--" || t.toLowerCase() === "nan") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** "hh:mm:ss", "mm:ss" or "hh:mm:ss.s" → minutes */
export function durationToMin(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const parts = v.trim().split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/;

function localDateTimeToIso(v: string, tz: string): string | undefined {
  const m = DATETIME_RE.exec(v.trim());
  if (!m) return undefined;
  return zonedToIso(m[1], `${m[2].padStart(2, "0")}:${m[3]}`, tz);
}

export interface ParseResult<T> {
  kind: CsvKind;
  records: T[];
  errors: { row: number; message: string }[];
}

function table(text: string) {
  const rows = parseCsv(text);
  const headers = rows[0] ?? [];
  const keys = headers.map(norm);
  const body = rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])) as Record<string, string>);
  return { headers, body };
}

type SleepDraft = Omit<SleepRecord, "id" | "createdAt" | "updatedAt">;

export function parseSleepCsv(text: string, tz: string): ParseResult<SleepDraft> {
  const { body } = table(text);
  const records: SleepDraft[] = [];
  const errors: ParseResult<SleepDraft>["errors"] = [];
  body.forEach((r, i) => {
    const bed = r.bedtime && localDateTimeToIso(r.bedtime, tz);
    const wake = r.wake && localDateTimeToIso(r.wake, tz);
    if (!bed || !wake) return errors.push({ row: i + 2, message: "bedtime and wake must be YYYY-MM-DD HH:mm" });
    if (Date.parse(wake) <= Date.parse(bed)) return errors.push({ row: i + 2, message: "wake must be after bedtime" });
    if (Date.parse(wake) - Date.parse(bed) > 16 * 3_600_000) return errors.push({ row: i + 2, message: "time in bed over 16h" });
    const date = r.date && DATE_RE.test(r.date.trim()) ? r.date.trim() : dayKey(wake, tz);
    const score = num(r.score);
    const quality = num(r.quality);
    records.push({
      date,
      bedtime: bed,
      wakeTime: wake,
      asleepMin: num(r.asleep_min),
      score: score !== undefined && score >= 0 && score <= 100 ? score : undefined,
      deepMin: num(r.deep_min),
      lightMin: num(r.light_min),
      remMin: num(r.rem_min),
      awakeMin: num(r.awake_min),
      quality: quality !== undefined && quality >= 1 && quality <= 5 ? quality : undefined,
      source: "csv",
    });
  });
  return { kind: "sleep", records, errors };
}

const METRIC_COLUMNS: Record<string, MetricKey> = {
  rhr: "rhr",
  resting_hr: "rhr",
  resting_heart_rate: "rhr",
  hrv: "hrv",
  body_battery: "bodyBattery",
  stress: "stress",
  steps: "steps",
  active_min: "activeMin",
  calories: "calories",
  respiration: "respiration",
};

/** Plausible ranges — values outside are rejected rather than stored. */
export const METRIC_RANGES: Record<MetricKey, [number, number]> = {
  rhr: [25, 140],
  hrv: [5, 300],
  hrvStatus: [0, 3],
  bodyBattery: [0, 100],
  stress: [0, 100],
  steps: [0, 150_000],
  activeMin: [0, 1440],
  calories: [0, 15_000],
  respiration: [4, 60],
};

type MetricDraft = Omit<DailyMetric, "id" | "createdAt" | "updatedAt">;

export function parseMetricsCsv(text: string): ParseResult<MetricDraft> {
  const { body } = table(text);
  const records: MetricDraft[] = [];
  const errors: ParseResult<MetricDraft>["errors"] = [];
  body.forEach((r, i) => {
    const date = r.date?.trim();
    if (!date || !DATE_RE.test(date)) return errors.push({ row: i + 2, message: "date must be YYYY-MM-DD" });
    for (const [col, key] of Object.entries(METRIC_COLUMNS)) {
      const v = num(r[col]);
      if (v === undefined) continue;
      const [lo, hi] = METRIC_RANGES[key];
      if (v < lo || v > hi) {
        errors.push({ row: i + 2, message: `${col}=${v} outside plausible range ${lo}–${hi}` });
        continue;
      }
      records.push({ date, metric: key, value: v, source: "csv" });
    }
  });
  return { kind: "metrics", records, errors };
}

const GARMIN_TYPES: [RegExp, ActivityType][] = [
  [/run/i, "run"],
  [/walk|hik/i, "walk"],
  [/strength|weight/i, "strength"],
  [/swim/i, "swim"],
  [/cycl|bik|ride/i, "cycle"],
  [/yoga|pilates/i, "yoga"],
  [/stretch|mobility|breath/i, "mobility"],
];

type WorkoutDraft = Omit<Workout, "id" | "createdAt" | "updatedAt">;

export function parseGarminActivitiesCsv(
  text: string,
  tz: string,
  distanceUnit: "km" | "mi" = "km",
): ParseResult<WorkoutDraft> {
  const { body } = table(text);
  const records: WorkoutDraft[] = [];
  const errors: ParseResult<WorkoutDraft>["errors"] = [];
  body.forEach((r, i) => {
    const startAt = r.date && localDateTimeToIso(r.date, tz);
    const durationMin = durationToMin(r.time ?? r.elapsed_time ?? r.moving_time);
    if (!startAt) return errors.push({ row: i + 2, message: "unreadable Date" });
    if (durationMin === undefined) return errors.push({ row: i + 2, message: "unreadable Time" });
    const typeText = r.activity_type ?? "";
    const type = GARMIN_TYPES.find(([re]) => re.test(typeText))?.[1] ?? "other";
    const dist = num(r.distance);
    // Swim distances are exported in metres/yards; other activities in km/mi.
    const distanceKm =
      dist === undefined
        ? undefined
        : type === "swim"
          ? dist / (distanceUnit === "mi" ? 1093.61 : 1000)
          : distanceUnit === "mi"
            ? dist * 1.609344
            : dist;
    records.push({
      date: dayKey(startAt, tz),
      startAt,
      type,
      title: r.title || typeText,
      durationMin: Math.round(durationMin * 10) / 10,
      distanceKm: distanceKm === undefined ? undefined : Math.round(distanceKm * 100) / 100,
      calories: num(r.calories),
      avgHr: num(r.avg_hr),
      maxHr: num(r.max_hr),
      cadence: num(r.avg_run_cadence) ?? num(r.avg_bike_cadence),
      elevationM: num(r.total_ascent),
      source: "csv",
      externalId: `csv:garmin:${startAt}:${type}`,
    });
  });
  return { kind: "garminActivities", records, errors };
}

export const SLEEP_TEMPLATE =
  "date,bedtime,wake,asleep_min,score,deep_min,light_min,rem_min,awake_min,quality\n" +
  "2026-01-02,2026-01-01 23:10,2026-01-02 06:40,412,78,70,250,92,38,4\n";

export const METRICS_TEMPLATE =
  "date,rhr,hrv,body_battery,stress,steps,active_min,calories,respiration\n2026-01-02,54,48,72,28,8450,42,2150,14\n";
