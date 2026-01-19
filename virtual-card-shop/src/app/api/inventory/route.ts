import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser, DEFAULT_USER_ID } from "@/lib/default-user";

export async function GET() {
  // Ensure the canonical user exists
  await getOrCreateDefaultUser();

  const items = await prisma.sealedInventory.findMany({
    where: { userId: DEFAULT_USER_ID },
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
}
