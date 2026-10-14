"use client";

import { CalendarCheck, ChevronRight, MessageCircle, Moon, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CheckInForm } from "@/components/forms/CheckInForm";
import { LifestyleLogger } from "@/components/forms/LifestyleLogger";
import { MetricsForm } from "@/components/forms/MetricsForm";
import { SleepForm } from "@/components/forms/SleepForm";
import { WorkoutForm, ACTIVITY_LABEL } from "@/components/forms/WorkoutForm";
import { HabitList } from "@/components/HabitList";
import { ReadinessCard, ScoreRings } from "@/components/ScoreRings";
import { Card, Empty, Loading, Page, Sheet, SourceBadge, Stat } from "@/components/ui";
import { useDataSet, useNow } from "@/hooks/data";
import { buildBriefing } from "@/lib/briefing";
import { addDays, clockOf, dayProgress, formatDay, formatDuration, formatInstant, todayKey } from "@/lib/date";
import { metricBaseline, metricOn, sleepByDate, sleepInRange, type DataSet } from "@/lib/reports";
import { consistencyLabel, planSleep, sleepAmount, sleepConsistency, timeInBedMin } from "@/lib/sleep";
import { scoreHistory, scoresFor } from "@/lib/scores";
import { deviation } from "@/lib/stats";
import type { MetricKey } from "@/lib/types";

type SheetKind = "checkin" | "sleep" | "metrics" | "workout" | undefined;

