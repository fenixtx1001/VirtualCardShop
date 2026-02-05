// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const rows = await prisma.sealedInventory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        product: {
          select: {
            id: true,
            packPriceCents: true,
            cardsPerPack: true,
            packImageUrl: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      rows: rows.map((r) => ({
        productId: r.productId,
        packsOwned: r.packsOwned ?? 0,
        updatedAt: r.updatedAt,
        packPriceCents: r.product?.packPriceCents ?? 0,
        cardsPerPack: r.product?.cardsPerPack ?? null,
        packImageUrl: r.product?.packImageUrl ?? null,
      })),
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load inventory" },
      { status }
    );
  }
}
