import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/default-user";

export async function GET(_: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const { productId } = await params;
    const id = decodeURIComponent(productId || "").trim();
    if (!id) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    const user = await getOrCreateDefaultUser();

    // Load ALL cards for this product (across all productSets under the product),
    // and join ownership (quantity) for this user.
    const product = await prisma.product.findUnique({
      where: { id },
      include: { productSets: true },
    });

    if (!product) return NextResponse.json({ error: `Product not found: ${id}` }, { status: 404 });

    const setIds = product.productSets.map((ps) => ps.id);

    const cards = await prisma.card.findMany({
      where: { productSetId: { in: setIds } },
      select: {
        id: true,
        cardNumber: true,
        player: true,
        team: true,
        subset: true,
        variant: true,
        productSetId: true,
        bookValue: true,
      },
    });

    const ownership = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        cardId: { in: cards.map((c) => c.id) },
      },
      select: { cardId: true, quantity: true },
    });

    const ownedMap = new Map<number, number>();
    for (const o of ownership) ownedMap.set(o.cardId, o.quantity);

    const baseSetIds = new Set(product.productSets.filter((ps) => ps.isBase).map((ps) => ps.id));

    const rows = cards.map((c) => ({
      cardId: c.id,
      cardNumber: c.cardNumber,
      player: c.player,
      team: c.team,
      subset: c.subset,
      variant: c.variant,
      isInsert: c.productSetId ? !baseSetIds.has(c.productSetId) : false,
      bookValue: c.bookValue ?? 0,
      ownedQty: ownedMap.get(c.id) ?? 0,
    }));

    const totalCards = rows.length;
    const uniqueOwned = rows.filter((r) => (r.ownedQty ?? 0) > 0).length;
    const percentComplete = totalCards ? (uniqueOwned / totalCards) * 100 : 0;

    return NextResponse.json({
      ok: true,
      productId: id,
      totalCards,
      uniqueOwned,
      percentComplete,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Checklist failed" }, { status: 500 });
  }
}
