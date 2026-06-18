import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { processAuctionLifecycle } from "@/lib/auction-engine";
import { getPercentOfValueBps } from "@/lib/auctions";
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

function cardDescription(input: {
  player: string;
  cardNumber: string;
  grade: number;
}): string {
  const gradeLabel = labelVcsGrade(input.grade);
  return `${input.player} #${input.cardNumber} (${gradeLabel})`;
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const auctionId = await getAuctionId(ctx);

    if (!auctionId) {
      return NextResponse.json({ error: "Invalid auction." }, { status: 400 });
    }

    await processAuctionLifecycle({ auctionId, limit: 1 });

    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: {
          id: auctionId,
        },
        include: {
          card: true,
          seller: true,
          bids: {
            orderBy: [
              {
                amountCents: "desc",
              },
              {
                createdAt: "asc",
              },
            ],
          },
        },
      });

      if (!auction) {
        throw new Error("Auction not found.");
      }

      if (auction.sellerUserId !== user.id) {
        throw new Error("Only the seller can collect this auction.");
      }

      if (auction.status === "COLLECTED") {
        throw new Error("This auction has already been collected.");
      }

      if (auction.status === "CANCELLED") {
        throw new Error("This auction was cancelled.");
      }

      if (auction.status !== "ENDED") {
        throw new Error("This auction has not ended yet.");
      }

      const winningBid = auction.bids[0] ?? null;
      const salePriceCents = Math.max(0, auction.currentBidCents || winningBid?.amountCents || 0);

      const ownership = await tx.cardOwnership.findUnique({
        where: {
          userId_cardId_grade: {
            userId: auction.sellerUserId,
            cardId: auction.cardId,
            grade: auction.grade,
          },
        },
      });

      if (!ownership || ownership.auctionLockedQuantity <= 0) {
        throw new Error("Seller inventory lock was not found for this auction.");
      }

      const description = cardDescription({
        player: auction.card.player,
        cardNumber: auction.card.cardNumber,
        grade: auction.grade,
      });

      if (salePriceCents <= 0 || !winningBid) {
        await tx.cardOwnership.update({
          where: {
            id: ownership.id,
          },
          data: {
            auctionLockedQuantity: {
              decrement: 1,
            },
          },
        });

        const collected = await tx.auction.update({
          where: {
            id: auction.id,
          },
          data: {
            status: "COLLECTED",
            endedAt: auction.endedAt ?? new Date(),
            collectedAt: new Date(),
            winnerUserId: null,
            currentBidCents: 0,
          },
        });

        return {
          auction: collected,
          salePriceCents: 0,
          buyerType: "NONE" as const,
          description,
        };
      }

      if (ownership.quantity <= 0) {
        throw new Error("Seller no longer owns this auction item.");
      }

      const buyerType = winningBid.bidderType === "DUMMY" ? "DUMMY" : "HUMAN";
      const buyerUserId = buyerType === "HUMAN" ? winningBid.userId : null;

      await tx.cardOwnership.update({
        where: {
          id: ownership.id,
        },
        data: {
          quantity: {
            decrement: 1,
          },
          auctionLockedQuantity: {
            decrement: 1,
          },
        },
      });

      if (buyerType === "HUMAN" && buyerUserId) {
        const buyer = await tx.user.findUnique({
          where: {
            id: buyerUserId,
          },
        });

        if (!buyer) {
          throw new Error("Winning buyer was not found.");
        }

        if (buyer.balanceCents < salePriceCents) {
          throw new Error("Winning buyer no longer has enough cash.");
        }

        await tx.user.update({
          where: {
            id: buyer.id,
          },
          data: {
            balanceCents: {
              decrement: salePriceCents,
            },
          },
        });

        await tx.financialTransaction.create({
          data: {
            userId: buyer.id,
            category: "AUCTION_PURCHASE",
            direction: "EXPENSE",
            amountCents: salePriceCents,
            description: `Auction purchase: ${description}`,
            balanceAfterCents: buyer.balanceCents - salePriceCents,
            metadata: {
              auctionId: auction.id,
              cardId: auction.cardId,
              grade: auction.grade,
            },
          },
        });

        await tx.cardOwnership.upsert({
          where: {
            userId_cardId_grade: {
              userId: buyer.id,
              cardId: auction.cardId,
              grade: auction.grade,
            },
          },
          create: {
            userId: buyer.id,
            cardId: auction.cardId,
            grade: auction.grade,
            quantity: 1,
            gradedAt: auction.grade > 0 ? new Date() : null,
          },
          update: {
            quantity: {
              increment: 1,
            },
          },
        });
      } else {
        await tx.shopInventory.upsert({
          where: {
            cardId: auction.cardId,
          },
          create: {
            cardId: auction.cardId,
            quantity: 1,
          },
          update: {
            quantity: {
              increment: 1,
            },
          },
        });
      }

      const sellerAfter = auction.seller.balanceCents + salePriceCents;

      await tx.user.update({
        where: {
          id: auction.sellerUserId,
        },
        data: {
          balanceCents: {
            increment: salePriceCents,
          },
        },
      });

      await tx.financialTransaction.create({
        data: {
          userId: auction.sellerUserId,
          category: "AUCTION_SALE",
          direction: "INCOME",
          amountCents: salePriceCents,
          description: `Auction sale: ${description}`,
          balanceAfterCents: sellerAfter,
          metadata: {
            auctionId: auction.id,
            cardId: auction.cardId,
            grade: auction.grade,
            buyerType,
          },
        },
      });

      await tx.cardSaleHistory.create({
        data: {
          cardId: auction.cardId,
          grade: auction.grade,
          saleType: "AUCTION",
          buyerType,
          sellerUserId: auction.sellerUserId,
          buyerUserId,
          salePriceCents,
          valueBasisCents: auction.valueBasisCents,
          percentOfValueBps: getPercentOfValueBps({
            amountCents: salePriceCents,
            valueBasisCents: auction.valueBasisCents,
          }),
          auctionId: auction.id,
        },
      });

      const collected = await tx.auction.update({
        where: {
          id: auction.id,
        },
        data: {
          status: "COLLECTED",
          endedAt: auction.endedAt ?? new Date(),
          collectedAt: new Date(),
          winnerUserId: buyerUserId,
          currentBidCents: salePriceCents,
        },
      });

      return {
        auction: collected,
        salePriceCents,
        buyerType,
        description,
      };
    });

    return NextResponse.json({
      auction: {
        id: result.auction.id,
        status: result.auction.status,
        collectedAt: result.auction.collectedAt?.toISOString() ?? null,
        salePriceCents: result.salePriceCents,
        buyerType: result.buyerType,
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 400;
    const message = error instanceof Error ? error.message : "Unable to collect auction.";
    return NextResponse.json({ error: message }, { status });
  }
}