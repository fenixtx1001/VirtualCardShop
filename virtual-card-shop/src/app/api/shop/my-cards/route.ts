// src/app/api/shop/my-cards/route.ts
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

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function cleanQ(q: unknown) {
  return String(q ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function safeQty(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Search the current user's owned cards by ownership bucket.
 * Raw and VCS graded copies are returned separately so the user can choose
 * exactly which version to sell.
 *
 * Matches: player, team, cardNumber, setId, productSetId, productSet.name, productSet.productId
 *
 * Returns:
 * { ok: true, q, count, rows: [...] }
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const q = cleanQ(url.searchParams.get("q"));
    const take = clampInt(parseInt(url.searchParams.get("limit") ?? "25", 10) || 25, 1, 60);

    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, q: q ?? "", count: 0, rows: [] }, { status: 200 });
    }

    const rows = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        card: {
          OR: [
            { player: { contains: q, mode: "insensitive" } },
            { team: { contains: q, mode: "insensitive" } },
            { cardNumber: { contains: q, mode: "insensitive" } },
            { setId: { contains: q, mode: "insensitive" } },
            { productSetId: { contains: q, mode: "insensitive" } },
            {
              productSet: {
                is: {
                  name: { contains: q, mode: "insensitive" },
                },
              },
            },
            {
              productSet: {
                is: {
                  productId: { contains: q, mode: "insensitive" },
                },
              },
            },
          ],
        },
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
      orderBy: [
        { card: { bookValue: "desc" } },
        { quantity: "desc" },
        { grade: "asc" },
      ],
      take,
    });

    const out = rows.map((r) => {
      const grade = typeof r.grade === "number" && Number.isFinite(r.grade) ? r.grade : RAW_GRADE;
      const qtyOwned = safeQty(r.quantity);

      const rawBookValueCents = bookValueToPerCardCents(r.card.bookValue);
      const gradeability = getShopGradeability({
        cardOverride: r.card.gradeabilityOverride,
        productSetDefault: r.card.productSet?.defaultGradeability,
      });

      const perCardValueCents = calcShopPerCardValueCents({
        rawBookValueCents,
        grade,
        gradeability,
      });

      return {
        cardId: r.card.id,

        // Existing compatibility field. This is now the quantity for this exact grade bucket.
        qtyOwned,

        // New explicit fields.
        grade,
        gradeLabel: labelShopGrade(grade),
        isRaw: grade === RAW_GRADE,
        isGraded: grade !== RAW_GRADE,

        rawBookValueCents,
        perCardValueCents,
        totalBucketValueCents: perCardValueCents * qtyOwned,
        bookValue: rawBookValueCents / 100,
        gradeability,

        cardNumber: r.card.cardNumber,
        player: r.card.player,
        team: r.card.team ?? null,

        setId: r.card.setId,
        productSetId: r.card.productSetId ?? null,
        productSetName: r.card.productSet?.name ?? null,
        productId: r.card.productSet?.productId ?? null,

        subset: r.card.subset ?? null,
        variant: r.card.variant ?? null,
        isInsert: !!r.card.productSet?.isInsert,

        frontImageUrl: r.card.frontImageUrl ?? null,

        // Useful for select keys in the UI.
        ownershipKey: `${r.card.id}:${grade}`,
      };
    });

    return NextResponse.json({ ok: true, q, count: out.length, rows: out }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to load your cards." }, { status: 500 });
  }
}