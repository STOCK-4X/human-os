import { addDays, daysBetween } from "./date";
import type { DayKey } from "./types";

export const CHALLENGE_DAYS = 45;

export const PHASES = [
  { n: 1, from: 1, to: 15, name: "Foundation", focus: "Make the habits small and easy. Showing up matters more than performance." },
  { n: 2, from: 16, to: 30, name: "Consistency", focus: "Keep the rhythm and make small, gradual improvements." },
  { n: 3, from: 31, to: 45, name: "Maintain & review", focus: "Keep what works, drop what doesn't, and review what you learned." },
] as const;

export interface ChallengeDay {
  /** 1-based day number; > 45 means finished, < 1 not started. */
  day: number;
  phase: (typeof PHASES)[number] | undefined;
  finished: boolean;
  endDate: DayKey;
}

export function challengeDay(startDate: DayKey, today: DayKey): ChallengeDay {
  const day = daysBetween(startDate, today) + 1;
  return {
    day,
    phase: PHASES.find((p) => day >= p.from && day <= p.to),
    finished: day > CHALLENGE_DAYS,
    endDate: addDays(startDate, CHALLENGE_DAYS - 1),
  };
}

export const MILESTONES = [7, 15, 21, 30, 45];
