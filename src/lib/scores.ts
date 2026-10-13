import { addDays, clockOf, clockToMin, dayRange } from "./date";
import { type DataSet, metricBaseline, metricOn, sleepByDate, sleepInRange } from "./reports";
import { sleepAmount, timeInBedMin } from "./sleep";
import { clockMean, mean } from "./stats";
import type { DayKey, Provenance, Symptom } from "./types";

/**
 * Human OS scores — transparent, personal-baseline estimates.
 *
 * These are NOT WHOOP Recovery, NOT Garmin Body Battery and NOT medically
 * validated. Each score returns its components, weights, missing inputs and a
 * confidence level so the UI can show exactly how it was produced.
 * Full method: docs/SCORES.md.
 */

export type Confidence = "high" | "medium" | "low";

export interface Component {
  key: string;
  label: string;
  /** Human-readable input value, e.g. "7h 10m" or "52 ms (usual 45–55)". */
  input?: string;
  /** 0–100 sub-score; undefined when the input is missing. */
  points?: number;
  weight: number;
  source?: Provenance;
  note?: string;
}

export interface Score {
  status: "ok" | "insufficient";
  value?: number;
  band?: "high" | "mid" | "low";
  label?: string;
  confidence?: Confidence;
  components: Component[];
  /** Why the score is missing or capped. */
  notes: string[];
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;

function combine(components: Component[]): number | undefined {
  const used = components.filter((c) => c.points !== undefined);
  const w = used.reduce((a, c) => a + c.weight, 0);
  if (!w) return undefined;
  return Math.round(used.reduce((a, c) => a + c.points! * c.weight, 0) / w);
}
const usedWeight = (cs: Component[]) => cs.filter((c) => c.points !== undefined).reduce((a, c) => a + c.weight, 0);
const band = (v: number): Score["band"] => (v >= 67 ? "high" : v >= 34 ? "mid" : "low");
const circDiff = (a: number, b: number) => Math.abs(((((a - b + 720) % 1440) + 1440) % 1440) - 720);

/* ------------------------------------------------------------------------- */
/* Sleep score                                                                 */
/* ------------------------------------------------------------------------- */

export const SLEEP_WEIGHTS = { duration: 50, consistency: 25, efficiency: 15, quality: 10 };

export function sleepScore(data: DataSet, day: DayKey): Score {
  const { profile } = data;
  const tz = profile.timeZone;
  const night = sleepByDate(data.sleep).get(day);
  if (!night) return { status: "insufficient", components: [], notes: ["No sleep record for last night."] };

  const amt = sleepAmount(night, profile.sleepLatencyMin);
  const tib = timeInBedMin(night);
  const ratio = amt.minutes / profile.sleepNeedMin;
  const components: Component[] = [
    {
      key: "duration",
      label: "Duration vs your sleep need",
      input: `${fmtMin(amt.minutes)}${amt.kind === "estimated" ? " (estimated)" : ""} of ${fmtMin(profile.sleepNeedMin)}`,
      points: Math.round(clamp(((ratio - 0.6) / 0.4) * 100)),
      weight: SLEEP_WEIGHTS.duration,
      source: amt.kind === "measured" ? night.source : "calculated",
      note: "100 at or above your need; 0 at 60% of it.",
    },
  ];

  const prior = sleepInRange(data.sleep, addDays(day, -7), addDays(day, -1));
  if (prior.length >= 3) {
    const bed = clockToMin(clockOf(night.bedtime, tz));
    const wake = clockToMin(clockOf(night.wakeTime, tz));
    const avgBed = clockMean(prior.map((n) => clockToMin(clockOf(n.bedtime, tz))))!;
    const avgWake = clockMean(prior.map((n) => clockToMin(clockOf(n.wakeTime, tz))), 18 * 60)!;
    const dev = circDiff(bed, avgBed) + circDiff(wake, avgWake);
    components.push({
      key: "consistency",
      label: "Timing vs your last 7 nights",
      input: `${Math.round(dev)} min total shift (bed + wake)`,
      points: Math.round(clamp(100 - (dev / 120) * 100)),
      weight: SLEEP_WEIGHTS.consistency,
      source: "calculated",
      note: "100 when bed and wake times match your recent average; 0 at a 2-hour combined shift.",
    });
  } else components.push({ key: "consistency", label: "Timing vs your last 7 nights", weight: SLEEP_WEIGHTS.consistency, note: `Needs 3 prior nights (${prior.length} so far).` });

  if (night.asleepMin !== undefined && tib > 0) {
    const eff = night.asleepMin / tib;
    components.push({
      key: "efficiency",
      label: "Sleep efficiency",
      input: `${Math.round(eff * 100)}% of time in bed asleep`,
      points: Math.round(clamp(((eff - 0.7) / 0.2) * 100)),
      weight: SLEEP_WEIGHTS.efficiency,
      source: night.source,
      note: "100 at 90%+; 0 at 70%.",
    });
  } else components.push({ key: "efficiency", label: "Sleep efficiency", weight: SLEEP_WEIGHTS.efficiency, note: "Needs measured time asleep." });

  if (night.quality !== undefined)
    components.push({ key: "quality", label: "How you rated your sleep", input: `${night.quality}/5`, points: Math.round(((night.quality - 1) / 4) * 100), weight: SLEEP_WEIGHTS.quality, source: "manual" });
  else components.push({ key: "quality", label: "How you rated your sleep", weight: SLEEP_WEIGHTS.quality, note: "Not rated." });

  const value = combine(components)!;
  const used = components.filter((c) => c.points !== undefined).length;
  let confidence: Confidence = used === 4 ? "high" : used >= 3 ? "medium" : "low";
  if (amt.kind === "estimated" && confidence !== "low") confidence = confidence === "high" ? "medium" : "low";
  const notes = ["Sleep-stage estimates are not used — consumer wearables measure stages imprecisely."];
  return { status: "ok", value, band: band(value), label: value >= 80 ? "Good" : value >= 60 ? "Fair" : "Poor", confidence, components, notes };
}

/* ------------------------------------------------------------------------- */
/* Recovery score                                                              */
/* ------------------------------------------------------------------------- */

export const RECOVERY_WEIGHTS = { hrv: 30, rhr: 25, sleep: 20, load: 10, fatigue: 10, respiration: 5 };
const MIN_SD = { hrv: 3, rhr: 1.5, respiration: 0.5 };
export const CONCERNING: Symptom[] = ["illness", "fever", "chestPain", "dizziness", "unusualFatigue"];

/** Training load of one day: minutes × effort (RPE, default 5). */
export function dayLoad(data: DataSet, day: DayKey) {
  return data.workouts.filter((w) => w.date === day).reduce((a, w) => a + w.durationMin * (w.rpe ?? 5), 0);
}

function loadComponent(data: DataSet, day: DayKey): Component {
  const base: Component = { key: "load", label: "Recent training load", weight: RECOVERY_WEIGHTS.load };
  const window = dayRange(addDays(day, -30), addDays(day, -3));
  const sessionLoads = window.map((d) => dayLoad(data, d)).filter((l) => l > 0);
  if (sessionLoads.length < 3) return { ...base, note: `Needs 3 logged sessions in the past month (${sessionLoads.length}).` };
  const typical = mean(sessionLoads)!;
  const acute = dayLoad(data, addDays(day, -1)) + 0.5 * dayLoad(data, addDays(day, -2));
  const ratio = acute / typical;
  return {
    ...base,
    input: acute === 0 ? "No training in the last 2 days" : `${ratio.toFixed(1)}× your typical session`,
    points: Math.round(clamp(100 - ((ratio - 1) / 1) * 80, 20, 100)),
    source: "calculated",
    note: "Load = minutes × effort. 100 when the last two days were at or below a typical session; 20 at twice it.",
  };
}

function autonomic(data: DataSet, day: DayKey, key: "hrv" | "rhr" | "respiration", label: string, unit: string, higherBetter: boolean, weight: number): Component {
  const p = metricOn(data.metrics, key, day);
  const b = metricBaseline(data.metrics, key, day);
  if (!p) return { key, label, weight, note: "No value today." };
  if (b.status !== "ok") return { key, label, weight, input: `${p.value} ${unit}`, source: p.source, note: `Baseline needs ${b.required} days (${b.n} so far).` };
  const z = (p.value - b.mean!) / Math.max(b.sd ?? 0, MIN_SD[key]);
  const pts = clamp(65 + (higherBetter ? z : -z) * 20);
  return {
    key,
    label,
    input: `${p.value} ${unit} (usual ${Math.round(b.low!)}–${Math.round(b.high!)})`,
    points: Math.round(key === "respiration" ? Math.min(pts, 80) : pts),
    weight,
    source: p.source,
    note: "65 at your 28-day average; ±20 per standard deviation.",
  };
}

export function recoveryScore(data: DataSet, day: DayKey, sleep = sleepScore(data, day)): Score {
  const ck = data.checkins.find((c) => c.date === day);
  const components: Component[] = [
    autonomic(data, day, "hrv", "HRV vs your baseline", "ms", true, RECOVERY_WEIGHTS.hrv),
    autonomic(data, day, "rhr", "Resting HR vs your baseline", "bpm", false, RECOVERY_WEIGHTS.rhr),
    sleep.status === "ok"
      ? { key: "sleep", label: "Sleep score", input: `${sleep.value}/100`, points: sleep.value, weight: RECOVERY_WEIGHTS.sleep, source: "calculated" }
      : { key: "sleep", label: "Sleep score", weight: RECOVERY_WEIGHTS.sleep, note: "No sleep score." },
    loadComponent(data, day),
    ck?.fatigue !== undefined
      ? { key: "fatigue", label: "Physical tiredness (you)", input: `${ck.fatigue}/10`, points: Math.round(((10 - ck.fatigue) / 9) * 100), weight: RECOVERY_WEIGHTS.fatigue, source: "manual" }
      : { key: "fatigue", label: "Physical tiredness (you)", weight: RECOVERY_WEIGHTS.fatigue, note: "No check-in." },
    autonomic(data, day, "respiration", "Breathing rate vs baseline", "br/min", false, RECOVERY_WEIGHTS.respiration),
  ];
  const notes = [
    "Garmin stress and Body Battery are excluded here: both are derived from heart-rate variability, so including them would double-count HRV.",
  ];
  const hasAutonomic = components.some((c) => (c.key === "hrv" || c.key === "rhr") && c.points !== undefined);
  if (!hasAutonomic || usedWeight(components) < 50) {
    return {
      status: "insufficient",
      components,
      notes: ["Not enough data to calculate a reliable score. It needs HRV or resting heart rate with at least 7 days of history, plus sleep or a check-in.", ...notes],
    };
  }
  let value = combine(components)!;
  const concerning = (ck?.symptoms ?? []).filter((s) => CONCERNING.includes(s));
  if (ck?.unwell || concerning.length) {
    value = Math.min(value, 33);
    notes.unshift("Capped at 33% because you reported feeling unwell — how you feel outranks a favourable wearable reading.");
  }
  const hrvOk = components.find((c) => c.key === "hrv")?.points !== undefined;
  const rhrOk = components.find((c) => c.key === "rhr")?.points !== undefined;
  const longBaseline = metricBaseline(data.metrics, hrvOk ? "hrv" : "rhr", day).n >= 14;
  const confidence: Confidence = hrvOk && rhrOk && sleep.status === "ok" && longBaseline ? "high" : sleep.status === "ok" || ck ? "medium" : "low";
  return { status: "ok", value, band: band(value), label: value >= 67 ? "Recovered" : value >= 34 ? "Moderate" : "Low", confidence, components, notes };
}

/* ------------------------------------------------------------------------- */
/* Energy                                                                      */
/* ------------------------------------------------------------------------- */

export interface BodyBatteryReading {
  value: number;
  source: Provenance;
  change?: number;
}

/** The official device value, untouched. Daily values only (no intraday curve without the live API). */
export function bodyBattery(data: DataSet, day: DayKey): BodyBatteryReading | undefined {
  const p = metricOn(data.metrics, "bodyBattery", day);
  if (!p) return undefined;
  const y = metricOn(data.metrics, "bodyBattery", addDays(day, -1));
  return { value: p.value, source: p.source, change: y ? p.value - y.value : undefined };
}

export const ENERGY_WEIGHTS = {
  withBodyBattery: { bodyBattery: 40, sleep: 30, subjective: 30 },
  withoutBodyBattery: { sleep: 35, subjective: 35, load: 15, stress: 15 },
};

export function energyScore(data: DataSet, day: DayKey, sleep = sleepScore(data, day)): Score {
  const ck = data.checkins.find((c) => c.date === day);
  const bb = bodyBattery(data, day);
  const sub: Component =
    ck?.energy !== undefined
      ? { key: "subjective", label: "How energetic you feel", input: `${ck.energy}/10`, points: Math.round(((ck.energy - 1) / 9) * 100), weight: 0, source: "manual" }
      : { key: "subjective", label: "How energetic you feel", weight: 0, note: "No check-in." };
  const sl: Component =
    sleep.status === "ok"
      ? { key: "sleep", label: "Sleep score", input: `${sleep.value}/100`, points: sleep.value, weight: 0, source: "calculated" }
      : { key: "sleep", label: "Sleep score", weight: 0, note: "No sleep score." };
  let components: Component[];
  const notes: string[] = [];
  if (bb) {
    const w = ENERGY_WEIGHTS.withBodyBattery;
    components = [
      { key: "bodyBattery", label: "Garmin Body Battery", input: `${bb.value}/100`, points: bb.value, weight: w.bodyBattery, source: bb.source },
      { ...sl, weight: w.sleep },
      { ...sub, weight: w.subjective },
    ];
    notes.push("Body Battery already reflects HRV, stress and activity, so those aren't added again.");
  } else {
    const w = ENERGY_WEIGHTS.withoutBodyBattery;
    const stress = metricOn(data.metrics, "stress", day);
    const load = loadComponent(data, day);
    components = [
      { ...sl, weight: w.sleep },
      { ...sub, weight: w.subjective },
      { ...load, weight: w.load },
      stress
        ? { key: "stress", label: "Device stress (inverted)", input: `${stress.value}/100`, points: 100 - stress.value, weight: w.stress, source: stress.source }
        : { key: "stress", label: "Device stress (inverted)", weight: w.stress, note: "No stress value." },
    ];
    notes.push("No Body Battery today, so sleep, how you feel, training load and device stress are used instead.");
  }
  if ((!bb && ck?.energy === undefined) || usedWeight(components) < 60) {
    return { status: "insufficient", components, notes: ["Not enough data to calculate a reliable score. Add a morning check-in or Body Battery plus a sleep record.", ...notes] };
  }
  const value = combine(components)!;
  const missing = components.filter((c) => c.points === undefined).length;
  notes.push("An estimate of how charged you are likely to feel — not a measurement of energy available to your body.");
  return {
    status: "ok",
    value,
    band: band(value),
    label: value >= 67 ? "Good" : value >= 34 ? "Moderate" : "Low",
    confidence: missing === 0 ? "high" : missing === 1 ? "medium" : "low",
    components,
    notes,
  };
}

/* ------------------------------------------------------------------------- */
/* Readiness                                                                   */
/* ------------------------------------------------------------------------- */

export type ReadinessLevel = "ready" | "moderate" | "recovery" | "insufficient";

export interface Readiness {
  level: ReadinessLevel;
  title: string;
  text: string;
  reasons: string[];
  safety?: string;
  /** True when symptoms forced the outcome. */
  symptomDriven: boolean;
}

const RED: Symptom[] = ["chestPain", "dizziness"];
const ILL: Symptom[] = ["illness", "fever"];

export const READINESS_COPY: Record<ReadinessLevel, { title: string; text: string }> = {
  ready: { title: "Ready", text: "Normal planned activity may be appropriate." },
  moderate: { title: "Moderate", text: "Follow your planned routine, but avoid unnecessary increases in training intensity." },
  recovery: { title: "Recovery focus", text: "Consider gentle movement, rest and a protected bedtime." },
  insufficient: { title: "Insufficient data", text: "Go by how you feel and general training principles: start gently and build only if you feel good." },
};

export function readiness(data: DataSet, day: DayKey, s = { sleep: sleepScore(data, day) }, recovery = recoveryScore(data, day, s.sleep)): Readiness {
  const ck = data.checkins.find((c) => c.date === day);
  const symptoms = ck?.symptoms ?? [];
  const mk = (level: ReadinessLevel, reasons: string[], extra: Partial<Readiness> = {}): Readiness => ({ level, ...READINESS_COPY[level], reasons, symptomDriven: false, ...extra });

  if (symptoms.some((x) => RED.includes(x)))
    return mk("recovery", ["you reported chest pain or dizziness"], {
      symptomDriven: true,
      text: "Skip training today.",
      safety: "Chest pain or dizziness should be checked by a medical professional — seek urgent care if it is severe, sudden or getting worse.",
    });
  if (ck?.unwell || symptoms.some((x) => ILL.includes(x)))
    return mk("recovery", ["you reported feeling unwell"], {
      symptomDriven: true,
      safety: "You reported feeling unwell. Rest and hydrate; consider a professional opinion if it persists or worsens.",
    });

  const lows: string[] = [];
  if (recovery.status === "ok" && recovery.value! < 34) lows.push("low recovery score");
  if (s.sleep.status === "ok" && s.sleep.value! < 50) lows.push("poor sleep score");
  if (ck?.fatigue !== undefined && ck.fatigue >= 7) lows.push("you feel physically tired");
  if (ck?.energy !== undefined && ck.energy <= 3) lows.push("you feel low on energy");
  if (symptoms.includes("injury")) lows.push("you reported an injury");
  if (symptoms.includes("unusualFatigue")) lows.push("unusual fatigue");
  const yesterday = addDays(day, -1);
  if (data.workouts.some((w) => w.date === yesterday && ((w.rpe ?? 0) >= 8 || w.durationMin >= 90))) lows.push("a hard session yesterday");

  const sources = [recovery.status === "ok", s.sleep.status === "ok", ck !== undefined && (ck.energy !== undefined || ck.fatigue !== undefined)].filter(Boolean).length;
  if (sources === 0) return mk("insufficient", ["no recovery, sleep or check-in data today"]);
  if (lows.length >= 2) return mk("recovery", lows);
  if (lows.length === 1) return mk("moderate", lows);
  if (sources >= 2) return mk("ready", ["no combined signs of under-recovery"]);
  return mk("insufficient", ["only one source of information today"]);
}

/* ------------------------------------------------------------------------- */
/* All together + history                                                      */
/* ------------------------------------------------------------------------- */

export interface DayScores {
  date: DayKey;
  sleep: Score;
  recovery: Score;
  energy: Score;
  readiness: Readiness;
  bodyBattery?: BodyBatteryReading;
  /** The device's own sleep score, shown separately from ours. */
  deviceSleepScore?: { value: number; source: Provenance };
}

export function scoresFor(data: DataSet, day: DayKey): DayScores {
  const sleep = sleepScore(data, day);
  const recovery = recoveryScore(data, day, sleep);
  const night = sleepByDate(data.sleep).get(day);
  return {
    date: day,
    sleep,
    recovery,
    energy: energyScore(data, day, sleep),
    readiness: readiness(data, day, { sleep }, recovery),
    bodyBattery: bodyBattery(data, day),
    deviceSleepScore: night?.score !== undefined ? { value: night.score, source: night.source } : undefined,
  };
}

export interface ScorePoint {
  date: DayKey;
  sleep?: number;
  recovery?: number;
  energy?: number;
  bodyBattery?: number;
}

export function scoreHistory(data: DataSet, from: DayKey, to: DayKey): ScorePoint[] {
  return dayRange(from, to).map((d) => {
    const s = scoresFor(data, d);
    return { date: d, sleep: s.sleep.value, recovery: s.recovery.value, energy: s.energy.value, bodyBattery: s.bodyBattery?.value };
  });
}

export interface ScoreTrend {
  /** Average of the previous 7 days (excluding today). */
  week?: number;
  /** 28-day personal baseline of this score (≥7 values). */
  baseline?: number;
  baselineN: number;
  direction?: "up" | "down" | "flat";
}

export function trendOf(history: ScorePoint[], key: keyof Omit<ScorePoint, "date">, current?: number): ScoreTrend {
  const prior = history.slice(0, -1);
  const vals = (xs: ScorePoint[]) => xs.flatMap((p) => (p[key] === undefined ? [] : [p[key]!]));
  const week = mean(vals(prior.slice(-7)));
  const all = vals(prior.slice(-28));
  const baseline = all.length >= 7 ? mean(all) : undefined;
  const direction = current === undefined || week === undefined ? undefined : current - week > 5 ? "up" : week - current > 5 ? "down" : "flat";
  return { week, baseline, baselineN: all.length, direction };
}
