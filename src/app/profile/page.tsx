"use client";

import { Download, Upload } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { AppleHealthCard } from "@/components/AppleHealthCard";
import { ACTIVITY_LABEL } from "@/components/forms/WorkoutForm";
import { Card, Field, Loading, Notice, Page, Segmented, Sheet, Toggle, cx } from "@/components/ui";
import { useDataSet } from "@/hooks/data";
import { buildCoachPayload } from "@/lib/coach";
import { METRICS_TEMPLATE, SLEEP_TEMPLATE } from "@/lib/csv";
import { db, requestPersistence, updateProfile } from "@/lib/db";
import { formatInstant, nowIso } from "@/lib/date";
import { notificationSupport, showNotification } from "@/lib/notifications";
import type { DataSet } from "@/lib/reports";
import { deleteAll, exportAll, importCsv, restoreAll, type ImportOutcome } from "@/lib/store";
import type { ActivityType, NotificationPrefs, Profile } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Text input that saves on blur, so typing isn't interrupted by live updates. Re-keyed when the stored value changes. */
function TextSetting(props: { label: string; value: string; onSave: (v: string) => void; placeholder?: string; type?: string; hint?: string }) {
  return <TextSettingInner key={props.value} {...props} />;
}

function TextSettingInner({ label, value, onSave, placeholder, type = "text", hint }: { label: string; value: string; onSave: (v: string) => void; placeholder?: string; type?: string; hint?: string }) {
  const [v, setV] = useState(value);
  return (
    <Field label={label} hint={hint}>
      {(id) => <input id={id} type={type} className="input" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />}
    </Field>
  );
}

export default function ProfilePage() {
  const data = useDataSet();
  return <Page title="Profile">{!data ? <Loading /> : <Settings data={data} />}</Page>;
}

