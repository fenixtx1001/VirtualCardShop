// src/app/api/analytics/boxes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      },
    });

    const rows = boxes.map((box) => {
      const totalPulledCards = box.ripBoxCards.reduce((sum, row) => sum + row.quantity, 0);

      const totalPullValueCents = box.ripBoxCards.reduce((sum, row) => {
        return sum + dollarsToCents(row.card.bookValue) * row.quantity;
      }, 0);

      const profitCents = totalPullValueCents - box.purchasePriceCents;
      const roiPct =
        box.purchasePriceCents > 0 ? (profitCents / box.purchasePriceCents) * 100 : null;

      const topCard =
        [...box.ripBoxCards]
          .sort((a, b) => dollarsToCents(b.card.bookValue) - dollarsToCents(a.card.bookValue))
          .at(0) ?? null;

      return {
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
        totalPullValueCents,
        profitCents,
        roiPct,
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

    const totals = rows.reduce(
      (acc, row) => {
        acc.boxes += 1;
        acc.costCents += row.purchasePriceCents;
        acc.pullValueCents += row.totalPullValueCents;
        acc.profitCents += row.profitCents;
        acc.packsPurchased += row.packsPurchased;
        acc.packsOpened += row.packsOpened;
        return acc;
      },
      {
        boxes: 0,
        costCents: 0,
        pullValueCents: 0,
        profitCents: 0,
        packsPurchased: 0,
        packsOpened: 0,
      }
    );

    const totalRoiPct =
      totals.costCents > 0 ? (totals.profitCents / totals.costCents) * 100 : null;

    return NextResponse.json({
      ok: true,
      totals: {
        ...totals,
        roiPct: totalRoiPct,
      },
      boxes: rows,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load box analytics";
    const status = message === "Unauthorized" ? 401 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}