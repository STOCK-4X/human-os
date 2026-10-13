import { db, updateProfile } from "./db";
import { addDays, nowIso, todayKey, zonedToIso, minToClock } from "./date";

/**
 * DEVELOPMENT ONLY. Seeds clearly-flagged synthetic data so the UI can be
 * exercised. Never reachable in production builds (guarded by NODE_ENV), and
 * the app shows a persistent "Demo data" banner while it is loaded.
 */
export const DEMO_FLAG = "hos-demo-data";
export const demoAvailable = process.env.NODE_ENV === "development";

export async function seedDemo(tz: string) {
  if (!demoAvailable) throw new Error("Demo data is only available in development.");
  const today = todayKey(tz);
  const now = nowIso();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const around = (m: number, spread: number) => m + (rnd() - 0.5) * 2 * spread;

  await updateProfile({ displayName: "Demo", onboarded: true, timeZone: tz }, db);
  const habitIds = await db.habits.bulkAdd(
    [
      { name: "Outdoor light", category: "routine" as const, routine: "morning" as const, durationMin: 10, minimumVersion: "2 min by a window" },
      { name: "Morning walk", category: "movement" as const, routine: "morning" as const, durationMin: 20, minimumVersion: "5 minutes" },
      { name: "In bed at planned time", category: "sleep" as const, routine: "evening" as const },
      { name: "Stretch", category: "movement" as const, durationMin: 10, reminderTime: "19:00" },
    ].map((h, i) => ({ ...h, frequency: { type: "daily" as const }, order: i, archived: false, createdAt: `${addDays(today, -40)}T08:00:00Z`, updatedAt: now })),
    { allKeys: true },
  );

  for (let i = 40; i >= 0; i--) {
    const day = addDays(today, -i);
    const bed = around(23 * 60 + 15, 40);
    const wake = around(6 * 60 + 40, 20);
    const bedDay = bed >= 1440 ? day : addDays(day, -1);
    const bedtime = zonedToIso(bedDay, minToClock(bed), tz);
    const wakeTime = zonedToIso(day, minToClock(wake), tz);
    const inBed = (Date.parse(wakeTime) - Date.parse(bedtime)) / 60000;
    await db.sleep.add({ date: day, bedtime, wakeTime, asleepMin: Math.round(inBed - around(35, 10)), score: Math.round(around(76, 10)), deepMin: Math.round(around(70, 15)), remMin: Math.round(around(95, 15)), lightMin: Math.round(around(230, 25)), awakeMin: Math.round(around(25, 10)), quality: Math.round(around(3.5, 1.2)), source: "csv", createdAt: now, updatedAt: now });
    for (const [metric, v] of [["rhr", around(54, 3)], ["hrv", around(48, 7)], ["bodyBattery", around(65, 15)], ["stress", around(30, 8)], ["steps", around(8500, 3000)], ["activeMin", around(40, 20)]] as const)
      await db.metrics.add({ date: day, metric, value: Math.round(v), source: "csv", createdAt: now, updatedAt: now });
    const ten = (m: number, s: number) => Math.max(1, Math.min(10, Math.round(around(m, s))));
    await db.checkins.put({ date: day, energy: ten(6.5, 2.5), fatigue: ten(4, 2.5), focus: ten(6.5, 2), mood: ten(7, 2), symptoms: [], updatedAt: now });
    for (const id of habitIds) if (rnd() < 0.7) await db.habitLogs.add({ habitId: id as number, date: day, status: rnd() < 0.85 ? "done" : "partial", updatedAt: now });
    if ([1, 3, 5].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) {
      const run = rnd() < 0.6;
      await db.workouts.add({
        date: day,
        startAt: zonedToIso(day, "07:30", tz),
        type: run ? "run" : "strength",
        durationMin: Math.round(around(35, 8)),
        distanceKm: run ? Math.round(around(5, 1) * 100) / 100 : undefined,
        avgHr: Math.round(around(run ? 148 : 115, 8)),
        rpe: Math.round(around(6, 2)),
        sets: run ? undefined : [{ exercise: "Goblet squat", reps: 10, weightKg: Math.round(around(20, 2)) }, { exercise: "Push-up", reps: 12 }, { exercise: "Dumbbell row", reps: 10, weightKg: Math.round(around(14, 2)) }],
        source: "csv",
        externalId: `demo:${day}`,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  try {
    localStorage.setItem(DEMO_FLAG, "1");
  } catch {}
}
