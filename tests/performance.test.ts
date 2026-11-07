import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/date";
import { MAX_RAMP, bestVdot, fuelTargets, hrvTrend, predictTime, seasonPlan, trainingPaces, vdot, zonesFor } from "@/lib/performance";
import { readiness } from "@/lib/scores";
import { METHODS } from "@/lib/evidence";
import type { DailyMetric, Workout } from "@/lib/types";
import { emptyData, ts } from "./helpers";

const TODAY = "2026-11-07";
const near = (sec: number, target: number, tol: number) => expect(Math.abs(sec - target)).toBeLessThanOrEqual(tol);

describe("VDOT (Daniels & Gilbert)", () => {
  it("matches Daniels' table: 5 km 19:57 ≈ VDOT 50", () => {
    expect(vdot(5000, 19 * 60 + 57)).toBeCloseTo(50, 0);
  });
  it("predicts equivalent performances close to the published table", () => {
    near(predictTime(50, 10000), 41 * 60 + 21, 20);
    near(predictTime(50, 21097.5), 91 * 60 + 35, 45);
    near(predictTime(50, 42195), 190 * 60 + 49, 90);
  });
  it("orders training paces from slow to fast", () => {
    const p = trainingPaces(50);
    expect(p.map((x) => x.key)).toEqual(["E", "M", "T", "I", "R"]);
    for (let i = 1; i < p.length; i++) expect(p[i].secPerKm[0]).toBeLessThan(p[i - 1].secPerKm[0]);
    near(p.find((x) => x.key === "T")!.secPerKm[0], 255, 10); // ≈4:15/km
  });
  it("takes the best recent 5k/10k effort and ignores old ones", () => {
    const w = (date: string, s: Workout["bestSplitsSec"]): Workout => ({ date, startAt: `${date}T07:00:00Z`, type: "run", durationMin: 50, source: "garmin", createdAt: ts, updatedAt: ts, bestSplitsSec: s });
    const est = bestVdot([w("2026-09-26", { k5: 1500, k10: 3100 }), w("2025-01-01", { k5: 1100 })], TODAY);
    expect(est?.from).toMatchObject({ label: "10 km", date: "2026-09-26" });
    expect(bestVdot([], TODAY)).toBeUndefined();
  });
});

describe("heart-rate zones", () => {
  it("Karvonen zones use heart-rate reserve", () => {
    const z = zonesFor("hrr", { max: 190, rest: 50 })!;
    expect(z[0]).toMatchObject({ low: 120, high: 133 }); // 50 + 140×0.5 … 0.6
    expect(z[4]).toMatchObject({ low: 176, high: 190 });
  });
  it("Friel threshold zones need LTHR", () => {
    expect(zonesFor("lthr", { max: 190 })).toBeUndefined();
    const z = zonesFor("lthr", { lthr: 170, max: 190 })!;
    expect(z[1]).toMatchObject({ low: 145, high: 152 });
    expect(z[3]).toMatchObject({ low: 162, high: 169 });
  });
  it("%HRmax zones", () => {
    expect(zonesFor("hrmax", { max: 200 })![2]).toMatchObject({ low: 140, high: 159 });
    expect(zonesFor("hrr", { max: 190 })).toBeUndefined();
  });
});

describe("HRV trend", () => {
  const m = (date: string, value: number): DailyMetric => ({ date, metric: "hrv", value, source: "garmin", createdAt: ts, updatedAt: ts });
  const history = (base: number, lastWeek: number) => [
    // Realistic night-to-night variation (±8 ms).
    ...Array.from({ length: 50 }, (_, i) => m(addDays(TODAY, -56 + i), base + ((i % 5) - 2) * 4)),
    ...Array.from({ length: 7 }, (_, i) => m(addDays(TODAY, -6 + i), lastWeek)),
  ];
  it("needs 3 weeks", () => {
    expect(hrvTrend([m(TODAY, 50)], TODAY).status).toBe("insufficient");
  });
  it("detects a sustained drop, not a single low night", () => {
    expect(hrvTrend(history(50, 50), TODAY).band).toBe("within");
    expect(hrvTrend(history(50, 38), TODAY).band).toBe("below");
    const oneLow = history(50, 50);
    oneLow[oneLow.length - 1] = m(TODAY, 40);
    expect(hrvTrend(oneLow, TODAY).band).toBe("within");
  });
  it("feeds Readiness as one signal among several", () => {
    const data = emptyData({ metrics: history(50, 38), checkins: [{ date: TODAY, energy: 3, symptoms: [], updatedAt: ts }] });
    const r = readiness(data, TODAY);
    expect(r.reasons).toContain("7-day HRV below your normal range");
    expect(r.level).toBe("recovery");
  });
});

describe("season plan", () => {
  const plan = seasonPlan({ name: "Spring half", date: "2027-03-28" }, TODAY);
  it("runs base → build → peak → taper → race", () => {
    const order = [...new Set(plan.map((w) => w.phase))];
    expect(order).toEqual(["base", "build", "peak", "taper", "race"]);
    expect(plan.at(-1)!.phase).toBe("race");
    expect(plan.filter((w) => w.phase === "taper")).toHaveLength(2);
  });
  it("deloads every 4th loading week and caps the ramp", () => {
    expect(plan.filter((w) => w.deload).length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...plan.map((w) => w.loadFactor))).toBeLessThanOrEqual(MAX_RAMP);
  });
  it("tapers 35–60% below peak", () => {
    const peak = Math.max(...plan.filter((w) => w.phase === "peak").map((w) => w.loadFactor));
    const lastTaper = plan.filter((w) => w.phase === "taper").at(-1)!.loadFactor;
    expect(1 - lastTaper / peak).toBeGreaterThanOrEqual(0.35);
    expect(1 - lastTaper / peak).toBeLessThanOrEqual(0.6);
  });
  it("handles a race next week", () => {
    const short = seasonPlan({ name: "x", date: addDays(TODAY, 8) }, TODAY);
    expect(short.at(-1)!.phase).toBe("race");
    expect(short.length).toBeLessThanOrEqual(3);
  });
});

describe("fuel and evidence", () => {
  it("scales protein to weight and carbs to training time", () => {
    expect(fuelTargets(70, 20)).toMatchObject({ proteinG: [98, 140], carbsG: [210, 350], carbBand: "light" });
    expect(fuelTargets(70, 90).carbBand).toBe("high");
  });
  it("every method lists at least one source", () => {
    expect(METHODS.every((m) => m.sources.length > 0)).toBe(true);
    expect(new Set(METHODS.map((m) => m.id)).size).toBe(METHODS.length);
  });
});
