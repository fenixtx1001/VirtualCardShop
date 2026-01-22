import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/default-user";

function pickFirstParam(params: Record<string, any>) {
  const v = Object.values(params ?? {}).find((x) => typeof x === "string" && x.length > 0) as string | undefined;
  if (v) return decodeURIComponent(v);

  const arr = Object.values(params ?? {}).find((x) => Array.isArray(x) && x.length > 0) as string[] | undefined;
  if (arr?.[0]) return decodeURIComponent(arr[0]);

  return "";
}

export async function GET(_: Request, { params }: { params: Record<string, any> }) {
  try {
    const user = await getOrCreateDefaultUser();
    const productId = pickFirstParam(params).trim();
    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    const cards = await prisma.card.findMany({
      where: { productSet: { productId } },
      select: {
        id: true,
        cardNumber: true,
        player: true,
        team: true,
        subset: true,
        variant: true,
        bookValue: true,
      },
      orderBy: [{ cardNumber: "asc" }],
    });

    const owned = await prisma.cardOwnership.findMany({
      where: { userId: user.id, quantity: { gt: 0 }, card: { productSet: { productId } } },
      select: { cardId: true, quantity: true },
    });

    const ownedMap = new Map<number, number>();
    for (const o of owned) ownedMap.set(o.cardId, o.quantity);

    return NextResponse.json({
      productId,
      totalCards: cards.length,
      ownedUnique: owned.length,
      percentComplete: cards.length ? Math.round((owned.length / cards.length) * 1000) / 10 : 0,
      cards: cards.map((c) => ({
        ...c,
        ownedQty: ownedMap.get(c.id) ?? 0,
        owned: (ownedMap.get(c.id) ?? 0) > 0,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load checklist" }, { status: 500 });
  }
}
