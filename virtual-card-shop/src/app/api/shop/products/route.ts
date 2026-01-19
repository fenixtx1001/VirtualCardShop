import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function computeBoxPriceCents(packPriceCents: number, packsPerBox: number) {
  // packPrice * packsPerBox * 0.75
  const raw = packPriceCents * packsPerBox * 0.75;
  return Math.round(raw);
}

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: [{ year: "asc" }, { brand: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { productSets: true } },
    },
  });

  const out = products.map((p) => {
    const pack = typeof p.packPriceCents === "number" ? p.packPriceCents : 0;
    const ppb = typeof p.packsPerBox === "number" ? p.packsPerBox : 0;
    const box = ppb > 0 ? computeBoxPriceCents(pack, ppb) : null;

    return {
      id: p.id,
      year: p.year,
      brand: p.brand,
      sport: p.sport,
      packPriceCents: pack,
      packsPerBox: p.packsPerBox,
      packImageUrl: p.packImageUrl,
      boxImageUrl: p.boxImageUrl,
      productSetsCount: p._count?.productSets ?? 0,
      boxPriceCents: box,
    };
  });

  return NextResponse.json(out);
}
