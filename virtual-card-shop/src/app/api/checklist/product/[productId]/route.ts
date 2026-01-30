import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const id = decodeURIComponent(productId || "").trim();
    if (!id) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    // ✅ Logged-in user (no default fallback)
    const user = await requireUser();

    // Load product + its productSets so we can:
    // - default to the Base set for "completion"
    // - support future UI toggles between Base vs Inserts
    const product = await prisma.product.findUnique({
      where: { id },
      include: { productSets: true },
    });

    if (!product) return NextResponse.json({ error: `Product not found: ${id}` }, { status: 404 });

    // Optional: allow client to request a specific productSet checklist
    const url = new URL(req.url);
    const rawProductSetId = url.searchParams.get("productSetId");
    const productSetId = rawProductSetId ? decodeURIComponent(rawProductSetId).trim() : "";

    const baseSet = product.productSets.find((ps) => ps.isBase) ?? product.productSets[0];
    if (!baseSet) {
      return NextResponse.json({ error: `Product has no productSets: ${id}` }, { status: 400 });
    }

    const selectedSet = productSetId
      ? product.productSets.find((ps) => ps.id === productSetId) ?? null
      : baseSet;

    if (!selectedSet) {
      return NextResponse.json(
        { error: `productSetId not found on product: ${productSetId}` },
        { status: 404 }
      );
    }

    const cards = await prisma.card.findMany({
      where: { productSetId: selectedSet.id },
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
      orderBy: [{ cardNumber: "asc" }],
    });

    const ownership = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id, // ✅ key change
        cardId: { in: cards.map((c) => c.id) },
      },
      select: { cardId: true, quantity: true },
    });

    const ownedMap = new Map<number, number>();
    for (const o of ownership) ownedMap.set(o.cardId, o.quantity);

    const rows = cards.map((c) => ({
      cardId: c.id,
      cardNumber: c.cardNumber,
      player: c.player,
      team: c.team,
      subset: c.subset,
      variant: c.variant,
      // this is now accurate for the selected set
      isInsert: !selectedSet.isBase,
      bookValue: c.bookValue ?? 0,
      ownedQty: ownedMap.get(c.id) ?? 0,
    }));

    const totalCards = rows.length;
    const uniqueOwned = rows.filter((r) => (r.ownedQty ?? 0) > 0).length;
    const percentComplete = totalCards ? (uniqueOwned / totalCards) * 100 : 0;

    return NextResponse.json({
      ok: true,
      productId: id,

      // productSet-scoped stats
      productSetId: selectedSet.id,
      productSetIsBase: selectedSet.isBase,
      totalCards,
      uniqueOwned,
      percentComplete,

      // so the UI can add Base/Inserts toggle next
      productSets: product.productSets.map((ps) => ({
        id: ps.id,
        isBase: ps.isBase,
        name: (ps as any).name ?? null, // safe if you don't have name
      })),

      rows,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { error: e?.message ?? "Checklist failed" },
      { status }
    );
  }
}
