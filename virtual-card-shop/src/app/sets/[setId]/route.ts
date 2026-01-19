export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { setId: string } }
) {
  try {
    // URL param will be encoded (spaces become %20)
    const setId = decodeURIComponent(params.setId);

    const set = await prisma.set.findUnique({
      where: { id: setId },
      include: { _count: { select: { cards: true } } },
    });

    if (!set) {
      return NextResponse.json(
        { ok: false, error: "Set not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, set });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { setId: string } }
) {
  try {
    const setId = decodeURIComponent(params.setId);
    const body = await req.json();

    // Only allow safe fields to be updated from the admin UI
    const patch: any = {};
    if ("year" in body) patch.year = body.year ?? null;
    if ("brand" in body) patch.brand = body.brand ?? null;
    if ("sport" in body) patch.sport = body.sport ?? null;
    if ("packPriceCents" in body)
      patch.packPriceCents =
        body.packPriceCents === null || body.packPriceCents === undefined
          ? null
          : Number(body.packPriceCents);

    const updated = await prisma.set.update({
      where: { id: setId },
      data: patch,
      include: { _count: { select: { cards: true } } },
    });

    return NextResponse.json({ ok: true, set: updated });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
