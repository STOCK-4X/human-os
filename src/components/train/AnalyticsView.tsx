"use client";

import { Info } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { PmcChart, TrendChart } from "../charts";
import { ACTIVITY_LABEL } from "../forms/WorkoutForm";
import { Card, Empty, Notice, Segmented, SourceBadge, cx } from "../ui";
import {
  formState,
  hrMax,
  loadFlag,
  personalRecords,
  pmc,
  sessionLoad,
  sleepDebt,
  volume,
  weeklyHours,
  zoneDistribution,
} from "@/lib/analytics";
import { db } from "@/lib/db";
import { metricBaseline } from "@/lib/reports";
import { RACES, bestVdot, fuelTargets, hrvTrend, predictTime, trainingPaces, zonesFor } from "@/lib/performance";
import Link from "next/link";
import { addDays, formatDay, formatDuration } from "@/lib/date";
import type { DataSet } from "@/lib/reports";
import { scoresFor } from "@/lib/scores";
import type { DayKey } from "@/lib/types";

type Range = "4w" | "12w" | "6m" | "1y";
const RANGE_DAYS: Record<Range, number> = { "4w": 28, "12w": 84, "6m": 182, "1y": 365 };

function Tile({ label, sub, value, unit, hint, tone }: { label: string; sub: string; value?: string | number; unit?: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">
        {label} <span className="font-medium normal-case">· {sub}</span>
      </div>
      <div className={cx("num mt-1 text-[26px] leading-none font-semibold", value === undefined && "text-muted", tone)}>
        {value ?? "—"}
        {value !== undefined && unit && <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

const BAND = {
  low: { label: "Low", text: "Less than your usual week — fine for recovery; over weeks fitness drifts down.", cls: "text-muted" },
  optimal: { label: "In range", text: "This week matches what your body is used to.", cls: "text-good" },
  caution: { label: "Rising", text: "Noticeably above your usual week. Keep easy days easy and sleep protected.", cls: "text-warn" },
  high: { label: "Spike", text: "Well above your usual week. Big jumps are associated with more injuries — consider holding load steady for a few days.", cls: "text-bad" },
} as const;

export function AnalyticsView({ data, today }: { data: DataSet; today: DayKey }) {
  const [range, setRange] = useState<Range>("12w");
  const weight = useLiveQuery(() => db.body.orderBy("date").filter((b) => b.weightKg !== undefined).last(), []);
  const { profile, workouts } = data;
  const imp = profile.units === "imperial";

  const series = pmc(workouts, today);
  const now = series.points.at(-1);
  const shown = series.points.filter((p) => p.date > addDays(today, -RANGE_DAYS[range]));
  const flag = loadFlag(workouts, today);
  const week = volume(workouts, addDays(today, -6), today);
  const fourWeeks = volume(workouts, addDays(today, -27), today);
  const max = hrMax(workouts, profile, today);
  const rest = metricBaseline(data.metrics, "rhr", today).mean;
  const method = profile.zoneMethod ?? "hrmax";
  const zones = zonesFor(method, { max: max?.bpm, rest, lthr: profile.lthr }) ?? (max ? zonesFor("hrmax", { max: max.bpm }) : undefined) ?? [];
  const zonesFellBack = method !== "hrmax" && !zonesFor(method, { max: max?.bpm, rest, lthr: profile.lthr });
  const run = bestVdot(workouts, today);
  const hrv = hrvTrend(data.metrics, today);
  const todayMin = workouts.filter((w) => w.date === today).reduce((a, w) => a + w.durationMin, 0);
  const avgMin = Math.round(volume(workouts, addDays(today, -6), today).hours * 60 / 7);
  const fuel = weight?.weightKg ? fuelTargets(weight.weightKg, todayMin || avgMin) : undefined;
  const dist = zoneDistribution(workouts, addDays(today, -27), today);
  const prs = personalRecords(workouts, imp);
  const debt = sleepDebt(data, today);
  const sc = scoresFor(data, today);
  const form = now ? formState(now.tsb) : undefined;
  const lastWorkout = [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
  const estimatedShare = workouts.length ? workouts.filter((w) => sessionLoad(w).method !== "hr-zones").length / workouts.length : 0;
  const unit = imp ? "mi" : "km";
  const km = (k: number) => (imp ? k / 1.609344 : k).toFixed(1);

  if (!workouts.length)
    return <Empty title="No training data yet">Connect Garmin in Profile or log workouts — analytics appear as soon as there is history.</Empty>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted">
          Training · last workout {lastWorkout ? formatDay(lastWorkout.date, "d MMM") : "—"}
        </div>
        <div className="w-56">
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: "4w", label: "4w" },
              { value: "12w", label: "12w" },
              { value: "6m", label: "6m" },
              { value: "1y", label: "1y" },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Fitness" sub="CTL" value={now ? Math.round(now.ctl) : undefined} hint="42-day load" />
        <Tile label="Fatigue" sub="ATL" value={now ? Math.round(now.atl) : undefined} hint="7-day load" />
        <Tile
          label="Form"
          sub="TSB"
          value={now ? `${now.tsb > 0 ? "+" : ""}${Math.round(now.tsb)}` : undefined}
          hint={form?.label}
          tone={form?.key === "overreaching" ? "text-bad" : form?.key === "absorbing" ? "text-warn" : undefined}
        />
        <Tile label="Load" sub="7d" value={flag.acute} hint={flag.ratio !== undefined ? `${flag.ratio}× usual week` : "rolling 7 days"} />
        <Tile label="Volume" sub="7d" value={week.hours} unit="h" hint={`${week.sessions} sessions${week.distanceKm ? ` · ${km(week.distanceKm)} ${unit}` : ""}`} />
        <Tile
          label="Weight"
          sub="latest"
          value={weight?.weightKg !== undefined ? (imp ? Math.round((weight.weightKg / 0.45359237) * 10) / 10 : Math.round(weight.weightKg * 10) / 10) : undefined}
          unit={imp ? "lb" : "kg"}
          hint={weight ? formatDay(weight.date, "d MMM") : "add in Health → Body"}
        />
      </div>

      {form && (
        <p className="text-sm">
          <strong>
            Form {Math.round(now!.tsb)} · {form.label}.
          </strong>{" "}
          <span className="text-muted">{form.text}</span>
          {!series.reliable && <span className="text-muted"> Fitness needs about 6 weeks of history to settle ({series.historyDays} days so far).</span>}
        </p>
      )}

      <Card title="Fitness, fatigue & form" action={<SourceBadge source="calculated" />}>
        <PmcChart data={shown} />
        <p className="mt-1 text-xs text-muted">Fitness rises slowly with consistent training; fatigue reacts within days. Form (bars) is the difference at the start of each day.</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Load flag" action={<SourceBadge source="calculated" />}>
          {flag.status === "ok" ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className={cx("num text-4xl font-semibold", BAND[flag.band!].cls)}>{flag.ratio}</span>
                <span className={cx("text-sm font-semibold", BAND[flag.band!].cls)}>{BAND[flag.band!].label}</span>
              </div>
              <div className="relative mt-3 h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--line) 0 40%, var(--good) 40% 65%, var(--warn) 65% 75%, var(--bad) 75% 100%)" }} aria-hidden>
                <span className="absolute -top-1 h-4 w-1 rounded bg-ink" style={{ left: `${Math.min(100, (flag.ratio! / 2) * 100)}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted tabular">
                <span>0</span>
                <span>0.8</span>
                <span>1.3</span>
                <span>1.5</span>
                <span>2+</span>
              </div>
              <p className="mt-2 text-sm text-muted">{BAND[flag.band!].text}</p>
              <p className="mt-1 text-xs text-muted">
                This week {flag.acute} vs usual {flag.chronicWeekly}
                {flag.monotony !== undefined && ` · monotony ${flag.monotony}`}
                {flag.strain !== undefined && ` · strain ${flag.strain}`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Needs 3 weeks of training history to compare this week with your usual.</p>
          )}
        </Card>

        <Card title="Today" action={<SourceBadge source="calculated" />}>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-muted">Readiness</div>
              <div className="text-sm font-semibold">{sc.readiness.title}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Recovery</div>
              <div className="num text-lg font-semibold">{sc.recovery.value !== undefined ? `${sc.recovery.value}%` : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Sleep debt</div>
              <div className="num text-lg font-semibold">{debt.nights ? formatDuration(debt.minutes) : "—"}</div>
              <div className="text-[10px] text-muted">{debt.nights}-night</div>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">{sc.readiness.text}</p>
        </Card>
      </div>

      <Card title="Weekly volume">
        <TrendChart label="Training hours per week" kind="bar" data={weeklyHours(workouts, today, Math.max(4, Math.round(RANGE_DAYS[range] / 7)))} fmt={(n) => `${n}h`} domain={[0, "auto"]} />
        {fourWeeks.bySport.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {fourWeeks.bySport.map((s) => (
              <li key={s.type} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0">{ACTIVITY_LABEL[s.type]}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(s.hours / fourWeeks.hours) * 100}%` }} />
                </span>
                <span className="tabular w-28 text-right text-xs text-muted">
                  {s.hours} h · {s.sessions}×{s.distanceKm ? ` · ${km(s.distanceKm)} ${unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Sport split over the last 4 weeks.</p>
      </Card>

      <Card title="Running fitness" action={<SourceBadge source="calculated" />}>
        {run ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="num text-4xl font-semibold">{run.vdot}</span>
              <span className="text-sm text-muted">VDOT · from your {run.from.label} on {formatDay(run.from.date, "d MMM")}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {RACES.map((r) => (
                <div key={r.label} className="rounded-xl bg-surface-2 px-3 py-2">
                  <div className="text-xs text-muted">{r.label}</div>
                  <div className="num text-lg font-semibold">{hms(predictTime(run.vdot, r.m))}</div>
                </div>
              ))}
            </div>
            <div className="eyebrow mt-4 mb-1">Training paces (/{imp ? "mi" : "km"})</div>
            <ul className="divide-y divide-line">
              {trainingPaces(run.vdot).map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0">
                    <strong>{p.key}</strong> {p.label} <span className="block truncate text-xs text-muted">{p.purpose}</span>
                  </span>
                  <span className="num shrink-0 font-semibold">
                    {pace(p.secPerKm[0], imp)}
                    {p.key === "E" && `–${pace(p.secPerKm[1], imp)}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Daniels VDOT from fast segments of your runs — usually a little below true race fitness. Log a race to sharpen it.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Needs a run with a 5 km or 10 km split in the last 6 months.</p>
        )}
      </Card>

      <Card title="HRV trend" action={<SourceBadge source="calculated" />}>
        {hrv.status === "ok" ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="num text-3xl font-semibold">{hrv.rolling7}</span>
              <span className="text-sm text-muted">ms · 7-day average</span>
              <span className={cx("ml-auto rounded-full px-2 py-0.5 text-xs font-semibold", hrv.band === "within" ? "bg-good/15 text-good" : "bg-warn/15 text-warn")}>
                {hrv.band === "within" ? "In your normal range" : hrv.band === "below" ? "Below normal" : "Above normal"}
              </span>
            </div>
            <TrendChart label="7-day rolling HRV with your normal range" data={hrv.series.map((p) => ({ date: p.date, value: p.rolling }))} band={{ low: hrv.normalLow!, high: hrv.normalHigh! }} />
            <p className="mt-1 text-sm text-muted">
              {hrv.band === "within"
                ? "Recovery capacity looks normal — train as planned."
                : hrv.band === "below"
                  ? "Your weekly HRV is under your usual range: favour easier sessions until it returns, especially if you also feel tired."
                  : "Above your usual range. Usually fine; if resting HR is also up and you feel flat, it can signal accumulated fatigue."}{" "}
              Day-to-day variation {hrv.cv}% · normal {hrv.normalLow}–{hrv.normalHigh} ms.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            {hrv.days < 21
              ? `Needs 3 weeks of overnight HRV (${hrv.days} nights so far).`
              : `Needs at least 4 nights of HRV in the last 7 days (${hrv.recentNights} so far) — wear your watch to sleep.`}
          </p>
        )}
      </Card>

      <Card title="Heart-rate zones" action={<span className="text-xs text-muted">{method === "hrr" ? "Heart-rate reserve" : method === "lthr" ? "Lactate threshold" : "% of HRmax"}{max ? ` · max ${max.bpm}` : ""}</span>}>
        {zones.length ? (
          <ul className="divide-y divide-line">
            {zones.map((z) => (
              <li key={z.zone} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-8 font-bold">Z{z.zone}</span>
                <span className="flex-1 text-muted">{z.name}</span>
                <span className="num w-24 text-right font-semibold">{z.zone === 1 && method === "lthr" ? `< ${z.high + 1}` : `${z.low}–${z.high}`}</span>
                <span className="tabular w-12 text-right text-xs text-muted">{dist.minutes[z.zone - 1] ? `${dist.minutes[z.zone - 1]}m` : "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Add your birth year or lactate threshold in Profile → Performance, or sync workouts with heart rate.</p>
        )}
        {zonesFellBack && <p className="mt-1 text-xs text-warn">{method === "lthr" ? "Add your lactate-threshold HR in Profile" : "Needs a resting-HR baseline"} — showing % of HRmax for now.</p>}
        {dist.share && (
          <>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full" aria-hidden>
              {dist.share.map((s, i) => (
                <span key={i} style={{ width: `${s * 100}%`, background: ["#9aa1ab", "var(--ring-energy)", "var(--ring-sleep)", "var(--warn)", "var(--accent)"][i] }} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Last 4 weeks: {Math.round(dist.easyShare! * 100)}% easy (Z1–2), {Math.round(dist.hardShare! * 100)}% hard (Z4–5). Most endurance athletes do ≈80% easy. Minutes use your watch&apos;s zones.
            </p>
          </>
        )}
      </Card>

      <Card title="Fuel today" action={<SourceBadge source="calculated" />}>
        {fuel ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 py-2">
                <div className="text-xs text-muted">Protein</div>
                <div className="num font-semibold">{fuel.proteinG[0]}–{fuel.proteinG[1]} g</div>
              </div>
              <div className="rounded-xl bg-surface-2 py-2">
                <div className="text-xs text-muted">Carbs</div>
                <div className="num font-semibold">{fuel.carbsG[0]}–{fuel.carbsG[1]} g</div>
              </div>
              <div className="rounded-xl bg-surface-2 py-2">
                <div className="text-xs text-muted">Fluids</div>
                <div className="num font-semibold">≈{(fuel.fluidMl / 1000).toFixed(1)} L</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              For a {fuel.carbBand} training day ({todayMin || avgMin} min). Spread protein over 3–5 meals; eat more carbs around harder sessions. Ranges to fuel training, not limits.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Add your weight in Health → Body to see daily protein and carb ranges.</p>
        )}
      </Card>

      <Card title="Personal records" action={<SourceBadge source="calculated" />}>
        {prs.length ? (
          <ul className="divide-y divide-line">
            {prs.map((p) => (
              <li key={p.key} className="flex items-center justify-between py-2 text-sm">
                <span>{p.label}</span>
                <span className="flex items-center gap-2">
                  <span className="num font-semibold">{p.value}</span>
                  <span className="text-xs text-muted">{formatDay(p.date, "d MMM yy")}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Records appear once runs with distance are synced.</p>
        )}
      </Card>

      <details className="rounded-2xl border border-line p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Info size={14} aria-hidden /> How these are calculated
        </summary>
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          <li>
            <strong className="text-ink">Load</strong> per session = minutes in each heart-rate zone × zone number (Edwards TRIMP). Without zone data: minutes × effort × 0.4; without effort: minutes × 1.5 (estimate).
            {estimatedShare > 0 && ` ${Math.round(estimatedShare * 100)}% of your sessions use a fallback.`}
          </li>
          <li>
            <strong className="text-ink">Fitness / Fatigue</strong> = 42- and 7-day exponentially weighted daily load. <strong className="text-ink">Form</strong> = yesterday&apos;s fitness − fatigue.
          </li>
          <li>
            <strong className="text-ink">Load flag</strong> = last 7 days ÷ average week of the last 28 (acute:chronic ratio). Monotony = mean ÷ SD of daily load; strain = weekly load × monotony (Foster).
          </li>
          <li>
            <strong className="text-ink">Sleep debt</strong> = shortfall vs your own sleep need over the last 7 logged nights.
          </li>
          <li>These are Human OS estimates from published training-science methods. They are not Garmin&apos;s or TrainingPeaks&apos; numbers and they don&apos;t diagnose anything.</li>
          <li>
            <Link href="/evidence" className="font-semibold text-accent">
              All methods and research sources →
            </Link>
          </li>
        </ul>
      </details>
      {!series.reliable && <Notice>Analytics get more accurate with at least 6 weeks of synced training.</Notice>}
    </div>
  );
}

function hms(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function pace(secPerKm: number, imperial: boolean) {
  const s = imperial ? secPerKm * 1.609344 : secPerKm;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}
