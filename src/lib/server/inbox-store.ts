import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Server-only storage for the Apple Health inbox.
 * Payloads are encrypted with AES-256-GCM before they reach Supabase, so the
 * database only ever holds ciphertext. Rows are deleted as soon as the app
 * confirms it imported them.
 */

const TABLE = "health_inbox";

export function inboxConfigured(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.INBOX_ENCRYPTION_KEY && env.COACH_ACCESS_TOKEN);
}

/** Same server access token the AI coach uses; required here (never optional). */
export function tokenOk(header: string | null, env = process.env): boolean {
  const expected = env.COACH_ACCESS_TOKEN;
  if (!expected || !header) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function key(env = process.env): Buffer {
  const k = Buffer.from(env.INBOX_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("INBOX_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return k;
}

export function encrypt(plain: string, k = key()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function decrypt(blob: string, k = key()): string {
  const buf = Buffer.from(blob, "base64");
  const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

let client: SupabaseClient | undefined;
function db(): SupabaseClient {
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function putItem(payload: unknown): Promise<string> {
  const { data, error } = await db().from(TABLE).insert({ payload_encrypted: encrypt(JSON.stringify(payload)) }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function listItems(): Promise<{ id: string; receivedAt: string; payload: unknown }[]> {
  const { data, error } = await db().from(TABLE).select("id, received_at, payload_encrypted").order("received_at").limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id, receivedAt: r.received_at, payload: JSON.parse(decrypt(r.payload_encrypted)) }));
}

export async function deleteItems(ids: string[]) {
  if (!ids.length) return;
  const { error } = await db().from(TABLE).delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/** Items older than 30 days are dropped even if never collected. */
export async function purgeOld() {
  await db().from(TABLE).delete().lt("received_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
}
