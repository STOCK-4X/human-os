"use client";

import { FlaskConical, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TrendChart } from "../charts";
import { SleepForm } from "../forms/SleepForm";
import { Card, Empty, Field, Segmented, Sheet, SourceBadge, Stat } from "../ui";
import { updateProfile } from "@/lib/db";
import { addDays, clockToMin, dayRange, formatDay, formatDuration, formatInstant, minToClock, weekStart } from "@/lib/date";
import { bedtimeMinutes, sleepBaseline, sleepInRange, type DataSet } from "@/lib/reports";
import { consistencyLabel, gradualShift, planSleep, sleepAmount, sleepConsistency, timeInBedMin } from "@/lib/sleep";
import { mean } from "@/lib/stats";
import type { DayKey, SleepRecord } from "@/lib/types";

const TIPS = [
  { title: "Keep a consistent wake time", body: "The same wake time every day — weekends included, within about an hour — anchors your body clock more than anything else.", exp: "Consistent wake time" },
  { title: "Get morning light", body: "10–30 minutes of outdoor light soon after waking helps you feel alert in the morning and sleepy at night.", exp: "Morning outdoor light" },
  { title: "Time your caffeine", body: "Caffeine lingers for many hours. An early-afternoon cut-off helps many people fall asleep more easily.", exp: "Earlier caffeine cut-off" },
  { title: "Wind down", body: "30–60 minutes of dimmer light and calmer activities before bed makes it easier to fall asleep.", exp: "Consistent evening wind-down" },
  { title: "Screens in bed", body: "Bright, engaging screens late at night can delay sleep. Try leaving the phone outside the bedroom.", exp: "No screens in bed" },
  { title: "Cool, dark, quiet", body: "A cool, dark and quiet bedroom supports deeper, less interrupted sleep.", exp: undefined },
  { title: "Exercise timing", body: "Regular exercise generally improves sleep; very intense sessions close to bedtime affect some people.", exp: "Earlier workouts" },
  { title: "Stress", body: "If your mind races at night, try writing down tomorrow's tasks or a short breathing exercise during wind-down.", exp: undefined },
];

