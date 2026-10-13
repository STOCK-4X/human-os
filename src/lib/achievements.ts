import { CHALLENGE_DAYS, challengeDay } from "./challenge";
import { addDays, clockOf, clockToMin, dayRange, formatDay, weekStart, weekday } from "./date";
import { consistency, indexLogs, isScheduled } from "./habits";
import { type DataSet, sleepByDate, sleepInRange } from "./reports";
import { sleepAmount } from "./sleep";
import { clockSd, mean } from "./stats";
import { formatPace, pace } from "./training";
import type { AchievementCategory, Challenge, CustomAchievement, DayKey, Workout } from "./types";

/**
 * Achievements are derived only from stored records. Each rule says exactly
 * what counts, and every statistic shown on a poster comes from the same
 * records. Health-sensitive stats are flagged so posters hide them by default.
 */

export interface AchStat {
  key: string;
  label: string;
  value: string;
  /** Exact schedules and physiological values — hidden on posters unless switched on. */
  sensitive?: boolean;
}

export interface Achievement {
  key: string;
  category: AchievementCategory;
  title: string;
  /** Short, uppercase-friendly poster headline. */
  headline: string;
  message: string;
  description: string;
  achievedOn?: DayKey;
  stats: AchStat[];
  progress?: { current: number; target: number; unit?: string };
  /** Bigger moments get a full celebration; small ones only a toast. */
  major?: boolean;
}

export interface AchievementContext {
  data: DataSet;
  challenges: Challenge[];
  customs: CustomAchievement[];
  today: DayKey;
}

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  sleep: "Sleep",
  fitness: "Fitness",
  recovery: "Recovery & energy",
  habits: "Habits",
  growth: "Personal growth",
  bests: "Personal bests",
  custom: "Custom",
};

const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
const km = (w: Workout) => w.distanceKm ?? 0;
const sorted = (ws: Workout[]) => [...ws].sort((a, b) => a.startAt.localeCompare(b.startAt));
const done = (s?: string) => s === "done" || s === "partial";

/** First day on which `ok` held for `n` consecutive calendar days. */
function firstRun(days: DayKey[], ok: (d: DayKey) => boolean, n: number): { end?: DayKey; best: number } {
  let run = 0;
  let best = 0;
  for (const d of days) {
    run = ok(d) ? run + 1 : 0;
    best = Math.max(best, run);
    if (run >= n) return { end: d, best: n };
  }
  return { best: run };
}

/* -------------------------------------------------------------------------- */

