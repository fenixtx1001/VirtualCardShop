import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  ctx: { params: { setId: string; id: string } }
) {
  try {
    const setId = decodeURIComponent(ctx.params.setId);
    const id = Number(ctx.params.id);

    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { ok: false, error: "Invalid card id" },
        { status: 400 }
      );
    }

    const body = await req.json();

    // Only allow patching fields we expect from the admin UI
    const data: any = {};

    if (body.player !== undefined) data.player = String(body.player);
    if (body.team !== undefined) data.team = body.team === null ? null : String(body.team);
    if (body.position !== undefined) data.position = body.position === null ? null : String(body.position);
    if (body.subset !== undefined) data.subset = body.subset === null ? null : String(body.subset);
    if (body.insert !== undefined) data.insert = body.insert === null ? null : String(body.insert);
    if (body.variant !== undefined) data.variant = body.variant === null ? null : String(body.variant);

    // IMPORTANT: schema says bookValue is Float (dollars), not cents
    if (body.bookValue !== undefined) {
      const n = Number(body.bookValue);
      data.bookValue = Number.isFinite(n) ? n : 0;
    }

    const updated = await prisma.card.update({
      where: {
        // Make sure the card belongs to this set
        id,
        setId,
      },
      data,
    });

    return NextResponse.json({ ok: true, card: updated });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
