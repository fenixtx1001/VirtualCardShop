import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/default-user";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ productId?: string }> | { productId?: string } }
) {
  try {
    const p: any = (ctx as any).params;
    const params = typeof p?.then === "function" ? await p : p;

    const raw = params?.productId;
    const productId = typeof raw === "string" ? decodeURIComponent(raw) : "";

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const user = await getOrCreateDefaultUser();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { productSets: true },
    });

    if (!product) {
      return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });
    }

    const productSetIds = product.productSets.map((ps) => ps.id);
    if (productSetIds.length === 0) {
      return NextResponse.json(
        { error: `No ProductSets found for product: ${productId}` },
        { status: 400 }
      );
    }

    const totalCards = await prisma.card.count({
      where: { productSetId: { in: productSetIds } },
    });

    const owned = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        card: { productSetId: { in: productSetIds } },
      },
      include: {
        card: {
          include: {
            productSet: true,
          },
        },
      },
      orderBy: {
        cardId: "asc",
      },
    });

    const uniqueOwned = owned.length;
    const totalQty = owned.reduce((sum, o) => sum + (o.quantity ?? 0), 0);
    const percentComplete = totalCards > 0 ? (uniqueOwned / totalCards) * 100 : 0;

    const cards = owned.map((o) => {
      const c = o.card;
      const isInsert = c.productSet?.isBase === false;

      return {
        cardId: c.id,
        cardNumber: c.cardNumber,
        player: c.player,
        team: c.team,
        subset: c.subset,
        variant: c.variant,
        isInsert,
        quantity: o.quantity ?? 0,
        bookValue: c.bookValue ?? null,
        frontImageUrl: c.frontImageUrl ?? null,
        backImageUrl: c.backImageUrl ?? null, // ✅ added for flip
      };
    });

    return NextResponse.json({
      ok: true,
      productId,
      uniqueOwned,
      totalCards,
      percentComplete,
      totalQty,
      cards,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load collection product view" },
      { status: 500 }
    );
  }
}
