import { clockOf, clockToMin, minToClock } from "./date";
import { clockMean, clockSd, mean } from "./stats";
import type { ClockTime, SleepRecord } from "./types";

export function timeInBedMin(r: Pick<SleepRecord, "bedtime" | "wakeTime">): number {
  return Math.round((Date.parse(r.wakeTime) - Date.parse(r.bedtime)) / 60_000);
}

export interface SleepAmount {
  minutes: number;
  /** "measured" = asleepMin recorded; "estimated" = time in bed − typical latency. */
  kind: "measured" | "estimated";
}

/** Best available sleep amount for a night, with its provenance. */
export function sleepAmount(r: SleepRecord, latencyMin: number): SleepAmount {
  if (r.asleepMin !== undefined) return { minutes: r.asleepMin, kind: "measured" };
  const inBed = timeInBedMin(r);
  const awake = r.awakeMin ?? 0;
  return { minutes: Math.max(0, inBed - (r.latencyMin ?? latencyMin) - awake), kind: "estimated" };
}

export interface SleepPlan {
  wake: ClockTime;
  /** When to be in bed with lights out. */
  lightsOut: ClockTime;
  /** When to start winding down. */
  windDownStart: ClockTime;
  timeInBedMin: number;
  sleepNeedMin: number;
}

/**
 * Bedtime planner. Time in bed = sleep need + time to fall asleep, so a person
 * who needs 7h30 asleep and takes 15 min to drift off should be in bed 7h45
 * before their wake time.
 */
export function planSleep(
  wake: ClockTime,
  sleepNeedMin: number,
  latencyMin: number,
  windDownMin: number,
): SleepPlan {
  const tib = sleepNeedMin + latencyMin;
  const lightsOut = clockToMin(wake) - tib;
  return {
    wake,
    lightsOut: minToClock(lightsOut),
    windDownStart: minToClock(lightsOut - windDownMin),
    timeInBedMin: tib,
    sleepNeedMin,
  };
}

export interface ShiftStep {
  fromDay: number;
  wake: ClockTime;
  lightsOut: ClockTime;
}

/**
 * Gradual wake-time shift: move by at most `stepMin` every `daysPerStep` days.
 * Bedtime moves with wake time so sleep opportunity is never reduced.
 */
export function gradualShift(
  currentWake: ClockTime,
  targetWake: ClockTime,
  sleepNeedMin: number,
  latencyMin: number,
  stepMin = 15,
  daysPerStep = 3,
): ShiftStep[] {
  let diff = clockToMin(targetWake) - clockToMin(currentWake);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  const steps: ShiftStep[] = [];
  const dir = Math.sign(diff);
  let moved = 0;
  let day = 1;
  while (Math.abs(moved) < Math.abs(diff)) {
    moved += dir * Math.min(stepMin, Math.abs(diff) - Math.abs(moved));
    const wake = minToClock(clockToMin(currentWake) + moved);
    steps.push({ fromDay: day, wake, lightsOut: planSleep(wake, sleepNeedMin, latencyMin, 0).lightsOut });
    day += daysPerStep;
  }
  return steps;
}

export interface SleepConsistency {
  nights: number;
  bedtimeSdMin?: number;
  wakeSdMin?: number;
  avgBedtime?: ClockTime;
  avgWake?: ClockTime;
}

export function sleepConsistency(records: SleepRecord[], tz: string): SleepConsistency {
  const beds = records.map((r) => clockToMin(clockOf(r.bedtime, tz)));
  const wakes = records.map((r) => clockToMin(clockOf(r.wakeTime, tz)));
  const avgBed = clockMean(beds);
  const avgWake = mean(wakes);
  return {
    nights: records.length,
    bedtimeSdMin: clockSd(beds),
    // Wake times rarely cross midnight; pivot at 18:00 keeps 23:59/00:01 sane anyway.
    wakeSdMin: clockSd(wakes, 18 * 60),
    avgBedtime: avgBed === undefined ? undefined : minToClock(avgBed),
    avgWake: avgWake === undefined ? undefined : minToClock(avgWake),
  };
}

export function consistencyLabel(sdMin: number | undefined): string {
  if (sdMin === undefined) return "Not enough nights yet";
  if (sdMin <= 30) return "Very consistent";
  if (sdMin <= 60) return "Fairly consistent";
  return "Variable";
}
