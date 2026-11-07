import { db, type HumanOsDb } from "./db";
import { addDays, nowIso, todayKey } from "./date";
import type { GarminRecords } from "./garmin-map";
import { getProfile } from "./db";

/**
 * Pulls Garmin data through the server (/api/garmin/sync) into the local
 * store. First run backfills BACKFILL_DAYS in 30-day chunks; afterwards each
 * run refreshes the last few days (Garmin finalises sleep and dailies late).
 * Upserts by unique key, so re-syncing never duplicates.
 */

/** First sync pulls a year so fitness/fatigue (42-day) and PRs have history. */
export const BACKFILL_DAYS = 365;
const REFRESH_DAYS = 3;
const CHUNK = 30;

export interface GarminSyncResult {
  status: "ok" | "not_configured" | "unauthorized" | "offline" | "error" | "busy";
  imported: number;
  message: string;
}

export async function applyGarminRecords(r: GarminRecords, database: HumanOsDb = db): Promise<number> {
  const now = nowIso();
  let n = 0;
  await database.transaction("rw", database.sleep, database.metrics, database.workouts, async () => {
    for (const s of r.sleep) {
      const ex = await database.sleep.where("[date+source]").equals([s.date, "garmin"]).first();
      if (ex?.id) await database.sleep.update(ex.id, { ...s, updatedAt: now });
      else await database.sleep.add({ ...s, createdAt: now, updatedAt: now });
      n++;
    }
    for (const m of r.metrics) {
      const ex = await database.metrics.where("[date+metric+source]").equals([m.date, m.metric, "garmin"]).first();
      if (ex?.id) {
        if (ex.value !== m.value) await database.metrics.update(ex.id, { value: m.value, updatedAt: now });
      } else await database.metrics.add({ ...m, createdAt: now, updatedAt: now });
      n++;
    }
    for (const w of r.workouts) {
      const ex = await database.workouts.where("externalId").equals(w.externalId!).first();
      // Keep the user's own effort rating and notes when Garmin re-sends an activity.
      if (ex?.id) await database.workouts.update(ex.id, { ...w, rpe: ex.rpe, notes: ex.notes, sets: ex.sets, updatedAt: now });
      else await database.workouts.add({ ...w, createdAt: now, updatedAt: now });
      n++;
    }
  });
  return n;
}

let running = false;

export async function syncGarmin(token: string | undefined, database: HumanOsDb = db, onProgress?: (msg: string) => void): Promise<GarminSyncResult> {
  if (running) return { status: "busy", imported: 0, message: "Already syncing." };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { status: "offline", imported: 0, message: "Offline." };
  if (!token) return { status: "unauthorized", imported: 0, message: "Add the server access token in Profile." };
  running = true;
  try {
    const profile = await getProfile(database);
    const today = todayKey(profile.timeZone);
    const last = await database.syncLogs.where("provider").equals("garmin").filter((l) => l.status !== "error").last();
    const from = last ? addDays(last.at.slice(0, 10), -REFRESH_DAYS) : addDays(today, -(BACKFILL_DAYS - 1));
    let imported = 0;
    let rejected = 0;
    for (let start = from; start <= today; start = addDays(start, CHUNK)) {
      const end = addDays(start, CHUNK - 1) < today ? addDays(start, CHUNK - 1) : today;
      onProgress?.(`Syncing ${start} → ${end}…`);
      const res = await fetch(`/api/garmin/sync?start=${start}&end=${end}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503) return { status: "not_configured", imported, message: json.message ?? "Garmin isn't configured on the server." };
      if (res.status === 401) return { status: "unauthorized", imported, message: json.message ?? "Access token is wrong." };
      if (!res.ok) {
        await database.syncLogs.add({ provider: "garmin", at: nowIso(), status: "error", message: json.message ?? `Error ${res.status}`, inserted: imported, skipped: 0 });
        return { status: "error", imported, message: json.message ?? `Garmin sync failed (${res.status}).` };
      }
      imported += await applyGarminRecords(json as GarminRecords, database);
      rejected += (json as GarminRecords).rejected?.length ?? 0;
    }
    const message = `${imported} values from Garmin (${from} → ${today})${rejected ? `, ${rejected} out-of-range values skipped` : ""}`;
    await database.syncLogs.add({ provider: "garmin", at: nowIso(), status: rejected ? "partial" : "ok", message, inserted: imported, skipped: rejected });
    return { status: "ok", imported, message };
  } catch (e) {
    return { status: "error", imported: 0, message: (e as Error).message };
  } finally {
    running = false;
  }
}