function greeting(clock: string) {
  const h = Number(clock.slice(0, 2));
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function TodayPage() {
  const data = useDataSet();
  const now = useNow();
  const [sheet, setSheet] = useState<SheetKind>();
  if (!data) return <Page title="Today"><Loading /></Page>;
  return <Today data={data} now={now} sheet={sheet} setSheet={setSheet} />;
}

function Today({ data, now, sheet, setSheet }: { data: DataSet; now: Date; sheet: SheetKind; setSheet: (s: SheetKind) => void }) {
  const { profile } = data;
  const tz = profile.timeZone;
  const today = todayKey(tz, now);
  const clock = clockOf(now, tz);
  const plan = planSleep(profile.targetWake, profile.sleepNeedMin, profile.sleepLatencyMin, profile.windDownMin);
  const brief = buildBriefing(data, today);
  const checkin = data.checkins.find((c) => c.date === today);
  const night = sleepByDate(data.sleep).get(today);
  const week = sleepInRange(data.sleep, addDays(today, -6), today);
  const cons = sleepConsistency(week, tz);
  const hidden = new Set(profile.hiddenMetrics);
  const workoutsToday = data.workouts.filter((w) => w.date === today);
  const close = () => setSheet(undefined);
  const scores = scoresFor(data, today);
  const history = scoreHistory(data, addDays(today, -28), today);
  const [skipped, setSkipped] = useState(() => {
    try {
      return localStorage.getItem(`hos-checkin-skip:${today}`) === "1";
    } catch {
      return false;
    }
  });

  const recovery = (key: MetricKey, label: string, unit: string, minBand: number, goodWhen: "low" | "high") => {
    if (hidden.has(key)) return null;
    const p = metricOn(data.metrics, key, today);
    const b = metricBaseline(data.metrics, key, today);
    const dv = deviation(p?.value, b, minBand);
    const off = (goodWhen === "low" && dv === "above") || (goodWhen === "high" && dv === "below");
    return (
      <Stat
        key={key}
        label={label}
        value={p?.value}
        unit={unit}
        source={p?.source}
        tone={off ? "warn" : undefined}
        hint={b.status === "ok" ? `usual ${Math.round(b.low!)}–${Math.round(b.high!)}` : `baseline ${b.n}/${b.required} days`}
      />
    );
  };

  const steps = metricOn(data.metrics, "steps", today) ?? metricOn(data.metrics, "steps", addDays(today, -1));

  const progress = dayProgress(clock, profile.targetWake, plan.lightsOut);
  const windPos = dayProgress(plan.windDownStart, profile.targetWake, plan.lightsOut);
  return (
    <Page
      eyebrow={`${formatDay(today, "EEE d MMM")} · ${clock}`}
      title={`${greeting(clock)}${profile.displayName ? `, ${profile.displayName}` : ""}`}
      action={
        <Link href="/coach" className="btn-ghost h-11 w-11 shrink-0 rounded-full px-0 text-accent" aria-label="Open AI coach">
          <Sparkles size={18} />
        </Link>
      }
    >
      <ScoreRings scores={scores} history={history} profile={profile} />
      <ReadinessCard r={scores.readiness} />

      {!checkin && !skipped && (
        <div className="card flex items-center gap-3">
          <button onClick={() => setSheet("checkin")} className="flex flex-1 items-center gap-3 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent">
              <CalendarCheck size={20} />
            </span>
            <span className="flex-1">
              <span className="block font-medium">Morning energy check-in</span>
              <span className="block text-sm text-muted">Three quick questions. Puts your wearable data in context.</span>
            </span>
            <ChevronRight size={18} className="text-muted" />
          </button>
          <button
            className="btn-quiet min-h-9 px-2 text-xs"
            onClick={() => {
              try {
                localStorage.setItem(`hos-checkin-skip:${today}`, "1");
              } catch {}
              setSkipped(true);
            }}
          >
            Not today
          </button>
        </div>
      )}

      {checkin && (
        <button onClick={() => setSheet("checkin")} className="flex w-full items-center justify-between rounded-2xl px-1 text-left text-sm text-muted">
          <span>
            Felt energy <strong className="num text-ink">{checkin.energy ?? "—"}</strong>/10 · tiredness <strong className="num text-ink">{checkin.fatigue ?? "—"}</strong>/10 · focus{" "}
            <strong className="num text-ink">{checkin.focus ?? "—"}</strong>/10
            {checkin.intention ? ` · “${checkin.intention}”` : ""}
          </span>
          <span className="text-xs">Edit</span>
        </button>
      )}

      <section aria-label="Your day" className="card">
        <div className="flex justify-between text-xs text-muted tabular">
          <span>Wake {profile.targetWake}</span>
          <span className="font-semibold text-ink">Now {clock}</span>
          <span>Lights out {plan.lightsOut}</span>
        </div>
        <div className="relative mt-2.5 h-2 rounded-full bg-surface-2" role="progressbar" aria-label="Progress through your day" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-2 rounded-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
          <div className="absolute -top-1 h-4 w-0.5 rounded bg-warn" style={{ left: `${windPos * 100}%` }} title={`Wind down ${plan.windDownStart}`} />
        </div>
        <p className="mt-2.5 text-sm text-muted">
          <Moon size={14} aria-hidden className="mr-1 inline align-[-2px]" />
          Wind down at <strong className="tabular text-ink">{plan.windDownStart}</strong> for {formatDuration(profile.sleepNeedMin)} of sleep before {plan.wake}.
        </p>
      </section>

      <Card title="Habits" action={<Link href="/habits" className="text-sm text-muted">All</Link>}>
        <HabitList
          habits={data.habits}
          logs={data.habitLogs}
          date={today}
          empty={<Empty title="No habits yet" action={<Link className="btn-ghost" href="/habits">Set up habits</Link>}>Start with two or three small ones.</Empty>}
        />
      </Card>

      <Card title="Today's focus" action={<SourceBadge source="calculated" />}>
        <p className="text-[17px] leading-snug font-medium">{brief.focus}</p>
        <p className="mt-1 text-sm text-muted">One small step: {brief.small_action}</p>
        {(brief.going_well.length > 0 || brief.attention.length > 0) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {brief.going_well.length > 0 && (
              <div>
                <div className="eyebrow mb-1">Going well</div>
                <ul className="space-y-1 text-sm">{brief.going_well.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
            {brief.attention.length > 0 && (
              <div>
                <div className="eyebrow mb-1">Worth attention</div>
                <ul className="space-y-1 text-sm">{brief.attention.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {brief.dataNotes.length > 0 && <p className="mt-3 text-xs text-muted">{brief.dataNotes.join(" ")}</p>}
        <Link href="/coach" className="btn-ghost mt-3 w-full">
          <MessageCircle size={16} /> Ask the coach
        </Link>
      </Card>

      <Card title="Quick log">
        <LifestyleLogger profile={profile} date={today} logs={data.lifestyle} />
      </Card>

      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-2xl px-1 text-sm font-semibold text-muted">
          Sleep, body signals & activity
          <ChevronRight size={18} className="transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <div className="mt-2 space-y-4">
      <Card
        title="Sleep"
        action={
          <button className="btn-quiet min-h-9 px-2 text-sm" onClick={() => setSheet("sleep")}>
            {night ? "Edit" : <><Plus size={16} /> Log</>}
          </button>
        }
      >
        {night ? (
          (() => {
            const amt = sleepAmount(night, profile.sleepLatencyMin);
            return (
              <div className="grid grid-cols-3 gap-3">
                <Stat label={amt.kind === "measured" ? "Asleep" : "Asleep (est.)"} value={formatDuration(amt.minutes)} source={amt.kind === "measured" ? night.source : "calculated"} />
                <Stat label="In bed" value={formatDuration(timeInBedMin(night))} source="calculated" hint={`${formatInstant(night.bedtime, tz)}–${formatInstant(night.wakeTime, tz)}`} />
                {!hidden.has("sleepScore") && night.score !== undefined ? (
                  <Stat label="Sleep score" value={night.score} source={night.source} />
                ) : (
                  <Stat label="Quality" value={night.quality} unit="/5" source="manual" />
                )}
              </div>
            );
          })()
        ) : (
          <Empty title="No sleep logged for last night">Log it in a few seconds, or import from a file in Profile.</Empty>
        )}
        <p className="mt-3 text-xs text-muted">
          7-night bedtime: {consistencyLabel(cons.bedtimeSdMin)}
          {cons.bedtimeSdMin !== undefined && ` (±${Math.round(cons.bedtimeSdMin)} min, ${cons.nights} nights)`}
        </p>
      </Card>

      <Card
        title="Body signals"
        action={
          <button className="btn-quiet min-h-9 px-2 text-sm" onClick={() => setSheet("metrics")}>
            Enter
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {recovery("hrv", "HRV", "ms", 4, "high")}
          {recovery("rhr", "Resting HR", "bpm", 3, "low")}
          {recovery("bodyBattery", "Body Battery", "", 10, "high")}
          {recovery("stress", "Stress", "", 8, "low")}
        </div>
        <p className="mt-3 text-xs text-muted">Wearable scores are device estimates. Compared with your own recent range, not universal norms.</p>
      </Card>

      <Card
        title="Activity"
        action={
          <button className="btn-quiet min-h-9 px-2 text-sm" onClick={() => setSheet("workout")}>
            <Plus size={16} /> Workout
          </button>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Stat label={steps?.date === today ? "Steps today" : "Steps yesterday"} value={steps?.value.toLocaleString()} source={steps?.source} />
          <Stat label="Active" value={metricOn(data.metrics, "activeMin", today)?.value} unit="min" source={metricOn(data.metrics, "activeMin", today)?.source} />
          <Stat label="Sessions" value={workoutsToday.length || undefined} hint={workoutsToday.map((w) => ACTIVITY_LABEL[w.type]).join(", ") || undefined} source="manual" />
        </div>
      </Card>
        </div>
      </details>

      <div className="grid grid-cols-3 gap-2">
        <Link href="/review" className="btn-ghost px-2">Review</Link>
        <Link href="/coach" className="btn-ghost px-2">AI briefing</Link>
        <Link href="/achievements" className="btn-ghost px-2">Milestones</Link>
      </div>

      <SheetHost sheet={sheet} close={close} data={data} today={today} />
    </Page>
  );
}


function SheetHost({ sheet, close, data, today }: { sheet: SheetKind; close: () => void; data: DataSet; today: string }) {
  const checkin = data.checkins.find((c) => c.date === today);
  const night = data.sleep.find((s) => s.date === today && s.source === "manual") ?? sleepByDate(data.sleep).get(today);
  return (
    <>
      <Sheet open={sheet === "checkin"} onClose={close} title="Check-in">
        <CheckInForm key={today + (checkin?.updatedAt ?? "")} date={today} existing={checkin} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "sleep"} onClose={close} title="Last night's sleep">
        <SleepForm key={night?.id ?? "new"} profile={data.profile} date={today} existing={night} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "metrics"} onClose={close} title="Today's metrics">
        <MetricsForm date={today} metrics={data.metrics} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "workout"} onClose={close} title="Log workout">
        <WorkoutForm profile={data.profile} date={today} onDone={close} />
      </Sheet>
    </>
  );
}
