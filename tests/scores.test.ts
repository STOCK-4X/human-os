import { describe, expect, it } from "vitest";
import { addDays, zonedToIso } from "@/lib/date";
import { energyScore, readiness, recoveryScore, scoresFor, sleepScore, trendOf } from "@/lib/scores";
import type { CheckIn, DailyMetric, SleepRecord } from "@/lib/types";
import { TZ, emptyData, ts } from "./helpers";

const DAY = "2026-10-13";
const m = (date: string, metric: DailyMetric["metric"], value: number, source: DailyMetric["source"] = "garmin"): DailyMetric => ({ date, metric, value, source, createdAt: ts, updatedAt: ts });
const night = (wakeDay: string, bed = "23:00", wake = "06:30", extra: Partial<SleepRecord> = {}): SleepRecord => ({
  date: wakeDay,
  bedtime: zonedToIso(addDays(wakeDay, -1), bed, TZ),
  wakeTime: zonedToIso(wakeDay, wake, TZ),
  source: "garmin",
  createdAt: ts,
  updatedAt: ts,
  ...extra,
});
const ck = (patch: Partial<CheckIn>): CheckIn => ({ date: DAY, symptoms: [], updatedAt: ts, ...patch });
/** 14 days of stable history before DAY. */
const history = (metric: DailyMetric["metric"], value: number, jitter = 2) =>
  Array.from({ length: 14 }, (_, i) => m(addDays(DAY, -14 + i), metric, value + ((i % 3) - 1) * jitter));

describe("sleep score", () => {
  it("is missing without a sleep record", () => {
    expect(sleepScore(emptyData(), DAY).status).toBe("insufficient");
  });
  it("scores a full, consistent, efficient, well-rated night highly", () => {
    const prior = [1, 2, 3, 4].map((i) => night(addDays(DAY, -i), "23:00", "06:45", { asleepMin: 440 }));
    const s = sleepScore(emptyData({ sleep: [...prior, night(DAY, "23:00", "06:45", { asleepMin: 440, quality: 5 })] }), DAY);
    expect(s.status).toBe("ok");
    expect(s.value).toBeGreaterThanOrEqual(90);
    expect(s.confidence).toBe("high");
  });
  it("re-weights when parts are missing and lowers confidence for estimates", () => {
    const s = sleepScore(emptyData({ sleep: [night(DAY, "23:00", "06:45")] }), DAY);
    expect(s.status).toBe("ok");
    expect(s.components.filter((c) => c.points !== undefined).map((c) => c.key)).toEqual(["duration"]);
    expect(s.confidence).toBe("low");
  });
  it("penalises short sleep relative to the person's own need", () => {
    const short = sleepScore(emptyData({ sleep: [night(DAY, "02:00", "06:00", { asleepMin: 230 })] }), DAY);
    expect(short.value!).toBeLessThan(30);
  });
});

describe("recovery score", () => {
  it("says there isn't enough data without an HRV/RHR baseline", () => {
    const r = recoveryScore(emptyData({ metrics: [m(DAY, "hrv", 50)], sleep: [night(DAY)] }), DAY);
    expect(r.status).toBe("insufficient");
    expect(r.notes[0]).toMatch(/Not enough data/);
  });
  it("is about 65 at the personal baseline and rises with above-baseline HRV", () => {
    const base = [...history("hrv", 50), ...history("rhr", 55, 1)];
    const atBase = recoveryScore(emptyData({ metrics: [...base, m(DAY, "hrv", 50), m(DAY, "rhr", 55)] }), DAY);
    expect(atBase.status).toBe("ok");
    expect(atBase.value).toBe(65);
    const good = recoveryScore(emptyData({ metrics: [...base, m(DAY, "hrv", 60), m(DAY, "rhr", 52)] }), DAY);
    expect(good.value!).toBeGreaterThan(80);
  });
  it("caps the score when the person feels unwell, regardless of wearables", () => {
    const base = [...history("hrv", 50), ...history("rhr", 55, 1)];
    const r = recoveryScore(emptyData({ metrics: [...base, m(DAY, "hrv", 70), m(DAY, "rhr", 50)], checkins: [ck({ unwell: true })] }), DAY);
    expect(r.value).toBeLessThanOrEqual(33);
  });
  it("never includes stress or Body Battery (they'd double-count HRV)", () => {
    const base = [...history("hrv", 50), ...history("rhr", 55, 1)];
    const r = recoveryScore(emptyData({ metrics: [...base, m(DAY, "hrv", 50), m(DAY, "rhr", 55), m(DAY, "stress", 90), m(DAY, "bodyBattery", 5)] }), DAY);
    expect(r.components.map((c) => c.key)).not.toContain("stress");
    expect(r.components.map((c) => c.key)).not.toContain("bodyBattery");
    expect(r.value).toBe(65);
  });
});

describe("energy", () => {
  it("never replaces Body Battery — it is reported unchanged alongside", () => {
    const data = emptyData({ metrics: [m(DAY, "bodyBattery", 72), m(addDays(DAY, -1), "bodyBattery", 60)], checkins: [ck({ energy: 7 })], sleep: [night(DAY)] });
    const s = scoresFor(data, DAY);
    expect(s.bodyBattery).toEqual({ value: 72, source: "garmin", change: 12 });
    expect(s.energy.components.find((c) => c.key === "bodyBattery")?.points).toBe(72);
    expect(s.energy.components.map((c) => c.key)).not.toContain("stress");
  });
  it("needs Body Battery or a check-in", () => {
    expect(energyScore(emptyData({ sleep: [night(DAY)], metrics: [m(DAY, "stress", 20)] }), DAY).status).toBe("insufficient");
  });
});

describe("readiness", () => {
  const base = [...history("hrv", 50), ...history("rhr", 55, 1)];
  it("is insufficient with no data", () => {
    expect(readiness(emptyData(), DAY).level).toBe("insufficient");
  });
  it("does not act on a single metric alone", () => {
    // Low recovery only, no other negative signal → moderate, not recovery.
    const data = emptyData({ metrics: [...base, m(DAY, "hrv", 30), m(DAY, "rhr", 63)], sleep: [night(DAY, "22:45", "06:30", { asleepMin: 450 })] });
    const r = readiness(data, DAY);
    expect(recoveryScore(data, DAY).value!).toBeLessThan(34);
    expect(r.level).toBe("moderate");
  });
  it("lets symptoms override favourable wearables", () => {
    const data = emptyData({ metrics: [...base, m(DAY, "hrv", 65), m(DAY, "rhr", 50)], checkins: [ck({ energy: 9, symptoms: ["fever"] })] });
    const r = readiness(data, DAY);
    expect(r.level).toBe("recovery");
    expect(r.symptomDriven).toBe(true);
  });
  it("needs two independent sources before saying ready", () => {
    const data = emptyData({ metrics: [...base, m(DAY, "hrv", 52), m(DAY, "rhr", 54)], checkins: [ck({ energy: 7, fatigue: 3 })] });
    expect(readiness(data, DAY).level).toBe("ready");
  });
});

describe("score trend", () => {
  it("needs 7 values for a baseline", () => {
    const hist = Array.from({ length: 5 }, (_, i) => ({ date: addDays(DAY, i - 5), recovery: 60 }));
    expect(trendOf([...hist, { date: DAY, recovery: 80 }], "recovery", 80)).toMatchObject({ baseline: undefined, direction: "up", baselineN: 5 });
  });
});
