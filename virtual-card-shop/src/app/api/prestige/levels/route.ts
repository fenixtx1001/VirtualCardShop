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
 * Response:
 * {
 *   ok: true,
 *   levels: {
 *     [productSetId]: {
 *       productSetId,
 *       totalCards,
 *       level,          // min qty across all cards (0 if any missing)
 *       nextLevel,      // level + 1
 *       nextPct,        // 0..100 (how many cards have qty >= nextLevel)
 *       completedOnce,  // level >= 1
 *     }
 *   }
 * }
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const rawIds = (url.searchParams.get("ids") ?? "").trim();
    const ids = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!ids.length) {
      return NextResponse.json({ ok: true, levels: {} }, { status: 200 });
    }

    // Load all cards in these product sets (only id + productSetId)
    const cards = await prisma.card.findMany({
      where: { productSetId: { in: ids } },
      select: { id: true, productSetId: true },
    });

    // Group cardIds by productSetId
    const bySet = new Map<string, number[]>();
    for (const c of cards) {
      const psid = c.productSetId;
      if (!psid) continue;
      if (!bySet.has(psid)) bySet.set(psid, []);
      bySet.get(psid)!.push(c.id);
    }

    // Pull ownership rows for this user for all cards in these sets
    const allCardIds = cards.map((c) => c.id);
    const owns = allCardIds.length
      ? await prisma.cardOwnership.findMany({
          where: { userId: user.id, cardId: { in: allCardIds } },
          select: { cardId: true, quantity: true },
        })
      : [];

    const qtyByCardId = new Map<number, number>();
    for (const o of owns) qtyByCardId.set(o.cardId, o.quantity ?? 0);

    // Compute per-set:
    // level = min qty across all cards (missing => 0)
    // nextPct = fraction of cards with qty >= level+1
    const levels: Record<
      string,
      {
        productSetId: string;
        totalCards: number;
        level: number;
        nextLevel: number;
        nextPct: number;
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

      let haveNext = 0;
      for (const cardId of cardIds) {
        const q = qtyByCardId.get(cardId) ?? 0;
        if (q >= nextLevel) haveNext++;
      }

      const nextPct = totalCards ? Math.round((haveNext / totalCards) * 1000) / 10 : 0;

      levels[productSetId] = {
        productSetId,
        totalCards,
        level,
        nextLevel,
        nextPct,
        completedOnce: level >= 1,
      };
    }

    return NextResponse.json({ ok: true, levels }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to load prestige levels." }, { status: 500 });
  }
}
