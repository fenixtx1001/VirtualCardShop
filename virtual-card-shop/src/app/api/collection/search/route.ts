// src/app/api/collection/search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

    const where = {
      userId: user.id,
      quantity: { gt: 0 },
      card: {
        player: { contains: q, mode: "insensitive" as const },
      },
    };

    // Total matches
    const total = await prisma.cardOwnership.count({ where });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const skip = (safePage - 1) * pageSize;

    // Pull rows (from ownership) and join outward
    const ownerships = await prisma.cardOwnership.findMany({
      where,
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
      orderBy: [
        // stable and useful default ordering
        { card: { player: "asc" } },
        { card: { cardNumber: "asc" } },
      ],
      skip,
      take: pageSize,
    });

    const rows = ownerships.map((o) => {
      const c = o.card;

      const productId = c.productSet?.product?.id ?? c.set.id; // fallback to Set.id
      const year = c.productSet?.product?.year ?? c.set.year ?? null;

      return {
        cardId: c.id,
        player: c.player,
        cardNumber: c.cardNumber,
        subset: c.subset ?? null,
        variant: c.variant ?? null,
        qty: o.quantity,
        bookValue: Number(c.bookValue ?? 0),

        productId,
        year,

        productSetName: c.productSet?.name ?? null,
        productSetIsBase: typeof c.productSet?.isBase === "boolean" ? c.productSet.isBase : null,
      };
    });

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
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Search failed" },
      { status }
    );
  }
}
