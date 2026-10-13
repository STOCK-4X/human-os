import { z } from "zod";
import { buildBriefing } from "./briefing";
import { addDays, clockOf, todayKey, weekStart } from "./date";
import { indexLogs, streak, consistency } from "./habits";
import { compare, type DataSet, metricBaseline, metricOn, sleepInRange, summarize } from "./reports";
import { sleepAmount, timeInBedMin } from "./sleep";
import { scoresFor } from "./scores";
import { round } from "./stats";

/**
 * The exact, minimised data sent to the AI coach. No name, age, weight,
 * body measurements, free-text notes or identifiers leave the device — only
 * recent aggregates. The Profile screen can show this payload verbatim.
 */
const num = z.number().finite().optional();

export const CoachPayloadSchema = z.object({
  kind: z.enum(["daily", "weekly", "chat"]),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localTime: z.string().max(5),
  goals: z.object({
    sleepNeedMin: z.number(),
    targetWake: z.string().max(5),
    caffeineCutoff: z.string().max(5),
    fitnessLevel: z.string().max(20),
    fitnessGoals: z.array(z.string().max(120)).max(10),
    trainingDays: z.array(z.number().int().min(0).max(6)).max(7),
    preferredActivities: z.array(z.string().max(20)).max(10),
  }),
  nights: z
    .array(
      z.object({
        date: z.string().max(10),
        sleepMin: z.number(),
        sleepIs: z.enum(["measured", "estimated"]),
        timeInBedMin: z.number(),
        bedtime: z.string().max(5),
        wake: z.string().max(5),
        score: num,
        quality: num,
      }),
    )
    .max(14),
  recovery: z.record(
    z.string().max(20),
    z.object({ today: num, source: z.string().max(10).optional(), baseline: num, baselineDays: z.number() }),
  ),
  checkin: z
    .object({ scale: z.literal("1-10"), energy: num, physicalTiredness: num, focus: num, mood: num, unwell: z.boolean().optional(), symptoms: z.array(z.string().max(20)).max(10) })
    .optional(),
  workouts: z
    .array(z.object({ date: z.string().max(10), type: z.string().max(20), durationMin: z.number(), rpe: num, distanceKm: num }))
    .max(30),
  habits: z.array(z.object({ name: z.string().max(80), last7Rate: num, streak: z.number() })).max(30),
  week: z
    .object({
      changes: z.array(z.object({ label: z.string().max(60), direction: z.string().max(10), detail: z.string().max(60) })).max(10),
      summary: z.record(z.string().max(40), z.union([z.number(), z.string().max(40), z.null()])),
    })
    .optional(),
  scores: z
    .object({
      note: z.string().max(200),
      energy: num,
      recovery: num,
      sleep: num,
      readiness: z.string().max(20),
      garminBodyBattery: num,
      deviceSleepScore: num,
    })
    .optional(),
  calculated: z.object({
    trainingSuggestion: z.string().max(200),
    reasons: z.array(z.string().max(200)).max(10),
    bedtime: z.object({ windDownStart: z.string().max(5), lightsOut: z.string().max(5) }),
    safety: z.string().max(400).optional(),
  }),
  memory: z.array(z.string().max(300)).max(20),
  question: z.string().max(2000).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).max(20).optional(),
});

export type CoachPayload = z.infer<typeof CoachPayloadSchema>;

