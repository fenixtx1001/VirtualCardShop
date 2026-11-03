import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { getChicagoDateKey } from "@/lib/analytics-math";
import { syncDailyPortfolioSnapshot } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Revaluing thousands of cards is deliberately an explicit collector action,
// not something we do each time a leaderboard or chart is viewed.
const REFRESH_COOLDOWN_MS = 60_000;

export async function POST() {
  try {
    const user = await requireUser();
    const dateKey = getChicagoDateKey();
    const existing = await prisma.financialDailySnapshot.findUnique({
      where: { userId_dateKey: { userId: user.id, dateKey } },
      select: { updatedAt: true },
    });

    if (existing && Date.now() - existing.updatedAt.getTime() < REFRESH_COOLDOWN_MS) {
      return NextResponse.json(
        { ok: true, refreshed: false },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    await syncDailyPortfolioSnapshot(prisma, user.id);
    return NextResponse.json(
      { ok: true, refreshed: true },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not refresh portfolio.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
