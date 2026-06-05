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
  quantity: number;
  rawQuantity: number;
  gradedQuantity: number;
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

    const byCardId = new Map<number, CardApiRow>();

    for (const o of owned) {
      const qty = typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : 0;
      const grade = typeof o.grade === "number" && Number.isFinite(o.grade) ? o.grade : 0;
      if (qty <= 0) continue;

      const existing = byCardId.get(o.card.id);

      if (!existing) {
        byCardId.set(o.card.id, {
          cardId: o.card.id,
          cardNumber: o.card.cardNumber,
          player: o.card.player,
          team: o.card.team,
          subset: o.card.subset,
          variant: o.card.variant,
          isInsert: !selected.isBase,
          quantity: qty,
          rawQuantity: grade === 0 ? qty : 0,
          gradedQuantity: grade > 0 ? qty : 0,
          highestGrade: grade > 0 ? grade : null,
          gradeBreakdown: [
            {
              grade,
              label: gradeLabel(grade),
              quantity: qty,
            },
          ],
          bookValue: o.card.bookValue ?? null,
          frontImageUrl: o.card.frontImageUrl ?? null,
          backImageUrl: o.card.backImageUrl ?? null,
        });
        continue;
      }

      existing.quantity += qty;
      if (grade === 0) existing.rawQuantity += qty;
      if (grade > 0) {
        existing.gradedQuantity += qty;
        existing.highestGrade = Math.max(existing.highestGrade ?? grade, grade);
      }

      const existingGrade = existing.gradeBreakdown.find((g) => g.grade === grade);
      if (existingGrade) {
        existingGrade.quantity += qty;
      } else {
        existing.gradeBreakdown.push({
          grade,
          label: gradeLabel(grade),
          quantity: qty,
        });
      }
    }

    const cards = Array.from(byCardId.values()).map((c) => ({
      ...c,
      gradeBreakdown: [...c.gradeBreakdown].sort((a, b) => gradeSortValue(a.grade) - gradeSortValue(b.grade)),
    }));

    const uniqueOwned = cards.length;
    const totalQty = cards.reduce((sum, c) => sum + (c.quantity ?? 0), 0);
    const totalRawQty = cards.reduce((sum, c) => sum + (c.rawQuantity ?? 0), 0);
    const totalGradedQty = cards.reduce((sum, c) => sum + (c.gradedQuantity ?? 0), 0);
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
      totalQty,
      totalRawQty,
      totalGradedQty,
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