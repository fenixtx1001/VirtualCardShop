// src/app/api/shop/buy/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BuyKind = "pack" | "box";

function getDailySeed() {
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? "");
    const kind = String(body?.kind ?? "") as BuyKind;
    const quantity = Number(body?.quantity ?? 1);

    if (!productId) {
      return NextResponse.json({ ok: false, error: "Missing productId" }, { status: 400 });
    }
    if (kind !== "pack" && kind !== "box") {
      return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid quantity" }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where: { released: true },
      orderBy: [{ year: "asc" }, { brand: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    const seed = getDailySeed();
    const dailyIndex = products.length > 0 ? seed % products.length : -1;
    const dailyProductId = products[dailyIndex]?.id;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        packPriceCents: true,
        packsPerBox: true,
      },
    });

    if (!product) {
      return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
    }

    const isDailyDeal = productId === dailyProductId;

    const packPrice = product.packPriceCents ?? 0;
    const ppb = product.packsPerBox ?? 0;

    let unitCost = 0;

    if (kind === "pack") {
      unitCost = isDailyDeal ? Math.round(packPrice * 0.9) : packPrice;
    } else {
      const baseBox = Math.round(packPrice * ppb * 0.75);
      unitCost = isDailyDeal ? Math.round(baseBox * 0.9) : baseBox;
    }

    const costCents = unitCost * quantity;

    const packsToAdd =
      kind === "pack" ? quantity : (product.packsPerBox ?? 0) * quantity;

    if (packsToAdd <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid packsPerBox" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });

      if (!u) throw new Error("User not found");
      if ((u.balanceCents ?? 0) < costCents) {
        const err = new Error("Insufficient funds");
        (err as any).status = 400;
        throw err;
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { decrement: costCents } },
        select: { balanceCents: true },
      });

      const inv = await tx.sealedInventory.upsert({
        where: {
          userId_productId: {
            userId: user.id,
            productId,
          },
        },
        create: {
          userId: user.id,
          productId,
          packsOwned: packsToAdd,
        },
        update: {
          packsOwned: { increment: packsToAdd },
        },
        select: { packsOwned: true },
      });

      return {
        balanceCents: updatedUser.balanceCents ?? 0,
        packsOwned: inv.packsOwned ?? 0,
      };
    });

    return NextResponse.json({
      ok: true,
      productId,
      kind,
      quantity,
      costCents,
      packsAdded: packsToAdd,
      balanceCents: result.balanceCents,
      packsOwned: result.packsOwned,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Buy failed" },
      { status }
    );
  }
}