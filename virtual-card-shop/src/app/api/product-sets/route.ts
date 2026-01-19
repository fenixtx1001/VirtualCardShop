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
  const productSets = await prisma.productSet.findMany({
    orderBy: [{ productId: "asc" }, { isBase: "desc" }, { name: "asc" }, { id: "asc" }],
    include: {
      product: true,
      _count: { select: { cards: true } },
    },
  });

  return NextResponse.json(productSets);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const id = stringOrNull(body?.id);
  const productId = stringOrNull(body?.productId);

  if (!id) return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
  if (!productId) return NextResponse.json({ error: "Missing required field: productId" }, { status: 400 });

  // Ensure product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const created = await prisma.productSet.create({
    data: {
      id,
      productId,
      name: stringOrNull(body?.name),
      isBase: Boolean(body?.isBase),
      oddsPerPack: intOrNull(body?.oddsPerPack),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
