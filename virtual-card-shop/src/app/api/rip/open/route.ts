// src/app/api/rip/open/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { syncPrestigeProgressForProductSets } from "@/lib/prestige";

type Body = { productId?: string };

function pickUnique<T>(arr: T[], n: number) {
  if (n <= 0) return [];
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const productId = (body.productId ?? "").trim();

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const user = await requireUser();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { productSets: true },
    });

    if (!product) {
      return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });
    }

    const cardsPerPack = product.cardsPerPack ?? 15;
    const packPriceCents = product.packPriceCents ?? 0;

    const baseSets = product.productSets.filter((ps) => ps.isBase);
    if (baseSets.length === 0) {
      return NextResponse.json(
        { error: "No Base ProductSet found for this product." },
        { status: 400 }
      );
    }

    const baseSetIds = baseSets.map((s) => s.id);

    const insertSets = product.productSets.filter(
      (ps) => !ps.isBase && ps.oddsPerPack && ps.oddsPerPack > 0
    );

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.sealedInventory.findUnique({
        where: { userId_productId: { userId: user.id, productId } },
      });

      if (!inv || inv.packsOwned <= 0) {
        throw new Error("You do not own any packs of this product.");
      }

      await tx.sealedInventory.update({
        where: { userId_productId: { userId: user.id, productId } },
        data: { packsOwned: { decrement: 1 } },
      });

      const insertsToPull: { setId: string; count: number }[] = [];

      for (const s of insertSets) {
        const n = s.oddsPerPack ?? 0;
        if (n > 0) {
          const hit = Math.floor(Math.random() * n) === 0;
          if (hit) insertsToPull.push({ setId: s.id, count: 1 });
        }
      }

      const totalInserts = insertsToPull.reduce((a, b) => a + b.count, 0);
      const baseNeeded = Math.max(0, cardsPerPack - totalInserts);

      const baseCards = await tx.card.findMany({
        where: { productSetId: { in: baseSetIds } },
        select: {
          id: true,
          productSetId: true,
          cardNumber: true,
          player: true,
          team: true,
          subset: true,
          variant: true,
          frontImageUrl: true,
          backImageUrl: true,
          bookValue: true,
          productSet: {
            select: {
              id: true,
              name: true,
              isBase: true,
              oddsPerPack: true,
            },
          },
        },
      });

      if (baseCards.length < baseNeeded) {
        throw new Error(
          `Not enough base cards to build a pack. Need ${baseNeeded}, found ${baseCards.length}.`
        );
      }

      const chosenBase = pickUnique(baseCards, baseNeeded);

      const chosenInserts: Array<{
        id: number;
        productSetId: string | null;
        cardNumber: string;
        player: string;
        team: string | null;
        subset: string | null;
        variant: string | null;
        frontImageUrl: string | null;
        backImageUrl: string | null;
        bookValue: number;
        productSet: {
          id: string;
          name: string;
          isBase: boolean;
          oddsPerPack: number | null;
        } | null;
      }> = [];

      for (const ins of insertsToPull) {
        const pool = await tx.card.findMany({
          where: { productSetId: ins.setId },
          select: {
            id: true,
            productSetId: true,
            cardNumber: true,
            player: true,
            team: true,
            subset: true,
            variant: true,
            frontImageUrl: true,
            backImageUrl: true,
            bookValue: true,
            productSet: {
              select: {
                id: true,
                name: true,
                isBase: true,
                oddsPerPack: true,
              },
            },
          },
        });

        if (pool.length === 0) continue;

        const taken = new Set<number>([...chosenBase, ...chosenInserts].map((c) => c.id));
        const filtered = pool.filter((c) => !taken.has(c.id));
        if (filtered.length === 0) continue;

        const pick = pickUnique(filtered, 1)[0];
        if (pick) chosenInserts.push(pick);
      }

      const pulled = [...chosenBase, ...chosenInserts];

      if (pulled.length < cardsPerPack) {
        const taken = new Set<number>(pulled.map((c) => c.id));
        const remainingBase = baseCards.filter((c) => !taken.has(c.id));
        const need = cardsPerPack - pulled.length;
        pulled.push(...pickUnique(remainingBase, need));
      }

      const enriched: Array<{
        id: number;
        productSetId: string | null;
        productSetName: string | null;
        productSetOddsPerPack: number | null;
        cardNumber: string;
        player: string;
        team: string | null;
        subset: string | null;
        variant: string | null;
        frontImageUrl: string | null;
        backImageUrl: string | null;
        isInsert: boolean;
        bookValue: number;
        ownedAfter: number;
      }> = [];

      for (const c of pulled) {
        const ownership = await tx.cardOwnership.upsert({
          where: { userId_cardId: { userId: user.id, cardId: c.id } },
          create: { userId: user.id, cardId: c.id, quantity: 1 },
          update: { quantity: { increment: 1 } },
          select: { quantity: true },
        });

        const isInsert = !(c.productSet?.isBase ?? true);

        enriched.push({
          id: c.id,
          productSetId: c.productSetId,
          productSetName: c.productSet?.name ?? null,
          productSetOddsPerPack: c.productSet?.oddsPerPack ?? null,
          cardNumber: c.cardNumber,
          player: c.player,
          team: c.team,
          subset: c.subset,
          variant: c.variant,
          frontImageUrl: c.frontImageUrl,
          backImageUrl: c.backImageUrl,
          isInsert,
          bookValue: c.bookValue,
          ownedAfter: ownership.quantity,
        });
      }

      const productSetIdsTouched = Array.from(
        new Set(pulled.map((c) => String(c.productSetId ?? "").trim()).filter(Boolean))
      );

      if (productSetIdsTouched.length > 0) {
        await syncPrestigeProgressForProductSets({
          tx,
          userId: user.id,
          productSetIds: productSetIdsTouched,
        });
      }

      return enriched;
    });

    return NextResponse.json({
      ok: true,
      productId,
      packImageUrl: product.packImageUrl ?? null,
      packPriceCents,
      cardsPerPack,
      cards: result,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = err?.status ?? (err?.message === "Unauthorized" ? 401 : 500);
    return NextResponse.json({ error: err?.message ?? "Open pack failed" }, { status });
  }
}