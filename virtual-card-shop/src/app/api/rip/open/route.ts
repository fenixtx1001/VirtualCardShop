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

type PulledCard = {
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
    name: string | null;
    isBase: boolean;
    oddsPerPack: number | null;
  } | null;
};

type EnrichedCard = {
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
  ownedBefore: number;
  ownedAfter: number;

  // Prestige UI fields
  prestigeTargetLevel: number | null;
  isNeededForNextPrestige: boolean;
  hitNextPrestigeWithThisCard: boolean;
};

type SetPrestigeSnapshot = {
  totalCards: number;
  currentPrestigeLevel: number;
  nextPrestigeLevel: number;
  beforeQtyByCardId: Map<number, number>;
  missingForNextPrestigeBefore: Set<number>;
};

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

      const chosenInserts: PulledCard[] = [];

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

      const pulled: PulledCard[] = [...chosenBase, ...chosenInserts];

      if (pulled.length < cardsPerPack) {
        const taken = new Set<number>(pulled.map((c) => c.id));
        const remainingBase = baseCards.filter((c) => !taken.has(c.id));
        const need = cardsPerPack - pulled.length;
        pulled.push(...pickUnique(remainingBase, need));
      }

      const productSetIdsTouched = Array.from(
        new Set(pulled.map((c) => String(c.productSetId ?? "").trim()).filter(Boolean))
      );

      // Snapshot each touched set BEFORE ownership increments
      const setSnapshots = new Map<string, SetPrestigeSnapshot>();

      for (const productSetId of productSetIdsTouched) {
        const cardsInSet = await tx.card.findMany({
          where: { productSetId },
          select: { id: true },
          orderBy: { id: "asc" },
        });

        const ownershipsInSet = await tx.cardOwnership.findMany({
          where: {
            userId: user.id,
            card: { productSetId },
          },
          select: {
            cardId: true,
            quantity: true,
          },
        });

        const beforeQtyByCardId = new Map<number, number>();
        for (const ownership of ownershipsInSet) {
          beforeQtyByCardId.set(ownership.cardId, ownership.quantity);
        }

        let currentPrestigeLevel = Number.POSITIVE_INFINITY;
        const missingForNextPrestigeBefore = new Set<number>();

        for (const card of cardsInSet) {
          const qty = beforeQtyByCardId.get(card.id) ?? 0;
          if (qty < currentPrestigeLevel) currentPrestigeLevel = qty;
        }

        if (!Number.isFinite(currentPrestigeLevel)) {
          currentPrestigeLevel = 0;
        }

        const nextPrestigeLevel = currentPrestigeLevel + 1;

        for (const card of cardsInSet) {
          const qty = beforeQtyByCardId.get(card.id) ?? 0;
          if (qty < nextPrestigeLevel) {
            missingForNextPrestigeBefore.add(card.id);
          }
        }

        setSnapshots.set(productSetId, {
          totalCards: cardsInSet.length,
          currentPrestigeLevel,
          nextPrestigeLevel,
          beforeQtyByCardId,
          missingForNextPrestigeBefore,
        });
      }

      const enriched: EnrichedCard[] = [];

      for (const c of pulled) {
        const beforeQty =
          c.productSetId && setSnapshots.has(c.productSetId)
            ? (setSnapshots.get(c.productSetId)!.beforeQtyByCardId.get(c.id) ?? 0)
            : 0;

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
          ownedBefore: beforeQty,
          ownedAfter: ownership.quantity,
          prestigeTargetLevel: null,
          isNeededForNextPrestige: false,
          hitNextPrestigeWithThisCard: false,
        });
      }

      // Apply the exact three-scenario prestige logic
      // Scenario 1: card does not matter for next prestige -> no UI flags
      // Scenario 2: card is one of multiple needed -> isNeededForNextPrestige = true
      // Scenario 3: card is the final one needed -> isNeededForNextPrestige = true AND hitNextPrestigeWithThisCard = true
      for (const [productSetId, snapshot] of setSnapshots.entries()) {
        const indicesForSet = enriched
          .map((card, index) => ({ card, index }))
          .filter(({ card }) => card.productSetId === productSetId);

        if (indicesForSet.length === 0) continue;

        const remainingMissing = new Set<number>(snapshot.missingForNextPrestigeBefore);
        let milestoneAssigned = false;

        for (const { card, index } of indicesForSet) {
          const beforeQty = card.ownedBefore;
          const afterQty = card.ownedAfter;
          const target = snapshot.nextPrestigeLevel;

          const thisCardWasNeeded =
            beforeQty < target &&
            afterQty >= target &&
            remainingMissing.has(card.id);

          if (!thisCardWasNeeded) {
            continue;
          }

          enriched[index].prestigeTargetLevel = target;
          enriched[index].isNeededForNextPrestige = true;

          remainingMissing.delete(card.id);

          if (!milestoneAssigned && remainingMissing.size === 0) {
            enriched[index].hitNextPrestigeWithThisCard = true;
            milestoneAssigned = true;
          }
        }
      }

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