function sleepAchievements({ data, today }: AchievementContext): Achievement[] {
  const { profile } = data;
  const tz = profile.timeZone;
  const nights = [...sleepByDate(data.sleep).values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!nights.length) return [];
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const days = dayRange(nights[0].date, today);
  const out: Achievement[] = [];

  // 7 consecutive logged nights whose bedtimes vary by ≤30 min (SD).
  let consistentEnd: DayKey | undefined;
  let streak = 0;
  for (const d of days) {
    streak = byDate.has(d) ? streak + 1 : 0;
    if (streak >= 7) {
      const win = dayRange(addDays(d, -6), d).map((x) => byDate.get(x)!);
      const sdv = clockSd(win.map((n) => clockToMin(clockOf(n.bedtime, tz))))!;
      if (sdv <= 30) {
        consistentEnd = d;
        break;
      }
    }
  }
  {
    const win = consistentEnd ? dayRange(addDays(consistentEnd, -6), consistentEnd).map((x) => byDate.get(x)!) : [];
    const sdv = win.length ? clockSd(win.map((n) => clockToMin(clockOf(n.bedtime, tz)))) : undefined;
    out.push({
      key: "sleep-consistent-7",
      category: "sleep",
      title: "7 nights of consistent sleep",
      headline: "7 Days of Better Sleep",
      message: "Consistency is the quiet superpower.",
      description: "Seven nights in a row logged, with bedtimes within about half an hour of each other.",
      achievedOn: consistentEnd,
      stats: consistentEnd
        ? [
            { key: "nights", label: "Nights in a row", value: "7" },
            { key: "spread", label: "Bedtime spread", value: `±${Math.round(sdv!)} min` },
            { key: "avgSleep", label: "Average sleep", value: fmtMin(mean(win.map((n) => sleepAmount(n, profile.sleepLatencyMin).minutes))!), sensitive: true },
          ]
        : [],
      progress: consistentEnd ? undefined : { current: Math.min(streak, 6), target: 7, unit: "nights" },
      major: true,
    });
  }

  // 7 consecutive nights meeting the person's own sleep need (within 15 min).
  const met = firstRun(days, (d) => {
    const n = byDate.get(d);
    return !!n && sleepAmount(n, profile.sleepLatencyMin).minutes >= profile.sleepNeedMin - 15;
  }, 7);
  out.push({
    key: "sleep-goal-7",
    category: "sleep",
    title: "A week at your sleep goal",
    headline: "A Week of Enough Sleep",
    message: "Rest is part of the work.",
    description: `Seven nights in a row at or near your ${fmtMin(profile.sleepNeedMin)} sleep goal.`,
    achievedOn: met.end,
    stats: met.end ? [{ key: "nights", label: "Nights in a row", value: "7" }, { key: "goal", label: "Sleep goal", value: fmtMin(profile.sleepNeedMin), sensitive: true }] : [],
    progress: met.end ? undefined : { current: met.best, target: 7, unit: "nights" },
  });

  // Average sleep up ≥20 min: last 28 days vs the 28 before (≥14 nights each).
  const cur = sleepInRange(data.sleep, addDays(today, -27), today);
  const prev = sleepInRange(data.sleep, addDays(today, -55), addDays(today, -28));
  if (cur.length >= 14 && prev.length >= 14) {
    const a = mean(cur.map((n) => sleepAmount(n, profile.sleepLatencyMin).minutes))!;
    const b = mean(prev.map((n) => sleepAmount(n, profile.sleepLatencyMin).minutes))!;
    if (a - b >= 20)
      out.push({
        key: `sleep-improved:${today.slice(0, 7)}`,
        category: "sleep",
        title: "Sleeping longer",
        headline: "More Sleep, Steadily",
        message: "Small changes, real progress.",
        description: "Your average sleep over the last 4 weeks is at least 20 minutes longer than the 4 weeks before.",
        achievedOn: today,
        stats: [
          { key: "gain", label: "More per night", value: `+${Math.round(a - b)} min` },
          { key: "nights", label: "Nights compared", value: `${cur.length} vs ${prev.length}` },
          { key: "avg", label: "New average", value: fmtMin(a), sensitive: true },
        ],
      });
  }

  // Evening routine: every scheduled evening habit done 7 days in a row.
  const evening = data.habits.filter((h) => h.routine === "evening" && !h.archived);
  if (evening.length) {
    const idx = indexLogs(data.habitLogs);
    const start = evening.map((h) => h.createdAt.slice(0, 10)).sort()[0];
    const r = firstRun(dayRange(start, today), (d) => {
      const due = evening.filter((h) => isScheduled(h, d) && h.createdAt.slice(0, 10) <= d);
      return due.length > 0 && due.every((h) => done(idx.get(`${h.id}|${d}`)?.status));
    }, 7);
    out.push({
      key: "evening-routine-7",
      category: "sleep",
      title: "Evening routine, 7 days running",
      headline: "Evenings, Owned",
      message: "You set tomorrow up tonight.",
      description: "Your whole evening routine completed seven days in a row.",
      achievedOn: r.end,
      stats: r.end ? [{ key: "days", label: "Days in a row", value: "7" }, { key: "items", label: "Routine steps", value: String(evening.length) }] : [],
      progress: r.end ? undefined : { current: r.best, target: 7, unit: "days" },
    });
  }
  return out;
}

