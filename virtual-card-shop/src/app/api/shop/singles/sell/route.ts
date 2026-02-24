// src/app/api/shop/singles/sell/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { bookValueToPerCardCents, calcSellTotalCents } from "@/lib/shop-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");
  if (message.length > 260) message = message.slice(0, 260) + "…";
  return { code, message };
}

/**
 * POST: sell to shop using an offer
 * Body: { offerId: number, quantity: number }
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const offerId = Number(body?.offerId);
    const quantity = Number(body?.quantity);

    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid offerId." }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid quantity." }, { status: 400 });
    }

    const now = new Date();

    const out = await prisma.$transaction(async (tx) => {
      const offer = await tx.shopOffer.findUnique({
        where: { id: offerId },
        select: { id: true, userId: true, cardId: true, offerBps: true, expiresAt: true, acceptedAt: true },
      });

      if (!offer) return { ok: false as const, status: 404 as const, error: "Offer not found." };
      if (offer.userId !== user.id) return { ok: false as const, status: 403 as const, error: "Not allowed." };
      if (offer.acceptedAt) return { ok: false as const, status: 400 as const, error: "Offer already accepted." };
      if (offer.expiresAt.getTime() <= now.getTime()) return { ok: false as const, status: 400 as const, error: "Offer expired." };

      const card = await tx.card.findUnique({ where: { id: offer.cardId }, select: { id: true, bookValue: true } });
      if (!card) return { ok: false as const, status: 404 as const, error: "Card not found." };

      const perCardCents = bookValueToPerCardCents(card.bookValue);
      if (perCardCents <= 0) return { ok: false as const, status: 400 as const, error: "Card has no book value." };

      const own = await tx.cardOwnership.findUnique({
        where: { userId_cardId: { userId: user.id, cardId: offer.cardId } },
        select: { id: true, quantity: true },
      });

      const ownedQty = own?.quantity ?? 0;
      const sellQty = Math.floor(quantity);

      if (!own || ownedQty <= 0) return { ok: false as const, status: 400 as const, error: "You do not own this card." };
      if (sellQty > ownedQty) return { ok: false as const, status: 400 as const, error: `You only own ${ownedQty} of this card.` };

      const totalCents = calcSellTotalCents(perCardCents, sellQty, offer.offerBps);

      await tx.cardOwnership.update({ where: { id: own.id }, data: { quantity: ownedQty - sellQty } });

      await tx.shopInventory.upsert({
        where: { cardId: offer.cardId },
        create: { cardId: offer.cardId, quantity: sellQty },
        update: { quantity: { increment: sellQty } },
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { increment: totalCents } },
        select: { balanceCents: true },
      });

      // Offer becomes inactive immediately when selling any qty
      await tx.shopOffer.update({
        where: { id: offer.id },
        data: { acceptedAt: now, acceptedQty: sellQty, acceptedTotalCents: totalCents },
      });

      await tx.shopTransaction.create({
        data: {
          userId: user.id,
          cardId: offer.cardId,
          kind: "SELL_TO_SHOP",
          quantity: sellQty,
          perCardCents,
          totalCents,
          offerBps: offer.offerBps,
        },
      });

      return { ok: true as const, status: 200 as const, balanceCents: updatedUser.balanceCents, totalCents, perCardCents, quantity: sellQty, offerBps: offer.offerBps };
    });

    if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to sell to shop.", extra: shortErr(e) }, { status: 500 });
  }
}
