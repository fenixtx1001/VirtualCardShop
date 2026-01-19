import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser, DEFAULT_USER_ID } from "@/lib/default-user";

type Body =
  | { productId: string; kind: "pack"; quantity: number }
  | { productId: string; kind: "box"; quantity: number };

function computeBoxPriceCents(packPriceCents: number, packsPerBox: number) {
  // 25% box discount
  return Math.round(packPriceCents * packsPerBox * 0.75);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Body>;

  const productId = String((body as any).productId ?? "");
  const kind = (body as any).kind as "pack" | "box";
  const quantity = Number((body as any).quantity);

  if (!productId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  }
  if (kind !== "pack" && kind !== "box") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
    return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  }

  // Ensure canonical user exists (SAME user used by economy)
  const user = await getOrCreateDefaultUser();

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const packPrice = typeof product.packPriceCents === "number" ? product.packPriceCents : 0;
  const packsPerBox = typeof product.packsPerBox === "number" ? product.packsPerBox : 0;

  let costCents = 0;
  let packsToAdd = 0;

  if (kind === "pack") {
    costCents = packPrice * quantity;
    packsToAdd = quantity;
  } else {
    if (!packsPerBox || packsPerBox <= 0) {
      return NextResponse.json(
        { error: "Product has no packsPerBox set" },
        { status: 400 }
      );
    }
    costCents = computeBoxPriceCents(packPrice, packsPerBox) * quantity;
    packsToAdd = packsPerBox * quantity;
  }

  if (user.balanceCents < costCents) {
    return NextResponse.json(
      {
        error: "Insufficient funds",
        balanceCents: user.balanceCents,
        costCents,
      },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: DEFAULT_USER_ID },
      data: { balanceCents: { decrement: costCents } },
      select: { balanceCents: true },
    });

    const inventory = await tx.sealedInventory.upsert({
      where: { userId_productId: { userId: DEFAULT_USER_ID, productId } },
      update: { packsOwned: { increment: packsToAdd } },
      create: {
        userId: DEFAULT_USER_ID,
        productId,
        packsOwned: packsToAdd,
      },
      select: { packsOwned: true },
    });

    return { updatedUser, inventory };
  });

  return NextResponse.json({
    ok: true,
    productId,
    kind,
    quantity,
    costCents,
    packsAdded: packsToAdd,
    balanceCents: updated.updatedUser.balanceCents,
    packsOwned: updated.inventory.packsOwned,
  });
}
