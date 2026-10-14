import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { HealthPayloadSchema } from "@/lib/inbox";
import { deleteItems, inboxConfigured, listItems, purgeOld, putItem, tokenOk } from "@/lib/server/inbox-store";

/**
 * Apple Health inbox.
 *  POST   — the iOS Shortcut delivers one morning payload.
 *  GET    — the app collects waiting payloads (decrypted).
 *  DELETE — the app confirms import; rows are removed.
 * Every method requires the server access token (Authorization: Bearer …).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 32_000;

function guard(req: NextRequest) {
  if (!inboxConfigured())
    return NextResponse.json({ error: "not_configured", message: "Apple Health inbox is not configured on the server." }, { status: 503 });
  if (!tokenOk(req.headers.get("authorization")))
    return NextResponse.json({ error: "unauthorized", message: "Access token missing or wrong." }, { status: 401 });
  return undefined;
}

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = HealthPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "Payload failed validation.", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  try {
    const id = await putItem({ ...parsed.data, sentAt: parsed.data.sentAt ?? new Date().toISOString() });
    void purgeOld().catch(() => undefined);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("inbox put failed", e);
    return NextResponse.json({ error: "storage", message: "Couldn't store the data." }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listItems() });
  } catch (e) {
    console.error("inbox list failed", e);
    return NextResponse.json({ error: "storage", message: "Couldn't read the inbox." }, { status: 502 });
  }
}

const DeleteSchema = z.object({ ids: z.array(z.string().uuid()).max(60) });

export async function DELETE(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    await deleteItems(parsed.data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("inbox delete failed", e);
    return NextResponse.json({ error: "storage" }, { status: 502 });
  }
}
