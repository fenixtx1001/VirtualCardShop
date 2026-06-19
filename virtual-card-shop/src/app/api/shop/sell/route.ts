// src/app/api/shop/sell/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { createFinancialTransaction } from "@/lib/financial-transactions";
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

function getPercentOfValueBps(input: { amountCents: number; valueBasisCents: number }) {
  if (input.valueBasisCents <= 0) return 0;
  return Math.round((input.amountCents / input.valueBasisCents) * 10000);
}

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
          cardNumber: true,
          player: true,
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

      const shopTransaction = await tx.shopTransaction.create({
        data: {
          userId: user.id,
          cardId: offer.cardId,
          kind: selectedGrade === RAW_GRADE ? "SELL_TO_SHOP" : `SELL_TO_SHOP_VCS_${selectedGrade}`,
          quantity: sellQty,
          perCardCents: quote.perCardValueCents,
          totalCents: quote.totalCents,
          offerBps: quote.effectiveOfferBps,
        },
      });

      await tx.cardSaleHistory.create({
        data: {
          cardId: offer.cardId,
          grade: selectedGrade,
          saleType: "SHOP",
          buyerType: "SHOP",
          sellerUserId: user.id,
          buyerUserId: null,
          salePriceCents: quote.totalCents,
          valueBasisCents: quote.perCardValueCents * sellQty,
          percentOfValueBps: getPercentOfValueBps({
            amountCents: quote.totalCents,
            valueBasisCents: quote.perCardValueCents * sellQty,
          }),
          shopTransactionId: shopTransaction.id,
        },
      });

      const eligibleBoxCards = await tx.ripBoxCard.findMany({
        where: {
          cardId: offer.cardId,
          ripBox: {
            userId: user.id,
          },
        },
        select: {
          id: true,
          quantity: true,
          soldQuantity: true,
          realizedCents: true,
          ripBoxId: true,
          firstPulledAt: true,
          ripBox: {
            select: {
              createdAt: true,
            },
          },
        },
        orderBy: [{ firstPulledAt: "asc" }, { id: "asc" }],
      });

      let remainingToAttribute = sellQty;
      let remainingCentsToAttribute = quote.totalCents;
      const attribution: { ripBoxId: number; ripBoxCardId: number; quantity: number; cents: number }[] = [];

      for (const boxCard of eligibleBoxCards) {
        if (remainingToAttribute <= 0) break;

        const alreadySold = boxCard.soldQuantity ?? 0;
        const availableFromBox = Math.max(0, boxCard.quantity - alreadySold);
        if (availableFromBox <= 0) continue;

        const qtyForThisBox = Math.min(availableFromBox, remainingToAttribute);

        const centsForThisBox =
          remainingToAttribute === qtyForThisBox
            ? remainingCentsToAttribute
            : Math.round((quote.totalCents * qtyForThisBox) / sellQty);

        await tx.ripBoxCard.update({
          where: { id: boxCard.id },
          data: {
            soldQuantity: { increment: qtyForThisBox },
            realizedCents: { increment: centsForThisBox },
          },
        });

        attribution.push({
          ripBoxId: boxCard.ripBoxId,
          ripBoxCardId: boxCard.id,
          quantity: qtyForThisBox,
          cents: centsForThisBox,
        });

        remainingToAttribute -= qtyForThisBox;
        remainingCentsToAttribute -= centsForThisBox;
      }

      await createFinancialTransaction({
        tx,
        userId: user.id,
        category: "CARD_SALE",
        amountCents: quote.totalCents,
        description: `Sold ${sellQty}x ${card.player} #${card.cardNumber} to shop`,
        balanceAfterCents: updatedUser.balanceCents ?? 0,
        metadata: {
          cardId: offer.cardId,
          quantity: sellQty,
          grade: selectedGrade,
          perCardCents: quote.perCardValueCents,
          totalCents: quote.totalCents,
          offerBps: quote.effectiveOfferBps,
          shopTransactionId: shopTransaction.id,
          ripBoxAttribution: attribution,
          unattributedQuantity: remainingToAttribute,
          unattributedCents: remainingCentsToAttribute,
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

        shopTransactionId: shopTransaction.id,
        ripBoxAttribution: attribution,
        unattributedQuantity: remainingToAttribute,
        unattributedCents: remainingCentsToAttribute,
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