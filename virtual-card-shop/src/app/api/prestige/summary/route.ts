// src/app/api/prestige/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { computeProductSetLevel } from "@/lib/prestige";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pctForLevel(level: number) {
  // 2% per completion level, capped at 50%
  const pct = level * 0.02;
  return Math.max(0, Math.min(0.5, pct));
}

function shortErr(e: any) {
  const code = e?.code ?? e?.name ?? "UNKNOWN";
  let message = String(e?.message ?? "Unknown error");

  // keep it short (no stack traces / turbopack noise)
  if (message.length > 260) message = message.slice(0, 260) + "…";

  return { code, message };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const limit = clampInt(parseInt(url.searchParams.get("limit") ?? "60", 10) || 60, 1, 200);

    // Pull prestige rows (created when we sync progress after pack opens,
    // and also created lazily on redeem)
    const rows = await prisma.productSetPrestige.findMany({
      where: { userId: user.id },
      include: {
        productSet: {
          select: { id: true, name: true, productId: true, isBase: true, isInsert: true },
        },
      },
      orderBy: [{ timesCompleted: "desc" }, { updatedAt: "desc" }],
      take: 5000,
    });

    // Buckets: exact counts for early levels + milestone-ish buckets
    const buckets = {
      lvl1: 0,
      lvl2: 0,
      lvl3: 0,
      lvl4: 0,
      lvl5: 0,
      lvl10plus: 0,
      lvl25plus: 0,
    };

    let setsWithAnyCompletion = 0;
    let totalTimesCompleted = 0;
    let totalClaimableCompletions = 0;
    let bonusAwardedCents = 0;

    const claimableCandidates = rows.filter((r) => (r.timesCompleted ?? 0) > (r.claimedCompletions ?? 0));
    const claimableTop = claimableCandidates.slice(0, limit);

    // For claimable preview, compute current level + setValue (can be expensive)
    // We only compute for the top N claimables.
    const claimable = await prisma.$transaction(async (tx) => {
      const out: any[] = [];

      for (const r of claimableTop) {
        const productSetId = r.productSetId;

        const { level: currentLevel, setValue } = await computeProductSetLevel(tx, user.id, productSetId);

        // Keep timesCompleted forward-moving (no money here)
        const timesCompleted = Math.max(r.timesCompleted ?? 0, currentLevel);
        const claimed = r.claimedCompletions ?? 0;
        const canClaim = Math.max(0, timesCompleted - claimed);

        // Preview next claim payout (for the NEXT unclaimed level)
        const nextLevel = claimed + 1;
        const pct = pctForLevel(nextLevel);
        const nextRewardCents = Math.round(setValue * pct * 100);

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
          nextRewardCents,
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

      if (t === 1) buckets.lvl1++;
      else if (t === 2) buckets.lvl2++;
      else if (t === 3) buckets.lvl3++;
      else if (t === 4) buckets.lvl4++;
      else if (t === 5) buckets.lvl5++;
      if (t >= 10) buckets.lvl10plus++;
      if (t >= 25) buckets.lvl25plus++;
    }

    return NextResponse.json(
      {
        ok: true,
        summary: {
          setsWithAnyCompletion,
          totalTimesCompleted,
          totalClaimableCompletions,
          bonusAwardedCents,
          buckets,
        },
        claimable, // top N claimables with preview data
      },
      { status: 200 }
    );
  } catch (e: any) {
    // IMPORTANT: keep the user-facing error short, but include useful debug fields
    // so you can paste ONE network response and we can fix it immediately.
    return NextResponse.json(
      { ok: false, error: "Failed to load prestige summary.", extra: shortErr(e) },
      { status: 500 }
    );
  }
}
