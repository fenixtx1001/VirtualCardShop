import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
    const params = new URL(req.url).searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 120);
    const page = clampInt(Number(params.get("page")) || 1, 1, 100000);
    const pageSize = clampInt(Number(params.get("pageSize")) || 24, 1, 48);
    const sort = params.get("sort") ?? "default";
    const sport = (params.get("sport") ?? "").trim().slice(0, 40);
    const year = Number(params.get("year"));
    const onlyNeed = params.get("onlyNeed") === "1";

    const filters: Prisma.CardWhereInput[] = [];
    if (q) {
      filters.push({ OR: [
        { player: { contains: q, mode: "insensitive" } },
        { team: { contains: q, mode: "insensitive" } },
        { cardNumber: { contains: q, mode: "insensitive" } },
        { subset: { contains: q, mode: "insensitive" } },
        { variant: { contains: q, mode: "insensitive" } },
        { productSetId: { contains: q, mode: "insensitive" } },
        { productSet: { name: { contains: q, mode: "insensitive" } } },
        { productSet: { product: { brand: { contains: q, mode: "insensitive" } } } },
        { productSet: { product: { sport: { contains: q, mode: "insensitive" } } } },
      ] });
    }
    if (sport) filters.push({ productSet: { product: { sport: { equals: sport, mode: "insensitive" } } } });
    if (Number.isInteger(year) && year >= 1850 && year <= 2100)
      filters.push({ productSet: { product: { year } } });
    // Count cards in grading as still owned, consistent with VCS prestige.
    if (onlyNeed) filters.push({
      ownerships: { none: { userId: user.id, quantity: { gt: 0 } } },
      gradingOrders: { none: { userId: user.id, quantity: { gt: 0 }, revealedAt: null } },
    });

    const where: Prisma.ShopInventoryWhereInput = {
      quantity: { gt: 0 },
      ...(filters.length ? { card: { AND: filters } } : {}),
    };
    const orderBy: Prisma.ShopInventoryOrderByWithRelationInput[] =
      sort === "price_asc" ? [{ card: { bookValue: "asc" } }, { cardId: "asc" }] :
      sort === "price_desc" ? [{ card: { bookValue: "desc" } }, { cardId: "asc" }] :
      sort === "name" ? [{ card: { player: "asc" } }, { cardId: "asc" }] :
      sort === "recent" ? [{ updatedAt: "desc" }, { cardId: "asc" }] :
      [{ quantity: "desc" }, { updatedAt: "desc" }, { cardId: "asc" }];

    const total = await prisma.shopInventory.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const stock = await prisma.shopInventory.findMany({
      where, orderBy, skip: (safePage - 1) * pageSize, take: pageSize,
      select: {
        cardId: true, quantity: true, updatedAt: true,
        card: { select: {
          id: true, player: true, team: true, cardNumber: true,
          subset: true, variant: true, bookValue: true, frontImageUrl: true,
          productSetId: true,
          ownerships: { where: { userId: user.id, quantity: { gt: 0 } }, select: { quantity: true } },
          productSet: { select: {
            id: true, name: true, isBase: true,
            product: { select: { year: true, brand: true, sport: true } },
          } },
        } },
      },
    });

    const cardIds = stock.map(r => r.cardId);
    const setIds = [...new Set(stock.map(r => r.card.productSetId).filter((s): s is string => !!s))];
    const pending = cardIds.length
      ? await prisma.gradingOrder.groupBy({
          by: ["cardId"],
          where: { userId: user.id, cardId: { in: cardIds }, revealedAt: null, quantity: { gt: 0 } },
          _sum: { quantity: true },
        })
      : [];
    const pendingByCard = new Map(pending.map(r => [r.cardId, r._sum.quantity ?? 0]));

    // Prestige matches the Shop/Collector level, including unrevealed grading orders.
    const levels = setIds.length
      ? await prisma.$queryRaw<{ productSetId: string; nextLevel: number }[]>(Prisma.sql`
          WITH held AS (
            SELECT "cardId", SUM(qty)::int AS qty FROM (
              SELECT "cardId", quantity AS qty FROM "CardOwnership"
              WHERE "userId" = ${user.id} AND quantity > 0
              UNION ALL
              SELECT "cardId", quantity AS qty FROM "GradingOrder"
              WHERE "userId" = ${user.id} AND quantity > 0 AND "revealedAt" IS NULL
            ) q GROUP BY "cardId"
          ),
          levels AS (
            SELECT c."productSetId" AS "productSetId",
              COALESCE(MIN(COALESCE(h.qty, 0)), 0)::int AS level
            FROM "Card" c LEFT JOIN held h ON h."cardId" = c.id
            WHERE c."productSetId" IN (${Prisma.join(setIds)})
            GROUP BY c."productSetId"
          )
          SELECT l."productSetId",
            (GREATEST(l.level, COALESCE(p."timesCompleted", 0)) + 1)::int AS "nextLevel"
          FROM levels l LEFT JOIN "ProductSetPrestige" p
            ON p."productSetId" = l."productSetId" AND p."userId" = ${user.id}
        `)
      : [];
    const nextLevelBySet = new Map(levels.map(r => [r.productSetId, r.nextLevel]));

    const rows = stock.map(r => {
      const c = r.card;
      const owned = c.ownerships.reduce((n, o) => n + o.quantity, 0);
      const inGrading = pendingByCard.get(r.cardId) ?? 0;
      const nextLevel = c.productSetId ? nextLevelBySet.get(c.productSetId) ?? null : null;
      const product = c.productSet?.product;
      return {
        cardId: r.cardId, quantity: r.quantity, updatedAt: r.updatedAt,
        youOwnQty: owned + inGrading, heldQty: owned, pendingQty: inGrading,
        prestigeNextLevel: nextLevel,
        neededForPrestige: nextLevel !== null && owned + inGrading < nextLevel,
        card: {
          id: c.id, player: c.player, team: c.team, cardNumber: c.cardNumber,
          subset: c.subset, variant: c.variant, bookValue: c.bookValue,
          frontImageUrl: c.frontImageUrl, productSetId: c.productSetId,
          friendlySetName: c.productSet?.name || c.productSetId?.replace(/_/g, " ") || "Uncatalogued",
          friendlyProductLabel: [product?.year, product?.brand, product?.sport].filter(Boolean).join(" "),
          sport: product?.sport ?? null, year: product?.year ?? null, isBase: c.productSet?.isBase ?? null,
        },
      };
    });

    return NextResponse.json({ ok: true, q, page: safePage, pageSize, total, totalPages, rows },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json(
      { ok: false, error: status === 401 ? "Please sign in to browse singles." : "Failed to load shop inventory." },
      { status: status === 401 ? 401 : 500 },
    );
  }
}
