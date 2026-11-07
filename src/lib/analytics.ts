import { addDays, dayRange, daysBetween, weekStart } from "./date";
import { type DataSet, sleepInRange } from "./reports";
import { sleepAmount } from "./sleep";
import { mean, sd } from "./stats";
import type { ActivityType, DayKey, Profile, Workout } from "./types";

/**
 * Training analytics: load, fitness/fatigue/form, load spikes, volume,
 * heart-rate zones, PRs and sleep debt. All derived from stored workouts —
 * Human OS estimates using published methods, not medical measurements.
 * Method notes: docs/ANALYTICS.md.
 */

/* --------------------------------------------------------------------------- */
/* Training load per session                                                    */
/* --------------------------------------------------------------------------- */

export type LoadMethod = "hr-zones" | "rpe" | "duration";

export interface SessionLoad {
  load: number;
  method: LoadMethod;
}

/**
 * Edwards TRIMP when heart-rate zone times exist: Σ minutes in zone × zone (1–5).
 * Otherwise session-RPE scaled to the same range (min × RPE × 0.4), and as a last
 * resort duration × 1.5 (assumes mostly easy effort) — flagged as an estimate.
 */
export function sessionLoad(w: Workout): SessionLoad {
  if (w.hrZonesSec && w.hrZonesSec.some((s) => s > 0)) {
    const trimp = w.hrZonesSec.reduce((a, sec, i) => a + (sec / 60) * (i + 1), 0);
    return { load: Math.round(trimp), method: "hr-zones" };
  }
  if (w.rpe) return { load: Math.round(w.durationMin * w.rpe * 0.4), method: "rpe" };
  return { load: Math.round(w.durationMin * 1.5), method: "duration" };
}

export function dailyLoads(workouts: Workout[], from: DayKey, to: DayKey): Map<DayKey, number> {
  const m = new Map<DayKey, number>(dayRange(from, to).map((d) => [d, 0]));
  for (const w of workouts) if (w.date >= from && w.date <= to) m.set(w.date, (m.get(w.date) ?? 0) + sessionLoad(w).load);
  return m;
}

/* --------------------------------------------------------------------------- */
/* Fitness (CTL) · Fatigue (ATL) · Form (TSB)                                   */
/* --------------------------------------------------------------------------- */

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

export interface PmcPoint {
  date: DayKey;
  load: number;
  /** Fitness: 42-day exponentially weighted load. */
  ctl: number;
  /** Fatigue: 7-day exponentially weighted load. */
  atl: number;
  /** Form at the START of the day: yesterday's CTL − ATL. */
  tsb: number;
}

export interface Pmc {
  points: PmcPoint[];
  /** Days of workout history behind today's numbers. */
  historyDays: number;
  /** CTL needs ~6 weeks of history before it means much. */
  reliable: boolean;
}

/** Performance-management series. Warms up from the first logged workout. */
export function pmc(workouts: Workout[], today: DayKey): Pmc {
  const first = workouts.reduce<DayKey | undefined>((a, w) => (!a || w.date < a ? w.date : a), undefined);
  if (!first) return { points: [], historyDays: 0, reliable: false };
  const loads = dailyLoads(workouts, first, today);
  const kc = 1 - Math.exp(-1 / CTL_DAYS);
  const ka = 1 - Math.exp(-1 / ATL_DAYS);
  let ctl = 0;
  let atl = 0;
  const points: PmcPoint[] = [];
  for (const [date, load] of loads) {
    const tsb = ctl - atl;
    ctl += (load - ctl) * kc;
    atl += (load - atl) * ka;
    points.push({ date, load, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round(tsb * 10) / 10 });
  }
  const historyDays = daysBetween(first, today) + 1;
  return { points, historyDays, reliable: historyDays >= CTL_DAYS };
}

export interface FormState {
  key: "detraining" | "fresh" | "neutral" | "absorbing" | "overreaching";
  label: string;
  text: string;
}

/** Common TSB bands (Coggan/TrainingPeaks-style guidance) — a guide, not a rule. */
export function formState(tsb: number): FormState {
  if (tsb > 25) return { key: "detraining", label: "Very fresh", text: "Much more rested than trained. Fine before a race; for weeks on end, fitness slowly drops." };
  if (tsb > 5) return { key: "fresh", label: "Fresh", text: "Rested relative to your recent training — a good window for a hard session or a race." };
  if (tsb >= -10) return { key: "neutral", label: "Neutral", text: "Training and recovery are roughly in balance." };
  if (tsb >= -30) return { key: "absorbing", label: "Absorbing", text: "More fatigue than fitness — the normal working range of a training block. Keep sleep and easy days protected." };
  return { key: "overreaching", label: "Deep fatigue", text: "Fatigue is far above fitness. Consider extra easy days; watch sleep, resting HR and how you feel." };
}

