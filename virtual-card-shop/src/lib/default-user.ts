// src/lib/default-user.ts
import { prisma } from "@/lib/prisma";

export const DEFAULT_USER_ID = "default";
export const DEFAULT_USER_EMAIL = "guest@vcs.local";

export async function getOrCreateDefaultUser() {
  // Guest / dev user. Starts with $50 and can claim immediately.
  // IMPORTANT: includes email so it works even if User.email is required/unique.
  return prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    create: {
      id: DEFAULT_USER_ID,
      email: DEFAULT_USER_EMAIL,
      balanceCents: 5000,
      nextRewardAt: null,
    },
    update: {},
  });
}
