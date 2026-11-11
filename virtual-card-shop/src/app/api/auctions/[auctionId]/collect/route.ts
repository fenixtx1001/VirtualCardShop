import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { processAuctionLifecycle } from "@/lib/auction-engine";
import {
  collectEndedAuctionTx, syncCollectedPortfolioSnapshots,
} from "@/lib/auction-settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ auctionId?: string }> | { auctionId?: string } };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { auctionId: raw } = await ctx.params;
    const auctionId = Number(raw);
    if (!Number.isSafeInteger(auctionId) || auctionId <= 0)
      return NextResponse.json({ error: "Invalid auction." }, { status: 400 });

    await processAuctionLifecycle({ auctionId, limit: 1 });
    const result = await prisma.$transaction(async tx => {
      const changed = new Set<string>();
      const outcome = await collectEndedAuctionTx(tx, user.id, auctionId, changed);
      if (outcome.ok) await syncCollectedPortfolioSnapshots(tx, changed);
      return outcome;
    }, { maxWait: 10000, timeout: 45000 });

    if (!result.ok)
      return NextResponse.json({ error: result.error }, {
        status: result.error === "Already collected." ? 409 : 400,
      });
    return NextResponse.json({
      auction: {
        id: auctionId, status: result.status, collectedAt: result.collectedAt,
        salePriceCents: result.salePriceCents, buyerType: result.buyerType,
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({
      error: status === 401 ? "Sign in to collect." :
        error instanceof Error ? error.message : "Unable to collect auction.",
    }, { status });
  }
}
