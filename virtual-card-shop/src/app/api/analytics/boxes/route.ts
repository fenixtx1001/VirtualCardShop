import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dollarsToCents(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function productName(product: {
  year: number | null;
  brand: string | null;
  sport: string | null;
}) {
  return [product.year, product.brand, product.sport].filter(Boolean).join(" ") || "Product";
}

export async function GET() {
  try {
    const user = await requireUser();

    const boxes = await prisma.ripBox.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
                subset: true,
                variant: true,
                bookValue: true,
                frontImageUrl: true,
              },
            },
          },
        },
        gradingLinks: {
          select: {
            gradingOrder: {
              select: { id: true, feePaidCents: true },
            },
          },
        },
      },
    });

    const rows = boxes.map((box) => {
      const totalPulledCards = box.ripBoxCards.reduce((sum, row) => sum + row.quantity, 0);
      const totalPullValueCents = box.ripBoxCards.reduce(
        (sum, row) => sum + dollarsToCents(row.card.bookValue) * row.quantity,
        0
      );

      const remainingInventoryValueCents = box.ripBoxCards.reduce((sum, row) => {
        const remaining = Math.max(0, row.quantity - (row.soldQuantity ?? 0));
        return sum + dollarsToCents(row.card.bookValue) * remaining;
      }, 0);

      const realizedCents = box.ripBoxCards.reduce(
        (sum, row) => sum + (row.realizedCents ?? 0),
        0
      );

      const gradingOrders = new Map<number, number>();
      for (const link of box.gradingLinks) {
        gradingOrders.set(link.gradingOrder.id, link.gradingOrder.feePaidCents ?? 0);
      }

      const gradingFeeCents = Array.from(gradingOrders.values()).reduce(
        (sum, value) => sum + value,
        0
      );

      const totalPositionCents = remainingInventoryValueCents + realizedCents;
      const profitCents = totalPositionCents - box.purchasePriceCents - gradingFeeCents;
      const roiPct =
        box.purchasePriceCents > 0
          ? (profitCents / box.purchasePriceCents) * 100
          : null;

      const topCard =
        [...box.ripBoxCards]
          .sort(
            (a, b) =>
              dollarsToCents(b.card.bookValue) - dollarsToCents(a.card.bookValue)
          )
          .at(0) ?? null;

      return {
        id: box.id,
        productId: box.productId,
        productName: productName(box.product),
        product: box.product,
        purchasePriceCents: box.purchasePriceCents,
        packsPurchased: box.packsPurchased,
        packsOpened: box.packsOpened,
        isClosed: box.isClosed,
        createdAt: box.createdAt,
        totalPulledCards,
        totalPullValueCents,
        remainingInventoryValueCents,
        realizedCents,
        gradingFeeCents,
        totalPositionCents,
        profitCents,
        roiPct,
        breakEvenCents: Math.max(
          0,
          box.purchasePriceCents + gradingFeeCents - totalPositionCents
        ),
        topCard: topCard
          ? {
              id: topCard.card.id,
              cardNumber: topCard.card.cardNumber,
              player: topCard.card.player,
              team: topCard.card.team,
              subset: topCard.card.subset,
              variant: topCard.card.variant,
              bookValueCents: dollarsToCents(topCard.card.bookValue),
              frontImageUrl: topCard.card.frontImageUrl,
              quantity: topCard.quantity,
            }
          : null,
      };
    });

    const active = rows.filter((row) => !row.isClosed);
    const completed = rows.filter((row) => row.isClosed);

    const totals = completed.reduce(
      (acc, row) => {
        acc.completedBoxes += 1;
        acc.costCents += row.purchasePriceCents;
        acc.positionCents += row.totalPositionCents;
        acc.profitCents += row.profitCents;
        acc.gradingFeeCents += row.gradingFeeCents;
        if (row.profitCents > 0) acc.profitableBoxes += 1;
        return acc;
      },
      {
        completedBoxes: 0,
        profitableBoxes: 0,
        costCents: 0,
        positionCents: 0,
        profitCents: 0,
        gradingFeeCents: 0,
      }
    );

    const roiPct =
      totals.costCents > 0 ? (totals.profitCents / totals.costCents) * 100 : null;

    const profitablePct =
      totals.completedBoxes > 0
        ? (totals.profitableBoxes / totals.completedBoxes) * 100
        : null;

    const bestBox =
      [...completed]
        .filter((row) => row.roiPct != null)
        .sort((a, b) => (b.roiPct ?? -Infinity) - (a.roiPct ?? -Infinity))[0] ?? null;

    const productMap = new Map<string, {
      productId: string;
      productName: string;
      boxes: number;
      profitableBoxes: number;
      costCents: number;
      positionCents: number;
      profitCents: number;
    }>();

    for (const box of completed) {
      const entry = productMap.get(box.productId) ?? {
        productId: box.productId,
        productName: box.productName,
        boxes: 0,
        profitableBoxes: 0,
        costCents: 0,
        positionCents: 0,
        profitCents: 0,
      };

      entry.boxes += 1;
      entry.costCents += box.purchasePriceCents;
      entry.positionCents += box.totalPositionCents;
      entry.profitCents += box.profitCents;
      if (box.profitCents > 0) entry.profitableBoxes += 1;
      productMap.set(box.productId, entry);
    }

    const productPerformance = Array.from(productMap.values())
      .map((entry) => ({
        ...entry,
        roiPct: entry.costCents > 0 ? (entry.profitCents / entry.costCents) * 100 : null,
        profitablePct:
          entry.boxes > 0 ? (entry.profitableBoxes / entry.boxes) * 100 : null,
      }))
      .sort((a, b) => (b.roiPct ?? -Infinity) - (a.roiPct ?? -Infinity));

    return NextResponse.json({
      ok: true,
      totals: {
        ...totals,
        activeBoxes: active.length,
        roiPct,
        profitablePct,
        bestBox: bestBox
          ? {
              id: bestBox.id,
              productName: bestBox.productName,
              roiPct: bestBox.roiPct,
              profitCents: bestBox.profitCents,
            }
          : null,
      },
      active,
      completed,
      productPerformance,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load box analytics";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
