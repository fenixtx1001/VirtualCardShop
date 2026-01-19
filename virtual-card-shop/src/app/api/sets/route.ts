export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sets = await prisma.set.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { cards: true } } },
  });

  return NextResponse.json({ ok: true, sets });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? "").toString().trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const brand = body?.brand != null ? String(body.brand) : null;
  const sport = body?.sport != null ? String(body.sport) : null;

  // store cents (integer) if provided, else null
  const packPriceCents =
    body?.packPriceCents === "" || body?.packPriceCents == null
      ? null
      : Number(body.packPriceCents);

  const created = await prisma.set.upsert({
    where: { id },
    update: { brand, sport, packPriceCents: Number.isFinite(packPriceCents as any) ? (packPriceCents as number) : null },
    create: { id, brand, sport, packPriceCents: Number.isFinite(packPriceCents as any) ? (packPriceCents as number) : null },
  });

  return NextResponse.json({ ok: true, set: created });
}