function fitnessAchievements({ data, today }: AchievementContext): Achievement[] {
  const imp = data.profile.units === "imperial";
  const dist = (k: number) => (imp ? `${(k / 1.609344).toFixed(2)} mi` : `${k.toFixed(2)} km`);
  const runs = sorted(data.workouts.filter((w) => w.type === "run"));
  const swims = sorted(data.workouts.filter((w) => w.type === "swim"));
  const out: Achievement[] = [];

  const first = runs[0];
  out.push({
    key: "first-run",
    category: "fitness",
    title: "First run",
    headline: "First Run Done",
    message: "Every runner started exactly here.",
    description: "Your first logged run.",
    achievedOn: first?.date,
    stats: first ? [{ key: "time", label: "Time", value: `${Math.round(first.durationMin)} min` }, ...(first.distanceKm ? [{ key: "dist", label: "Distance", value: dist(first.distanceKm) }] : [])] : [],
    major: true,
  });

  const fiveK = runs.find((r) => km(r) >= 5);
  const longestSoFar = Math.max(0, ...runs.map(km));
  out.push({
    key: "first-5k",
    category: "fitness",
    title: "First 5K",
    headline: "First 5K Completed",
    message: "You showed up for yourself.",
    description: "Your first run of 5 km or more.",
    achievedOn: fiveK?.date,
    stats: fiveK ? [{ key: "dist", label: "Distance", value: dist(km(fiveK)) }, { key: "time", label: "Time", value: `${Math.floor(fiveK.durationMin)}:${String(Math.round((fiveK.durationMin % 1) * 60)).padStart(2, "0")}` }, { key: "pace", label: `Pace /${imp ? "mi" : "km"}`, value: formatPace(pace(fiveK, imp)) }] : [],
    progress: fiveK ? undefined : { current: Math.round(longestSoFar * 10) / 10, target: 5, unit: "km longest" },
    major: true,
  });

  // Personal records: longest run (needs 2 earlier runs to compare against).
  let best = 0;
  runs.forEach((r, i) => {
    if (km(r) > best && i >= 2 && best > 0) {
      out.push({
        key: `pb-longest-run:${r.date}`,
        category: "bests",
        title: "Longest run yet",
        headline: "Your Longest Run Yet",
        message: "Further than ever before.",
        description: `A new longest run, beating your previous best of ${dist(best)}.`,
        achievedOn: r.date,
        stats: [{ key: "dist", label: "Distance", value: dist(km(r)) }, { key: "prev", label: "Previous best", value: dist(best) }, { key: "time", label: "Time", value: `${Math.round(r.durationMin)} min` }],
        major: true,
      });
    }
    best = Math.max(best, km(r));
  });

  // Best pace over a comparable distance (4.8–5.5 km).
  let bestPace = Infinity;
  for (const r of runs.filter((r) => km(r) >= 4.8 && km(r) <= 5.5)) {
    const p = pace(r, false)!;
    if (p < bestPace && bestPace !== Infinity)
      out.push({
        key: `pb-5k-pace:${r.date}`,
        category: "bests",
        title: "Fastest 5K pace",
        headline: "Faster Than Ever",
        message: "Patience, then pace.",
        description: "Your best pace over a comparable ~5 km run.",
        achievedOn: r.date,
        stats: [{ key: "pace", label: `Pace /${imp ? "mi" : "km"}`, value: formatPace(pace(r, imp)) }, { key: "prev", label: "Previous best", value: formatPace(imp ? bestPace * 1.609344 : bestPace) }, { key: "dist", label: "Distance", value: dist(km(r)) }],
      });
    bestPace = Math.min(bestPace, p);
  }

  // Weekly activity goal: 150 minutes in a Monday–Sunday week.
  const weeks = new Map<DayKey, number>();
  for (const w of data.workouts) weeks.set(weekStart(w.date), (weeks.get(weekStart(w.date)) ?? 0) + w.durationMin);
  const hit = [...weeks.entries()].sort().find(([, m]) => m >= 150);
  const thisWeek = weeks.get(weekStart(today)) ?? 0;
  out.push({
    key: "active-week-150",
    category: "fitness",
    title: "150 active minutes in a week",
    headline: "150 Minutes Strong",
    message: "A full week of moving well.",
    description: "At least 150 minutes of logged training in one week.",
    achievedOn: hit ? (addDays(hit[0], 6) > today ? today : addDays(hit[0], 6)) : undefined,
    stats: hit ? [{ key: "min", label: "Minutes that week", value: String(Math.round(hit[1])) }] : [],
    progress: hit ? undefined : { current: Math.round(thisWeek), target: 150, unit: "min this week" },
  });

  // Completed a training plan week: every planned day had a session.
  const planned = data.profile.trainingDays;
  if (planned.length >= 2 && data.workouts.length) {
    const firstWs = weekStart(sorted(data.workouts)[0].date);
    for (let ws = firstWs; addDays(ws, 6) < today; ws = addDays(ws, 7)) {
      const days = dayRange(ws, addDays(ws, 6)).filter((d) => planned.includes(weekday(d)));
      if (days.every((d) => data.workouts.some((w) => w.date === d))) {
        out.push({
          key: "plan-week-complete",
          category: "fitness",
          title: "Training plan week completed",
          headline: "Plan Kept, Week Done",
          message: "You did what you said you'd do.",
          description: "Every planned training day in a week had a session.",
          achievedOn: addDays(ws, 6),
          stats: [{ key: "sessions", label: "Planned sessions", value: String(days.length) }],
        });
        break;
      }
    }
  }

  // Swimming milestones.
  if (swims.length) {
    out.push({ key: "first-swim", category: "fitness", title: "First swim", headline: "Into the Water", message: "A new way to move.", description: "Your first logged swim.", achievedOn: swims[0].date, stats: [{ key: "time", label: "Time", value: `${Math.round(swims[0].durationMin)} min` }] });
    let total = 0;
    let reached: DayKey | undefined;
    for (const s of swims) {
      total += km(s);
      if (!reached && total >= 10) reached = s.date;
    }
    out.push({ key: "swim-10k", category: "fitness", title: "10 km swum", headline: "10K in the Pool", message: "Length by length.", description: "10 km of swimming logged in total.", achievedOn: reached, stats: reached ? [{ key: "total", label: "Total distance", value: dist(10) }, { key: "swims", label: "Swims", value: String(swims.length) }] : [], progress: reached ? undefined : { current: Math.round(total * 10) / 10, target: 10, unit: "km" } });
  }
  return out;
}

