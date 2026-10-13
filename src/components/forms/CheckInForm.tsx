"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/date";
import type { CheckIn, DayKey, Symptom } from "@/lib/types";
import { Field, Notice, Toggle, cx } from "../ui";

export const SYMPTOMS: { key: Symptom; label: string }[] = [
  { key: "soreness", label: "Sore muscles" },
  { key: "unusualFatigue", label: "Unusual fatigue" },
  { key: "illness", label: "Feeling ill" },
  { key: "fever", label: "Fever" },
  { key: "injury", label: "Injury / pain" },
  { key: "dizziness", label: "Dizziness" },
  { key: "chestPain", label: "Chest pain" },
];

/** 1–10 scale. Tapping the selected value clears it. */
function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular text-sm text-muted">{value ? `${value}/10` : "—"}</span>
      </div>
      <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}`}
            onClick={() => onChange(value === n ? undefined : n)}
            className={cx(
              "tabular h-10 rounded-lg text-xs font-medium transition-colors",
              value !== undefined && n <= value ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function CheckInForm({ date, existing, onDone }: { date: DayKey; existing?: CheckIn; onDone: () => void }) {
  const [c, setC] = useState<CheckIn>(existing ?? { date, symptoms: [], updatedAt: nowIso() });
  const [more, setMore] = useState(Boolean(existing?.symptoms.length || existing?.mood));
  const set = (patch: Partial<CheckIn>) => setC((s) => ({ ...s, ...patch }));
  const toggle = (k: Symptom) => set({ symptoms: c.symptoms.includes(k) ? c.symptoms.filter((x) => x !== k) : [...c.symptoms, k] });

  async function save() {
    await db.checkins.put({ ...c, intention: c.intention?.trim() || undefined, note: c.note?.trim() || undefined, updatedAt: nowIso() });
    onDone();
  }

  return (
    <div className="space-y-5">
      <Scale label="How energetic do you feel?" low="empty" high="full of energy" value={c.energy} onChange={(energy) => set({ energy })} />
      <Scale label="How physically tired do you feel?" low="fresh" high="exhausted" value={c.fatigue} onChange={(fatigue) => set({ fatigue })} />
      <Scale label="How mentally focused do you feel?" low="foggy" high="sharp" value={c.focus} onChange={(focus) => set({ focus })} />
      <Toggle label="I feel unusually unwell" hint="Optional. Takes priority over any wearable score." checked={Boolean(c.unwell)} onChange={(unwell) => set({ unwell })} />
      {c.unwell && <Notice tone="warn">Take it easy today. If symptoms are severe, sudden or getting worse, contact a health professional.</Notice>}

      <button className="btn-quiet px-0 text-sm" onClick={() => setMore((v) => !v)}>
        {more ? "Fewer options" : "More: mood, symptoms, note"}
      </button>
      {more && (
        <div className="space-y-5">
          <Scale label="Mood" low="low" high="great" value={c.mood} onChange={(mood) => set({ mood })} />
          <div>
            <span className="label">Anything physical? (optional, private)</span>
            <div className="flex flex-wrap gap-2">
              {SYMPTOMS.map((s) => (
                <button key={s.key} className={cx(c.symptoms.includes(s.key) ? "chip-on" : "chip")} aria-pressed={c.symptoms.includes(s.key)} onClick={() => toggle(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
            {c.symptoms.some((s) => s === "chestPain" || s === "dizziness") && (
              <div className="mt-2">
                <Notice tone="bad">Chest pain or dizziness should be checked by a medical professional — seek urgent care if it is severe, sudden or getting worse.</Notice>
              </div>
            )}
          </div>
          <Field label="Note">{(id) => <input id={id} className="input" placeholder="Optional" value={c.note ?? ""} onChange={(e) => set({ note: e.target.value })} />}</Field>
        </div>
      )}
      <Field label="Today's intention">
        {(id) => <input id={id} className="input" placeholder="e.g. Calm, focused, home on time" value={c.intention ?? ""} onChange={(e) => set({ intention: e.target.value })} />}
      </Field>
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={onDone}>
          Skip
        </button>
        <button className="btn-primary flex-1" onClick={save}>
          Save check-in
        </button>
      </div>
    </div>
  );
}
