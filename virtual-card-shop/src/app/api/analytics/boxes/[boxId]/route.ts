// src/app/api/analytics/boxes/[boxId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { boxId?: string } }
  | { params: Promise<{ boxId?: string }> };

function dollarsToCents(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function getProductDisplayName(product: {
  year: number | null;
  brand: string | null;
  sport: string | null;
}) {
  return [product.year, product.brand, product.sport].filter(Boolean).join(" ") || "Product";
}

function getStatus(args: {
  soldQuantity: number;
  quantityPulled: number;
  gradedFromBox: number;
}) {
  const { soldQuantity, quantityPulled, gradedFromBox } = args;
  const hasSold = soldQuantity > 0;
  const hasGraded = gradedFromBox > 0;
  const soldOut = quantityPulled > 0 && soldQuantity >= quantityPulled;

  if (hasGraded && soldOut) return "GRADED_SOLD_OUT";
  if (hasGraded && hasSold) return "GRADED_PARTIAL";
  if (hasGraded) return "GRADED";
  if (soldOut) return "SOLD_OUT";
  if (hasSold) return "PARTIAL";
  return "HOLDING";
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const params = await Promise.resolve(ctx.params);
    const boxId = Number(params?.boxId);

    if (!Number.isInteger(boxId) || boxId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid boxId" }, { status: 400 });
    }

    const box = await prisma.ripBox.findFirst({
      where: { id: boxId, userId: user.id },
      include: {
        product: {
          select: {
            id: true,
            year: true,
            brand: true,
            sport: true,
            boxImageUrl: true,
            packImageUrl: true,
          },
        },
        ripBoxCards: {
          include: {
            card: {
              select: {
                id: true,
                cardNumber: true,
                player: true,
                team: true,
                position: true,
                subset: true,
                variant: true,
                bookValue: true,
                frontImageUrl: true,
                backImageUrl: true,
                productSet: {
                  select: {
                    id: true,
                    name: true,
                    isBase: true,
                    isInsert: true,
                  },
                },
              },
            },
          },
        },
        gradingLinks: {
          select: {
            cardId: true,
            quantity: true,
            gradingOrder: {
              select: {
                id: true,
                status: true,
                feePaidCents: true,
                results: {
                  select: {
                    grade: true,
                    quantity: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!box) {
      return NextResponse.json({ ok: false, error: "Box not found" }, { status: 404 });
    }

    const cardIds = box.ripBoxCards.map((r) => r.cardId);

    const ownerships = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        cardId: { in: cardIds },
        quantity: { gt: 0 },
      },
      select: {
        cardId: true,
        grade: true,
        quantity: true,
      },
    });

    const ownershipByCardId = new Map<number, { raw: number; graded: number; total: number }>();

    for (const ownership of ownerships) {
      const current = ownershipByCardId.get(ownership.cardId) ?? { raw: 0, graded: 0, total: 0 };
      if (ownership.grade === 0) current.raw += ownership.quantity;
      else current.graded += ownership.quantity;
      current.total += ownership.quantity;
      ownershipByCardId.set(ownership.cardId, current);
    }

    const gradingByCardId = new Map<
      number,
      {
        quantity: number;
        feePaidCents: number;
        bestGrade: number | null;
        pendingQuantity: number;
        revealedQuantity: number;
      }
    >();

    for (const link of box.gradingLinks) {
      const current =
        gradingByCardId.get(link.cardId) ??
        {
          quantity: 0,
          feePaidCents: 0,
          bestGrade: null,
          pendingQuantity: 0,
          revealedQuantity: 0,
        };

      current.quantity += link.quantity;
      current.feePaidCents += link.gradingOrder.feePaidCents ?? 0;

      const results = link.gradingOrder.results ?? [];
      const canShowResults =
        link.gradingOrder.status === "REVEALED" || link.gradingOrder.status === "COMPLETED";

      const resultQty = results.reduce((sum, row) => sum + row.quantity, 0);

      if (canShowResults && results.length > 0) {
        current.revealedQuantity += resultQty;

        for (const result of results) {
          if (current.bestGrade === null || result.grade > current.bestGrade) {
            current.bestGrade = result.grade;
          }
        }
      } else {
        current.pendingQuantity += link.quantity;
      }

      gradingByCardId.set(link.cardId, current);
    }

    const cards = box.ripBoxCards.map((row) => {
      const bookValueCents = dollarsToCents(row.card.bookValue);
      const pulledValueCents = bookValueCents * row.quantity;
      const soldQuantity = row.soldQuantity ?? 0;
      const realizedCents = row.realizedCents ?? 0;
      const remainingPulledQuantity = Math.max(0, row.quantity - soldQuantity);
      const remainingValueCents = bookValueCents * remainingPulledQuantity;
      const totalPositionCents = remainingValueCents + realizedCents;
      const owned = ownershipByCardId.get(row.cardId) ?? { raw: 0, graded: 0, total: 0 };
      const grading = gradingByCardId.get(row.cardId) ?? {
        quantity: 0,
        feePaidCents: 0,
        bestGrade: null,
        pendingQuantity: 0,
        revealedQuantity: 0,
      };

      return {
        id: row.card.id,
        cardNumber: row.card.cardNumber,
        player: row.card.player,
        team: row.card.team,
        position: row.card.position,
        subset: row.card.subset,
        variant: row.card.variant,
        frontImageUrl: row.card.frontImageUrl,
        backImageUrl: row.card.backImageUrl,
        productSetName: row.card.productSet?.name ?? null,
        isInsert: Boolean(row.card.productSet?.isInsert || !row.card.productSet?.isBase),
        quantityPulled: row.quantity,
        soldQuantity,
        remainingPulledQuantity,
        realizedCents,
        rawOwned: owned.raw,
        gradedOwned: owned.graded,
        totalOwned: owned.total,
        gradedFromBox: grading.quantity,
        gradingFeeCents: grading.feePaidCents,
        bestGrade: grading.bestGrade,
        pendingGradingQuantity: grading.pendingQuantity,
        revealedGradingQuantity: grading.revealedQuantity,
        status: getStatus({
          soldQuantity,
          quantityPulled: row.quantity,
          gradedFromBox: grading.quantity,
        }),
        bookValueCents,
        totalValueCents: pulledValueCents,
        remainingValueCents,
        totalPositionCents,
        firstPulledAt: row.firstPulledAt,
      };
    });

    cards.sort((a, b) => b.totalPositionCents - a.totalPositionCents);

    const totalPulledCards = cards.reduce((sum, card) => sum + card.quantityPulled, 0);
    const totalUniqueCards = cards.length;
    const totalPullValueCents = cards.reduce((sum, card) => sum + card.totalValueCents, 0);
    const remainingInventoryValueCents = cards.reduce(
      (sum, card) => sum + card.remainingValueCents,
      0
    );
    const realizedCents = cards.reduce((sum, card) => sum + card.realizedCents, 0);
    const gradingFeeCents = cards.reduce((sum, card) => sum + card.gradingFeeCents, 0);
    const totalPositionCents = remainingInventoryValueCents + realizedCents;
    const profitCents = totalPositionCents - box.purchasePriceCents - gradingFeeCents;
    const roiPct = box.purchasePriceCents > 0 ? (profitCents / box.purchasePriceCents) * 100 : null;

    return NextResponse.json({
      ok: true,
      box: {
        id: box.id,
        productId: box.productId,
        productName: getProductDisplayName(box.product),
        product: box.product,
        purchasePriceCents: box.purchasePriceCents,
        packsPurchased: box.packsPurchased,
        packsOpened: box.packsOpened,
        isClosed: box.isClosed,
        createdAt: box.createdAt,
        totalPulledCards,
        totalUniqueCards,
        totalPullValueCents,
        remainingInventoryValueCents,
        realizedCents,
        gradingFeeCents,
        totalPositionCents,
        profitCents,
        roiPct,
      },
      cards,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load box";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}