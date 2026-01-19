export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { setId: string } };

export async function GET(req: Request, ctx: Ctx) {
  const setId = decodeURIComponent(ctx.params.setId);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  const cards = await prisma.card.findMany({
    where: {
      setId,
      ...(q
        ? {
            OR: [
              { cardNumber: { contains: q } },
              { player: { contains: q } },
              { team: { contains: q } },
              { subset: { contains: q } },
              { insert: { contains: q } },
              { variant: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ cardNumber: "asc" }],
  });

  return NextResponse.json({ ok: true, cards });
}

