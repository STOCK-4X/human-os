import { describe, expect, it } from "vitest";
import { buildBriefing } from "@/lib/briefing";
import { buildCoachPayload, CoachPayloadSchema } from "@/lib/coach";
import { addDays, zonedToIso } from "@/lib/date";
import { analyzeExperiment } from "@/lib/experiments";
import { compare, metricOn, summarize } from "@/lib/reports";
import type { DailyMetric, SleepRecord } from "@/lib/types";
import { TZ, emptyData, ts } from "./helpers";

const m = (date: string, metric: DailyMetric["metric"], value: number, source: DailyMetric["source"] = "csv"): DailyMetric => ({
  date,
  metric,
  value,
  source,
  createdAt: ts,
  updatedAt: ts,
});
const night = (wakeDay: string, bed: string, wake: string, asleepMin?: number): SleepRecord => ({
  date: wakeDay,
  bedtime: zonedToIso(bed > "12:00" ? addDays(wakeDay, -1) : wakeDay, bed, TZ),
  wakeTime: zonedToIso(wakeDay, wake, TZ),
  asleepMin,
  source: "manual",
  createdAt: ts,
  updatedAt: ts,
});

describe("weekly summary", () => {
  it("calculates averages only from stored records and never fills gaps", () => {
    const data = emptyData({
      sleep: [night("2026-10-06", "23:00", "07:00", 420), night("2026-10-07", "23:00", "07:00", 450)],
      metrics: [m("2026-10-06", "rhr", 50), m("2026-10-08", "rhr", 54)],
      workouts: [
        { date: "2026-10-07", startAt: ts, type: "run", durationMin: 30, source: "manual", createdAt: ts, updatedAt: ts },
        { date: "2026-10-09", startAt: ts, type: "strength", durationMin: 45, source: "manual", createdAt: ts, updatedAt: ts },
      ],
      checkins: [{ date: "2026-10-06", energy: 8, symptoms: [], updatedAt: ts }],
    });
    const s = summarize(data, "2026-10-05", "2026-10-11");
    expect(s.nights).toBe(2);
    expect(s.avgSleepMin).toBe(435);
    expect(s.sleepIncludesEstimates).toBe(false);
    expect(s.avgRhr).toBe(52);
    expect(s.rhrDays).toBe(2);
    expect(s.avgHrv).toBeUndefined();
    expect(s.workouts).toBe(2);
    expect(s.workoutMin).toBe(75);
    expect(s.avgEnergy).toBe(8);
    expect(s.habitRate).toBeUndefined();
  });

  it("treats small changes as stable", () => {
    const base = summarize(emptyData(), "2026-10-05", "2026-10-11");
    const changes = compare({ ...base, avgRhr: 51 }, { ...base, avgRhr: 50 });
    expect(changes.find((c) => c.label === "Resting heart rate")?.direction).toBe("stable");
    const worse = compare({ ...base, avgRhr: 56 }, { ...base, avgRhr: 50 });
    expect(worse.find((c) => c.label === "Resting heart rate")?.direction).toBe("worsened");
  });

  it("prefers user corrections over imported values", () => {
    const metrics = [m("2026-10-06", "rhr", 70, "csv"), m("2026-10-06", "rhr", 52, "manual")];
    expect(metricOn(metrics, "rhr", "2026-10-06")).toEqual({ date: "2026-10-06", value: 52, source: "manual" });
  });
});

describe("daily briefing", () => {
  it("is explicitly general when there is no personal data", () => {
    const b = buildBriefing(emptyData(), "2026-10-13");
    expect(b.training.general).toBe(true);
    expect(b.dataNotes.join(" ")).toMatch(/No sleep record/);
  });

  it("does not act on a single metric alone — falls back to general guidance", () => {
    const days = Array.from({ length: 10 }, (_, i) => addDays("2026-10-03", i));
    const metrics = days.map((d) => m(d, "rhr", 50 + (d.endsWith("5") ? 1 : 0)));
    metrics.push(m("2026-10-13", "rhr", 60));
    const b = buildBriefing(emptyData({ metrics }), "2026-10-13");
    expect(b.training.general).toBe(true);
    expect(b.attention.join(" ")).toMatch(/Resting heart rate/);
  });

  it("recommends recovery when several signals agree", () => {
    const days = Array.from({ length: 10 }, (_, i) => addDays("2026-10-03", i));
    const metrics = days.map((d) => m(d, "rhr", 50));
    metrics.push(m("2026-10-13", "rhr", 60));
    const data = emptyData({
      metrics,
      sleep: [night("2026-10-13", "01:30", "06:00", 240)],
      checkins: [{ date: "2026-10-13", fatigue: 9, symptoms: [], updatedAt: ts }],
    });
    expect(buildBriefing(data, "2026-10-13").training.intensity).toBe("recovery");
  });

  it("puts safety first for red-flag symptoms", () => {
    const data = emptyData({ checkins: [{ date: "2026-10-13", symptoms: ["chestPain"], updatedAt: ts }] });
    const b = buildBriefing(data, "2026-10-13");
    expect(b.training.intensity).toBe("rest");
    expect(b.safety).toMatch(/medical/);
  });
});

describe("coach payload", () => {
  it("validates against the server schema and excludes identifying fields", () => {
    const data = emptyData({
      profile: { ...emptyData().profile, displayName: "Secret Name", birthYear: 1990, heightCm: 170 },
      sleep: [night("2026-10-13", "23:00", "06:30")],
    });
    const p = buildCoachPayload(data, "daily", ["prefers morning runs"], undefined, undefined, new Date("2026-10-13T08:00:00Z"));
    expect(CoachPayloadSchema.safeParse(p).success).toBe(true);
    const s = JSON.stringify(p);
    expect(s).not.toContain("Secret Name");
    expect(s).not.toContain("1990");
    expect(p.nights[0].sleepIs).toBe("estimated");
  });
});

describe("experiments", () => {
  it("reports insufficient data instead of a conclusion", () => {
    const data = emptyData();
    const r = analyzeExperiment(
      data,
      {
        id: 1,
        title: "t",
        question: "q",
        behavior: "b",
        metrics: ["sleepMin"],
        baselineDays: 7,
        startDate: "2026-10-01",
        endDate: "2026-10-14",
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      },
      [],
      "2026-10-10",
    );
    expect(r.metrics[0].verdict).toBe("insufficient");
    expect(r.elapsedDays).toBe(10);
    expect(r.limitations.length).toBeGreaterThan(1);
  });
});
