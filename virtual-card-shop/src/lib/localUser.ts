import { prisma } from "@/lib/prisma";

export const LOCAL_USER_ID = "local";

export async function getOrCreateLocalUser() {
  return prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    create: { id: LOCAL_USER_ID },
    update: {},
  });
}
