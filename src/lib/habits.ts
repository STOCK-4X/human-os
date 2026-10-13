import { addDays, dayRange, weekStart, weekday } from "./date";
import type { DayKey, Habit, HabitLog, HabitStatus } from "./types";

export function isScheduled(h: Habit, day: DayKey): boolean {
  switch (h.frequency.type) {
    case "daily":
      return true;
    case "days":
      return h.frequency.days.includes(weekday(day));
    case "weekly":
      // Weekly habits can be done on any day; the target is per week.
      return true;
  }
}

export function frequencyLabel(h: Habit): string {
  const f = h.frequency;
  if (f.type === "daily") return "Every day";
  if (f.type === "weekly") return `${f.timesPerWeek}× per week`;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return f.days.length === 7 ? "Every day" : f.days.map((d) => names[d]).join(" · ");
}

const credit: Record<HabitStatus, number> = { done: 1, partial: 0.5, skipped: 0, rest: 0 };

type LogIndex = Map<string, HabitLog>;
export function indexLogs(logs: HabitLog[]): LogIndex {
  return new Map(logs.map((l) => [`${l.habitId}|${l.date}`, l]));
}
const get = (idx: LogIndex, h: Habit, d: DayKey) => idx.get(`${h.id}|${d}`);

export interface Consistency {
  /** Completion credit earned (partial = 0.5). */
  earned: number;
  /** Opportunities, excluding rest days. */
  possible: number;
  /** 0–1, undefined when there were no opportunities. */
  rate?: number;
}

/**
 * Consistency over a date range. Rest days are removed from the denominator;
 * skipped days count as "not done" but are recorded without judgement.
 * Days before the habit was created are ignored.
 */
export function consistency(h: Habit, logs: LogIndex, from: DayKey, to: DayKey): Consistency {
  const created = h.createdAt.slice(0, 10);
  const start = from < created ? created : from;
  if (start > to) return { earned: 0, possible: 0 };

  if (h.frequency.type === "weekly") {
    const per = h.frequency.timesPerWeek;
    let earned = 0;
    let possible = 0;
    for (let ws = weekStart(start); ws <= to; ws = addDays(ws, 7)) {
      const days = dayRange(ws < start ? start : ws, addDays(ws, 6) > to ? to : addDays(ws, 6));
      const done = days.reduce((a, d) => a + credit[get(logs, h, d)?.status ?? "skipped"], 0);
      // Partial weeks scale the target proportionally (rounded up, minimum 1).
      const target = Math.max(1, Math.ceil((per * days.length) / 7));
      earned += Math.min(done, target);
      possible += target;
    }
    return { earned, possible, rate: possible ? earned / possible : undefined };
  }

  let earned = 0;
  let possible = 0;
  for (const d of dayRange(start, to)) {
    if (!isScheduled(h, d)) continue;
    const s = get(logs, h, d)?.status;
    if (s === "rest") continue;
    possible += 1;
    earned += s ? credit[s] : 0;
  }
  return { earned, possible, rate: possible ? earned / possible : undefined };
}

/**
 * Forgiving streak: rest and skipped days never break it, and a single missed
 * day is allowed ("never miss twice"). Today does not count against you until
 * the day is over.
 */
export function streak(h: Habit, logs: LogIndex, today: DayKey): number {
  if (h.frequency.type === "weekly") return weeklyStreak(h, logs, today);
  const created = h.createdAt.slice(0, 10);
  let count = 0;
  let missedPrev = false;
  for (let d = today; d >= created; d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    const s = get(logs, h, d)?.status;
    if (s === "done" || s === "partial") {
      count += 1;
      missedPrev = false;
    } else if (s === "rest" || s === "skipped") {
      continue;
    } else if (d === today) {
      continue;
    } else {
      if (missedPrev) break;
      missedPrev = true;
    }
  }
  return count;
}

function weeklyStreak(h: Habit, logs: LogIndex, today: DayKey): number {
  if (h.frequency.type !== "weekly") return 0;
  const created = h.createdAt.slice(0, 10);
  let weeks = 0;
  // The current week isn't over, so start counting from last week but add this week if already met.
  for (let ws = weekStart(today); ws >= weekStart(created); ws = addDays(ws, -7)) {
    const c = consistency(h, logs, ws, addDays(ws, 6) > today ? today : addDays(ws, 6));
    const met = c.rate !== undefined && c.rate >= 1;
    if (met) weeks += 1;
    else if (ws !== weekStart(today)) break;
  }
  return weeks;
}

export function nextStatus(s: HabitStatus | undefined): HabitStatus | undefined {
  // Tap cycle: none → done → partial → none. Rest/skip are set explicitly.
  if (!s) return "done";
  if (s === "done") return "partial";
  return undefined;
}
