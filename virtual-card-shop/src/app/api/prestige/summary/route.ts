// src/app/api/prestige/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MILESTONES = [1, 2, 3, 4, 5, 10, 25, 50, 75, 100] as const;

type BucketKey =
  | "lvl1"
  | "lvl2"
  | "lvl3"
  | "lvl4"
  | "lvl5"
  | "lvl10"
  | "lvl25"
  | "lvl50"
  | "lvl75"
  | "lvl100";

type BucketSet = {
  productSetId: string;
  productId: string | null;
  productSetName: string | null;
  isBase: boolean;
  isInsert: boolean;
  timesCompleted: number;
  claimedCompletions: number;
  claimable: number;
  sampleImageUrl: string | null;
};

type SyncedPrestigeRow = {
  productSetId: string;
  productSet: {
    id: string;
    name: string | null;
    productId: string | null;
    isBase: boolean;
    isInsert: boolean;
  } | null;
  timesCompleted: number;
  claimedCompletions: number;
  bonusAwardedCents: number;
  setValue: number;
};

type ProductSetCardStats = {
  totalCards: number;
  setValue: number;
  cardIds: number[];
  imageUrls: string[];
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeMoney(n: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");
  if (message.length > 260) message = message.slice(0, 260) + "…";
  return { code, message };
}

function getMultiplierForLevel(level: number) {
  switch (level) {
    case 1:
      return 0.05;
    case 2:
      return 0.075;
    case 3:
      return 0.1;
    case 4:
      return 0.15;
    case 5:
      return 0.25;
    case 10:
      return 0.5;
    case 25:
      return 2.0;
    case 50:
      return 3.0;
    case 75:
      return 5.0;
    case 100:
      return 8.0;
    default:
      return 0;
  }
}

function getBucketKey(level: number): BucketKey | null {
  if (level >= 100) return "lvl100";
  if (level >= 75) return "lvl75";
  if (level >= 50) return "lvl50";
  if (level >= 25) return "lvl25";
  if (level >= 10) return "lvl10";
  if (level >= 5) return "lvl5";
  if (level === 4) return "lvl4";
  if (level === 3) return "lvl3";
  if (level === 2) return "lvl2";
  if (level === 1) return "lvl1";
  return null;
}

function nextMilestoneAfter(level: number) {
  for (const m of MILESTONES) {
    if (m > level) return m;
  }
  return null;
}

function rewardReadyCentsForRange(
  fromClaimed: number,
  toCompleted: number,
  setValue: number
) {
  let total = 0;

  for (let lvl = fromClaimed + 1; lvl <= toCompleted; lvl++) {
    const multiplier = getMultiplierForLevel(lvl);

    if (multiplier > 0) {
      total += Math.round(setValue * multiplier * 100);
    }
  }

  return total;
}

function stableIndex(seed: string, max: number) {
  if (max <= 0) return 0;

  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  return hash % max;
}

export async function GET(req: Request) {
  try {
    const viewer = await requireUser();
    const url = new URL(req.url);

    const limit = clampInt(
      parseInt(url.searchParams.get("limit") ?? "60", 10) || 60,
      1,
      200
    );

    const requestedUserId = (
      url.searchParams.get("userId") ?? ""
    ).trim();

    const targetUserId = requestedUserId || viewer.id;

    /*
     * STEP 1
     *
     * Load the user's stored prestige records.
     *
     * These records preserve historical prestige completion. We still
     * calculate current ownership below because currentLevel may be higher
     * than the stored level, while stored timesCompleted must never decrease.
     */
    const rawRows = await prisma.productSetPrestige.findMany({
      where: {
        userId: targetUserId,
      },
      include: {
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
      orderBy: [
        {
          timesCompleted: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
      take: 5000,
    });

    if (rawRows.length === 0) {
      const emptyBuckets: Record<BucketKey, number> = {
        lvl1: 0,
        lvl2: 0,
        lvl3: 0,
        lvl4: 0,
        lvl5: 0,
        lvl10: 0,
        lvl25: 0,
        lvl50: 0,
        lvl75: 0,
        lvl100: 0,
      };

      const emptyBucketSets: Record<BucketKey, BucketSet[]> = {
        lvl1: [],
        lvl2: [],
        lvl3: [],
        lvl4: [],
        lvl5: [],
        lvl10: [],
        lvl25: [],
        lvl50: [],
        lvl75: [],
        lvl100: [],
      };

      return NextResponse.json(
        {
          ok: true,
          targetUserId,
          summary: {
            setsWithAnyCompletion: 0,
            totalTimesCompleted: 0,
            totalClaimableCompletions: 0,
            bonusAwardedCents: 0,
            buckets: emptyBuckets,
            bucketSets: emptyBucketSets,
          },
          claimable: [],
        },
        {
          status: 200,
        }
      );
    }

    const productSetIds = Array.from(
      new Set(
        rawRows
          .map((r) => r.productSetId)
          .filter((id): id is string => Boolean(id))
      )
    );

    /*
     * STEP 2
     *
     * This is the main performance improvement.
     *
     * The old implementation called computeProductSetLevel() separately
     * for every prestige row. That helper performed three DB queries per
     * product set, and the loop awaited them serially.
     *
     * Instead, load ALL cards, ownership and pending grading quantities
     * for ALL relevant ProductSets in three batched queries.
     */
    const [cards, ownershipRows, pendingGradingRows] = await Promise.all([
      prisma.card.findMany({
        where: {
          productSetId: {
            in: productSetIds,
          },
        },
        select: {
          id: true,
          productSetId: true,
          bookValue: true,
          frontImageUrl: true,
        },
        orderBy: {
          id: "asc",
        },
      }),

      prisma.cardOwnership.findMany({
        where: {
          userId: targetUserId,
          quantity: {
            gt: 0,
          },
          card: {
            productSetId: {
              in: productSetIds,
            },
          },
        },
        select: {
          cardId: true,
          quantity: true,
        },
      }),

      prisma.gradingOrder.findMany({
        where: {
          userId: targetUserId,
          quantity: {
            gt: 0,
          },
          revealedAt: null,
          card: {
            productSetId: {
              in: productSetIds,
            },
          },
        },
        select: {
          cardId: true,
          quantity: true,
        },
      }),
    ]);

    /*
     * STEP 3
     *
     * Aggregate ownership across grade buckets.
     *
     * A CardOwnership row exists independently for raw / VCS grades,
     * so quantities for the same cardId must be added together.
     */
    const quantityByCardId = new Map<number, number>();

    for (const ownership of ownershipRows) {
      quantityByCardId.set(
        ownership.cardId,
        (quantityByCardId.get(ownership.cardId) ?? 0) +
          (ownership.quantity ?? 0)
      );
    }

    /*
     * Cards currently in unrevealed grading orders still belong to the user
     * and therefore continue counting toward Prestige completion.
     */
    for (const order of pendingGradingRows) {
      quantityByCardId.set(
        order.cardId,
        (quantityByCardId.get(order.cardId) ?? 0) +
          (order.quantity ?? 0)
      );
    }

    /*
     * STEP 4
     *
     * Build everything we need about each ProductSet from the single
     * batched card query:
     *
     * - card IDs
     * - total set value
     * - sample image candidates
     */
    const cardStatsByProductSetId = new Map<
      string,
      ProductSetCardStats
    >();

    for (const card of cards) {
      if (!card.productSetId) continue;

      let stats = cardStatsByProductSetId.get(card.productSetId);

      if (!stats) {
        stats = {
          totalCards: 0,
          setValue: 0,
          cardIds: [],
          imageUrls: [],
        };

        cardStatsByProductSetId.set(card.productSetId, stats);
      }

      stats.totalCards++;
      stats.setValue += safeMoney(card.bookValue);
      stats.cardIds.push(card.id);

      if (card.frontImageUrl) {
        stats.imageUrls.push(card.frontImageUrl);
      }
    }

    /*
     * STEP 5
     *
     * Calculate current Prestige level in memory.
     *
     * Prestige level = minimum effective quantity across every card
     * in the ProductSet.
     */
    const rows: SyncedPrestigeRow[] = [];

    const progressUpdates: Array<{
      productSetId: string;
      timesCompleted: number;
    }> = [];

    for (const r of rawRows) {
      const stats = cardStatsByProductSetId.get(r.productSetId);

      let currentLevel = 0;
      let setValue = 0;

      if (stats && stats.totalCards > 0) {
        setValue = stats.setValue;

        let minQty = Number.POSITIVE_INFINITY;

        for (const cardId of stats.cardIds) {
          const quantity = quantityByCardId.get(cardId) ?? 0;

          if (quantity < minQty) {
            minQty = quantity;
          }

          if (minQty === 0) {
            break;
          }
        }

        if (!Number.isFinite(minQty)) {
          minQty = 0;
        }

        currentLevel = Math.max(0, Math.floor(minQty));
      }

      const storedTimesCompleted = r.timesCompleted ?? 0;

      /*
       * Historical completion never moves backward.
       *
       * Example:
       * User completed a set 5 times and later sold a copy.
       * Their current ownership may calculate to 4, but their Prestige
       * history remains 5.
       */
      const timesCompleted = Math.max(
        storedTimesCompleted,
        currentLevel
      );

      /*
       * Usually this array will be empty because pack opening already
       * synchronizes Prestige progress.
       *
       * This preserves the old summary endpoint's safety behavior for
       * progress gained through another ownership path.
       */
      if (timesCompleted > storedTimesCompleted) {
        progressUpdates.push({
          productSetId: r.productSetId,
          timesCompleted,
        });
      }

      rows.push({
        productSetId: r.productSetId,
        productSet: r.productSet,
        timesCompleted,
        claimedCompletions: r.claimedCompletions ?? 0,
        bonusAwardedCents: r.bonusAwardedCents ?? 0,
        setValue,
      });
    }

    /*
     * Persist only the rare rows whose calculated Prestige level has
     * moved beyond the stored historical value.
     *
     * Unlike the old implementation, these do not interrupt the main
     * calculation one ProductSet at a time.
     */
    if (progressUpdates.length > 0) {
      await Promise.all(
        progressUpdates.map((update) =>
          prisma.productSetPrestige.update({
            where: {
              userId_productSetId: {
                userId: targetUserId,
                productSetId: update.productSetId,
              },
            },
            data: {
              timesCompleted: update.timesCompleted,
            },
          })
        )
      );
    }

    rows.sort((a, b) => {
      if (b.timesCompleted !== a.timesCompleted) {
        return b.timesCompleted - a.timesCompleted;
      }

      return (
        a.productSet?.name ?? a.productSetId
      ).localeCompare(
        b.productSet?.name ?? b.productSetId
      );
    });

    /*
     * STEP 6
     *
     * Reuse the images already loaded with the card query.
     *
     * The previous implementation made another potentially-large DB
     * request solely to retrieve sample card images.
     */
    const sampleImagesByProductSetId = new Map<
      string,
      string | null
    >();

    for (const productSetId of productSetIds) {
      const images =
        cardStatsByProductSetId.get(productSetId)?.imageUrls ?? [];

      const idx = stableIndex(
        `${targetUserId}:${productSetId}`,
        images.length
      );

      sampleImagesByProductSetId.set(
        productSetId,
        images[idx] ?? null
      );
    }

    const buckets: Record<BucketKey, number> = {
      lvl1: 0,
      lvl2: 0,
      lvl3: 0,
      lvl4: 0,
      lvl5: 0,
      lvl10: 0,
      lvl25: 0,
      lvl50: 0,
      lvl75: 0,
      lvl100: 0,
    };

    const bucketSets: Record<BucketKey, BucketSet[]> = {
      lvl1: [],
      lvl2: [],
      lvl3: [],
      lvl4: [],
      lvl5: [],
      lvl10: [],
      lvl25: [],
      lvl50: [],
      lvl75: [],
      lvl100: [],
    };

    let setsWithAnyCompletion = 0;
    let totalTimesCompleted = 0;
    let totalClaimableCompletions = 0;
    let bonusAwardedCents = 0;

    for (const r of rows) {
      const t = r.timesCompleted ?? 0;
      const claimed = r.claimedCompletions ?? 0;

      if (t > 0) {
        setsWithAnyCompletion++;
      }

      totalTimesCompleted += t;

      totalClaimableCompletions += Math.max(
        0,
        t - claimed
      );

      bonusAwardedCents += r.bonusAwardedCents ?? 0;

      const bucketKey = getBucketKey(t);

      if (!bucketKey) continue;

      buckets[bucketKey]++;

      bucketSets[bucketKey].push({
        productSetId: r.productSetId,
        productId: r.productSet?.productId ?? null,
        productSetName: r.productSet?.name ?? null,
        isBase: !!r.productSet?.isBase,
        isInsert: !!r.productSet?.isInsert,
        timesCompleted: t,
        claimedCompletions: claimed,
        claimable: Math.max(0, t - claimed),
        sampleImageUrl:
          sampleImagesByProductSetId.get(r.productSetId) ?? null,
      });
    }

    for (const key of Object.keys(
      bucketSets
    ) as BucketKey[]) {
      bucketSets[key].sort((a, b) => {
        if (b.timesCompleted !== a.timesCompleted) {
          return b.timesCompleted - a.timesCompleted;
        }

        return (
          a.productSetName ?? a.productSetId
        ).localeCompare(
          b.productSetName ?? b.productSetId
        );
      });
    }

    const claimableCandidates = rows.filter(
      (r) =>
        (r.timesCompleted ?? 0) >
        (r.claimedCompletions ?? 0)
    );

    const claimableTop = claimableCandidates.slice(
      0,
      limit
    );

    const claimable = claimableTop.map((r) => {
      const claimed = r.claimedCompletions ?? 0;
      const timesCompleted = r.timesCompleted ?? 0;

      const canClaim = Math.max(
        0,
        timesCompleted - claimed
      );

      const rewardReadyCents =
        rewardReadyCentsForRange(
          claimed,
          timesCompleted,
          r.setValue
        );

      const nextMilestoneLevel =
        nextMilestoneAfter(claimed);

      return {
        productSetId: r.productSetId,
        productId: r.productSet?.productId ?? null,
        productSetName: r.productSet?.name ?? null,
        isBase: !!r.productSet?.isBase,
        isInsert: !!r.productSet?.isInsert,
        timesCompleted,
        claimedCompletions: claimed,
        claimable: canClaim,
        setValue: r.setValue,
        rewardReadyCents,
        nextMilestoneLevel,
        bonusAwardedCents:
          r.bonusAwardedCents ?? 0,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        targetUserId,
        summary: {
          setsWithAnyCompletion,
          totalTimesCompleted,
          totalClaimableCompletions,
          bonusAwardedCents,
          buckets,
          bucketSets,
        },
        claimable,
      },
      {
        status: 200,
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load prestige summary.",
        extra: shortErr(e),
      },
      {
        status: 500,
      }
    );
  }
}