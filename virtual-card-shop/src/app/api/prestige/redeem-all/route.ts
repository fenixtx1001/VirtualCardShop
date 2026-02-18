// src/app/api/prestige/redeem-all/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { redeemPrestigeForProductSets } from "@/lib/prestige";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();

    const claimable = await prisma.productSetPrestige.findMany({
      where: {
        userId: user.id,
        timesCompleted: { gt: 0 },
        // Prisma doesn't support direct field-to-field comparisons here,
        // so we filter in JS below.
      },
      select: { productSetId: true, timesCompleted: true, claimedCompletions: true },
      take: 5000,
    });

    const productSetIds = claimable
      .filter((r) => (r.timesCompleted ?? 0) > (r.claimedCompletions ?? 0))
      .map((r) => r.productSetId);

    if (productSetIds.length === 0) {
      const me = await prisma.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });
      return NextResponse.json(
        { ok: true, totalAwardedCents: 0, awards: [], balanceCents: me?.balanceCents ?? 0 },
        { status: 200 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      return redeemPrestigeForProductSets({ tx, userId: user.id, productSetIds });
    });

    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });

    return NextResponse.json(
      {
        ok: true,
        ...result,
        balanceCents: me?.balanceCents ?? 0,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to redeem all prestige." }, { status: 500 });
  }
}
