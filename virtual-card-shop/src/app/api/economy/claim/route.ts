import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser, DEFAULT_USER_ID } from "@/lib/default-user";

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
  // Ensure the default user exists
  await getOrCreateDefaultUser();

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: DEFAULT_USER_ID },
      select: { balanceCents: true, nextRewardAt: true },
    });

    if (!user) {
      throw new Error("Default user not found after creation.");
    }

    const canClaim =
      user.nextRewardAt === null || now.getTime() >= user.nextRewardAt.getTime();

    if (!canClaim) {
      // Not eligible; return unchanged state
      return user;
    }

    const nextRewardAt = new Date(now.getTime() + COOLDOWN_MS);

    return tx.user.update({
      where: { id: DEFAULT_USER_ID },
      data: {
        balanceCents: { increment: REWARD_CENTS },
        nextRewardAt,
      },
      select: { balanceCents: true, nextRewardAt: true },
    });
  });

  return NextResponse.json(buildEconomyResponse(result));
}
