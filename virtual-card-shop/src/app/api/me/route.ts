import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEST_USER_ID = "local";

function isAdminUser(userId: string) {
  // Phase 1: local user is admin.
  // Later: replace with universe membership role checks.
  return userId === TEST_USER_ID;
}

export async function GET() {
  const id = TEST_USER_ID;

  const user =
    (await prisma.user.findUnique({ where: { id } })) ??
    (await prisma.user.create({
      data: {
        id,
        // balanceCents defaults to 5000 in schema
        // nextRewardAt defaults to null
      },
    }));

  return NextResponse.json({
    id: user.id,
    balanceCents: user.balanceCents,
    nextRewardAt: user.nextRewardAt,
    isAdmin: isAdminUser(user.id),
  });
}
