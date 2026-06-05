// src/app/api/collection/product/[productId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

type Ctx =
  | { params: { productId?: string } }
  | { params: Promise<{ productId?: string }> };

type GradeBreakdownRow = {
  grade: number;
  label: string;
  quantity: number;
};

type CardApiRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;

  // Total includes raw + revealed graded + pending grading.
  quantity: number;

  rawQuantity: number;
  gradedQuantity: number;
  pendingGradingQuantity: number;

  highestGrade: number | null;
  gradeBreakdown: GradeBreakdownRow[];

  bookValue: number | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
};

async function getParam(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.productId;
  const id = typeof raw === "string" ? decodeURIComponent(raw) : undefined;
  return (id ?? "").trim();
}

function gradeLabel(grade: number) {
  return grade === 0 ? "Raw" : `VCS ${grade}`;
}

function gradeSortValue(grade: number) {
  if (grade === 0) return -1;
  return grade;
}

function safeQty(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  try {
    const productId = await getParam(ctx);
    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    const user = await requireUser();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        productSets: {
          select: { id: true, isBase: true, name: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });
    }

    const url = new URL(req.url);
    const requested = (url.searchParams.get("productSetId") ?? "").trim();

    const baseSet = product.productSets.find((ps) => ps.isBase) ?? product.productSets[0];
    const selected =
      product.productSets.find((ps) => ps.id === requested) ??
      baseSet ??
      product.productSets[0];

    if (!selected) {
      return NextResponse.json(
        { error: `No productSets found for product: ${productId}` },
        { status: 400 }
      );
    }

    const totalCards = await prisma.card.count({
      where: { productSetId: selected.id },
    });

    const owned = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        card: { productSetId: selected.id },
      },
      select: {
        quantity: true,
        grade: true,
        card: {
          select: {
            id: true,
            cardNumber: true,
            player: true,
            team: true,
            subset: true,
            variant: true,
            bookValue: true,
            productSetId: true,
            frontImageUrl: true,
            backImageUrl: true,
          },
        },
      },
    });

    const pendingOrders = await prisma.gradingOrder.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        status: {
          in: ["PENDING", "READY"],
        },
        card: {
          productSetId: selected.id,
        },
      },
      select: {
        quantity: true,
        card: {
          select: {
            id: true,
            cardNumber: true,
            player: true,
            team: true,
            subset: true,
            variant: true,
            bookValue: true,
            productSetId: true,
            frontImageUrl: true,
            backImageUrl: true,
          },
        },
      },
    });

    const byCardId = new Map<number, CardApiRow>();

    function getOrCreateCardRow(input: {
      card: {
        id: number;
        cardNumber: string;
        player: string;
        team: string | null;
        subset: string | null;
        variant: string | null;
        bookValue: number | null;
        frontImageUrl: string | null;
        backImageUrl: string | null;
      };
    }) {
      const existing = byCardId.get(input.card.id);
      if (existing) return existing;

      const created: CardApiRow = {
        cardId: input.card.id,
        cardNumber: input.card.cardNumber,
        player: input.card.player,
        team: input.card.team,
        subset: input.card.subset,
        variant: input.card.variant,
        isInsert: !selected.isBase,

        quantity: 0,
        rawQuantity: 0,
        gradedQuantity: 0,
        pendingGradingQuantity: 0,

        highestGrade: null,
        gradeBreakdown: [],

        bookValue: input.card.bookValue ?? null,
        frontImageUrl: input.card.frontImageUrl ?? null,
        backImageUrl: input.card.backImageUrl ?? null,
      };

      byCardId.set(input.card.id, created);
      return created;
    }

    for (const o of owned) {
      const qty = safeQty(o.quantity);
      const grade = typeof o.grade === "number" && Number.isFinite(o.grade) ? o.grade : 0;
      if (qty <= 0) continue;

      const row = getOrCreateCardRow({ card: o.card });

      row.quantity += qty;

      if (grade === 0) row.rawQuantity += qty;

      if (grade > 0) {
        row.gradedQuantity += qty;
        row.highestGrade = Math.max(row.highestGrade ?? grade, grade);
      }

      const existingGrade = row.gradeBreakdown.find((g) => g.grade === grade);
      if (existingGrade) {
        existingGrade.quantity += qty;
      } else {
        row.gradeBreakdown.push({
          grade,
          label: gradeLabel(grade),
          quantity: qty,
        });
      }
    }

    for (const order of pendingOrders) {
      const qty = safeQty(order.quantity);
      if (qty <= 0) continue;

      const row = getOrCreateCardRow({ card: order.card });

      row.quantity += qty;
      row.pendingGradingQuantity += qty;
    }

    const cards = Array.from(byCardId.values()).map((c) => ({
      ...c,
      gradeBreakdown: [...c.gradeBreakdown].sort((a, b) => gradeSortValue(a.grade) - gradeSortValue(b.grade)),
    }));

    const uniqueOwned = cards.length;
    const totalQty = cards.reduce((sum, c) => sum + (c.quantity ?? 0), 0);
    const totalRawQty = cards.reduce((sum, c) => sum + (c.rawQuantity ?? 0), 0);
    const totalGradedQty = cards.reduce((sum, c) => sum + (c.gradedQuantity ?? 0), 0);
    const totalPendingGradingQty = cards.reduce((sum, c) => sum + (c.pendingGradingQuantity ?? 0), 0);
    const percentComplete = totalCards > 0 ? (uniqueOwned / totalCards) * 100 : 0;

    return NextResponse.json({
      ok: true,
      productId,
      productSetId: selected.id,
      productSetIsBase: selected.isBase,
      productSets: product.productSets,
      uniqueOwned,
      totalCards,
      percentComplete,

      // Total includes pending grading so cards do not temporarily disappear.
      totalQty,

      totalRawQty,
      totalGradedQty,
      totalPendingGradingQty,
      cards,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { error: e?.message ?? "Failed to load product collection" },
      { status }
    );
  }
}