function recoveryAchievements({ data, today }: AchievementContext): Achievement[] {
  const out: Achievement[] = [];
  const { profile } = data;

  // Energy trend: felt energy up ≥1 point (1–10), 4 weeks vs the 4 before, ≥14 check-ins each.
  const cks = (from: DayKey, to: DayKey) => data.checkins.filter((c) => c.date >= from && c.date <= to && c.energy !== undefined).map((c) => c.energy!);
  const a = cks(addDays(today, -27), today);
  const b = cks(addDays(today, -55), addDays(today, -28));
  if (a.length >= 14 && b.length >= 14 && mean(a)! - mean(b)! >= 1)
    out.push({
      key: `energy-trend:${today.slice(0, 7)}`,
      category: "recovery",
      title: "Energy trending up",
      headline: "More Energy, Week by Week",
      message: "You feel the difference.",
      description: "Your average morning energy over the last 4 weeks is at least a point higher than the 4 weeks before — based on your own check-ins, not a single good day.",
      achievedOn: today,
      stats: [
        { key: "change", label: "Felt energy", value: `${mean(b)!.toFixed(1)} → ${mean(a)!.toFixed(1)} /10` },
        { key: "n", label: "Check-ins compared", value: `${a.length} vs ${b.length}` },
      ],
    });

  // Body Battery milestone: 14-day average ≥8 above the prior 28-day average.
  const bb = (from: DayKey, to: DayKey) => data.metrics.filter((m) => m.metric === "bodyBattery" && m.date >= from && m.date <= to).map((m) => m.value);
  const recent = bb(addDays(today, -13), today);
  const before = bb(addDays(today, -41), addDays(today, -14));
  if (recent.length >= 10 && before.length >= 14 && mean(recent)! - mean(before)! >= 8)
    out.push({
      key: `body-battery:${today.slice(0, 7)}`,
      category: "recovery",
      title: "Body Battery higher for two weeks",
      headline: "Recharged",
      message: "Sustained, not a single spike.",
      description: "Your Garmin Body Battery averaged at least 8 points higher over two weeks than in the month before.",
      achievedOn: today,
      stats: [{ key: "bb", label: "Garmin Body Battery avg", value: `${Math.round(mean(before)!)} → ${Math.round(mean(recent)!)}`, sensitive: true }, { key: "days", label: "Days", value: String(recent.length) }],
    });

  // Balanced week: ≥3 sessions, no back-to-back hard days, sleep near goal (≥5 nights logged).
  if (data.workouts.length) {
    const firstWs = weekStart(sorted(data.workouts)[0].date);
    for (let ws = firstWs; addDays(ws, 6) < today; ws = addDays(ws, 7)) {
      const days = dayRange(ws, addDays(ws, 6));
      const ws_ = data.workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6));
      const hard = days.map((d) => ws_.some((w) => w.date === d && (w.rpe ?? 0) >= 8));
      const backToBack = hard.some((h, i) => h && hard[i + 1]);
      const nights = sleepInRange(data.sleep, ws, addDays(ws, 6));
      const avg = mean(nights.map((n) => sleepAmount(n, profile.sleepLatencyMin).minutes));
      if (ws_.length >= 3 && !backToBack && nights.length >= 5 && avg !== undefined && avg >= profile.sleepNeedMin - 30) {
        out.push({
          key: "balanced-week",
          category: "recovery",
          title: "A balanced week",
          headline: "Train. Recover. Repeat.",
          message: "Effort and rest, in balance.",
          description: "A week with at least three sessions, no back-to-back hard days, and sleep close to your goal.",
          achievedOn: addDays(ws, 6),
          stats: [{ key: "sessions", label: "Sessions", value: String(ws_.length) }, { key: "nights", label: "Nights logged", value: String(nights.length) }, { key: "sleep", label: "Average sleep", value: fmtMin(avg), sensitive: true }],
        });
        break;
      }
    }
  }

  // Recovery-supporting habits: sleep habits ≥80% over 28 days.
  const sleepHabits = data.habits.filter((h) => h.category === "sleep" && !h.archived && h.createdAt.slice(0, 10) <= addDays(today, -27));
  if (sleepHabits.length) {
    const idx = indexLogs(data.habitLogs);
    const rates = sleepHabits.map((h) => consistency(h, idx, addDays(today, -27), today));
    const earned = rates.reduce((x, r) => x + r.earned, 0);
    const possible = rates.reduce((x, r) => x + r.possible, 0);
    if (possible && earned / possible >= 0.8)
      out.push({
        key: `recovery-habits:${today.slice(0, 7)}`,
        category: "recovery",
        title: "Recovery habits, consistently",
        headline: "Protecting Your Recovery",
        message: "The unglamorous work that pays off.",
        description: "Your sleep-supporting habits were at least 80% consistent over four weeks.",
        achievedOn: today,
        stats: [{ key: "rate", label: "Consistency", value: `${Math.round((earned / possible) * 100)}%` }, { key: "habits", label: "Habits", value: String(sleepHabits.length) }],
      });
  }
  return out;
}

