// src/app/api/checklist/[productId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickFirstParam(params: Record<string, any>) {
  const v = Object.values(params ?? {}).find(
    (x) => typeof x === "string" && x.length > 0
  ) as string | undefined;
  if (v) return decodeURIComponent(v);

  const arr = Object.values(params ?? {}).find(
    (x) => Array.isArray(x) && x.length > 0
  ) as string[] | undefined;
  if (arr?.[0]) return decodeURIComponent(arr[0]);

  return "";
}

export async function GET(req: Request, { params }: { params: Record<string, any> }) {
  try {
    const user = await requireUser();

    const productId = pickFirstParam(params).trim();
    if (!productId) {
      return NextResponse.json({ ok: false, error: "Missing productId" }, { status: 400 });
    }

    // Load product + its productSets so we can default to Base, and allow toggling sets.
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { productSets: true },
    });

    if (!product) {
      return NextResponse.json({ ok: false, error: `Product not found: ${productId}` }, { status: 404 });
    }

    // Optional productSetId query param
    const url = new URL(req.url);
    const rawProductSetId = url.searchParams.get("productSetId");
    const requestedSetId = rawProductSetId ? decodeURIComponent(rawProductSetId).trim() : "";

    const baseSet = product.productSets.find((ps) => ps.isBase) ?? product.productSets[0];
    if (!baseSet) {
      return NextResponse.json(
        { ok: false, error: `Product has no productSets: ${productId}` },
        { status: 400 }
      );
    }

    const selectedSet =
      requestedSetId
        ? product.productSets.find((ps) => ps.id === requestedSetId) ?? null
        : baseSet;

    if (!selectedSet) {
      return NextResponse.json(
        { ok: false, error: `productSetId not found on product: ${requestedSetId}` },
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
        userId: user.id,
        cardId: { in: cards.map((c) => c.id) },
        quantity: { gt: 0 },
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
      isInsert: !selectedSet.isBase,
      bookValue: c.bookValue ?? 0,
      ownedQty: ownedMap.get(c.id) ?? 0,
    }));

    const totalCards = rows.length;
    const uniqueOwned = rows.filter((r) => (r.ownedQty ?? 0) > 0).length;
    const percentComplete = totalCards ? (uniqueOwned / totalCards) * 100 : 0;

    return NextResponse.json({
      ok: true,
      productId,

      // productSet-scoped stats
      productSetId: selectedSet.id,
      productSetIsBase: selectedSet.isBase,
      totalCards,
      uniqueOwned,
      percentComplete,

      // allow UI toggle
      productSets: product.productSets.map((ps) => ({
        id: ps.id,
        isBase: ps.isBase,
        name: (ps as any).name ?? null,
      })),

      rows,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Checklist failed" },
      { status }
    );
  }
}
