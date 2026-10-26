import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { processAuctionLifecycle } from "@/lib/auction-engine";
import {
  collectEndedAuctionTx, syncCollectedPortfolioSnapshots,
} from "@/lib/auction-settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deliberately bounded: avoids Neon/serverless timeouts and one valuation pass
// per auction. The UI advances the cursor until the backlog has been processed.
const BATCH_SIZE = 8;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({})) as { afterId?: unknown };
    const candidate = Number(body.afterId ?? 0);
    if (!Number.isSafeInteger(candidate) || candidate < 0)
      return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
    const afterId = candidate;

    if (!afterId) await processAuctionLifecycle({ limit: 50 });
    const eligible = await prisma.auction.findMany({
      where: {
        sellerUserId: user.id, status: "ENDED", collectedAt: null,
        id: { gt: afterId },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE + 1,
      select: { id: true },
    });

    const selected = eligible.slice(0, BATCH_SIZE);
    if (!selected.length) {
      const remaining = await prisma.auction.count({
        where: { sellerUserId: user.id, status: "ENDED", collectedAt: null },
      });
      return NextResponse.json({
        results: [], settled: 0, payoutCents: 0,
        unsoldReturned: 0, failed: 0,
        nextCursor: afterId, hasMore: false, remaining,
      });
    }

    const results = await prisma.$transaction(async tx => {
      const changedPortfolios = new Set<string>();
      const outcomes = [];
      for (const auction of selected) {
        outcomes.push(await collectEndedAuctionTx(tx, user.id, auction.id, changedPortfolios));
      }
      // Once per affected collector per batch, rather than for every card.
      await syncCollectedPortfolioSnapshots(tx, changedPortfolios);
      return outcomes;
    }, { maxWait: 10000, timeout: 60000 });

    const remaining = await prisma.auction.count({
      where: { sellerUserId: user.id, status: "ENDED", collectedAt: null },
    });
    return NextResponse.json({
      results,
      settled: results.filter(row => row.ok).length,
      payoutCents: results.reduce((sum, row) => sum + (row.ok ? row.salePriceCents ?? 0 : 0), 0),
      unsoldReturned: results.filter(row => row.ok && row.buyerType === "NONE").length,
      failed: results.filter(row => !row.ok).length,
      nextCursor: selected[selected.length - 1].id,
      hasMore: eligible.length > BATCH_SIZE,
      remaining,
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({
      error: status === 401 ? "Sign in to collect auctions." :
        error instanceof Error ? error.message : "Unable to collect auctions.",
    }, { status });
  }
}
