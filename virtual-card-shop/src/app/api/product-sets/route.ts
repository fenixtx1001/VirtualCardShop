export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() === "") return null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseBooleanFilter(value: string | null) {
  return value === "true";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const page = clampInt(
      Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
      1,
      999999
    );

    const pageSize = clampInt(
      Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50,
      5,
      100
    );

    const q = (url.searchParams.get("q") ?? "").trim();
    const productId = (url.searchParams.get("productId") ?? "").trim();
    const sport = (url.searchParams.get("sport") ?? "").trim();
    const yearText = (url.searchParams.get("year") ?? "").trim();

    const onlyBase = parseBooleanFilter(url.searchParams.get("onlyBase"));
    const onlyInsert = parseBooleanFilter(url.searchParams.get("onlyInsert"));

    const year =
      yearText && Number.isFinite(Number(yearText))
        ? Number(yearText)
        : null;

    const conditions: Prisma.Sql[] = [];

    if (productId) {
      conditions.push(Prisma.sql`ps."productId" = ${productId}`);
    }

    if (onlyBase) {
      conditions.push(Prisma.sql`ps."isBase" = true`);
    }

    if (onlyInsert) {
      conditions.push(Prisma.sql`ps."isInsert" = true`);
    }

    if (sport) {
      conditions.push(
        Prisma.sql`LOWER(COALESCE(p."sport", '')) = LOWER(${sport})`
      );
    }

    if (year !== null) {
      conditions.push(Prisma.sql`p."year" = ${year}`);
    }

    if (q) {
      const searchTerms = q
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean);

      for (const term of searchTerms) {
        const searchPattern = `%${term}%`;

        conditions.push(
          Prisma.sql`
            (
              ps.id ILIKE ${searchPattern}
              OR REPLACE(ps.id, '_', ' ') ILIKE ${searchPattern}
              OR ps."productId" ILIKE ${searchPattern}
              OR REPLACE(ps."productId", '_', ' ') ILIKE ${searchPattern}
              OR COALESCE(ps.name, '') ILIKE ${searchPattern}
              OR COALESCE(p.brand, '') ILIKE ${searchPattern}
              OR COALESCE(p.sport, '') ILIKE ${searchPattern}
              OR COALESCE(p."year"::text, '') ILIKE ${searchPattern}
            )
          `
        );
      }
    }

    const whereSql =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.empty;

    const totalRows = await prisma.$queryRaw<Array<{ total: number }>>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "ProductSet" ps
        LEFT JOIN "Product" p ON p.id = ps."productId"
        ${whereSql}
      `
    );

    const total = Number(totalRows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const offset = (safePage - 1) * pageSize;

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        productId: string;
        name: string | null;
        isBase: boolean;
        isInsert: boolean;
        oddsPerPack: number | null;
        commonPrice: number | null;
        semiStarPrice: number | null;
        unlistedStarPrice: number | null;
        star1Price: number | null;
        star2Price: number | null;
        star3Price: number | null;
        totalCards: number;
        pricedCards: number;
        frontCards: number;
        backCards: number;
      }>
    >(
      Prisma.sql`
        SELECT
          ps.id,
          ps."productId" AS "productId",
          ps.name,
          ps."isBase" AS "isBase",
          ps."isInsert" AS "isInsert",
          ps."oddsPerPack"::float AS "oddsPerPack",
          ps."commonPrice"::float AS "commonPrice",
          ps."semiStarPrice"::float AS "semiStarPrice",
          ps."unlistedStarPrice"::float AS "unlistedStarPrice",
          ps."star1Price"::float AS "star1Price",
          ps."star2Price"::float AS "star2Price",
          ps."star3Price"::float AS "star3Price",
          COALESCE(stats."totalCards", 0)::int AS "totalCards",
          COALESCE(stats."pricedCards", 0)::int AS "pricedCards",
          COALESCE(stats."frontCards", 0)::int AS "frontCards",
          COALESCE(stats."backCards", 0)::int AS "backCards"
        FROM "ProductSet" ps
        LEFT JOIN "Product" p ON p.id = ps."productId"
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS "totalCards",
            COALESCE(
              SUM(
                CASE
                  WHEN c."bookValue" IS NOT NULL AND c."bookValue" > 0
                  THEN 1
                  ELSE 0
                END
              ),
              0
            )::int AS "pricedCards",
            COALESCE(
              SUM(
                CASE
                  WHEN c."frontImageUrl" IS NOT NULL
                    AND TRIM(c."frontImageUrl") <> ''
                  THEN 1
                  ELSE 0
                END
              ),
              0
            )::int AS "frontCards",
            COALESCE(
              SUM(
                CASE
                  WHEN c."backImageUrl" IS NOT NULL
                    AND TRIM(c."backImageUrl") <> ''
                  THEN 1
                  ELSE 0
                END
              ),
              0
            )::int AS "backCards"
          FROM "Card" c
          WHERE c."productSetId" = ps.id
        ) stats ON true
        ${whereSql}
        ORDER BY
          ps."productId" ASC,
          CASE
            WHEN ps."isBase" = true THEN 0
            WHEN ps."isInsert" = true THEN 1
            ELSE 2
          END ASC,
          ps.id ASC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `
    );

    const shapedRows = rows.map((row) => {
      const totalCards = Number(row.totalCards ?? 0);
      const pricedCards = Number(row.pricedCards ?? 0);
      const frontCards = Number(row.frontCards ?? 0);
      const backCards = Number(row.backCards ?? 0);

      const pct = (count: number) =>
        totalCards > 0
          ? Math.round((count / totalCards) * 1000) / 10
          : 0;

      return {
        id: row.id,
        productId: row.productId,
        name: row.name,
        isBase: row.isBase,
        isInsert: row.isInsert,
        oddsPerPack: row.oddsPerPack,
        commonPrice: row.commonPrice,
        semiStarPrice: row.semiStarPrice,
        unlistedStarPrice: row.unlistedStarPrice,
        star1Price: row.star1Price,
        star2Price: row.star2Price,
        star3Price: row.star3Price,
        _count: {
          cards: totalCards,
        },
        stats: {
          totalCards,
          pricedCards,
          frontCards,
          backCards,
          pctPriced: pct(pricedCards),
          pctFront: pct(frontCards),
          pctBack: pct(backCards),
        },
      };
    });

    return NextResponse.json({
      ok: true,
      rows: shapedRows,
      page: safePage,
      pageSize,
      total,
      totalPages,
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to load product sets";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const productId =
      typeof body?.productId === "string" ? body.productId.trim() : "";
    const name =
      typeof body?.name === "string" ? body.name.trim() : null;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    if (!productId) {
      return NextResponse.json(
        { error: "Missing required field: productId" },
        { status: 400 }
      );
    }

    const isBase = !!body?.isBase;
    const isInsert = !!body?.isInsert;

    if (isBase && isInsert) {
      return NextResponse.json(
        { error: "A Product Set cannot be both Base and Insert." },
        { status: 400 }
      );
    }

    const oddsPerPack =
      body?.oddsPerPack === null ||
      body?.oddsPerPack === undefined ||
      body?.oddsPerPack === ""
        ? null
        : Number(body.oddsPerPack);

    if (oddsPerPack !== null && !Number.isFinite(oddsPerPack)) {
      return NextResponse.json(
        { error: "oddsPerPack must be a number or null." },
        { status: 400 }
      );
    }

    const created = await prisma.productSet.create({
      data: {
        id,
        productId,
        name,
        isBase,
        isInsert,
        oddsPerPack,
        commonPrice: numberOrNull(body?.commonPrice),
        semiStarPrice: numberOrNull(body?.semiStarPrice),
        unlistedStarPrice: numberOrNull(body?.unlistedStarPrice),
        star1Price: numberOrNull(body?.star1Price),
        star2Price: numberOrNull(body?.star2Price),
        star3Price: numberOrNull(body?.star3Price),
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to create product set";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}