/* --------------------------------------------------------------------------- */
/* Load spike (ACWR), monotony, strain                                          */
/* --------------------------------------------------------------------------- */

export interface LoadFlag {
  status: "ok" | "insufficient";
  acute: number;
  chronicWeekly?: number;
  ratio?: number;
  band?: "low" | "optimal" | "caution" | "high";
  monotony?: number;
  strain?: number;
}

/**
 * Acute:chronic workload ratio — last 7 days vs the average week of the last 28.
 * Needs 3+ weeks of history. A spike above ~1.5 is a common caution flag; it is
 * an association with injury in research, not a prediction for you.
 */
export function loadFlag(workouts: Workout[], today: DayKey): LoadFlag {
  const loads = dailyLoads(workouts, addDays(today, -27), today);
  const vals = [...loads.values()];
  const acuteDays = vals.slice(-7);
  const acute = acuteDays.reduce((a, b) => a + b, 0);
  const first = workouts.reduce<DayKey | undefined>((a, w) => (!a || w.date < a ? w.date : a), undefined);
  const monoSd = sd(acuteDays);
  const monotony = acute > 0 && monoSd !== undefined && monoSd > 0 ? Math.round((mean(acuteDays)! / monoSd) * 100) / 100 : undefined;
  const strain = monotony !== undefined ? Math.round(acute * monotony) : undefined;
  if (!first || daysBetween(first, today) < 21) return { status: "insufficient", acute, monotony, strain };
  const chronicWeekly = vals.reduce((a, b) => a + b, 0) / 4;
  if (chronicWeekly <= 0) return { status: "insufficient", acute, monotony, strain };
  const ratio = Math.round((acute / chronicWeekly) * 100) / 100;
  const band = ratio < 0.8 ? "low" : ratio <= 1.3 ? "optimal" : ratio <= 1.5 ? "caution" : "high";
  return { status: "ok", acute, chronicWeekly: Math.round(chronicWeekly), ratio, band, monotony, strain };
}

/* --------------------------------------------------------------------------- */
/* Volume                                                                       */
/* --------------------------------------------------------------------------- */

export interface Volume {
  hours: number;
  sessions: number;
  distanceKm: number;
  bySport: { type: ActivityType; hours: number; sessions: number; distanceKm: number }[];
}

export function volume(workouts: Workout[], from: DayKey, to: DayKey): Volume {
  const ws = workouts.filter((w) => w.date >= from && w.date <= to);
  const by = new Map<ActivityType, { hours: number; sessions: number; distanceKm: number }>();
  for (const w of ws) {
    const b = by.get(w.type) ?? { hours: 0, sessions: 0, distanceKm: 0 };
    b.hours += w.durationMin / 60;
    b.sessions += 1;
    b.distanceKm += w.distanceKm ?? 0;
    by.set(w.type, b);
  }
  return {
    hours: Math.round((ws.reduce((a, w) => a + w.durationMin, 0) / 60) * 10) / 10,
    sessions: ws.length,
    distanceKm: Math.round(ws.reduce((a, w) => a + (w.distanceKm ?? 0), 0) * 10) / 10,
    bySport: [...by.entries()].map(([type, v]) => ({ type, ...v, hours: Math.round(v.hours * 10) / 10, distanceKm: Math.round(v.distanceKm * 10) / 10 })).sort((a, b) => b.hours - a.hours),
  };
}

export function weeklyHours(workouts: Workout[], today: DayKey, weeks: number): { date: DayKey; value: number }[] {
  const cur = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(cur, -7 * (weeks - 1 - i));
    const h = workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6)).reduce((a, w) => a + w.durationMin, 0) / 60;
    return { date: ws, value: Math.round(h * 10) / 10 };
  });
}

/* --------------------------------------------------------------------------- */
/* Heart-rate zones                                                             */
/* --------------------------------------------------------------------------- */

export interface HrMax {
  bpm: number;
  source: "observed" | "age";
}

