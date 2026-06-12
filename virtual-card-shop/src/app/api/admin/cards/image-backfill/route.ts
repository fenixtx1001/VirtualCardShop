import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ImageGap = "front" | "back" | "either";

type ImageBackfillRow = {
  id: number;
  setId: string;
  productSetId: string | null;
  cardNumber: string;
  player: string;
  team: string | null;
  position: string | null;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  quantityOwned: number;
  frontImageUrl: string | null;
  backImageUrl: string | null;

  productSetName: string | null;
  productSetDefaultGradeability: "COMMON" | "GREAT" | "ICONIC" | null;

  productId: string | null;
  productYear: number | null;
  productBrand: string | null;
  productSport: string | null;

  setYear: number | null;
  setBrand: string | null;
  setSport: string | null;
};

function getImageGap(value: string | null): ImageGap {
  if (value === "back") return "back";
  if (value === "either") return "either";
  return "front";
}

function getLimit(value: string | null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 250;
  return Math.min(Math.max(Math.trunc(n), 25), 500);
}

function getMissingImageSql(imageGap: ImageGap) {
  if (imageGap === "front") {
    return Prisma.sql`AND (c."frontImageUrl" IS NULL OR c."frontImageUrl" = '')`;
  }

  if (imageGap === "back") {
    return Prisma.sql`AND (c."backImageUrl" IS NULL OR c."backImageUrl" = '')`;
  }

  return Prisma.sql`
    AND (
      c."frontImageUrl" IS NULL OR c."frontImageUrl" = ''
      OR c."backImageUrl" IS NULL OR c."backImageUrl" = ''
    )
  `;
}

function getSearchSql(search: string) {
  if (!search.trim()) return Prisma.empty;

  const like = `%${search.trim()}%`;

  return Prisma.sql`
    AND (
      c."player" ILIKE ${like}
      OR c."team" ILIKE ${like}
      OR c."cardNumber" ILIKE ${like}
      OR c."subset" ILIKE ${like}
      OR c."variant" ILIKE ${like}
      OR ps."name" ILIKE ${like}
      OR p."brand" ILIKE ${like}
      OR s."brand" ILIKE ${like}
    )
  `;
}

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
    const imageGap = getImageGap(req.nextUrl.searchParams.get("imageGap"));
    const limit = getLimit(req.nextUrl.searchParams.get("limit"));

    const rows = await prisma.$queryRaw<ImageBackfillRow[]>`
      SELECT
        c."id",
        c."setId",
        c."productSetId",
        c."cardNumber",
        c."player",
        c."team",
        c."position",
        c."subset",
        c."variant",
        c."bookValue",
        SUM(co."quantity")::int AS "quantityOwned",
        c."frontImageUrl",
        c."backImageUrl",

        ps."name" AS "productSetName",
        ps."defaultGradeability" AS "productSetDefaultGradeability",

        p."id" AS "productId",
        p."year" AS "productYear",
        p."brand" AS "productBrand",
        p."sport" AS "productSport",

        s."year" AS "setYear",
        s."brand" AS "setBrand",
        s."sport" AS "setSport"

      FROM "Card" c
      INNER JOIN "CardOwnership" co
        ON co."cardId" = c."id"
        AND co."quantity" > 0
      LEFT JOIN "ProductSet" ps
        ON ps."id" = c."productSetId"
      LEFT JOIN "Product" p
        ON p."id" = ps."productId"
      LEFT JOIN "Set" s
        ON s."id" = c."setId"

      WHERE 1 = 1
      ${getMissingImageSql(imageGap)}
      ${getSearchSql(search)}

      GROUP BY
        c."id",
        ps."id",
        p."id",
        s."id"

      ORDER BY
        (c."bookValue" * SUM(co."quantity")) DESC,
        c."bookValue" DESC,
        SUM(co."quantity") DESC,
        c."player" ASC,
        c."cardNumber" ASC

      LIMIT ${limit}
    `;

    const cards = rows.map((row) => ({
      id: row.id,
      setId: row.setId,
      productSetId: row.productSetId,
      cardNumber: row.cardNumber,
      player: row.player,
      team: row.team,
      position: row.position,
      subset: row.subset,
      variant: row.variant,
      bookValue: Number(row.bookValue ?? 0),
      quantityOwned: Number(row.quantityOwned ?? 0),
      frontImageUrl: row.frontImageUrl,
      backImageUrl: row.backImageUrl,
      productSet: row.productSetId
        ? {
            id: row.productSetId,
            name: row.productSetName,
            defaultGradeability: row.productSetDefaultGradeability ?? "COMMON",
            product: row.productId
              ? {
                  id: row.productId,
                  year: row.productYear,
                  brand: row.productBrand,
                  sport: row.productSport,
                }
              : null,
          }
        : null,
      set: {
        id: row.setId,
        year: row.setYear,
        brand: row.setBrand,
        sport: row.setSport,
      },
    }));

    return NextResponse.json({
      cards,
      meta: {
        imageGap,
        limit,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to load image backfill queue" },
      { status: 500 }
    );
  }
}