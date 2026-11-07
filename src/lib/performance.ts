import { addDays, daysBetween } from "./date";
import { metricSeries } from "./reports";
import { mean, sd } from "./stats";
import type { DailyMetric, DayKey, Workout } from "./types";

/**
 * Performance science used by Human OS. Every method here is a published,
 * widely used approach; sources are listed in src/lib/evidence.ts and shown in
 * the app (Profile → Methods & evidence). Outputs are estimates.
 */

/* --------------------------------------------------------------------------- */
/* Running: VDOT (Daniels & Gilbert), race prediction, training paces           */
/* --------------------------------------------------------------------------- */

/** Oxygen cost (ml/kg/min) of running at v metres/min. */
const vo2Cost = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/** Fraction of VO2max sustainable for t minutes. */
const fracMax = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

/** VDOT from a race-effort performance (distance m, time s). */
export function vdot(distanceM: number, timeSec: number): number {
  const t = timeSec / 60;
  const v = distanceM / t;
  return vo2Cost(v) / fracMax(t);
}

/** Predicted time (s) for a distance at a given VDOT (solved numerically). */
export function predictTime(vdotValue: number, distanceM: number): number {
  let lo = distanceM / 600; // seconds at absurdly fast pace
  let hi = distanceM / 1.2; // walking
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distanceM, mid) > vdotValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Speed (m/min) at which the oxygen cost equals `vo2`. */
const speedForVo2 = (vo2: number) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (vo2 + 4.6))) / (2 * 0.000104);

export interface Pace {
  key: "E" | "M" | "T" | "I" | "R";
  label: string;
  purpose: string;
  /** Seconds per km (range for easy). */
  secPerKm: [number, number];
}

/** Daniels-style training intensities as fractions of VDOT. */
export function trainingPaces(v: number): Pace[] {
  const p = (lo: number, hi: number): [number, number] => [60000 / speedForVo2(v * hi), 60000 / speedForVo2(v * lo)];
  return [
    { key: "E", label: "Easy", purpose: "Most of your running: aerobic base, recovery", secPerKm: p(0.62, 0.74) },
    { key: "M", label: "Marathon", purpose: "Goal marathon effort; steady long-run segments", secPerKm: p(0.78, 0.82) },
    { key: "T", label: "Threshold", purpose: "“Comfortably hard” 20–60 min; tempo and cruise intervals", secPerKm: p(0.86, 0.89) },
    { key: "I", label: "Interval", purpose: "3–5 min repeats near VO2max", secPerKm: p(0.96, 1.0) },
    { key: "R", label: "Repetition", purpose: "Short, fast reps for speed and economy", secPerKm: p(1.04, 1.08) },
  ];
}

export interface VdotEstimate {
  vdot: number;
  from: { label: string; date: DayKey; timeSec: number; distanceM: number };
}

/**
 * Best VDOT from fastest 5 km / 10 km efforts in the last `days` days.
 * Splits from training runs underestimate race fitness, so this is a floor.
 */
export function bestVdot(workouts: Workout[], today: DayKey, days = 180): VdotEstimate | undefined {
  let best: VdotEstimate | undefined;
  for (const w of workouts) {
    if (w.type !== "run" || !w.bestSplitsSec || daysBetween(w.date, today) > days) continue;
    for (const [k, m, label] of [["k5", 5000, "5 km"], ["k10", 10000, "10 km"]] as const) {
      const t = w.bestSplitsSec[k];
      if (!t) continue;
      const v = vdot(m, t);
      if (v > 20 && v < 90 && (!best || v > best.vdot)) best = { vdot: v, from: { label, date: w.date, timeSec: t, distanceM: m } };
    }
  }
  return best && { ...best, vdot: Math.round(best.vdot * 10) / 10 };
}

export const RACES = [
  { label: "5 km", m: 5000 },
  { label: "10 km", m: 10000 },
  { label: "Half marathon", m: 21097.5 },
  { label: "Marathon", m: 42195 },
];

/* --------------------------------------------------------------------------- */
/* Heart-rate zones: %HRmax, Karvonen (heart-rate reserve), Friel (LTHR)        */
/* --------------------------------------------------------------------------- */

export type ZoneMethod = "hrmax" | "hrr" | "lthr";