export function SleepTab({ data, today }: { data: DataSet; today: DayKey }) {
  const { profile } = data;
  const tz = profile.timeZone;
  const [range, setRange] = useState<"7" | "28" | "90">("28");
  const [edit, setEdit] = useState<SleepRecord | "new">();
  const from = addDays(today, -(Number(range) - 1));
  const nights = sleepInRange(data.sleep, from, today);
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const days = dayRange(from, today);
  const amounts = nights.map((n) => sleepAmount(n, profile.sleepLatencyMin));
  const anyEstimated = amounts.some((a) => a.kind === "estimated");
  const cons = sleepConsistency(nights, tz);
  const base = sleepBaseline(data.sleep, today, profile.sleepLatencyMin);
  const last = nights.at(-1);

  const durationSeries = days.map((d) => {
    const n = byDate.get(d);
    return { date: d, value: n ? sleepAmount(n, profile.sleepLatencyMin).minutes : undefined };
  });
  const bedSeries = days.map((d) => ({ date: d, value: byDate.get(d) ? bedtimeMinutes(byDate.get(d)!, tz) : undefined }));
  const wakeSeries = days.map((d) => {
    const n = byDate.get(d);
    if (!n) return { date: d, value: undefined };
    const [h, m] = formatInstant(n.wakeTime, tz).split(":").map(Number);
    return { date: d, value: h * 60 + m };
  });
  const weekly =
    range === "90"
      ? [...new Set(days.map(weekStart))].map((ws) => {
          const wk = nights.filter((n) => weekStart(n.date) === ws);
          return { date: ws, value: mean(wk.map((n) => sleepAmount(n, profile.sleepLatencyMin).minutes)) };
        })
      : undefined;

  return (
    <div className="space-y-4">
      <Segmented
        label="Range"
        value={range}
        onChange={setRange}
        options={[
          { value: "7", label: "7 days" },
          { value: "28", label: "28 days" },
          { value: "90", label: "90 days" },
        ]}
      />

      <Card title="Sleep duration" action={<button className="btn-quiet min-h-9 px-2 text-sm" onClick={() => setEdit("new")}><Plus size={16} /> Log</button>}>
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="Average" value={formatDuration(mean(amounts.map((a) => a.minutes)))} source="calculated" hint={`${nights.length} nights`} />
          <Stat label="Goal" value={formatDuration(profile.sleepNeedMin)} source="manual" />
          <Stat label="Your usual" value={base.status === "ok" ? formatDuration(base.mean) : undefined} source="calculated" hint={base.status === "ok" ? "28-day baseline" : `needs ${base.required} nights`} />
        </div>
        {nights.length ? (
          <TrendChart label="Sleep duration per night" kind="bar" data={durationSeries} target={profile.sleepNeedMin} fmt={(n) => `${Math.floor(n / 60)}h`} domain={[0, "auto"]} />
        ) : (
          <Empty title="No nights in this range" />
        )}
        {anyEstimated && <p className="mt-2 text-xs text-muted">Nights without a measured asleep time show an estimate: time in bed − {profile.sleepLatencyMin} min.</p>}
      </Card>

      {weekly && (
        <Card title="Weekly average">
          <TrendChart label="Weekly average sleep" kind="bar" data={weekly} target={profile.sleepNeedMin} fmt={(n) => `${Math.floor(n / 60)}h`} domain={[0, "auto"]} />
        </Card>
      )}

      <Card title="Schedule consistency">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat label="Avg bedtime" value={cons.avgBedtime} hint={cons.bedtimeSdMin !== undefined ? `±${Math.round(cons.bedtimeSdMin)} min · ${consistencyLabel(cons.bedtimeSdMin)}` : "needs 2+ nights"} source="calculated" />
          <Stat label="Avg wake" value={cons.avgWake} hint={cons.wakeSdMin !== undefined ? `±${Math.round(cons.wakeSdMin)} min · ${consistencyLabel(cons.wakeSdMin)}` : undefined} source="calculated" />
        </div>
        {nights.length > 1 && (
          <>
            <div className="eyebrow">Bedtime</div>
            <TrendChart label="Bedtime by night" data={bedSeries} fmt={(n) => minToClock(n)} height={130} />
            <div className="eyebrow mt-2">Wake time</div>
            <TrendChart label="Wake time by night" data={wakeSeries} fmt={(n) => minToClock(n)} height={130} />
          </>
        )}
      </Card>

      {last && (last.deepMin || last.remMin || last.lightMin) && (
        <Card title={`Stages · ${formatDay(last.date)}`} action={<SourceBadge source={last.source} />}>
          <StageBar r={last} />
          <p className="mt-2 text-xs text-muted">Consumer wearables estimate stages from movement and heart rate; treat them as rough guides.</p>
        </Card>
      )}

      <Planner data={data} today={today} />

      <Card title="What helps sleep">
        <ul className="divide-y divide-line">
          {TIPS.map((t) => (
            <li key={t.title} className="py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{t.title}</div>
                  <p className="text-sm text-muted">{t.body}</p>
                </div>
                {t.exp && (
                  <Link href={`/experiments?preset=${encodeURIComponent(t.exp)}`} className="btn-quiet min-h-9 shrink-0 px-2 text-xs" aria-label={`Experiment: ${t.exp}`}>
                    <FlaskConical size={14} /> Try
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Recent nights">
        {nights.length ? (
          <ul className="divide-y divide-line">
            {[...nights].reverse().slice(0, 14).map((n) => {
              const a = sleepAmount(n, profile.sleepLatencyMin);
              return (
                <li key={n.id}>
                  <button className="flex min-h-12 w-full items-center justify-between gap-2 text-left" onClick={() => setEdit(n)}>
                    <span>
                      <span className="block text-sm">{formatDay(n.date)}</span>
                      <span className="tabular block text-xs text-muted">
                        {formatInstant(n.bedtime, tz)}–{formatInstant(n.wakeTime, tz)} · in bed {formatDuration(timeInBedMin(n))}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-sm font-medium">{formatDuration(a.minutes)}{a.kind === "estimated" && <span className="text-xs text-muted"> est.</span>}</span>
                      <SourceBadge source={n.source} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="No sleep logged yet" />
        )}
      </Card>

      <Sheet open={Boolean(edit)} onClose={() => setEdit(undefined)} title={edit === "new" ? "Log sleep" : "Edit sleep"}>
        {edit && <SleepForm key={edit === "new" ? "new" : edit.id} profile={profile} date={today} existing={edit === "new" ? undefined : edit} onDone={() => setEdit(undefined)} />}
      </Sheet>
    </div>
  );
}

function StageBar({ r }: { r: SleepRecord }) {
  const parts = [
    { k: "Deep", v: r.deepMin, c: "bg-accent" },
    { k: "Light", v: r.lightMin, c: "bg-accent/50" },
    { k: "REM", v: r.remMin, c: "bg-[var(--chart-2)]" },
    { k: "Awake", v: r.awakeMin, c: "bg-line" },
  ].filter((p) => p.v);
  const total = parts.reduce((a, p) => a + (p.v ?? 0), 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.k} className={p.c} style={{ width: `${((p.v ?? 0) / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${p.c}`} /> {p.k} <span className="tabular text-muted">{formatDuration(p.v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Planner({ data, today }: { data: DataSet; today: DayKey }) {
  const { profile } = data;
  const plan = planSleep(profile.targetWake, profile.sleepNeedMin, profile.sleepLatencyMin, profile.windDownMin);
  const cons = sleepConsistency(sleepInRange(data.sleep, addDays(today, -6), today), profile.timeZone);
  const shift =
    cons.avgWake && cons.nights >= 3 && Math.abs(clockToMin(cons.avgWake) - clockToMin(profile.targetWake)) >= 30
      ? gradualShift(cons.avgWake, profile.targetWake, profile.sleepNeedMin, profile.sleepLatencyMin)
      : [];
  const set = (patch: Parameters<typeof updateProfile>[0]) => updateProfile(patch);
  return (
    <Card title="Bedtime planner">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Wake up at">{(id) => <input id={id} type="time" className="input" value={profile.targetWake} onChange={(e) => e.target.value && set({ targetWake: e.target.value })} />}</Field>
        <Field label="Sleep you need">
          {(id) => (
            <select id={id} className="input" value={profile.sleepNeedMin} onChange={(e) => set({ sleepNeedMin: Number(e.target.value) })}>
              {Array.from({ length: 13 }, (_, i) => 360 + i * 15).map((m) => (
                <option key={m} value={m}>{formatDuration(m)}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Time to fall asleep">
          {(id) => (
            <select id={id} className="input" value={profile.sleepLatencyMin} onChange={(e) => set({ sleepLatencyMin: Number(e.target.value) })}>
              {[5, 10, 15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          )}
        </Field>
        <Field label="Wind-down">
          {(id) => (
            <select id={id} className="input" value={profile.windDownMin} onChange={(e) => set({ windDownMin: Number(e.target.value) })}>
              {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center">
        <div><div className="text-xs text-muted">Wind down</div><div className="tabular text-lg font-semibold">{plan.windDownStart}</div></div>
        <div><div className="text-xs text-muted">In bed, lights out</div><div className="tabular text-lg font-semibold">{plan.lightsOut}</div></div>
        <div><div className="text-xs text-muted">Wake</div><div className="tabular text-lg font-semibold">{plan.wake}</div></div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Time in bed {formatDuration(plan.timeInBedMin)} = {formatDuration(plan.sleepNeedMin)} sleep + {profile.sleepLatencyMin} min to fall asleep. Sleep needs differ between people; adjust to what leaves you feeling rested.
      </p>
      {shift.length > 0 && (
        <div className="mt-3">
          <div className="eyebrow mb-1">Gradual shift from your recent {cons.avgWake} wake time</div>
          <ul className="space-y-1 text-sm">
            {shift.map((s) => (
              <li key={s.fromDay} className="tabular">From day {s.fromDay}: wake {s.wake}, lights out {s.lightsOut}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">15 minutes every 3 days. Bedtime moves with wake time so you never lose sleep.</p>
        </div>
      )}
    </Card>
  );
}
