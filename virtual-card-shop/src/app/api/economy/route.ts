import { NextResponse } from "next/server";
import { getOrCreateDefaultUser } from "@/lib/default-user";

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

export async function GET() {
  const user = await getOrCreateDefaultUser();

  return NextResponse.json(
    buildEconomyResponse({
      balanceCents: user.balanceCents,
      nextRewardAt: user.nextRewardAt,
    })
  );
}
