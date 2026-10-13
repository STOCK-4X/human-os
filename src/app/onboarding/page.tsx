"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Field, Loading, Page, Segmented, cx } from "@/components/ui";
import { useProfile } from "@/hooks/data";
import { db, updateProfile } from "@/lib/db";
import { formatDuration, nowIso } from "@/lib/date";
import { demoAvailable, seedDemo } from "@/lib/demo";
import { planSleep } from "@/lib/sleep";
import type { Habit, Profile } from "@/lib/types";

const STARTERS: Partial<Habit>[] = [
  { name: "In bed at planned time", category: "sleep", routine: "evening", minimumVersion: "Within 30 minutes of plan" },
  { name: "Open curtains / outdoor light", category: "routine", routine: "morning", durationMin: 10, minimumVersion: "2 min by a window" },
  { name: "Morning walk", category: "movement", routine: "morning", durationMin: 20, minimumVersion: "5 minutes" },
  { name: "Glass of water", category: "hydration", routine: "morning", durationMin: 1 },
  { name: "Stretch", category: "movement", durationMin: 10, minimumVersion: "One stretch" },
  { name: "Prepare tomorrow", category: "routine", routine: "evening", durationMin: 10 },
];

export default function Onboarding() {
  const profile = useProfile();
  if (!profile) return <Page title="Welcome"><Loading /></Page>;
  return <Steps profile={profile} />;
}

function Steps({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.displayName);
  const [wake, setWake] = useState(profile.targetWake);
  const [need, setNeed] = useState(profile.sleepNeedMin);
  const [level, setLevel] = useState(profile.fitnessLevel);
  const [picked, setPicked] = useState<string[]>(["In bed at planned time", "Open curtains / outdoor light"]);
  const plan = planSleep(wake, need, profile.sleepLatencyMin, profile.windDownMin);

  async function finish() {
    const now = nowIso();
    const existing = new Set((await db.habits.toArray()).map((h) => h.name));
    let order = await db.habits.count();
    for (const s of STARTERS.filter((s) => picked.includes(s.name!) && !existing.has(s.name!)))
      await db.habits.add({ name: s.name!, category: s.category!, routine: s.routine, durationMin: s.durationMin, minimumVersion: s.minimumVersion, frequency: { type: "daily" }, order: order++, archived: false, createdAt: now, updatedAt: now });
    await updateProfile({ displayName: name.trim(), targetWake: wake, sleepNeedMin: need, fitnessLevel: level, onboarded: true });
    router.replace("/");
  }

  return (
    <Page title="Human OS" subtitle="Become your best self, backed by data.">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => <span key={i} className={cx("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-line")} />)}
      </div>

      {step === 0 && (
        <Card>
          <p className="text-[17px] leading-snug">A calm, private place to understand your sleep, recovery, training and habits — and improve them sustainably.</p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li>• Your data stays on this device. No ads, no tracking.</li>
            <li>• Measured, entered, calculated and AI values are always labelled.</li>
            <li>• Missing data is shown as missing — never invented.</li>
            <li>• It&apos;s a wellness tool, not a medical device.</li>
          </ul>
          <Field label="What should we call you?">{(id) => <input id={id} className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />}</Field>
          <p className="mt-2 text-xs text-muted">Time zone: {profile.timeZone} (change any time in Profile).</p>
        </Card>
      )}

      {step === 1 && (
        <Card title="Sleep">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Wake-up time">{(id) => <input id={id} type="time" className="input" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} />}</Field>
            <Field label="Sleep you need">
              {(id) => (
                <select id={id} className="input" value={need} onChange={(e) => setNeed(Number(e.target.value))}>
                  {Array.from({ length: 13 }, (_, i) => 360 + i * 15).map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
                </select>
              )}
            </Field>
          </div>
          <p className="mt-3 text-sm">
            Suggested lights-out <strong className="tabular">{plan.lightsOut}</strong>, wind-down from <strong className="tabular">{plan.windDownStart}</strong>.
          </p>
          <p className="mt-1 text-xs text-muted">Most adults do best with 7–9 hours, but needs differ. Pick what leaves you rested; you can refine it later.</p>
        </Card>
      )}

      {step === 2 && (
        <Card title="Movement">
          <span className="label">Current fitness</span>
          <Segmented label="Fitness level" value={level} onChange={setLevel} options={[{ value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" }]} />
          <p className="mt-3 text-sm text-muted">Training days, activities and goals can be set in Profile. Suggestions always start gently.</p>
        </Card>
      )}

      {step === 3 && (
        <Card title="Pick 2–3 starter habits">
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => {
              const on = picked.includes(s.name!);
              return (
                <button key={s.name} aria-pressed={on} className={on ? "chip-on" : "chip"} onClick={() => setPicked(on ? picked.filter((x) => x !== s.name) : [...picked, s.name!])}>
                  {s.name}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">Small habits you can keep on a bad day beat ambitious ones. Add more later.</p>
        </Card>
      )}

      <div className="flex gap-2">
        {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 3 ? (
          <button className="btn-primary flex-1" onClick={() => setStep(step + 1)}>Continue</button>
        ) : (
          <button className="btn-primary flex-1" onClick={finish}>Start</button>
        )}
      </div>

      {demoAvailable && step === 0 && (
        <button
          className="btn-quiet w-full text-xs"
          onClick={async () => {
            await seedDemo(profile.timeZone);
            router.replace("/");
          }}
        >
          Development only: load demo data
        </button>
      )}
    </Page>
  );
}
