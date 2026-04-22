// src/app/api/product-sets/[productSetId]/cards/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultPriceForPlayer, tierLabel } from "@/lib/player-tiers";

type MaybePromise<T> = T | Promise<T>;
type Ctx = { params: MaybePromise<{ productSetId?: string }> };

async function getParams<T>(p: MaybePromise<T>) {
  return (p as any)?.then ? await (p as Promise<T>) : (p as T);
}

function cardNumberKey(s: string) {
  const m = String(s ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { productSetId: raw } = await getParams(ctx.params);
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Missing productSetId" }, { status: 400 });
  }

  const productSetId = decodeURIComponent(raw);

  const productSet = await prisma.productSet.findUnique({
    where: { id: productSetId },
    select: {
      id: true,
      name: true,
      commonPrice: true,
      semiStarPrice: true,
      unlistedStarPrice: true,
      star1Price: true,
      star2Price: true,
      star3Price: true,
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

  const cards = await prisma.card.findMany({
    where: { productSetId },
    select: {
      id: true,
      setId: true,
      productSetId: true,
      cardNumber: true,
      player: true,
      team: true,
      position: true,
      subset: true,
      variant: true,
      bookValue: true,
      quantityOwned: true,
      frontImageUrl: true,
      backImageUrl: true,
    },
  });

  cards.sort((a, b) => {
    const an = cardNumberKey(a.cardNumber);
    const bn = cardNumberKey(b.cardNumber);
    if (an !== bn) return an - bn;

    return String(a.cardNumber ?? "").localeCompare(String(b.cardNumber ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  const enriched = await Promise.all(
    cards.map(async (card) => {
      const defaulting = await getDefaultPriceForPlayer({
        prisma,
        productSetId,
        player: card.player,
      });

      return {
        ...card,
        defaulting: {
          reason: defaulting.reason,
          tier: defaulting.tier,
          tierLabel: tierLabel(defaulting.tier),
          defaultPrice: defaulting.defaultPrice,
          normalizedName: defaulting.normalizedName,
        },
      };
    })
  );

  return NextResponse.json({
    ok: true,
    productSet: {
      id: productSet.id,
      name: productSet.name ?? null,
      sport: productSet.product?.sport ?? null,
      commonPrice: productSet.commonPrice ?? null,
      semiStarPrice: productSet.semiStarPrice ?? null,
      unlistedStarPrice: productSet.unlistedStarPrice ?? null,
      star1Price: productSet.star1Price ?? null,
      star2Price: productSet.star2Price ?? null,
      star3Price: productSet.star3Price ?? null,
    },
    cards: enriched,
  });
}