// src/app/api/rip/open/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { syncPrestigeProgressForProductSets } from "@/lib/prestige";

type Body = { productId?: string };

const RAW_GRADE = 0;

function pickUnique<T>(arr: T[], n: number) {
  if (n <= 0) return [];
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function addToQtyMap(map: Map<number, number>, cardId: number, quantity: number) {
  map.set(cardId, (map.get(cardId) ?? 0) + quantity);
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
  ripBoxId: number | null;

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

      const openRipBoxes = await tx.ripBox.findMany({
        where: {
          userId: user.id,
          productId,
          isClosed: false,
        },
        select: {
          id: true,
          packsPurchased: true,
          packsOpened: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      const trackedPacksRemaining = openRipBoxes.reduce((sum, box) => {
        return sum + Math.max(0, box.packsPurchased - box.packsOpened);
      }, 0);

      const loosePacksBefore = Math.max(0, inv.packsOwned - trackedPacksRemaining);
      const ripBoxForThisPack =
        loosePacksBefore > 0
          ? null
          : openRipBoxes.find((box) => box.packsOpened < box.packsPurchased) ?? null;

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
            quantity: { gt: 0 },
            card: { productSetId },
          },
          select: {
            cardId: true,
            quantity: true,
          },
        });

        const beforeQtyByCardId = new Map<number, number>();
        for (const ownership of ownershipsInSet) {
          addToQtyMap(beforeQtyByCardId, ownership.cardId, ownership.quantity);
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
      const pulledCountByCardId = new Map<number, number>();

      for (const c of pulled) {
        const previousPulledThisPack = pulledCountByCardId.get(c.id) ?? 0;

        const beforeQtyFromSnapshot =
          c.productSetId && setSnapshots.has(c.productSetId)
            ? (setSnapshots.get(c.productSetId)!.beforeQtyByCardId.get(c.id) ?? 0)
            : 0;

        const ownedBefore = beforeQtyFromSnapshot + previousPulledThisPack;

        const ownership = await tx.cardOwnership.upsert({
          where: {
            userId_cardId_grade: {
              userId: user.id,
              cardId: c.id,
              grade: RAW_GRADE,
            },
          },
          create: {
            userId: user.id,
            cardId: c.id,
            grade: RAW_GRADE,
            quantity: 1,
            gradedAt: null,
          },
          update: {
            quantity: { increment: 1 },
          },
          select: { quantity: true },
        });

        const totalPulledForCardThisPack = previousPulledThisPack + 1;
        pulledCountByCardId.set(c.id, totalPulledForCardThisPack);

        const ownedAfter = beforeQtyFromSnapshot + totalPulledForCardThisPack;
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
          ownedBefore,
          ownedAfter,
          ripBoxId: ripBoxForThisPack?.id ?? null,
          prestigeTargetLevel: null,
          isNeededForNextPrestige: false,
          hitNextPrestigeWithThisCard: false,
        });

        void ownership.quantity;
      }

      if (ripBoxForThisPack) {
        const quantityByCardId = new Map<number, number>();

        for (const pulledCard of pulled) {
          addToQtyMap(quantityByCardId, pulledCard.id, 1);
        }

        for (const [cardId, quantity] of quantityByCardId.entries()) {
          await tx.ripBoxCard.upsert({
            where: {
              ripBoxId_cardId: {
                ripBoxId: ripBoxForThisPack.id,
                cardId,
              },
            },
            create: {
              ripBoxId: ripBoxForThisPack.id,
              cardId,
              quantity,
            },
            update: {
              quantity: { increment: quantity },
            },
          });
        }

        const packsOpenedAfter = ripBoxForThisPack.packsOpened + 1;

        await tx.ripBox.update({
          where: { id: ripBoxForThisPack.id },
          data: {
            packsOpened: { increment: 1 },
            isClosed: packsOpenedAfter >= ripBoxForThisPack.packsPurchased,
          },
        });
      }

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

      return {
        cards: enriched,
        ripBoxId: ripBoxForThisPack?.id ?? null,
        usedLoosePack: !ripBoxForThisPack,
      };
    });

    return NextResponse.json({
      ok: true,
      productId,
      packImageUrl: product.packImageUrl ?? null,
      packPriceCents,
      cardsPerPack,
      ripBoxId: result.ripBoxId,
      usedLoosePack: result.usedLoosePack,
      cards: result.cards,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = err?.status ?? (err?.message === "Unauthorized" ? 401 : 500);
    return NextResponse.json({ error: err?.message ?? "Open pack failed" }, { status });
  }
}