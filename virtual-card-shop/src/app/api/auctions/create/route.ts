import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { RAW_GRADE, bookValueToCents } from "@/lib/grading";
import {
  AUCTION_DURATION_MS,
  calculateAuctionValueBasisCents,
  calculateHiddenDummyMaxBidCents,
  calculateStartingBidCents,
} from "@/lib/auctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateAuctionBody = {
  cardId?: unknown;
  grade?: unknown;
};

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function toAuctionGrade(value: unknown): number | null {
  const n = Number(value ?? RAW_GRADE);
  if (!Number.isInteger(n)) return null;
  if (n === RAW_GRADE) return RAW_GRADE;
  if ([6, 7, 8, 9, 10].includes(n)) return n;
  return null;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as CreateAuctionBody;

    const cardId = toPositiveInt(body.cardId);
    const grade = toAuctionGrade(body.grade);

    if (!cardId || grade === null) {
      return NextResponse.json({ error: "Invalid auction item." }, { status: 400 });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + AUCTION_DURATION_MS);

    const result = await prisma.$transaction(async (tx) => {
      const ownership = await tx.cardOwnership.findUnique({
        where: {
          userId_cardId_grade: {
            userId: user.id,
            cardId,
            grade,
          },
        },
        include: {
          card: {
            include: {
              productSet: true,
              set: true,
            },
          },
        },
      });

      if (!ownership || ownership.quantity <= 0) {
        throw new Error("You do not own this card in that grade.");
      }

      const lockedQuantity = ownership.auctionLockedQuantity ?? 0;
      const availableQuantity = ownership.quantity - lockedQuantity;

      if (availableQuantity <= 0) {
        throw new Error("This card is already locked in another auction.");
      }

      const rawBookValueCents = bookValueToCents(ownership.card.bookValue);

      const valueBasis = calculateAuctionValueBasisCents({
        rawBookValueCents,
        grade,
        cardOverride: ownership.card.gradeabilityOverride,
        productSetDefault: ownership.card.productSet?.defaultGradeability ?? null,
      });

      const valueBasisCents = Math.max(1, valueBasis.valueBasisCents);
      const startingBidCents = calculateStartingBidCents(valueBasisCents);
      const dummyMax = calculateHiddenDummyMaxBidCents(valueBasisCents);

      const auction = await tx.auction.create({
        data: {
          sellerUserId: user.id,
          cardId,
          grade,
          quantity: 1,
          startingBidCents,
          currentBidCents: 0,
          valueBasisCents,
          hiddenDummyMaxBidCents: dummyMax.hiddenDummyMaxBidCents,
          slabPremiumBps: valueBasis.slabPremiumBps,
          status: "ACTIVE",
          endsAt,
        },
        include: {
          card: {
            include: {
              productSet: {
                include: {
                  product: true,
                },
              },
              set: true,
            },
          },
        },
      });

      await tx.cardOwnership.update({
        where: {
          id: ownership.id,
        },
        data: {
          auctionLockedQuantity: {
            increment: 1,
          },
        },
      });

      return auction;
    });

    return NextResponse.json({
      auction: {
        id: result.id,
        cardId: result.cardId,
        grade: result.grade,
        startingBidCents: result.startingBidCents,
        currentBidCents: result.currentBidCents,
        valueBasisCents: result.valueBasisCents,
        status: result.status,
        endsAt: result.endsAt.toISOString(),
        card: {
          id: result.card.id,
          player: result.card.player,
          cardNumber: result.card.cardNumber,
          team: result.card.team,
          subset: result.card.subset,
          variant: result.card.variant,
          frontImageUrl: result.card.frontImageUrl,
          set: {
            id: result.card.set.id,
            year: result.card.set.year,
            brand: result.card.set.brand,
            sport: result.card.set.sport,
          },
          productSet: result.card.productSet
            ? {
                id: result.card.productSet.id,
                name: result.card.productSet.name,
                product: result.card.productSet.product
                  ? {
                      id: result.card.productSet.product.id,
                      year: result.card.productSet.product.year,
                      brand: result.card.productSet.product.brand,
                      sport: result.card.productSet.product.sport,
                    }
                  : null,
              }
            : null,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create auction.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}