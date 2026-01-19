import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function stringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
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
  if (!id) {
    return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
  }

  // Create a product with sensible defaults
  const created = await prisma.product.create({
    data: {
      id,
      year: intOrNull(body?.year),
      brand: stringOrNull(body?.brand),
      sport: stringOrNull(body?.sport),
      packPriceCents: intOrNull(body?.packPriceCents) ?? 0,
      packsPerBox: intOrNull(body?.packsPerBox),
      packImageUrl: stringOrNull(body?.packImageUrl),
      boxImageUrl: stringOrNull(body?.boxImageUrl),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
