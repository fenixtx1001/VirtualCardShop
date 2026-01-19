import { prisma } from "@/lib/prisma";

export const DEFAULT_USER_ID = "default";

export async function getOrCreateDefaultUser() {
  // Start: $50, can claim immediately (nextRewardAt = null)
  return prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    create: {
      id: DEFAULT_USER_ID,
      balanceCents: 5000,
      nextRewardAt: null,
    },
    update: {},
  });
}
