import { addDays, clockOf, clockToMin, dayRange } from "./date";
import { consistency, indexLogs, isScheduled } from "./habits";
import { sleepAmount, sleepConsistency, timeInBedMin } from "./sleep";
import { BASELINE_WINDOW_DAYS, baseline, mean, type Baseline } from "./stats";
import type {
  CheckIn,
  DailyMetric,
  DayKey,
  Habit,
  HabitLog,
  LifestyleLog,
  MetricKey,
  Profile,
  SleepRecord,
  Source,
  Workout,
} from "./types";

/** Everything the analytics need, loaded once from the store. */
export interface DataSet {
  profile: Profile;
  metrics: DailyMetric[];
  sleep: SleepRecord[];
  workouts: Workout[];
  habits: Habit[];
  habitLogs: HabitLog[];
  checkins: CheckIn[];
  lifestyle: LifestyleLog[];
}

/** User corrections win, then device sources, then file imports. */
const SOURCE_PRIORITY: Source[] = ["manual", "garmin", "health", "device", "csv"];
const rank = (s: Source) => SOURCE_PRIORITY.indexOf(s);

export interface Point {
  date: DayKey;
  value: number;
  source: Source;
}

export function metricOn(metrics: DailyMetric[], key: MetricKey, date: DayKey): Point | undefined {
  let best: DailyMetric | undefined;
  for (const m of metrics) {
    if (m.metric !== key || m.date !== date) continue;
    if (!best || rank(m.source) < rank(best.source)) best = m;
  }
  return best && { date, value: best.value, source: best.source };
}

export function metricSeries(metrics: DailyMetric[], key: MetricKey, from: DayKey, to: DayKey): Point[] {
  const byDate = new Map<DayKey, DailyMetric>();
  for (const m of metrics) {
    if (m.metric !== key || m.date < from || m.date > to) continue;
    const cur = byDate.get(m.date);
    if (!cur || rank(m.source) < rank(cur.source)) byDate.set(m.date, m);
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, value: m.value, source: m.source }));
}

/** One sleep record per wake date, preferring the highest-priority source. */
export function sleepByDate(sleep: SleepRecord[]): Map<DayKey, SleepRecord> {
  const out = new Map<DayKey, SleepRecord>();
  for (const s of sleep) {
    const cur = out.get(s.date);
    if (!cur || rank(s.source) < rank(cur.source)) out.set(s.date, s);
  }
  return out;
}

