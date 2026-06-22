import { AuctionStatus } from "@prisma/client";
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

type AuctionView = "mine" | "house";
type AuctionSort =
  | "endingSoonest"
  | "newest"
  | "highestBid"
  | "lowestBid"
  | "highestValue"
  | "bestDeal"
  | "hottest";

type AuctionStatusFilter = "ACTIVE" | "ENDED" | "COLLECTED" | "CANCELLED";

function getParam(req: Request, key: string): string | null {
  try {
    const url = new URL(req.url);
    const value = url.searchParams.get(key);
    return value && value.trim().length ? value.trim() : null;
  } catch {
    return null;
  }
}

function normalizeView(value: string | null): AuctionView {
  return value === "house" ? "house" : "mine";
}

function normalizeSort(value: string | null): AuctionSort {
  if (
    value === "newest" ||
    value === "highestBid" ||
    value === "lowestBid" ||
    value === "highestValue" ||
    value === "bestDeal" ||
    value === "hottest"
  ) {
    return value;
  }

  return "endingSoonest";
}

function normalizeStatus(value: string | null): AuctionStatusFilter | null {
  if (value === "ACTIVE" || value === "ENDED" || value === "COLLECTED" || value === "CANCELLED") {
    return value;
  }

  return null;
}

function parseLimit(value: string | null): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return 48;
  return Math.min(100, n);
}

function includesText(value: unknown, query: string): boolean {
  return String(value ?? "").toLowerCase().includes(query);
}

