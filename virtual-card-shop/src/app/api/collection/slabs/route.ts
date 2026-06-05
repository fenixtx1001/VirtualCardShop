// src/app/api/collection/slabs/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { calculateGradedValueCents, getEffectiveGradeability } from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Gradeability = "COMMON" | "GREAT" | "ICONIC";
type SortMode = "grade_desc" | "value_desc" | "player_asc" | "year_desc" | "newest";

type SlabRow = {
  key: string;
  cardId: number;
  player: string;
  cardNumber: string;
  team: string | null;
  subset: string | null;
  variant: string | null;

  productId: string;
  productYear: number | null;
  productBrand: string | null;
  productSport: string | null;

  productSetId: string | null;
  productSetName: string | null;
  productSetIsBase: boolean | null;

  frontImageUrl: string | null;
  backImageUrl: string | null;

  grade: number;
  gradeLabel: string;
  quantity: number;
  rawBookValueCents: number;
  valueCents: number;
  totalValueCents: number;

  gradeability: Gradeability;
  gradeabilityLabel: string;

  gradedAt: string | null;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeQty(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function dollarsToCents(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function normalizeGradeability(value: unknown): Gradeability {
  if (value === "GREAT" || value === "ICONIC" || value === "COMMON") return value;
  return "COMMON";
}

function gradeabilityLabel(value: Gradeability) {
  if (value === "ICONIC") return "Iconic";
  if (value === "GREAT") return "Great";
  return "Common";
}

function normalizeSort(value: string | null): SortMode {
  if (
    value === "grade_desc" ||
    value === "value_desc" ||
    value === "player_asc" ||
    value === "year_desc" ||
    value === "newest"
  ) {
    return value;
  }

  return "grade_desc";
}

function sortCardNumber(a: SlabRow, b: SlabRow) {
  const an = Number(String(a.cardNumber ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);
  const bn = Number(String(b.cardNumber ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);

  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return String(a.cardNumber ?? "").localeCompare(String(b.cardNumber ?? ""));
}

function dateTimeMs(value: string | null) {
  if (!value) return 0;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const q = (url.searchParams.get("q") ?? "").trim();
    const gradeParam = (url.searchParams.get("grade") ?? "ALL").trim().toUpperCase();
    const tierParam = (url.searchParams.get("tier") ?? "ALL").trim().toUpperCase();
    const sort = normalizeSort(url.searchParams.get("sort"));

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 999999);
    const pageSizeRaw = parseInt(url.searchParams.get("pageSize") ?? "48", 10) || 48;
    const pageSize = clampInt(pageSizeRaw, 12, 96);

    const gradeFilter =
      gradeParam === "6" ||
      gradeParam === "7" ||
      gradeParam === "8" ||
      gradeParam === "9" ||
      gradeParam === "10"
        ? Number(gradeParam)
        : null;

    const tierFilter =
      tierParam === "COMMON" || tierParam === "GREAT" || tierParam === "ICONIC"
        ? (tierParam as Gradeability)
        : null;

    const ownershipRows = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        grade: gradeFilter != null ? gradeFilter : { not: 0 },
        ...(q
          ? {
              OR: [
                { card: { player: { contains: q, mode: "insensitive" } } },
                { card: { team: { contains: q, mode: "insensitive" } } },
                { card: { cardNumber: { contains: q, mode: "insensitive" } } },
                { card: { subset: { contains: q, mode: "insensitive" } } },
                { card: { variant: { contains: q, mode: "insensitive" } } },
                { card: { productSet: { name: { contains: q, mode: "insensitive" } } } },
                { card: { productSet: { product: { brand: { contains: q, mode: "insensitive" } } } } },
                { card: { productSet: { product: { sport: { contains: q, mode: "insensitive" } } } } },
                { card: { set: { brand: { contains: q, mode: "insensitive" } } } },
                { card: { set: { sport: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      select: {
        quantity: true,
        grade: true,
        gradedAt: true,
        card: {
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
        },
      },
    });

    const rows: SlabRow[] = [];

    for (const ownership of ownershipRows) {
      const qty = safeQty(ownership.quantity);
      const grade = typeof ownership.grade === "number" && Number.isFinite(ownership.grade) ? ownership.grade : 0;

      if (qty <= 0 || grade <= 0) continue;

      const card = ownership.card;
      const product = card.productSet?.product ?? null;

      const effectiveGradeability = normalizeGradeability(
        getEffectiveGradeability({
          cardOverride: card.gradeabilityOverride,
          productSetDefault: card.productSet?.defaultGradeability,
        })
      );

      if (tierFilter != null && effectiveGradeability !== tierFilter) continue;

      const rawBookValueCents = dollarsToCents(card.bookValue);
      const valueCents = calculateGradedValueCents({
        rawBookValueCents,
        grade,
        gradeability: effectiveGradeability,
      });

      const productId = product?.id ?? card.set.id;
      const productYear = product?.year ?? card.set.year ?? null;
      const productBrand = product?.brand ?? card.set.brand ?? null;
      const productSport = product?.sport ?? card.set.sport ?? null;

      rows.push({
        key: `${card.id}-${grade}`,
        cardId: card.id,
        player: card.player,
        cardNumber: card.cardNumber,
        team: card.team ?? null,
        subset: card.subset ?? null,
        variant: card.variant ?? null,

        productId,
        productYear,
        productBrand,
        productSport,

        productSetId: card.productSet?.id ?? null,
        productSetName: card.productSet?.name ?? null,
        productSetIsBase:
          typeof card.productSet?.isBase === "boolean" ? card.productSet.isBase : null,

        frontImageUrl: card.frontImageUrl ?? null,
        backImageUrl: card.backImageUrl ?? null,

        grade,
        gradeLabel: `VCS ${grade}`,
        quantity: qty,
        rawBookValueCents,
        valueCents,
        totalValueCents: valueCents * qty,

        gradeability: effectiveGradeability,
        gradeabilityLabel: gradeabilityLabel(effectiveGradeability),

        gradedAt: ownership.gradedAt ? ownership.gradedAt.toISOString() : null,
      });
    }

    rows.sort((a, b) => {
      if (sort === "value_desc") {
        const valueCompare = b.totalValueCents - a.totalValueCents;
        if (valueCompare !== 0) return valueCompare;

        const gradeCompare = b.grade - a.grade;
        if (gradeCompare !== 0) return gradeCompare;
      }

      if (sort === "player_asc") {
        const playerCompare = a.player.localeCompare(b.player);
        if (playerCompare !== 0) return playerCompare;

        const yearCompare = (a.productYear ?? 0) - (b.productYear ?? 0);
        if (yearCompare !== 0) return yearCompare;

        return sortCardNumber(a, b);
      }

      if (sort === "year_desc") {
        const yearCompare = (b.productYear ?? 0) - (a.productYear ?? 0);
        if (yearCompare !== 0) return yearCompare;

        const playerCompare = a.player.localeCompare(b.player);
        if (playerCompare !== 0) return playerCompare;

        return sortCardNumber(a, b);
      }

      if (sort === "newest") {
        const dateCompare = dateTimeMs(b.gradedAt) - dateTimeMs(a.gradedAt);
        if (dateCompare !== 0) return dateCompare;

        const gradeCompare = b.grade - a.grade;
        if (gradeCompare !== 0) return gradeCompare;
      }

      const gradeCompare = b.grade - a.grade;
      if (gradeCompare !== 0) return gradeCompare;

      const valueCompare = b.totalValueCents - a.totalValueCents;
      if (valueCompare !== 0) return valueCompare;

      const playerCompare = a.player.localeCompare(b.player);
      if (playerCompare !== 0) return playerCompare;

      return sortCardNumber(a, b);
    });

    const countsByGrade = {
      "6": 0,
      "7": 0,
      "8": 0,
      "9": 0,
      "10": 0,
    };

    const countsByTier = {
      COMMON: 0,
      GREAT: 0,
      ICONIC: 0,
    };

    let totalQuantity = 0;
    let totalValueCents = 0;

    for (const row of rows) {
      totalQuantity += row.quantity;
      totalValueCents += row.totalValueCents;

      if (row.grade >= 6 && row.grade <= 10) {
        countsByGrade[String(row.grade) as "6" | "7" | "8" | "9" | "10"] += row.quantity;
      }

      countsByTier[row.gradeability] += row.quantity;
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const skip = (safePage - 1) * pageSize;
    const pagedRows = rows.slice(skip, skip + pageSize);

    return NextResponse.json({
      ok: true,
      q,
      grade: gradeFilter == null ? "ALL" : String(gradeFilter),
      tier: tierFilter ?? "ALL",
      sort,
      page: safePage,
      pageSize,
      total,
      totalPages,
      totalQuantity,
      totalValueCents,
      countsByGrade,
      countsByTier,
      rows: pagedRows,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load slabs" },
      { status }
    );
  }
}