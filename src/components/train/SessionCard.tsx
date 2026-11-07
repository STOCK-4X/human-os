"use client";

import { PHASE_INFO } from "@/lib/performance";
import { formatDay } from "@/lib/date";
import type { Session } from "@/lib/prescribe";
import type { DataSet } from "@/lib/reports";
import { bestVdot, zonesFor } from "@/lib/performance";
import { hrMax } from "@/lib/analytics";
import { metricBaseline } from "@/lib/reports";
import { scoresFor } from "@/lib/scores";
import type { DayKey } from "@/lib/types";
import type { PlanInput } from "@/lib/prescribe";
import { cx } from "../ui";

/** Everything the prescription needs, derived from stored data. */
export function planInput(data: DataSet, today: DayKey): PlanInput {
  const { profile, workouts } = data;
  const max = hrMax(workouts, profile, today);
  const rest = metricBaseline(data.metrics, "rhr", today).mean;
  const method = profile.zoneMethod ?? "hrmax";
  return {
    profile,
    today,
    vdot: bestVdot(workouts, today),
    zones: zonesFor(method, { max: max?.bpm, rest, lthr: profile.lthr }) ?? (max ? zonesFor("hrmax", { max: max.bpm }) : undefined),
    readiness: scoresFor(data, today).readiness,
    conditions: data.conditions,
  };
}

export function SessionCard({ s, today, compact }: { s: Session; today: DayKey; compact?: boolean }) {
  return (
    <div className={cx("rounded-2xl border p-3", s.day === today ? "border-accent" : "border-line")}>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {formatDay(s.day, "EEEE")}
          {s.day === today && " · today"}
        </span>
        <span>{PHASE_INFO[s.phase].label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{s.title}</span>
        {s.totalMin > 0 && <span className="num shrink-0 text-sm text-muted">{s.totalMin} min</span>}
      </div>
      {!compact && <p className="text-xs text-muted">{s.purpose}</p>}
      <ul className="mt-2 space-y-1">
        {s.steps.map((st, i) => (
          <li key={i} className="text-sm">
            <span className="font-semibold">{st.label}</span> <span className="text-muted">— {st.detail}</span>
          </li>
        ))}
      </ul>
      {s.adjusted && <p className="mt-2 rounded-lg bg-accent-soft px-2 py-1.5 text-xs text-ink">{s.adjusted}</p>}
    </div>
  );
}
