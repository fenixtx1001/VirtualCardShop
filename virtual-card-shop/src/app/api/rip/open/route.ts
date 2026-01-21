import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/default-user";

type Body = { productId?: string };

function pickUnique<T>(arr: T[], n: number) {
  if (n <= 0) return [];
  const copy = [...arr];
  // Fisher–Yates shuffle
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
    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    const user = await getOrCreateDefaultUser();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { productSets: true },
    });

    if (!product) return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });

    const cardsPerPack = product.cardsPerPack ?? 15;

    // Must have at least 1 base set
    const baseSets = product.productSets.filter((ps) => ps.isBase);
    if (baseSets.length === 0) {
      return NextResponse.json({ error: "No Base ProductSet found for this product." }, { status: 400 });
    }
    const baseSetIds = baseSets.map((s) => s.id);

    // Insert pools = non-base with oddsPerPack set (optional)
    const insertSets = product.productSets.filter((ps) => !ps.isBase && ps.oddsPerPack && ps.oddsPerPack > 0);

    // Open pack transaction: decrement sealed pack, select cards, upsert ownership
    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.sealedInventory.findUnique({
        where: { userId_productId: { userId: user.id, productId } },
      });

      if (!inv || inv.packsOwned <= 0) {
        throw new Error("You do not own any packs of this product.");
      }

      // decrement 1 pack
      await tx.sealedInventory.update({
        where: { userId_productId: { userId: user.id, productId } },
        data: { packsOwned: { decrement: 1 } },
      });

      // Decide how many inserts hit (each insert set is an independent 1-in-N roll)
      const insertsToPull: { setId: string; count: number }[] = [];
      for (const s of insertSets) {
        const n = s.oddsPerPack ?? 0;
        if (n > 0) {
          const hit = Math.floor(Math.random() * n) === 0; // 1 in N
          if (hit) insertsToPull.push({ setId: s.id, count: 1 });
        }
      }
      const totalInserts = insertsToPull.reduce((a, b) => a + b.count, 0);
      const baseNeeded = Math.max(0, cardsPerPack - totalInserts);

      // Load base pool cards
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
        },
      });

      if (baseCards.length < baseNeeded) {
        throw new Error(
          `Not enough base cards to build a pack. Need ${baseNeeded}, found ${baseCards.length}.`
        );
      }

      // Pick base cards (no dupes within pack)
      const chosenBase = pickUnique(baseCards, baseNeeded);

      // Pick insert cards (no dupes within pack)
      const chosenInserts: any[] = [];
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
          },
        });

        if (pool.length === 0) continue;

        // prevent duplicates with base + already chosen inserts
        const taken = new Set<number>([...chosenBase, ...chosenInserts].map((c) => c.id));
        const filtered = pool.filter((c) => !taken.has(c.id));
        if (filtered.length === 0) continue;

        const pick = pickUnique(filtered, 1)[0];
        if (pick) chosenInserts.push(pick);
      }

      const pulled = [...chosenBase, ...chosenInserts];

      // Safety: if inserts rolled but failed due to no pool, backfill with more base to hit exact count
      if (pulled.length < cardsPerPack) {
        const taken = new Set<number>(pulled.map((c) => c.id));
        const remainingBase = baseCards.filter((c) => !taken.has(c.id));
        const need = cardsPerPack - pulled.length;
        pulled.push(...pickUnique(remainingBase, need));
      }

      // Now upsert ownership and return ownedAfter
      const enriched = [];
      for (const c of pulled) {
        const ownership = await tx.cardOwnership.upsert({
          where: { userId_cardId: { userId: user.id, cardId: c.id } },
          create: { userId: user.id, cardId: c.id, quantity: 1 },
          update: { quantity: { increment: 1 } },
          select: { quantity: true },
        });

        const isInsert = !baseSetIds.includes(c.productSetId ?? "");

        enriched.push({
          ...c,
          isInsert,
          ownedAfter: ownership.quantity,
        });
      }

      // Optional: sort by cardNumber for the pack list (reveal order remains as returned)
      // (We leave reveal order as-is. Your UI already reveals in the order returned.)
      return enriched;
    });

    return NextResponse.json({
      ok: true,
      productId,
      packImageUrl: product.packImageUrl ?? null,
      cardsPerPack,
      cards: result,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Open pack failed" }, { status: 500 });
  }
}
