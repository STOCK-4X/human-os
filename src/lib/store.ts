import { detectKind, parseCsv, parseGarminActivitiesCsv, parseMetricsCsv, parseSleepCsv } from "./csv";
import { DATA_TABLES, db, type HumanOsDb } from "./db";
import { nowIso } from "./date";
import type { DataSet } from "./reports";
import { getProfile } from "./db";

export interface ImportOutcome {
  kind: string;
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Import a CSV file. Idempotent: records already present (same unique key)
 * are skipped, never duplicated or silently overwritten.
 */
export async function importCsv(text: string, database: HumanOsDb = db): Promise<ImportOutcome> {
  const profile = await getProfile(database);
  const tz = profile.timeZone;
  const headers = parseCsv(text.split(/\r?\n/, 1)[0] ?? "")[0] ?? [];
  const kind = detectKind(headers);
  const now = nowIso();
  let inserted = 0;
  let skipped = 0;
  let errors: ImportOutcome["errors"] = [];

  await database.transaction("rw", database.sleep, database.metrics, database.workouts, database.syncLogs, async () => {
    if (kind === "sleep") {
      const res = parseSleepCsv(text, tz);
      errors = res.errors;
      for (const r of res.records) {
        const exists = await database.sleep.where("[date+source]").equals([r.date, r.source]).first();
        if (exists) skipped++;
        else {
          await database.sleep.add({ ...r, createdAt: now, updatedAt: now });
          inserted++;
        }
      }
    } else if (kind === "metrics") {
      const res = parseMetricsCsv(text);
      errors = res.errors;
      for (const r of res.records) {
        const exists = await database.metrics.where("[date+metric+source]").equals([r.date, r.metric, r.source]).first();
        if (exists) skipped++;
        else {
          await database.metrics.add({ ...r, createdAt: now, updatedAt: now });
          inserted++;
        }
      }
    } else if (kind === "garminActivities") {
      const res = parseGarminActivitiesCsv(text, tz, profile.units === "imperial" ? "mi" : "km");
      errors = res.errors;
      for (const r of res.records) {
        const exists = await database.workouts.where("externalId").equals(r.externalId!).first();
        if (exists) skipped++;
        else {
          await database.workouts.add({ ...r, createdAt: now, updatedAt: now });
          inserted++;
        }
      }
    }
    if (kind !== "unknown") {
      await database.syncLogs.add({
        provider: "csv",
        at: now,
        status: errors.length ? "partial" : "ok",
        message: `${kind}: ${inserted} added, ${skipped} already present, ${errors.length} rejected`,
        inserted,
        skipped,
      });
    }
  });
  if (kind === "unknown") {
    errors = [{ row: 1, message: "Unrecognised columns. Use a Human OS template or a Garmin Connect activities export." }];
  }
  return { kind, inserted, skipped, errors };
}

export async function loadDataSet(database: HumanOsDb = db): Promise<DataSet> {
  const [profile, metrics, sleep, workouts, habits, habitLogs, checkins, lifestyle] = await Promise.all([
    getProfile(database),
    database.metrics.toArray(),
    database.sleep.toArray(),
    database.workouts.toArray(),
    database.habits.toArray(),
    database.habitLogs.toArray(),
    database.checkins.toArray(),
    database.lifestyle.toArray(),
  ]);
  return { profile, metrics, sleep, workouts, habits, habitLogs, checkins, lifestyle };
}

export const EXPORT_FORMAT = "human-os-export";
export const EXPORT_VERSION = 1;

export async function exportAll(database: HumanOsDb = db) {
  const tables: Record<string, unknown[]> = {};
  for (const t of DATA_TABLES) tables[t] = await database.table(t).toArray();
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: nowIso(), tables };
}

/** Restore a previous export, replacing current data. */
export async function restoreAll(json: unknown, database: HumanOsDb = db) {
  const data = json as { format?: string; version?: number; tables?: Record<string, unknown[]> };
  if (data?.format !== EXPORT_FORMAT || !data.tables) throw new Error("Not a Human OS export file.");
  await database.transaction("rw", DATA_TABLES.map((t) => database.table(t)), async () => {
    for (const t of DATA_TABLES) {
      await database.table(t).clear();
      const rows = data.tables![t];
      if (Array.isArray(rows) && rows.length) await database.table(t).bulkAdd(rows);
    }
  });
}

export async function deleteAll(database: HumanOsDb = db) {
  await database.transaction("rw", DATA_TABLES.map((t) => database.table(t)), async () => {
    for (const t of DATA_TABLES) await database.table(t).clear();
  });
}
