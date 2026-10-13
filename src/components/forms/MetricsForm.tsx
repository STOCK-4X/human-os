"use client";

import { useState } from "react";
import { METRIC_RANGES } from "@/lib/csv";
import { setManualMetric } from "@/lib/db";
import type { DailyMetric, DayKey, MetricKey } from "@/lib/types";
import { Field, Notice } from "../ui";

export const METRIC_META: Record<Exclude<MetricKey, "hrvStatus">, { label: string; unit: string }> = {
  rhr: { label: "Resting heart rate", unit: "bpm" },
  hrv: { label: "HRV (overnight avg)", unit: "ms" },
  bodyBattery: { label: "Body Battery", unit: "/100" },
  stress: { label: "Stress (avg)", unit: "/100" },
  steps: { label: "Steps", unit: "" },
  activeMin: { label: "Active minutes", unit: "min" },
  calories: { label: "Calories", unit: "kcal" },
  respiration: { label: "Respiration", unit: "br/min" },
};
type Key = keyof typeof METRIC_META;

export function MetricsForm({ date, metrics, onDone }: { date: DayKey; metrics: DailyMetric[]; onDone: () => void }) {
  const mine = (k: Key) => metrics.find((m) => m.date === date && m.metric === k && m.source === "manual");
  const other = (k: Key) => metrics.find((m) => m.date === date && m.metric === k && m.source !== "manual");
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(METRIC_META).map((k) => [k, mine(k as Key)?.value.toString() ?? ""])),
  );
  const [error, setError] = useState<string>();

  async function save() {
    for (const [k, v] of Object.entries(vals)) {
      if (v.trim() === "") continue;
      const n = Number(v);
      const [lo, hi] = METRIC_RANGES[k as Key];
      if (!Number.isFinite(n) || n < lo || n > hi) return setError(`${METRIC_META[k as Key].label} should be between ${lo} and ${hi}.`);
    }
    for (const [k, v] of Object.entries(vals)) await setManualMetric(date, k as Key, v.trim() === "" ? undefined : Number(v));
    onDone();
  }

  return (
    <div className="space-y-4">
      <Notice>Enter what your watch or app shows. Leave anything you don&apos;t have blank — it will show as missing, never as zero.</Notice>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(METRIC_META) as Key[]).map((k) => (
          <Field key={k} label={`${METRIC_META[k].label}${METRIC_META[k].unit ? ` (${METRIC_META[k].unit})` : ""}`} hint={other(k) ? `Imported: ${other(k)!.value}` : undefined}>
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className="input"
                value={vals[k]}
                onChange={(e) => setVals((s) => ({ ...s, [k]: e.target.value }))}
              />
            )}
          </Field>
        ))}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <button className="btn-primary w-full" onClick={save}>
        Save
      </button>
    </div>
  );
}
