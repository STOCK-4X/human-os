import { addDays, clockOf, clockToMin, daysBetween } from "./date";
import { type DataSet, metricSeries, sleepInRange } from "./reports";
import { sleepAmount } from "./sleep";
import { clockSd, mean } from "./stats";
import type { DayKey, Experiment, ExperimentLog, ExperimentMetric } from "./types";

export const EXPERIMENT_METRICS: Record<ExperimentMetric, { label: string; unit: string; higherIsBetter: boolean }> = {
  sleepMin: { label: "Sleep duration", unit: "min", higherIsBetter: true },
  bedtimeSd: { label: "Bedtime variability", unit: "± min", higherIsBetter: false },
  sleepScore: { label: "Sleep score", unit: "", higherIsBetter: true },
  sleepQuality: { label: "Subjective sleep quality", unit: "/5", higherIsBetter: true },
  rhr: { label: "Resting heart rate", unit: "bpm", higherIsBetter: false },
  hrv: { label: "HRV", unit: "ms", higherIsBetter: true },
  energy: { label: "Morning energy", unit: "/10", higherIsBetter: true },
  mood: { label: "Mood", unit: "/10", higherIsBetter: true },
  steps: { label: "Steps", unit: "", higherIsBetter: true },
};

export const MIN_POINTS_PER_PHASE = 5;

function values(data: DataSet, metric: ExperimentMetric, from: DayKey, to: DayKey): number[] {
  const nights = () => sleepInRange(data.sleep, from, to);
  switch (metric) {
    case "sleepMin":
      return nights().map((n) => sleepAmount(n, data.profile.sleepLatencyMin).minutes);
    case "sleepScore":
      return nights().flatMap((n) => (n.score === undefined ? [] : [n.score]));
    case "sleepQuality":
      return nights().flatMap((n) => (n.quality === undefined ? [] : [n.quality]));
    case "bedtimeSd":
      return nights().map((n) => clockToMin(clockOf(n.bedtime, data.profile.timeZone)));
    case "rhr":
    case "hrv":
    case "steps":
      return metricSeries(data.metrics, metric, from, to).map((p) => p.value);
    case "energy":
    case "mood":
      return data.checkins
        .filter((c) => c.date >= from && c.date <= to)
        .flatMap((c) => (c[metric] === undefined ? [] : [c[metric]!]));
  }
}

export interface MetricResult {
  metric: ExperimentMetric;
  baseline?: number;
  during?: number;
  nBaseline: number;
  nDuring: number;
  change?: number;
  verdict: "insufficient" | "improved" | "worsened" | "no clear change";
}

export interface ExperimentResult {
  baselineFrom: DayKey;
  baselineTo: DayKey;
  from: DayKey;
  to: DayKey;
  elapsedDays: number;
  totalDays: number;
  adherence?: number;
  adheredDays: number;
  metrics: MetricResult[];
  limitations: string[];
  nextStep: string;
}

const NOISE: Partial<Record<ExperimentMetric, number>> = {
  sleepMin: 15,
  bedtimeSd: 10,
  sleepScore: 4,
  sleepQuality: 0.4,
  rhr: 2,
  hrv: 4,
  energy: 0.8,
  mood: 0.8,
  steps: 1000,
};

export function analyzeExperiment(
  data: DataSet,
  exp: Experiment,
  logs: ExperimentLog[],
  today: DayKey,
): ExperimentResult {
  const baselineFrom = addDays(exp.startDate, -exp.baselineDays);
  const baselineTo = addDays(exp.startDate, -1);
  const to = exp.endDate < today ? exp.endDate : today;
  const elapsedDays = Math.max(0, daysBetween(exp.startDate, to) + 1);
  const totalDays = daysBetween(exp.startDate, exp.endDate) + 1;
  const mine = logs.filter((l) => l.experimentId === exp.id && l.date >= exp.startDate && l.date <= to);
  const adheredDays = mine.filter((l) => l.adhered).length;
  const adherence = elapsedDays ? adheredDays / elapsedDays : undefined;

  const metrics: MetricResult[] = exp.metrics.map((m) => {
    const b = values(data, m, baselineFrom, baselineTo);
    const d = elapsedDays ? values(data, m, exp.startDate, to) : [];
    const agg = m === "bedtimeSd" ? (xs: number[]) => clockSd(xs) : mean;
    const baseline = agg(b);
    const during = agg(d);
    if (b.length < MIN_POINTS_PER_PHASE || d.length < MIN_POINTS_PER_PHASE || baseline === undefined || during === undefined)
      return { metric: m, baseline, during, nBaseline: b.length, nDuring: d.length, verdict: "insufficient" };
    const change = during - baseline;
    const meta = EXPERIMENT_METRICS[m];
    const verdict =
      Math.abs(change) < (NOISE[m] ?? 0)
        ? "no clear change"
        : change > 0 === meta.higherIsBetter
          ? "improved"
          : "worsened";
    return { metric: m, baseline, during, nBaseline: b.length, nDuring: d.length, change, verdict };
  });

  const limitations = [
    "This is a single-person, uncontrolled comparison: other changes (work stress, travel, illness, season) can explain differences.",
  ];
  if (metrics.some((m) => m.verdict === "insufficient"))
    limitations.push(`Some metrics have fewer than ${MIN_POINTS_PER_PHASE} data points in a phase, so no conclusion is drawn for them.`);
  if (adherence !== undefined && adherence < 0.7)
    limitations.push(`Adherence was ${Math.round(adherence * 100)}%, so results may not reflect the behaviour itself.`);
  if (elapsedDays < totalDays) limitations.push(`The experiment is still running (${elapsedDays}/${totalDays} days).`);

  const anyImproved = metrics.some((m) => m.verdict === "improved");
  const allInsufficient = metrics.every((m) => m.verdict === "insufficient");
  const nextStep = allInsufficient
    ? "Keep logging — there isn't enough data to compare yet."
    : anyImproved && (adherence ?? 0) >= 0.7
      ? "Promising. Consider keeping the behaviour and re-running later to see if the change holds."
      : "No clear benefit so far. Try a longer run, improve adherence, or test a different behaviour.";

  return { baselineFrom, baselineTo, from: exp.startDate, to, elapsedDays, totalDays, adherence, adheredDays, metrics, limitations, nextStep };
}
