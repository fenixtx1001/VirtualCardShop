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
    const onlyPrestige = params.get("onlyPrestige") === "1";

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

    // Prestige search/ranking must happen BEFORE the inventory page is selected.
    const usePrestigeIndex = onlyPrestige || sort === "prestige";
    type RankedRow = {
      cardId: number;
      prestigeCopiesNeeded: number;
      prestigeNextLevel: number | null;
      total: number;
    };
    let rankedRows: RankedRow[] = [];

    if (usePrestigeIndex) {
      const conditions: Prisma.Sql[] = [Prisma.sql`si.quantity > 0`];
      if (q) {
        const terms = [
          Prisma.sql`c."player"`,
          Prisma.sql`c."team"`,
          Prisma.sql`c."cardNumber"`,
          Prisma.sql`c."subset"`,
          Prisma.sql`c."variant"`,
          Prisma.sql`c."productSetId"`,
          Prisma.sql`ps."name"`,
          Prisma.sql`p."brand"`,
          Prisma.sql`p."sport"`,
        ];
        conditions.push(Prisma.sql`(${Prisma.join(terms.map(
          term => Prisma.sql`STRPOS(LOWER(COALESCE(${term}, '')), LOWER(${q})) > 0`,
        ), " OR ")})`);
      }
      if (sport) conditions.push(Prisma.sql`LOWER(p."sport") = LOWER(${sport})`);
      if (Number.isInteger(year) && year >= 1850 && year <= 2100)
        conditions.push(Prisma.sql`p."year" = ${year}`);
      if (onlyNeed) conditions.push(Prisma.sql`COALESCE(h.qty, 0) = 0`);

      const ranking = sort === "prestige" ? Prisma.sql`
          CASE WHEN "prestigeCopiesNeeded" > 0 THEN 0 ELSE 1 END ASC,
          "prestigeCopiesNeeded" ASC, "prestigeNextLevel" DESC, "cardId" ASC
        ` : sort === "price_asc" ? Prisma.sql`"bookPrice" ASC, "cardId" ASC`
        : sort === "price_desc" ? Prisma.sql`"bookPrice" DESC, "cardId" ASC`
        : sort === "name" ? Prisma.sql`"playerName" ASC, "cardId" ASC`
        : sort === "recent" ? Prisma.sql`"lastStocked" DESC, "cardId" ASC`
        : Prisma.sql`"stockQty" DESC, "lastStocked" DESC, "cardId" ASC`;

      rankedRows = await prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        WITH held AS (
          SELECT "cardId", SUM(qty)::int AS qty FROM (
            SELECT "cardId", quantity AS qty FROM "CardOwnership"
              WHERE "userId" = ${user.id} AND quantity > 0
            UNION ALL
            SELECT "cardId", quantity AS qty FROM "GradingOrder"
              WHERE "userId" = ${user.id} AND quantity > 0 AND "revealedAt" IS NULL
          ) all_held GROUP BY "cardId"
        ), levels AS (
          SELECT c."productSetId", COALESCE(MIN(COALESCE(h.qty, 0)), 0)::int AS level
          FROM "Card" c LEFT JOIN held h ON h."cardId" = c.id
          WHERE c."productSetId" IS NOT NULL
          GROUP BY c."productSetId"
        ), candidates AS (
          SELECT si."cardId" AS "cardId",
            si.quantity AS "stockQty", si."updatedAt" AS "lastStocked",
            c."bookValue" AS "bookPrice", c.player AS "playerName",
            CASE WHEN c."productSetId" IS NULL THEN NULL ELSE
              (GREATEST(COALESCE(l.level, 0), COALESCE(pr."timesCompleted", 0)) + 1)::int
            END AS "prestigeNextLevel",
            CASE WHEN c."productSetId" IS NULL THEN 0 ELSE
              GREATEST(0, GREATEST(COALESCE(l.level, 0), COALESCE(pr."timesCompleted", 0))
                + 1 - COALESCE(h.qty, 0))::int
            END AS "prestigeCopiesNeeded"
          FROM "ShopInventory" si
            JOIN "Card" c ON c.id = si."cardId"
            LEFT JOIN "ProductSet" ps ON ps.id = c."productSetId"
            LEFT JOIN "Product" p ON p.id = ps."productId"
            LEFT JOIN held h ON h."cardId" = c.id
            LEFT JOIN levels l ON l."productSetId" = c."productSetId"
            LEFT JOIN "ProductSetPrestige" pr
              ON pr."productSetId" = c."productSetId" AND pr."userId" = ${user.id}
          WHERE ${Prisma.join(conditions, " AND ")}
        )
        SELECT "cardId", "prestigeNextLevel", "prestigeCopiesNeeded",
          COUNT(*) OVER()::int AS "total"
        FROM candidates
        WHERE ${onlyPrestige ? Prisma.sql`"prestigeCopiesNeeded" > 0` : Prisma.sql`TRUE`}
        ORDER BY ${ranking}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `);
    }
    const rankById = new Map(rankedRows.map(row => [row.cardId, row]));
    const rankedIds = rankedRows.map(row => row.cardId);
    const total = usePrestigeIndex
      ? (rankedRows[0]?.total ?? 0)
      : await prisma.shopInventory.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const unsortedStock = await prisma.shopInventory.findMany({
      where: usePrestigeIndex ? { cardId: { in: rankedIds } } : where,
      orderBy,
      ...(usePrestigeIndex ? {} : { skip: (safePage - 1) * pageSize, take: pageSize }),
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

    const cardOrder = new Map(rankedIds.map((id, index) => [id, index]));
    const stock = usePrestigeIndex
      ? unsortedStock.sort((a, b) => (cardOrder.get(a.cardId) ?? 0) - (cardOrder.get(b.cardId) ?? 0))
      : unsortedStock;
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
      const nextLevel = usePrestigeIndex
        ? (rankById.get(r.cardId)?.prestigeNextLevel ?? null)
        : c.productSetId ? nextLevelBySet.get(c.productSetId) ?? null : null;
      const copiesNeeded = nextLevel === null ? 0 : Math.max(0, nextLevel - (owned + inGrading));
      const product = c.productSet?.product;
      return {
        cardId: r.cardId, quantity: r.quantity, updatedAt: r.updatedAt,
        youOwnQty: owned + inGrading, heldQty: owned, pendingQty: inGrading,
        prestigeNextLevel: nextLevel,
        prestigeCopiesNeeded: copiesNeeded,
        neededForPrestige: copiesNeeded > 0,
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
