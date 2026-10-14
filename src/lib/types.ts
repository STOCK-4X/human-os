/**
 * Domain types for Human OS.
 *
 * Every stored data point carries a `source` so the UI can always distinguish
 * device-measured values, user-entered values, calculated estimates and AI text.
 */

/** Where a value came from. Never mix these when displaying. */
export type Source = "manual" | "garmin" | "csv" | "device";
/** Derived values are never stored as measurements; they are computed on read. */
export type Provenance = Source | "calculated" | "ai";

/** Local calendar day in the user's configured time zone, `YYYY-MM-DD`. */
export type DayKey = string;
/** `HH:mm` clock time in the user's configured time zone. */
export type ClockTime = string;

export type Units = "metric" | "imperial";
/** "schedule" = light by day, dark from wind-down until wake-up. */
export type ThemePref = "schedule" | "system" | "light" | "dark";

export interface NotificationPrefs {
  enabled: boolean;
  bedtime: boolean;
  morning: boolean;
  workout: boolean;
  hydration: boolean;
  habits: boolean;
  evening: boolean;
  weeklyReview: boolean;
  challenge: boolean;
  quietStart: ClockTime;
  quietEnd: ClockTime;
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[];
  hydrationEveryMin: number;
}

export interface Profile {
  id: "me";
  displayName: string;
  birthYear?: number;
  heightCm?: number;
  units: Units;
  timeZone: string;
  theme: ThemePref;
  workSchedule?: string;
  targetWake: ClockTime;
  /** Sleep opportunity the user wants (minutes asleep), personal — not a universal norm. */
  sleepNeedMin: number;
  windDownMin: number;
  /** Typical minutes to fall asleep, used for the time-in-bed estimate. */
  sleepLatencyMin: number;
  sleepGoal?: string;
  fitnessGoals: string[];
  trainingDays: number[];
  fitnessLevel: "beginner" | "intermediate" | "advanced";
  preferredActivities: ActivityType[];
  waterTargetMl: number;
  caffeineCutoff: ClockTime;
  hiddenMetrics: string[];
  notifications: NotificationPrefs;
  /** Optional token sent to /api/coach when the server requires one. */
  coachToken?: string;
  aiEnabled: boolean;
  /** full = a celebration sheet, subtle = a small toast, off = timeline only. */
  celebrations: "full" | "subtle" | "off";
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Scalar daily health metrics. */
export type MetricKey =
  | "rhr"
  | "hrv"
  | "hrvStatus"
  | "bodyBattery"
  | "stress"
  | "steps"
  | "activeMin"
  | "calories"
  | "respiration";

export interface DailyMetric {
  id?: number;
  date: DayKey;
  metric: MetricKey;
  value: number;
  source: Source;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SleepRecord {
  id?: number;
  /** The day you woke up. */
  date: DayKey;
  /** ISO instants (UTC). */
  bedtime: string;
  wakeTime: string;
  /** Measured minutes asleep (device or user-known). Absent ⇒ unknown, never zero. */
  asleepMin?: number;
  score?: number;
  deepMin?: number;
  lightMin?: number;
  remMin?: number;
  awakeMin?: number;
  latencyMin?: number;
  awakenings?: number;
  /** Subjective 1–5. */
  quality?: number;
  /** Subjective morning alertness 1–5. */
  alertness?: number;
  notes?: string;
  source: Source;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | "run"
  | "walk"
  | "strength"
  | "swim"
  | "cycle"
  | "mobility"
  | "yoga"
  | "stretch"
  | "other";

export interface StrengthSet {
  exercise: string;
  reps: number;
  weightKg?: number;
  restSec?: number;
}

export interface Workout {
  id?: number;
  date: DayKey;
  startAt: string;
  type: ActivityType;
  title?: string;
  durationMin: number;
  distanceKm?: number;
  avgHr?: number;
  maxHr?: number;
  cadence?: number;
  elevationM?: number;
  calories?: number;
  /** Rate of perceived exertion 1–10. */
  rpe?: number;
  sets?: StrengthSet[];
  notes?: string;
  source: Source;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BodyEntry {
  id?: number;
  date: DayKey;
  weightKg?: number;
  waistCm?: number;
  bodyFatPct?: number;
  muscleKg?: number;
  notes?: string;
  /** "device" = smart scale etc. (an estimate), "manual" = tape/scale reading. */
  source: Source;
  createdAt: string;
  updatedAt: string;
}

export type HabitCategory =
  | "sleep"
  | "movement"
  | "training"
  | "nutrition"
  | "hydration"
  | "mind"
  | "routine"
  | "other";

export type HabitFrequency =
  | { type: "daily" }
  | { type: "days"; days: number[] }
  | { type: "weekly"; timesPerWeek: number };

export interface Habit {
  id?: number;
  name: string;
  category: HabitCategory;
  description?: string;
  frequency: HabitFrequency;
  target?: number;
  unit?: string;
  minimumVersion?: string;
  criteria?: string;
  reminderTime?: ClockTime;
  routine?: "morning" | "evening";
  scheduledTime?: ClockTime;
  durationMin?: number;
  order: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type HabitStatus = "done" | "partial" | "skipped" | "rest";

export interface HabitLog {
  id?: number;
  habitId: number;
  date: DayKey;
  status: HabitStatus;
  value?: number;
  note?: string;
  updatedAt: string;
}

export interface CheckIn {
  date: DayKey;
  /** Subjective, all 1–10. */
  energy?: number;
  /** Physical tiredness. */
  fatigue?: number;
  /** Mental focus. */
  focus?: number;
  mood?: number;
  /** "Do I feel unusually unwell?" — optional. */
  unwell?: boolean;
  intention?: string;
  symptoms: Symptom[];
  note?: string;
  updatedAt: string;
}

export type Symptom =
  | "illness"
  | "fever"
  | "dizziness"
  | "chestPain"
  | "unusualFatigue"
  | "injury"
  | "soreness";

export type LifestyleKind =
  | "water"
  | "caffeine"
  | "alcohol"
  | "meal"
  | "outdoors"
  | "morningLight"
  | "screenBeforeBed";

export interface LifestyleLog {
  id?: number;
  date: DayKey;
  at: string;
  kind: LifestyleKind;
  /** ml for water, mg for caffeine, standard drinks for alcohol, minutes for time-based. */
  amount?: number;
  label?: string;
  note?: string;
  createdAt: string;
}

export interface Experiment {
  id?: number;
  title: string;
  question: string;
  behavior: string;
  metrics: ExperimentMetric[];
  baselineDays: number;
  startDate: DayKey;
  endDate: DayKey;
  status: "planned" | "active" | "completed" | "abandoned";
  conclusion?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExperimentMetric =
  | "sleepMin"
  | "bedtimeSd"
  | "sleepScore"
  | "rhr"
  | "hrv"
  | "energy"
  | "mood"
  | "sleepQuality"
  | "steps";

export interface ExperimentLog {
  id?: number;
  experimentId: number;
  date: DayKey;
  adhered: boolean;
  note?: string;
}

export interface Challenge {
  id?: number;
  startDate: DayKey;
  habitIds: number[];
  intentions: string;
  status: "active" | "completed" | "ended";
  createdAt: string;
  updatedAt: string;
}

export interface Reflection {
  id?: number;
  date: DayKey;
  kind: "daily" | "weekly" | "monthly" | "challenge";
  /** Week start / month key / challenge day, depending on kind. */
  ref: string;
  worked?: string;
  difficult?: string;
  change?: string;
  text?: string;
  updatedAt: string;
}

export interface AiSummary {
  id?: number;
  kind: "daily" | "weekly" | "chat";
  date: DayKey;
  question?: string;
  content: string;
  model: string;
  /** Feedback the user gave on this interpretation. */
  correction?: string;
  createdAt: string;
}

export interface SyncLog {
  id?: number;
  provider: "garmin" | "csv";
  at: string;
  status: "ok" | "partial" | "error";
  message: string;
  inserted: number;
  skipped: number;
}

export interface CoachMemory {
  id?: number;
  text: string;
  createdAt: string;
}

export type AchievementCategory = "sleep" | "fitness" | "recovery" | "habits" | "growth" | "bests" | "custom";
export type PosterFormat = "story" | "square" | "portrait";
export type PosterTheme = "sage" | "sand" | "midnight";

export interface PosterConfig {
  format: PosterFormat;
  theme: PosterTheme;
  /** Stat keys the user chose to show. Sensitive stats are off until switched on. */
  shownStats: string[];
  reflection?: string;
  showName: boolean;
  savedAt: string;
}

/** An unlocked achievement in the personal timeline. */
export interface UnlockedAchievement {
  key: string;
  category: AchievementCategory;
  title: string;
  achievedOn: DayKey;
  unlockedAt: string;
  /** Has the user seen the celebration (or was it unlocked silently from history)? */
  seen: boolean;
  /** Snapshot taken at unlock time, so the poster keeps the verified numbers. */
  headline: string;
  message: string;
  description: string;
  stats: { key: string; label: string; value: string; sensitive?: boolean }[];
  major?: boolean;
  poster?: PosterConfig;
}

export interface CustomAchievement {
  id?: number;
  title: string;
  description?: string;
  category: "growth" | "custom";
  kind: "manual" | "habitCount" | "workoutCount" | "workoutDistance";
  habitId?: number;
  activity?: ActivityType;
  target?: number;
  completedOn?: DayKey;
  createdAt: string;
}
