"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";
import { Card, Empty, Field, Loading, Notice, Page, ProgressBar, SourceBadge, Stat, cx } from "@/components/ui";
import { useDataSet, useToday } from "@/hooks/data";
import { CHALLENGE_DAYS, MILESTONES, PHASES, challengeDay } from "@/lib/challenge";
import { db } from "@/lib/db";
import { addDays, formatDay, formatDuration, nowIso, weekStart } from "@/lib/date";
import { consistency, indexLogs } from "@/lib/habits";
import { summarize, type DataSet } from "@/lib/reports";
import type { Challenge, DayKey, Habit } from "@/lib/types";

export default function ChallengePage() {
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);
  const challenge = useLiveQuery(async () => (await db.challenges.toArray()).filter((c) => c.status === "active").at(-1) ?? null, []);
  return (
    <Page title="45-day challenge" subtitle="A sustainable foundation — not an extreme challenge.">
      {!data || !today || challenge === undefined ? (
        <Loading />
      ) : challenge ? (
        <Active data={data} today={today} c={challenge} />
      ) : (
        <Setup data={data} today={today} />
      )}
    </Page>
  );
}

function Setup({ data, today }: { data: DataSet; today: DayKey }) {
  const active = data.habits.filter((h) => !h.archived);
  const [picked, setPicked] = useState<number[]>(active.slice(0, 3).map((h) => h.id!));
  const [intent, setIntent] = useState("");
  const [start, setStart] = useState(today);
  const past = useLiveQuery(() => db.challenges.toArray(), []);

  return (
    <>
      <Card>
        <ul className="space-y-2 text-sm">
          {PHASES.map((p) => (
            <li key={p.n}>
              <strong>Days {p.from}–{p.to} · {p.name}.</strong> <span className="text-muted">{p.focus}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Missed days don&apos;t reset anything. Rest days are part of the plan. You can change goals at any time.</p>
      </Card>
      <Card title="Choose 2–5 habits">
        {active.length === 0 ? (
          <Empty title="Create a few habits first" action={<Link href="/habits" className="btn-ghost">Go to habits</Link>}>
            Pick from suggestions like sleep consistency, a morning walk, hydration or an evening wind-down.
          </Empty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.map((h) => {
              const on = picked.includes(h.id!);
              return (
                <button key={h.id} aria-pressed={on} className={on ? "chip-on" : "chip"} onClick={() => setPicked(on ? picked.filter((x) => x !== h.id) : [...picked, h.id!])}>
                  {h.name}
                </button>
              );
            })}
          </div>
        )}
        {picked.length > 5 && <p className="mt-2 text-xs text-warn">Fewer habits are easier to keep. Consider 3–4.</p>}
      </Card>
      <Card title="Why are you doing this?">
        <Field label="Intention">{(id) => <textarea id={id} rows={2} className="input py-2" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="e.g. Wake up with energy and feel strong" />}</Field>
        <div className="mt-3">
          <Field label="Start date">{(id) => <input id={id} type="date" className="input" value={start} min={today} onChange={(e) => setStart(e.target.value)} />}</Field>
          <button className="btn-quiet mt-1 px-0 text-xs" onClick={() => setStart(addDays(weekStart(today), 7))}>Start next Monday instead</button>
        </div>
      </Card>
      <button
        className="btn-primary w-full"
        disabled={picked.length < 1}
        onClick={() => {
          const now = nowIso();
          void db.challenges.add({ startDate: start, habitIds: picked, intentions: intent.trim(), status: "active", createdAt: now, updatedAt: now });
        }}
      >
        Start the 45 days
      </button>
      {past && past.length > 0 && <p className="text-center text-xs text-muted">{past.length} previous challenge(s) completed or ended.</p>}
    </>
  );
}

function Active({ data, today, c }: { data: DataSet; today: DayKey; c: Challenge }) {
  const cd = challengeDay(c.startDate, today);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const reflections = useLiveQuery(() => db.reflections.where("kind").equals("challenge").and((r) => r.ref >= c.startDate).toArray(), [c.startDate]);
  const habits = data.habits.filter((h) => c.habitIds.includes(h.id!));
  const idx = indexLogs(data.habitLogs);
  const to = cd.finished ? cd.endDate : today;

  if (cd.day < 1)
    return (
      <Card>
        <p>Your challenge starts {formatDay(c.startDate, "EEEE d MMMM")}. Until then, nothing to do — maybe set up your evening routine.</p>
        <button className="btn-quiet mt-3 text-bad" onClick={() => db.challenges.update(c.id!, { status: "ended", updatedAt: nowIso() })}>Cancel</button>
      </Card>
    );

  if (cd.finished) return <FinalReport data={data} c={c} reflections={reflections ?? []} />;

  return (
    <>
      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular">Day {cd.day}</span>
          <span className="text-sm text-muted">of {CHALLENGE_DAYS}</span>
        </div>
        <ProgressBar value={cd.day / CHALLENGE_DAYS} label="Challenge progress" />
        <div className="mt-2 flex justify-between text-xs text-muted">
          {MILESTONES.map((m) => (
            <span key={m} className={cx("tabular", cd.day >= m && "font-medium text-accent")}>{m}</span>
          ))}
        </div>
        {cd.phase && (
          <p className="mt-3 text-sm">
            <strong>Phase {cd.phase.n}: {cd.phase.name}.</strong> <span className="text-muted">{cd.phase.focus}</span>
          </p>
        )}
        {c.intentions && <p className="mt-2 text-sm italic text-muted">“{c.intentions}”</p>}
      </Card>

      <Card title="Habits since day 1" action={<button className="text-sm text-muted" onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Change"}</button>}>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            {data.habits.filter((h) => !h.archived).map((h) => {
              const on = c.habitIds.includes(h.id!);
              return (
                <button key={h.id} className={on ? "chip-on" : "chip"} aria-pressed={on} onClick={() => db.challenges.update(c.id!, { habitIds: on ? c.habitIds.filter((x) => x !== h.id) : [...c.habitIds, h.id!], updatedAt: nowIso() })}>
                  {h.name}
                </button>
              );
            })}
          </div>
        ) : (
          <HabitRates habits={habits} idx={idx} from={c.startDate} to={to} />
        )}
      </Card>

      <ProgressSummary data={data} c={c} to={to} />

      <Card title="Daily reflection">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note.trim()) return;
            await db.reflections.add({ kind: "challenge", ref: today, date: today, text: note.trim(), updatedAt: nowIso() });
            setNote("");
          }}
        >
          <input className="input" aria-label="Reflection" placeholder="One line about today…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-ghost">Save</button>
        </form>
        {reflections && reflections.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {[...reflections].reverse().slice(0, 5).map((r) => (
              <li key={r.id}><span className="text-muted">Day {challengeDay(c.startDate, r.ref).day}:</span> {r.text}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/" className="btn-ghost">Daily check-in</Link>
          <Link href="/review" className="btn-ghost">Weekly review</Link>
        </div>
      </Card>
      <button className="btn-quiet w-full text-muted" onClick={() => confirm("End the challenge early? Your data stays.") && db.challenges.update(c.id!, { status: "ended", updatedAt: nowIso() })}>
        End challenge
      </button>
    </>
  );
}

function HabitRates({ habits, idx, from, to }: { habits: Habit[]; idx: ReturnType<typeof indexLogs>; from: DayKey; to: DayKey }) {
  if (!habits.length) return <Empty title="No habits in this challenge" />;
  return (
    <ul className="space-y-2">
      {habits.map((h) => {
        const r = consistency(h, idx, from, to);
        return (
          <li key={h.id}>
            <div className="flex justify-between text-sm">
              <span>{h.name}</span>
              <span className="tabular text-muted">{r.rate === undefined ? "—" : `${Math.round(r.rate * 100)}%`} <span className="text-xs">({r.earned}/{r.possible})</span></span>
            </div>
            <ProgressBar value={r.rate ?? 0} label={`${h.name} consistency`} />
          </li>
        );
      })}
    </ul>
  );
}

function ProgressSummary({ data, c, to }: { data: DataSet; c: Challenge; to: DayKey }) {
  const before = summarize(data, addDays(c.startDate, -14), addDays(c.startDate, -1));
  const during = summarize(data, c.startDate, to);
  const row = (label: string, a?: number, b?: number, fmt: (n: number) => string = (n) => n.toFixed(1)) => (
    <li className="flex justify-between py-1.5 text-sm">
      <span>{label}</span>
      <span className="tabular text-muted">{a === undefined ? "—" : fmt(a)} → <span className="text-ink">{b === undefined ? "—" : fmt(b)}</span></span>
    </li>
  );
  return (
    <Card title="Two weeks before → during" action={<SourceBadge source="calculated" />}>
      <ul className="divide-y divide-line">
        {row("Average sleep", before.avgSleepMin, during.avgSleepMin, formatDuration)}
        {row("Bedtime spread (±min)", before.bedtimeSdMin, during.bedtimeSdMin, (n) => `${Math.round(n)}`)}
        {row("Training min / week", before.workoutMin / 2, (during.workoutMin / Math.max(1, (Date.parse(to) - Date.parse(c.startDate)) / 86_400_000 + 1)) * 7, (n) => `${Math.round(n)}`)}
        {row("Energy (1–10)", before.avgEnergy, during.avgEnergy)}
      </ul>
      <p className="mt-2 text-xs text-muted">Changes can have many causes; this shows what happened, not why.</p>
    </Card>
  );
}

function FinalReport({ data, c, reflections }: { data: DataSet; c: Challenge; reflections: { text?: string; ref: string }[] }) {
  const habits = data.habits.filter((h) => c.habitIds.includes(h.id!));
  const idx = indexLogs(data.habitLogs);
  const first = summarize(data, c.startDate, addDays(c.startDate, 14));
  const last = summarize(data, addDays(c.startDate, 30), addDays(c.startDate, 44));
  const lastRates = habits.map((h) => ({ h, r: consistency(h, idx, addDays(c.startDate, 30), addDays(c.startDate, 44)).rate }));
  const established = lastRates.filter((x) => (x.r ?? 0) >= 0.7);
  const struggling = lastRates.filter((x) => x.r !== undefined && x.r < 0.5);
  return (
    <>
      <Notice>You finished the 45 days. Here&apos;s what your data shows — calculated from your own records.</Notice>
      <Card title="Habits established">
        {established.length ? <ul className="list-disc pl-5 text-sm">{established.map((x) => <li key={x.h.id}>{x.h.name} ({Math.round((x.r ?? 0) * 100)}% in the last 15 days)</li>)}</ul> : <p className="text-sm text-muted">No habit reached 70% in the final phase — that&apos;s useful information, not failure.</p>}
        <div className="mt-3"><HabitRates habits={habits} idx={idx} from={c.startDate} to={addDays(c.startDate, 44)} /></div>
      </Card>
      <Card title="Days 1–15 → days 31–45">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Avg sleep" value={last.avgSleepMin === undefined ? undefined : formatDuration(last.avgSleepMin)} hint={`was ${first.avgSleepMin === undefined ? "—" : formatDuration(first.avgSleepMin)}`} />
          <Stat label="Bedtime spread" value={last.bedtimeSdMin === undefined ? undefined : `±${Math.round(last.bedtimeSdMin)}m`} hint={`was ${first.bedtimeSdMin === undefined ? "—" : `±${Math.round(first.bedtimeSdMin)}m`}`} />
          <Stat label="Training" value={last.workoutMin || undefined} unit="min" hint={`was ${Math.round(first.workoutMin)} min`} />
          <Stat label="Energy" value={last.avgEnergy?.toFixed(1)} unit="/10" hint={`was ${first.avgEnergy?.toFixed(1) ?? "—"}`} />
        </div>
      </Card>
      {reflections.length > 0 && (
        <Card title="Lessons in your words">
          <ul className="space-y-1 text-sm">{reflections.slice(-8).map((r, i) => <li key={i}>“{r.text}”</li>)}</ul>
        </Card>
      )}
      <Card title="For the next 45 days" action={<SourceBadge source="calculated" />}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {established.length > 0 && <li>Keep {established.map((x) => x.h.name).join(", ")} — they&apos;re becoming automatic.</li>}
          {struggling.map((x) => <li key={x.h.id}>Make “{x.h.name}” smaller, move it to a better time, or drop it.</li>)}
          <li>Add at most one new habit, ideally one that supports sleep or daily movement.</li>
        </ul>
      </Card>
      <button className="btn-primary w-full" onClick={() => db.challenges.update(c.id!, { status: "completed", updatedAt: nowIso() })}>Close and plan the next round</button>
    </>
  );
}
