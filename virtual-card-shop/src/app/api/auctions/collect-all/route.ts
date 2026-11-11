import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { processAuctionLifecycle } from "@/lib/auction-engine";
import {
  collectEndedAuctionTx, syncCollectedPortfolioSnapshots,
  type AuctionPortfolioDeltas,
} from "@/lib/auction-settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep settlements bounded and atomic to protect Neon/serverless timeouts.
// The client follows the cursor for large backlogs (including 100+ auctions).
const BATCH_SIZE = 8;

export async function POST(req: Request) {
  try {
    const startedAt = Date.now();
    const user = await requireUser();
    const body = await req.json().catch(() => ({})) as { afterId?: unknown };
    const candidate = Number(body.afterId ?? 0);
    if (!Number.isSafeInteger(candidate) || candidate < 0)
      return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
    const afterId = candidate;

    // Include auctions that have expired but are still ACTIVE because no
    // visitor has triggered lifecycle processing. Work only on the current
    // seller's next eight candidates, not 50 auctions across all of VCS.
    const now = new Date();
    const pendingWhere = {
      sellerUserId: user.id,
      collectedAt: null,
      OR: [
        { status: "ENDED" as const },
        { status: "ACTIVE" as const, endsAt: { lte: now } },
      ],
    };
    const eligible = await prisma.auction.findMany({
      where: { ...pendingWhere, id: { gt: afterId } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE + 1,
      select: { id: true, status: true },
    });

    const selected = eligible.slice(0, BATCH_SIZE);
    if (!selected.length) {
      const remaining = await prisma.auction.count({ where: pendingWhere });
      return NextResponse.json({
        results: [], settled: 0, payoutCents: 0,
        unsoldReturned: 0, failed: 0,
        nextCursor: afterId, hasMore: false, remaining,
        durationMs: Date.now() - startedAt,
      });
    }

    for (const auction of selected) {
      if (auction.status === "ACTIVE") {
        await processAuctionLifecycle({ auctionId: auction.id, limit: 1 });
      }
    }
    const lifecycleMs = Date.now() - startedAt;

    const results = await prisma.$transaction(async tx => {
      const changedPortfolios = new Set<string>();
      const deltas: AuctionPortfolioDeltas = new Map();
      const outcomes = [];
      for (const auction of selected) {
        outcomes.push(await collectEndedAuctionTx(
          tx, user.id, auction.id, changedPortfolios, deltas
        ));
      }
      // Exact, aggregated portfolio deltas avoid scanning the entire
      // collection every eight auctions. Stale/missing snapshots fall back
      // to the existing full calculation automatically.
      await syncCollectedPortfolioSnapshots(tx, changedPortfolios, deltas);
      return outcomes;
    }, { maxWait: 10000, timeout: 60000 });

    const remaining = await prisma.auction.count({ where: pendingWhere });
    return NextResponse.json({
      results,
      settled: results.filter(row => row.ok).length,
      payoutCents: results.reduce((sum, row) => sum + (row.ok ? row.salePriceCents ?? 0 : 0), 0),
      unsoldReturned: results.filter(row => row.ok && row.buyerType === "NONE").length,
      failed: results.filter(row => !row.ok).length,
      nextCursor: selected[selected.length - 1].id,
      hasMore: eligible.length > BATCH_SIZE,
      remaining,
      durationMs: Date.now() - startedAt,
      lifecycleMs,
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({
      error: status === 401 ? "Sign in to collect auctions." :
        error instanceof Error ? error.message : "Unable to collect auctions.",
    }, { status });
  }
}
