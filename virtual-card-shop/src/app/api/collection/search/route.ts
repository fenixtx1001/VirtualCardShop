// src/app/api/collection/search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchRow = {
  cardId: number;
  player: string;
  cardNumber: string;
  subset: string | null;
  variant: string | null;
  qty: number;
  rawQty: number;
  gradedQty: number;
  pendingGradingQty: number;
  bookValue: number;
  totalValue: number;
  productId: string;
  year: number | null;
  productSetName: string | null;
  productSetIsBase: boolean | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeQty(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function sortCardNumber(a: SearchRow, b: SearchRow) {
  const an = Number(String(a.cardNumber ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);
  const bn = Number(String(b.cardNumber ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);

  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return String(a.cardNumber ?? "").localeCompare(String(b.cardNumber ?? ""));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) {
      return NextResponse.json(
        { ok: true, q: "", page: 1, pageSize: 50, total: 0, totalPages: 1, rows: [] },
        { status: 200 }
      );
    }

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 999999);
    const pageSizeRaw = parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50;
    const pageSize = clampInt(pageSizeRaw, 10, 100);

    const ownedCardRows = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        card: {
          player: { contains: q, mode: "insensitive" },
        },
      },
      select: {
        quantity: true,
        grade: true,
        card: {
          select: {
            id: true,
            player: true,
            cardNumber: true,
            subset: true,
            variant: true,
            bookValue: true,
            frontImageUrl: true,
            backImageUrl: true,
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
      orderBy: [{ card: { player: "asc" } }, { card: { cardNumber: "asc" } }],
    });

    const pendingRows = await prisma.gradingOrder.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        status: { in: ["PENDING", "READY"] },
        card: {
          player: { contains: q, mode: "insensitive" },
        },
      },
      select: {
        quantity: true,
        card: {
          select: {
            id: true,
            player: true,
            cardNumber: true,
            subset: true,
            variant: true,
            bookValue: true,
            frontImageUrl: true,
            backImageUrl: true,
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
      orderBy: [{ card: { player: "asc" } }, { card: { cardNumber: "asc" } }],
    });

    const byCardId = new Map<number, SearchRow>();

    function getOrCreateRow(card: (typeof ownedCardRows)[number]["card"]) {
      const existing = byCardId.get(card.id);
      if (existing) return existing;

      const productId = card.productSet?.product?.id ?? card.set.id;
      const year = card.productSet?.product?.year ?? card.set.year ?? null;
      const bookValue = Number(card.bookValue ?? 0);

      const created: SearchRow = {
        cardId: card.id,
        player: card.player,
        cardNumber: card.cardNumber,
        subset: card.subset ?? null,
        variant: card.variant ?? null,
        qty: 0,
        rawQty: 0,
        gradedQty: 0,
        pendingGradingQty: 0,
        bookValue,
        totalValue: 0,
        productId,
        year,
        productSetName: card.productSet?.name ?? null,
        productSetIsBase: typeof card.productSet?.isBase === "boolean" ? card.productSet.isBase : null,
        frontImageUrl: card.frontImageUrl ?? null,
        backImageUrl: card.backImageUrl ?? null,
      };

      byCardId.set(card.id, created);
      return created;
    }

    for (const ownership of ownedCardRows) {
      const qty = safeQty(ownership.quantity);
      if (qty <= 0) continue;

      const row = getOrCreateRow(ownership.card);
      const grade = typeof ownership.grade === "number" && Number.isFinite(ownership.grade) ? ownership.grade : 0;

      row.qty += qty;
      row.totalValue += row.bookValue * qty;

      if (grade === 0) row.rawQty += qty;
      else row.gradedQty += qty;
    }

    for (const pending of pendingRows) {
      const qty = safeQty(pending.quantity);
      if (qty <= 0) continue;

      const row = getOrCreateRow(pending.card);

      row.qty += qty;
      row.pendingGradingQty += qty;

      // Pending grades stay valued as raw so hidden grades are not leaked
      // and collection search value does not drop while cards are out for grading.
      row.totalValue += row.bookValue * qty;
    }

    const allRows = Array.from(byCardId.values()).sort((a, b) => {
      const playerCompare = a.player.localeCompare(b.player);
      if (playerCompare !== 0) return playerCompare;

      const yearCompare = (a.year ?? 0) - (b.year ?? 0);
      if (yearCompare !== 0) return yearCompare;

      return sortCardNumber(a, b);
    });

    const total = allRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const skip = (safePage - 1) * pageSize;
    const rows = allRows.slice(skip, skip + pageSize);

    return NextResponse.json({
      ok: true,
      q,
      page: safePage,
      pageSize,
      total,
      totalPages,
      rows,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? "Search failed" }, { status });
  }
}