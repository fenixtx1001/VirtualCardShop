// src/app/api/shop/my-cards/[cardId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  bookValueToPerCardCents,
  calcShopPerCardValueCents,
  getShopGradeability,
  labelShopGrade,
} from "@/lib/shop-offers";
import { RAW_GRADE } from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { cardId?: string } }
  | { params: Promise<{ cardId?: string }> };

async function getCardId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.cardId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function safeQty(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const cardId = await getCardId(ctx);

    if (!cardId) {
      return NextResponse.json({ ok: false, error: "Missing or invalid cardId." }, { status: 400 });
    }

    const ownerships = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        cardId,
        quantity: { gt: 0 },
      },
      select: {
        quantity: true,
        grade: true,
        gradedAt: true,
        card: {
          select: {
            id: true,
            cardNumber: true,
            player: true,
            team: true,
            subset: true,
            variant: true,
            bookValue: true,
            frontImageUrl: true,
            setId: true,
            productSetId: true,
            gradeabilityOverride: true,
            productSet: {
              select: {
                id: true,
                name: true,
                productId: true,
                isBase: true,
                isInsert: true,
                defaultGradeability: true,
              },
            },
          },
        },
      },
      orderBy: [{ grade: "asc" }],
    });

    if (ownerships.length === 0) {
      return NextResponse.json({
        ok: true,
        cardId,
        totalOwned: 0,
        rows: [],
      });
    }

    const card = ownerships[0].card;

    const rawBookValueCents = bookValueToPerCardCents(card.bookValue);
    const gradeability = getShopGradeability({
      cardOverride: card.gradeabilityOverride,
      productSetDefault: card.productSet?.defaultGradeability,
    });

    const rows = ownerships
      .map((r) => {
        const grade = typeof r.grade === "number" && Number.isFinite(r.grade) ? r.grade : RAW_GRADE;
        const qtyOwned = safeQty(r.quantity);

        const perCardValueCents = calcShopPerCardValueCents({
          rawBookValueCents,
          grade,
          gradeability,
        });

        return {
          cardId: card.id,
          qtyOwned,

          grade,
          gradeLabel: labelShopGrade(grade),
          isRaw: grade === RAW_GRADE,
          isGraded: grade !== RAW_GRADE,
          gradedAt: r.gradedAt ? r.gradedAt.toISOString() : null,

          rawBookValueCents,
          perCardValueCents,
          totalBucketValueCents: perCardValueCents * qtyOwned,
          bookValue: rawBookValueCents / 100,
          gradeability,

          cardNumber: card.cardNumber,
          player: card.player,
          team: card.team ?? null,

          setId: card.setId,
          productSetId: card.productSetId ?? null,
          productSetName: card.productSet?.name ?? null,
          productId: card.productSet?.productId ?? null,

          subset: card.subset ?? null,
          variant: card.variant ?? null,
          isInsert: !!card.productSet?.isInsert,

          frontImageUrl: card.frontImageUrl ?? null,
          ownershipKey: `${card.id}:${grade}`,
        };
      })
      .filter((r) => r.qtyOwned > 0)
      .sort((a, b) => a.grade - b.grade);

    const totalOwned = rows.reduce((sum, r) => sum + r.qtyOwned, 0);

    return NextResponse.json({
      ok: true,
      cardId,
      totalOwned,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to load card ownership buckets." }, { status: 500 });
  }
}