// src/app/api/shop/singles/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatFriendlyProductSetId(productSetId: string | null | undefined) {
  const s = String(productSetId ?? "").trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 100000);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "40", 10) || 40, 1, 100);
    const sort = (url.searchParams.get("sort") ?? "default").trim();
    const onlyNeed = url.searchParams.get("onlyNeed") === "1";

    const whereInv: any = { quantity: { gt: 0 } };

    const cardWhere =
      q.length > 0
        ? {
            OR: [
              { player: { contains: q, mode: "insensitive" } },
              { team: { contains: q, mode: "insensitive" } },
              { cardNumber: { contains: q, mode: "insensitive" } },
              { subset: { contains: q, mode: "insensitive" } },
              { variant: { contains: q, mode: "insensitive" } },
              { productSetId: { contains: q, mode: "insensitive" } },
              { productSet: { name: { contains: q, mode: "insensitive" } } },
              { productSet: { product: { brand: { contains: q, mode: "insensitive" } } } },
              { productSet: { product: { sport: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : undefined;

    const orderBy =
      sort === "price_asc"
        ? [{ card: { bookValue: "asc" as const } }, { updatedAt: "desc" as const }]
        : sort === "price_desc"
        ? [{ card: { bookValue: "desc" as const } }, { updatedAt: "desc" as const }]
        : [{ quantity: "desc" as const }, { updatedAt: "desc" as const }];

    const allRows = await prisma.shopInventory.findMany({
      where: { ...whereInv, ...(cardWhere ? { card: cardWhere } : {}) },
      include: {
        card: {
          include: {
            productSet: {
              select: {
                id: true,
                name: true,
                product: {
                  select: {
                    year: true,
                    brand: true,
                    sport: true,
                  },
                },
              },
            },
            ownerships: {
              where: { userId: user.id },
              select: { quantity: true },
            },
          },
        },
      },
      orderBy,
    });

    const normalized = allRows.map((r) => {
      const youOwnQty = r.card.ownerships?.[0]?.quantity ?? 0;

      const setNameRaw = (r.card.productSet?.name ?? "").trim();
      const productYear = r.card.productSet?.product?.year ?? null;
      const productBrand = (r.card.productSet?.product?.brand ?? "").trim();
      const productSport = (r.card.productSet?.product?.sport ?? "").trim();

      const friendlySetName =
        setNameRaw ||
        formatFriendlyProductSetId(r.card.productSetId);

      const friendlyProductLabel = [productYear, productBrand, productSport].filter(Boolean).join(" ").trim();

      return {
        cardId: r.cardId,
        quantity: r.quantity,
        updatedAt: r.updatedAt,
        youOwnQty,
        card: {
          id: r.card.id,
          player: r.card.player,
          team: r.card.team,
          cardNumber: r.card.cardNumber,
          subset: r.card.subset,
          variant: r.card.variant,
          bookValue: r.card.bookValue,
          frontImageUrl: r.card.frontImageUrl,
          productSetId: r.card.productSetId,
          friendlySetName,
          friendlyProductLabel,
        },
      };
    });

    const filtered = onlyNeed ? normalized.filter((r) => r.youOwnQty === 0) : normalized;

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    return NextResponse.json(
      {
        ok: true,
        q,
        page: safePage,
        pageSize,
        total,
        totalPages,
        rows,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load shop inventory." },
      { status: 500 }
    );
  }
}