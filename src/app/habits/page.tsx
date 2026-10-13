"use client";

import { Award, FlaskConical, Flag, Plus } from "lucide-react";
import { useState } from "react";
import { CATEGORY_LABEL, HabitForm } from "@/components/forms/HabitForm";
import { HabitList } from "@/components/HabitList";
import { Card, Empty, LinkRow, Loading, Page, Segmented, Sheet, cx } from "@/components/ui";
import { useDataSet, useToday } from "@/hooks/data";
import { db } from "@/lib/db";
import { addDays, dayRange, formatDay, formatDuration, nowIso } from "@/lib/date";
import { consistency, frequencyLabel, indexLogs, isScheduled, streak } from "@/lib/habits";
import type { DataSet } from "@/lib/reports";
import type { DayKey, Habit } from "@/lib/types";

const TEMPLATES: Partial<Habit>[] = [
  { name: "In bed at planned time", category: "sleep", routine: "evening", minimumVersion: "Within 30 minutes of plan" },
  { name: "Open curtains / outdoor light", category: "routine", routine: "morning", durationMin: 10, minimumVersion: "Stand by a window for 2 min" },
  { name: "Glass of water", category: "hydration", routine: "morning", durationMin: 1 },
  { name: "Morning walk", category: "movement", routine: "morning", durationMin: 20, minimumVersion: "5 minutes around the block" },
  { name: "Stretch", category: "movement", durationMin: 10, minimumVersion: "One stretch" },
  { name: "Review today's priorities", category: "mind", routine: "morning", durationMin: 5 },
  { name: "Prepare tomorrow (clothes, kit, priorities)", category: "routine", routine: "evening", durationMin: 10 },
  { name: "Screens off before bed", category: "sleep", routine: "evening", minimumVersion: "Phone out of the bedroom" },
  { name: "Read", category: "mind", durationMin: 15, minimumVersion: "One page" },
  { name: "Journal", category: "mind", durationMin: 5, minimumVersion: "One sentence" },
  { name: "Strength training", category: "training", frequency: { type: "weekly", timesPerWeek: 2 }, durationMin: 40 },
  { name: "Run", category: "training", frequency: { type: "weekly", timesPerWeek: 3 }, durationMin: 30 },
];

export default function HabitsPage() {
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);
  const [edit, setEdit] = useState<Habit | "new" | Partial<Habit>>();
  return (
    <Page
      title="Habits"
      action={
        <button className="btn-primary" onClick={() => setEdit("new")}>
          <Plus size={16} /> New
        </button>
      }
    >
      {!data || !today ? <Loading /> : <Habits data={data} today={today} onEdit={setEdit} />}
      <Sheet open={Boolean(edit)} onClose={() => setEdit(undefined)} title={edit && edit !== "new" && "id" in edit ? "Edit habit" : "New habit"}>
        {edit && (
          <HabitForm
            key={edit !== "new" && "id" in edit ? edit.id : edit === "new" ? "new" : edit.name}
            existing={edit !== "new" && "id" in edit ? (edit as Habit) : undefined}
            defaults={edit !== "new" && !("id" in edit) ? edit : undefined}
            onDone={() => setEdit(undefined)}
          />
        )}
      </Sheet>
    </Page>
  );
}

