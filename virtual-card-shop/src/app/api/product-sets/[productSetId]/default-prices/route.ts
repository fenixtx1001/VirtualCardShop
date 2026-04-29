import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultPriceForPlayer, tierLabel } from "@/lib/player-tiers";

type Ctx =
  | { params: { productSetId?: string } }
  | { params: Promise<{ productSetId?: string }> };

async function getProductSetId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.productSetId;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const productSetId = await getProductSetId(ctx);

    if (!productSetId) {
      return NextResponse.json(
        { ok: false, error: "Missing productSetId" },
        { status: 400 }
      );
    }

    const cards = await prisma.card.findMany({
      where: { productSetId },
      select: {
        id: true,
        player: true,
      },
      orderBy: [{ cardNumber: "asc" }, { id: "asc" }],
    });

    const results: Record<number, unknown> = {};

    for (const card of cards) {
      const result = await getDefaultPriceForPlayer({
        prisma,
        productSetId,
        player: card.player,
      });

      results[card.id] = {
        ...result,
        tierLabel: tierLabel(result.tier),
      };
    }

    return NextResponse.json({
      ok: true,
      productSetId,
      count: cards.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load default prices" },
      { status: 500 }
    );
  }
}
