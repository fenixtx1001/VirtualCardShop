// src/app/api/collection/stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export async function GET() {
  try {
    const user = await requireUser();

    const owned = await prisma.cardOwnership.findMany({
      where: { userId: user.id },
      select: {
        quantity: true,
        card: { select: { bookValue: true } }, // <-- your schema uses bookValue (not bookValueCents)
      },
    });

    let cardsOwned = 0;
    let valueCents = 0;

    for (const row of owned) {
      const qty = row.quantity ?? 0;
      cardsOwned += qty;

      // Treat bookValue as cents (consistent with the rest of your app’s “*Cents” fields)
      const bv = row.card.bookValue ?? 0;
      valueCents += qty * bv;
    }

    return NextResponse.json({
      ok: true,
      cardsOwned,
      collectionValueCents: valueCents,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed" },
      { status }
    );
  }
}
