// src/app/api/prestige/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { computeProductSetLevel } from "@/lib/prestige";

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

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function rewardReadyCentsForRange(fromClaimed: number, toCompleted: number, setValue: number) {
  let total = 0;

  for (let lvl = fromClaimed + 1; lvl <= toCompleted; lvl++) {
    const multiplier = getMultiplierForLevel(lvl);
    if (multiplier > 0) {
      total += Math.round(setValue * multiplier * 100);
    }
  }

  return total;
}

export async function GET(req: Request) {
  try {
    const viewer = await requireUser();
    const url = new URL(req.url);

    const limit = clampInt(parseInt(url.searchParams.get("limit") ?? "60", 10) || 60, 1, 200);
    const requestedUserId = (url.searchParams.get("userId") ?? "").trim();
    const targetUserId = requestedUserId || viewer.id;

    const rows = await prisma.productSetPrestige.findMany({
      where: { userId: targetUserId },
      include: {
        productSet: {
          select: { id: true, name: true, productId: true, isBase: true, isInsert: true },
        },
      },
      orderBy: [{ timesCompleted: "desc" }, { updatedAt: "desc" }],
      take: 5000,
    });

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

    const bucketSets: Record<
      BucketKey,
      Array<{
        productSetId: string;
        productId: string | null;
        productSetName: string | null;
        isBase: boolean;
        isInsert: boolean;
        timesCompleted: number;
        claimedCompletions: number;
        claimable: number;
      }>
    > = {
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

    const claimableCandidates = rows.filter((r) => (r.timesCompleted ?? 0) > (r.claimedCompletions ?? 0));
    const claimableTop = claimableCandidates.slice(0, limit);

    const claimable = await prisma.$transaction(async (tx) => {
      const out: Array<{
        productSetId: string;
        productId: string | null;
        productSetName: string | null;
        isBase: boolean;
        isInsert: boolean;
        timesCompleted: number;
        claimedCompletions: number;
        claimable: number;
        setValue: number;
        rewardReadyCents: number;
        nextMilestoneLevel: number | null;
        bonusAwardedCents: number;
      }> = [];

      for (const r of claimableTop) {
        const productSetId = r.productSetId;
        const { level: currentLevel, setValue } = await computeProductSetLevel(tx, targetUserId, productSetId);

        const timesCompleted = Math.max(r.timesCompleted ?? 0, currentLevel);
        const claimed = r.claimedCompletions ?? 0;
        const canClaim = Math.max(0, timesCompleted - claimed);

        const rewardReadyCents = rewardReadyCentsForRange(claimed, timesCompleted, setValue);
        const nextMilestoneLevel = nextMilestoneAfter(claimed);

        out.push({
          productSetId,
          productId: r.productSet?.productId ?? null,
          productSetName: r.productSet?.name ?? null,
          isBase: !!r.productSet?.isBase,
          isInsert: !!r.productSet?.isInsert,
          timesCompleted,
          claimedCompletions: claimed,
          claimable: canClaim,
          setValue,
          rewardReadyCents,
          nextMilestoneLevel,
          bonusAwardedCents: r.bonusAwardedCents ?? 0,
        });
      }

      return out;
    });

    for (const r of rows) {
      const t = r.timesCompleted ?? 0;
      const claimed = r.claimedCompletions ?? 0;

      if (t > 0) setsWithAnyCompletion++;
      totalTimesCompleted += t;
      totalClaimableCompletions += Math.max(0, t - claimed);
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
      });
    }

    for (const key of Object.keys(bucketSets) as BucketKey[]) {
      bucketSets[key].sort((a, b) => {
        if (b.timesCompleted !== a.timesCompleted) return b.timesCompleted - a.timesCompleted;
        return (a.productSetName ?? a.productSetId).localeCompare(b.productSetName ?? b.productSetId);
      });
    }

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
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to load prestige summary.", extra: shortErr(e) },
      { status: 500 }
    );
  }
}