// src/app/api/reward/claim/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { createFinancialTransaction } from "@/lib/financial-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REWARD_CENTS = 1000; // $10
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function buildRewardResponse(user: {
  balanceCents: number;
  nextRewardAt: Date | null;
  claimedCents?: number;
}) {
  const nowMs = Date.now();
  const nextMs = user.nextRewardAt ? user.nextRewardAt.getTime() : null;

  const canClaim = nextMs === null || nowMs >= nextMs;
  const msUntilNextClaim = canClaim ? 0 : Math.max(0, nextMs - nowMs);

  return {
    ok: true,
    balanceCents: user.balanceCents,
    nextRewardAt: user.nextRewardAt ? user.nextRewardAt.toISOString() : null,
    claimedCents: user.claimedCents ?? 0,
    canClaim,
    msUntilNextClaim,
  };
}

export async function POST() {
  let userId: string;

  try {
    const user = await requireUser();
    userId = user.id;
  } catch (e: any) {
    const status = e?.status ?? 401;
    return NextResponse.json({ ok: false, error: e?.message ?? "Unauthorized" }, { status });
  }

  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { balanceCents: true, nextRewardAt: true },
      });

      if (!user) {
        throw new Error(`User not found (${userId}).`);
      }

      const canClaim =
        user.nextRewardAt === null || now.getTime() >= user.nextRewardAt.getTime();

      if (!canClaim) {
        const err = new Error("Reward not ready yet");
        (err as Error & { status?: number; nextRewardAt?: Date | null }).status = 400;
        (err as Error & { status?: number; nextRewardAt?: Date | null }).nextRewardAt =
          user.nextRewardAt;
        throw err;
      }

      const nextRewardAt = new Date(now.getTime() + COOLDOWN_MS);

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balanceCents: { increment: REWARD_CENTS },
          nextRewardAt,
        },
        select: { balanceCents: true, nextRewardAt: true },
      });

      await createFinancialTransaction({
        tx,
        userId,
        category: "REWARD_BONUS",
        amountCents: REWARD_CENTS,
        description: "Claimed 30-minute reward bonus",
        balanceAfterCents: updatedUser.balanceCents,
        metadata: {
          rewardCents: REWARD_CENTS,
          cooldownMs: COOLDOWN_MS,
          claimedAt: now.toISOString(),
          nextRewardAt: nextRewardAt.toISOString(),
          source: "/api/reward/claim",
        },
      });

      return {
        ...updatedUser,
        claimedCents: REWARD_CENTS,
      };
    });

    return NextResponse.json(buildRewardResponse(result));
  } catch (e: any) {
    const status = e?.status ?? 500;

    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to claim reward",
        nextRewardAt: e?.nextRewardAt ? e.nextRewardAt.toISOString() : undefined,
      },
      { status }
    );
  }
}