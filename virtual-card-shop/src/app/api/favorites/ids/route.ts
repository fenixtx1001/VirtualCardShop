import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const limit = clampInt(parseInt(url.searchParams.get("limit") ?? "5000", 10), 1, 20000);

    const rows = await prisma.cardFavorite.findMany({
      where: { userId: user.id },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { cardId: true },
    });

    return NextResponse.json({ ok: true, ids: rows.map((r) => r.cardId) }, { status: 200 });
  } catch (e: any) {
    // Keep this short to avoid the “wall of text” problem
    return NextResponse.json({ ok: false, error: "Failed to load favorites." }, { status: 500 });
  }
}
