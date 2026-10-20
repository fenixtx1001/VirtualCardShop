import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getRegistryCommunity } from "@/lib/graded-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const rows = await getRegistryCommunity();
    return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load registry leaderboard" }, { status: 500 });
  }
}
