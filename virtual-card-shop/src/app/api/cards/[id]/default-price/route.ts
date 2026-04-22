// src/app/api/cards/[id]/default-price/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultPriceForPlayer, tierLabel } from "@/lib/player-tiers";

type Ctx =
  | { params: { id?: string } }
  | { params: Promise<{ id?: string }> };

async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.id;
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ ok: false, error: "Invalid card id" }, { status: 400 });

    const card = await prisma.card.findUnique({
      where: { id },
      select: {
        id: true,
        player: true,
        productSetId: true,
      },
    });

    if (!card || !card.productSetId) {
      return NextResponse.json({ ok: false, error: "Card not found or has no productSetId" }, { status: 404 });
    }

    const result = await getDefaultPriceForPlayer({
      prisma,
      productSetId: card.productSetId,
      player: card.player,
    });

    return NextResponse.json({
      ok: true,
      cardId: card.id,
      player: card.player,
      defaulting: {
        ...result,
        tierLabel: tierLabel(result.tier),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to get default price" },
      { status: 500 }
    );
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ ok: false, error: "Invalid card id" }, { status: 400 });

    const card = await prisma.card.findUnique({
      where: { id },
      select: {
        id: true,
        player: true,
        productSetId: true,
      },
    });

    if (!card || !card.productSetId) {
      return NextResponse.json({ ok: false, error: "Card not found or has no productSetId" }, { status: 404 });
    }

    const result = await getDefaultPriceForPlayer({
      prisma,
      productSetId: card.productSetId,
      player: card.player,
    });

    if (!result.ok || result.defaultPrice === null) {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.reason === "unassigned-tier"
              ? "Player exists in the repository but does not have a tier assigned yet."
              : result.reason === "no-tier-profile"
              ? "Player is not in the repository yet. Run a repository refresh first."
              : result.reason === "no-price-for-tier"
              ? "This product set does not have a default price configured for that tier."
              : "No default price is available for this card.",
          defaulting: {
            ...result,
            tierLabel: tierLabel(result.tier),
          },
        },
        { status: 400 }
      );
    }

    const updated = await prisma.card.update({
      where: { id: card.id },
      data: {
        bookValue: result.defaultPrice,
      },
      select: {
        id: true,
        bookValue: true,
      },
    });

    return NextResponse.json({
      ok: true,
      cardId: card.id,
      player: card.player,
      card: updated,
      defaulting: {
        ...result,
        tierLabel: tierLabel(result.tier),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to apply default price" },
      { status: 500 }
    );
  }
}