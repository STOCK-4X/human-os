"use client";

import { Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { TrendChart } from "../charts";
import { BodyForm } from "../forms/BodyForm";
import { Card, Empty, Loading, Notice, Sheet, SourceBadge, Stat } from "../ui";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/date";
import type { BodyEntry, DayKey, Profile } from "@/lib/types";

const LB = 0.45359237;

export function BodyTab({ profile, today }: { profile: Profile; today: DayKey }) {
  const entries = useLiveQuery(() => db.body.orderBy("date").toArray(), []);
  const [edit, setEdit] = useState<BodyEntry | "new">();
  if (!entries) return <Loading />;
  const imp = profile.units === "imperial";
  const hidden = new Set(profile.hiddenMetrics);
  const w = (kg?: number) => (kg === undefined ? undefined : Math.round((imp ? kg / LB : kg) * 10) / 10);
  const len = (cm?: number) => (cm === undefined ? undefined : Math.round((imp ? cm / 2.54 : cm) * 10) / 10);
  const last = <K extends keyof BodyEntry>(k: K) => [...entries].reverse().find((e) => e[k] !== undefined);
  const series = (k: "weightKg" | "waistCm" | "bodyFatPct" | "muscleKg", f: (v?: number) => number | undefined) =>
    entries.filter((e) => e[k] !== undefined).map((e) => ({ date: e.date, value: f(e[k]) }));

  const charts = [
    { k: "weightKg" as const, hide: "weight", label: "Weight", unit: imp ? "lb" : "kg", f: w },
    { k: "waistCm" as const, hide: "waist", label: "Waist", unit: imp ? "in" : "cm", f: len },
    { k: "bodyFatPct" as const, hide: "bodyFat", label: "Body fat", unit: "%", f: (v?: number) => v },
    { k: "muscleKg" as const, hide: "muscle", label: "Muscle mass", unit: imp ? "lb" : "kg", f: w },
  ].filter((c) => !hidden.has(c.hide));

  return (
    <div className="space-y-4">
      <Notice>Body tracking is optional. Weight is only one signal — strength, endurance, energy and sleep tell you just as much. Hide anything you don&apos;t want to see in Profile.</Notice>
      <button className="btn-primary w-full" onClick={() => setEdit("new")}>
        <Plus size={16} /> Add measurement
      </button>
      {entries.length === 0 ? (
        <Empty title="No measurements yet" />
      ) : (
        <>
          <Card title="Latest">
            <div className="grid grid-cols-2 gap-3">
              {charts.map((c) => {
                const e = last(c.k);
                return <Stat key={c.k} label={c.label} value={e ? c.f(e[c.k] as number) : undefined} unit={c.unit} source={e?.source} hint={e ? formatDay(e.date, "d MMM") : undefined} />;
              })}
            </div>
          </Card>
          {charts.map((c) => {
            const s = series(c.k, c.f);
            if (s.length < 2) return null;
            return (
              <Card key={c.k} title={`${c.label} (${c.unit})`}>
                <TrendChart label={`${c.label} trend`} data={s} fmt={(n) => String(Math.round(n * 10) / 10)} />
                {(c.k === "bodyFatPct" || c.k === "muscleKg") && <p className="mt-1 text-xs text-muted">Smart-scale composition readings are estimates; follow the trend over weeks, not single readings.</p>}
              </Card>
            );
          })}
          <Card title="History">
            <ul className="divide-y divide-line">
              {[...entries].reverse().slice(0, 20).map((e) => (
                <li key={e.id}>
                  <button className="flex min-h-12 w-full items-center justify-between text-left text-sm" onClick={() => setEdit(e)}>
                    <span>{formatDay(e.date)}</span>
                    <span className="tabular flex items-center gap-2 text-muted">
                      {[e.weightKg !== undefined && `${w(e.weightKg)} ${imp ? "lb" : "kg"}`, e.waistCm !== undefined && `${len(e.waistCm)} ${imp ? "in" : "cm"}`, e.bodyFatPct !== undefined && `${e.bodyFatPct}%`]
                        .filter(Boolean)
                        .join(" · ")}
                      <SourceBadge source={e.source} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      <Sheet open={Boolean(edit)} onClose={() => setEdit(undefined)} title="Body measurement">
        {edit && <BodyForm key={edit === "new" ? "new" : edit.id} profile={profile} date={today} existing={edit === "new" ? undefined : edit} onDone={() => setEdit(undefined)} />}
      </Sheet>
    </div>
  );
}
