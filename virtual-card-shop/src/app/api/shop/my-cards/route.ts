// src/app/api/shop/my-cards/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

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

/**
 * Search the current user's owned cards (quantity > 0).
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

    // Require a query to avoid dumping the whole collection by accident
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
            productSet: {
              select: {
                id: true,
                name: true,
                productId: true,
                isBase: true,
                isInsert: true,
              },
            },
          },
        },
      },
      orderBy: [{ quantity: "desc" }, { card: { bookValue: "desc" } }],
      take,
    });

    const out = rows.map((r) => ({
      cardId: r.card.id,
      qtyOwned: r.quantity,
      bookValue: typeof r.card.bookValue === "number" ? r.card.bookValue : 0,

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
    }));

    return NextResponse.json({ ok: true, q, count: out.length, rows: out }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to load your cards." }, { status: 500 });
  }
}