function compareNumbers(a: number, b: number): number {
  return a === b ? 0 : a > b ? 1 : -1;
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

function compactCardTitle(input: {
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  cardNumber: string;
}) {
  const extras = [input.team, input.subset, input.variant].filter(Boolean).join(" · ");
  return extras ? `${input.player} · ${extras} · #${input.cardNumber}` : `${input.player} · #${input.cardNumber}`;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();

    await processAuctionLifecycle({ limit: 50 });

    const view = normalizeView(getParam(req, "view"));
    const sort = normalizeSort(getParam(req, "sort"));
    const limit = parseLimit(getParam(req, "limit"));
    const search = (getParam(req, "search") ?? "").toLowerCase();
    const sport = (getParam(req, "sport") ?? "").toLowerCase();
    const requestedStatus = normalizeStatus(getParam(req, "status"));
    const gradeParam = getParam(req, "grade");

    const gradeFilter =
      gradeParam === null || gradeParam === "all"
        ? null
        : Number.isInteger(Number(gradeParam))
          ? Number(gradeParam)
          : null;

    const statusWhere = requestedStatus
      ? requestedStatus
      : {
          in: [AuctionStatus.ACTIVE, AuctionStatus.ENDED],
        };

    const now = new Date();

    const auctions = await prisma.auction.findMany({
      where: {
        status: statusWhere,
        sellerUserId: view === "mine" ? user.id : { not: user.id },
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
            amountCents: "desc",
          },
          take: 1,
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
      orderBy: {
        endsAt: "asc",
      },
      take: 200,
    });

    const mapped = auctions
      .map((auction) => {
        const highBid = auction.bids[0] ?? null;
        const percentOfValueBps = getPercentOfValueBps({
          amountCents: auction.currentBidCents,
          valueBasisCents: auction.valueBasisCents,
        });
        const tier = getAuctionTierForPercent(percentOfValueBps);

        const highBidder =
          highBid?.bidderType === "DUMMY"
            ? highBid.dummyBidderName || "Private Bidder"
            : highBid?.user?.name || highBid?.user?.email || null;

        const product = auction.card.productSet?.product ?? null;
        const sportValue = product?.sport ?? auction.card.set.sport ?? "";

        return {
          id: auction.id,
          sellerUserId: auction.sellerUserId,
          sellerName: auction.seller.name || auction.seller.email || "Collector",
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
          hasEnded: auction.endsAt <= now || auction.status !== "ACTIVE",
          canCollect: view === "mine" && auction.status === "ENDED" && auction.collectedAt === null,
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
          searchableText: [
            auction.card.player,
            auction.card.team,
            auction.card.cardNumber,
            auction.card.subset,
            auction.card.variant,
            auction.card.set.brand,
            auction.card.set.sport,
            auction.card.productSet?.name,
            product?.brand,
            product?.sport,
            product?.year,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
          sportValue: sportValue.toLowerCase(),
        };
      })
      .filter((auction) => {
        if (search && !includesText(auction.searchableText, search)) return false;
        if (sport && !includesText(auction.sportValue, sport)) return false;
        if (gradeFilter !== null && auction.grade !== gradeFilter) return false;
        return true;
      });

    mapped.sort((a, b) => {
      switch (sort) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "highestBid":
          return compareNumbers(b.currentBidCents, a.currentBidCents);
        case "lowestBid":
          return compareNumbers(a.currentBidCents, b.currentBidCents);
        case "highestValue":
          return compareNumbers(b.valueBasisCents, a.valueBasisCents);
        case "bestDeal":
          return compareNumbers(a.percentOfValueBps, b.percentOfValueBps);
        case "hottest":
          return compareNumbers(b.percentOfValueBps, a.percentOfValueBps);
        case "endingSoonest":
        default:
          return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
      }
    });

    // Keep the visible card list capped for performance, but calculate the dashboard
    // summary from the full filtered auction set. Otherwise the stat cards get
    // capped at the UI limit, which makes "Active" look stuck at 72/100/etc.
    const summarySource = mapped.map(({ searchableText, sportValue, ...auction }) => auction);
    const rows = summarySource.slice(0, limit);

    const summary = {
      view,
      total: summarySource.length,
      active: summarySource.filter((auction) => auction.status === "ACTIVE").length,
      ended: summarySource.filter((auction) => auction.status === "ENDED").length,
      readyToCollect: summarySource.filter((auction) => auction.canCollect).length,
      currentBidTotalCents: summarySource.reduce((sum, auction) => sum + auction.currentBidCents, 0),
      winningCount: summarySource.filter((auction) => auction.isWinning).length,
      visibleCount: rows.length,
      visibleLimit: limit,
    };

    const recentBids = await prisma.auctionBid.findMany({
      where: {
        auction: {
          sellerUserId: view === "mine" ? user.id : { not: user.id },
          status: statusWhere,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        auction: {
          include: {
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
          },
        },
      },
    });

    const recentActivity = recentBids.map((bid) => {
      const auction = bid.auction;
      const card = auction.card;
      const amountPercentOfValueBps = getPercentOfValueBps({
        amountCents: bid.amountCents,
        valueBasisCents: auction.valueBasisCents,
      });
      const tier = getAuctionTierForPercent(amountPercentOfValueBps);
      const product = card.productSet?.product ?? null;

      return {
        id: bid.id,
        auctionId: auction.id,
        cardId: card.id,
        amountCents: bid.amountCents,
        maxBidCents: bid.userId === user.id ? bid.maxBidCents : null,
        percentOfValueBps: amountPercentOfValueBps,
        tier,
        tierLabel: formatAuctionTierLabel(tier),
        bidderType: bid.bidderType,
        bidderName:
          bid.bidderType === "DUMMY"
            ? bid.dummyBidderName || "Private Bidder"
            : bid.user?.name || bid.user?.email || "Collector",
        isMine: bid.userId === user.id,
        createdAt: bid.createdAt.toISOString(),
        auctionStatus: auction.status,
        timeLeftLabel: timeLeftLabel(auction.endsAt),
        grade: auction.grade,
        gradeLabel: labelVcsGrade(auction.grade),
        card: {
          id: card.id,
          title: compactCardTitle({
            player: card.player,
            team: card.team,
            subset: card.subset,
            variant: card.variant,
            cardNumber: card.cardNumber,
          }),
          player: card.player,
          cardNumber: card.cardNumber,
          frontImageUrl: card.frontImageUrl,
          set: {
            year: product?.year ?? card.set.year,
            brand: product?.brand ?? card.set.brand,
            sport: product?.sport ?? card.set.sport,
            name: card.productSet?.name ?? null,
          },
        },
      };
    });

    return NextResponse.json({
      summary,
      auctions: rows,
      recentActivity,
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Unable to load auctions.";
    return NextResponse.json({ error: message }, { status });
  }
}