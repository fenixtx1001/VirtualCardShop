// src/app/sets/[setId]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getParams(ctx: any) {
  const p: any = ctx?.params;
  const params = typeof p?.then === "function" ? await p : p;

  const setId = typeof params?.setId === "string" ? decodeURIComponent(params.setId) : "";
  return { setId };
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

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const { setId } = await getParams(ctx);

    if (!setId || setId === "undefined") {
      return NextResponse.json({ error: "Missing setId in route params" }, { status: 400 });
    }

    const set = await prisma.set.findUnique({
      where: { id: setId },
      include: {
        _count: { select: { cards: true } },
      },
    });

    if (!set) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, set });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load set" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: any) {
  try {
    const { setId } = await getParams(ctx);

    if (!setId || setId === "undefined") {
      return NextResponse.json({ error: "Missing setId in route params" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const updated = await prisma.set.update({
      where: { id: setId },
      data: {
        year: numberOrNull(body.year) ?? undefined,
        brand: stringOrNull(body.brand) ?? undefined,
        sport: stringOrNull(body.sport) ?? undefined,
        packPriceCents: numberOrNull(body.packPriceCents) ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, set: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: any) {
  try {
    const { setId } = await getParams(ctx);

    if (!setId || setId === "undefined") {
      return NextResponse.json({ error: "Missing setId in route params" }, { status: 400 });
    }

    const cards = await prisma.card.findMany({
      where: { setId },
      select: { id: true },
    });
    const cardIds = cards.map((c) => c.id);

    await prisma.$transaction(async (tx) => {
      if (cardIds.length) {
        await tx.cardOwnership.deleteMany({
          where: { cardId: { in: cardIds } },
        });
      }

      await tx.card.deleteMany({ where: { setId } });
      await tx.set.delete({ where: { id: setId } });
    });

    return NextResponse.json({
      ok: true,
      deletedSetId: setId,
      deletedCards: cardIds.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 });
  }
}
