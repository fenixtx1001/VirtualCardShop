// src/app/api/grading/submit/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { createFinancialTransaction } from "@/lib/financial-transactions";
import {
  RAW_GRADE,
  bookValueToCents,
  calculateGradedValueCents,
  calculateGradingFeeCents,
  calculateReadyAt,
  getEffectiveGradeability,
  labelGradeability,
  rollVcsGrade,
} from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorStatus(e: unknown) {
  if (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    typeof (e as { status?: unknown }).status === "number"
  ) {
    return (e as { status: number }).status;
  }

  return 500;
}

function getErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return "Grading submission failed";
}

function makeHttpError(message: string, status: number) {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const rawCardId = Number(body?.cardId);
    const rawQuantity = Number(body?.quantity ?? 1);

    if (!Number.isInteger(rawCardId) || rawCardId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid cardId" }, { status: 400 });
    }

    if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid quantity" }, { status: 400 });
    }

    const cardId = rawCardId;
    const quantity = Math.floor(rawQuantity);

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.card.findUnique({
        where: { id: cardId },
        select: {
          id: true,
          cardNumber: true,
          player: true,
          team: true,
          position: true,
          subset: true,
          variant: true,
          bookValue: true,
          frontImageUrl: true,
          gradeabilityOverride: true,
          productSet: {
            select: {
              id: true,
              name: true,
              defaultGradeability: true,
              product: {
                select: {
                  id: true,
                  year: true,
                  brand: true,
                  sport: true,
                },
              },
            },
          },
          set: {
            select: {
              id: true,
              year: true,
              brand: true,
              sport: true,
            },
          },
        },
      });

      if (!card) {
        throw makeHttpError("Card not found", 404);
      }

      const rawOwnership = await tx.cardOwnership.findUnique({
        where: {
          userId_cardId_grade: {
            userId: user.id,
            cardId,
            grade: RAW_GRADE,
          },
        },
        select: {
          id: true,
          quantity: true,
        },
      });

      if (!rawOwnership || rawOwnership.quantity < quantity) {
        throw makeHttpError("You do not have enough raw copies of this card to grade", 400);
      }

      const u = await tx.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });

      if (!u) {
        throw makeHttpError("User not found", 404);
      }

      const gradeability = getEffectiveGradeability({
        cardOverride: card.gradeabilityOverride,
        productSetDefault: card.productSet?.defaultGradeability,
      });

      const rawBookValueCents = bookValueToCents(card.bookValue);
      const feePerCardCents = calculateGradingFeeCents(rawBookValueCents);
      const totalFeeCents = feePerCardCents * quantity;

      if ((u.balanceCents ?? 0) < totalFeeCents) {
        throw makeHttpError("Insufficient funds", 400);
      }

      const order = await tx.gradingOrder.create({
        data: {
          userId: user.id,
          cardId,
          quantity,
          feePaidCents: totalFeeCents,
          status: "PENDING",
          createdAt: now,
          readyAt: calculateReadyAt({ now, gradeability }),
        },
        select: {
          id: true,
          status: true,
          quantity: true,
          feePaidCents: true,
          createdAt: true,
          readyAt: true,
        },
      });

      const gradeCounts = new Map<number, number>();

      for (let i = 0; i < quantity; i += 1) {
        const grade = rollVcsGrade(gradeability);
        gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
      }

      const sortedResults = [...gradeCounts.entries()].sort(([a], [b]) => a - b);

      await tx.gradingOrderResult.createMany({
        data: sortedResults.map(([grade, resultQuantity]) => ({
          gradingOrderId: order.id,
          grade,
          quantity: resultQuantity,
        })),
      });

      await tx.cardOwnership.update({
        where: { id: rawOwnership.id },
        data: { quantity: { decrement: quantity } },
      });

      const eligibleBoxCards = await tx.ripBoxCard.findMany({
        where: {
          cardId,
          ripBox: {
            userId: user.id,
          },
        },
        select: {
          id: true,
          ripBoxId: true,
          quantity: true,
          soldQuantity: true,
          firstPulledAt: true,
        },
        orderBy: [{ firstPulledAt: "asc" }, { id: "asc" }],
      });

      let remainingToAttribute = quantity;
      let linkedQuantity = 0;
      let linkedRipBoxId: number | null = null;

      for (const boxCard of eligibleBoxCards) {
        if (remainingToAttribute <= 0) break;

        const alreadySold = boxCard.soldQuantity ?? 0;
        const availableFromBox = Math.max(0, boxCard.quantity - alreadySold);
        if (availableFromBox <= 0) continue;

        const qtyForThisBox = Math.min(availableFromBox, remainingToAttribute);

        if (linkedRipBoxId === null) {
          linkedRipBoxId = boxCard.ripBoxId;
          linkedQuantity = qtyForThisBox;
        } else if (linkedRipBoxId === boxCard.ripBoxId) {
          linkedQuantity += qtyForThisBox;
        }

        remainingToAttribute -= qtyForThisBox;
      }

      if (linkedRipBoxId !== null && linkedQuantity > 0) {
        await tx.ripBoxGradingOrder.create({
          data: {
            ripBoxId: linkedRipBoxId,
            gradingOrderId: order.id,
            cardId,
            quantity: linkedQuantity,
          },
        });
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balanceCents: { decrement: totalFeeCents } },
        select: { balanceCents: true },
      });

      await createFinancialTransaction({
        tx,
        userId: user.id,
        category: "GRADING_FEE",
        amountCents: -totalFeeCents,
        description: `Submitted ${quantity}x ${card.player} #${card.cardNumber} for grading`,
        balanceAfterCents: updatedUser.balanceCents ?? 0,
        metadata: {
          cardId,
          quantity,
          feePerCardCents,
          totalFeeCents,
          gradingOrderId: order.id,
          ripBoxId: linkedRipBoxId,
          ripBoxLinkedQuantity: linkedQuantity,
          ripBoxUnattributedQuantity: remainingToAttribute,
        },
      });

      return {
        order,
        card,
        gradeability,
        gradeabilityLabel: labelGradeability(gradeability),
        rawBookValueCents,
        feePerCardCents,
        totalFeeCents,
        estimatedValueByGradeCents: {
          6: calculateGradedValueCents({ rawBookValueCents, gradeability, grade: 6 }),
          7: calculateGradedValueCents({ rawBookValueCents, gradeability, grade: 7 }),
          8: calculateGradedValueCents({ rawBookValueCents, gradeability, grade: 8 }),
          9: calculateGradedValueCents({ rawBookValueCents, gradeability, grade: 9 }),
          10: calculateGradedValueCents({ rawBookValueCents, gradeability, grade: 10 }),
        },
        balanceCents: updatedUser.balanceCents ?? 0,
        rawQuantityRemaining: rawOwnership.quantity - quantity,
        ripBoxId: linkedRipBoxId,
        ripBoxLinkedQuantity: linkedQuantity,
        ripBoxUnattributedQuantity: remainingToAttribute,
      };
    });

    return NextResponse.json({
      ok: true,
      order: {
        id: result.order.id,
        status: result.order.status,
        quantity: result.order.quantity,
        feePaidCents: result.order.feePaidCents,
        createdAt: result.order.createdAt,
        readyAt: result.order.readyAt,
      },
      card: {
        id: result.card.id,
        cardNumber: result.card.cardNumber,
        player: result.card.player,
        team: result.card.team,
        position: result.card.position,
        subset: result.card.subset,
        variant: result.card.variant,
        frontImageUrl: result.card.frontImageUrl,
        set: result.card.set,
        productSet: result.card.productSet,
      },
      gradeability: result.gradeability,
      gradeabilityLabel: result.gradeabilityLabel,
      rawBookValueCents: result.rawBookValueCents,
      feePerCardCents: result.feePerCardCents,
      totalFeeCents: result.totalFeeCents,
      estimatedValueByGradeCents: result.estimatedValueByGradeCents,
      balanceCents: result.balanceCents,
      rawQuantityRemaining: result.rawQuantityRemaining,
      ripBoxId: result.ripBoxId,
      ripBoxLinkedQuantity: result.ripBoxLinkedQuantity,
      ripBoxUnattributedQuantity: result.ripBoxUnattributedQuantity,
    });
  } catch (e: unknown) {
    const status = getErrorStatus(e);

    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status });
  }
}