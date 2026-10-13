"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Sheet } from "../ui";
import { evaluateAchievements, newUnlocks } from "@/lib/achievements";
import { db } from "@/lib/db";
import { formatDay, nowIso, todayKey } from "@/lib/date";
import type { DataSet } from "@/lib/reports";

/** Keeps the achievement timeline in sync with the data and shows celebrations. */
export function Celebration({ data }: { data: DataSet }) {
  const challenges = useLiveQuery(() => db.challenges.toArray(), []);
  const customs = useLiveQuery(() => db.customAchievements.toArray(), []);
  const unlocked = useLiveQuery(() => db.achievements.toArray(), []);
  const today = todayKey(data.profile.timeZone);

  const all = useMemo(
    () => (challenges && customs ? evaluateAchievements({ data, challenges, customs, today }) : undefined),
    [data, challenges, customs, today],
  );

  useEffect(() => {
    if (!all || !unlocked || !data.profile.onboarded) return;
    const rows = newUnlocks(all, new Set(unlocked.map((u) => u.key)), today, nowIso());
    if (rows.length) void db.achievements.bulkPut(rows);
  }, [all, unlocked, today, data.profile.onboarded]);

  const pref = data.profile.celebrations;
  const pending = (unlocked ?? []).filter((u) => !u.seen).sort((a, b) => a.achievedOn.localeCompare(b.achievedOn));
  const current = pending[0];
  const full = current && pref === "full" && current.major;
  const toast = current && !full && pref !== "off";

  // "Off" means timeline only: mark quietly as seen.
  useEffect(() => {
    if (pref === "off" && pending.length) void db.achievements.bulkUpdate(pending.map((p) => ({ key: p.key, changes: { seen: true } })));
  }, [pref, pending]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => void db.achievements.update(current.key, { seen: true }), 7000);
    return () => clearTimeout(t);
  }, [toast, current]);

  const dismiss = () => current && db.achievements.update(current.key, { seen: true });

  if (toast)
    return (
      <div role="status" className="fade-in fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg">
        <span className="celebrate-dot grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">✦</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">New achievement{pending.length > 1 ? ` · ${pending.length} new` : ""}</span>
          <span className="block truncate text-sm font-medium">{current.title}</span>
        </span>
        <Link href={`/achievements?poster=${encodeURIComponent(current.key)}`} onClick={dismiss} className="btn-ghost min-h-9 px-3 text-xs">
          View
        </Link>
      </div>
    );

  return (
    <Sheet open={Boolean(full)} onClose={dismiss} title="">
      {full && (
        <div className="pb-2 text-center">
          <div className="relative mx-auto mb-5 grid h-28 w-28 place-items-center" aria-hidden>
            <span className="celebrate-ring absolute inset-0 rounded-full border-4 border-accent/30" />
            <span className="celebrate-ring absolute inset-3 rounded-full border-4 border-accent/50 [animation-delay:150ms]" />
            <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-2xl text-accent-ink">✦</span>
          </div>
          <p className="eyebrow">Congratulations</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{current.title}</h2>
          <p className="mt-2 text-[15px] text-muted">{current.description}</p>
          {current.stats.filter((s) => !s.sensitive).length > 0 && (
            <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2">
              {current.stats
                .filter((s) => !s.sensitive)
                .slice(0, 4)
                .map((s) => (
                  <div key={s.key} className="rounded-xl bg-surface-2 p-3">
                    <div className="tabular font-semibold">{s.value}</div>
                    <div className="text-xs text-muted">{s.label}</div>
                  </div>
                ))}
            </div>
          )}
          <p className="mt-4 text-sm italic">{current.message}</p>
          <p className="mt-1 text-xs text-muted">{formatDay(current.achievedOn, "d MMMM yyyy")} · verified from your records</p>
          <div className="mt-5 grid gap-2">
            <Link href={`/achievements?poster=${encodeURIComponent(current.key)}`} onClick={dismiss} className="btn-primary">
              Create a poster
            </Link>
            <button className="btn-quiet" onClick={dismiss}>
              {pending.length > 1 ? `Next (${pending.length - 1} more)` : "Close"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
