// src/app/api/cards/[id]/population/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  RAW_GRADE,
  bookValueToCents,
  calculateGradedValueCents,
  getEffectiveGradeability,
  labelGradeability,
  labelVcsGrade,
} from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { id?: string } }
  | { params: Promise<{ id?: string }> };

type OwnershipBucket = {
  grade: number;
  label: string;
  quantity: number;
  valueCents: number;
};

type PopulationBucket = {
  grade: number;
  label: string;
  quantity: number;
  percentage: number;
};

type OwnerAccumulator = {
  userId: string;
  rawQuantity: number;
  gradedQuantity: number;
  pendingGradingQuantity: number;
  totalQuantity: number;
  totalValueCents: number;
  gradeBreakdown: OwnershipBucket[];
  slabs: {
    grade: number;
    label: string;
    quantity: number;
    valueCents: number;
  }[];
};

async function getCardId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.id;
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function makeBucket(input: {
  grade: number;
  quantity: number;
  rawBookValueCents: number;
  gradeability: ReturnType<typeof getEffectiveGradeability>;
}): OwnershipBucket {
  const valueCents =
    input.grade === RAW_GRADE
      ? input.rawBookValueCents
      : calculateGradedValueCents({
          rawBookValueCents: input.rawBookValueCents,
          gradeability: input.gradeability,
          grade: input.grade,
        });

  return {
    grade: input.grade,
    label: labelVcsGrade(input.grade),
    quantity: input.quantity,
    valueCents,
  };
}

function getGradeSortValue(grade: number) {
  return grade === RAW_GRADE ? -1 : grade;
}

