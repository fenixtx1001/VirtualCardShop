// src/app/api/prestige/levels/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns prestige level + progress-to-next for a list of productSetIds.
 *
 * Query:
 *   /api/prestige/levels?ids=ps1,ps2,ps3
 *
 * Prestige counts all owned copies across all grade buckets.
 * A graded card still counts toward set completion; it only stops counting
 * if it is sold/removed from ownership.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const rawIds = (url.searchParams.get("ids") ?? "").trim();
    const ids = Array.from(
      new Set(
        rawIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );

    if (!ids.length) {
      return NextResponse.json({ ok: true, levels: {} }, { status: 200 });
    }

    const cards = await prisma.card.findMany({
      where: { productSetId: { in: ids } },
      select: { id: true, productSetId: true },
    });

    const bySet = new Map<string, number[]>();
    for (const c of cards) {
      const psid = c.productSetId;
      if (!psid) continue;

      const arr = bySet.get(psid) ?? [];
      arr.push(c.id);
      bySet.set(psid, arr);
    }

    const allCardIds = cards.map((c) => c.id);

    const owns = allCardIds.length
      ? await prisma.cardOwnership.groupBy({
          by: ["cardId"],
          where: {
            userId: user.id,
            cardId: { in: allCardIds },
            quantity: { gt: 0 },
          },
          _sum: {
            quantity: true,
          },
        })
      : [];

    const qtyByCardId = new Map<number, number>();
    for (const o of owns) {
      qtyByCardId.set(o.cardId, o._sum.quantity ?? 0);
    }

    const levels: Record<
      string,
      {
        productSetId: string;
        totalCards: number;
        level: number;
        nextLevel: number;
        nextPct: number;
        cardsAtNextLevel: number;
        cardsNeededForNext: number;
        completedOnce: boolean;
      }
    > = {};

    for (const productSetId of ids) {
      const cardIds = bySet.get(productSetId) ?? [];
      const totalCards = cardIds.length;

      if (!totalCards) {
        levels[productSetId] = {
          productSetId,
          totalCards: 0,
          level: 0,
          nextLevel: 1,
          nextPct: 0,
          cardsAtNextLevel: 0,
          cardsNeededForNext: 0,
          completedOnce: false,
        };
        continue;
      }

      let minQty = Number.POSITIVE_INFINITY;

      for (const cardId of cardIds) {
        const q = qtyByCardId.get(cardId) ?? 0;
        if (q < minQty) minQty = q;
        if (minQty === 0) break;
      }

      if (!Number.isFinite(minQty)) minQty = 0;

      const level = Math.max(0, Math.floor(minQty));
      const nextLevel = level + 1;

      let cardsAtNextLevel = 0;
      for (const cardId of cardIds) {
        const q = qtyByCardId.get(cardId) ?? 0;
        if (q >= nextLevel) cardsAtNextLevel++;
      }

      const nextPct = totalCards ? Math.round((cardsAtNextLevel / totalCards) * 1000) / 10 : 0;
      const cardsNeededForNext = Math.max(0, totalCards - cardsAtNextLevel);

      levels[productSetId] = {
        productSetId,
        totalCards,
        level,
        nextLevel,
        nextPct,
        cardsAtNextLevel,
        cardsNeededForNext,
        completedOnce: level >= 1,
      };
    }

    return NextResponse.json({ ok: true, levels }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to load prestige levels." }, { status: 500 });
  }
}