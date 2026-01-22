// src/app/sets/[setId]/cards/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

async function getParams(ctx: any) {
  const p: any = ctx?.params;
  const params = typeof p?.then === "function" ? await p : p;

  const setId = typeof params?.setId === "string" ? decodeURIComponent(params.setId) : "";
  const id = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";

  return { setId, id };
}

export async function GET(_req: NextRequest, ctx: any) {
  try {
    const { setId, id } = await getParams(ctx);

    if (!setId || !id) {
      return NextResponse.json({ error: "Missing setId or id in route params" }, { status: 400 });
    }

    const cardIdNum = Number(id);
    if (!Number.isFinite(cardIdNum)) {
      return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
    }

    const card = await prisma.card.findFirst({
      where: { id: cardIdNum, setId },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, card });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load card" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: any) {
  try {
    const { setId, id } = await getParams(ctx);

    if (!setId || !id) {
      return NextResponse.json({ error: "Missing setId or id in route params" }, { status: 400 });
    }

    const cardIdNum = Number(id);
    if (!Number.isFinite(cardIdNum)) {
      return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const existing = await prisma.card.findFirst({
      where: { id: cardIdNum, setId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const updated = await prisma.card.update({
      where: { id: cardIdNum },
      data: {
        cardNumber: stringOrNull(body.cardNumber) ?? undefined,
        player: stringOrNull(body.player) ?? undefined,
        team: stringOrNull(body.team) ?? undefined,
        position: stringOrNull(body.position) ?? undefined,
        subset: stringOrNull(body.subset) ?? undefined,
        variant: stringOrNull(body.variant) ?? undefined,

        bookValue: numberOrNull(body.bookValue) ?? undefined,
        quantityOwned: numberOrNull(body.quantityOwned) ?? undefined,

        frontImageUrl: stringOrNull(body.frontImageUrl) ?? undefined,
        backImageUrl: stringOrNull(body.backImageUrl) ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, card: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: any) {
  try {
    const { setId, id } = await getParams(ctx);

    if (!setId || !id) {
      return NextResponse.json({ error: "Missing setId or id in route params" }, { status: 400 });
    }

    const cardIdNum = Number(id);
    if (!Number.isFinite(cardIdNum)) {
      return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
    }

    const existing = await prisma.card.findFirst({
      where: { id: cardIdNum, setId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    await prisma.cardOwnership.deleteMany({ where: { cardId: cardIdNum } });
    await prisma.card.delete({ where: { id: cardIdNum } });

    return NextResponse.json({ ok: true, deletedId: cardIdNum });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 });
  }
}
