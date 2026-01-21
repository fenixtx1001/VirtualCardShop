import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx =
  | { params: { productSetId?: string; productsetid?: string } }
  | { params: Promise<{ productSetId?: string; productsetid?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.productSetId ?? params?.productsetid;

  // Next can sometimes pass already-decoded; decode safely either way
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

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const productSetId = await getParam(ctx);

    if (!productSetId || productSetId === "undefined") {
      return NextResponse.json(
        { error: "Missing productSetId in route params" },
        { status: 400 }
      );
    }

    const productSet = await prisma.productSet.findUnique({
      where: { id: productSetId },
      include: {
        product: true,
        _count: { select: { cards: true } },
        cards: {
          orderBy: [{ cardNumber: "asc" }],
          take: 5000, // bump as needed
        },
      },
    });

    if (!productSet) {
      return NextResponse.json({ error: "Product Set not found" }, { status: 404 });
    }

    return NextResponse.json(productSet);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load product set" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const productSetId = await getParam(ctx);

    if (!productSetId || productSetId === "undefined") {
      return NextResponse.json(
        { error: "Missing productSetId in route params" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const isBase =
      typeof body.isBase === "boolean" ? body.isBase : undefined;
    const isInsert =
      typeof body.isInsert === "boolean" ? body.isInsert : undefined;

    // Enforce mutual exclusivity (server-side too)
    if (isBase === true && isInsert === true) {
      return NextResponse.json(
        { error: "A Product Set cannot be both Base and Insert." },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: e?.message ?? "Save failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const productSetId = await getParam(ctx);

    if (!productSetId || productSetId === "undefined") {
      return NextResponse.json(
        { error: "Missing productSetId in route params" },
        { status: 400 }
      );
    }

    // Pull card ids first so we can delete ownership rows safely.
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
    // Common: Prisma throws if productSet doesn't exist
    return NextResponse.json(
      { error: e?.message ?? "Delete failed" },
      { status: 500 }
    );
  }
}
