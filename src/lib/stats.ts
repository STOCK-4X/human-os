/**
 * Small, explicit statistics helpers. Everything here returns `undefined`
 * (never 0) when there is not enough data, so callers can't accidentally
 * present missing data as a measurement.
 */

export const MIN_BASELINE_POINTS = 7;
export const BASELINE_WINDOW_DAYS = 28;
export const MIN_CORRELATION_POINTS = 10;

export function mean(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation. */
export function sd(xs: number[]): number | undefined {
  if (xs.length < 2) return undefined;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Baseline {
  status: "ok" | "insufficient";
  n: number;
  required: number;
  mean?: number;
  sd?: number;
  /** Typical range, mean ± 1 SD. */
  low?: number;
  high?: number;
}

/** Personal baseline from historical values (exclude the day being judged). */
export function baseline(values: number[], required = MIN_BASELINE_POINTS): Baseline {
  const n = values.length;
  if (n < required) return { status: "insufficient", n, required };
  const m = mean(values)!;
  const s = sd(values) ?? 0;
  return { status: "ok", n, required, mean: m, sd: s, low: m - s, high: m + s };
}

export type Deviation = "below" | "within" | "above" | "unknown";

/**
 * Compare a value to a baseline. Uses a band of max(1 SD, `minBand`) so that
 * tiny natural fluctuations are never flagged.
 */
export function deviation(value: number | undefined, b: Baseline, minBand = 0): Deviation {
  if (value === undefined || b.status !== "ok" || b.mean === undefined) return "unknown";
  const band = Math.max(b.sd ?? 0, minBand);
  if (value > b.mean + band) return "above";
  if (value < b.mean - band) return "below";
  return "within";
}

export interface Correlation {
  status: "ok" | "insufficient";
  n: number;
  r?: number;
  strength?: "negligible" | "weak" | "moderate" | "strong";
}

export function pearson(pairs: [number, number][]): Correlation {
  const n = pairs.length;
  if (n < MIN_CORRELATION_POINTS) return { status: "insufficient", n };
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  if (dx === 0 || dy === 0) return { status: "insufficient", n };
  const r = num / Math.sqrt(dx * dy);
  const a = Math.abs(r);
  const strength = a < 0.1 ? "negligible" : a < 0.3 ? "weak" : a < 0.5 ? "moderate" : "strong";
  return { status: "ok", n, r, strength };
}

/**
 * Spread of clock times (minutes since midnight) that may wrap around midnight,
 * e.g. bedtimes 23:30 and 00:15. Times are unwrapped around `pivot` first.
 */
export function clockSd(minutes: number[], pivot = 12 * 60): number | undefined {
  const unwrapped = minutes.map((m) => (m < pivot ? m + 1440 : m));
  return sd(unwrapped);
}

export function clockMean(minutes: number[], pivot = 12 * 60): number | undefined {
  const unwrapped = minutes.map((m) => (m < pivot ? m + 1440 : m));
  const m = mean(unwrapped);
  return m === undefined ? undefined : m % 1440;
}

export function round(x: number | undefined, digits = 0): number | undefined {
  if (x === undefined) return undefined;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
