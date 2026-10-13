import { describe, expect, it } from "vitest";
import { addDays, clockOf, dayKey, dayProgress, weekStart, zonedToIso } from "@/lib/date";
import { baseline, clockSd, deviation, pearson, sd } from "@/lib/stats";
import { gradualShift, planSleep, sleepAmount, sleepConsistency, timeInBedMin } from "@/lib/sleep";
import { consistency, indexLogs, streak } from "@/lib/habits";
import type { Habit, HabitLog, SleepRecord } from "@/lib/types";
import { TZ, ts } from "./helpers";

describe("dates & time zones", () => {
  it("derives the local day in the configured zone, not UTC", () => {
    // 23:30 UTC on Jan 1 is already Jan 2 in Berlin and still Jan 1 in New York.
    expect(dayKey("2026-01-01T23:30:00Z", "Europe/Berlin")).toBe("2026-01-02");
    expect(dayKey("2026-01-01T23:30:00Z", "America/New_York")).toBe("2026-01-01");
  });
  it("round-trips local wall time through UTC across DST", () => {
    const iso = zonedToIso("2026-03-29", "03:30", TZ); // day DST starts in Berlin
    expect(clockOf(iso, TZ)).toBe("03:30");
    expect(iso).toBe("2026-03-29T01:30:00.000Z");
  });
  it("does calendar math without clock drift", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday → Monday
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });
  it("computes day progress between wake and lights-out", () => {
    expect(dayProgress("06:00", "06:00", "22:00")).toBe(0);
    expect(dayProgress("14:00", "06:00", "22:00")).toBe(0.5);
    expect(dayProgress("23:30", "06:00", "22:00")).toBe(1);
  });
});

describe("stats", () => {
  it("refuses a baseline with too little data", () => {
    const b = baseline([50, 52, 51]);
    expect(b.status).toBe("insufficient");
    expect(b.mean).toBeUndefined();
    expect(deviation(70, b)).toBe("unknown");
  });
  it("flags deviation only outside the personal band", () => {
    const b = baseline([50, 52, 51, 49, 50, 51, 52, 48]);
    expect(b.status).toBe("ok");
    expect(deviation(51, b, 3)).toBe("within");
    expect(deviation(56, b, 3)).toBe("above");
    expect(deviation(45, b, 3)).toBe("below");
  });
  it("measures spread of clock times across midnight", () => {
    // 23:30, 00:30 → ±42 min, not ±16 h
    expect(clockSd([23 * 60 + 30, 30])!).toBeCloseTo(42.43, 1);
    expect(sd([1])).toBeUndefined();
  });
  it("requires enough pairs for correlation", () => {
    expect(pearson([[1, 2]]).status).toBe("insufficient");
    const pairs: [number, number][] = Array.from({ length: 12 }, (_, i) => [i, i * 2 + 1]);
    const c = pearson(pairs);
    expect(c.r).toBeCloseTo(1);
    expect(c.strength).toBe("strong");
  });
});

describe("sleep", () => {
  const night = (bed: string, wake: string, extra: Partial<SleepRecord> = {}): SleepRecord => ({
    date: wake.slice(0, 10),
    bedtime: bed,
    wakeTime: wake,
    source: "manual",
    createdAt: ts,
    updatedAt: ts,
    ...extra,
  });

  it("plans bedtime from wake time, sleep need, latency and wind-down", () => {
    const p = planSleep("06:00", 450, 15, 45);
    expect(p.lightsOut).toBe("22:15");
    expect(p.windDownStart).toBe("21:30");
    expect(p.timeInBedMin).toBe(465);
  });
  it("distinguishes measured sleep from time-in-bed estimates", () => {
    const n = night("2026-01-01T22:00:00Z", "2026-01-02T06:00:00Z");
    expect(timeInBedMin(n)).toBe(480);
    expect(sleepAmount(n, 15)).toEqual({ minutes: 465, kind: "estimated" });
    expect(sleepAmount({ ...n, asleepMin: 430 }, 15)).toEqual({ minutes: 430, kind: "measured" });
  });
  it("shifts wake time gradually and never shortens sleep", () => {
    const steps = gradualShift("07:30", "06:30", 450, 15, 15, 3);
    expect(steps).toHaveLength(4);
    expect(steps[0]).toEqual({ fromDay: 1, wake: "07:15", lightsOut: "23:30" });
    expect(steps.at(-1)!.wake).toBe("06:30");
    expect(steps.at(-1)!.lightsOut).toBe("22:45");
  });
  it("computes bedtime consistency in the user's zone", () => {
    const recs = [
      night(zonedToIso("2026-01-01", "23:00", TZ), zonedToIso("2026-01-02", "07:00", TZ)),
      night(zonedToIso("2026-01-03", "00:00", TZ), zonedToIso("2026-01-03", "07:00", TZ)),
    ];
    const c = sleepConsistency(recs, TZ);
    expect(c.avgBedtime).toBe("23:30");
    expect(c.bedtimeSdMin!).toBeCloseTo(42.43, 1);
    expect(c.wakeSdMin).toBe(0);
  });
});

describe("habits", () => {
  const habit = (patch: Partial<Habit> = {}): Habit => ({
    id: 1,
    name: "Walk",
    category: "movement",
    frequency: { type: "daily" },
    order: 0,
    archived: false,
    createdAt: "2026-10-01T08:00:00Z",
    updatedAt: ts,
    ...patch,
  });
  const log = (date: string, status: HabitLog["status"]): HabitLog => ({ habitId: 1, date, status, updatedAt: ts });

  it("excludes rest days and gives half credit for partial", () => {
    const idx = indexLogs([log("2026-10-01", "done"), log("2026-10-02", "partial"), log("2026-10-03", "rest")]);
    const c = consistency(habit(), idx, "2026-10-01", "2026-10-04");
    expect(c.possible).toBe(3);
    expect(c.earned).toBe(1.5);
    expect(c.rate).toBe(0.5);
  });
  it("ignores days before the habit existed", () => {
    const c = consistency(habit(), indexLogs([]), "2026-09-01", "2026-10-02");
    expect(c.possible).toBe(2);
  });
  it("tolerates a single missed day but not two in a row", () => {
    const h = habit();
    const one = indexLogs([log("2026-10-01", "done"), log("2026-10-03", "done"), log("2026-10-04", "done")]);
    expect(streak(h, one, "2026-10-04")).toBe(3);
    const two = indexLogs([log("2026-10-01", "done"), log("2026-10-04", "done")]);
    expect(streak(h, two, "2026-10-04")).toBe(1);
  });
  it("does not break the streak for today being unfinished", () => {
    const idx = indexLogs([log("2026-10-02", "done"), log("2026-10-03", "done")]);
    expect(streak(habit(), idx, "2026-10-04")).toBe(2);
  });
  it("scores weekly targets per week, capped at the target", () => {
    const h = habit({ frequency: { type: "weekly", timesPerWeek: 3 }, createdAt: "2026-10-05T00:00:00Z" });
    const idx = indexLogs(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((d) => log(d, "done")));
    const c = consistency(h, idx, "2026-10-05", "2026-10-11");
    expect(c.earned).toBe(3);
    expect(c.possible).toBe(3);
  });
  it("applies day-of-week schedules", () => {
    const h = habit({ frequency: { type: "days", days: [1, 3, 5] } }); // Mon Wed Fri
    const c = consistency(h, indexLogs([]), "2026-10-05", "2026-10-11");
    expect(c.possible).toBe(3);
  });
});
