import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx =
  | { params: { id?: string } }
  | { params: Promise<{ id?: string }> };

async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.id;
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
}

function numOrNull(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Invalid card id" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    // Back-compat: if older UI sends imageUrl, treat it as frontImageUrl
    const frontImageUrl =
      typeof body.frontImageUrl === "string"
        ? body.frontImageUrl
        : typeof body.imageUrl === "string"
        ? body.imageUrl
        : null;

    const backImageUrl =
      typeof body.backImageUrl === "string" ? body.backImageUrl : null;

    const updated = await prisma.card.update({
      where: { id },
      data: {
        cardNumber: strOrNull(body.cardNumber) ?? undefined,
        player: strOrNull(body.player) ?? undefined,
        team: strOrNull(body.team),
        position: strOrNull(body.position),
        subset: strOrNull(body.subset),
        variant: strOrNull(body.variant),

        // ✅ DO NOT send `insert` — it is removed/unused in your flow now.

        quantityOwned: numOrNull(body.quantityOwned) ?? undefined,
        bookValue: numOrNull(body.bookValue) ?? undefined,

        frontImageUrl,
        backImageUrl,
      },
    });

    return NextResponse.json({ ok: true, card: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Save failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const id = await getId(ctx);
    if (!id) return NextResponse.json({ error: "Invalid card id" }, { status: 400 });

    await prisma.card.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Delete failed" },
      { status: 500 }
    );
  }
}
