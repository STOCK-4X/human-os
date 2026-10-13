import { beforeEach, describe, expect, it } from "vitest";
import { parseCsv, parseGarminActivitiesCsv, parseMetricsCsv, parseSleepCsv, num } from "@/lib/csv";
import { HumanOsDb, setManualMetric, updateProfile } from "@/lib/db";
import { deleteAll, exportAll, importCsv, restoreAll } from "@/lib/store";
import { TZ } from "./helpers";

const GARMIN = `Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Avg Run Cadence,Total Ascent
Running,2026-10-01 07:12:33,false,"Berlin Running",5.02,"1,312",00:31:10,148,171,168,24
Strength Training,2026-10-02 18:00:00,false,Strength,0.00,210,00:42:00,112,140,--,--
`;

describe("csv parsing", () => {
  it("handles quotes, commas in quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });
  it("treats blanks and '--' as missing, never zero", () => {
    expect(num("--")).toBeUndefined();
    expect(num("")).toBeUndefined();
    expect(num("1,312")).toBe(1312);
  });
  it("parses Garmin activity exports", () => {
    const r = parseGarminActivitiesCsv(GARMIN, TZ);
    expect(r.errors).toEqual([]);
    expect(r.records[0]).toMatchObject({ type: "run", distanceKm: 5.02, calories: 1312, avgHr: 148, cadence: 168, source: "csv" });
    expect(r.records[0].durationMin).toBeCloseTo(31.2, 1);
    expect(r.records[1]).toMatchObject({ type: "strength", cadence: undefined, elevationM: undefined });
  });
  it("validates sleep rows", () => {
    const r = parseSleepCsv("date,bedtime,wake\n2026-10-02,2026-10-01 23:00,2026-10-02 06:30\n,bad,2026-10-02 06:30\n", TZ);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].asleepMin).toBeUndefined();
    expect(r.errors[0].row).toBe(3);
  });
  it("rejects implausible metric values", () => {
    const r = parseMetricsCsv("date,rhr,steps\n2026-10-02,400,9000\n");
    expect(r.records).toEqual([{ date: "2026-10-02", metric: "steps", value: 9000, source: "csv" }]);
    expect(r.errors).toHaveLength(1);
  });
});

describe("local store", () => {
  let database: HumanOsDb;
  beforeEach(async () => {
    database = new HumanOsDb(`test-${Math.random()}`);
    await updateProfile({ timeZone: TZ }, database);
  });

  it("imports idempotently — re-importing never duplicates", async () => {
    const first = await importCsv(GARMIN, database);
    expect(first).toMatchObject({ kind: "garminActivities", inserted: 2, skipped: 0 });
    const second = await importCsv(GARMIN, database);
    expect(second).toMatchObject({ inserted: 0, skipped: 2 });
    expect(await database.workouts.count()).toBe(2);
    expect(await database.syncLogs.count()).toBe(2);
  });

  it("upserts and clears manual metrics", async () => {
    await setManualMetric("2026-10-02", "rhr", 52, database);
    await setManualMetric("2026-10-02", "rhr", 53, database);
    expect((await database.metrics.toArray()).map((m) => m.value)).toEqual([53]);
    await setManualMetric("2026-10-02", "rhr", undefined, database);
    expect(await database.metrics.count()).toBe(0);
  });

  it("exports, deletes and restores everything", async () => {
    await importCsv(GARMIN, database);
    const dump = await exportAll(database);
    await deleteAll(database);
    expect(await database.workouts.count()).toBe(0);
    await restoreAll(JSON.parse(JSON.stringify(dump)), database);
    expect(await database.workouts.count()).toBe(2);
    await expect(restoreAll({ nope: true }, database)).rejects.toThrow();
  });
});
