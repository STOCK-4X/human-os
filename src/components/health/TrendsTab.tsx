"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RelationChart, TrendChart } from "../charts";
import { Card, Field, Notice, Segmented, Stat } from "../ui";
import { addDays, clockOf, clockToMin, dayRange, formatDuration } from "@/lib/date";
import { bedtimeMinutes, metricSeries, sleepByDate, summarize, type DataSet } from "@/lib/reports";
import { sleepAmount } from "@/lib/sleep";
import { scoreHistory, type ScorePoint } from "@/lib/scores";
import { MIN_CORRELATION_POINTS, mean, pearson } from "@/lib/stats";
import type { DayKey } from "@/lib/types";

/** A per-day value extractor. Lag-aware: "previous day" factors are attributed to the next morning. */
type Factor = { label: string; get: (data: DataSet, day: DayKey, scores: Map<DayKey, ScorePoint>) => number | undefined };

const FACTORS: Record<string, Factor> = {
  energyScore: { label: "Energy score (Human OS)", get: (_d, day, sc) => sc.get(day)?.energy },
  recoveryScore: { label: "Recovery score (Human OS)", get: (_d, day, sc) => sc.get(day)?.recovery },
  sleepScore: { label: "Sleep score (Human OS)", get: (_d, day, sc) => sc.get(day)?.sleep },
  bodyBattery: { label: "Garmin Body Battery", get: (_d, day, sc) => sc.get(day)?.bodyBattery },
  sleepMin: { label: "Sleep last night (min)", get: (d, day) => { const n = sleepByDate(d.sleep).get(day); return n && sleepAmount(n, d.profile.sleepLatencyMin).minutes; } },
  bedtime: { label: "Bedtime last night (min after 12:00)", get: (d, day) => { const n = sleepByDate(d.sleep).get(day); return n && bedtimeMinutes(n, d.profile.timeZone) - 720; } },
  sleepQuality: { label: "Sleep quality (1–5)", get: (d, day) => sleepByDate(d.sleep).get(day)?.quality },
  energy: { label: "Morning energy (1–10)", get: (d, day) => d.checkins.find((c) => c.date === day)?.energy },
  mood: { label: "Mood (1–10)", get: (d, day) => d.checkins.find((c) => c.date === day)?.mood },
  focus: { label: "Mental focus (1–10)", get: (d, day) => d.checkins.find((c) => c.date === day)?.focus },
  tiredness: { label: "Physical tiredness (1–10)", get: (d, day) => d.checkins.find((c) => c.date === day)?.fatigue },
  hrv: { label: "HRV (ms)", get: (d, day) => metricSeries(d.metrics, "hrv", day, day)[0]?.value },
  rhr: { label: "Resting HR (bpm)", get: (d, day) => metricSeries(d.metrics, "rhr", day, day)[0]?.value },
  prevCaffeine: {
    label: "Previous day's last caffeine (hour)",
    get: (d, day) => {
      const prev = addDays(day, -1);
      const c = d.lifestyle.filter((l) => l.date === prev && l.kind === "caffeine");
      if (!c.length) return undefined;
      return clockToMin(clockOf(c.reduce((a, b) => (a.at > b.at ? a : b)).at, d.profile.timeZone)) / 60;
    },
  },
  prevSteps: { label: "Previous day's steps", get: (d, day) => metricSeries(d.metrics, "steps", addDays(day, -1), addDays(day, -1))[0]?.value },
  prevTraining: {
    label: "Previous day's training (min)",
    get: (d, day) => {
      const prev = addDays(day, -1);
      return d.workouts.filter((w) => w.date === prev).reduce((a, w) => a + w.durationMin, 0);
    },
  },
  prevOutdoors: {
    label: "Previous day's time outdoors (min)",
    get: (d, day) => {
      const prev = addDays(day, -1);
      const l = d.lifestyle.filter((x) => x.date === prev && (x.kind === "outdoors" || x.kind === "morningLight"));
      return l.length ? l.reduce((a, x) => a + (x.amount ?? 0), 0) : undefined;
    },
  },
};

