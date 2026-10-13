"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { useState } from "react";
import { TrendChart } from "./charts";
import { Card, Notice, Sheet, SourceBadge, cx } from "./ui";
import { formatDay } from "@/lib/date";
import { planSleep } from "@/lib/sleep";
import {
  ENERGY_WEIGHTS,
  RECOVERY_WEIGHTS,
  SLEEP_WEIGHTS,
  type DayScores,
  type Readiness,
  type Score,
  type ScorePoint,
  type ScoreTrend,
  trendOf,
} from "@/lib/scores";
import type { Profile } from "@/lib/types";

type Kind = "energy" | "recovery" | "sleep";

const META: Record<Kind, { title: string; unit: string; max: string }> = {
  energy: { title: "Energy", unit: "", max: "/100" },
  recovery: { title: "Recovery", unit: "%", max: "" },
  sleep: { title: "Sleep", unit: "", max: "/100" },
};

const toneColor = (s: Score) => (s.status !== "ok" ? "var(--line)" : s.band === "high" ? "var(--accent)" : s.band === "mid" ? "var(--warn)" : "var(--bad)");

function Ring({ score, size = 104 }: { score: Score; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = score.status === "ok" ? score.value! : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeDasharray={score.status === "ok" ? undefined : "3 6"} />
      {score.status === "ok" && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneColor(score)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
        />
      )}
    </svg>
  );
}

function TrendIcon({ t }: { t: ScoreTrend }) {
  if (!t.direction) return null;
  const I = t.direction === "up" ? ArrowUpRight : t.direction === "down" ? ArrowDownRight : ArrowRight;
  return <I size={12} aria-label={`trend ${t.direction}`} />;
}

