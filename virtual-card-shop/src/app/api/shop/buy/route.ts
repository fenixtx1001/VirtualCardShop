// src/app/api/shop/buy/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BuyKind = "pack" | "box";

function calcCostCents(params: {
  kind: BuyKind;
  quantity: number;
  packPriceCents: number;
  packsPerBox: number | null;
}) {
  const { kind, quantity, packPriceCents, packsPerBox } = params;

  if (kind === "pack") {
    return packPriceCents * quantity;
  }

  const ppb = packsPerBox ?? 0;
  const boxPrice = Math.round(packPriceCents * ppb * 0.75); // your rule: packPrice * packsPerBox * 0.75
  return boxPrice * quantity;
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

    const packPriceCents = product.packPriceCents ?? 0;
    const costCents = calcCostCents({
      kind,
      quantity,
      packPriceCents,
      packsPerBox: product.packsPerBox ?? null,
    });

    const packsToAdd =
      kind === "pack" ? quantity : (product.packsPerBox ?? 0) * quantity;

    if (packsToAdd <= 0) {
      return NextResponse.json(
        { ok: false, error: "Product packsPerBox is missing/invalid for box purchase" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // lock user balance row first
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

      // decrement balance
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { decrement: costCents } },
        select: { balanceCents: true },
      });

      // upsert sealed inventory for THIS user
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