export interface Zone {
  zone: number;
  name: string;
  low: number;
  high: number;
}

const NAMES = ["Recovery", "Aerobic", "Tempo", "Threshold", "VO2max"];

export function zonesFor(method: ZoneMethod, opts: { max?: number; rest?: number; lthr?: number }): Zone[] | undefined {
  const { max, rest, lthr } = opts;
  if (method === "lthr") {
    if (!lthr) return undefined;
    const b = [0, 0.85, 0.9, 0.95, 1.0, 1.06];
    return NAMES.map((name, i) => ({ zone: i + 1, name, low: Math.round(lthr * b[i]) || 0, high: i === 4 ? (max ?? Math.round(lthr * 1.06)) : Math.round(lthr * b[i + 1]) - 1 }));
  }
  if (!max) return undefined;
  if (method === "hrr") {
    if (!rest) return undefined;
    const r = max - rest;
    return NAMES.map((name, i) => ({ zone: i + 1, name, low: Math.round(rest + r * (0.5 + i * 0.1)), high: i === 4 ? max : Math.round(rest + r * (0.6 + i * 0.1)) - 1 }));
  }
  return NAMES.map((name, i) => ({ zone: i + 1, name, low: Math.round(max * (0.5 + i * 0.1)), high: i === 4 ? max : Math.round(max * (0.6 + i * 0.1)) - 1 }));
}

/* --------------------------------------------------------------------------- */
/* HRV trend (Plews / Kiviniemi / Altini approach)                              */
/* --------------------------------------------------------------------------- */

export interface HrvTrend {
  status: "ok" | "insufficient";
  /** 7-day rolling mean of ln(HRV), back-transformed to ms for display. */
  rolling7?: number;
  /** Normal range from the last 60 days of daily ln(HRV): mean ± 0.5 SD (ms). */
  normalLow?: number;
  normalHigh?: number;
  baseline?: number;
  /** Day-to-day variation of the last 7 days (coefficient of variation of ln HRV, %). */
  cv?: number;
  band?: "below" | "within" | "above";
  days: number;
  /** Nights with HRV in the last 7 days. */
  recentNights: number;
  series: { date: DayKey; daily?: number; rolling?: number }[];
}

export function hrvTrend(metrics: DailyMetric[], today: DayKey): HrvTrend {
  const pts = metricSeries(metrics, "hrv", addDays(today, -89), today);
  const byDate = new Map(pts.map((p) => [p.date, Math.log(p.value)]));
  const series: HrvTrend["series"] = [];
  for (let i = 59; i >= 0; i--) {
    const d = addDays(today, -i);
    const win = [...Array(7)].map((_, k) => byDate.get(addDays(d, -k))).filter((x): x is number => x !== undefined);
    series.push({ date: d, daily: byDate.has(d) ? Math.round(Math.exp(byDate.get(d)!)) : undefined, rolling: win.length >= 4 ? Math.round(Math.exp(mean(win)!)) : undefined });
  }
  const last60 = pts.filter((p) => p.date > addDays(today, -60)).map((p) => Math.log(p.value));
  const last7 = pts.filter((p) => p.date > addDays(today, -7)).map((p) => Math.log(p.value));
  if (last60.length < 21 || last7.length < 4) return { status: "insufficient", days: last60.length, recentNights: last7.length, series };
  const m = mean(last60)!;
  const s = sd(last60)!;
  const r = mean(last7)!;
  const band = r < m - 0.5 * s ? "below" : r > m + 0.5 * s ? "above" : "within";
  const cv = (sd(last7)! / mean(last7)!) * 100;
  return {
    status: "ok",
    rolling7: Math.round(Math.exp(r)),
    normalLow: Math.round(Math.exp(m - 0.5 * s)),
    normalHigh: Math.round(Math.exp(m + 0.5 * s)),
    baseline: Math.round(Math.exp(m)),
    cv: Math.round(cv * 10) / 10,
    band,
    days: last60.length,
    recentNights: last7.length,
    series,
  };
}

/* --------------------------------------------------------------------------- */
/* Fuel: protein & carbohydrate targets (ISSN / ACSM position stands)           */
/* --------------------------------------------------------------------------- */

export interface FuelTargets {
  proteinG: [number, number];
  carbsG: [number, number];
  carbBand: "light" | "moderate" | "high" | "very high";
  fluidMl: number;
}

