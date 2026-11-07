import { describe, expect, it } from "vitest";
import { conditionStats, returnProtocol } from "@/lib/conditions";
import { addDays } from "@/lib/date";
import { emptyGarmin, mapActivities, mapSleepSummaries } from "@/lib/garmin-map";
import { bestVdot, vdotHistory } from "@/lib/performance";
import { todaySession, weekSessions, type PlanInput } from "@/lib/prescribe";
import { readiness, type Readiness } from "@/lib/scores";
import { e1rmHistory, groupsFor, weeklySets } from "@/lib/strength";
import type { Condition, Workout } from "@/lib/types";
import { emptyData, profile, ts } from "./helpers";

const TODAY = "2026-11-11"; // Wednesday
const w = (date: string, patch: Partial<Workout> = {}): Workout => ({ date, startAt: `${date}T07:00:00Z`, type: "run", durationMin: 40, source: "manual", createdAt: ts, updatedAt: ts, ...patch });
const r = (level: Readiness["level"], symptomDriven = false): Readiness => ({ level, title: level, text: "", reasons: ["test reason"], symptomDriven });
const cond = (patch: Partial<Condition>): Condition => ({ kind: "injury", label: "Knee", severity: 1, start: addDays(TODAY, -2), createdAt: ts, updatedAt: ts, ...patch });
const input = (patch: Partial<PlanInput> = {}): PlanInput => ({
  profile: profile({ trainingDays: [1, 3, 6], preferredActivities: ["run", "strength"], fitnessLevel: "intermediate" }),
  today: TODAY,
  ...patch,
});

describe("workout prescription", () => {
  it("plans one session per training day with the long run last", () => {
    const week = weekSessions(input());
    expect(week.map((s) => s.day)).toEqual(["2026-11-09", "2026-11-11", "2026-11-14"]);
    expect(week.at(-1)!.kind).toBe("long");
  });
  it("uses VDOT paces when available, otherwise heart-rate zones", () => {
    const withPace = weekSessions(input({ vdot: { vdot: 50, basis: "race", from: { label: "10 km race", date: TODAY, timeSec: 2481, distanceM: 10000 } } }));
    expect(withPace[0].steps[0].detail).toMatch(/\d:\d\d\/km/);
    const withZones = weekSessions(input({ zones: [1, 2, 3, 4, 5].map((z) => ({ zone: z, low: 100 + z * 10, high: 109 + z * 10 })) }));
    expect(withZones[0].steps[0].detail).toMatch(/Z2 120–129 bpm/);
  });
  it("adds quality work in build and tapers before the race", () => {
    const build = weekSessions(input({ profile: { ...input().profile, goalRace: { name: "HM", date: addDays(TODAY, 70), distanceKm: 21.1 } } }));
    expect(build.map((s) => s.phase)).toContain("base");
    const race = weekSessions(input({ profile: { ...input().profile, goalRace: { name: "HM", date: "2026-11-14", distanceKm: 21.1 } } }));
    expect(race.some((s) => s.kind === "race" && s.day === "2026-11-14")).toBe(true);
  });
  it("only ever makes today easier with low readiness", () => {
    const peak = input({ profile: { ...input().profile, goalRace: { name: "10k", date: addDays(TODAY, 25), distanceKm: 10 } } });
    const planned = todaySession(peak)!;
    expect(["intervals", "threshold", "race-pace", "long", "strength", "easy"]).toContain(planned.kind);
    const moderate = todaySession({ ...peak, readiness: r("moderate") })!;
    expect(["intervals", "threshold", "race-pace", "long"]).not.toContain(moderate.kind);
    expect(moderate.totalMin).toBeLessThanOrEqual(planned.totalMin);
    expect(todaySession({ ...peak, readiness: r("recovery") })!.kind).toBe("mobility");
    expect(todaySession({ ...peak, readiness: r("recovery", true) })!.kind).toBe("rest");
    expect(todaySession({ ...peak, readiness: r("ready") })).toEqual(planned);
  });
  it("rests when ill below the neck and cross-trains a moderate injury", () => {
    expect(todaySession(input({ conditions: [cond({ kind: "illness", label: "Flu", belowNeck: true })] }))!.kind).toBe("rest");
    expect(todaySession(input({ conditions: [cond({ severity: 2 })] }))!.kind).toBe("cross");
    expect(todaySession(input({ conditions: [cond({ end: addDays(TODAY, -1), severity: 3 })] }))!.adjusted).toBeUndefined();
  });
  it("swaps strength for easy work if you don't lift, and skips non-training days", () => {
    const noLift = weekSessions(input({ profile: { ...input().profile, preferredActivities: ["run"] } }));
    expect(noLift.some((s) => s.kind === "strength")).toBe(false);
    expect(todaySession(input({ today: "2026-11-12" }))).toBeUndefined();
  });
});

