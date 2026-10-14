import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HumanOsDb, updateProfile } from "@/lib/db";
import { HealthPayloadSchema, inboxToRecords } from "@/lib/inbox";
import { applyInboxRecords } from "@/lib/inbox-sync";
import { decrypt, encrypt, tokenOk } from "@/lib/server/inbox-store";
import { TZ } from "./helpers";

const parse = (v: unknown) => HealthPayloadSchema.parse(v);

describe("inbox payload", () => {
  it("accepts Shortcuts-style strings, decimal commas and flat sleep keys", () => {
    const p = parse({ day: "2026-10-14", restingHR: "52", hrv: "48,5", steps: "8 450", sleepStart: "2026-10-13T23:05:00+02:00", sleepEnd: "2026-10-14T06:47:00+02:00" });
    expect(p.restingHR).toBe(52);
    expect(p.hrv).toBe(48.5);
    expect(p.steps).toBe(8450);
    expect(p.sleep?.start).toBe("2026-10-13T23:05:00+02:00");
  });

  it("maps to records: morning values on the day, totals on the day before, never zero-filled", () => {
    const r = inboxToRecords(parse({ day: "2026-10-14", restingHR: 52, steps: 8450, sleepStart: "2026-10-13T23:05:00+02:00", sleepEnd: "2026-10-14T06:47:00+02:00" }), TZ);
    expect(r.metrics).toEqual([
      { date: "2026-10-14", metric: "rhr", value: 52, source: "health" },
      { date: "2026-10-13", metric: "steps", value: 8450, source: "health" },
    ]);
    expect(r.sleep).toMatchObject({ date: "2026-10-14", source: "health", asleepMin: undefined });
    expect(r.workouts).toEqual([]);
  });

  it("rejects implausible values instead of storing them", () => {
    const r = inboxToRecords(parse({ day: "2026-10-14", restingHR: 400, sleepStart: "2026-10-14T06:00:00Z", sleepEnd: "2026-10-13T23:00:00Z" }), TZ);
    expect(r.metrics).toEqual([]);
    expect(r.sleep).toBeUndefined();
    expect(r.rejected.length).toBe(2);
  });

  it("maps workouts with a stable external id", () => {
    const r = inboxToRecords(parse({ day: "2026-10-14", workouts: [{ type: "Outdoor Run", start: "2026-10-13T17:30:00+02:00", durationMin: "31.5", distanceKm: "5.1" }] }), TZ);
    expect(r.workouts[0]).toMatchObject({ type: "run", durationMin: 31.5, distanceKm: 5.1, externalId: "health:2026-10-13T15:30:00.000Z:run" });
  });
});

describe("server helpers", () => {
  it("encrypts and decrypts with AES-GCM and detects tampering", () => {
    const k = randomBytes(32);
    const blob = encrypt('{"restingHR":52}', k);
    expect(blob).not.toContain("restingHR");
    expect(decrypt(blob, k)).toBe('{"restingHR":52}');
    const bad = Buffer.from(blob, "base64");
    bad[bad.length - 1] ^= 1;
    expect(() => decrypt(bad.toString("base64"), k)).toThrow();
  });
  it("requires the exact bearer token", () => {
    const env = { COACH_ACCESS_TOKEN: "secret-123" } as unknown as NodeJS.ProcessEnv;
    expect(tokenOk("Bearer secret-123", env)).toBe(true);
    expect(tokenOk("Bearer secret-124", env)).toBe(false);
    expect(tokenOk(null, env)).toBe(false);
    expect(tokenOk("Bearer x", {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("applying deliveries locally", () => {
  let database: HumanOsDb;
  beforeEach(async () => {
    database = new HumanOsDb(`inbox-${Math.random()}`);
    await updateProfile({ timeZone: TZ }, database);
  });
  it("upserts: a later delivery for the same day replaces, never duplicates", async () => {
    const first = inboxToRecords(parse({ day: "2026-10-14", restingHR: 52, sleepStart: "2026-10-13T23:00:00+02:00", sleepEnd: "2026-10-14T06:30:00+02:00" }), TZ);
    const second = inboxToRecords(parse({ day: "2026-10-14", restingHR: 53, sleepStart: "2026-10-13T23:00:00+02:00", sleepEnd: "2026-10-14T06:45:00+02:00" }), TZ);
    await applyInboxRecords(first, database);
    await applyInboxRecords(second, database);
    expect((await database.metrics.toArray()).map((m) => m.value)).toEqual([53]);
    const sleep = await database.sleep.toArray();
    expect(sleep).toHaveLength(1);
    expect(sleep[0].wakeTime).toBe("2026-10-14T04:45:00.000Z");
  });
});

// Route handlers with an in-memory store standing in for Supabase.
const mem = vi.hoisted(() => ({ rows: [] as { id: string; payload: unknown }[] }));
vi.mock("@/lib/server/inbox-store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/inbox-store")>();
  return {
    ...real,
    inboxConfigured: () => true,
    putItem: async (payload: unknown) => {
      const id = crypto.randomUUID();
      mem.rows.push({ id, payload });
      return id;
    },
    listItems: async () => mem.rows.map((r) => ({ ...r, receivedAt: "now" })),
    deleteItems: async (ids: string[]) => {
      mem.rows = mem.rows.filter((r) => !ids.includes(r.id));
    },
    purgeOld: async () => {},
  };
});

describe("/api/inbox", () => {
  beforeEach(() => {
    mem.rows = [];
    process.env.COACH_ACCESS_TOKEN = "tok";
  });
  const req = (method: string, body?: unknown, token = "tok") =>
    new NextRequest("http://localhost/api/inbox", {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("rejects a wrong token", async () => {
    const { POST } = await import("@/app/api/inbox/route");
    expect((await POST(req("POST", { restingHR: 52 }, "nope"))).status).toBe(401);
  });
  it("rejects invalid payloads", async () => {
    const { POST } = await import("@/app/api/inbox/route");
    expect((await POST(req("POST", { day: "yesterday" }))).status).toBe(400);
  });
  it("stores, lists and deletes deliveries", async () => {
    const { POST, GET, DELETE } = await import("@/app/api/inbox/route");
    const res = await POST(req("POST", { day: "2026-10-14", restingHR: "52" }));
    expect(res.status).toBe(200);
    const list = await (await GET(req("GET"))).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].payload.restingHR).toBe(52);
    await DELETE(req("DELETE", { ids: [list.items[0].id] }));
    expect(mem.rows).toHaveLength(0);
  });
});