export function ScoreRings({ scores, history, profile }: { scores: DayScores; history: ScorePoint[]; profile: Profile }) {
  const [open, setOpen] = useState<Kind>();
  const kinds: Kind[] = ["energy", "recovery", "sleep"];
  return (
    <>
      <section aria-label="Today's scores" className="card px-2 py-4">
        <div className="grid grid-cols-3">
          {kinds.map((k) => {
            const s = scores[k];
            const t = trendOf(history, k, s.value);
            return (
              <button key={k} onClick={() => setOpen(k)} className="flex flex-col items-center rounded-2xl py-1 active:bg-surface-2" aria-label={`${META[k].title}: ${s.status === "ok" ? `${s.value}${META[k].unit || META[k].max}, ${s.label}` : "not enough data"}. Open details.`}>
                <div className="relative grid place-items-center">
                  <Ring score={s} />
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="text-center leading-none">
                      <span className={cx("tabular text-[26px] font-semibold tracking-tight", s.status !== "ok" && "text-muted")}>{s.status === "ok" ? s.value : "—"}</span>
                      {s.status === "ok" && <span className="text-xs text-muted">{META[k].unit}</span>}
                    </div>
                  </div>
                </div>
                <span className="eyebrow mt-2">{META[k].title}</span>
                <span className="mt-0.5 flex items-center gap-0.5 text-xs text-muted">
                  {s.status === "ok" ? (
                    <>
                      {s.label} <TrendIcon t={t} />
                    </>
                  ) : (
                    "Not enough data"
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {(scores.bodyBattery || scores.deviceSleepScore) && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line px-2 pt-3 text-xs text-muted">
            {scores.bodyBattery && (
              <div>
                <div>Garmin Body Battery</div>
                <div>
                  <strong className="tabular text-sm text-ink">{scores.bodyBattery.value}</strong>
                  {scores.bodyBattery.change !== undefined && <span className="tabular"> · {scores.bodyBattery.change >= 0 ? "+" : ""}{scores.bodyBattery.change} vs yesterday</span>}
                </div>
              </div>
            )}
            {scores.deviceSleepScore && (
              <div className="text-right">
                <div>Device sleep score</div>
                <strong className="tabular text-sm text-ink">{scores.deviceSleepScore.value}</strong>
              </div>
            )}
          </div>
        )}
      </section>
      <Sheet open={Boolean(open)} onClose={() => setOpen(undefined)} title={open ? META[open].title : ""}>
        {open && <ScoreDetail kind={open} scores={scores} history={history} profile={profile} />}
      </Sheet>
    </>
  );
}

export function ReadinessCard({ r }: { r: Readiness }) {
  const tone = r.level === "ready" ? "bg-accent-soft text-accent" : r.level === "moderate" ? "bg-warn/10 text-warn" : r.level === "recovery" ? "bg-bad/10 text-bad" : "bg-surface-2 text-muted";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="eyebrow">Readiness</span>
        <SourceBadge source="calculated" />
      </div>
      <div className="mt-2 flex items-start gap-3">
        <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase", tone)}>{r.title}</span>
        <p className="text-[15px] leading-snug">{r.text}</p>
      </div>
      {r.reasons.length > 0 && <p className="mt-2 text-xs text-muted">Based on: {r.reasons.join(", ")}.</p>}
      {r.safety && <div className="mt-2"><Notice tone="bad">{r.safety}</Notice></div>}
      {r.level === "ready" && <p className="mt-2 text-xs text-muted">A good score is not a reason to push harder than planned.</p>}
    </Card>
  );
}

function nextAction(kind: Kind, s: Score, profile: Profile): string {
  const plan = planSleep(profile.targetWake, profile.sleepNeedMin, profile.sleepLatencyMin, profile.windDownMin);
  if (s.status !== "ok")
    return kind === "sleep" ? "Log last night's sleep to get a score." : kind === "recovery" ? "Keep logging HRV or resting heart rate — a baseline needs 7 days." : "Do the morning check-in to get an estimate.";
  if (kind === "sleep") return s.band === "high" ? "Keep your schedule steady tonight." : `Protect tonight: start winding down at ${plan.windDownStart}.`;
  if (kind === "recovery")
    return s.band === "high" ? "Your normal plan is fine — no need to add intensity." : s.band === "mid" ? "Train as planned without adding intensity." : "Favour easy movement and prioritise sleep tonight.";
  return s.band === "high" ? "Use it on what matters most today." : s.band === "mid" ? "Pace yourself: short breaks, water, regular meals." : "Keep the day light where you can: a short walk outside, water, an early night.";
}

const METHOD: Record<Kind, { sources: string; method: string; baseline: string; missing: string; limits: string; weights: string }> = {
  sleep: {
    sources: "Your sleep records (manual entries, imports, or a device), your sleep need and your own quality rating.",
    method: "Weighted average of sub-scores, each 0–100.",
    weights: `Duration vs need ${SLEEP_WEIGHTS.duration}% · timing consistency ${SLEEP_WEIGHTS.consistency}% · efficiency ${SLEEP_WEIGHTS.efficiency}% · your rating ${SLEEP_WEIGHTS.quality}%`,
    baseline: "Timing is compared with your previous 7 nights. Duration is compared with the sleep need you set, not a population norm.",
    missing: "Missing parts are left out and the remaining weights are re-scaled. If time asleep wasn't measured, it's estimated from time in bed and confidence is lowered. No record → no score.",
    limits: "A custom Human OS estimate. It is not the Garmin sleep score (shown separately when available), and it isn't medically validated. Sleep stages aren't used.",
  },
  recovery: {
    sources: "Overnight HRV and resting heart rate (device or manual), the Sleep score, logged training, your tiredness rating, symptoms, and breathing rate if available.",
    method: "Each physiological input is compared with your own 28-day baseline (65 = your average, ±20 per standard deviation), then combined as a weighted average.",
    weights: `HRV ${RECOVERY_WEIGHTS.hrv}% · resting HR ${RECOVERY_WEIGHTS.rhr}% · sleep ${RECOVERY_WEIGHTS.sleep}% · training load ${RECOVERY_WEIGHTS.load}% · tiredness ${RECOVERY_WEIGHTS.fatigue}% · breathing ${RECOVERY_WEIGHTS.respiration}%`,
    baseline: "28 days before today, excluding today; at least 7 days needed for each metric.",
    missing: "Needs HRV or resting HR with an established baseline and at least half of the total weight; otherwise it says “Not enough data”. Feeling unwell caps it at 33%.",
    limits: "Inspired by the general idea of WHOOP Recovery, but it is not WHOOP's score and has not been validated. Garmin stress and Body Battery are excluded to avoid double-counting HRV.",
  },
  energy: {
    sources: "Garmin Body Battery when available, the Sleep score, your morning energy rating; otherwise also training load and device stress.",
    method: "Weighted average of available inputs (each 0–100).",
    weights: `With Body Battery: Body Battery ${ENERGY_WEIGHTS.withBodyBattery.bodyBattery}% · sleep ${ENERGY_WEIGHTS.withBodyBattery.sleep}% · how you feel ${ENERGY_WEIGHTS.withBodyBattery.subjective}%. Without: sleep ${ENERGY_WEIGHTS.withoutBodyBattery.sleep}% · how you feel ${ENERGY_WEIGHTS.withoutBodyBattery.subjective}% · load ${ENERGY_WEIGHTS.withoutBodyBattery.load}% · stress ${ENERGY_WEIGHTS.withoutBodyBattery.stress}%`,
    baseline: "Inputs are already relative (sleep vs your need, your own rating). The trend compares today with your previous 7 days.",
    missing: "Needs Body Battery or a check-in, plus enough other inputs for 60% of the weight.",
    limits: "An estimate of how charged you're likely to feel — not a measurement of energy in your body. It never replaces Garmin's Body Battery, which is shown separately as-is. Stress and activity aren't added when Body Battery is used because Body Battery already includes them.",
  },
};

function ScoreDetail({ kind, scores, history, profile }: { kind: Kind; scores: DayScores; history: ScorePoint[]; profile: Profile }) {
  const s = scores[kind];
  const t = trendOf(history, kind, s.value);
  const m = METHOD[kind];
  const used = s.components.filter((c) => c.points !== undefined);
  const missing = s.components.filter((c) => c.points === undefined);
  // Contribution relative to a neutral 65: biggest absolute effect first.
  const factors = [...used].sort((a, b) => Math.abs((b.points! - 65) * b.weight) - Math.abs((a.points! - 65) * a.weight));
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="tabular text-4xl font-semibold">{s.status === "ok" ? `${s.value}${META[kind].unit || ""}` : "—"}</div>
          <div className="text-sm text-muted">{s.status === "ok" ? s.label : "Not enough data to calculate a reliable score."}</div>
        </div>
        <div className="text-right text-xs text-muted">
          <SourceBadge source="calculated" />
          {s.confidence && <div className="mt-1">Confidence: {s.confidence}</div>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-xs text-muted">Last 7 days</div>
          <div className="tabular font-medium">{t.week === undefined ? "—" : Math.round(t.week)}</div>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-xs text-muted">Your 28-day baseline</div>
          <div className="tabular font-medium">{t.baseline === undefined ? `needs 7 days (${t.baselineN})` : Math.round(t.baseline)}</div>
        </div>
      </div>
      <TrendChart label={`${META[kind].title} over 28 days`} data={history.map((p) => ({ date: p.date, value: p[kind] }))} domain={[0, 100]} />
      {kind === "energy" && scores.bodyBattery && (
        <Notice>
          Garmin Body Battery today: <strong>{scores.bodyBattery.value}</strong> ({scores.bodyBattery.source === "garmin" ? "from Garmin" : "imported/entered"}). Daily values only — the intraday charge/drain curve needs the live Garmin API.
        </Notice>
      )}
      {kind === "sleep" && scores.deviceSleepScore && <Notice>Device sleep score (shown separately, not used here): {scores.deviceSleepScore.value}</Notice>}

      <div>
        <div className="eyebrow mb-1">Next step</div>
        <p className="text-sm">{nextAction(kind, s, profile)}</p>
      </div>

      {factors.length > 0 && (
        <div>
          <div className="eyebrow mb-1">Contributing factors</div>
          <ul className="divide-y divide-line">
            {factors.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block">{c.label}</span>
                  <span className="block text-xs text-muted">{c.input}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-xs text-muted">{c.weight}%</span>
                  <span className={cx("tabular w-9 rounded-md py-0.5 text-center text-xs font-medium", c.points! >= 67 ? "bg-accent-soft text-accent" : c.points! >= 34 ? "bg-warn/10 text-warn" : "bg-bad/10 text-bad")}>{c.points}</span>
                  {c.source && <SourceBadge source={c.source} />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length > 0 && (
        <div>
          <div className="eyebrow mb-1">Not available today</div>
          <ul className="space-y-0.5 text-xs text-muted">
            {missing.map((c) => <li key={c.key}>{c.label}: {c.note}</li>)}
          </ul>
        </div>
      )}
      {s.notes.length > 0 && <ul className="space-y-1 text-xs text-muted">{s.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}

      <details className="rounded-xl border border-line p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Info size={14} /> How is this calculated?</summary>
        <dl className="mt-3 space-y-2 text-sm">
          {(
            [
              ["Data sources", m.sources],
              ["Method", m.method],
              ["Weights", m.weights],
              ["Personal baseline", m.baseline],
              ["Missing data", m.missing],
              ["Limitations", m.limits],
              ["Confidence", "High when all inputs are present with established baselines; medium when one or two are missing or estimated; low otherwise."],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium text-muted uppercase">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="text-xs text-muted">{formatDay(scores.date, "EEEE d MMMM")} · not a medical assessment.</p>
    </div>
  );
}
