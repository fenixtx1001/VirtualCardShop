// src/lib/current-user.ts
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * Returns the signed-in user, or null if not signed in.
 * (No more "default" fallback — you said you want option B.)
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();

  if (!email) return null;

  // With PrismaAdapter, the user row should already exist,
  // but we’ll be safe and ensure it exists.
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      balanceCents: 5000,
      nextRewardAt: null,
    },
    update: {},
  });

  return user;
}

/**
 * Same as getCurrentUser, but throws 401 if not signed in.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("Unauthorized");
    (err as any).status = 401;
    throw err;
  }
  return user;
}
