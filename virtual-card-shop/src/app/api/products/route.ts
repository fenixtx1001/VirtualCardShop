import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function stringOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { id: "asc" },
    include: {
      _count: { select: { productSets: true } },
    },
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const id = stringOrNull(body?.id);
  if (!id) return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });

  const created = await prisma.product.create({
    data: {
      id,
      year: body?.year ?? null,
      brand: stringOrNull(body?.brand),
      sport: stringOrNull(body?.sport),
      packPriceCents: body?.packPriceCents ?? 0,
      packsPerBox: body?.packsPerBox ?? null,
      packImageUrl: stringOrNull(body?.packImageUrl),
      boxImageUrl: stringOrNull(body?.boxImageUrl),
      cardsPerPack: intOrNull(body?.cardsPerPack), // ✅
    },
  });

  return NextResponse.json(created);
}
