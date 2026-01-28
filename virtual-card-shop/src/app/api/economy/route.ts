import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

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
  const session = await getServerSession(authOptions);

  // If not signed in, return a "logged out" economy response.
  // This prevents the header from showing an error before login.
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json(
      buildEconomyResponse({
        balanceCents: 0,
        nextRewardAt: null,
      })
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { balanceCents: true, nextRewardAt: true },
  });

  // Shouldn't happen with NextAuth + PrismaAdapter, but be safe.
  if (!user) {
    return NextResponse.json(
      buildEconomyResponse({
        balanceCents: 0,
        nextRewardAt: null,
      })
    );
  }

  return NextResponse.json(buildEconomyResponse(user));
}
