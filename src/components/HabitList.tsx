"use client";

import { Check, Minus, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/date";
import { indexLogs, isScheduled, nextStatus, streak } from "@/lib/habits";
import type { DayKey, Habit, HabitLog, HabitStatus } from "@/lib/types";
import { Sheet, cx } from "./ui";

export async function setHabitStatus(habitId: number, date: DayKey, status: HabitStatus | undefined, note?: string) {
  const existing = await db.habitLogs.where("[habitId+date]").equals([habitId, date]).first();
  if (!status) {
    if (existing?.id) await db.habitLogs.delete(existing.id);
    return;
  }
  const row: HabitLog = { ...(existing ?? {}), habitId, date, status, note: note ?? existing?.note, updatedAt: nowIso() };
  await db.habitLogs.put(row);
}

const STATUS_LABEL: Record<HabitStatus, string> = { done: "Done", partial: "Partly", skipped: "Skipped", rest: "Rest day" };

export function HabitList({
  habits,
  logs,
  date,
  showStreak = true,
  empty,
}: {
  habits: Habit[];
  logs: HabitLog[];
  date: DayKey;
  showStreak?: boolean;
  empty?: React.ReactNode;
}) {
  const idx = indexLogs(logs);
  const [menu, setMenu] = useState<Habit>();
  const due = habits
    .filter((h) => !h.archived && isScheduled(h, date))
    .sort((a, b) => (a.scheduledTime ?? "99").localeCompare(b.scheduledTime ?? "99") || a.order - b.order);
  if (!due.length) return <>{empty}</>;

  return (
    <>
      <ul className="-mx-1">
        {due.map((h) => {
          const s = idx.get(`${h.id}|${date}`)?.status;
          const st = showStreak ? streak(h, idx, date) : 0;
          return (
            <li key={h.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
              <button
                onClick={() => setHabitStatus(h.id!, date, nextStatus(s))}
                aria-label={`${h.name}: ${s ? STATUS_LABEL[s] : "not done"}. Tap to change.`}
                className={cx(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  s === "done" && "border-accent bg-accent text-accent-ink",
                  s === "partial" && "border-accent bg-accent-soft text-accent",
                  (s === "rest" || s === "skipped") && "border-line bg-surface-2 text-muted",
                  !s && "border-line",
                )}
              >
                {s === "done" && <Check size={18} strokeWidth={3} />}
                {s === "partial" && <span className="text-xs font-bold">½</span>}
                {(s === "rest" || s === "skipped") && <Minus size={16} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cx("truncate text-[15px]", (s === "rest" || s === "skipped") && "text-muted")}>{h.name}</div>
                <div className="truncate text-xs text-muted">
                  {[h.scheduledTime, h.durationMin && `${h.durationMin} min`, s && s !== "done" ? STATUS_LABEL[s] : !s && h.minimumVersion ? `Min: ${h.minimumVersion}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {showStreak && st > 1 && <span className="tabular text-xs text-muted">{st} in a row</span>}
              <button aria-label={`More options for ${h.name}`} className="btn-quiet min-h-10 px-2" onClick={() => setMenu(h)}>
                <MoreHorizontal size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet open={Boolean(menu)} onClose={() => setMenu(undefined)} title={menu?.name ?? ""}>
        {menu && (
          <div className="grid gap-2">
            {(["done", "partial", "rest", "skipped"] as HabitStatus[]).map((st) => (
              <button
                key={st}
                className="btn-ghost justify-start"
                onClick={async () => {
                  await setHabitStatus(menu.id!, date, st);
                  setMenu(undefined);
                }}
              >
                {STATUS_LABEL[st]}
                {st === "rest" && <span className="text-xs text-muted">— doesn&apos;t count against you</span>}
              </button>
            ))}
            <button
              className="btn-quiet"
              onClick={async () => {
                await setHabitStatus(menu.id!, date, undefined);
                setMenu(undefined);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
