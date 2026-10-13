"use client";

import { Coffee, Droplet, Moon, Sun, Trees, Wine, X } from "lucide-react";
import { db } from "@/lib/db";
import { formatInstant, nowIso } from "@/lib/date";
import type { DayKey, LifestyleKind, LifestyleLog, Profile } from "@/lib/types";
import { ProgressBar } from "../ui";

const QUICK: { kind: LifestyleKind; label: string; amount?: number; unit: string; icon: typeof Coffee }[] = [
  { kind: "water", label: "Water 250 ml", amount: 250, unit: "ml", icon: Droplet },
  { kind: "caffeine", label: "Coffee", amount: 95, unit: "mg", icon: Coffee },
  { kind: "caffeine", label: "Tea", amount: 45, unit: "mg", icon: Coffee },
  { kind: "morningLight", label: "Morning light", amount: 10, unit: "min", icon: Sun },
  { kind: "outdoors", label: "Outdoors 15 min", amount: 15, unit: "min", icon: Trees },
  { kind: "alcohol", label: "Alcohol (1 drink)", amount: 1, unit: "drink", icon: Wine },
  { kind: "screenBeforeBed", label: "Screens in bed", unit: "", icon: Moon },
];

/** One-tap lifestyle logging. Logged at the current time on `date`. */
export function LifestyleLogger({ profile, date, logs }: { profile: Profile; date: DayKey; logs: LifestyleLog[] }) {
  const today = logs.filter((l) => l.date === date).sort((a, b) => b.at.localeCompare(a.at));
  const water = today.filter((l) => l.kind === "water").reduce((a, l) => a + (l.amount ?? 0), 0);

  async function log(q: (typeof QUICK)[number]) {
    const now = nowIso();
    await db.lifestyle.add({ date, at: now, kind: q.kind, amount: q.amount, label: q.label, createdAt: now });
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span>Water</span>
          <span className="tabular text-muted">
            {water} / {profile.waterTargetMl} ml
          </span>
        </div>
        <ProgressBar value={water / profile.waterTargetMl} label="Water progress" />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q.label} className="chip active:bg-surface-2" onClick={() => log(q)}>
            <q.icon size={14} aria-hidden /> {q.label}
          </button>
        ))}
      </div>
      {today.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {today.slice(0, 8).map((l) => (
            <li key={l.id} className="flex items-center justify-between py-1.5">
              <span>
                <span className="tabular text-muted">{formatInstant(l.at, profile.timeZone)}</span> · {l.label}
              </span>
              <button aria-label={`Remove ${l.label}`} className="btn-quiet min-h-9 px-2" onClick={() => db.lifestyle.delete(l.id!)}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
