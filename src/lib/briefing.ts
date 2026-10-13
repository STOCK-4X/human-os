import { addDays, clockToMin, formatDuration } from "./date";
import {
  type DataSet,
  lastCaffeineClock,
  metricBaseline,
  metricOn,
  openHabitsToday,
  sleepByDate,
  sleepBaseline,
} from "./reports";
import { planSleep, sleepAmount } from "./sleep";
import { readiness } from "./scores";
import { deviation } from "./stats";
import type { DayKey } from "./types";

/**
 * Deterministic daily interpretation. This is "calculated" output, not AI:
 * every statement is traceable to a stored value and a simple rule, and every
 * rule degrades to an honest "not enough data" message.
 */

export type Intensity = "rest" | "recovery" | "easy" | "as-planned";

export interface TrainingAdvice {
  intensity: Intensity;
  headline: string;
  reasons: string[];
  /** True when there was no personal data, so advice is general. */
  general: boolean;
}

export interface Briefing {
  going_well: string[];
  attention: string[];
  focus: string;
  small_action: string;
  training: TrainingAdvice;
  bedtime: { windDownStart: string; lightsOut: string; wake: string };
  safety?: string;
  dataNotes: string[];
}

export function buildBriefing(data: DataSet, today: DayKey): Briefing {
  const { profile } = data;
  const going_well: string[] = [];
  const attention: string[] = [];
  const dataNotes: string[] = [];

  const checkin = data.checkins.find((c) => c.date === today);
  const symptoms = checkin?.symptoms ?? [];

  // --- Sleep -------------------------------------------------------------
  const night = sleepByDate(data.sleep).get(today);
  if (night) {
    const amt = sleepAmount(night, profile.sleepLatencyMin);
    const dur = `${amt.kind === "estimated" ? "an estimated " : ""}${formatDuration(amt.minutes)}`;
    const gap = amt.minutes - profile.sleepNeedMin;
    if (gap >= -20) going_well.push(`You got ${dur} of sleep — close to your goal.`);
    else if (gap < -60) {
      attention.push(`Sleep was ${dur}, about ${formatDuration(-gap)} below your goal.`);
    } else attention.push(`Sleep was a little short (${formatDuration(amt.minutes)}).`);
    const sb = sleepBaseline(data.sleep, today, profile.sleepLatencyMin);
    if (sb.status === "insufficient") dataNotes.push(`Sleep baseline needs ${sb.required} nights (${sb.n} so far).`);
  } else {
    dataNotes.push("No sleep record for last night yet.");
  }

  // --- Recovery metrics vs personal baseline --------------------------------
  const rhr = metricOn(data.metrics, "rhr", today);
  if (rhr) {
    const b = metricBaseline(data.metrics, "rhr", today);
    const dv = deviation(rhr.value, b, 3);
    if (dv === "above") {
      attention.push(
        `Resting heart rate (${rhr.value} bpm) is above your recent range. Consider how you slept, recent hard training, and whether you feel unwell.`,
      );
    } else if (dv === "within" || dv === "below") going_well.push("Resting heart rate is within or below your usual range.");
    else dataNotes.push(`Resting HR baseline needs ${b.required} days (${b.n} so far).`);
  }
  const hrv = metricOn(data.metrics, "hrv", today);
  if (hrv) {
    const b = metricBaseline(data.metrics, "hrv", today);
    const dv = deviation(hrv.value, b, 4);
    if (dv === "below") {
      attention.push(`Overnight HRV (${hrv.value} ms) is below your recent range. One low reading is common and not a problem on its own.`);
    } else if (dv === "within" || dv === "above") going_well.push("HRV is within your usual range.");
    else dataNotes.push(`HRV baseline needs ${b.required} days (${b.n} so far).`);
  }
  const bb = metricOn(data.metrics, "bodyBattery", today);
  if (bb && bb.value < 30) attention.push(`Body Battery is low (${bb.value}). Treat it as one hint among several, not a verdict.`);

  // --- How you feel ------------------------------------------------------------
  if (checkin) {
    if (checkin.fatigue !== undefined && checkin.fatigue >= 7) attention.push("You're feeling physically tired today.");
    if (checkin.energy !== undefined && checkin.energy >= 7) going_well.push("You're reporting good energy.");
    if (checkin.energy !== undefined && checkin.energy <= 3) attention.push("You're feeling low on energy.");
  } else {
    dataNotes.push("No morning check-in yet — how you feel matters as much as any metric.");
  }

  // --- Recent training ------------------------------------------------------------
  const weekWorkouts = data.workouts.filter((w) => w.date > addDays(today, -7) && w.date <= today).length;
  if (weekWorkouts >= 2) going_well.push(`${weekWorkouts} sessions in the last 7 days — good consistency.`);

  // --- Training advice: always derived from Readiness so every screen agrees ---
  const r = readiness(data, today);
  const safety = r.safety;
  const intensity: Intensity =
    r.level === "recovery" ? (r.symptomDriven ? "rest" : "recovery") : r.level === "moderate" ? "easy" : "as-planned";
  const training: TrainingAdvice = {
    intensity,
    headline:
      r.level === "ready"
        ? "Good to train as planned"
        : r.level === "moderate"
          ? "Keep to your plan — no extra intensity"
          : r.level === "recovery"
            ? r.symptomDriven
              ? "Rest today"
              : "Recovery day: walk, mobility or easy movement"
            : "Follow your plan, starting gently",
    reasons:
      r.level === "insufficient"
        ? ["Not enough personal data — this is general guidance. A check-in or sleep record will personalise it."]
        : r.reasons,
    general: r.level === "insufficient",
  };
  if (symptoms.includes("injury") && intensity !== "rest") training.headline = "Protect the injury — gentle movement that doesn't hurt";

  // --- Focus & one small action --------------------------------------------------
  const plan = planSleep(profile.targetWake, profile.sleepNeedMin, profile.sleepLatencyMin, profile.windDownMin);
  const caffeine = lastCaffeineClock(data.lifestyle, today, profile.timeZone);
  const open = openHabitsToday(data, today);
  let focus: string;
  let small_action: string;
  if (training.intensity === "rest" || training.intensity === "recovery") {
    focus = "Recovery: an easy day and a protected bedtime.";
    small_action = `Start winding down at ${plan.windDownStart} tonight.`;
  } else if (night && sleepAmount(night, profile.sleepLatencyMin).minutes < profile.sleepNeedMin - 60) {
    focus = "Get through the day steadily and get to bed on time.";
    small_action = `Get 10 minutes of outdoor light this morning and keep caffeine before ${profile.caffeineCutoff}.`;
  } else if (open.length) {
    focus = "Keep your routines moving.";
    small_action = `Do the smallest version of “${open[0].name}”${open[0].minimumVersion ? ` — ${open[0].minimumVersion}` : ""}.`;
  } else {
    focus = "Consistency over intensity.";
    small_action = "Take a 10-minute walk outside after a meal.";
  }
  if (caffeine && clockToMin(caffeine) > clockToMin(profile.caffeineCutoff)) {
    attention.push(`Last caffeine at ${caffeine}, after your ${profile.caffeineCutoff} cut-off.`);
  }

  return {
    going_well,
    attention,
    focus,
    small_action,
    training,
    bedtime: { windDownStart: plan.windDownStart, lightsOut: plan.lightsOut, wake: plan.wake },
    safety,
    dataNotes,
  };
}
