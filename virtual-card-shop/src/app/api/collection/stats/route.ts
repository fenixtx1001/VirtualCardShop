import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { getCollectionValueCents } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const [owned, pending, collectionValueCents] = await Promise.all([
      prisma.cardOwnership.aggregate({
        where: { userId: user.id, quantity: { gt: 0 } },
        _sum: { quantity: true },
      }),
      prisma.gradingOrder.aggregate({
        where: {
          userId: user.id,
          quantity: { gt: 0 },
          status: { in: ["PENDING", "READY"] },
        },
        _sum: { quantity: true },
      }),
      getCollectionValueCents(prisma, user.id),
    ]);

    return NextResponse.json({
      ok: true,
      cardsOwned: (owned._sum.quantity ?? 0) + (pending._sum.quantity ?? 0),
      collectionValueCents,
    });
  } catch (e: unknown) {
    const status =
      typeof e === "object" && e !== null && "status" in e &&
      typeof (e as { status?: unknown }).status === "number"
        ? (e as { status: number }).status
        : 500;

    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed" },
      { status }
    );
  }
}
