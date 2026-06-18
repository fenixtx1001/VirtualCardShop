import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { calculateMinimumNextBidCents } from "@/lib/auctions";

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

function getNextVisibleBid(input: {
  challengerMaxBidCents: number;
  currentWinnerMaxBidCents: number | null;
  currentBidCents: number;
  startingBidCents: number;
}): {
  winner: "challenger" | "current";
  visibleBidCents: number;
} {
  const minimumNextBidCents = calculateMinimumNextBidCents(
    input.currentBidCents,
    input.startingBidCents
  );

  const currentWinnerMax = input.currentWinnerMaxBidCents ?? 0;
  const challengerMax = input.challengerMaxBidCents;

  if (challengerMax > currentWinnerMax) {
    const visibleBidCents =
      currentWinnerMax > 0
        ? Math.min(challengerMax, currentWinnerMax + calculateMinimumNextBidCents(currentWinnerMax, input.startingBidCents) - currentWinnerMax)
        : Math.max(minimumNextBidCents, input.startingBidCents);

    return {
      winner: "challenger",
      visibleBidCents: Math.min(challengerMax, Math.max(visibleBidCents, minimumNextBidCents)),
    };
  }

  const visibleBidCents = Math.min(
    currentWinnerMax,
    challengerMax + calculateMinimumNextBidCents(challengerMax, input.startingBidCents) - challengerMax
  );

  return {
    winner: "current",
    visibleBidCents: Math.max(input.currentBidCents, visibleBidCents),
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
        currentWinningBid?.bidderType === "HUMAN" ? currentWinningBid.maxBidCents : null;

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

      if (currentWinnerUserId === user.id && currentWinnerMaxBidCents && maxBidCents <= currentWinnerMaxBidCents) {
        throw new Error("Your new max bid must be higher than your existing max bid.");
      }

      const proxyResult = getNextVisibleBid({
        challengerMaxBidCents: maxBidCents,
        currentWinnerMaxBidCents,
        currentBidCents: auction.currentBidCents,
        startingBidCents: auction.startingBidCents,
      });

      const visibleBidCents = proxyResult.visibleBidCents;
      const winnerUserId = proxyResult.winner === "challenger" ? user.id : currentWinnerUserId;

      await tx.auctionBid.create({
        data: {
          auctionId: auction.id,
          userId: user.id,
          bidderType: "HUMAN",
          amountCents: proxyResult.winner === "challenger" ? visibleBidCents : maxBidCents,
          maxBidCents,
        },
      });

      if (proxyResult.winner === "current" && currentWinnerUserId) {
        await tx.auctionBid.create({
          data: {
            auctionId: auction.id,
            userId: currentWinnerUserId,
            bidderType: "HUMAN",
            amountCents: visibleBidCents,
            maxBidCents: currentWinnerMaxBidCents,
          },
        });
      }

      const updatedAuction = await tx.auction.update({
        where: {
          id: auction.id,
        },
        data: {
          currentBidCents: Math.max(auction.currentBidCents, visibleBidCents),
          winnerUserId,
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