function emptyOwner(userId: string) {
  return {
    userId,
    name: null,
    email: null,
    image: null,

    quantity: 0,

    rawQuantity: 0,
    gradedQuantity: 0,
    pendingGradingQuantity: 0,
    totalQuantity: 0,
    totalValueCents: 0,
    gradeBreakdown: [] as OwnershipBucket[],
    slabs: [] as {
      grade: number;
      label: string;
      quantity: number;
      valueCents: number;
    }[],
  };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const currentUser = await requireUser();

    const cardId = await getCardId(ctx);
    if (!cardId) {
      return NextResponse.json({ ok: false, error: "Missing card id" }, { status: 400 });
    }

    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        player: true,
        cardNumber: true,
        team: true,
        subset: true,
        variant: true,
        bookValue: true,
        frontImageUrl: true,
        backImageUrl: true,
        gradeabilityOverride: true,
        set: {
          select: {
            id: true,
            year: true,
            brand: true,
            sport: true,
          },
        },
        productSet: {
          select: {
            id: true,
            name: true,
            isBase: true,
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
      },
    });

    if (!card) {
      return NextResponse.json({ ok: false, error: `Card not found: ${cardId}` }, { status: 404 });
    }

    const gradeability = getEffectiveGradeability({
      cardOverride: card.gradeabilityOverride,
      productSetDefault: card.productSet?.defaultGradeability,
    });

    const rawBookValueCents = bookValueToCents(card.bookValue);

    const ownershipRows = await prisma.cardOwnership.findMany({
      where: {
        cardId,
        quantity: { gt: 0 },
      },
      orderBy: [{ userId: "asc" }, { grade: "asc" }],
      select: {
        userId: true,
        grade: true,
        quantity: true,
      },
    });

    const pendingOrders = await prisma.gradingOrder.findMany({
      where: {
        cardId,
        quantity: { gt: 0 },
        status: {
          in: ["PENDING", "READY"],
        },
      },
      select: {
        userId: true,
        quantity: true,
        status: true,
        readyAt: true,
      },
    });

    const byUser = new Map<string, OwnerAccumulator>();

    function getOwner(userId: string): OwnerAccumulator {
      const existing = byUser.get(userId);
      if (existing) return existing;

      const created: OwnerAccumulator = {
        userId,
        rawQuantity: 0,
        gradedQuantity: 0,
        pendingGradingQuantity: 0,
        totalQuantity: 0,
        totalValueCents: 0,
        gradeBreakdown: [],
        slabs: [],
      };

      byUser.set(userId, created);
      return created;
    }

    for (const row of ownershipRows) {
      const owner = getOwner(row.userId);
      const grade = row.grade ?? RAW_GRADE;
      const quantity = row.quantity ?? 0;

      if (quantity <= 0) continue;

      const bucket = makeBucket({
        grade,
        quantity,
        rawBookValueCents,
        gradeability,
      });

      owner.gradeBreakdown.push(bucket);
      owner.totalQuantity += quantity;
      owner.totalValueCents += bucket.valueCents * quantity;

      if (grade === RAW_GRADE) {
        owner.rawQuantity += quantity;
      } else {
        owner.gradedQuantity += quantity;
        owner.slabs.push({
          grade,
          label: bucket.label,
          quantity,
          valueCents: bucket.valueCents,
        });
      }
    }

    for (const order of pendingOrders) {
      const owner = getOwner(order.userId);
      const quantity = order.quantity ?? 0;

      if (quantity <= 0) continue;

      owner.pendingGradingQuantity += quantity;
      owner.totalQuantity += quantity;

      owner.totalValueCents += rawBookValueCents * quantity;
    }

    const ownerUserIds = Array.from(byUser.keys());

    const users = ownerUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerUserIds } },
          select: { id: true, name: true, email: true, image: true },
        })
      : [];

    const userById = new Map<string, (typeof users)[number]>();
    for (const u of users) userById.set(u.id, u);

    const owners = Array.from(byUser.values())
      .map((owner) => {
        const u = userById.get(owner.userId);

        const sortedBreakdown = [...owner.gradeBreakdown].sort((a, b) => {
          return getGradeSortValue(a.grade) - getGradeSortValue(b.grade);
        });

        const sortedSlabs = [...owner.slabs].sort((a, b) => b.grade - a.grade);

        return {
          userId: owner.userId,
          name: u?.name ?? null,
          email: u?.email ?? null,
          image: u?.image ?? null,

          quantity: owner.totalQuantity,

          rawQuantity: owner.rawQuantity,
          gradedQuantity: owner.gradedQuantity,
          pendingGradingQuantity: owner.pendingGradingQuantity,
          totalQuantity: owner.totalQuantity,
          totalValueCents: owner.totalValueCents,
          gradeBreakdown: sortedBreakdown,
          slabs: sortedSlabs,
        };
      })
      .sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) return b.totalQuantity - a.totalQuantity;
        return (a.name ?? a.email ?? a.userId).localeCompare(b.name ?? b.email ?? b.userId);
      });

    const myOwnership =
      owners.find((owner) => owner.userId === currentUser.id) ?? emptyOwner(currentUser.id);

    const uniqueOwners = owners.length;
    const totalOwnedIncludingPending = owners.reduce((sum, o) => sum + o.totalQuantity, 0);
    const totalOwned = owners.reduce((sum, o) => sum + o.rawQuantity + o.gradedQuantity, 0);
    const totalRaw = owners.reduce((sum, o) => sum + o.rawQuantity, 0);
    const totalGraded = owners.reduce((sum, o) => sum + o.gradedQuantity, 0);
    const totalPendingGrading = owners.reduce((sum, o) => sum + o.pendingGradingQuantity, 0);
    const totalValueCents = owners.reduce((sum, o) => sum + o.totalValueCents, 0);

    const populationByGrade = new Map<number, number>();

    for (const row of ownershipRows) {
      const grade = row.grade ?? RAW_GRADE;
      const quantity = row.quantity ?? 0;

      if (quantity <= 0) continue;

      populationByGrade.set(grade, (populationByGrade.get(grade) ?? 0) + quantity);
    }

    const gradeBreakdown: PopulationBucket[] = [RAW_GRADE, 10, 9, 8, 7, 6].map((grade) => {
      const quantity = populationByGrade.get(grade) ?? 0;

      return {
        grade,
        label: grade === RAW_GRADE ? "Raw" : `VCS ${grade}`,
        quantity,
        percentage: totalOwned > 0 ? (quantity / totalOwned) * 100 : 0,
      };
    });

    return NextResponse.json({
      ok: true,
      card: {
        id: card.id,
        player: card.player,
        cardNumber: card.cardNumber,
        team: card.team ?? null,
        subset: card.subset ?? null,
        variant: card.variant ?? null,
        bookValue: Number(card.bookValue ?? 0),

        gradeability,
        gradeabilityLabel: labelGradeability(gradeability),

        productId: card.productSet?.product?.id ?? null,
        productYear: card.productSet?.product?.year ?? card.set.year ?? null,
        productBrand: card.productSet?.product?.brand ?? card.set.brand ?? null,
        productSport: card.productSet?.product?.sport ?? card.set.sport ?? null,

        productSetId: card.productSet?.id ?? null,
        productSetName: card.productSet?.name ?? null,
        productSetIsBase: typeof card.productSet?.isBase === "boolean" ? card.productSet.isBase : null,

        frontImageUrl: card.frontImageUrl ?? null,
        backImageUrl: card.backImageUrl ?? null,
      },
      population: {
        uniqueOwners,
        totalOwned,
        totalOwnedIncludingPending,
        raw: totalRaw,
        graded: totalGraded,
        pendingGrading: totalPendingGrading,
        totalValueCents,
        gradeBreakdown,
      },
      myOwnership,
      owners,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Population failed" },
      { status }
    );
  }
}