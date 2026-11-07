import { addDays, weekStart, weekday } from "./date";
import { type Pace, type Phase, type SeasonWeek, seasonPlan, trainingPaces, type VdotEstimate } from "./performance";
import type { Readiness } from "./scores";
import type { ActivityType, Condition, DayKey, Profile } from "./types";

/**
 * Turns the season phase, your paces/zones, level and today's readiness into
 * concrete sessions. Principles: mostly easy (Seiler), one or two quality days
 * (Daniels), long session at the weekend, strength 1–2×/week, and every
 * adjustment goes toward *less* — never more — than planned.
 */

export type SessionKind = "rest" | "easy" | "easy-strides" | "long" | "threshold" | "intervals" | "race-pace" | "strength" | "mobility" | "race" | "cross";

export interface Step {
  label: string;
  detail: string;
}

export interface Session {
  day: DayKey;
  kind: SessionKind;
  type: ActivityType;
  title: string;
  purpose: string;
  totalMin: number;
  steps: Step[];
  phase: Phase;
  /** Why the session was changed from the plan, if it was. */
  adjusted?: string;
}

const TEMPLATES: Record<Phase, SessionKind[]> = {
  base: ["easy", "long", "strength", "easy-strides", "easy", "easy", "easy"],
  build: ["threshold", "long", "strength", "easy", "intervals", "easy", "easy"],
  peak: ["intervals", "long", "strength", "race-pace", "easy", "easy", "easy"],
  taper: ["race-pace", "easy-strides", "strength", "easy", "easy", "easy", "easy"],
  race: ["easy-strides", "race", "easy", "easy", "easy", "easy", "easy"],
  recovery: ["easy", "mobility", "easy", "easy", "easy", "easy", "easy"],
};

const BASE_MIN: Record<Profile["fitnessLevel"], number> = { beginner: 25, intermediate: 40, advanced: 55 };

