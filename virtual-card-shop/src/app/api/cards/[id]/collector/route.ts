import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import type { Progress } from "@/lib/card-details/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const cardId = Number(id);
    if (!Number.isSafeInteger(cardId) || cardId < 1)
      return NextResponse.json({ error: "Invalid card." }, { status: 400 });
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: { productSetId: true },
    });
    if (!card)
      return NextResponse.json({ error: "Card not found." }, { status: 404 });
    const [
      favorite,
      pendingOrders,
      auctions,
      pulls,
      purchases,
      wins,
      progressRows,
    ] = await Promise.all([
      prisma.cardFavorite.findUnique({
        where: { userId_cardId: { userId: user.id, cardId } },
        select: { id: true },
      }),
      prisma.gradingOrder.findMany({
        where: {
          userId: user.id,
          cardId,
          revealedAt: null,
          quantity: { gt: 0 },
        },
        select: { id: true, quantity: true, readyAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auction.findMany({
        where: { sellerUserId: user.id, cardId, collectedAt: null },
        select: {
          id: true,
          grade: true,
          quantity: true,
          status: true,
          endsAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.ripBoxCard.findMany({
        where: { cardId, ripBox: { userId: user.id } },
        select: {
          id: true,
          quantity: true,
          firstPulledAt: true,
          ripBoxId: true,
        },
        orderBy: { firstPulledAt: "desc" },
        take: 8,
      }),
      prisma.shopTransaction.findMany({
        where: { userId: user.id, cardId, kind: "BUY_FROM_SHOP" },
        select: { id: true, quantity: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.auction.findMany({
        where: { winnerUserId: user.id, cardId, collectedAt: { not: null } },
        select: { id: true, quantity: true, collectedAt: true },
        orderBy: { collectedAt: "desc" },
        take: 8,
      }),
      card.productSetId
        ? prisma.$queryRaw<Progress[]>`
        WITH quantities AS (
          SELECT "cardId", SUM(quantity)::int AS qty FROM (
            SELECT o."cardId", o.quantity FROM "CardOwnership" o JOIN "Card" c ON c.id=o."cardId"
            WHERE o."userId"=${user.id} AND c."productSetId"=${card.productSetId} AND o.quantity>0
            UNION ALL
            SELECT g."cardId", g.quantity FROM "GradingOrder" g JOIN "Card" c ON c.id=g."cardId"
            WHERE g."userId"=${user.id} AND c."productSetId"=${card.productSetId} AND g."revealedAt" IS NULL AND g.quantity>0
          ) owned GROUP BY "cardId"
        ), cards AS (
          SELECT c.id, COALESCE(q.qty,0)::int AS qty FROM "Card" c LEFT JOIN quantities q ON q."cardId"=c.id WHERE c."productSetId"=${card.productSetId}
        ), levels AS (
          SELECT GREATEST(COALESCE(MIN(qty),0), COALESCE((SELECT "timesCompleted" FROM "ProductSetPrestige" WHERE "userId"=${user.id} AND "productSetId"=${card.productSetId}),0))::int AS level FROM cards
        )
        SELECT level, (level+1)::int AS "nextLevel", COUNT(*)::int AS "totalCards",
          COUNT(*) FILTER (WHERE qty>0)::int AS "ownedCards", COUNT(*) FILTER (WHERE qty>=level+1)::int AS "cardsAtNext",
          COALESCE(SUM(GREATEST(0,level+1-qty)),0)::int AS "missingCopies",
          COALESCE(MAX(qty) FILTER (WHERE id=${cardId}),0)::int AS "thisCardOwned",
          GREATEST(0,level+1-COALESCE(MAX(qty) FILTER (WHERE id=${cardId}),0))::int AS "thisCardNeeded"
        FROM cards CROSS JOIN levels GROUP BY level
      `
        : Promise.resolve([]),
    ]);
    // Box records aggregate pulls; firstPulledAt is not the timestamp of every copy.
    const history = [
      ...pulls.map((p) => ({
        id: `box-${p.id}`,
        date: p.firstPulledAt.toISOString(),
        label: "First pull from this box",
        quantity: p.quantity,
        href: `/analytics/boxes/${p.ripBoxId}`,
      })),
      ...purchases.map((p) => ({
        id: `shop-${p.id}`,
        date: p.createdAt.toISOString(),
        label: "Bought from the shop",
        quantity: p.quantity,
        href: null,
      })),
      ...wins.map((p) => ({
        id: `auction-${p.id}`,
        date: p.collectedAt!.toISOString(),
        label: "Auction purchase collected",
        quantity: p.quantity,
        href: `/auctions/${p.id}`,
      })),
    ]
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 10);
    return NextResponse.json(
      {
        ok: true,
        cardId,
        favorited: !!favorite,
        pendingOrders,
        auctions,
        history,
        progress: progressRows[0] ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 500;
    return NextResponse.json(
      {
        error:
          status === 401
            ? "Please sign in to view your collection."
            : "Your collecting context could not load.",
      },
      { status },
    );
  }
}
