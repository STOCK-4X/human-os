import { NextResponse, type NextRequest } from "next/server";
import { daysBetween } from "@/lib/date";
import { tokenOk } from "@/lib/server/inbox-store";
import { GarminError, fetchGarminRange, garminKeyConfigured } from "@/lib/server/garmin";

/**
 * GET /api/garmin/sync?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Pulls the range from Garmin (server-side, with the personal API key) and
 * returns mapped records. Nothing is stored on the server.
 * Requires the server access token (Authorization: Bearer …).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!garminKeyConfigured()) {
    return NextResponse.json({ error: "not_configured", message: "Garmin key isn't set on the server (GARMIN_PERSONAL_API_KEY)." }, { status: 503 });
  }
  if (!tokenOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized", message: "Access token missing or wrong." }, { status: 401 });
  }
  const start = req.nextUrl.searchParams.get("start") ?? "";
  const end = req.nextUrl.searchParams.get("end") ?? "";
  if (!DAY.test(start) || !DAY.test(end) || daysBetween(start, end) < 0 || daysBetween(start, end) > 30) {
    return NextResponse.json({ error: "bad_request", message: "start/end must be YYYY-MM-DD, at most 31 days apart." }, { status: 400 });
  }
  try {
    const records = await fetchGarminRange(start, end);
    return NextResponse.json({ start, end, ...records }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof GarminError) return NextResponse.json({ error: "garmin", message: e.message }, { status: e.status });
    console.error("garmin sync failed", e);
    return NextResponse.json({ error: "internal", message: "Unexpected error talking to Garmin." }, { status: 502 });
  }
}
