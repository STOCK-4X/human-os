"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { useState } from "react";
import { TrendChart } from "./charts";
import { Notice, Sheet, SourceBadge, cx } from "./ui";
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

const RING_COLOR: Record<Kind, string> = { energy: "var(--ring-energy)", recovery: "var(--ring-recovery)", sleep: "var(--ring-sleep)" };
const RINGS: { kind: Kind; r: number }[] = [
  { kind: "energy", r: 74 },
  { kind: "recovery", r: 56 },
  { kind: "sleep", r: 38 },
];

/** Three nested activity-style rings (direction A) in per-metric colours. */
function NestedRings({ scores }: { scores: DayScores }) {
  return (
    <svg width="156" height="156" viewBox="0 0 172 172" aria-hidden className="shrink-0">
      <g transform="rotate(-90 86 86)" fill="none" strokeWidth="13" strokeLinecap="round">
        {RINGS.map(({ kind, r }) => {
          const c = 2 * Math.PI * r;
          const s = scores[kind];
          return (
            <g key={kind}>
              <circle cx="86" cy="86" r={r} stroke="var(--ring-track)" strokeDasharray={s.status === "ok" ? undefined : "2 7"} />
              {s.status === "ok" && (
                <circle
                  cx="86"
                  cy="86"
                  r={r}
                  stroke={RING_COLOR[kind]}
                  strokeDasharray={`${(s.value! / 100) * c} ${c}`}
                  className="ring-draw"
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function TrendIcon({ t }: { t: ScoreTrend }) {
  if (!t.direction) return null;
  const I = t.direction === "up" ? ArrowUpRight : t.direction === "down" ? ArrowDownRight : ArrowRight;
  return <I size={13} aria-label={`trend ${t.direction} vs last 7 days`} />;
}

export function ScoreRings({ scores, history, profile }: { scores: DayScores; history: ScorePoint[]; profile: Profile }) {
  const [open, setOpen] = useState<Kind>();
  const kinds: Kind[] = ["energy", "recovery", "sleep"];
  return (
    <>
      <section aria-label="Today's scores" className="card p-4">
        <div className="flex items-center gap-4">
          <NestedRings scores={scores} />
          <div className="flex min-w-0 flex-1 flex-col">
            {kinds.map((k) => {
              const s = scores[k];
              const t = trendOf(history, k, s.value);
              return (
                <button
                  key={k}
                  onClick={() => setOpen(k)}
                  className="-mx-2 flex min-h-12 flex-col items-start justify-center rounded-xl px-2 py-1 text-left active:bg-surface-2"
                  aria-label={`${META[k].title}: ${s.status === "ok" ? `${s.value}${META[k].unit || META[k].max}, ${s.label}` : "not enough data"}. Open details.`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
                    <span className="h-2 w-2 rounded-full" style={{ background: RING_COLOR[k] }} />
                    {META[k].title}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className={cx("num text-[26px] leading-tight font-semibold", s.status !== "ok" && "text-muted")}>
                      {s.status === "ok" ? `${s.value}${META[k].unit}` : "—"}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs font-semibold text-muted">
                      {s.status === "ok" ? (
                        <>
                          {s.label} <TrendIcon t={t} />
                        </>
                      ) : (
                        "Not enough data"
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {(scores.bodyBattery || scores.deviceSleepScore) && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
            {scores.bodyBattery && (
              <div>
                <div>Garmin Body Battery</div>
                <div>
                  <strong className="num text-base text-ink">{scores.bodyBattery.value}</strong>
                  {scores.bodyBattery.change !== undefined && <span className="tabular"> · {scores.bodyBattery.change >= 0 ? "+" : ""}{scores.bodyBattery.change} vs yesterday</span>}
                </div>
              </div>
            )}
            {scores.deviceSleepScore && (
              <div className="text-right">
                <div>Device sleep score</div>
                <strong className="num text-base text-ink">{scores.deviceSleepScore.value}</strong>
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

const READY_TONE: Record<Readiness["level"], { box: string; chip: string; dot: string }> = {
  ready: { box: "border-good/30 bg-good/10", chip: "bg-good text-bg", dot: "bg-good" },
  moderate: { box: "border-warn/30 bg-warn/10", chip: "bg-warn text-bg", dot: "bg-warn" },
  recovery: { box: "border-bad/30 bg-bad/10", chip: "bg-bad text-bg", dot: "bg-bad" },
  insufficient: { box: "border-line bg-surface", chip: "bg-surface-2 text-muted", dot: "bg-muted" },
};

export function ReadinessCard({ r }: { r: Readiness }) {
  const tone = READY_TONE[r.level];
  return (
    <section aria-label="Readiness" className={cx("rounded-3xl border px-4 py-3.5", tone.box)}>
      <div className="flex items-center justify-between">
        <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-[0.1em] uppercase", tone.chip)}>{r.title}</span>
        <SourceBadge source="calculated" />
      </div>
      <p className="mt-2 text-[15px] leading-snug font-semibold">{r.text}</p>
      {r.reasons.length > 0 && <p className="mt-1 text-xs text-muted">Based on {r.reasons.join(", ")} — never one number alone.</p>}
      {r.safety && <div className="mt-2"><Notice tone="bad">{r.safety}</Notice></div>}
      {r.level === "ready" && <p className="mt-1 text-xs text-muted">A good score isn&apos;t a reason to push harder than planned.</p>}
    </section>
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
          <div className="num text-6xl leading-none font-semibold" style={{ color: s.status === "ok" ? RING_COLOR[kind] : undefined }}>{s.status === "ok" ? `${s.value}${META[kind].unit || ""}` : "—"}</div>
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
            {factors.map((c) => {
              const impact = c.points! >= 75 ? "helps" : c.points! < 55 ? "lowers" : "neutral";
              return (
                <li key={c.key} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{c.label}</span>
                      <span className="block text-xs text-muted">{c.input}</span>
                    </span>
                    <span
                      className={cx(
                        "shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold",
                        impact === "helps" && "bg-accent text-accent-ink",
                        impact === "lowers" && "bg-warn text-bg",
                        impact === "neutral" && "border border-line text-muted",
                      )}
                    >
                      {impact === "helps" ? "+ helps" : impact === "lowers" ? "− lowers" : "neutral"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full" style={{ width: `${c.points}%`, background: RING_COLOR[kind] }} />
                    </span>
                    <span className="tabular w-16 text-right text-[11px] text-muted">weight {c.weight}%</span>
                    {c.source && <SourceBadge source={c.source} />}
                  </div>
                </li>
              );
            })}
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