export function buildCoachPayload(
  data: DataSet,
  kind: CoachPayload["kind"],
  memory: string[],
  question?: string,
  history?: CoachPayload["history"],
  now: Date = new Date(),
): CoachPayload {
  const { profile } = data;
  const tz = profile.timeZone;
  const today = todayKey(tz, now);
  const b = buildBriefing(data, today);
  const nights = sleepInRange(data.sleep, addDays(today, -6), today).map((n) => {
    const amt = sleepAmount(n, profile.sleepLatencyMin);
    return {
      date: n.date,
      sleepMin: amt.minutes,
      sleepIs: amt.kind,
      timeInBedMin: timeInBedMin(n),
      bedtime: clockOf(n.bedtime, tz),
      wake: clockOf(n.wakeTime, tz),
      score: n.score,
      quality: n.quality,
    };
  });

  const recovery: CoachPayload["recovery"] = {};
  for (const key of ["rhr", "hrv", "bodyBattery", "stress"] as const) {
    const p = metricOn(data.metrics, key, today);
    const bl = metricBaseline(data.metrics, key, today);
    if (p || bl.n) recovery[key] = { today: p?.value, source: p?.source, baseline: round(bl.mean, 1), baselineDays: bl.n };
  }
  const steps = metricOn(data.metrics, "steps", addDays(today, -1));
  if (steps) recovery.stepsYesterday = { today: steps.value, source: steps.source, baselineDays: 0 };

  const ck = data.checkins.find((c) => c.date === today);
  const idx = indexLogs(data.habitLogs);
  const habits = data.habits
    .filter((h) => !h.archived)
    .map((h) => ({
      name: h.name,
      last7Rate: round(consistency(h, idx, addDays(today, -6), today).rate, 2),
      streak: streak(h, idx, today),
    }));

  let week: CoachPayload["week"];
  if (kind === "weekly") {
    const ws = weekStart(today);
    // Review the most recent complete week.
    const lastWs = addDays(ws, -7);
    const cur = summarize(data, lastWs, addDays(lastWs, 6));
    const prev = summarize(data, addDays(lastWs, -7), addDays(lastWs, -1));
    week = {
      changes: compare(cur, prev),
      summary: {
        from: cur.from,
        to: cur.to,
        nights: cur.nights,
        avgSleepMin: round(cur.avgSleepMin) ?? null,
        sleepIncludesEstimates: cur.sleepIncludesEstimates ? "yes" : "no",
        bedtimeSdMin: round(cur.bedtimeSdMin) ?? null,
        avgRhr: round(cur.avgRhr, 1) ?? null,
        avgHrv: round(cur.avgHrv, 1) ?? null,
        workouts: cur.workouts,
        workoutMin: cur.workoutMin,
        habitRate: round(cur.habitRate, 2) ?? null,
        avgEnergy: round(cur.avgEnergy, 1) ?? null,
        checkinDays: cur.checkinDays,
      },
    };
  }

  const sc = scoresFor(data, today);
  return {
    kind,
    today,
    scores: {
      note: "energy/recovery/sleep are Human OS estimates from personal baselines (missing = not enough data); garminBodyBattery and deviceSleepScore are the device's own values.",
      energy: sc.energy.value,
      recovery: sc.recovery.value,
      sleep: sc.sleep.value,
      readiness: sc.readiness.level,
      garminBodyBattery: sc.bodyBattery?.value,
      deviceSleepScore: sc.deviceSleepScore?.value,
    },
    localTime: clockOf(now, tz),
    goals: {
      sleepNeedMin: profile.sleepNeedMin,
      targetWake: profile.targetWake,
      caffeineCutoff: profile.caffeineCutoff,
      fitnessLevel: profile.fitnessLevel,
      fitnessGoals: profile.fitnessGoals.slice(0, 10),
      trainingDays: profile.trainingDays,
      preferredActivities: profile.preferredActivities,
    },
    nights,
    recovery,
    checkin: ck && { scale: "1-10" as const, energy: ck.energy, physicalTiredness: ck.fatigue, focus: ck.focus, mood: ck.mood, unwell: ck.unwell, symptoms: ck.symptoms },
    workouts: data.workouts
      .filter((w) => w.date > addDays(today, -14) && w.date <= today)
      .slice(-30)
      .map((w) => ({ date: w.date, type: w.type, durationMin: Math.round(w.durationMin), rpe: w.rpe, distanceKm: w.distanceKm })),
    habits: habits.slice(0, 30),
    week,
    calculated: {
      trainingSuggestion: b.training.headline,
      reasons: b.training.reasons,
      bedtime: { windDownStart: b.bedtime.windDownStart, lightsOut: b.bedtime.lightsOut },
      safety: b.safety,
    },
    memory: memory.slice(-20),
    question,
    history,
  };
}