describe("readiness with wellness and conditions", () => {
  it("treats an active illness as rest, regardless of wearables", () => {
    const data = emptyData({ conditions: [cond({ kind: "illness", label: "Flu", belowNeck: true })] });
    expect(readiness(data, TODAY)).toMatchObject({ level: "recovery", symptomDriven: true });
  });
  it("counts high soreness as a low signal", () => {
    const data = emptyData({ checkins: [{ date: TODAY, energy: 7, soreness: 8, symptoms: [], updatedAt: ts }] });
    expect(readiness(data, TODAY).reasons).toContain("high muscle soreness");
  });
});

describe("races and VDOT", () => {
  it("prefers a real race over faster-looking training splits", () => {
    const ws = [w("2026-10-01", { isRace: true, distanceKm: 10, durationMin: 50 }), w("2026-10-10", { bestSplitsSec: { k5: 1300 } })];
    expect(bestVdot(ws, TODAY)).toMatchObject({ basis: "race" });
    expect(bestVdot([ws[1]], TODAY)).toMatchObject({ basis: "split" });
  });
  it("tracks best VDOT per month with gaps", () => {
    const h = vdotHistory([w("2026-10-01", { isRace: true, distanceKm: 10, durationMin: 50 })], TODAY, 3);
    expect(h.map((x) => x.date)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(h[0].value).toBeUndefined();
    expect(h[1].value).toBeGreaterThan(35);
  });
  it("maps Garmin race events and overnight SpO₂", () => {
    const out = emptyGarmin();
    mapActivities([{ activityId: 9, startTimeGMT: "2026-10-01 07:00:00", startTimeLocal: "2026-10-01 15:00:00", activityType: { typeKey: "running" }, eventType: { typeKey: "race" }, duration: 3000, distance: 10000 }], out);
    expect(out.workouts[0].isRace).toBe(true);
    const start = Date.parse("2026-10-01T15:00:00Z");
    mapSleepSummaries([{ calendarDate: "2026-10-02", sleepTimeSeconds: 25000, sleepStartTimestampGMT: start, sleepEndTimestampGMT: start + 7.5 * 3600e3, averageSpO2Value: 95 }], out);
    expect(out.metrics).toContainEqual({ date: "2026-10-02", metric: "spo2", value: 95, source: "garmin" });
  });
});

describe("strength programming", () => {
  const lift = (date: string, sets: Workout["sets"]) => w(date, { type: "strength", sets });
  it("maps exercises to muscle groups", () => {
    expect(groupsFor("Back Squat")).toMatchObject({ Quads: 1 });
    expect(groupsFor("Romanian deadlift")).toMatchObject({ "Glutes & hamstrings": 1 });
    expect(groupsFor("Unknown thing")).toEqual({});
  });
  it("counts hard sets per group this week, ignoring easy sets", () => {
    const sets = Array.from({ length: 12 }, () => ({ exercise: "Squat", reps: 8, weightKg: 60, rir: 2 }));
    const easy = { exercise: "Squat", reps: 8, weightKg: 40, rir: 6 };
    const g = weeklySets([lift(TODAY, [...sets, easy]), lift(addDays(TODAY, -10), sets)], TODAY);
    expect(g.find((x) => x.group === "Quads")).toMatchObject({ sets: 12, status: "in range" });
    expect(g.find((x) => x.group === "Glutes & hamstrings")!.sets).toBe(6);
    expect(g.find((x) => x.group === "Chest")!.status).toBe("low");
  });
  it("tracks estimated 1RM per session", () => {
    const h = e1rmHistory([lift("2026-11-01", [{ exercise: "Squat", reps: 5, weightKg: 100 }]), lift("2026-11-08", [{ exercise: "squat", reps: 5, weightKg: 105 }])], "Squat");
    expect(h).toEqual([
      { date: "2026-11-01", value: 116.7 },
      { date: "2026-11-08", value: 122.5 },
    ]);
  });
});

describe("injury & illness", () => {
  it("gives a graded return plan", () => {
    expect(returnProtocol(cond({ kind: "illness", belowNeck: true }), 3)[0].detail).toMatch(/No training/);
    expect(returnProtocol(cond({}), 5).some((s) => /clinician|professional/i.test(s.label + s.detail))).toBe(true);
  });
  it("summarises the last year", () => {
    const s = conditionStats([cond({ start: "2026-10-01", end: "2026-10-05" })], [], TODAY);
    expect(s).toMatchObject({ count: 1, daysAffected: 5 });
  });
});
