// src/app/api/shop/sell/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { bookValueToPerCardCents, calcSellTotalCents } from "@/lib/shop-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAW_GRADE = 0;

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");
  if (message.length > 260) message = message.slice(0, 260) + "…";
  return { code, message };
}

function parseGrade(value: any) {
  if (value == null || value === "") return RAW_GRADE;

  const grade = Number(value);
  if (!Number.isInteger(grade)) return null;
  if (grade === RAW_GRADE) return RAW_GRADE;
  if (grade >= 6 && grade <= 10) return grade;

  return null;
}

/**
 * POST: sell to shop using an offer
 * Body: { offerId: number, quantity: number, grade?: number }
 *
 * Rules:
 * - offer must belong to user
 * - offer must be active (not expired, not accepted)
 * - user intentionally chooses which grade bucket to sell
 * - quantity <= owned in that exact grade bucket
 * - accepting any quantity ends the offer
 * - shop inventory increments
 * - user balance increments
 *
 * Note:
 * - grade 0 = raw/ungraded
 * - grade 6-10 = VCS graded
 * - current UI may omit grade; omitted grade defaults to raw for backward compatibility
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const offerId = Number(body?.offerId);
    const quantity = Number(body?.quantity);
    const selectedGrade = parseGrade(body?.grade);

    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid offerId." }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid quantity." }, { status: 400 });
    }
    if (selectedGrade == null) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid grade. Use 0 for raw or 6-10 for VCS graded cards." },
        { status: 400 }
      );
    }

    const now = new Date();

    const out = await prisma.$transaction(async (tx) => {
      const offer = await tx.shopOffer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          userId: true,
          cardId: true,
          offerBps: true,
          expiresAt: true,
          acceptedAt: true,
        },
      });

      if (!offer) return { ok: false as const, status: 404 as const, error: "Offer not found." };
      if (offer.userId !== user.id) return { ok: false as const, status: 403 as const, error: "Not allowed." };
      if (offer.acceptedAt) return { ok: false as const, status: 400 as const, error: "Offer already accepted." };
      if (offer.expiresAt.getTime() <= now.getTime()) return { ok: false as const, status: 400 as const, error: "Offer expired." };

      const card = await tx.card.findUnique({
        where: { id: offer.cardId },
        select: { id: true, bookValue: true },
      });
      if (!card) return { ok: false as const, status: 404 as const, error: "Card not found." };

      const perCardCents = bookValueToPerCardCents(card.bookValue);
      if (perCardCents <= 0) return { ok: false as const, status: 400 as const, error: "Card has no book value." };

      const own = await tx.cardOwnership.findUnique({
        where: {
          userId_cardId_grade: {
            userId: user.id,
            cardId: offer.cardId,
            grade: selectedGrade,
          },
        },
        select: { id: true, quantity: true, grade: true },
      });

      const ownedQty = own?.quantity ?? 0;
      const sellQty = Math.floor(quantity);

      const gradeLabel = selectedGrade === RAW_GRADE ? "raw" : `VCS ${selectedGrade}`;

      if (!own || ownedQty <= 0) {
        return { ok: false as const, status: 400 as const, error: `You do not own this ${gradeLabel} version of the card.` };
      }
      if (sellQty > ownedQty) {
        return { ok: false as const, status: 400 as const, error: `You only own ${ownedQty} of this ${gradeLabel} version.` };
      }

      // For now, offers are still based on raw book value.
      // Soon, this should become grade-aware so VCS 9/10 payouts are higher.
      const totalCents = calcSellTotalCents(perCardCents, sellQty, offer.offerBps);

      // 1) decrement ownership from the exact selected grade bucket
      await tx.cardOwnership.update({
        where: { id: own.id },
        data: { quantity: ownedQty - sellQty },
      });

      // 2) increment shop inventory
      // Existing ShopInventory is not grade-aware yet, so it tracks total copies in shop.
      // We will upgrade this later if the shop needs to resell graded versions distinctly.
      await tx.shopInventory.upsert({
        where: { cardId: offer.cardId },
        create: { cardId: offer.cardId, quantity: sellQty },
        update: { quantity: { increment: sellQty } },
      });

      // 3) credit user balance
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { increment: totalCents } },
        select: { balanceCents: true },
      });

      // 4) mark offer accepted (ends it immediately)
      await tx.shopOffer.update({
        where: { id: offer.id },
        data: {
          acceptedAt: now,
          acceptedQty: sellQty,
          acceptedTotalCents: totalCents,
        },
      });

      // 5) record transaction
      await tx.shopTransaction.create({
        data: {
          userId: user.id,
          cardId: offer.cardId,
          kind: selectedGrade === RAW_GRADE ? "SELL_TO_SHOP" : `SELL_TO_SHOP_VCS_${selectedGrade}`,
          quantity: sellQty,
          perCardCents,
          totalCents,
          offerBps: offer.offerBps,
        },
      });

      return {
        ok: true as const,
        status: 200 as const,
        balanceCents: updatedUser.balanceCents,
        totalCents,
        perCardCents,
        quantity: sellQty,
        offerBps: offer.offerBps,
        grade: selectedGrade,
      };
    });

    if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to sell to shop.", extra: shortErr(e) }, { status: 500 });
  }
}