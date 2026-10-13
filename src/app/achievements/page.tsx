"use client";

import { Download, Plus, Share2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Card, Empty, Field, Loading, Notice, Page, ProgressBar, Segmented, Sheet, Toggle, cx } from "@/components/ui";
import { useDataSet, useToday } from "@/hooks/data";
import { CATEGORY_LABEL, evaluateAchievements } from "@/lib/achievements";
import { db, updateProfile } from "@/lib/db";
import { formatDay, nowIso } from "@/lib/date";
import { FORMATS, THEMES, drawPoster, posterBlob, sharePoster, downloadBlob } from "@/lib/poster";
import type { DataSet } from "@/lib/reports";
import type { ActivityType, CustomAchievement, PosterConfig, PosterFormat, PosterTheme, UnlockedAchievement } from "@/lib/types";
import { ACTIVITY_LABEL } from "@/components/forms/WorkoutForm";

export default function AchievementsPage() {
  return (
    <Suspense fallback={<Page title="Achievements"><Loading /></Page>}>
      <Gallery />
    </Suspense>
  );
}

function Gallery() {
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);
  const unlocked = useLiveQuery(() => db.achievements.orderBy("achievedOn").reverse().toArray(), []);
  const challenges = useLiveQuery(() => db.challenges.toArray(), []);
  const customs = useLiveQuery(() => db.customAchievements.toArray(), []);
  const params = useSearchParams();
  const router = useRouter();
  const posterKey = params.get("poster");
  const [creating, setCreating] = useState(false);

  const all = useMemo(
    () => (data && today && challenges && customs ? evaluateAchievements({ data, challenges, customs, today }) : undefined),
    [data, today, challenges, customs],
  );
  if (!data || !today || !unlocked || !all || !customs) return <Page title="Achievements"><Loading /></Page>;

  const unlockedKeys = new Set(unlocked.map((u) => u.key));
  const inProgress = all
    .filter((a) => !a.achievedOn && a.progress && !unlockedKeys.has(a.key))
    .sort((a, b) => b.progress!.current / b.progress!.target - a.progress!.current / a.progress!.target);
  const byMonth = new Map<string, UnlockedAchievement[]>();
  for (const u of unlocked) byMonth.set(u.achievedOn.slice(0, 7), [...(byMonth.get(u.achievedOn.slice(0, 7)) ?? []), u]);
  const selected = unlocked.find((u) => u.key === posterKey);
  const manual = customs.filter((c) => c.kind === "manual" && !c.completedOn);

  return (
    <Page
      title="Achievements"
      subtitle={`${unlocked.length} milestone${unlocked.length === 1 ? "" : "s"} · personal, never a competition`}
      action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Custom</button>}
    >
      <Card title="Celebrations">
        <Segmented
          label="Celebration style"
          value={data.profile.celebrations}
          onChange={(celebrations) => updateProfile({ celebrations })}
          options={[
            { value: "full", label: "Celebrate big ones" },
            { value: "subtle", label: "Subtle" },
            { value: "off", label: "Off" },
          ]}
        />
        <p className="mt-2 text-xs text-muted">Only milestones supported by your records are celebrated. Older ones found in imported history are added quietly.</p>
      </Card>

      {manual.length > 0 && (
        <Card title="Your goals">
          <ul className="divide-y divide-line">
            {manual.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{c.title}</span>
                  {c.description && <span className="block truncate text-xs text-muted">{c.description}</span>}
                </span>
                <button className="btn-ghost min-h-9 shrink-0 px-3 text-xs" onClick={() => db.customAchievements.update(c.id!, { completedOn: today })}>Mark done</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Timeline">
        {unlocked.length === 0 ? (
          <Empty title="Your first milestone is close">Keep logging — achievements appear here once your records show them.</Empty>
        ) : (
          <div className="space-y-4">
            {[...byMonth.entries()].map(([month, items]) => (
              <div key={month}>
                <div className="eyebrow mb-1">{formatDay(`${month}-01`, "MMMM yyyy")}</div>
                <ul className="divide-y divide-line">
                  {items.map((u) => (
                    <li key={u.key}>
                      <button className="flex min-h-14 w-full items-center gap-3 text-left" onClick={() => router.replace(`/achievements?poster=${encodeURIComponent(u.key)}`, { scroll: false })}>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">✦</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{u.title}</span>
                          <span className="block text-xs text-muted">{CATEGORY_LABEL[u.category]} · {formatDay(u.achievedOn, "d MMM")}{u.poster ? " · poster saved" : ""}</span>
                        </span>
                        <span className="text-muted">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="In progress">
        {inProgress.length === 0 ? (
          <p className="text-sm text-muted">Nothing in progress yet.</p>
        ) : (
          <ul className="space-y-3">
            {inProgress.slice(0, 8).map((a) => (
              <li key={a.key}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{a.title}</span>
                  <span className="tabular shrink-0 text-xs text-muted">{a.progress!.current}/{a.progress!.target} {a.progress!.unit ?? ""}</span>
                </div>
                <ProgressBar value={a.progress!.current / a.progress!.target} label={`${a.title} progress`} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={Boolean(selected)} onClose={() => router.replace("/achievements", { scroll: false })} title={selected?.title ?? ""}>
        {selected && <PosterStudio key={selected.key} a={selected} data={data} />}
      </Sheet>
      <Sheet open={creating} onClose={() => setCreating(false)} title="Custom milestone">
        {creating && <CustomForm data={data} onDone={() => setCreating(false)} />}
      </Sheet>
    </Page>
  );
}

function PosterStudio({ a, data }: { a: UnlockedAchievement; data: DataSet }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cfg, setCfg] = useState<PosterConfig>(
    a.poster ?? { format: "story", theme: "sage", shownStats: a.stats.filter((s) => !s.sensitive).map((s) => s.key), showName: false, savedAt: "" },
  );
  const [status, setStatus] = useState<string>();
  const set = (patch: Partial<PosterConfig>) => setCfg((c) => ({ ...c, ...patch }));

  useEffect(() => {
    let cancelled = false;
    const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    void document.fonts.ready.then(() => {
      if (cancelled || !canvas.current) return;
      drawPoster(canvas.current, cfg.format, cfg.theme, {
        eyebrow: CATEGORY_LABEL[a.category],
        headline: a.headline,
        message: a.message,
        date: formatDay(a.achievedOn, "d MMMM yyyy"),
        stats: a.stats.filter((s) => cfg.shownStats.includes(s.key)),
        reflection: cfg.reflection?.trim() || undefined,
        name: cfg.showName && data.profile.displayName ? data.profile.displayName : undefined,
      }, family);
    });
    return () => {
      cancelled = true;
    };
  }, [cfg, a, data.profile.displayName]);

  async function save(share: boolean) {
    if (!canvas.current) return;
    const blob = await posterBlob(canvas.current);
    const name = `human-os-${a.key.replace(/[^a-z0-9]+/gi, "-")}-${cfg.format}.png`;
    await db.achievements.update(a.key, { poster: { ...cfg, savedAt: nowIso() } });
    if (share) {
      const r = await sharePoster(blob, name, a.title);
      setStatus(r === "shared" ? "Shared." : r === "downloaded" ? "Sharing isn't available here — the PNG was downloaded instead." : undefined);
    } else {
      downloadBlob(blob, name);
      setStatus("Saved as PNG.");
    }
  }

  const f = FORMATS[cfg.format];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{a.description}</p>
      <div className="mx-auto overflow-hidden rounded-2xl border border-line" style={{ maxWidth: cfg.format === "story" ? 260 : 340, aspectRatio: `${f.w} / ${f.h}` }}>
        <canvas ref={canvas} className="h-full w-full" aria-label={`Poster preview: ${a.headline}`} role="img" />
      </div>
      <Segmented<PosterFormat>
        label="Format"
        value={cfg.format}
        onChange={(format) => set({ format })}
        options={[
          { value: "story", label: "Story" },
          { value: "square", label: "Square" },
          { value: "portrait", label: "Portrait" },
        ]}
      />
      <div className="flex gap-2">
        {(Object.keys(THEMES) as PosterTheme[]).map((t) => (
          <button key={t} aria-pressed={cfg.theme === t} onClick={() => set({ theme: t })} className={cx("flex flex-1 items-center justify-center gap-2", cfg.theme === t ? "chip-on" : "chip")}>
            <span className="h-4 w-4 rounded-full" style={{ background: `linear-gradient(135deg, ${THEMES[t].bg[0]}, ${THEMES[t].bg[1]})` }} />
            {THEMES[t].label}
          </button>
        ))}
      </div>

      <div>
        <span className="label">Review what&apos;s shown</span>
        {a.stats.length === 0 && <p className="text-sm text-muted">No statistics for this milestone.</p>}
        {a.stats.map((s) => (
          <Toggle
            key={s.key}
            label={`${s.label}: ${s.value}`}
            hint={s.sensitive ? "Health detail — hidden by default" : undefined}
            checked={cfg.shownStats.includes(s.key)}
            onChange={(on) => set({ shownStats: on ? [...cfg.shownStats, s.key] : cfg.shownStats.filter((k) => k !== s.key) })}
          />
        ))}
        {data.profile.displayName && <Toggle label="Show my name" checked={cfg.showName} onChange={(showName) => set({ showName })} />}
        <Field label="Personal reflection (optional)">
          {(id) => <input id={id} className="input" maxLength={140} value={cfg.reflection ?? ""} onChange={(e) => set({ reflection: e.target.value })} placeholder="What this means to you" />}
        </Field>
        <p className="mt-2 text-xs text-muted">Posters never include journal entries, exact sleep schedules or location. Nothing is shared unless you choose to.</p>
      </div>

      {status && <Notice>{status}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost" onClick={() => save(false)}><Download size={16} /> Save poster</button>
        <button className="btn-primary" onClick={() => save(true)}><Share2 size={16} /> Share</button>
      </div>
      <p className="text-center text-xs text-muted">{f.label} PNG</p>
    </div>
  );
}

function CustomForm({ data, onDone }: { data: DataSet; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CustomAchievement["kind"]>("manual");
  const [category, setCategory] = useState<CustomAchievement["category"]>("growth");
  const [habitId, setHabitId] = useState<number | undefined>(data.habits[0]?.id);
  const [activity, setActivity] = useState<ActivityType | "">("");
  const [target, setTarget] = useState("10");
  const [error, setError] = useState<string>();
  const presets = ["Finished a book", "Completed a course", "Completed a personal project", "Reached a learning milestone"];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => <button key={p} className="chip" onClick={() => { setTitle(p); setKind("manual"); setCategory("growth"); }}>{p}</button>)}
      </div>
      <Field label="Milestone">{(id) => <input id={id} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Read “Atomic Habits”" />}</Field>
      <Field label="Details (optional)">{(id) => <input id={id} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      <div>
        <span className="label">Category</span>
        <Segmented label="Category" value={category} onChange={setCategory} options={[{ value: "growth", label: "Personal growth" }, { value: "custom", label: "Other" }]} />
      </div>
      <div>
        <span className="label">Counts as complete when…</span>
        <Segmented
          label="Completion rule"
          value={kind}
          onChange={setKind}
          options={[
            { value: "manual", label: "I mark it" },
            { value: "habitCount", label: "Habit ×N" },
            { value: "workoutCount", label: "Workouts ×N" },
            { value: "workoutDistance", label: "Distance" },
          ]}
        />
      </div>
      {kind === "habitCount" && (
        <Field label="Habit">
          {(id) => (
            <select id={id} className="input" value={habitId} onChange={(e) => setHabitId(Number(e.target.value))}>
              {data.habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
        </Field>
      )}
      {(kind === "workoutCount" || kind === "workoutDistance") && (
        <Field label="Activity">
          {(id) => (
            <select id={id} className="input" value={activity} onChange={(e) => setActivity(e.target.value as ActivityType | "")}>
              <option value="">Any</option>
              {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}
            </select>
          )}
        </Field>
      )}
      {kind !== "manual" && (
        <Field label={kind === "workoutDistance" ? "Target distance (km)" : "Target count"} hint="Counted from today onwards, using your logged records.">
          {(id) => <input id={id} inputMode="decimal" className="input" value={target} onChange={(e) => setTarget(e.target.value)} />}
        </Field>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <button
        className="btn-primary w-full"
        onClick={async () => {
          const t = Number(target);
          if (!title.trim()) return setError("Name your milestone.");
          if (kind !== "manual" && !(t > 0)) return setError("Set a target above zero.");
          if (kind === "habitCount" && habitId === undefined) return setError("Create a habit first.");
          await db.customAchievements.add({
            title: title.trim(),
            description: description.trim() || undefined,
            category,
            kind,
            habitId: kind === "habitCount" ? habitId : undefined,
            activity: activity || undefined,
            target: kind === "manual" ? undefined : t,
            createdAt: nowIso(),
          });
          onDone();
        }}
      >
        Add milestone
      </button>
    </div>
  );
}