/** Highest max HR seen in the last year (3+ sessions), else Tanaka 208 − 0.7 × age. */
export function hrMax(workouts: Workout[], profile: Pick<Profile, "birthYear">, today: DayKey): HrMax | undefined {
  const recent = workouts.filter((w) => w.maxHr && w.date >= addDays(today, -365));
  if (recent.length >= 3) return { bpm: Math.max(...recent.map((w) => w.maxHr!)), source: "observed" };
  if (profile.birthYear) {
    const age = Number(today.slice(0, 4)) - profile.birthYear;
    if (age > 10 && age < 100) return { bpm: Math.round(208 - 0.7 * age), source: "age" };
  }
  return undefined;
}

/** Five zones as % of HRmax: 50–60, 60–70, 70–80, 80–90, 90–100. */
export function hrZones(max: number): { zone: number; low: number; high: number }[] {
  return [0.5, 0.6, 0.7, 0.8, 0.9].map((p, i) => ({ zone: i + 1, low: Math.round(max * p), high: Math.round(max * (p + 0.1)) - (i < 4 ? 1 : 0) }));
}

/** Time in zones from device data; easy = Z1–2, hard = Z4–5. */
export function zoneDistribution(workouts: Workout[], from: DayKey, to: DayKey) {
  const sec = [0, 0, 0, 0, 0];
  let sessions = 0;
  for (const w of workouts) {
    if (w.date < from || w.date > to || !w.hrZonesSec) continue;
    sessions++;
    w.hrZonesSec.forEach((s, i) => (sec[i] += s));
  }
  const total = sec.reduce((a, b) => a + b, 0);
  return {
    sessions,
    minutes: sec.map((s) => Math.round(s / 60)),
    share: total ? sec.map((s) => s / total) : undefined,
    easyShare: total ? (sec[0] + sec[1]) / total : undefined,
    hardShare: total ? (sec[3] + sec[4]) / total : undefined,
  };
}

/* --------------------------------------------------------------------------- */
/* Personal records                                                             */
/* --------------------------------------------------------------------------- */

export interface Record_ {
  key: string;
  label: string;
  value: string;
  raw: number;
  date: DayKey;
}

const mmss = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

export function personalRecords(workouts: Workout[], imperial = false): Record_[] {
  const out: Record_[] = [];
  const runs = workouts.filter((w) => w.type === "run");
  const best = (label: string, key: "k1" | "mi" | "k5" | "k10") => {
    let b: Workout | undefined;
    for (const w of runs) {
      const v = w.bestSplitsSec?.[key];
      if (v && (!b || v < b.bestSplitsSec![key]!)) b = w;
    }
    if (b) out.push({ key, label, value: mmss(b.bestSplitsSec![key]!), raw: b.bestSplitsSec![key]!, date: b.date });
  };
  best("Fastest 1 km", "k1");
  best("Fastest mile", "mi");
  best("Fastest 5 km", "k5");
  best("Fastest 10 km", "k10");
  const longest = (type: ActivityType, label: string) => {
    const w = workouts.filter((x) => x.type === type && x.distanceKm).sort((a, b) => b.distanceKm! - a.distanceKm!)[0];
    if (w) {
      const d = imperial ? w.distanceKm! / 1.609344 : w.distanceKm!;
      out.push({ key: `longest-${type}`, label, value: `${d.toFixed(2)} ${imperial ? "mi" : "km"}`, raw: w.distanceKm!, date: w.date });
    }
  };
  longest("run", "Longest run");
  longest("cycle", "Longest ride");
  longest("swim", "Longest swim");
  const weeks = new Map<DayKey, number>();
  for (const w of workouts) weeks.set(weekStart(w.date), (weeks.get(weekStart(w.date)) ?? 0) + w.durationMin);
  const top = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) out.push({ key: "biggest-week", label: "Biggest training week", value: `${(top[1] / 60).toFixed(1)} h`, raw: top[1], date: top[0] });
  return out;
}

/* --------------------------------------------------------------------------- */
/* Sleep debt                                                                   */
/* --------------------------------------------------------------------------- */

/** Sum of shortfalls vs your own sleep need over the last N logged nights (surplus doesn't cancel debt). */
export function sleepDebt(data: DataSet, today: DayKey, nights = 7): { minutes: number; nights: number } {
  const recs = sleepInRange(data.sleep, addDays(today, -(nights - 1)), today);
  const minutes = recs.reduce((a, r) => a + Math.max(0, data.profile.sleepNeedMin - sleepAmount(r, data.profile.sleepLatencyMin).minutes), 0);
  return { minutes: Math.round(minutes), nights: recs.length };
}
