import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx =
  | { params: { productId?: string; productid?: string } }
  | { params: Promise<{ productId?: string; productid?: string }> };

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const productId = params?.productId ?? params?.productid;
  return productId as string | undefined;
}

export async function GET(_req: Request, ctx: Ctx) {
  const productId = await getParam(ctx);

  if (!productId || productId === "undefined") {
    return NextResponse.json(
      { error: "Missing productId in route params" },
      { status: 400 }
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      productSets: {
        orderBy: [{ isBase: "desc" }, { name: "asc" }, { id: "asc" }],
        include: {
          _count: { select: { cards: true } },
        },
      },
      _count: { select: { productSets: true } },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function PUT(req: Request, ctx: Ctx) {
  const productId = await getParam(ctx);

  if (!productId || productId === "undefined") {
    return NextResponse.json(
      { error: "Missing productId in route params" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      year: body.year ?? null,
      brand: body.brand ?? null,
      sport: body.sport ?? null,
      packPriceCents: typeof body.packPriceCents === "number" ? body.packPriceCents : 0,
      packsPerBox: body.packsPerBox ?? null,
      packImageUrl: body.packImageUrl ?? null,
      boxImageUrl: body.boxImageUrl ?? null,
    },
  });

  return NextResponse.json(updated);
}
