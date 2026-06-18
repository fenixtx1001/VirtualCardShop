import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { processAuctionLifecycle } from "@/lib/auction-engine";
import {
  calculateMinimumNextBidCents,
  formatAuctionTierLabel,
  getAuctionTierForPercent,
  getPercentOfValueBps,
} from "@/lib/auctions";
import { labelVcsGrade } from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { auctionId?: string } }
  | { params: Promise<{ auctionId?: string }> };

async function getAuctionId(ctx: Ctx): Promise<number | null> {
  const params = await Promise.resolve(ctx.params);
  const id = Number(params.auctionId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function timeLeftLabel(endsAt: Date): string {
  const remainingMs = endsAt.getTime() - Date.now();

  if (remainingMs <= 0) return "Ended";

  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainderHours = hours % 24;
    return `${days}d ${remainderHours}h left`;
  }

  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const auctionId = await getAuctionId(ctx);

    if (!auctionId) {
      return NextResponse.json({ error: "Invalid auction." }, { status: 400 });
    }

    await processAuctionLifecycle({ auctionId, limit: 1 });

    const auction = await prisma.auction.findUnique({
      where: {
        id: auctionId,
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        winner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        card: {
          include: {
            set: true,
            productSet: {
              include: {
                product: true,
              },
            },
          },
        },
        bids: {
          orderBy: {
            createdAt: "desc",
          },
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
      return NextResponse.json({ error: "Auction not found." }, { status: 404 });
    }

    const percentOfValueBps = getPercentOfValueBps({
      amountCents: auction.currentBidCents,
      valueBasisCents: auction.valueBasisCents,
    });
    const tier = getAuctionTierForPercent(percentOfValueBps);
    const highBid = [...auction.bids].sort((a, b) => b.amountCents - a.amountCents)[0] ?? null;

    const highBidder =
      highBid?.bidderType === "DUMMY"
        ? highBid.dummyBidderName || "Private Bidder"
        : highBid?.user?.name || highBid?.user?.email || null;

    const product = auction.card.productSet?.product ?? null;

    return NextResponse.json({
      auction: {
        id: auction.id,
        sellerUserId: auction.sellerUserId,
        sellerName: auction.seller.name || auction.seller.email || "Collector",
        isMine: auction.sellerUserId === user.id,
        winnerUserId: auction.winnerUserId,
        winnerName: auction.winner?.name || auction.winner?.email || null,
        cardId: auction.cardId,
        grade: auction.grade,
        gradeLabel: labelVcsGrade(auction.grade),
        isSlab: auction.grade > 0,
        status: auction.status,
        startingBidCents: auction.startingBidCents,
        currentBidCents: auction.currentBidCents,
        valueBasisCents: auction.valueBasisCents,
        percentOfValueBps,
        tier,
        tierLabel: formatAuctionTierLabel(tier),
        minimumNextBidCents: calculateMinimumNextBidCents(
          auction.currentBidCents,
          auction.startingBidCents
        ),
        highBidder,
        isWinning: auction.winnerUserId === user.id || highBid?.userId === user.id,
        hasEnded: auction.endsAt <= new Date() || auction.status !== "ACTIVE",
        canBid: auction.status === "ACTIVE" && auction.sellerUserId !== user.id,
        canCollect:
          auction.sellerUserId === user.id && auction.status === "ENDED" && auction.collectedAt === null,
        createdAt: auction.createdAt.toISOString(),
        endsAt: auction.endsAt.toISOString(),
        endedAt: auction.endedAt?.toISOString() ?? null,
        collectedAt: auction.collectedAt?.toISOString() ?? null,
        timeLeftLabel: timeLeftLabel(auction.endsAt),
        card: {
          id: auction.card.id,
          player: auction.card.player,
          cardNumber: auction.card.cardNumber,
          team: auction.card.team,
          subset: auction.card.subset,
          variant: auction.card.variant,
          frontImageUrl: auction.card.frontImageUrl,
          backImageUrl: auction.card.backImageUrl,
          bookValue: auction.card.bookValue,
          set: {
            id: auction.card.set.id,
            year: auction.card.set.year,
            brand: auction.card.set.brand,
            sport: auction.card.set.sport,
          },
          productSet: auction.card.productSet
            ? {
                id: auction.card.productSet.id,
                name: auction.card.productSet.name,
                product: product
                  ? {
                      id: product.id,
                      year: product.year,
                      brand: product.brand,
                      sport: product.sport,
                    }
                  : null,
              }
            : null,
        },
        bids: auction.bids.map((bid) => ({
          id: bid.id,
          bidderType: bid.bidderType,
          bidderName:
            bid.bidderType === "DUMMY"
              ? bid.dummyBidderName || "Private Bidder"
              : bid.user?.name || bid.user?.email || "Collector",
          isMine: bid.userId === user.id,
          amountCents: bid.amountCents,
          maxBidCents: bid.userId === user.id ? bid.maxBidCents : null,
          createdAt: bid.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Unable to load auction.";
    return NextResponse.json({ error: message }, { status });
  }
}