// src/app/api/grading/orders/route.ts
import { NextResponse } from "next/server";
import type { Gradeability, GradingOrderStatus } from "@prisma/client";
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

type ClientGradingOrderStatus =
  | "PENDING"
  | "READY"
  | "REVEALED"
  | "CANCELLED"
  | "COMPLETED";

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
  return "Failed to load grading orders";
}

function getClientStatus(input: {
  dbStatus: GradingOrderStatus;
  readyAt: Date | null;
  revealedAt: Date | null;
  now: Date;
}): ClientGradingOrderStatus {
  if (input.dbStatus === "CANCELLED") return "CANCELLED";
  if (input.dbStatus === "COMPLETED") return "COMPLETED";
  if (input.dbStatus === "REVEALED") return "REVEALED";

  if (input.readyAt && input.readyAt.getTime() <= input.now.getTime()) {
    return "READY";
  }

  return "PENDING";
}

function getMillisecondsRemaining(input: {
  status: ClientGradingOrderStatus;
  readyAt: Date | null;
  now: Date;
}) {
  if (input.status !== "PENDING" || !input.readyAt) return 0;
  return Math.max(0, input.readyAt.getTime() - input.now.getTime());
}

function parseStatusFilter(value: string | null): ClientGradingOrderStatus | "ALL" {
  if (
    value === "PENDING" ||
    value === "READY" ||
    value === "REVEALED" ||
    value === "CANCELLED" ||
    value === "COMPLETED"
  ) {
    return value;
  }

  return "ALL";
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();

    const url = new URL(req.url);
    const statusFilter = parseStatusFilter(url.searchParams.get("status"));

    const now = new Date();

    const orders = await prisma.gradingOrder.findMany({
      where: {
        userId: user.id,
        status: {
          not: "CANCELLED",
        },
      },
      orderBy: [
        { readyAt: "asc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: {
        id: true,
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

    const mappedOrders = orders.map((order) => {
      const gradeability = getEffectiveGradeability({
        cardOverride: order.card.gradeabilityOverride,
        productSetDefault: order.card.productSet?.defaultGradeability,
      });

      const clientStatus = getClientStatus({
        dbStatus: order.status,
        readyAt: order.readyAt,
        revealedAt: order.revealedAt,
        now,
      });

      const rawBookValueCents = bookValueToCents(order.card.bookValue);

      const revealedResults =
        clientStatus === "REVEALED" || clientStatus === "COMPLETED"
          ? order.results.map((result) => ({
              id: result.id,
              grade: result.grade,
              quantity: result.quantity,
              valueCents: calculateGradedValueCents({
                rawBookValueCents,
                gradeability,
                grade: result.grade,
              }),
            }))
          : [];

      const totalRevealedValueCents = revealedResults.reduce((sum, result) => {
        return sum + result.valueCents * result.quantity;
      }, 0);

      return {
        id: order.id,
        status: clientStatus,
        dbStatus: order.status,
        quantity: order.quantity,
        feePaidCents: order.feePaidCents,
        resultGrade:
          clientStatus === "REVEALED" || clientStatus === "COMPLETED"
            ? order.resultGrade
            : null,
        createdAt: order.createdAt,
        readyAt: order.readyAt,
        revealedAt: order.revealedAt,
        completedAt: order.completedAt,
        millisecondsRemaining: getMillisecondsRemaining({
          status: clientStatus,
          readyAt: order.readyAt,
          now,
        }),
        card: {
          id: order.card.id,
          cardNumber: order.card.cardNumber,
          player: order.card.player,
          team: order.card.team,
          position: order.card.position,
          subset: order.card.subset,
          variant: order.card.variant,
          frontImageUrl: order.card.frontImageUrl,
          set: order.card.set,
          productSet: order.card.productSet,
        },
        gradeability,
        gradeabilityLabel: labelGradeability(gradeability as Gradeability),
        rawBookValueCents,
        results: revealedResults,
        totalRevealedValueCents,
      };
    });

    const filteredOrders =
      statusFilter === "ALL"
        ? mappedOrders
        : mappedOrders.filter((order) => order.status === statusFilter);

    const counts = mappedOrders.reduce(
      (acc, order) => {
        acc.ALL += 1;
        acc[order.status] += 1;
        return acc;
      },
      {
        ALL: 0,
        PENDING: 0,
        READY: 0,
        REVEALED: 0,
        CANCELLED: 0,
        COMPLETED: 0,
      } satisfies Record<ClientGradingOrderStatus | "ALL", number>
    );

    return NextResponse.json({
      ok: true,
      now,
      statusFilter,
      counts,
      orders: filteredOrders,
    });
  } catch (e: unknown) {
    const status = getErrorStatus(e);

    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status }
    );
  }
}