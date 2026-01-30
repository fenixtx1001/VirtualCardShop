// src/app/api/economy/claim/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

const REWARD_CENTS = 1000; // $10
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function buildEconomyResponse(user: { balanceCents: number; nextRewardAt: Date | null }) {
  const nowMs = Date.now();
  const nextMs = user.nextRewardAt ? user.nextRewardAt.getTime() : null;

  const canClaim = nextMs === null || nowMs >= nextMs;
  const msUntilNextClaim = canClaim ? 0 : Math.max(0, nextMs - nowMs);

  return {
    balanceCents: user.balanceCents,
    canClaim,
    nextRewardAt: user.nextRewardAt ? user.nextRewardAt.toISOString() : null,
    msUntilNextClaim,
  };
}

export async function POST() {
  let userId: string;

  try {
    const user = await requireUser(); // throws 401 if not signed in
    userId = user.id;
  } catch (e: any) {
    const status = e?.status ?? 401;
    return NextResponse.json({ error: e?.message ?? "Unauthorized" }, { status });
  }

  const now = new Date();

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

    if (!canClaim) return user;

    const nextRewardAt = new Date(now.getTime() + COOLDOWN_MS);

    return tx.user.update({
      where: { id: userId },
      data: {
        balanceCents: { increment: REWARD_CENTS },
        nextRewardAt,
      },
      select: { balanceCents: true, nextRewardAt: true },
    });
  });

  return NextResponse.json(buildEconomyResponse(result));
}
