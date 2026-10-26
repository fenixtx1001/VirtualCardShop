import { AuctionStatus, Prisma } from "@prisma/client";
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
    const where: Prisma.AuctionWhereInput = {
      status: statusWhere,
      sellerUserId: view === "mine" ? user.id : { not: user.id },
      ...(gradeFilter !== null ? { grade: gradeFilter } : {}),
      ...(sport ? {
        card: {
          OR: [
            { set: { sport: { contains: sport, mode: "insensitive" } } },
            { productSet: { product: { sport: { contains: sport, mode: "insensitive" } } } },
          ],
        },
      } : {}),
    };
    // Filter at the database, before the visible-page limit is applied.
    // This avoids hiding matching older auctions behind the old 200-row cap.
    if (search) {
      const cardSearch: Prisma.CardWhereInput = {
        OR: [
          { player: { contains: search, mode: "insensitive" } },
          { team: { contains: search, mode: "insensitive" } },
          { cardNumber: { contains: search, mode: "insensitive" } },
          { subset: { contains: search, mode: "insensitive" } },
          { variant: { contains: search, mode: "insensitive" } },
          { set: { brand: { contains: search, mode: "insensitive" } } },
          { set: { sport: { contains: search, mode: "insensitive" } } },
          { productSet: { name: { contains: search, mode: "insensitive" } } },
          { productSet: { product: { brand: { contains: search, mode: "insensitive" } } } },
        ],
      };
      const existingCardFilter = where.card;
      where.card = existingCardFilter
        ? { AND: [existingCardFilter as Prisma.CardWhereInput, cardSearch] }
        : cardSearch;
    }

    const sqlSorted = sort !== "bestDeal" && sort !== "hottest";
    const sortOrder: Prisma.AuctionOrderByWithRelationInput[] =
      sort === "newest" ? [{ createdAt: "desc" }] :
      sort === "highestBid" ? [{ currentBidCents: "desc" }] :
      sort === "lowestBid" ? [{ currentBidCents: "asc" }] :
      sort === "highestValue" ? [{ valueBasisCents: "desc" }] :
      [{ endsAt: "asc" }];
    const [total, active, ended, sums, winningCount, globalReady, globalUnsold, completedTotals] =
      await Promise.all([
        prisma.auction.count({ where }),
        prisma.auction.count({ where: { AND: [where, { status: "ACTIVE" }] } }),
        prisma.auction.count({ where: { AND: [where, { status: "ENDED" }] } }),
        prisma.auction.aggregate({ where, _sum: { currentBidCents: true } }),
        prisma.auction.count({ where: { AND: [where, { winnerUserId: user.id }] } }),
        prisma.auction.aggregate({
          where: { sellerUserId: user.id, status: "ENDED", collectedAt: null },
          _count: { _all: true }, _sum: { currentBidCents: true },
        }),
        prisma.auction.count({
          where: {
            sellerUserId: user.id, status: "ENDED", collectedAt: null,
            currentBidCents: { lte: 0 },
          },
        }),
        requestedStatus === "COLLECTED"
          ? prisma.auction.aggregate({
            where, _sum: { currentBidCents: true },
            _avg: { currentBidCents: true },
            _max: { currentBidCents: true },
          })
          : Promise.resolve(null),
      ]);

    const auctions = await prisma.auction.findMany({
      where,
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
      orderBy: sortOrder,
      take: sqlSorted ? limit : 2000,
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
      ;

    // Percentage-based rankings are derived; sort the bounded candidate set.
    if (!sqlSorted) {
      mapped.sort((a, b) => sort === "bestDeal"
        ? a.percentOfValueBps - b.percentOfValueBps
        : b.percentOfValueBps - a.percentOfValueBps);
    }

    const rows = mapped.slice(0, limit).map(({ searchableText, sportValue, ...auction }) => auction);
    const summary = {
      view,
      total, active, ended,
      readyToCollect: view === "mine" ? ended : 0,
      currentBidTotalCents: sums._sum.currentBidCents ?? 0,
      winningCount,
      visibleCount: rows.length,
      visibleLimit: limit,
      truncatedSort: !sqlSorted && total > 2000,
      globalReadyToCollect: globalReady._count._all,
      globalReadyPayoutCents: globalReady._sum.currentBidCents ?? 0,
      globalUnsoldCount: globalUnsold,
      completedTotals: completedTotals ? {
        count: total,
        totalCents: completedTotals._sum.currentBidCents ?? 0,
        averageCents: Math.round(completedTotals._avg.currentBidCents ?? 0),
        highCents: completedTotals._max.currentBidCents ?? 0,
      } : null,
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