import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getShopPromotions } from "@/lib/shop/promotions";
import { productPrices } from "@/lib/shop/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const day = await getShopPromotions();
    const products = await prisma.product.findMany({
      where: { released: true }, orderBy: [{ year: "asc" }, { brand: "asc" }, { id: "asc" }],
      include: { _count: { select: { productSets: true } } },
    });
    return NextResponse.json(products.map((p) => {
      const prices = productPrices(p, day);
      return {
        id: p.id, year: p.year, brand: p.brand, sport: p.sport,
        packPriceCents: p.packPriceCents ?? 0, packsPerBox: p.packsPerBox,
        cardsPerPack: p.cardsPerPack,
        boxPriceCents: prices.standardBoxPriceCents,
        packImageUrl: p.packImageUrl?.trim() || null,
        boxImageUrl: p.boxImageUrl?.trim() || null,
        displayBoxImageUrl: p.boxImageUrl?.trim() || p.packImageUrl?.trim() || null,
        productSetsCount: p._count.productSets, released: p.released,
        createdAt: p.createdAt,
        isNewProduct: Date.now() - p.createdAt.getTime() >= 0 && Date.now() - p.createdAt.getTime() < 7 * 86400000,
        ...prices,
      };
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Shop products failed", error);
    return NextResponse.json({ error: "Couldn't load the shop. Please try again." }, { status: 500 });
  }
}