const fmt = (secPerKm: number, imperial: boolean) => {
  const s = imperial ? secPerKm * 1.609344 : secPerKm;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/${imperial ? "mi" : "km"}`;
};

interface Ctx {
  profile: Profile;
  paces?: Pace[];
  /** Zone bpm ranges [Z1..Z5] when no paces. */
  zones?: { zone: number; low: number; high: number }[];
  loadFactor: number;
  phase: Phase;
}

function target(ctx: Ctx, key: Pace["key"]): string {
  const imp = ctx.profile.units === "imperial";
  const p = ctx.paces?.find((x) => x.key === key);
  const zoneFor: Record<Pace["key"], number> = { E: 2, M: 3, T: 4, I: 5, R: 5 };
  const z = ctx.zones?.find((x) => x.zone === zoneFor[key]);
  const pace = p ? (key === "E" ? `${fmt(p.secPerKm[0], imp)}–${fmt(p.secPerKm[1], imp)}` : fmt(p.secPerKm[0], imp)) : undefined;
  const hr = z ? `Z${z.zone} ${z.low}–${z.high} bpm` : undefined;
  const feel = { E: "conversational", M: "steady, controlled", T: "comfortably hard", I: "hard, 3–5 min sustainable", R: "fast, relaxed form" }[key];
  return [pace, hr, feel].filter(Boolean).join(" · ");
}

function goalPaceKey(profile: Profile): Pace["key"] {
  const d = profile.goalRace?.distanceKm;
  if (!d) return "M";
  if (d <= 5) return "I";
  if (d <= 10) return "T";
  if (d <= 21.1) return "T";
  return "M";
}

function build(kind: SessionKind, ctx: Ctx, day: DayKey, runType: ActivityType): Session {
  const lvl = ctx.profile.fitnessLevel;
  const base = Math.round((BASE_MIN[lvl] * Math.min(ctx.loadFactor, 1.5)) / 5) * 5;
  const beginner = lvl === "beginner";
  const mk = (title: string, purpose: string, totalMin: number, steps: Step[], type: ActivityType = runType): Session => ({ day, kind, type, title, purpose, totalMin, steps, phase: ctx.phase });
  const wu = { label: "Warm-up", detail: `10 min easy · ${target(ctx, "E")}` };
  const cd = { label: "Cool-down", detail: `10 min easy · ${target(ctx, "E")}` };
  switch (kind) {
    case "easy":
      return mk("Easy aerobic", "Builds your aerobic base with little fatigue.", base, [{ label: `${base} min easy`, detail: target(ctx, "E") }]);
    case "easy-strides":
      return mk("Easy + strides", "Aerobic base plus relaxed speed for form.", base + 5, [
        { label: `${base} min easy`, detail: target(ctx, "E") },
        { label: "6 × 20 s strides", detail: "Smooth and quick, not a sprint; walk back to recover." },
      ]);
    case "long": {
      const m = Math.round((base * (beginner ? 1.5 : 1.8)) / 5) * 5;
      return mk("Long easy", "Durability and endurance — the cornerstone session.", m, [{ label: `${m} min easy`, detail: `${target(ctx, "E")} · walk breaks are fine` }]);
    }
    case "threshold": {
      const rep = beginner ? 5 : lvl === "intermediate" ? 8 : 10;
      return mk("Threshold", "Raises the pace you can hold for a long time.", 20 + rep * 3 + 4, [
        wu,
        { label: `3 × ${rep} min`, detail: `${target(ctx, "T")} · 2 min easy jog between` },
        cd,
      ]);
    }
    case "intervals": {
      if (beginner)
        return mk("Fartlek", "First taste of faster running, kept playful.", 35, [wu, { label: "6 × 1 min brisk", detail: "2 min easy between · brisk, not all-out" }, cd]);
      const rep = lvl === "intermediate" ? 3 : 4;
      return mk("Intervals", "Improves VO2max — the engine size.", 20 + rep * 5 * 2, [wu, { label: `5 × ${rep} min`, detail: `${target(ctx, "I")} · equal-time easy jog between` }, cd]);
    }
    case "race-pace": {
      const k = goalPaceKey(ctx.profile);
      const rep = beginner ? 6 : lvl === "intermediate" ? 10 : 15;
      return mk("Race-pace practice", "Rehearses goal effort so race day feels familiar.", 20 + rep * 2 + 3, [
        wu,
        { label: `2 × ${rep} min`, detail: `${target(ctx, k)} · 3 min easy between` },
        cd,
      ]);
    }
    case "strength":
      return mk(
        "Strength",
        "Stronger muscles and tendons — fewer injuries, better economy.",
        40,
        [
          { label: "Lower body", detail: "Squat or goblet squat, Romanian deadlift, split squat — 3 × 6–10" },
          { label: "Upper & core", detail: "Row or pull-up, push-up or press, plank / side plank — 3 sets" },
          { label: "Effort", detail: "Stop each set with 1–3 reps in reserve (RIR); add weight when all sets feel solid." },
        ],
        "strength",
      );
    case "mobility":
      return mk("Mobility", "Easy movement that helps you recover.", 20, [{ label: "20 min", detail: "Hips, ankles, upper back; or an easy walk" }], "mobility");
    case "race":
      return mk(ctx.profile.goalRace?.name ?? "Race", "Race day — trust the training.", 0, [
        { label: "Warm-up", detail: "10–15 min easy with 3–4 strides" },
        { label: "Pacing", detail: `Start controlled · ${target(ctx, goalPaceKey(ctx.profile))}` },
      ]);
    case "cross":
      return mk("Cross-training", "Fitness without impact.", base, [{ label: `${base} min easy`, detail: "Bike, swim or elliptical at conversational effort" }], "cycle");
    case "rest":
      return mk("Rest", "Recovery is when adaptation happens.", 0, [{ label: "Rest", detail: "Sleep, food, a gentle walk if you like" }], "walk");
  }
}

export interface PlanInput {
  profile: Profile;
  today: DayKey;
  vdot?: VdotEstimate;
  zones?: { zone: number; low: number; high: number }[];
  readiness?: Readiness;
  conditions?: Condition[];
}

/** Sessions for the training days of the week containing `today`. */
export function weekSessions(input: PlanInput): Session[] {
  const { profile, today } = input;
  const ws = weekStart(today);
  const season: SeasonWeek | undefined = profile.goalRace?.date && profile.goalRace.date >= today ? seasonPlan(profile.goalRace, today)[0] : undefined;
  const phase: Phase = season?.phase ?? "base";
  const ctx: Ctx = {
    profile,
    paces: input.vdot ? trainingPaces(input.vdot.vdot) : undefined,
    zones: input.zones,
    loadFactor: season ? (season.deload ? 0.7 : Math.min(season.loadFactor, 1.3)) : 1,
    phase,
  };
  const prefersRun = profile.preferredActivities.includes("run");
  const runType: ActivityType = prefersRun ? "run" : (profile.preferredActivities.find((a) => a === "cycle" || a === "swim" || a === "walk") ?? "walk");
  const lifts = profile.preferredActivities.includes("strength");
  const days = [...profile.trainingDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((wd) => addDays(ws, (wd + 6) % 7));
  if (!days.length) return [];

  let kinds = TEMPLATES[phase].slice(0, days.length);
  if (!lifts) kinds = kinds.map((k) => (k === "strength" ? "easy" : k));
  if (!prefersRun) kinds = kinds.map((k) => (k === "intervals" || k === "threshold" || k === "race-pace" ? "easy" : k));
  // Long session goes on the last training day of the week; hard sessions never back-to-back.
  const long = kinds.indexOf("long");
  if (long >= 0) {
    kinds.splice(long, 1);
    kinds.push("long");
  }
  const sessions = days.map((d, i) => build(kinds[i], ctx, d, runType));
  // Race week: put the race on race day if it falls this week.
  if (phase === "race" && profile.goalRace) {
    const rd = profile.goalRace.date;
    const idx = sessions.findIndex((s) => s.kind === "race");
    if (idx >= 0 && rd >= ws && rd <= addDays(ws, 6)) sessions[idx] = { ...sessions[idx], day: rd };
  }
  return sessions.map((s) => (s.day === today ? adjust(s, input, ctx, runType) : s));
}

/** Today's session (or undefined if today isn't a training day). */
export function todaySession(input: PlanInput): Session | undefined {
  return weekSessions(input).find((s) => s.day === input.today);
}

const HARD: SessionKind[] = ["threshold", "intervals", "race-pace", "long"];

function adjust(s: Session, input: PlanInput, ctx: Ctx, runType: ActivityType): Session {
  const active = (input.conditions ?? []).filter((c) => c.start <= input.today && (!c.end || c.end >= input.today));
  const illness = active.find((c) => c.kind === "illness");
  const injury = active.find((c) => c.kind === "injury");
  if (illness) {
    if (illness.belowNeck || illness.severity >= 2)
      return { ...build("rest", ctx, s.day, runType), adjusted: `Rest while ill (${illness.label}). Resume with easy sessions once you've been symptom-free for 24 h.` };
    return { ...build("easy", ctx, s.day, runType), totalMin: Math.min(30, s.totalMin), adjusted: "Mild head-cold symptoms only: easy and short at most; stop if you feel worse." };
  }
  if (injury && s.kind !== "race") {
    if (injury.severity >= 2) return { ...build("cross", ctx, s.day, runType), adjusted: `Protecting your ${injury.bodyPart ?? injury.label}: pain-free cross-training instead.` };
    if (HARD.includes(s.kind)) return { ...build("easy", ctx, s.day, runType), adjusted: `Minor ${injury.label}: easy only, and stop if pain rises above 3/10.` };
  }
  const r = input.readiness;
  if (!r || s.kind === "race") return s;
  if (r.level === "recovery") {
    if (r.symptomDriven) return { ...build("rest", ctx, s.day, runType), adjusted: "Rest today — you reported feeling unwell." };
    return { ...build("mobility", ctx, s.day, runType), adjusted: `Swapped for recovery: ${r.reasons.join(", ")}.` };
  }
  if (r.level === "moderate" && HARD.includes(s.kind)) {
    const easy = build("easy", ctx, s.day, runType);
    return { ...easy, totalMin: Math.round((s.totalMin * 0.8) / 5) * 5, steps: [{ label: `${Math.round((s.totalMin * 0.8) / 5) * 5} min easy`, detail: easy.steps[0].detail }], adjusted: `Kept easy instead of ${s.title.toLowerCase()}: ${r.reasons.join(", ")}.` };
  }
  return s;
}

export const isTrainingDay = (profile: Profile, day: DayKey) => profile.trainingDays.includes(weekday(day));
