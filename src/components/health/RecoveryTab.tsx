"use client";

import { useState } from "react";
import { TrendChart } from "../charts";
import { METRIC_META, MetricsForm } from "../forms/MetricsForm";
import { Card, Empty, Notice, Segmented, Sheet, Stat } from "../ui";
import { addDays, dayRange, formatDay } from "@/lib/date";
import { metricBaseline, metricOn, metricSeries, type DataSet } from "@/lib/reports";
import { deviation } from "@/lib/stats";
import type { DayKey } from "@/lib/types";

type RKey = "hrv" | "rhr" | "bodyBattery" | "stress" | "respiration";

const EXPLAIN: Record<RKey, { what: string; above: string; below: string; band: number }> = {
  hrv: {
    what: "Heart-rate variability: the variation between heartbeats overnight. Higher than your own usual often goes with good recovery; it varies a lot between people, so only your own trend matters.",
    above: "HRV is above your usual range. Usually a neutral or positive sign.",
    below: "HRV is below your usual range. Short sleep, hard training, alcohol, stress or getting ill can all lower it. A single low reading is common — look at the trend and how you feel.",
    band: 4,
  },
  rhr: {
    what: "Resting heart rate. A lower or stable value relative to your own baseline usually reflects good recovery and fitness.",
    above: "Your resting heart rate is higher than your recent baseline. Consider how you slept, whether you trained hard recently, and whether you feel unwell.",
    below: "Resting heart rate is below your usual range — often a sign of good recovery or improving fitness.",
    band: 3,
  },
  bodyBattery: {
    what: "Garmin's proprietary energy estimate (0–100), based on HRV, stress and activity. Useful as a rough hint, not a measurement.",
    above: "Body Battery is higher than usual.",
    below: "Body Battery is lower than usual. Treat it as one hint among several.",
    band: 10,
  },
  stress: {
    what: "Device stress score derived from heart-rate data. Physical effort, illness and caffeine can raise it too, not just mental stress.",
    above: "Stress score is higher than usual.",
    below: "Stress score is lower than usual.",
    band: 8,
  },
  respiration: {
    what: "Average breathing rate during sleep. It's usually very stable for a person; a sustained rise can accompany illness.",
    above: "Breathing rate is above your usual range. If it persists alongside feeling unwell, consider checking in with a professional.",
    below: "Breathing rate is below your usual range.",
    band: 1,
  },
};

export function RecoveryTab({ data, today }: { data: DataSet; today: DayKey }) {
  const [range, setRange] = useState<"28" | "90">("28");
  const [entry, setEntry] = useState(false);
  const from = addDays(today, -(Number(range) - 1));
  const hidden = new Set(data.profile.hiddenMetrics);
  const keys = (Object.keys(EXPLAIN) as RKey[]).filter((k) => !hidden.has(k));
  const recentHard = data.workouts.filter((w) => w.date >= addDays(today, -2) && ((w.rpe ?? 0) >= 8 || w.durationMin >= 90));
  const ck = data.checkins.find((c) => c.date === today);

  return (
    <div className="space-y-4">
      <Notice>
        Wearable data are estimates and don&apos;t replace medical evaluation. Read them together with how you feel, your sleep and recent training — never one number on its own.
      </Notice>
      <div className="flex gap-2">
        <div className="flex-1">
          <Segmented label="Range" value={range} onChange={setRange} options={[{ value: "28", label: "28 days" }, { value: "90", label: "90 days" }]} />
        </div>
        <button className="btn-primary" onClick={() => setEntry(true)}>Enter today</button>
      </div>

      <Card title="Context">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Tiredness" value={ck?.fatigue} unit="/10" source="manual" />
          <Stat label="Hard sessions, 48h" value={recentHard.length} source="calculated" />
          <Stat label="Symptoms" value={ck?.unwell ? "Unwell" : ck?.symptoms.length ? ck.symptoms.length : ck ? "None" : undefined} source="manual" />
        </div>
      </Card>

      {keys.map((k) => (
        <MetricCard key={k} k={k} data={data} today={today} from={from} />
      ))}

      <Sheet open={entry} onClose={() => setEntry(false)} title={`Metrics · ${formatDay(today)}`}>
        <MetricsForm date={today} metrics={data.metrics} onDone={() => setEntry(false)} />
      </Sheet>
    </div>
  );
}

function MetricCard({ k, data, today, from }: { k: RKey; data: DataSet; today: DayKey; from: DayKey }) {
  const meta = METRIC_META[k];
  const ex = EXPLAIN[k];
  const series = metricSeries(data.metrics, k, from, today);
  const latest = series.at(-1);
  const b = metricBaseline(data.metrics, k, latest?.date ?? today);
  const today_ = metricOn(data.metrics, k, today);
  const dv = deviation(today_?.value, b, ex.band);
  const byDate = new Map(series.map((p) => [p.date, p.value]));
  const chart = dayRange(from, today).map((d) => ({ date: d, value: byDate.get(d) }));

  return (
    <Card title={meta.label}>
      <div className="mb-2 grid grid-cols-2 gap-3">
        <Stat
          label={today_ ? "Today" : latest ? `Latest (${formatDay(latest.date, "d MMM")})` : "Today"}
          value={(today_ ?? latest)?.value}
          unit={meta.unit}
          source={(today_ ?? latest)?.source}
          hint={!today_ && latest ? "Not today's value" : undefined}
        />
        <Stat
          label="Your usual"
          value={b.status === "ok" ? `${Math.round(b.low!)}–${Math.round(b.high!)}` : undefined}
          unit={meta.unit}
          source="calculated"
          hint={b.status === "ok" ? `from ${b.n} days` : `needs ${b.required} days (${b.n} so far)`}
        />
      </div>
      {series.length ? (
        <TrendChart label={`${meta.label} trend`} data={chart} band={b.status === "ok" ? { low: b.low!, high: b.high! } : undefined} />
      ) : (
        <Empty title="No data yet">Enter it manually or import a CSV in Profile.</Empty>
      )}
      <p className="mt-2 text-sm text-muted">{dv === "above" ? ex.above : dv === "below" ? ex.below : ex.what}</p>
    </Card>
  );
}