export function TrendsTab({ data, today }: { data: DataSet; today: DayKey }) {
  const [range, setRange] = useState<"7" | "28" | "90">("28");
  const [x, setX] = useState("bedtime");
  const [y, setY] = useState("energy");
  const from = addDays(today, -(Number(range) - 1));
  const s = summarize(data, from, today);
  const [series, setSeries] = useState<"energy" | "recovery" | "sleep" | "bodyBattery" | "subjective">("recovery");
  const hist = useMemo(() => scoreHistory(data, addDays(today, -89), today), [data, today]);
  const byDay = useMemo(() => new Map(hist.map((p) => [p.date, p])), [hist]);
  const relate = (fx: string, fy: string) =>
    dayRange(addDays(today, -89), today).flatMap((d) => {
      const a = FACTORS[fx].get(data, d, byDay);
      const b = FACTORS[fy].get(data, d, byDay);
      return a === undefined || b === undefined ? [] : [{ x: a, y: b }];
    });
  const pairs = relate(x, y);
  const c = pearson(pairs.map((p) => [p.x, p.y]));
  const shown = hist.filter((p) => p.date >= from);
  const subjective = (d: DayKey) => data.checkins.find((ck) => ck.date === d)?.energy;
  const seriesData = shown.map((p) => ({ date: p.date, value: series === "subjective" ? subjective(p.date) : p[series] }));
  const seriesAvg = mean(seriesData.flatMap((p) => (p.value === undefined ? [] : [p.value])));
  const matches = [
    ["energy", "bodyBattery", "Your energy rating vs Garmin Body Battery"],
    ["energy", "recoveryScore", "Your energy rating vs Recovery score"],
    ["tiredness", "recoveryScore", "Physical tiredness vs Recovery score"],
    ["focus", "sleepScore", "Mental focus vs Sleep score"],
  ].map(([a, b, label]) => ({ label, c: pearson(relate(a, b).map((p) => [p.x, p.y])) }));

  const n = (v: number | undefined, days: number, fmt: (n: number) => string) => ({ value: v === undefined ? undefined : fmt(v), hint: `${days} day${days === 1 ? "" : "s"} of data` });

  return (
    <div className="space-y-4">
      <Segmented label="Range" value={range} onChange={setRange} options={[{ value: "7", label: "7 days" }, { value: "28", label: "28 days" }, { value: "90", label: "90 days" }]} />
      <Card title="Averages">
        <div className="grid grid-cols-2 gap-4">
          <Stat label={`Sleep${s.sleepIncludesEstimates ? " (incl. est.)" : ""}`} source="calculated" {...n(s.avgSleepMin, s.nights, (v) => formatDuration(v))} />
          <Stat label="Bedtime spread" source="calculated" {...n(s.bedtimeSdMin, s.nights, (v) => `±${Math.round(v)}m`)} />
          <Stat label="HRV" unit="ms" source="calculated" {...n(s.avgHrv, s.hrvDays, (v) => String(Math.round(v)))} />
          <Stat label="Resting HR" unit="bpm" source="calculated" {...n(s.avgRhr, s.rhrDays, (v) => String(Math.round(v)))} />
          <Stat label="Steps" source="calculated" {...n(s.avgSteps, s.stepsDays, (v) => Math.round(v).toLocaleString())} />
          <Stat label="Training" unit="min" source="calculated" value={s.workoutMin || undefined} hint={`${s.workouts} sessions`} />
          <Stat label="Habit consistency" source="calculated" value={s.habitRate === undefined ? undefined : `${Math.round(s.habitRate * 100)}%`} />
          <Stat label="Energy" unit="/10" source="calculated" {...n(s.avgEnergy, s.energyDays, (v) => v.toFixed(1))} />
        </div>
      </Card>

      <Card title="Energy & recovery over time">
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["recovery", "Recovery"],
              ["energy", "Energy"],
              ["sleep", "Sleep score"],
              ["bodyBattery", "Body Battery"],
              ["subjective", "Felt energy"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={series === k ? "chip-on" : "chip"} aria-pressed={series === k} onClick={() => setSeries(k)}>{l}</button>
          ))}
        </div>
        <TrendChart label="Score over time" data={seriesData} domain={series === "subjective" ? [1, 10] : [0, 100]} />
        <p className="mt-1 text-xs text-muted">
          Average {seriesAvg === undefined ? "—" : Math.round(seriesAvg * 10) / 10} over {seriesData.filter((p) => p.value !== undefined).length} days.
          {series === "bodyBattery" ? " Garmin's own value, unchanged." : series === "subjective" ? " Your 1–10 morning rating." : " Human OS estimate."}
        </p>
      </Card>

      <Card title="Do your wearables match how you feel?">
        <ul className="divide-y divide-line">
          {matches.map((mt) => (
            <li key={mt.label} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{mt.label}</span>
              <span className="tabular shrink-0 text-xs text-muted">
                {mt.c.status === "ok" ? `${mt.c.strength} (r = ${mt.c.r!.toFixed(2)}, ${mt.c.n} days)` : `${mt.c.n}/${MIN_CORRELATION_POINTS} days`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          A moderate or strong positive link means the device tends to agree with how you feel. A weak link means trust your own sense more — wearables estimate, they don&apos;t know.
        </p>
      </Card>

      <Card title="Explore relationships">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Factor">
            {(id) => (
              <select id={id} className="input" value={x} onChange={(e) => setX(e.target.value)}>
                {Object.entries(FACTORS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Outcome">
            {(id) => (
              <select id={id} className="input" value={y} onChange={(e) => setY(e.target.value)}>
                {Object.entries(FACTORS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              </select>
            )}
          </Field>
        </div>
        <div className="mt-3">
          {pairs.length >= 3 && <RelationChart points={pairs} xLabel={FACTORS[x].label} yLabel={FACTORS[y].label} />}
          {c.status === "ok" ? (
            <p className="text-sm">
              Over {c.n} days (last 90), the association is <strong>{c.strength}</strong> ({c.r! > 0 ? "positive" : "negative"}, r = {c.r!.toFixed(2)}).
            </p>
          ) : (
            <p className="text-sm text-muted">
              {pairs.length} matching days — at least {MIN_CORRELATION_POINTS} are needed before showing an association.
            </p>
          )}
          <div className="mt-2">
            <Notice>
              An association is not proof of cause: both could be driven by something else (a busy week, illness, weekends). To test an idea, run it as an{" "}
              <Link href="/experiments" className="underline">experiment</Link>.
            </Notice>
          </div>
        </div>
      </Card>
      <Link href="/review?period=month" className="btn-ghost w-full">Monthly report</Link>
    </div>
  );
}
