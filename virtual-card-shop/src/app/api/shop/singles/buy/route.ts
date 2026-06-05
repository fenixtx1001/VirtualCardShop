// src/app/api/shop/singles/buy/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { bookValueToPerCardCents } from "@/lib/shop-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAW_GRADE = 0;

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");
  if (message.length > 260) message = message.slice(0, 260) + "…";
  return { code, message };
}

/**
 * POST: buy a single from shop inventory at 100% book value
 * Body: { cardId: number, quantity: number }
 *
 * Current shop inventory is not grade-aware yet, so all purchased singles
 * are added to the buyer's raw/ungraded ownership bucket: grade = 0.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const cardId = Number(body?.cardId);
    const quantity = Number(body?.quantity);

    if (!Number.isFinite(cardId) || cardId <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid cardId." }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid quantity." }, { status: 400 });
    }

    const buyQty = Math.floor(quantity);

    const out = await prisma.$transaction(async (tx) => {
      const card = await tx.card.findUnique({
        where: { id: cardId },
        select: { id: true, bookValue: true },
      });
      if (!card) return { ok: false as const, status: 404 as const, error: "Card not found." };

      const perCardCents = bookValueToPerCardCents(card.bookValue);
      if (perCardCents <= 0) return { ok: false as const, status: 400 as const, error: "Card has no book value." };

      const inv = await tx.shopInventory.findUnique({
        where: { cardId },
        select: { id: true, quantity: true },
      });
      const available = inv?.quantity ?? 0;

      if (!inv || available <= 0) return { ok: false as const, status: 400 as const, error: "Shop has no inventory for this card." };
      if (buyQty > available) return { ok: false as const, status: 400 as const, error: `Shop only has ${available} of this card.` };

      const totalCents = perCardCents * buyQty;

      const me = await tx.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });
      const bal = me?.balanceCents ?? 0;
      if (totalCents > bal) return { ok: false as const, status: 400 as const, error: "Insufficient funds." };

      await tx.shopInventory.update({
        where: { id: inv.id },
        data: { quantity: available - buyQty },
      });

      await tx.cardOwnership.upsert({
        where: {
          userId_cardId_grade: {
            userId: user.id,
            cardId,
            grade: RAW_GRADE,
          },
        },
        create: {
          userId: user.id,
          cardId,
          grade: RAW_GRADE,
          quantity: buyQty,
          gradedAt: null,
        },
        update: { quantity: { increment: buyQty } },
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { decrement: totalCents } },
        select: { balanceCents: true },
      });

      await tx.shopTransaction.create({
        data: {
          userId: user.id,
          cardId,
          kind: "BUY_FROM_SHOP",
          quantity: buyQty,
          perCardCents,
          totalCents,
        },
      });

      return {
        ok: true as const,
        status: 200 as const,
        balanceCents: updatedUser.balanceCents,
        totalCents,
        perCardCents,
        quantity: buyQty,
      };
    });

    if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to buy single.", extra: shortErr(e) }, { status: 500 });
  }
}