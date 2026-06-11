// src/app/api/prestige/redeem-all/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { createFinancialTransaction } from "@/lib/financial-transactions";
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
      },
      select: { productSetId: true, timesCompleted: true, claimedCompletions: true },
      take: 5000,
    });

    const productSetIds = claimable
      .filter((r) => (r.timesCompleted ?? 0) > (r.claimedCompletions ?? 0))
      .map((r) => r.productSetId);

    if (productSetIds.length === 0) {
      const me = await prisma.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });

      return NextResponse.json(
        { ok: true, totalAwardedCents: 0, awards: [], balanceCents: me?.balanceCents ?? 0 },
        { status: 200 }
      );
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const result = await redeemPrestigeForProductSets({
        tx,
        userId: user.id,
        productSetIds,
      });

      const me = await tx.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });

      if (result.totalAwardedCents > 0) {
        await createFinancialTransaction({
          tx,
          userId: user.id,
          category: "PRESTIGE_REWARD",
          amountCents: result.totalAwardedCents,
          description: `Claimed ${result.awards.length} prestige reward${
            result.awards.length === 1 ? "" : "s"
          }`,
          balanceAfterCents: me?.balanceCents ?? null,
          metadata: {
            totalAwardedCents: result.totalAwardedCents,
            awardCount: result.awards.length,
            awards: result.awards,
            productSetIds,
          },
        });
      }

      return {
        ...result,
        balanceCents: me?.balanceCents ?? 0,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        ...txResult,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to redeem all prestige." }, { status: 500 });
  }
}