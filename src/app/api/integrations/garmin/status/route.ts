import { NextResponse } from "next/server";
import { garminServerStatus } from "@/lib/integrations/garmin";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(garminServerStatus());
}
