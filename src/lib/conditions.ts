import { addDays, daysBetween } from "./date";
import { dailyLoads, loadFlag } from "./analytics";
import type { Condition, DayKey, Workout } from "./types";

/**
 * Injury & illness log. Follows the IOC consensus view that load spikes and
 * illness are linked to training load (Soligard 2016; Schwellnus 2016), and
 * common return-to-training practice: no hard training while ill, graded
 * return afterwards, pain-guided progression for injuries.
 * Not medical advice — persistent or severe problems need a clinician.
 */

export const isActive = (c: Condition, day: DayKey) => c.start <= day && (!c.end || c.end >= day);

export function activeConditions(all: Condition[], day: DayKey) {
  return all.filter((c) => isActive(c, day));
}

export interface ConditionStats {
  count: number;
  daysAffected: number;
  /** Load ratio in the week before each onset (if enough history). */
  onsetRatios: { id?: number; label: string; ratio?: number }[];
}

export function conditionStats(all: Condition[], workouts: Workout[], today: DayKey, sinceDays = 365): ConditionStats {
  const since = addDays(today, -sinceDays);
  const list = all.filter((c) => (c.end ?? today) >= since);
  return {
    count: list.length,
    daysAffected: list.reduce((a, c) => a + daysBetween(c.start < since ? since : c.start, c.end ?? today) + 1, 0),
    onsetRatios: list.map((c) => ({ id: c.id, label: c.label, ratio: loadFlag(workouts, addDays(c.start, -1)).ratio })),
  };
}

export interface ReturnStep {
  label: string;
  detail: string;
}

/** Graded return protocol. Move to the next step only when the current one causes no symptoms. */
export function returnProtocol(c: Condition, daysOff: number): ReturnStep[] {
  if (c.kind === "illness")
    return [
      { label: "While ill", detail: c.belowNeck ? "No training with fever, chest symptoms or body aches." : "Head-cold only: easy and short at most, or rest." },
      { label: "Day 1–2 symptom-free", detail: "Easy 15–30 min, ≤ 50% of normal." },
      { label: "Next 2–3 days", detail: "Easy sessions up to 75% of normal volume, no intensity." },
      { label: "Then", detail: `Resume normal training if energy and resting HR are back to your usual${daysOff > 7 ? "; reintroduce hard sessions gradually over a week" : ""}.` },
    ];
  return [
    { label: "Rule", detail: "Pain ≤ 3/10 during activity and no worse the next morning — otherwise step back." },
    { label: "Step 1", detail: "Pain-free walking 30 min + cross-training (bike, swim) to keep fitness." },
    { label: "Step 2", detail: "Run/walk: 5 × (1 min run, 2 min walk), every other day." },
    { label: "Step 3", detail: "Run/walk: 5 × (3 min run, 1 min walk)." },
    { label: "Step 4", detail: "Continuous easy running 20–30 min; long run back last, intensity after 1–2 weeks pain-free." },
    { label: "See a professional", detail: "If pain is sharp, causes limping, swelling, or doesn't improve within 1–2 weeks." },
  ];
}

/** Training load in the 7 days before an onset (for "what happened before?"). */
export function loadBefore(workouts: Workout[], day: DayKey) {
  return [...dailyLoads(workouts, addDays(day, -7), addDays(day, -1)).values()].reduce((a, b) => a + b, 0);
}