const COUNT_HABITS: { re: RegExp; n: number; key: string; title: string; headline: string; message: string }[] = [
  { re: /read/i, n: 30, key: "reading-30", title: "30 reading sessions", headline: "30 Days of Reading", message: "Page by page." },
  { re: /journal/i, n: 20, key: "journal-20", title: "20 journaling sessions", headline: "20 Pages of You", message: "Writing it down changes things." },
  { re: /meditat|mindful|breath/i, n: 21, key: "meditation-21", title: "21 meditation sessions", headline: "21 Quiet Minutes", message: "Stillness, practised." },
];

function habitAchievements({ data, today }: AchievementContext): Achievement[] {
  const idx = indexLogs(data.habitLogs);
  const out: Achievement[] = [];
  for (const h of data.habits.filter((x) => !x.archived || data.habitLogs.some((l) => l.habitId === x.id))) {
    if (h.frequency.type !== "weekly") {
      const days = dayRange(h.createdAt.slice(0, 10), today).filter((d) => isScheduled(h, d) && idx.get(`${h.id}|${d}`)?.status !== "rest");
      const r = firstRun(days, (d) => done(idx.get(`${h.id}|${d}`)?.status), 7);
      out.push({
        key: `habit-7:${h.id}`,
        category: "habits",
        title: `${h.name}: 7 in a row`,
        headline: "Seven in a Row",
        message: "Small habits. Real progress.",
        description: `“${h.name}” completed on seven scheduled days in a row (rest days don't break it).`,
        achievedOn: r.end,
        stats: r.end ? [{ key: "habit", label: "Habit", value: h.name }, { key: "days", label: "Days in a row", value: "7" }] : [],
        progress: r.end ? undefined : { current: r.best, target: 7, unit: "in a row" },
      });
    }
    for (const c of COUNT_HABITS.filter((c) => c.re.test(h.name))) {
      const logs = data.habitLogs.filter((l) => l.habitId === h.id && l.status === "done").sort((a, b) => a.date.localeCompare(b.date));
      out.push({
        key: `${c.key}:${h.id}`,
        category: "habits",
        title: c.title,
        headline: c.headline,
        message: c.message,
        description: `“${h.name}” completed ${c.n} times.`,
        achievedOn: logs[c.n - 1]?.date,
        stats: logs.length >= c.n ? [{ key: "sessions", label: "Sessions", value: String(c.n) }, { key: "since", label: "Since", value: formatDay(logs[0].date, "d MMM yyyy") }] : [],
        progress: logs.length >= c.n ? undefined : { current: logs.length, target: c.n, unit: "sessions" },
      });
    }
  }
  return out;
}

