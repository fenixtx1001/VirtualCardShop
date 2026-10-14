import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ productId: string }> | { productId: string } };

function naturalCardOrder(a: { cardNumber: string; id: number }, b: { cardNumber: string; id: number }) {
  const left = String(a.cardNumber || "").trim();
  const right = String(b.cardNumber || "").trim();
  const ln = left.match(/^(\d+)/);
  const rn = right.match(/^(\d+)/);
  if (ln && rn) {
    const delta = Number(ln[1]) - Number(rn[1]);
    if (delta) return delta;
  } else if (ln || rn) return ln ? -1 : 1;
  const names = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  return names || a.id - b.id;
}

export async function GET(req: Request, ctx: Params) {
  try {
    const user = await requireUser();
    const params = await ctx.params;
    const productId = params.productId;
    if (!productId || productId.length > 220)
      return NextResponse.json({ ok: false, error: "Invalid product." }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true, year: true, brand: true, sport: true,
        packImageUrl: true, boxImageUrl: true,
        productSets: { select: { id: true, name: true, isBase: true } },
      },
    });
    if (!product) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });

    const requested = new URL(req.url).searchParams.get("productSetId");
    const productSets = product.productSets
      .slice().sort((a, b) => Number(b.isBase) - Number(a.isBase) || (a.name || "").localeCompare(b.name || ""));
    const selected = productSets.find(s => s.id === requested) || productSets[0];
    if (!selected) return NextResponse.json({ ok: false, error: "No card sets in this product." }, { status: 404 });

    // This is one set at a time. Fetch only the data needed to render its
    // checklist and nine-pocket pages: no grading values or card pricing.
    const [cards, ownership, pending] = await Promise.all([
      prisma.card.findMany({
        where: { productSetId: selected.id },
        select: {
          id: true, cardNumber: true, player: true, team: true,
          subset: true, variant: true, frontImageUrl: true, backImageUrl: true,
        },
      }),
      prisma.cardOwnership.groupBy({
        by: ["cardId"],
        where: { userId: user.id, quantity: { gt: 0 }, card: { productSetId: selected.id } },
        _sum: { quantity: true },
      }),
      prisma.gradingOrder.groupBy({
        by: ["cardId"],
        where: {
          userId: user.id, quantity: { gt: 0 },
          status: { in: ["PENDING", "READY"] },
          card: { productSetId: selected.id },
        },
        _sum: { quantity: true },
      }),
    ]);

    const ownedByCard = new Map<number, number>();
    for (const row of [...ownership, ...pending]) {
      ownedByCard.set(row.cardId, (ownedByCard.get(row.cardId) || 0) + (row._sum.quantity || 0));
    }
    const ordered = cards.sort(naturalCardOrder).map(card => ({
      cardId: card.id,
      cardNumber: card.cardNumber,
      player: card.player,
      team: card.team,
      subset: card.subset,
      variant: card.variant,
      frontImageUrl: card.frontImageUrl,
      backImageUrl: card.backImageUrl,
      quantity: ownedByCard.get(card.id) || 0,
    }));
    const uniqueOwned = ordered.reduce((count, card) => count + Number(card.quantity > 0), 0);
    return NextResponse.json({
      ok: true,
      product: {
        id: product.id,
        year: product.year, brand: product.brand, sport: product.sport,
        // Optional source art for a period-correct sticker on the cover.
        packImageUrl: product.packImageUrl, boxImageUrl: product.boxImageUrl,
      },
      productSets,
      productSet: selected,
      uniqueOwned,
      totalCards: ordered.length,
      cards: ordered,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number(error.status) : 500;
    return NextResponse.json({
      ok: false,
      error: status === 401 ? "Sign in to browse your binder." : "Unable to load this binder.",
    }, { status: status === 401 ? 401 : 500 });
  }
}
