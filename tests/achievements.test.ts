import { describe, expect, it } from "vitest";
import { evaluateAchievements, newUnlocks } from "@/lib/achievements";
import { addDays, zonedToIso } from "@/lib/date";
import type { Habit, HabitLog, SleepRecord, Workout } from "@/lib/types";
import { TZ, emptyData, ts } from "./helpers";

const TODAY = "2026-10-13";
const run = (date: string, km: number, min: number): Workout => ({ date, startAt: `${date}T07:00:00Z`, type: "run", durationMin: min, distanceKm: km, source: "manual", createdAt: ts, updatedAt: ts });
const night = (d: string, bed: string): SleepRecord => ({ date: d, bedtime: zonedToIso(addDays(d, -1), bed, TZ), wakeTime: zonedToIso(d, "06:30", TZ), asleepMin: 420, source: "manual", createdAt: ts, updatedAt: ts });
const ctx = (patch: Parameters<typeof emptyData>[0]) => ({ data: emptyData(patch), challenges: [], customs: [], today: TODAY });
const find = (all: ReturnType<typeof evaluateAchievements>, key: string) => all.find((a) => a.key === key);

describe("achievements", () => {
  it("awards first run and first 5K on the actual dates", () => {
    const all = evaluateAchievements(ctx({ workouts: [run("2026-10-01", 3, 20), run("2026-10-05", 5.1, 31)] }));
    expect(find(all, "first-run")?.achievedOn).toBe("2026-10-01");
    expect(find(all, "first-5k")?.achievedOn).toBe("2026-10-05");
    expect(find(all, "first-5k")?.stats.map((s) => s.key)).toEqual(["dist", "time", "pace"]);
  });

  it("shows progress instead of inventing a milestone", () => {
    const all = evaluateAchievements(ctx({ workouts: [run("2026-10-01", 3.2, 20)] }));
    expect(find(all, "first-5k")?.achievedOn).toBeUndefined();
    expect(find(all, "first-5k")?.progress).toEqual({ current: 3.2, target: 5, unit: "km longest" });
  });

  it("only counts a longest-run record after there is something to beat", () => {
    const all = evaluateAchievements(ctx({ workouts: [run("2026-10-01", 3, 20), run("2026-10-03", 4, 26), run("2026-10-05", 6, 40)] }));
    expect(all.filter((a) => a.key.startsWith("pb-longest-run")).map((a) => a.achievedOn)).toEqual(["2026-10-05"]);
  });

  it("requires 7 consecutive consistent nights and flags exact sleep as sensitive", () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays("2026-10-01", i));
    const all = evaluateAchievements(ctx({ sleep: days.map((d) => night(d, "23:00")) }));
    const a = find(all, "sleep-consistent-7")!;
    expect(a.achievedOn).toBe("2026-10-07");
    expect(a.stats.find((s) => s.key === "avgSleep")?.sensitive).toBe(true);
    const gap = evaluateAchievements(ctx({ sleep: days.filter((_, i) => i !== 3).map((d) => night(d, "23:00")) }));
    expect(find(gap, "sleep-consistent-7")?.achievedOn).toBeUndefined();
  });

  it("counts a 7-day habit streak where rest days don't break it", () => {
    const h: Habit = { id: 1, name: "Read", category: "mind", frequency: { type: "daily" }, order: 0, archived: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: ts };
    const logs: HabitLog[] = Array.from({ length: 8 }, (_, i) => ({ habitId: 1, date: addDays("2026-10-01", i), status: i === 3 ? ("rest" as const) : ("done" as const), updatedAt: ts }));
    const all = evaluateAchievements(ctx({ habits: [h], habitLogs: logs }));
    expect(find(all, "habit-7:1")?.achievedOn).toBe("2026-10-08");
    expect(find(all, "reading-30:1")?.progress).toEqual({ current: 7, target: 30, unit: "sessions" });
  });

  it("adds historical unlocks quietly and celebrates recent ones", () => {
    const all = evaluateAchievements(ctx({ workouts: [run("2026-09-01", 3, 20), run("2026-10-12", 5, 30)] }));
    const rows = newUnlocks(all, new Set(), TODAY, ts);
    expect(rows.find((r) => r.key === "first-run")?.seen).toBe(true);
    expect(rows.find((r) => r.key === "first-5k")?.seen).toBe(false);
    expect(newUnlocks(all, new Set(rows.map((r) => r.key)), TODAY, ts)).toEqual([]);
  });

  it("evaluates custom milestones from real records", () => {
    const all = evaluateAchievements({
      ...ctx({ workouts: [run("2026-10-02", 5, 30), run("2026-10-04", 6, 36)] }),
      customs: [{ id: 9, title: "10 km this month", category: "custom", kind: "workoutDistance", activity: "run", target: 10, createdAt: "2026-10-01T00:00:00Z" }],
    });
    expect(find(all, "custom:9")?.achievedOn).toBe("2026-10-04");
  });
});