function bestsAchievements({ data, today }: AchievementContext): Achievement[] {
  const out: Achievement[] = [];
  const tz = data.profile.timeZone;
  const lastWs = addDays(weekStart(today), -7);

  // Most consistent sleep week: last complete week beats ≥3 earlier qualifying weeks.
  const nights = sleepInRange(data.sleep, "0000-01-01", addDays(lastWs, 6));
  const byWeek = new Map<DayKey, number[]>();
  for (const n of nights) byWeek.set(weekStart(n.date), [...(byWeek.get(weekStart(n.date)) ?? []), clockToMin(clockOf(n.bedtime, tz))]);
  const qual = [...byWeek.entries()].filter(([, v]) => v.length >= 6).map(([ws, v]) => ({ ws, sd: clockSd(v)! }));
  const last = qual.find((q) => q.ws === lastWs);
  if (last && qual.length >= 4 && qual.every((q) => q.ws === lastWs || last.sd < q.sd))
    out.push({
      key: `pb-sleep-week:${lastWs}`,
      category: "bests",
      title: "Most consistent sleep week",
      headline: "Your Steadiest Week Yet",
      message: "Rhythm is a form of rest.",
      description: `Your most regular bedtimes of any week you've logged (${qual.length} weeks).`,
      achievedOn: addDays(lastWs, 6),
      stats: [{ key: "spread", label: "Bedtime spread", value: `±${Math.round(last.sd)} min` }, { key: "weeks", label: "Weeks compared", value: String(qual.length) }],
    });

  // Highest weekly habit completion: last complete week ≥80% and best of ≥4 weeks.
  const active = data.habits.filter((h) => !h.archived);
  if (active.length) {
    const idx = indexLogs(data.habitLogs);
    const first = weekStart(active.map((h) => h.createdAt.slice(0, 10)).sort()[0]);
    const rates: { ws: DayKey; rate: number }[] = [];
    for (let ws = first; ws <= lastWs; ws = addDays(ws, 7)) {
      const cs = active.map((h) => consistency(h, idx, ws, addDays(ws, 6)));
      const p = cs.reduce((a, c) => a + c.possible, 0);
      if (p) rates.push({ ws, rate: cs.reduce((a, c) => a + c.earned, 0) / p });
    }
    const lw = rates.find((r) => r.ws === lastWs);
    if (lw && rates.length >= 4 && lw.rate >= 0.8 && rates.every((r) => r.ws === lastWs || lw.rate > r.rate))
      out.push({
        key: `pb-habit-week:${lastWs}`,
        category: "bests",
        title: "Best habit week",
        headline: "Your Best Week of Habits",
        message: "You showed up, again and again.",
        description: `Your highest weekly habit completion so far, out of ${rates.length} weeks.`,
        achievedOn: addDays(lastWs, 6),
        stats: [{ key: "rate", label: "Completion", value: `${Math.round(lw.rate * 100)}%` }, { key: "habits", label: "Habits", value: String(active.length) }],
      });
  }
  return out;
}

