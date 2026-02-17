import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const limit = clampInt(parseInt(url.searchParams.get("limit") ?? "60", 10), 1, 200);

    const rows = await prisma.cardFavorite.findMany({
      where: { userId: user.id },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        card: {
          select: {
            id: true,
            productSetId: true,
            cardNumber: true,
            player: true,
            team: true,
            subset: true,
            variant: true,
            bookValue: true,
            frontImageUrl: true,
            backImageUrl: true,
            productSet: { select: { id: true, name: true, productId: true, isInsert: true } },
          },
        },
      },
    });

    const cards = rows.map((r) => {
      const c = r.card;
      return {
        id: c.id,
        productSetId: c.productSetId,
        cardNumber: c.cardNumber,
        player: c.player,
        team: c.team,
        subset: c.subset,
        variant: c.variant,
        bookValue: c.bookValue,
        frontImageUrl: c.frontImageUrl,
        backImageUrl: c.backImageUrl,
        isInsert: !!c.productSet?.isInsert,
        productSet: c.productSet,
      };
    });

    // Shuffle for shoebox feel
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    return NextResponse.json({ ok: true, limit, cards }, { status: 200 });
  } catch (e: any) {
    // SHORT error only (prevents huge red wall in UI)
    return NextResponse.json({ ok: false, error: "Failed to load Favorites Shoebox." }, { status: 500 });
  }
}
