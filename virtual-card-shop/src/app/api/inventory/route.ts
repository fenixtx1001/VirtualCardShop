// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { inventoryProgressQuery } from "@/lib/inventory-queries";
import type { InventorySetProgress } from "@/lib/inventory";

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
            sport: true,
            year: true,
            brand: true,
          },
        },
      },
    });

    let progress: InventorySetProgress[] = [];
    let progressAvailable = true;
    if (rows.length) {
      try {
        progress = await prisma.$queryRaw<InventorySetProgress[]>(inventoryProgressQuery(user.id, rows.map((r) => r.productId)));
      } catch (error) {
        console.error("Inventory progress unavailable", error);
        progressAvailable = false;
      }
    }
    const byProduct = new Map<string, InventorySetProgress[]>();
    for (const set of progress) byProduct.set(set.productId, [...(byProduct.get(set.productId) || []), set]);

    return NextResponse.json({
      ok: true,
      progressAvailable,
      rows: rows.map((r) => ({
        productId: r.productId,
        packsOwned: r.packsOwned ?? 0,
        updatedAt: r.updatedAt,
        packPriceCents: r.product?.packPriceCents ?? 0,
        cardsPerPack: r.product?.cardsPerPack ?? null,
        packImageUrl: r.product?.packImageUrl ?? null,
        sport: r.product?.sport?.trim() || null,
        year: r.product?.year ?? null,
        brand: r.product?.brand ?? null,
        sets: byProduct.get(r.productId) || [],
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load inventory" },
      { status }
    );
  }
}
