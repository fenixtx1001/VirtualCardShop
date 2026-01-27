import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/default-user";

type Ctx =
  | { params: { productId?: string } }
  | { params: Promise<{ productId?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.productId;
  const id = typeof raw === "string" ? decodeURIComponent(raw) : undefined;
  return (id ?? "").trim();
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const productId = await getParam(ctx);
    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    const user = await getOrCreateDefaultUser();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        productSets: {
          select: { id: true, isBase: true, name: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });
    }

    // Determine selected ProductSet
    const url = new URL(req.url);
    const requested = (url.searchParams.get("productSetId") ?? "").trim();

    const baseSet = product.productSets.find((ps) => ps.isBase) ?? product.productSets[0];
    const selected =
      product.productSets.find((ps) => ps.id === requested) ??
      baseSet ??
      product.productSets[0];

    if (!selected) {
      return NextResponse.json(
        { error: `No productSets found for product: ${productId}` },
        { status: 400 }
      );
    }

    // Total cards in THIS productSet (denominator)
    const totalCards = await prisma.card.count({
      where: { productSetId: selected.id },
    });

    // Owned cards in THIS productSet (for list + numerator)
    const owned = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        card: { productSetId: selected.id },
      },
      select: {
        quantity: true,
        card: {
          select: {
            id: true,
            cardNumber: true,
            player: true,
            team: true,
            subset: true,
            variant: true,
            bookValue: true,
            productSetId: true,
            frontImageUrl: true,
            backImageUrl: true,
          },
        },
      },
    });

    const cards = owned.map((o) => ({
      cardId: o.card.id,
      cardNumber: o.card.cardNumber,
      player: o.card.player,
      team: o.card.team,
      subset: o.card.subset,
      variant: o.card.variant,
      isInsert: !selected.isBase, // within selected set, this is consistent
      quantity: o.quantity,
      bookValue: o.card.bookValue ?? null,
      frontImageUrl: o.card.frontImageUrl ?? null,
      backImageUrl: o.card.backImageUrl ?? null,
    }));

    const uniqueOwned = owned.length;
    const totalQty = owned.reduce((sum, o) => sum + (o.quantity ?? 0), 0);
    const percentComplete = totalCards > 0 ? (uniqueOwned / totalCards) * 100 : 0;

    return NextResponse.json({
      ok: true,
      productId,
      productSetId: selected.id,
      productSetIsBase: selected.isBase,
      productSets: product.productSets,
      uniqueOwned,
      totalCards,
      percentComplete,
      totalQty,
      cards,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load product collection" },
      { status: 500 }
    );
  }
}
