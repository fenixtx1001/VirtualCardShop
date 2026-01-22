import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/default-user";

export async function GET() {
  try {
    const user = await getOrCreateDefaultUser();

    // Grab every owned card with quantity + bookValue
    const owned = await prisma.cardOwnership.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      select: {
        quantity: true,
        card: {
          select: {
            bookValue: true, // likely stored as dollars (number)
          },
        },
      },
    });

    let cardsOwned = 0; // total quantity (includes duplicates)
    let collectionValueCents = 0;

    for (const o of owned) {
      const qty = o.quantity ?? 0;
      cardsOwned += qty;

      const bookValueDollars = o.card.bookValue ?? 0;
      const valueCents = Math.round(bookValueDollars * 100) * qty;
      collectionValueCents += valueCents;
    }

    return NextResponse.json({
      ok: true,
      cardsOwned,
      collectionValueCents,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load collection stats" },
      { status: 500 }
    );
  }
}
