// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export async function GET() {
  try {
    const user = await requireUser();

    const items = await prisma.sealedInventory.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        product: true,
      },
    });

    return NextResponse.json(
      items.map((i) => ({
        id: i.id,
        productId: i.productId,
        packsOwned: i.packsOwned,
        product: {
          id: i.product.id,
          year: i.product.year,
          brand: i.product.brand,
          sport: i.product.sport,
          packPriceCents: i.product.packPriceCents ?? 0,
          packsPerBox: i.product.packsPerBox,
          packImageUrl: i.product.packImageUrl,
          boxImageUrl: i.product.boxImageUrl,
        },
        updatedAt: i.updatedAt,
      }))
    );
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load inventory" },
      { status }
    );
  }
}
