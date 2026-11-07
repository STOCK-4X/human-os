import { addDays } from "./date";
import { e1rm } from "./training";
import type { DayKey, Workout } from "./types";

/**
 * Strength programming helpers: weekly hard sets per muscle group (dose-response:
 * ~10–20 sets/muscle/week for most lifters, Schoenfeld 2017) and estimated-1RM
 * trends (Epley). Sets with RIR > 4 don't count as "hard" (Zourdos 2016 scale).
 */

export const GROUPS = ["Quads", "Glutes & hamstrings", "Back", "Chest", "Shoulders", "Arms", "Core"] as const;
export type Group = (typeof GROUPS)[number];

const MAP: [RegExp, Partial<Record<Group, number>>][] = [
  [/front squat|goblet|squat|leg press|step.?up|split squat|lunge/i, { Quads: 1, "Glutes & hamstrings": 0.5 }],
  [/romanian|rdl|deadlift|hip thrust|good morning|hamstring|glute bridge|nordic/i, { "Glutes & hamstrings": 1, Back: 0.5 }],
  [/pull.?up|chin.?up|row|lat pull/i, { Back: 1, Arms: 0.5 }],
  [/bench|push.?up|chest press|dip/i, { Chest: 1, Arms: 0.5, Shoulders: 0.5 }],
  [/overhead press|ohp|shoulder press|lateral raise|military/i, { Shoulders: 1, Arms: 0.5 }],
  [/curl|tricep|extension/i, { Arms: 1 }],
  [/plank|crunch|dead bug|pallof|ab |core|sit.?up|leg raise/i, { Core: 1 }],
];

export function groupsFor(exercise: string): Partial<Record<Group, number>> {
  return MAP.find(([re]) => re.test(exercise))?.[1] ?? {};
}

export function weeklySets(workouts: Workout[], today: DayKey): { group: Group; sets: number; status: "low" | "in range" | "high" }[] {
  const from = addDays(today, -6);
  const tally = new Map<Group, number>(GROUPS.map((g) => [g, 0]));
  for (const w of workouts) {
    if (w.date < from || w.date > today) continue;
    for (const s of w.sets ?? []) {
      if (s.rir !== undefined && s.rir > 4) continue;
      for (const [g, f] of Object.entries(groupsFor(s.exercise)) as [Group, number][]) tally.set(g, (tally.get(g) ?? 0) + f);
    }
  }
  return GROUPS.map((group) => {
    const sets = Math.round((tally.get(group) ?? 0) * 10) / 10;
    return { group, sets, status: sets < 10 ? "low" : sets > 20 ? "high" : "in range" };
  });
}

/** Best estimated 1RM per session for one exercise. */
export function e1rmHistory(workouts: Workout[], exercise: string): { date: DayKey; value: number }[] {
  const out = new Map<DayKey, number>();
  for (const w of workouts)
    for (const s of w.sets ?? [])
      if (s.exercise.trim().toLowerCase() === exercise.trim().toLowerCase() && s.weightKg) out.set(w.date, Math.max(out.get(w.date) ?? 0, e1rm(s.weightKg, s.reps)));
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }));
}