export function sleepInRange(sleep: SleepRecord[], from: DayKey, to: DayKey): SleepRecord[] {
  return [...sleepByDate(sleep).values()]
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Baseline from the 28 days before `day` (the day itself is excluded). */
export function metricBaseline(metrics: DailyMetric[], key: MetricKey, day: DayKey): Baseline {
  const pts = metricSeries(metrics, key, addDays(day, -BASELINE_WINDOW_DAYS), addDays(day, -1));
  return baseline(pts.map((p) => p.value));
}

export function sleepBaseline(sleep: SleepRecord[], day: DayKey, latencyMin: number): Baseline {
  const recs = sleepInRange(sleep, addDays(day, -BASELINE_WINDOW_DAYS), addDays(day, -1));
  return baseline(recs.map((r) => sleepAmount(r, latencyMin).minutes));
}

export interface PeriodSummary {
  from: DayKey;
  to: DayKey;
  nights: number;
  avgSleepMin?: number;
  /** True if any night's sleep amount is an estimate (no measured asleep time). */
  sleepIncludesEstimates: boolean;
  avgTimeInBedMin?: number;
  bedtimeSdMin?: number;
  wakeSdMin?: number;
  avgBedtime?: string;
  avgWake?: string;
  avgSleepScore?: number;
  avgHrv?: number;
  hrvDays: number;
  avgRhr?: number;
  rhrDays: number;
  avgSteps?: number;
  stepsDays: number;
  workouts: number;
  workoutMin: number;
  workoutsByType: Record<string, number>;
  habitRate?: number;
  habitRates: { habitId: number; name: string; rate?: number; earned: number; possible: number }[];
  avgEnergy?: number;
  energyDays: number;
  avgMood?: number;
  checkinDays: number;
}

export function summarize(data: DataSet, from: DayKey, to: DayKey): PeriodSummary {
  const { profile } = data;
  const tz = profile.timeZone;
  const nights = sleepInRange(data.sleep, from, to);
  const amounts = nights.map((n) => sleepAmount(n, profile.sleepLatencyMin));
  const cons = sleepConsistency(nights, tz);
  const scores = nights.flatMap((n) => (n.score === undefined ? [] : [n.score]));
  const hrv = metricSeries(data.metrics, "hrv", from, to).map((p) => p.value);
  const rhr = metricSeries(data.metrics, "rhr", from, to).map((p) => p.value);
  const steps = metricSeries(data.metrics, "steps", from, to).map((p) => p.value);
  const ws = data.workouts.filter((w) => w.date >= from && w.date <= to);
  const byType: Record<string, number> = {};
  for (const w of ws) byType[w.type] = (byType[w.type] ?? 0) + 1;

  const idx = indexLogs(data.habitLogs);
  const active = data.habits.filter((h) => !h.archived);
  const habitRates = active.map((h) => {
    const c = consistency(h, idx, from, to);
    return { habitId: h.id!, name: h.name, rate: c.rate, earned: c.earned, possible: c.possible };
  });
  const earned = habitRates.reduce((a, h) => a + h.earned, 0);
  const possible = habitRates.reduce((a, h) => a + h.possible, 0);

  const cks = data.checkins.filter((c) => c.date >= from && c.date <= to);
  const energy = cks.flatMap((c) => (c.energy === undefined ? [] : [c.energy]));
  const mood = cks.flatMap((c) => (c.mood === undefined ? [] : [c.mood]));

  return {
    from,
    to,
    nights: nights.length,
    avgSleepMin: mean(amounts.map((a) => a.minutes)),
    sleepIncludesEstimates: amounts.some((a) => a.kind === "estimated"),
    avgTimeInBedMin: mean(nights.map(timeInBedMin)),
    bedtimeSdMin: cons.bedtimeSdMin,
    wakeSdMin: cons.wakeSdMin,
    avgBedtime: cons.avgBedtime,
    avgWake: cons.avgWake,
    avgSleepScore: mean(scores),
    avgHrv: mean(hrv),
    hrvDays: hrv.length,
    avgRhr: mean(rhr),
    rhrDays: rhr.length,
    avgSteps: mean(steps),
    stepsDays: steps.length,
    workouts: ws.length,
    workoutMin: ws.reduce((a, w) => a + w.durationMin, 0),
    workoutsByType: byType,
    habitRate: possible ? earned / possible : undefined,
    habitRates,
    avgEnergy: mean(energy),
    energyDays: energy.length,
    avgMood: mean(mood),
    checkinDays: cks.length,
  };
}

export interface Change {
  label: string;
  direction: "improved" | "worsened" | "stable";
  detail: string;
}

/**
 * Compare two periods with deliberately wide "stable" bands so normal
 * week-to-week noise isn't reported as change.
 */
export function compare(cur: PeriodSummary, prev: PeriodSummary): Change[] {
  const out: Change[] = [];
  const push = (
    label: string,
    a: number | undefined,
    b: number | undefined,
    band: number,
    higherIsBetter: boolean,
    fmt: (n: number) => string,
  ) => {
    if (a === undefined || b === undefined) return;
    const d = a - b;
    const direction = Math.abs(d) < band ? "stable" : d > 0 === higherIsBetter ? "improved" : "worsened";
    out.push({ label, direction, detail: `${fmt(b)} → ${fmt(a)}` });
  };
  const min = (n: number) => `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, "0")}m`;
  push("Average sleep", cur.avgSleepMin, prev.avgSleepMin, 20, true, min);
  push("Bedtime consistency (±min)", cur.bedtimeSdMin, prev.bedtimeSdMin, 10, false, (n) => `±${Math.round(n)}m`);
  push("Resting heart rate", cur.avgRhr, prev.avgRhr, 2, false, (n) => `${Math.round(n)} bpm`);
  push("HRV", cur.avgHrv, prev.avgHrv, 4, true, (n) => `${Math.round(n)} ms`);
  push("Habit consistency", cur.habitRate, prev.habitRate, 0.08, true, (n) => `${Math.round(n * 100)}%`);
  push("Energy (1–10)", cur.avgEnergy, prev.avgEnergy, 0.8, true, (n) => n.toFixed(1));
  push("Training minutes", cur.workoutMin, prev.workoutMin, 30, true, (n) => `${Math.round(n)} min`);
  return out;
}

export function weekRange(weekStartDay: DayKey): [DayKey, DayKey] {
  return [weekStartDay, addDays(weekStartDay, 6)];
}

/** Habits due today that aren't logged yet. */
export function openHabitsToday(data: DataSet, today: DayKey): Habit[] {
  const idx = indexLogs(data.habitLogs);
  return data.habits.filter(
    (h) => !h.archived && isScheduled(h, today) && !idx.has(`${h.id}|${today}`),
  );
}

export function waterToday(lifestyle: LifestyleLog[], today: DayKey): number {
  return lifestyle.filter((l) => l.date === today && l.kind === "water").reduce((a, l) => a + (l.amount ?? 0), 0);
}

export function lastCaffeineClock(lifestyle: LifestyleLog[], day: DayKey, tz: string): string | undefined {
  const items = lifestyle.filter((l) => l.date === day && l.kind === "caffeine");
  if (!items.length) return undefined;
  const latest = items.reduce((a, b) => (a.at > b.at ? a : b));
  return clockOf(latest.at, tz);
}

/** Minutes past midnight of a bedtime, unwrapped so 00:30 sorts after 23:00. */
export function bedtimeMinutes(r: SleepRecord, tz: string): number {
  const m = clockToMin(clockOf(r.bedtime, tz));
  return m < 12 * 60 ? m + 1440 : m;
}

export function daysWithData(data: DataSet, from: DayKey, to: DayKey): number {
  const days = new Set<DayKey>();
  for (const d of dayRange(from, to)) {
    if (
      data.sleep.some((s) => s.date === d) ||
      data.metrics.some((m) => m.date === d) ||
      data.checkins.some((c) => c.date === d)
    )
      days.add(d);
  }
  return days.size;
}
