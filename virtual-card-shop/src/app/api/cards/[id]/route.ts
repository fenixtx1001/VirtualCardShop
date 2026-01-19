import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } } | { params: Promise<{ id: string }> };

async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  return params?.id as string | undefined;
}

export async function PUT(req: Request, ctx: Ctx) {
  const idStr = await getId(ctx);
  const id = Number(idStr);

  if (!idStr || !Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  const updated = await prisma.card.update({
    where: { id },
    data: {
      cardNumber: body.cardNumber ?? undefined,
      player: body.player ?? undefined,
      team: body.team ?? null,
      position: body.position ?? null,
      subset: body.subset ?? null,
      insert: body.insert ?? null,
      variant: body.variant ?? null,
      quantityOwned:
        typeof body.quantityOwned === "number" && Number.isFinite(body.quantityOwned)
          ? body.quantityOwned
          : 0,
      bookValue:
        typeof body.bookValue === "number" && Number.isFinite(body.bookValue)
          ? body.bookValue
          : 0,

      // ✅ NEW
      imageUrl: body.imageUrl ?? null,

      // keep attachment stable if provided
      productSetId: body.productSetId ?? undefined,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const idStr = await getId(ctx);
  const id = Number(idStr);

  if (!idStr || !Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
  }

  await prisma.card.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
