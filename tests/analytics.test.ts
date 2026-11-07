import { describe, expect, it } from "vitest";
import { formState, hrMax, hrZones, loadFlag, personalRecords, pmc, sessionLoad, sleepDebt, volume, zoneDistribution } from "@/lib/analytics";
import { addDays, zonedToIso } from "@/lib/date";
import { emptyGarmin, mapActivities, mapDailySummaries, mapHrv, mapSleepSummaries } from "@/lib/garmin-map";
import type { SleepRecord, Workout } from "@/lib/types";
import { TZ, emptyData, ts } from "./helpers";

const TODAY = "2026-11-07";
const w = (date: string, patch: Partial<Workout> = {}): Workout => ({ date, startAt: `${date}T07:00:00Z`, type: "run", durationMin: 60, source: "garmin", createdAt: ts, updatedAt: ts, ...patch });

describe("session load", () => {
  it("uses Edwards TRIMP from HR zones", () => {
    // 10 min Z1 + 30 min Z2 + 20 min Z3 = 10 + 60 + 60
    expect(sessionLoad(w(TODAY, { hrZonesSec: [600, 1800, 1200, 0, 0] }))).toEqual({ load: 130, method: "hr-zones" });
  });
  it("falls back to session-RPE, then duration", () => {
    expect(sessionLoad(w(TODAY, { rpe: 5 }))).toEqual({ load: 120, method: "rpe" });
    expect(sessionLoad(w(TODAY))).toEqual({ load: 90, method: "duration" });
  });
});

describe("fitness / fatigue / form", () => {
  it("is empty without workouts", () => {
    expect(pmc([], TODAY)).toEqual({ points: [], historyDays: 0, reliable: false });
  });
  it("tracks load with 42- and 7-day time constants", () => {
    const ws = Array.from({ length: 60 }, (_, i) => w(addDays(TODAY, -59 + i), { rpe: 5 })); // 120/day
    const p = pmc(ws, TODAY);
    const last = p.points.at(-1)!;
    expect(p.reliable).toBe(true);
    expect(last.atl).toBeGreaterThan(115); // fatigue converges fast
    expect(last.ctl).toBeGreaterThan(70);
    expect(last.ctl).toBeLessThan(last.atl); // fitness lags
    expect(last.tsb).toBeLessThan(0);
  });
  it("form rises after rest", () => {
    const ws = Array.from({ length: 50 }, (_, i) => w(addDays(TODAY, -60 + i), { rpe: 6 }));
    const last = pmc(ws, TODAY).points.at(-1)!;
    expect(last.tsb).toBeGreaterThan(0);
    expect(formState(last.tsb).key).toMatch(/fresh|detraining/);
  });
  it("labels TSB bands", () => {
    expect(formState(-3).key).toBe("neutral");
    expect(formState(-20).key).toBe("absorbing");
    expect(formState(-40).key).toBe("overreaching");
  });
});

describe("load flag", () => {
  it("needs 3 weeks of history", () => {
    expect(loadFlag([w(TODAY)], TODAY).status).toBe("insufficient");
  });
  it("flags a spike vs the usual week", () => {
    const base = Array.from({ length: 28 }, (_, i) => i % 7 === 0 ? w(addDays(TODAY, -27 + i), { rpe: 5 }) : null).filter(Boolean) as Workout[];
    const spike = [1, 2, 3, 4].map((d) => w(addDays(TODAY, -d), { rpe: 7, durationMin: 90 }));
    const f = loadFlag([...base, ...spike], TODAY);
    expect(f.status).toBe("ok");
    expect(f.band).toBe("high");
    const steady = loadFlag(base, TODAY);
    expect(steady.ratio).toBeCloseTo(1, 0);
    expect(steady.band).toBe("optimal");
  });
});

describe("volume, zones, PRs", () => {
  const ws = [
    w("2026-11-02", { distanceKm: 5.2, hrZonesSec: [300, 1800, 600, 300, 0], bestSplitsSec: { k1: 290, k5: 1520 }, maxHr: 182 }),
    w("2026-11-04", { distanceKm: 10.1, durationMin: 65, hrZonesSec: [600, 2400, 600, 0, 0], bestSplitsSec: { k1: 300, k5: 1500, k10: 3100 }, maxHr: 186 }),
    w("2026-11-05", { type: "strength", durationMin: 40, maxHr: 150 }),
  ];
  it("sums volume by sport", () => {
    const v = volume(ws, "2026-11-01", TODAY);
    expect(v.sessions).toBe(3);
    expect(v.hours).toBeCloseTo(2.8, 1);
    expect(v.bySport[0]).toMatchObject({ type: "run", sessions: 2, distanceKm: 15.3 });
  });
  it("derives HRmax and zones", () => {
    expect(hrMax(ws, {}, TODAY)).toEqual({ bpm: 186, source: "observed" });
    expect(hrMax([], { birthYear: 1996 }, TODAY)).toEqual({ bpm: 187, source: "age" });
    expect(hrMax([], {}, TODAY)).toBeUndefined();
    expect(hrZones(200)[0]).toEqual({ zone: 1, low: 100, high: 119 });
    expect(hrZones(200)[4]).toEqual({ zone: 5, low: 180, high: 200 });
  });
  it("distributes time in zones", () => {
    const z = zoneDistribution(ws, "2026-11-01", TODAY);
    expect(z.sessions).toBe(2);
    expect(z.easyShare!).toBeCloseTo(5100 / 6600, 3);
  });
  it("finds PRs with dates", () => {
    const pr = personalRecords(ws);
    expect(pr.find((p) => p.key === "k5")).toMatchObject({ value: "25:00", date: "2026-11-04" });
    expect(pr.find((p) => p.key === "k1")).toMatchObject({ value: "4:50", date: "2026-11-02" });
    expect(pr.find((p) => p.key === "longest-run")).toMatchObject({ value: "10.10 km" });
  });
});

