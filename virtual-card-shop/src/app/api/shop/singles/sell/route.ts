// src/app/api/shop/singles/sell/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  bookValueToPerCardCents,
  calcShopSellQuote,
  getShopGradeability,
  labelShopGrade,
} from "@/lib/shop-offers";
import { RAW_GRADE } from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * grade 0 = raw/ungraded
 * grade 6-10 = VCS graded
 *
 * Raw cards pay from raw book value.
 * VCS graded cards pay from graded value + 10% offer-bps bonus.
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

      if (!offer) {
        return { ok: false as const, status: 404 as const, error: "Offer not found." };
      }

      if (offer.userId !== user.id) {
        return { ok: false as const, status: 403 as const, error: "Not allowed." };
      }

      if (offer.acceptedAt) {
        return { ok: false as const, status: 400 as const, error: "Offer already accepted." };
      }

      if (offer.expiresAt.getTime() <= now.getTime()) {
        return { ok: false as const, status: 400 as const, error: "Offer expired." };
      }

      const card = await tx.card.findUnique({
        where: { id: offer.cardId },
        select: {
          id: true,
          bookValue: true,
          gradeabilityOverride: true,
          productSet: {
            select: {
              defaultGradeability: true,
            },
          },
        },
      });

      if (!card) {
        return { ok: false as const, status: 404 as const, error: "Card not found." };
      }

      const rawBookValueCents = bookValueToPerCardCents(card.bookValue);
      if (rawBookValueCents <= 0) {
        return { ok: false as const, status: 400 as const, error: "Card has no book value." };
      }

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
      const gradeLabel = labelShopGrade(selectedGrade);

      if (!own || ownedQty <= 0) {
        return {
          ok: false as const,
          status: 400 as const,
          error: `You do not own this ${gradeLabel} version of the card.`,
        };
      }

      if (sellQty > ownedQty) {
        return {
          ok: false as const,
          status: 400 as const,
          error: `You only own ${ownedQty} of this ${gradeLabel} version.`,
        };
      }

      const gradeability = getShopGradeability({
        cardOverride: card.gradeabilityOverride,
        productSetDefault: card.productSet?.defaultGradeability,
      });

      const quote = calcShopSellQuote({
        rawBookValueCents,
        quantity: sellQty,
        baseOfferBps: offer.offerBps,
        grade: selectedGrade,
        gradeability,
      });

      if (quote.totalCents <= 0) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "This sale would pay $0.00.",
        };
      }

      await tx.cardOwnership.update({
        where: { id: own.id },
        data: { quantity: ownedQty - sellQty },
      });

      // Shop inventory is still card-level, not grade-level. This means the shop can
      // resell the card generically for now. We can upgrade inventory to track slabs
      // later if you want a true graded singles marketplace.
      await tx.shopInventory.upsert({
        where: { cardId: offer.cardId },
        create: { cardId: offer.cardId, quantity: sellQty },
        update: { quantity: { increment: sellQty } },
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { increment: quote.totalCents } },
        select: { balanceCents: true },
      });

      await tx.shopOffer.update({
        where: { id: offer.id },
        data: {
          acceptedAt: now,
          acceptedQty: sellQty,
          acceptedTotalCents: quote.totalCents,
        },
      });

      await tx.shopTransaction.create({
        data: {
          userId: user.id,
          cardId: offer.cardId,
          kind: selectedGrade === RAW_GRADE ? "SELL_TO_SHOP" : `SELL_TO_SHOP_VCS_${selectedGrade}`,
          quantity: sellQty,

          // Raw: raw book value. Graded: calculated graded value.
          perCardCents: quote.perCardValueCents,
          totalCents: quote.totalCents,

          // Raw: original offer. Graded: original offer + graded bonus.
          offerBps: quote.effectiveOfferBps,
        },
      });

      return {
        ok: true as const,
        status: 200 as const,
        balanceCents: updatedUser.balanceCents,

        quantity: sellQty,
        grade: selectedGrade,
        gradeLabel,

        rawBookValueCents,
        perCardCents: quote.perCardValueCents,
        totalCents: quote.totalCents,

        baseOfferBps: quote.baseOfferBps,
        offerBps: quote.effectiveOfferBps,
        effectiveOfferBps: quote.effectiveOfferBps,
        gradedOfferBonusBps: quote.effectiveOfferBps - quote.baseOfferBps,
        gradeability,
      };
    });

    if (!out.ok) {
      return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
    }

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to sell to shop.", extra: shortErr(e) },
      { status: 500 }
    );
  }
}