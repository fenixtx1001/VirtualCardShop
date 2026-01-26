import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx =
  | { params: { productSetId?: string; productsetid?: string } }
  | { params: Promise<{ productSetId?: string; productsetid?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.productSetId ?? params?.productsetid;
  const id = typeof raw === "string" ? decodeURIComponent(raw) : undefined;
  return id as string | undefined;
}

function stringOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const productSetId = await getParam(ctx);

    if (!productSetId || productSetId === "undefined") {
      return NextResponse.json({ error: "Missing productSetId in route params" }, { status: 400 });
    }

    const url = new URL(req.url);
    const page = clampInt(Number(url.searchParams.get("page") ?? "1"), 1, 999999);
    const pageSize = clampInt(Number(url.searchParams.get("pageSize") ?? "100"), 1, 500);

    // Get productSet + product + count (fast)
    const productSet = await prisma.productSet.findUnique({
      where: { id: productSetId },
      include: {
        product: true,
        _count: { select: { cards: true } },
      },
    });

    if (!productSet) {
      return NextResponse.json({ error: "Product Set not found" }, { status: 404 });
    }

    const totalCards = productSet._count?.cards ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const skip = (safePage - 1) * pageSize;

    /**
     * IMPORTANT:
     * We must sort numerically by cardNumber BEFORE pagination,
     * otherwise "10" comes before "2" and page 1 won't even include 2-9.
     *
     * SQLite numeric sort trick:
     * ORDER BY CAST(trim(cardNumber) AS INTEGER), then trim(cardNumber)
     *
     * This works well for normal numeric card numbers.
     * If you later have weird formats, we can expand the ORDER BY logic.
     */
    const cards = await prisma.$queryRaw<any[]>`
  SELECT
    "id",
    "cardNumber",
    "player",
    "team",
    "position",
    "subset",
    "variant",
    "quantityOwned",
    "bookValue",
    "frontImageUrl",
    "backImageUrl",
    "productSetId"
  FROM "Card"
  WHERE "productSetId" = ${productSetId}
  ORDER BY
    -- numeric-first sort for purely numeric card numbers
    CASE
      WHEN TRIM("cardNumber") ~ '^[0-9]+$' THEN 0
      ELSE 1
    END ASC,
    CASE
      WHEN TRIM("cardNumber") ~ '^[0-9]+$' THEN CAST(TRIM("cardNumber") AS INTEGER)
      ELSE NULL
    END ASC,
    TRIM("cardNumber") ASC,
    "id" ASC
  LIMIT ${pageSize} OFFSET ${skip};
`;

    return NextResponse.json({
      ...productSet,
      cards,
      pagination: {
        page: safePage,
        pageSize,
        totalCards,
        totalPages,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load product set" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const productSetId = await getParam(ctx);

    if (!productSetId || productSetId === "undefined") {
      return NextResponse.json({ error: "Missing productSetId in route params" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const isBase = typeof body.isBase === "boolean" ? body.isBase : undefined;
    const isInsert = typeof body.isInsert === "boolean" ? body.isInsert : undefined;

    if (isBase === true && isInsert === true) {
      return NextResponse.json({ error: "A Product Set cannot be both Base and Insert." }, { status: 400 });
    }

    const updated = await prisma.productSet.update({
      where: { id: productSetId },
      data: {
        name: stringOrNull(body.name) ?? undefined,
        isBase: isBase ?? undefined,
        isInsert: isInsert ?? undefined,
        oddsPerPack: numberOrNull(body.oddsPerPack),
      },
    });

    return NextResponse.json({ ok: true, productSet: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const productSetId = await getParam(ctx);

    if (!productSetId || productSetId === "undefined") {
      return NextResponse.json({ error: "Missing productSetId in route params" }, { status: 400 });
    }

    const cards = await prisma.card.findMany({
      where: { productSetId },
      select: { id: true },
    });
    const cardIds = cards.map((c) => c.id);

    await prisma.$transaction(async (tx) => {
      if (cardIds.length) {
        await tx.cardOwnership.deleteMany({
          where: { cardId: { in: cardIds } },
        });
      }

      await tx.card.deleteMany({
        where: { productSetId },
      });

      await tx.productSet.delete({
        where: { id: productSetId },
      });
    });

    return NextResponse.json({
      ok: true,
      deletedProductSetId: productSetId,
      deletedCards: cardIds.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 });
  }
}
