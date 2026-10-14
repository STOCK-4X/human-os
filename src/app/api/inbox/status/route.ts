import { NextResponse } from "next/server";
import { inboxConfigured } from "@/lib/server/inbox-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: inboxConfigured() });
}
