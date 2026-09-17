import { NextResponse } from "next/server";

import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireUser();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      orderBy: [{ name: "asc" }],
    });

    return NextResponse.json(
      {
        ok: true,
        meId: me.id,
        users,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load users",
      },
      { status: 500 }
    );
  }
}
