// src/app/api/cards/[id]/population/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { id?: string } }
  | { params: Promise<{ id?: string }> };

async function getCardId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.id;
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    // ✅ require login (consistent with rest of app)
    await requireUser();

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
    });

    if (!card) {
      return NextResponse.json({ ok: false, error: `Card not found: ${cardId}` }, { status: 404 });
    }

    // ✅ Use groupBy to avoid Prisma "distinct" count issues
    const groups = await prisma.cardOwnership.groupBy({
      by: ["userId"],
      where: {
        cardId,
        quantity: { gt: 0 },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
    });

    const ownerUserIds = groups.map((g) => g.userId);

    const users = ownerUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerUserIds } },
          select: { id: true, name: true, email: true, image: true },
        })
      : [];

    const userById = new Map<string, (typeof users)[number]>();
    for (const u of users) userById.set(u.id, u);

    const owners = groups.map((g) => {
      const u = userById.get(g.userId);
      return {
        userId: g.userId,
        name: u?.name ?? null,
        email: u?.email ?? null,
        image: u?.image ?? null,
        quantity: Number(g._sum.quantity ?? 0),
      };
    });

    const uniqueOwners = owners.length;
    const totalOwned = owners.reduce((sum, o) => sum + (o.quantity ?? 0), 0);

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
      },
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
