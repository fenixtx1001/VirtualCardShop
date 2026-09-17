import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { inventoryMissingQuery } from "@/lib/inventory-queries";
import type { MissingInventoryCard } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const productSetId = params.get("productSetId") || "";
    const offset = Number(params.get("offset") || 0);
    if (!productSetId || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
      return NextResponse.json({ ok: false, error: "Invalid checklist request." }, { status: 400 });
    }
    const set = await prisma.productSet.findUnique({ where: { id: productSetId }, select: { productId: true } });
    const inventory = set && await prisma.sealedInventory.findFirst({
      where: { productId: set.productId, userId: user.id }, select: { productId: true },
    });
    if (!set || !inventory) return NextResponse.json({ ok: false, error: "Product not found in your inventory." }, { status: 404 });
    const [result] = await prisma.$queryRaw<{ total: number; nextLevel: number | null; rows: MissingInventoryCard[] }[]>(
      inventoryMissingQuery(user.id, set.productId, productSetId, offset),
    );
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    const status = error && typeof error === "object" && "status" in error && error.status === 401 ? 401 : 500;
    return NextResponse.json({ ok: false, error: status === 401 ? "Sign in to view your cards." : "Couldn't load missing cards. Please try again." }, { status });
  }
}