function Habits({ data, today, onEdit }: { data: DataSet; today: DayKey; onEdit: (h: Habit | Partial<Habit>) => void }) {
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [showArchived, setShowArchived] = useState(false);
  const date = day === "today" ? today : addDays(today, -1);
  const active = data.habits.filter((h) => !h.archived);
  const archived = data.habits.filter((h) => h.archived);
  const idx = indexLogs(data.habitLogs);
  const existingNames = new Set(data.habits.map((h) => h.name.toLowerCase()));

  const routine = (r: "morning" | "evening") => {
    const items = active.filter((h) => h.routine === r && isScheduled(h, date));
    const total = items.reduce((a, h) => a + (h.durationMin ?? 0), 0);
    return { items, total };
  };
  const morning = routine("morning");
  const evening = routine("evening");

  async function quickAdd(t: Partial<Habit>) {
    const now = nowIso();
    await db.habits.add({
      name: t.name!,
      category: t.category ?? "other",
      frequency: t.frequency ?? { type: "daily" },
      routine: t.routine,
      durationMin: t.durationMin,
      minimumVersion: t.minimumVersion,
      order: data.habits.length,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return (
    <>
      <Segmented
        label="Day"
        value={day}
        onChange={setDay}
        options={[
          { value: "today", label: "Today" },
          { value: "yesterday", label: `Yesterday (${formatDay(addDays(today, -1), "EEE")})` },
        ]}
      />
      <Card title={day === "today" ? "Due today" : "Due yesterday"}>
        <HabitList
          habits={active.filter((h) => !h.routine)}
          logs={data.habitLogs}
          date={date}
          empty={<p className="text-sm text-muted">{active.length ? "Nothing else due — routines are below." : "No habits yet. Add one or pick from suggestions below."}</p>}
        />
        <p className="mt-2 text-xs text-muted">Tap once for done, twice for partly done. Use ••• for rest days — they never count against you.</p>
      </Card>

      {morning.items.length > 0 && (
        <Card title="Morning routine" action={<span className="text-xs text-muted">{morning.total ? `~${formatDuration(morning.total)}` : ""}</span>}>
          <HabitList habits={morning.items} logs={data.habitLogs} date={date} />
          {morning.total > 45 && <p className="mt-2 text-xs text-warn">Over 45 minutes — a shorter routine is easier to keep.</p>}
        </Card>
      )}
      {evening.items.length > 0 && (
        <Card title="Evening routine" action={<span className="text-xs text-muted">{evening.total ? `~${formatDuration(evening.total)}` : ""}</span>}>
          <HabitList habits={evening.items} logs={data.habitLogs} date={date} />
        </Card>
      )}

      <Card>
        <LinkRow href="/challenge" icon={<Flag size={18} />} title="45-day challenge" hint="Build a sustainable foundation, gently" />
        <LinkRow href="/experiments" icon={<FlaskConical size={18} />} title="Experiment lab" hint="Test what actually helps you" />
        <LinkRow href="/achievements" icon={<Award size={18} />} title="Achievements" hint="Milestones, posters and progress" />
      </Card>

      <Card title="Consistency" action={<span className="text-xs text-muted">last 28 days</span>}>
        {active.length === 0 ? (
          <Empty title="No habits yet" />
        ) : (
          <ul className="space-y-3">
            {active.map((h) => {
              const c = consistency(h, idx, addDays(today, -27), today);
              const st = streak(h, idx, today);
              return (
                <li key={h.id}>
                  <button className="w-full text-left" onClick={() => onEdit(h)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{h.name}</span>
                      <span className="tabular shrink-0 text-xs text-muted">
                        {c.rate === undefined ? "—" : `${Math.round(c.rate * 100)}%`}
                        {st > 1 ? ` · ${st}${h.frequency.type === "weekly" ? " wks" : ""} streak` : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {CATEGORY_LABEL[h.category]} · {frequencyLabel(h)}
                    </div>
                    <Dots habit={h} idx={idx} today={today} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Suggestions">
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.filter((t) => !existingNames.has(t.name!.toLowerCase())).map((t) => (
            <button key={t.name} className="chip" onClick={() => quickAdd(t)}>
              <Plus size={14} /> {t.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Start small: two or three habits you can keep on a bad day.</p>
      </Card>

      {archived.length > 0 && (
        <button className="btn-quiet w-full" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Hide" : "Show"} archived ({archived.length})
        </button>
      )}
      {showArchived && (
        <Card>
          <ul className="divide-y divide-line">
            {archived.map((h) => (
              <li key={h.id}>
                <button className="min-h-11 w-full text-left text-sm text-muted" onClick={() => onEdit(h)}>{h.name}</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Dots({ habit, idx, today }: { habit: Habit; idx: ReturnType<typeof indexLogs>; today: DayKey }) {
  const days = dayRange(addDays(today, -27), today);
  return (
    <div className="mt-1.5 grid grid-cols-[repeat(28,minmax(0,1fr))] gap-[3px]" aria-hidden>
      {days.map((d) => {
        const s = idx.get(`${habit.id}|${d}`)?.status;
        const sched = isScheduled(habit, d) && d >= habit.createdAt.slice(0, 10);
        return (
          <span
            key={d}
            className={cx(
              "aspect-square rounded-[3px]",
              s === "done" ? "bg-accent" : s === "partial" ? "bg-accent/50" : s === "rest" || s === "skipped" ? "bg-line" : sched ? "bg-surface-2" : "bg-transparent",
            )}
          />
        );
      })}
    </div>
  );
}