function growthAchievements({ data, challenges, customs, today }: AchievementContext): Achievement[] {
  const out: Achievement[] = [];
  for (const c of challenges) {
    const cd = challengeDay(c.startDate, today);
    if (c.status === "ended") continue;
    const finished = c.status === "completed" || cd.finished;
    const idx = indexLogs(data.habitLogs);
    const hs = data.habits.filter((h) => c.habitIds.includes(h.id!));
    const cs = hs.map((h) => consistency(h, idx, c.startDate, cd.endDate < today ? cd.endDate : today));
    const p = cs.reduce((a, x) => a + x.possible, 0);
    out.push({
      key: `challenge-45:${c.id}`,
      category: "growth",
      title: "45-day challenge complete",
      headline: "45 Days of Consistency",
      message: "You built something that lasts.",
      description: "You completed the 45-day foundation challenge.",
      achievedOn: finished ? cd.endDate : undefined,
      stats: finished
        ? [{ key: "days", label: "Days", value: String(CHALLENGE_DAYS) }, { key: "habits", label: "Habits", value: String(hs.length) }, ...(p ? [{ key: "rate", label: "Consistency", value: `${Math.round((cs.reduce((a, x) => a + x.earned, 0) / p) * 100)}%` }] : [])]
        : [],
      progress: finished ? undefined : { current: Math.max(0, Math.min(cd.day, CHALLENGE_DAYS)), target: CHALLENGE_DAYS, unit: "days" },
      major: true,
    });
  }

  for (const c of customs) {
    const since = c.createdAt.slice(0, 10);
    let current = 0;
    let achievedOn: DayKey | undefined = c.completedOn;
    const target = c.target ?? 1;
    if (c.kind === "habitCount" && c.habitId !== undefined) {
      const logs = data.habitLogs.filter((l) => l.habitId === c.habitId && l.status === "done" && l.date >= since).sort((a, b) => a.date.localeCompare(b.date));
      current = logs.length;
      achievedOn = logs[target - 1]?.date;
    } else if (c.kind === "workoutCount" || c.kind === "workoutDistance") {
      const ws = sorted(data.workouts.filter((w) => w.date >= since && (!c.activity || w.type === c.activity)));
      for (const w of ws) {
        current += c.kind === "workoutCount" ? 1 : km(w);
        if (!achievedOn && current >= target) achievedOn = w.date;
      }
    }
    out.push({
      key: `custom:${c.id}`,
      category: c.category,
      title: c.title,
      headline: c.title,
      message: "A milestone you set for yourself.",
      description: c.description || "A personal milestone.",
      achievedOn,
      stats: achievedOn && c.kind !== "manual" ? [{ key: "target", label: c.kind === "workoutDistance" ? "Distance" : "Completed", value: c.kind === "workoutDistance" ? `${target} km` : String(target) }] : [],
      progress: achievedOn || c.kind === "manual" ? undefined : { current: Math.round(current * 10) / 10, target },
      major: true,
    });
  }
  return out;
}

/** Every achievement, achieved or not (locked ones carry progress). */
export function evaluateAchievements(ctx: AchievementContext): Achievement[] {
  return [
    ...sleepAchievements(ctx),
    ...fitnessAchievements(ctx),
    ...recoveryAchievements(ctx),
    ...habitAchievements(ctx),
    ...bestsAchievements(ctx),
    ...growthAchievements(ctx),
  ];
}

/** Unlocks older than this are added to the timeline quietly (e.g. after importing history). */
export const CELEBRATE_WITHIN_DAYS = 2;


/** Rows to add for newly achieved items. Old unlocks (imported history) are added already "seen". */
export function newUnlocks(all: Achievement[], existingKeys: Set<string>, today: DayKey, nowIso: string) {
  return all
    .filter((a) => a.achievedOn && !existingKeys.has(a.key))
    .map((a) => ({
      key: a.key,
      category: a.category,
      title: a.title,
      achievedOn: a.achievedOn!,
      unlockedAt: nowIso,
      seen: a.achievedOn! < addDays(today, -CELEBRATE_WITHIN_DAYS),
      headline: a.headline,
      message: a.message,
      description: a.description,
      stats: a.stats,
      major: a.major,
    }));
}
