import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { ClockTime, DayKey } from "./types";

/**
 * All instants are stored as UTC ISO strings. Calendar days and clock times are
 * always derived in the user's configured time zone (not the device's).
 */

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function dayKey(instant: Date | string, tz: string): DayKey {
  return formatInTimeZone(new Date(instant), tz, "yyyy-MM-dd");
}

export function todayKey(tz: string, now: Date = new Date()): DayKey {
  return dayKey(now, tz);
}

export function clockOf(instant: Date | string, tz: string): ClockTime {
  return formatInTimeZone(new Date(instant), tz, "HH:mm");
}

/** Combine a local day + clock time in `tz` into a UTC ISO instant. */
export function zonedToIso(day: DayKey, time: ClockTime, tz: string): string {
  return fromZonedTime(`${day}T${time}:00`, tz).toISOString();
}

export function formatDay(day: DayKey, pattern = "EEE d MMM"): string {
  // Format a pure calendar date without any time-zone shift.
  return formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", pattern);
}

export function formatInstant(instant: string, tz: string, pattern = "HH:mm"): string {
  return formatInTimeZone(new Date(instant), tz, pattern);
}

/** Pure calendar arithmetic on day keys (DST-safe: no clock involved). */
export function addDays(day: DayKey, n: number): DayKey {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(day: DayKey): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: DayKey): DayKey {
  const wd = weekday(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export function dayRange(start: DayKey, endInclusive: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let d = start; d <= endInclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

export function clockToMin(t: ClockTime): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minToClock(min: number): ClockTime {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDuration(min: number | undefined): string {
  if (min === undefined || !Number.isFinite(min)) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Fraction of the waking day elapsed, using the user's wake target and planned lights-out. */
export function dayProgress(nowClock: ClockTime, wake: ClockTime, lightsOut: ClockTime): number {
  const now = clockToMin(nowClock);
  const start = clockToMin(wake);
  let end = clockToMin(lightsOut);
  if (end <= start) end += 1440;
  let n = now;
  if (n < start) n += 1440;
  return Math.max(0, Math.min(1, (n - start) / (end - start)));
}

export function nowIso(): string {
  return new Date().toISOString();
}
