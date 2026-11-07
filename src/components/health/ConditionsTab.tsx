"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Card, Empty, Field, Notice, Segmented, Sheet, Toggle, cx } from "../ui";
import { activeConditions, conditionStats, returnProtocol } from "@/lib/conditions";
import { db } from "@/lib/db";
import { daysBetween, formatDay, nowIso } from "@/lib/date";
import type { DataSet } from "@/lib/reports";
import type { Condition, DayKey } from "@/lib/types";

const SEVERITY = { 1: "Minor — training modified", 2: "Moderate — sessions missed", 3: "Severe — no training" } as const;

export function ConditionsTab({ data, today }: { data: DataSet; today: DayKey }) {
  const all = [...(data.conditions ?? [])].sort((a, b) => b.start.localeCompare(a.start));
  const active = activeConditions(all, today);
  const stats = conditionStats(all, data.workouts, today);
  const [edit, setEdit] = useState<Condition | "new">();

  return (
    <div className="space-y-4">
      <Notice>Log injuries and illnesses so plans, readiness and the coach adapt. This is a training log, not a diagnosis — see a clinician for anything severe or persistent.</Notice>
      <button className="btn-primary w-full" onClick={() => setEdit("new")}>
        <Plus size={16} /> Log injury or illness
      </button>

      {active.map((c) => (
        <Card key={c.id} title={`${c.kind === "illness" ? "Illness" : "Injury"} · ${c.label}`} action={<span className="text-xs text-muted">day {daysBetween(c.start, today) + 1}</span>}>
          <p className="text-sm text-muted">
            {SEVERITY[c.severity]}
            {c.bodyPart ? ` · ${c.bodyPart}` : ""}
            {c.kind === "illness" ? (c.belowNeck ? " · below-the-neck symptoms" : " · head-cold symptoms only") : ""}
          </p>
          <div className="eyebrow mt-3 mb-1">Return plan</div>
          <ol className="space-y-1.5">
            {returnProtocol(c, daysBetween(c.start, today)).map((s) => (
              <li key={s.label} className="text-sm">
                <strong>{s.label}:</strong> <span className="text-muted">{s.detail}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setEdit(c)}>Edit</button>
            <button className="btn-primary" onClick={() => db.conditions.update(c.id!, { end: today, updatedAt: nowIso() })}>
              Recovered today
            </button>
          </div>
        </Card>
      ))}

      <Card title="Last 12 months">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted">Episodes</div>
            <div className="num text-2xl font-semibold">{stats.count}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Days affected</div>
            <div className="num text-2xl font-semibold">{stats.daysAffected}</div>
          </div>
        </div>
        {stats.onsetRatios.some((o) => o.ratio !== undefined) && (
          <p className="mt-2 text-xs text-muted">
            Load ratio in the week before each onset: {stats.onsetRatios.filter((o) => o.ratio !== undefined).map((o) => `${o.label} ${o.ratio}`).join(" · ")}. Spikes above ≈1.5 are a pattern worth watching — not proof of cause.
          </p>
        )}
      </Card>

      <Card title="History">
        {all.length === 0 ? (
          <Empty title="Nothing logged — good." />
        ) : (
          <ul className="divide-y divide-line">
            {all.map((c) => (
              <li key={c.id}>
                <button className="flex min-h-12 w-full items-center justify-between gap-2 text-left text-sm" onClick={() => setEdit(c)}>
                  <span>
                    <span className="block font-medium">{c.label}</span>
                    <span className="text-xs text-muted">
                      {c.kind} · {formatDay(c.start, "d MMM yy")} – {c.end ? formatDay(c.end, "d MMM yy") : "ongoing"}
                    </span>
                  </span>
                  <span className={cx("rounded-full px-2 py-0.5 text-xs", c.severity === 3 ? "bg-bad/10 text-bad" : c.severity === 2 ? "bg-warn/10 text-warn" : "bg-surface-2 text-muted")}>
                    {["", "minor", "moderate", "severe"][c.severity]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={Boolean(edit)} onClose={() => setEdit(undefined)} title={edit === "new" ? "Log injury or illness" : "Edit"}>
        {edit && <ConditionForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? undefined : edit} today={today} onDone={() => setEdit(undefined)} />}
      </Sheet>
    </div>
  );
}

function ConditionForm({ existing, today, onDone }: { existing?: Condition; today: DayKey; onDone: () => void }) {
  const [kind, setKind] = useState<Condition["kind"]>(existing?.kind ?? "injury");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [bodyPart, setBodyPart] = useState(existing?.bodyPart ?? "");
  const [severity, setSeverity] = useState<Condition["severity"]>(existing?.severity ?? 1);
  const [start, setStart] = useState(existing?.start ?? today);
  const [end, setEnd] = useState(existing?.end ?? "");
  const [belowNeck, setBelowNeck] = useState(Boolean(existing?.belowNeck));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string>();

  async function save() {
    if (!label.trim()) return setError("Give it a short name, e.g. “Left knee” or “Cold”.");
    if (end && end < start) return setError("End date is before the start.");
    const now = nowIso();
    await db.conditions.put({
      ...(existing ?? { createdAt: now }),
      kind,
      label: label.trim(),
      bodyPart: kind === "injury" ? bodyPart.trim() || undefined : undefined,
      severity,
      start,
      end: end || undefined,
      belowNeck: kind === "illness" ? belowNeck : undefined,
      notes: notes.trim() || undefined,
      updatedAt: now,
    });
    onDone();
  }

  return (
    <div className="space-y-4">
      <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: "injury", label: "Injury / pain" }, { value: "illness", label: "Illness" }]} />
      <Field label="What">{(id) => <input id={id} className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "injury" ? "e.g. Achilles tightness" : "e.g. Cold"} />}</Field>
      {kind === "injury" && <Field label="Body part">{(id) => <input id={id} className="input" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} placeholder="e.g. left Achilles" />}</Field>}
      {kind === "illness" && <Toggle label="Symptoms below the neck" hint="Fever, chest congestion, body aches, stomach — rest completely." checked={belowNeck} onChange={setBelowNeck} />}
      <div>
        <span className="label">Severity</span>
        <div className="grid gap-2">
          {([1, 2, 3] as const).map((s) => (
            <button key={s} aria-pressed={severity === s} className={severity === s ? "chip-on justify-start" : "chip justify-start"} onClick={() => setSeverity(s)}>
              {SEVERITY[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Started">{(id) => <input id={id} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Recovered">{(id) => <input id={id} type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      <Field label="Notes">{(id) => <input id={id} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What helps, what hurts" />}</Field>
      {severity === 3 && <Notice tone="warn">Severe pain, swelling, inability to bear weight, or fever: please get it checked by a clinician.</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex gap-2">
        {existing?.id && (
          <button className="btn-ghost text-bad" onClick={async () => { if (confirm("Delete this entry?")) { await db.conditions.delete(existing.id!); onDone(); } }}>
            Delete
          </button>
        )}
        <button className="btn-primary flex-1" onClick={save}>Save</button>
      </div>
    </div>
  );
}
