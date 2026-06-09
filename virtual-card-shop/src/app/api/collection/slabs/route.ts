// src/app/api/collection/slabs/route.ts
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

type Gradeability = "COMMON" | "GREAT" | "ICONIC";
type SortMode = "grade_desc" | "value_desc" | "player_asc" | "year_desc" | "newest" | "random";
type TierFilter = "ALL" | Gradeability;

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

function normalizeGrade(value: string | null) {
  if (value === "6" || value === "7" || value === "8" || value === "9" || value === "10") {
    return Number(value);
  }

  return null;
}

function normalizeTier(value: string | null): TierFilter {
  if (value === "COMMON" || value === "GREAT" || value === "ICONIC") return value;
  return "ALL";
}

function normalizeSort(value: string | null): SortMode {
  if (
    value === "grade_desc" ||
    value === "value_desc" ||
    value === "player_asc" ||
    value === "year_desc" ||
    value === "newest" ||
    value === "random"
  ) {
    return value;
  }

  return "grade_desc";
}

function normalizeSearch(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function includesSearch(row: SlabRow, q: string) {
  if (!q) return true;

  const haystack = [
    row.player,
    row.cardNumber,
    row.team,
    row.subset,
    row.variant,
    row.productId,
    row.productYear == null ? "" : String(row.productYear),
    row.productBrand,
    row.productSport,
    row.productSetId,
    row.productSetName,
    row.gradeLabel,
    row.gradeabilityLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function sortCardNumber(a: SlabRow, b: SlabRow) {
  const an = Number(a.cardNumber);
  const bn = Number(b.cardNumber);

  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;

  return a.cardNumber.localeCompare(b.cardNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function randomRank(row: SlabRow, seed: string) {
  return hashString(`${seed}:${row.key}:${row.cardId}:${row.grade}`);
}

function compareRows(a: SlabRow, b: SlabRow, sort: SortMode, seed: string) {
  if (sort === "random") {
    const ar = randomRank(a, seed);
    const br = randomRank(b, seed);
    if (ar !== br) return ar - br;
    return a.key.localeCompare(b.key);
  }

  if (sort === "value_desc") {
    if (b.valueCents !== a.valueCents) return b.valueCents - a.valueCents;
    if (b.totalValueCents !== a.totalValueCents) return b.totalValueCents - a.totalValueCents;
    if (b.grade !== a.grade) return b.grade - a.grade;
    return sortCardNumber(a, b);
  }

  if (sort === "player_asc") {
    const player = a.player.localeCompare(b.player, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (player !== 0) return player;
    if (b.grade !== a.grade) return b.grade - a.grade;
    return sortCardNumber(a, b);
  }

  if (sort === "year_desc") {
    const ay = a.productYear ?? 0;
    const by = b.productYear ?? 0;
    if (by !== ay) return by - ay;
    if (b.grade !== a.grade) return b.grade - a.grade;
    return sortCardNumber(a, b);
  }

  if (sort === "newest") {
    const at = a.gradedAt ? new Date(a.gradedAt).getTime() : 0;
    const bt = b.gradedAt ? new Date(b.gradedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    if (b.grade !== a.grade) return b.grade - a.grade;
    return sortCardNumber(a, b);
  }

  if (b.grade !== a.grade) return b.grade - a.grade;
  if (b.valueCents !== a.valueCents) return b.valueCents - a.valueCents;
  return sortCardNumber(a, b);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const q = normalizeSearch(url.searchParams.get("q"));
    const gradeFilter = normalizeGrade(url.searchParams.get("grade"));
    const tier = normalizeTier(url.searchParams.get("tier"));
    const sort = normalizeSort(url.searchParams.get("sort"));
    const seed = (url.searchParams.get("seed") ?? "").trim() || "default";

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 9999);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "24", 10) || 24, 6, 60);

    const ownerships = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        grade: gradeFilter == null ? { in: [6, 7, 8, 9, 10] } : gradeFilter,
      },
      select: {
        cardId: true,
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
            backImageUrl: true,
            gradeabilityOverride: true,
            productSetId: true,
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
      },
    });

    const allRows: SlabRow[] = ownerships.map((ownership) => {
      const card = ownership.card;
      const product = card.productSet?.product;

      const gradeability = getEffectiveGradeability({
        cardOverride: card.gradeabilityOverride,
        productSetDefault: card.productSet?.defaultGradeability,
      }) as Gradeability;

      const rawBookValueCents = bookValueToCents(card.bookValue);
      const valueCents = calculateGradedValueCents({
        rawBookValueCents,
        gradeability,
        grade: ownership.grade,
      });

      const productYear = product?.year ?? card.set?.year ?? null;
      const productBrand = product?.brand ?? card.set?.brand ?? null;
      const productSport = product?.sport ?? card.set?.sport ?? null;
      const productId = product?.id ?? card.set?.id ?? card.productSetId ?? "unknown";

      return {
        key: `${card.id}-${ownership.grade}`,
        cardId: card.id,
        player: card.player,
        cardNumber: card.cardNumber,
        team: card.team,
        subset: card.subset,
        variant: card.variant,

        productId,
        productYear,
        productBrand,
        productSport,

        productSetId: card.productSetId,
        productSetName: card.productSet?.name ?? null,
        productSetIsBase: card.productSet?.isBase ?? null,

        frontImageUrl: card.frontImageUrl,
        backImageUrl: card.backImageUrl,

        grade: ownership.grade,
        gradeLabel: `VCS ${ownership.grade}`,
        quantity: ownership.quantity,
        rawBookValueCents,
        valueCents,
        totalValueCents: valueCents * ownership.quantity,

        gradeability,
        gradeabilityLabel: labelGradeability(gradeability),

        gradedAt: ownership.gradedAt ? ownership.gradedAt.toISOString() : null,
      };
    });

    const searchedRows = allRows.filter((row) => includesSearch(row, q));

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

    for (const row of searchedRows) {
      if (row.grade === 6) countsByGrade["6"] += row.quantity;
      if (row.grade === 7) countsByGrade["7"] += row.quantity;
      if (row.grade === 8) countsByGrade["8"] += row.quantity;
      if (row.grade === 9) countsByGrade["9"] += row.quantity;
      if (row.grade === 10) countsByGrade["10"] += row.quantity;

      countsByTier[row.gradeability] += row.quantity;
    }

    const filteredRows = searchedRows.filter((row) => {
      if (tier !== "ALL" && row.gradeability !== tier) return false;
      return true;
    });

    filteredRows.sort((a, b) => compareRows(a, b, sort, seed));

    const total = filteredRows.length;
    const totalQuantity = filteredRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalValueCents = filteredRows.reduce((sum, row) => sum + row.totalValueCents, 0);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const start = (safePage - 1) * pageSize;
    const rows = filteredRows.slice(start, start + pageSize);

    return NextResponse.json(
      {
        ok: true,
        q,
        grade: gradeFilter == null ? "ALL" : String(gradeFilter),
        tier,
        sort,
        page: safePage,
        pageSize,
        total,
        totalPages,
        totalQuantity,
        totalValueCents,
        countsByGrade,
        countsByTier,
        rows,
      },
      { status: 200 }
    );
  } catch (e: any) {
    const status = e?.status ?? 500;

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load slab gallery" },
      { status }
    );
  }
}
