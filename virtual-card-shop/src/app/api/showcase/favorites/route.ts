// src/app/api/showcase/favorites/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stub: returns empty until we add FavoriteCard model + toggling
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ ok: true, rows: [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load favorites" },
      { status: 500 }
    );
  }
}
