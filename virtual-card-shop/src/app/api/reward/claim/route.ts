import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEST_USER_ID = "local";
const REWARD_CENTS = 1000; // $10
const COOLDOWN_MINUTES = 30;

export async function POST() {
  const id = TEST_USER_ID;
  const now = new Date();

  const user =
    (await prisma.user.findUnique({ where: { id } })) ??
    (await prisma.user.create({ data: { id } }));

  const next = user.nextRewardAt;
  const canClaim = !next || next.getTime() <= now.getTime();

  if (!canClaim) {
    return NextResponse.json(
      { error: "Reward not ready yet", nextRewardAt: next },
      { status: 400 }
    );
  }

  const nextRewardAt = new Date(now.getTime() + COOLDOWN_MINUTES * 60 * 1000);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      balanceCents: { increment: REWARD_CENTS },
      nextRewardAt,
    },
  });

  return NextResponse.json({
    ok: true,
    balanceCents: updated.balanceCents,
    nextRewardAt: updated.nextRewardAt,
    claimedCents: REWARD_CENTS,
  });
}
