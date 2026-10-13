import { addDays, weekStart, weekday } from "./date";
import type { Intensity } from "./briefing";
import type { ActivityType, DayKey, Profile, Workout } from "./types";

export interface PlannedSession {
  day: DayKey;
  type: ActivityType;
  title: string;
  detail: string;
  durationMin: number;
}

const RUN_PLAN: Record<Profile["fitnessLevel"], { title: string; detail: string; durationMin: number }[]> = {
  beginner: [
    { title: "Run/walk", detail: "5 min brisk walk · 6 × (1 min easy run + 2 min walk) · 5 min walk", durationMin: 28 },
    { title: "Easy run/walk", detail: "5 min walk · 5 × (2 min easy run + 1 min walk) · 5 min walk", durationMin: 25 },
  ],
  intermediate: [
    { title: "Easy run", detail: "Conversational pace — you could speak in full sentences. Warm up 5 min, cool down 5 min.", durationMin: 35 },
    { title: "Steady run + strides", detail: "30 min easy, then 4 × 20 s relaxed faster strides with full recovery.", durationMin: 40 },
  ],
  advanced: [
    { title: "Easy run", detail: "Easy aerobic pace. Keep it genuinely easy.", durationMin: 45 },
    { title: "Tempo", detail: "15 min easy · 2 × 10 min comfortably hard (4 min easy between) · 10 min easy", durationMin: 50 },
  ],
};

const STRENGTH: Record<Profile["fitnessLevel"], string> = {
  beginner: "Full body, 2 sets each: goblet squat, push-up (incline ok), dumbbell row, hip hinge, plank. Stop 2–3 reps before failure.",
  intermediate: "Full body, 3 sets: squat, bench or push-up, row, Romanian deadlift, overhead press. Add a little weight when all sets feel solid.",
  advanced: "3–4 sets of main lifts with progressive overload, plus accessories. Keep 1–2 reps in reserve.",
};

const OTHER: Partial<Record<ActivityType, { title: string; detail: string; durationMin: number }>> = {
  swim: { title: "Easy swim", detail: "Relaxed continuous swimming or intervals with rest; focus on technique.", durationMin: 30 },
  cycle: { title: "Easy ride", detail: "Steady, conversational effort.", durationMin: 45 },
  walk: { title: "Brisk walk", detail: "Purposeful pace, ideally outdoors.", durationMin: 40 },
  yoga: { title: "Yoga", detail: "A gentle or moderate flow.", durationMin: 30 },
  mobility: { title: "Mobility", detail: "Hips, upper back and ankles; slow and controlled.", durationMin: 20 },
};

/**
 * A simple, conservative weekly template from the user's training days,
 * preferred activities and level. Suggestions only — the user stays in charge.
 */
export function weeklyPlan(profile: Profile, anyDay: DayKey): PlannedSession[] {
  const ws = weekStart(anyDay);
  const prefs = profile.preferredActivities.filter((a) => a !== "other" && a !== "stretch");
  const rotation: ActivityType[] = prefs.length ? prefs : ["walk"];
  const days = [...profile.trainingDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  let runIdx = 0;
  return days.map((wd, i) => {
    const day = addDays(ws, (wd + 6) % 7);
    const type = rotation[i % rotation.length];
    if (type === "run") {
      const r = RUN_PLAN[profile.fitnessLevel][runIdx++ % 2];
      return { day, type, ...r };
    }
    if (type === "strength") return { day, type, title: "Strength", detail: STRENGTH[profile.fitnessLevel], durationMin: 40 };
    const o = OTHER[type] ?? { title: "Movement", detail: "Something you enjoy.", durationMin: 30 };
    return { day, type, ...o };
  });
}

/** Adjust a planned session to today's readiness. Never escalates. */
export function adjustForReadiness(s: PlannedSession, intensity: Intensity): PlannedSession & { adjusted?: string } {
  if (intensity === "rest") return { ...s, adjusted: "Rest today instead — the session can wait." };
  if (intensity === "recovery")
    return { ...s, type: "walk", title: "Recovery walk or mobility", detail: "20–30 min easy walk or gentle mobility.", durationMin: 25, adjusted: "Swapped for recovery." };
  if (intensity === "easy") return { ...s, detail: `${s.detail} Keep everything easy today — shorten if needed.`, adjusted: "Kept easy." };
  return s;
}

export function isPlannedDay(profile: Profile, day: DayKey) {
  return profile.trainingDays.includes(weekday(day));
}

/** Estimated one-rep max (Epley). A calculated estimate, not a tested max. */
export function e1rm(weightKg: number, reps: number) {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

export interface ExerciseProgress {
  exercise: string;
  best: { weightKg: number; reps: number; date: DayKey; e1rm: number };
  last: { date: DayKey; topWeightKg: number; volumeKg: number };
  previous?: { date: DayKey; topWeightKg: number; volumeKg: number };
  sessions: number;
}

export function strengthProgress(workouts: Workout[]): ExerciseProgress[] {
  const map = new Map<string, { date: DayKey; sets: { reps: number; weightKg?: number }[] }[]>();
  for (const w of [...workouts].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
    for (const s of w.sets ?? []) {
      const key = s.exercise.trim();
      if (!key) continue;
      const list = map.get(key) ?? [];
      const cur = list.at(-1);
      if (cur && cur.date === w.date) cur.sets.push(s);
      else list.push({ date: w.date, sets: [s] });
      map.set(key, list);
    }
  }
  const out: ExerciseProgress[] = [];
  for (const [exercise, sessions] of map) {
    let best: ExerciseProgress["best"] | undefined;
    for (const sess of sessions)
      for (const s of sess.sets)
        if (s.weightKg) {
          const est = e1rm(s.weightKg, s.reps);
          if (!best || est > best.e1rm) best = { weightKg: s.weightKg, reps: s.reps, date: sess.date, e1rm: est };
        }
    const summ = (sess: (typeof sessions)[number]) => ({
      date: sess.date,
      topWeightKg: Math.max(0, ...sess.sets.map((s) => s.weightKg ?? 0)),
      volumeKg: sess.sets.reduce((a, s) => a + s.reps * (s.weightKg ?? 0), 0),
    });
    out.push({
      exercise,
      best: best ?? { weightKg: 0, reps: Math.max(...sessions.flatMap((s) => s.sets.map((x) => x.reps))), date: sessions.at(-1)!.date, e1rm: 0 },
      last: summ(sessions.at(-1)!),
      previous: sessions.length > 1 ? summ(sessions.at(-2)!) : undefined,
      sessions: sessions.length,
    });
  }
  return out.sort((a, b) => b.last.date.localeCompare(a.last.date));
}

/** Pace in minutes per km (or mile). */
export function pace(w: Workout, imperial: boolean): number | undefined {
  if (!w.distanceKm || w.distanceKm < 0.2) return undefined;
  const dist = imperial ? w.distanceKm / 1.609344 : w.distanceKm;
  return w.durationMin / dist;
}

export function formatPace(minPer: number | undefined) {
  if (minPer === undefined) return "—";
  const m = Math.floor(minPer);
  const s = Math.round((minPer - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")}`;
}
