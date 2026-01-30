// src/app/api/collection/stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const owned = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
      },
      select: {
        quantity: true,
        card: { select: { bookValue: true } }, // ✅ correct field
      },
    });

    let cardsOwned = 0;
    let valueCents = 0;

    for (const row of owned) {
      const qty = row.quantity ?? 0;
      cardsOwned += qty;

      // bookValue is stored in dollars (e.g., 0.05), so convert → cents
      const dollars = row.card.bookValue ?? 0;
      const cents = Math.round(dollars * 100);

      valueCents += qty * cents;
    }

    return NextResponse.json({
      ok: true,
      cardsOwned,
      collectionValueCents: valueCents,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status });
  }
}
