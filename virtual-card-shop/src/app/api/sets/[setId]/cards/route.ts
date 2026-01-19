export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ setId?: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { setId: raw } = await params;

  if (!raw) {
    return NextResponse.json(
      { ok: false, error: "Missing setId" },
      { status: 400 }
    );
  }

  const setId = decodeURIComponent(raw);

  const setExists = await prisma.set.findUnique({ where: { id: setId } });
  if (!setExists) {
    return NextResponse.json({ ok: false, error: "Set not found" }, { status: 404 });
  }

  const cards = await prisma.card.findMany({
    where: { setId },
    // Don't orderBy cardNumber here; it sorts like strings
  });

  function cardNumberKey(s: string) {
    const m = String(s ?? "").match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
  }

  cards.sort((a, b) => {
    const an = cardNumberKey(a.cardNumber);
    const bn = cardNumberKey(b.cardNumber);
    if (an !== bn) return an - bn;

    return String(a.cardNumber ?? "").localeCompare(String(b.cardNumber ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return NextResponse.json({ ok: true, cards });
}
