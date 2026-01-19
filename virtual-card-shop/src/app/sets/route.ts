export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sets = await prisma.set.findMany({
    orderBy: [{ year: "asc" }, { brand: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { cards: true } },
    },
  });

  return NextResponse.json({ ok: true, sets });
}