/**
 * Daily guidance scaled by body weight and training time. Ranges, not rules;
 * never a calorie restriction. Carbs: 3–5 g/kg light, 5–7 moderate (~1 h/day),
 * 6–10 high (1–3 h), 8–12 very high (>4 h). Protein 1.4–2.0 g/kg.
 */
export function fuelTargets(weightKg: number, trainingMin: number): FuelTargets {
  const band = trainingMin >= 240 ? "very high" : trainingMin >= 75 ? "high" : trainingMin >= 40 ? "moderate" : "light";
  const c: Record<FuelTargets["carbBand"], [number, number]> = { light: [3, 5], moderate: [5, 7], high: [6, 10], "very high": [8, 12] };
  return {
    proteinG: [Math.round(weightKg * 1.4), Math.round(weightKg * 2.0)],
    carbsG: [Math.round(weightKg * c[band][0]), Math.round(weightKg * c[band][1])],
    carbBand: band,
    fluidMl: Math.round((weightKg * 35 + trainingMin * 8) / 50) * 50,
  };
}

/* --------------------------------------------------------------------------- */
/* Season periodization (Bompa / Friel; taper per Bosquet 2007 meta-analysis)   */
/* --------------------------------------------------------------------------- */

export interface GoalRace {
  name: string;
  date: DayKey;
  distanceKm?: number;
}

export type Phase = "base" | "build" | "peak" | "taper" | "race" | "recovery";

export const MAX_RAMP = 1.5;

export interface SeasonWeek {
  weekStart: DayKey;
  phase: Phase;
  /** Multiplier of current weekly load (1 = today's typical week). */
  loadFactor: number;
  deload: boolean;
}

export const PHASE_INFO: Record<Phase, { label: string; focus: string }> = {
  base: { label: "Base", focus: "Mostly easy aerobic volume, technique and strength. Build consistency." },
  build: { label: "Build", focus: "Add race-specific work: threshold and intervals, while long sessions grow." },
  peak: { label: "Peak", focus: "Most specific sessions at goal intensity; volume holds steady." },
  taper: { label: "Taper", focus: "Cut volume ~40–60%, keep some intensity, sleep more. Freshness rises." },
  race: { label: "Race week", focus: "Short sharp sessions, rest, fuel and logistics." },
  recovery: { label: "Recovery", focus: "Easy movement only after the race." },
};

/**
 * Plan weeks from today to the race: last week = race, 2 weeks taper,
 * 3 weeks peak, then build (≈40% of the rest) and base. Every 4th loading
 * week is a deload (~−30%). Load grows ≈5%/week in base/build, capped at
 * +50% over today's typical week so a long season never ramps recklessly.
 */
export function seasonPlan(goal: GoalRace, today: DayKey): SeasonWeek[] {
  const monday = (d: DayKey) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return addDays(d, wd === 0 ? -6 : 1 - wd);
  };
  const start = monday(today);
  const raceWeek = monday(goal.date);
  const n = Math.max(1, Math.round(daysBetween(start, raceWeek) / 7) + 1);
  const phases: Phase[] = [];
  const pre = Math.max(0, n - 1 - 2 - 3);
  const build = Math.round(pre * 0.4);
  for (let i = 0; i < pre - build; i++) phases.push("base");
  for (let i = 0; i < build; i++) phases.push("build");
  for (let i = 0; i < Math.min(3, Math.max(0, n - 1 - 2)); i++) phases.push("peak");
  for (let i = 0; i < Math.min(2, Math.max(0, n - 1)); i++) phases.push("taper");
  phases.push("race");
  let factor = 1;
  let loading = 0;
  return phases.slice(-n).map((phase, i) => {
    let deload = false;
    if (phase === "base" || phase === "build") {
      loading++;
      if (loading % 4 === 0) deload = true;
      else factor = Math.min(MAX_RAMP, factor * 1.05);
    }
    const lf = phase === "peak" ? factor : phase === "taper" ? factor * (i === n - 2 ? 0.5 : 0.65) : phase === "race" ? factor * 0.35 : deload ? factor * 0.7 : factor;
    return { weekStart: addDays(start, i * 7), phase, loadFactor: Math.round(lf * 100) / 100, deload };
  });
}
