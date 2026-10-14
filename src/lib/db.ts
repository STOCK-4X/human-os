import Dexie, { type EntityTable } from "dexie";
import { deviceTimeZone, nowIso } from "./date";
import type {
  AiSummary,
  BodyEntry,
  Challenge,
  CheckIn,
  CoachMemory,
  CustomAchievement,
  DailyMetric,
  Experiment,
  ExperimentLog,
  Habit,
  HabitLog,
  LifestyleLog,
  Profile,
  Reflection,
  SleepRecord,
  SyncLog,
  UnlockedAchievement,
  Workout,
} from "./types";

/**
 * Local-first store (IndexedDB). Every write lands on the device first, so
 * entries survive refreshes and offline use. Unique compound indexes (`&[...]`)
 * make imports idempotent: re-importing the same record can never duplicate it.
 * The Postgres schema in `supabase/migrations` mirrors these tables for cloud sync.
 */
export class HumanOsDb extends Dexie {
  profile!: EntityTable<Profile, "id">;
  metrics!: EntityTable<DailyMetric, "id">;
  sleep!: EntityTable<SleepRecord, "id">;
  workouts!: EntityTable<Workout, "id">;
  body!: EntityTable<BodyEntry, "id">;
  habits!: EntityTable<Habit, "id">;
  habitLogs!: EntityTable<HabitLog, "id">;
  checkins!: EntityTable<CheckIn, "date">;
  lifestyle!: EntityTable<LifestyleLog, "id">;
  experiments!: EntityTable<Experiment, "id">;
  experimentLogs!: EntityTable<ExperimentLog, "id">;
  challenges!: EntityTable<Challenge, "id">;
  reflections!: EntityTable<Reflection, "id">;
  aiSummaries!: EntityTable<AiSummary, "id">;
  syncLogs!: EntityTable<SyncLog, "id">;
  coachMemory!: EntityTable<CoachMemory, "id">;
  achievements!: EntityTable<UnlockedAchievement, "key">;
  customAchievements!: EntityTable<CustomAchievement, "id">;

  constructor(name = "human-os") {
    super(name);
    this.version(1).stores({
      profile: "id",
      metrics: "++id, date, metric, &[date+metric+source], externalId",
      sleep: "++id, date, &[date+source], externalId",
      workouts: "++id, date, type, &externalId",
      body: "++id, date",
      habits: "++id, order, archived",
      habitLogs: "++id, date, habitId, &[habitId+date]",
      checkins: "date",
      lifestyle: "++id, date, kind",
      experiments: "++id, status",
      experimentLogs: "++id, experimentId, &[experimentId+date]",
      challenges: "++id, status",
      reflections: "++id, kind, ref, date",
      aiSummaries: "++id, kind, date",
      syncLogs: "++id, provider, at",
      coachMemory: "++id",
    });
    this.version(2).stores({
      achievements: "key, achievedOn, category",
      customAchievements: "++id",
    });
  }
}

export const db = new HumanOsDb();

export const DATA_TABLES = [
  "profile",
  "metrics",
  "sleep",
  "workouts",
  "body",
  "habits",
  "habitLogs",
  "checkins",
  "lifestyle",
  "experiments",
  "experimentLogs",
  "challenges",
  "reflections",
  "aiSummaries",
  "syncLogs",
  "coachMemory",
  "achievements",
  "customAchievements",
] as const;
export type TableName = (typeof DATA_TABLES)[number];

export function defaultProfile(): Profile {
  const now = nowIso();
  return {
    id: "me",
    displayName: "",
    units: "metric",
    timeZone: deviceTimeZone(),
    theme: "schedule",
    targetWake: "06:30",
    sleepNeedMin: 450,
    windDownMin: 45,
    sleepLatencyMin: 15,
    fitnessGoals: [],
    trainingDays: [1, 3, 5],
    fitnessLevel: "beginner",
    preferredActivities: ["walk", "run", "strength"],
    waterTargetMl: 2000,
    caffeineCutoff: "13:00",
    hiddenMetrics: [],
    notifications: {
      enabled: false,
      bedtime: true,
      morning: true,
      workout: false,
      hydration: false,
      habits: true,
      evening: true,
      weeklyReview: true,
      challenge: false,
      quietStart: "22:00",
      quietEnd: "07:00",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      hydrationEveryMin: 120,
    },
    aiEnabled: true,
    celebrations: "full",
    onboarded: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getProfile(database: HumanOsDb = db): Promise<Profile> {
  const p = await database.profile.get("me");
  // Read-only: safe inside live queries. The row is created by the first updateProfile().
  if (p) return { ...defaultProfile(), ...p, notifications: { ...defaultProfile().notifications, ...p.notifications } };
  return defaultProfile();
}

export async function updateProfile(patch: Partial<Profile>, database: HumanOsDb = db) {
  const current = await getProfile(database);
  await database.profile.put({ ...current, ...patch, id: "me", updatedAt: nowIso() });
}

/** Upsert a manual daily metric (one manual value per metric per day). */
export async function setManualMetric(
  date: string,
  metric: DailyMetric["metric"],
  value: number | undefined,
  database: HumanOsDb = db,
) {
  const existing = await database.metrics.where("[date+metric+source]").equals([date, metric, "manual"]).first();
  if (value === undefined || Number.isNaN(value)) {
    if (existing?.id) await database.metrics.delete(existing.id);
    return;
  }
  const now = nowIso();
  if (existing?.id) await database.metrics.update(existing.id, { value, updatedAt: now });
  else await database.metrics.add({ date, metric, value, source: "manual", createdAt: now, updatedAt: now });
}

/** Request persistent storage so the browser doesn't evict health data under pressure. */
export async function requestPersistence(): Promise<boolean | undefined> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return undefined;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
