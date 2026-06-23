import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { processAuctionLifecycle } from "@/lib/auction-engine";
import { calculateBidIncrementCents, calculateMinimumNextBidCents } from "@/lib/auctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { auctionId?: string } }
  | { params: Promise<{ auctionId?: string }> };

type BidBody = {
  maxBidCents?: unknown;
};

async function getAuctionId(ctx: Ctx): Promise<number | null> {
  const params = await Promise.resolve(ctx.params);
  const id = Number(params.auctionId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toPositiveCents(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function getActiveHumanReservedBidTotalCents(userId: string, excludeAuctionId?: number) {
  const winningBids = await prisma.auction.findMany({
    where: {
      status: "ACTIVE",
      winnerUserId: userId,
      ...(excludeAuctionId ? { id: { not: excludeAuctionId } } : {}),
    },
    select: {
      id: true,
      bids: {
        where: {
          userId,
          maxBidCents: {
            not: null,
          },
        },
        orderBy: {
          maxBidCents: "desc",
        },
        take: 1,
        select: {
          maxBidCents: true,
        },
      },
    },
  });

  return winningBids.reduce((sum, auction) => {
    return sum + (auction.bids[0]?.maxBidCents ?? 0);
  }, 0);
}

function getProxyBidResult(input: {
  challengerMaxBidCents: number;
  currentWinnerMaxBidCents: number;
  currentBidCents: number;
  startingBidCents: number;
}): {
  winner: "challenger" | "current";
  visibleBidCents: number;
} {
  const currentBidCents = Math.max(0, input.currentBidCents);
  const currentWinnerMaxBidCents = Math.max(0, input.currentWinnerMaxBidCents || 0);
  const challengerMaxBidCents = Math.max(0, input.challengerMaxBidCents);

  const minimumNextBidCents = calculateMinimumNextBidCents(
    currentBidCents,
    input.startingBidCents
  );

  if (challengerMaxBidCents > currentWinnerMaxBidCents) {
    const visibleBidCents =
      currentWinnerMaxBidCents > 0
        ? Math.min(
            challengerMaxBidCents,
            currentWinnerMaxBidCents + calculateBidIncrementCents(currentWinnerMaxBidCents)
          )
        : Math.max(minimumNextBidCents, input.startingBidCents);

    return {
      winner: "challenger",
      visibleBidCents: Math.min(
        challengerMaxBidCents,
        Math.max(visibleBidCents, minimumNextBidCents)
      ),
    };
  }

  const visibleBidCents = Math.min(
    currentWinnerMaxBidCents,
    challengerMaxBidCents + calculateBidIncrementCents(challengerMaxBidCents)
  );

  return {
    winner: "current",
    visibleBidCents: Math.max(currentBidCents, visibleBidCents),
  };
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const auctionId = await getAuctionId(ctx);

    if (!auctionId) {
      return NextResponse.json({ error: "Invalid auction." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as BidBody;
    const maxBidCents = toPositiveCents(body.maxBidCents);

    if (!maxBidCents) {
      return NextResponse.json({ error: "Enter a valid bid amount." }, { status: 400 });
    }

    await processAuctionLifecycle({ auctionId, limit: 1 });

    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: {
          id: auctionId,
        },
        include: {
          bids: {
            orderBy: [
              {
                amountCents: "desc",
              },
              {
                createdAt: "asc",
              },
              {
                id: "asc",
              },
            ],
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!auction) {
        throw new Error("Auction not found.");
      }

      if (auction.status !== "ACTIVE") {
        throw new Error("This auction is no longer active.");
      }

      if (auction.endsAt <= new Date()) {
        throw new Error("This auction has ended.");
      }

      if (auction.sellerUserId === user.id) {
        throw new Error("You cannot bid on your own auction.");
      }

      const currentWinningBid = auction.bids[0] ?? null;
      const currentWinnerUserId =
        currentWinningBid?.bidderType === "HUMAN" ? currentWinningBid.userId : null;
      const currentWinnerMaxBidCents =
        currentWinningBid?.maxBidCents ?? currentWinningBid?.amountCents ?? 0;

      const minimumNextBidCents = calculateMinimumNextBidCents(
        auction.currentBidCents,
        auction.startingBidCents
      );

      if (maxBidCents < minimumNextBidCents) {
        throw new Error(`Your max bid must be at least ${minimumNextBidCents} cents.`);
      }

      const reservedElsewhere = await getActiveHumanReservedBidTotalCents(user.id, auction.id);
      const availableForBid = user.balanceCents - reservedElsewhere;

      if (maxBidCents > availableForBid) {
        throw new Error("You do not have enough available cash for that max bid.");
      }

      if (
        currentWinnerUserId === user.id &&
        currentWinnerMaxBidCents &&
        maxBidCents <= currentWinnerMaxBidCents
      ) {
        throw new Error("Your new max bid must be higher than your existing max bid.");
      }

      const proxyResult = getProxyBidResult({
        challengerMaxBidCents: maxBidCents,
        currentWinnerMaxBidCents,
        currentBidCents: auction.currentBidCents,
        startingBidCents: auction.startingBidCents,
      });

      const visibleBidCents = proxyResult.visibleBidCents;
      const challengerWins = proxyResult.winner === "challenger";

      await tx.auctionBid.create({
        data: {
          auctionId: auction.id,
          userId: user.id,
          bidderType: "HUMAN",
          amountCents: challengerWins ? visibleBidCents : maxBidCents,
          maxBidCents,
        },
      });

      if (!challengerWins && currentWinningBid) {
        if (currentWinningBid.bidderType === "HUMAN" && currentWinningBid.userId) {
          await tx.auctionBid.create({
            data: {
              auctionId: auction.id,
              userId: currentWinningBid.userId,
              bidderType: "HUMAN",
              amountCents: visibleBidCents,
              maxBidCents: currentWinnerMaxBidCents,
            },
          });
        } else {
          await tx.auctionBid.create({
            data: {
              auctionId: auction.id,
              bidderType: "DUMMY",
              dummyBidderName: currentWinningBid.dummyBidderName || "Private Bidder",
              amountCents: visibleBidCents,
              maxBidCents: currentWinnerMaxBidCents,
            },
          });
        }
      }

      const updatedAuction = await tx.auction.update({
        where: {
          id: auction.id,
        },
        data: {
          currentBidCents: Math.max(auction.currentBidCents, visibleBidCents),
          winnerUserId: challengerWins ? user.id : currentWinnerUserId,
        },
      });

      return updatedAuction;
    });

    return NextResponse.json({
      auction: {
        id: result.id,
        currentBidCents: result.currentBidCents,
        winnerUserId: result.winnerUserId,
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 400;
    const message = error instanceof Error ? error.message : "Unable to place bid.";
    return NextResponse.json({ error: message }, { status });
  }
}