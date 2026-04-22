// src/app/api/product-sets/[productSetId]/pricing/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlayerTierProfile, getDefaultPriceForPlayer, tierLabel } from "@/lib/player-tiers";

type MaybePromise<T> = T | Promise<T>;
type Ctx = { params: MaybePromise<{ productSetId?: string }> };

type ActionBody = {
  action?: "syncPlayers" | "fillBlankPrices" | "overwriteAllPrices";
};

async function getParams<T>(p: MaybePromise<T>) {
  return (p as any)?.then ? await (p as Promise<T>) : (p as T);
}

function isBlankBookValue(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return n <= 0;
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { productSetId: raw } = await getParams(ctx.params);
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Missing productSetId" }, { status: 400 });
    }

    const productSetId = decodeURIComponent(raw);
    const body = (await req.json().catch(() => ({}))) as ActionBody;
    const action = body.action ?? "syncPlayers";

    const productSet = await prisma.productSet.findUnique({
      where: { id: productSetId },
      select: {
        id: true,
        product: {
          select: {
            sport: true,
          },
        },
      },
    });

    if (!productSet) {
      return NextResponse.json({ ok: false, error: "ProductSet not found" }, { status: 404 });
    }

    const sport = productSet.product?.sport?.trim() || "";

    const cards = await prisma.card.findMany({
      where: { productSetId },
      select: {
        id: true,
        player: true,
        bookValue: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    let insertedProfiles = 0;
    const seen = new Set<string>();

    for (const card of cards) {
      const key = `${sport}::${card.player ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = await ensurePlayerTierProfile({
        prisma,
        sport,
        player: card.player,
      });

      if (existing && existing.createdAt.getTime() === existing.updatedAt.getTime()) {
        insertedProfiles++;
      }
    }

    if (action === "syncPlayers") {
      const unassignedCount = await prisma.playerTierProfile.count({
        where: {
          sport,
          tier: null,
        },
      });

      return NextResponse.json({
        ok: true,
        action,
        productSetId,
        summary: {
          scannedCards: cards.length,
          insertedProfiles,
          unassignedCount,
        },
      });
    }

    let updatedCards = 0;
    let skippedNoTier = 0;
    let skippedNoPrice = 0;
    let skippedAlreadyPriced = 0;

    const touched: Array<{
      cardId: number;
      player: string;
      oldBookValue: number;
      newBookValue: number;
      tierLabel: string;
    }> = [];

    for (const card of cards) {
      if (action === "fillBlankPrices" && !isBlankBookValue(card.bookValue)) {
        skippedAlreadyPriced++;
        continue;
      }

      const result = await getDefaultPriceForPlayer({
        prisma,
        productSetId,
        player: card.player,
      });

      if (!result.ok || result.defaultPrice === null) {
        if (result.reason === "unassigned-tier" || result.reason === "no-tier-profile") {
          skippedNoTier++;
        } else {
          skippedNoPrice++;
        }
        continue;
      }

      const oldBookValue =
        typeof card.bookValue === "number" && Number.isFinite(card.bookValue) ? card.bookValue : 0;

      await prisma.card.update({
        where: { id: card.id },
        data: {
          bookValue: result.defaultPrice,
        },
      });

      updatedCards++;
      touched.push({
        cardId: card.id,
        player: card.player,
        oldBookValue,
        newBookValue: result.defaultPrice,
        tierLabel: tierLabel(result.tier),
      });
    }

    return NextResponse.json({
      ok: true,
      action,
      productSetId,
      summary: {
        scannedCards: cards.length,
        insertedProfiles,
        updatedCards,
        skippedNoTier,
        skippedNoPrice,
        skippedAlreadyPriced,
      },
      touched,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Pricing action failed" },
      { status: 500 }
    );
  }
}