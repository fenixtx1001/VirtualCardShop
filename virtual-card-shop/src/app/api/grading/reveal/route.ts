// src/app/api/grading/reveal/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  bookValueToCents,
  calculateGradedValueCents,
  getEffectiveGradeability,
  labelGradeability,
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
  return "Failed to reveal grading order";
}

function makeHttpError(message: string, status: number) {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

function getOrderStatus(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const rawOrderId = Number(body?.orderId);

    if (!Number.isInteger(rawOrderId) || rawOrderId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid orderId" },
        { status: 400 }
      );
    }

    const orderId = rawOrderId;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.gradingOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          cardId: true,
          quantity: true,
          feePaidCents: true,
          resultGrade: true,
          status: true,
          createdAt: true,
          readyAt: true,
          revealedAt: true,
          completedAt: true,
          card: {
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
          },
          results: {
            orderBy: { grade: "asc" },
            select: {
              id: true,
              grade: true,
              quantity: true,
            },
          },
        },
      });

      if (!order) {
        throw makeHttpError("Grading order not found", 404);
      }

      if (order.userId !== user.id) {
        throw makeHttpError("Grading order not found", 404);
      }

      const status = getOrderStatus(order.status);

      if (status === "CANCELLED") {
        throw makeHttpError("This grading order was cancelled", 400);
      }

      const gradeability = getEffectiveGradeability({
        cardOverride: order.card.gradeabilityOverride,
        productSetDefault: order.card.productSet?.defaultGradeability,
      });

      const rawBookValueCents = bookValueToCents(order.card.bookValue);

      if (status === "REVEALED" || status === "COMPLETED") {
        const revealedResults = order.results.map((row) => ({
          id: row.id,
          grade: row.grade,
          quantity: row.quantity,
          valueCents: calculateGradedValueCents({
            rawBookValueCents,
            gradeability,
            grade: row.grade,
          }),
        }));

        return {
          order: {
            ...order,
            status,
          },
          gradeability,
          gradeabilityLabel: labelGradeability(gradeability),
          rawBookValueCents,
          results: revealedResults,
          totalRevealedValueCents: revealedResults.reduce((sum, row) => {
            return sum + row.valueCents * row.quantity;
          }, 0),
          balanceCents: null as number | null,
          alreadyRevealed: true,
        };
      }

      if (!order.readyAt || order.readyAt.getTime() > now.getTime()) {
        throw makeHttpError("This grading order is not ready yet", 400);
      }

      if (order.results.length === 0) {
        throw makeHttpError("This grading order has no results", 500);
      }

      const resultQuantity = order.results.reduce((sum, row) => {
        return sum + row.quantity;
      }, 0);

      if (resultQuantity !== order.quantity) {
        throw makeHttpError("This grading order has invalid results", 500);
      }

      for (const row of order.results) {
        await tx.cardOwnership.upsert({
          where: {
            userId_cardId_grade: {
              userId: user.id,
              cardId: order.cardId,
              grade: row.grade,
            },
          },
          create: {
            userId: user.id,
            cardId: order.cardId,
            grade: row.grade,
            gradedAt: now,
            quantity: row.quantity,
          },
          update: {
            quantity: { increment: row.quantity },
            gradedAt: now,
          },
        });
      }

      const primaryResult = [...order.results].sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return b.grade - a.grade;
      })[0];

      await tx.gradingOrder.update({
        where: { id: order.id },
        data: {
          status: "REVEALED",
          revealedAt: now,
          resultGrade: primaryResult?.grade ?? null,
        },
      });

      const updatedUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { balanceCents: true },
      });

      const revealedResults = order.results.map((row) => ({
        id: row.id,
        grade: row.grade,
        quantity: row.quantity,
        valueCents: calculateGradedValueCents({
          rawBookValueCents,
          gradeability,
          grade: row.grade,
        }),
      }));

      return {
        order: {
          ...order,
          status: "REVEALED",
          revealedAt: now,
          resultGrade: primaryResult?.grade ?? null,
        },
        gradeability,
        gradeabilityLabel: labelGradeability(gradeability),
        rawBookValueCents,
        results: revealedResults,
        totalRevealedValueCents: revealedResults.reduce((sum, row) => {
          return sum + row.valueCents * row.quantity;
        }, 0),
        balanceCents: updatedUser?.balanceCents ?? null,
        alreadyRevealed: false,
      };
    });

    return NextResponse.json({
      ok: true,
      alreadyRevealed: result.alreadyRevealed,
      order: {
        id: result.order.id,
        status: result.order.status,
        quantity: result.order.quantity,
        feePaidCents: result.order.feePaidCents,
        resultGrade: result.order.resultGrade,
        createdAt: result.order.createdAt,
        readyAt: result.order.readyAt,
        revealedAt: result.order.revealedAt,
        completedAt: result.order.completedAt,
      },
      card: {
        id: result.order.card.id,
        cardNumber: result.order.card.cardNumber,
        player: result.order.card.player,
        team: result.order.card.team,
        position: result.order.card.position,
        subset: result.order.card.subset,
        variant: result.order.card.variant,
        frontImageUrl: result.order.card.frontImageUrl,
        set: result.order.card.set,
        productSet: result.order.card.productSet,
      },
      gradeability: result.gradeability,
      gradeabilityLabel: result.gradeabilityLabel,
      rawBookValueCents: result.rawBookValueCents,
      results: result.results,
      totalRevealedValueCents: result.totalRevealedValueCents,
      balanceCents: result.balanceCents,
    });
  } catch (e: unknown) {
    const status = getErrorStatus(e);

    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status }
    );
  }
}