describe("sleep debt", () => {
  it("adds shortfalls only", () => {
    const n = (d: string, asleep: number): SleepRecord => ({ date: d, bedtime: zonedToIso(addDays(d, -1), "23:00", TZ), wakeTime: zonedToIso(d, "07:00", TZ), asleepMin: asleep, source: "garmin", createdAt: ts, updatedAt: ts });
    const data = emptyData({ sleep: [n("2026-11-06", 400), n("2026-11-07", 500)] }); // need 450
    expect(sleepDebt(data, TODAY)).toEqual({ minutes: 50, nights: 2 });
  });
});

describe("Garmin mapping (shapes from the live API)", () => {
  it("maps daily summaries, ignoring Garmin's negative 'no data' stress", () => {
    const out = emptyGarmin();
    mapDailySummaries({ data: [{ calendarDate: "2026-11-06", movement: { steps: { value: 9120 } }, heartRate: { restingValue: 51 }, calories: { burnedActive: 610 }, intensityMinutes: { moderate: 20, vigorous: 15 }, stress: { avgLevel: -1 }, bodyBattery: { maxValue: 88 } }] }, out);
    expect(out.metrics.map((m) => `${m.metric}=${m.value}`)).toEqual(["steps=9120", "rhr=51", "calories=610", "activeMin=35", "bodyBattery=88"]);
    expect(out.metrics.every((m) => m.source === "garmin")).toBe(true);
  });
  it("maps sleep with Garmin's own score and skips empty days", () => {
    const out = emptyGarmin();
    const start = Date.parse("2026-11-05T15:10:00Z");
    mapSleepSummaries([
      { calendarDate: null, sleepTimeSeconds: null },
      { calendarDate: "2026-11-06", sleepTimeSeconds: 26400, sleepStartTimestampGMT: start, sleepEndTimestampGMT: start + 7.8 * 3600e3, deepSleepSeconds: 4200, remSleepSeconds: 5400, lightSleepSeconds: 16800, awakeSleepSeconds: 900, awakeCount: 2, averageRespirationValue: 14.5, sleepScores: { overall: { value: 81 } } },
    ], out);
    expect(out.sleep).toHaveLength(1);
    expect(out.sleep[0]).toMatchObject({ date: "2026-11-06", asleepMin: 440, deepMin: 70, remMin: 90, score: 81, awakenings: 2, source: "garmin" });
    expect(out.metrics).toEqual([{ date: "2026-11-06", metric: "respiration", value: 14.5, source: "garmin" }]);
  });
  it("maps HRV and activities without location or owner data", () => {
    const out = emptyGarmin();
    mapHrv({ hrvSummaries: [{ calendarDate: "2026-11-06", lastNightAvg: 47 }] }, out);
    mapActivities([{ activityId: 123, activityName: "Morning Run", startTimeGMT: "2026-11-05 23:30:00", startTimeLocal: "2026-11-06 07:30:00", activityType: { typeKey: "running" }, duration: 1830, distance: 5020, averageHR: 151, maxHR: 176, calories: 380, elevationGain: 22, hrTimeInZone_1: 60, hrTimeInZone_2: 900, hrTimeInZone_3: 700, hrTimeInZone_4: 170, fastestSplit_1000: 352, startLatitude: 47.9, ownerFullName: "X" }], out);
    expect(out.metrics).toEqual([{ date: "2026-11-06", metric: "hrv", value: 47, source: "garmin" }]);
    const a = out.workouts[0];
    expect(a).toMatchObject({ date: "2026-11-06", type: "run", durationMin: 30.5, distanceKm: 5.02, avgHr: 151, hrZonesSec: [60, 900, 700, 170, 0], bestSplitsSec: { k1: 352 }, externalId: "garmin:123" });
    expect(JSON.stringify(a)).not.toMatch(/47\.9|ownerFullName|"X"/);
  });
});