function Settings({ data }: { data: DataSet }) {
  const p = data.profile;
  const set = (patch: Partial<Profile>) => updateProfile(patch);
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [p.timeZone];
    }
  }, [p.timeZone]);

  return (
    <>
      <Card title="About you">
        <div className="space-y-3">
          <TextSetting label="Display name" value={p.displayName} onSave={(displayName) => set({ displayName })} placeholder="Optional" />
          <div className="grid grid-cols-2 gap-3">
            <TextSetting label="Birth year" type="number" value={p.birthYear?.toString() ?? ""} onSave={(v) => set({ birthYear: v ? Number(v) : undefined })} placeholder="Optional" />
            <TextSetting
              label={`Height (${p.units === "imperial" ? "in" : "cm"})`}
              type="number"
              value={p.heightCm ? String(Math.round(p.units === "imperial" ? p.heightCm / 2.54 : p.heightCm)) : ""}
              onSave={(v) => set({ heightCm: v ? Number(v) * (p.units === "imperial" ? 2.54 : 1) : undefined })}
              placeholder="Optional"
            />
          </div>
          <div>
            <span className="label">Units</span>
            <Segmented label="Units" value={p.units} onChange={(units) => set({ units })} options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} />
          </div>
          <Field label="Time zone" hint="All days and times are shown in this zone.">
            {(id) => (
              <select id={id} className="input" value={p.timeZone} onChange={(e) => set({ timeZone: e.target.value })}>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            )}
          </Field>
          <TextSetting label="Typical work schedule" value={p.workSchedule ?? ""} onSave={(workSchedule) => set({ workSchedule })} placeholder="e.g. Mon–Fri 9–17, office Tue/Thu" />
          <div>
            <span className="label">Appearance</span>
            <Segmented label="Theme" value={p.theme} onChange={(theme) => set({ theme })} options={[{ value: "schedule", label: "Auto" }, { value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
            <p className="mt-1 text-xs text-muted">Auto: light during the day, dark from your wind-down time until you wake up.</p>
          </div>
        </div>
      </Card>

      <Card title="Sleep & lifestyle goals">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wake-up time">{(id) => <input id={id} type="time" className="input" value={p.targetWake} onChange={(e) => e.target.value && set({ targetWake: e.target.value })} />}</Field>
          <Field label="Caffeine cut-off">{(id) => <input id={id} type="time" className="input" value={p.caffeineCutoff} onChange={(e) => e.target.value && set({ caffeineCutoff: e.target.value })} />}</Field>
          <TextSetting label="Water target (ml)" type="number" value={String(p.waterTargetMl)} onSave={(v) => Number(v) > 0 && set({ waterTargetMl: Number(v) })} />
        </div>
        <div className="mt-3">
          <TextSetting label="Sleep goal" value={p.sleepGoal ?? ""} onSave={(sleepGoal) => set({ sleepGoal })} placeholder="e.g. Wake rested without an alarm" />
        </div>
        <p className="mt-2 text-xs text-muted">Sleep need, time to fall asleep and wind-down are set in Health → Sleep → Bedtime planner.</p>
      </Card>

      <Card title="Fitness">
        <div className="space-y-3">
          <div>
            <span className="label">Current level</span>
            <Segmented label="Fitness level" value={p.fitnessLevel} onChange={(fitnessLevel) => set({ fitnessLevel })} options={[{ value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" }]} />
          </div>
          <TextSetting label="Goals (comma-separated)" value={p.fitnessGoals.join(", ")} onSave={(v) => set({ fitnessGoals: v.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="e.g. Run 5 km comfortably, Get stronger" />
          <div>
            <span className="label">Available training days</span>
            <div className="flex gap-1">
              {DAYS.map((d, i) => {
                const on = p.trainingDays.includes(i);
                return (
                  <button key={d} aria-pressed={on} onClick={() => set({ trainingDays: on ? p.trainingDays.filter((x) => x !== i) : [...p.trainingDays, i] })} className={cx("h-11 flex-1 rounded-xl border text-xs font-medium", on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="label">Preferred activities</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((a) => {
                const on = p.preferredActivities.includes(a);
                return (
                  <button key={a} aria-pressed={on} className={on ? "chip-on" : "chip"} onClick={() => set({ preferredActivities: on ? p.preferredActivities.filter((x) => x !== a) : [...p.preferredActivities, a] })}>
                    {ACTIVITY_LABEL[a]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Show / hide metrics">
        {[
          ["bodyBattery", "Body Battery"],
          ["stress", "Stress"],
          ["respiration", "Respiration"],
          ["sleepScore", "Sleep score"],
          ["weight", "Weight"],
          ["waist", "Waist"],
          ["bodyFat", "Body fat"],
          ["muscle", "Muscle mass"],
        ].map(([k, label]) => (
          <Toggle key={k} label={label} checked={!p.hiddenMetrics.includes(k)} onChange={(on) => set({ hiddenMetrics: on ? p.hiddenMetrics.filter((x) => x !== k) : [...p.hiddenMetrics, k] })} />
        ))}
      </Card>

      <Notifications p={p} />
      <AppleHealthCard profile={p} />
      <Integrations />
      <Coach data={data} />
      <DataPrivacy />
      <Install />
      <p className="pb-4 text-center text-xs text-muted">Human OS · data stored on this device</p>
    </>
  );
}

function Notifications({ p }: { p: Profile }) {
  const n = p.notifications;
  // Rendered client-side only (after IndexedDB loads), so reading browser APIs here is safe.
  const [support, setSupport] = useState(() => notificationSupport());
  const set = (patch: Partial<NotificationPrefs>) => updateProfile({ notifications: { ...n, ...patch } });

  async function enable(on: boolean) {
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
    setSupport(notificationSupport());
    set({ enabled: on && typeof Notification !== "undefined" && Notification.permission === "granted" });
  }

  return (
    <Card title="Reminders">
      {support && (support.state === "unsupported" || support.state === "needs-install") && <Notice tone="warn">{support.reason}</Notice>}
      {support?.state === "denied" && <Notice tone="warn">Notifications are blocked for this site. Allow them in your browser or system settings.</Notice>}
      <Toggle label="Enable reminders" checked={n.enabled} onChange={enable} hint="Delivered while the app is open or recently used." />
      {n.enabled && (
        <>
          <div className="divide-y divide-line">
            {(
              [
                ["bedtime", "Wind-down / bedtime"],
                ["morning", "Morning routine"],
                ["evening", "Evening preparation"],
                ["habits", "Habit reminders (per habit time)"],
                ["workout", "Training days (17:00)"],
                ["hydration", "Hydration"],
                ["weeklyReview", "Weekly review (Sun 18:00)"],
              ] as [keyof NotificationPrefs, string][]
            ).map(([k, label]) => (
              <Toggle key={k} label={label} checked={Boolean(n[k])} onChange={(v) => set({ [k]: v } as Partial<NotificationPrefs>)} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Field label="Quiet from">{(id) => <input id={id} type="time" className="input" value={n.quietStart} onChange={(e) => set({ quietStart: e.target.value })} />}</Field>
            <Field label="Quiet until">{(id) => <input id={id} type="time" className="input" value={n.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} />}</Field>
            <Field label="Water every">
              {(id) => (
                <select id={id} className="input" value={n.hydrationEveryMin} onChange={(e) => set({ hydrationEveryMin: Number(e.target.value) })}>
                  {[60, 90, 120, 180].map((m) => <option key={m} value={m}>{m / 60} h</option>)}
                </select>
              )}
            </Field>
          </div>
          <div className="mt-3">
            <span className="label">Days</span>
            <div className="flex gap-1">
              {DAYS.map((d, i) => {
                const on = n.weekdays.includes(i);
                return (
                  <button key={d} aria-pressed={on} onClick={() => set({ weekdays: on ? n.weekdays.filter((x) => x !== i) : [...n.weekdays, i] })} className={cx("h-10 flex-1 rounded-xl border text-xs", on ? "border-accent bg-accent-soft" : "border-line")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Reminders for completed habits are skipped. Bedtime reminders still arrive during quiet hours.</p>
          <button className="btn-ghost mt-3 w-full" onClick={() => showNotification({ id: `test-${Date.now()}`, title: "Human OS", body: "Reminders are working." })}>
            Send a test reminder
          </button>
        </>
      )}
    </Card>
  );
}

function Integrations() {
  const [garmin, setGarmin] = useState<{ state: string; message: string }>();
  const [result, setResult] = useState<ImportOutcome>();
  const [busy, setBusy] = useState(false);
  const logs = useLiveQuery(() => db.syncLogs.orderBy("at").reverse().limit(5).toArray(), []);
  const profile = useLiveQuery(() => db.profile.get("me"), []);
  useEffect(() => {
    fetch("/api/integrations/garmin/status")
      .then((r) => r.json())
      .then(setGarmin)
      .catch(() => setGarmin({ state: "unknown", message: "Couldn't reach the server to check status (offline?)." }));
  }, []);

  async function onFile(file: File) {
    setBusy(true);
    setResult(undefined);
    try {
      setResult(await importCsv(await file.text()));
    } catch (e) {
      setResult({ kind: "error", inserted: 0, skipped: 0, errors: [{ row: 0, message: (e as Error).message }] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Data sources">
      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">Garmin Connect</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{garmin ? (garmin.state === "connected" ? "Connected" : "Not connected") : "Checking…"}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{garmin?.message}</p>
        <p className="mt-1 text-xs text-muted">Human OS will never ask for your Garmin password. See docs/GARMIN.md for the official enablement path.</p>
      </div>

      <div className="mt-4">
        <span className="label">Import a file</span>
        <p className="mb-2 text-sm text-muted">
          Garmin Connect activities export (Activities → Export CSV), or a Human OS sleep / daily-metrics CSV. Re-importing the same file never creates duplicates.
        </p>
        <label className={cx("btn-ghost w-full cursor-pointer", busy && "opacity-50")}>
          <Upload size={16} /> {busy ? "Importing…" : "Choose CSV file"}
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <div className="mt-2 flex gap-2">
          <button className="btn-quiet flex-1 text-xs" onClick={() => download("human-os-sleep-template.csv", SLEEP_TEMPLATE, "text/csv")}>
            <Download size={14} /> Sleep template
          </button>
          <button className="btn-quiet flex-1 text-xs" onClick={() => download("human-os-metrics-template.csv", METRICS_TEMPLATE, "text/csv")}>
            <Download size={14} /> Metrics template
          </button>
        </div>
        <p className="text-xs text-muted">Times in files are read in your profile time zone ({profile?.timeZone}).</p>
        {result && (
          <div className="mt-2">
            <Notice tone={result.errors.length && !result.inserted ? "bad" : result.errors.length ? "warn" : "info"}>
              {result.kind !== "unknown" && result.kind !== "error" && (
                <div>
                  Added {result.inserted}, already present {result.skipped}
                  {result.errors.length ? `, rejected ${result.errors.length}` : ""}.
                </div>
              )}
              {result.errors.slice(0, 5).map((e, i) => (
                <div key={i} className="text-xs">{e.row ? `Row ${e.row}: ` : ""}{e.message}</div>
              ))}
            </Notice>
          </div>
        )}
      </div>
      {logs && logs.length > 0 && (
        <div className="mt-3">
          <span className="label">Recent imports</span>
          <ul className="text-xs text-muted">
            {logs.map((l) => (
              <li key={l.id}>
                {formatInstant(l.at, profile?.timeZone ?? "UTC", "d MMM HH:mm")} · {l.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Coach({ data }: { data: DataSet }) {
  const p = data.profile;
  const [status, setStatus] = useState<{ configured: boolean; requiresToken: boolean; model?: string }>();
  const [preview, setPreview] = useState(false);
  const [mem, setMem] = useState("");
  const memory = useLiveQuery(() => db.coachMemory.toArray(), []);
  useEffect(() => {
    fetch("/api/coach").then((r) => r.json()).then(setStatus).catch(() => setStatus(undefined));
  }, []);
  const payload = preview ? buildCoachPayload(data, "daily", (memory ?? []).map((m) => m.text)) : undefined;

  return (
    <Card title="AI coach">
      <Toggle label="Use the AI coach" checked={p.aiEnabled} onChange={(aiEnabled) => updateProfile({ aiEnabled })} hint="When off, nothing is ever sent to an AI service." />
      <p className="mt-1 text-sm text-muted">
        {status === undefined ? "Checking server…" : status.configured ? `Server configured (${status.model}).` : "Not configured on the server — the app uses its built-in calculated guidance instead."}
      </p>
      {status?.requiresToken && (
        <div className="mt-3">
          <TextSetting label="Coach access token" type="password" value={p.coachToken ?? ""} onSave={(coachToken) => updateProfile({ coachToken })} hint="Required by this server. Stored only on this device." />
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        When you ask for a briefing, the app sends a minimised summary (last 7 nights, recovery averages, check-in, recent workouts, habit rates and your goals) to the server, which forwards it to Anthropic&apos;s Claude API. Your name, age, body measurements and notes are never sent.
      </p>
      <button className="btn-ghost mt-2 w-full" onClick={() => setPreview(true)}>See exactly what is sent</button>

      <div className="mt-4">
        <span className="label">Things the coach should remember</span>
        <ul className="mb-2 space-y-1">
          {(memory ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span>{m.text}</span>
              <button className="text-xs text-muted" onClick={() => db.coachMemory.delete(m.id!)}>Remove</button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mem.trim()) await db.coachMemory.add({ text: mem.trim().slice(0, 300), createdAt: nowIso() });
            setMem("");
          }}
        >
          <input className="input" aria-label="New coach memory" placeholder="e.g. I prefer morning workouts" value={mem} onChange={(e) => setMem(e.target.value)} />
          <button className="btn-ghost">Add</button>
        </form>
      </div>
      <Sheet open={preview} onClose={() => setPreview(false)} title="Data sent to the coach">
        <pre className="max-h-[60dvh] overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(payload, null, 2)}</pre>
      </Sheet>
    </Card>
  );
}

function DataPrivacy() {
  const [persisted, setPersisted] = useState<boolean>();
  const [msg, setMsg] = useState<{ tone: "info" | "bad"; text: string }>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, []);

  return (
    <Card title="Your data">
      <p className="text-sm text-muted">
        Everything is stored privately on this device (IndexedDB). There are no ads or third-party trackers. Export regularly as a backup — clearing browser data removes it.
      </p>
      <p className="mt-2 text-xs text-muted">
        Persistent storage: {persisted === undefined ? "unknown" : persisted ? "granted (protected from automatic clean-up)" : "not granted"}
        {persisted === false && (
          <button className="ml-2 underline" onClick={async () => setPersisted(await requestPersistence())}>Request</button>
        )}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="btn-ghost"
          onClick={async () => {
            const dump = await exportAll();
            download(`human-os-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dump, null, 2));
          }}
        >
          <Download size={16} /> Export all
        </button>
        <label className="btn-ghost cursor-pointer">
          <Upload size={16} /> Restore
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!confirm("Restoring replaces all current data on this device. Continue?")) return;
              try {
                await restoreAll(JSON.parse(await f.text()));
                setMsg({ tone: "info", text: "Restored." });
              } catch (err) {
                setMsg({ tone: "bad", text: (err as Error).message });
              }
            }}
          />
        </label>
      </div>
      {msg && <div className="mt-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <button className="btn-quiet mt-3 w-full text-bad" onClick={() => setConfirmDelete(true)}>Delete all data…</button>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete all data">
        <p className="text-sm">This permanently deletes every record on this device. Export first if you may want it later.</p>
        <Field label='Type "delete" to confirm'>{(id) => <input id={id} className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>
        <button
          className="btn mt-3 w-full bg-bad text-white"
          disabled={typed.trim().toLowerCase() !== "delete"}
          onClick={async () => {
            await deleteAll();
            try {
              localStorage.clear();
            } catch {}
            window.location.replace("/onboarding");
          }}
        >
          Delete everything
        </button>
      </Sheet>
    </Card>
  );
}

type BIP = Event & { prompt: () => Promise<void> };

function Install() {
  const [evt, setEvt] = useState<BIP>();
  const [standalone] = useState(() => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [ios] = useState(() => /iPhone|iPad|iPod/.test(navigator.userAgent));
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIP);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (standalone) return null;
  return (
    <Card title="Install the app">
      {evt ? (
        <button className="btn-primary w-full" onClick={() => evt.prompt()}>Install Human OS</button>
      ) : ios ? (
        <p className="text-sm text-muted">In Safari, tap the Share button, then “Add to Home Screen”. Installing also enables reminders on iPhone (iOS 16.4+).</p>
      ) : (
        <p className="text-sm text-muted">Use your browser menu → “Install app” or “Add to Home screen”.</p>
      )}
    </Card>
  );
}
