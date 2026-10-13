import { clockOf, clockToMin, weekday } from "./date";
import { indexLogs, isScheduled } from "./habits";
import { type DataSet, waterToday } from "./reports";
import { planSleep } from "./sleep";
import type { DayKey } from "./types";

/**
 * Reminder rules. These run in the page while the app is open (or recently
 * backgrounded). True background delivery needs Web Push from a server — see
 * docs/NOTIFICATIONS.md for what each platform supports.
 */
export interface Reminder {
  id: string;
  title: string;
  body: string;
}

function inQuiet(now: number, start: number, end: number) {
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

export function dueReminders(data: DataSet, now: Date, today: DayKey, alreadySent: (id: string) => boolean): Reminder[] {
  const { profile } = data;
  const n = profile.notifications;
  if (!n.enabled || !n.weekdays.includes(weekday(today))) return [];
  const tz = profile.timeZone;
  const nowMin = clockToMin(clockOf(now, tz));
  const quiet = inQuiet(nowMin, clockToMin(n.quietStart), clockToMin(n.quietEnd));
  const plan = planSleep(profile.targetWake, profile.sleepNeedMin, profile.sleepLatencyMin, profile.windDownMin);
  const idx = indexLogs(data.habitLogs);
  const open = (routine?: "morning" | "evening") =>
    data.habits.filter(
      (h) => !h.archived && (!routine || h.routine === routine) && isScheduled(h, today) && !idx.has(`${h.id}|${today}`),
    );
  // A reminder is due within a 10-minute window after its time, once per day.
  const due = (at: number) => nowMin >= at && nowMin < at + 10;
  const out: Reminder[] = [];
  const add = (id: string, title: string, body: string, allowInQuiet = false) => {
    const key = `${today}:${id}`;
    if ((quiet && !allowInQuiet) || alreadySent(key)) return;
    out.push({ id: key, title, body });
  };

  if (n.bedtime && due(clockToMin(plan.windDownStart)))
    add("bedtime", "Time to wind down", `Lights out around ${plan.lightsOut} for a ${plan.wake} wake-up.`, true);
  if (n.evening && due(clockToMin(plan.windDownStart) - 30) && open("evening").length)
    add("evening", "Evening prep", `${open("evening").length} evening routine item(s) left.`);
  if (n.morning && due(clockToMin(profile.targetWake) + 10) && open("morning").length)
    add("morning", "Good morning", `Your morning routine: ${open("morning").map((h) => h.name).slice(0, 3).join(", ")}.`);
  if (n.habits)
    for (const h of open())
      if (h.reminderTime && due(clockToMin(h.reminderTime)))
        add(`habit-${h.id}`, h.name, h.minimumVersion ? `Minimum version: ${h.minimumVersion}` : "Still open for today.");
  if (n.workout && profile.trainingDays.includes(weekday(today)) && due(17 * 60) && !data.workouts.some((w) => w.date === today))
    add("workout", "Training day", "A planned session is on today — any movement counts.");
  if (n.hydration && waterToday(data.lifestyle, today) < profile.waterTargetMl) {
    const start = clockToMin(profile.targetWake) + 60;
    const every = Math.max(60, n.hydrationEveryMin);
    if (nowMin >= start && nowMin < clockToMin(plan.windDownStart) && (nowMin - start) % every < 10)
      add(`water-${Math.floor((nowMin - start) / every)}`, "Water", "A glass of water when convenient.");
  }
  if (n.weeklyReview && weekday(today) === 0 && due(18 * 60)) add("weekly", "Weekly review", "Take five minutes to look back on your week.");
  return out;
}

export async function showNotification(r: Reminder) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts: NotificationOptions = { body: r.body, tag: r.id, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  if (reg) await reg.showNotification(r.title, opts);
  else new Notification(r.title, opts);
  return true;
}

export type PermissionInfo =
  | { state: "unsupported"; reason: string }
  | { state: "needs-install"; reason: string }
  | { state: NotificationPermission };

export function notificationSupport(): PermissionInfo {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
    if (ios && !standalone)
      return { state: "needs-install", reason: "On iPhone, notifications only work after adding Human OS to your Home Screen (iOS 16.4+)." };
    return { state: "unsupported", reason: "This browser doesn't support notifications." };
  }
  return { state: Notification.permission };
}
