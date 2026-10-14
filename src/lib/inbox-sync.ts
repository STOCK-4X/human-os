import { db, getProfile, type HumanOsDb } from "./db";
import { nowIso } from "./date";
import { HealthPayloadSchema, inboxToRecords, type InboxRecords } from "./inbox";

/**
 * Collects Apple Health payloads from the server inbox, writes them into the
 * local store, then asks the server to delete them. Upserts by unique key, so
 * a later, more complete delivery for the same day replaces the earlier one
 * and nothing is ever duplicated.
 */

export interface InboxSyncResult {
  status: "ok" | "empty" | "not_configured" | "unauthorized" | "offline" | "error";
  imported: number;
  message: string;
}

export async function applyInboxRecords(r: InboxRecords, database: HumanOsDb = db): Promise<number> {
  const now = nowIso();
  let n = 0;
  await database.transaction("rw", database.sleep, database.metrics, database.workouts, async () => {
    if (r.sleep) {
      const ex = await database.sleep.where("[date+source]").equals([r.sleep.date, "health"]).first();
      if (ex?.id) await database.sleep.update(ex.id, { ...r.sleep, updatedAt: now });
      else await database.sleep.add({ ...r.sleep, createdAt: now, updatedAt: now });
      n++;
    }
    for (const m of r.metrics) {
      const ex = await database.metrics.where("[date+metric+source]").equals([m.date, m.metric, "health"]).first();
      if (ex?.id) await database.metrics.update(ex.id, { value: m.value, updatedAt: now });
      else await database.metrics.add({ ...m, createdAt: now, updatedAt: now });
      n++;
    }
    for (const w of r.workouts) {
      const ex = await database.workouts.where("externalId").equals(w.externalId!).first();
      if (ex?.id) await database.workouts.update(ex.id, { ...w, updatedAt: now });
      else await database.workouts.add({ ...w, createdAt: now, updatedAt: now });
      n++;
    }
  });
  return n;
}

let running = false;

export async function syncInbox(token: string | undefined, database: HumanOsDb = db): Promise<InboxSyncResult> {
  if (running) return { status: "empty", imported: 0, message: "Already syncing." };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { status: "offline", imported: 0, message: "Offline." };
  if (!token) return { status: "unauthorized", imported: 0, message: "Add the server access token in Profile." };
  running = true;
  try {
    const headers = { authorization: `Bearer ${token}` };
    const res = await fetch("/api/inbox", { headers, cache: "no-store" });
    if (res.status === 503) return { status: "not_configured", imported: 0, message: "Apple Health inbox isn't configured on the server yet." };
    if (res.status === 401) return { status: "unauthorized", imported: 0, message: "Access token is wrong." };
    if (!res.ok) return { status: "error", imported: 0, message: `Server error (${res.status}).` };
    const { items } = (await res.json()) as { items: { id: string; payload: unknown }[] };
    if (!items.length) return { status: "empty", imported: 0, message: "No new Apple Health data." };

    const tz = (await getProfile(database)).timeZone;
    let imported = 0;
    const rejected: string[] = [];
    const done: string[] = [];
    for (const item of items) {
      const parsed = HealthPayloadSchema.safeParse(item.payload);
      if (parsed.success) {
        const recs = inboxToRecords(parsed.data, tz);
        imported += await applyInboxRecords(recs, database);
        rejected.push(...recs.rejected);
      } else rejected.push("one delivery had an unreadable format");
      done.push(item.id);
    }
    // Only delete from the server after the local write succeeded.
    await fetch("/api/inbox", { method: "DELETE", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ids: done }) });
    const message = `${imported} value${imported === 1 ? "" : "s"} from ${items.length} Apple Health deliver${items.length === 1 ? "y" : "ies"}${rejected.length ? `; ${rejected.length} rejected (${rejected.slice(0, 2).join("; ")})` : ""}`;
    await database.syncLogs.add({ provider: "health", at: nowIso(), status: rejected.length ? "partial" : "ok", message, inserted: imported, skipped: rejected.length });
    return { status: "ok", imported, message };
  } catch (e) {
    return { status: "error", imported: 0, message: (e as Error).message };
  } finally {
    running = false;
  }
}
