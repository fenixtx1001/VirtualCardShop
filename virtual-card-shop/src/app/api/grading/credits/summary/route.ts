import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Personal, non-cash wallet. Never return another collector's grading-credit balances.
export async function GET() {
  try {
    const user = await requireUser();
    const records = await prisma.productSetPrestige.findMany({
      where: { userId: user.id, gradingCreditedLevels: { gt: 0 } },
      select: {
        productSetId: true, timesCompleted: true,
        gradingCreditBalanceCents: true, gradingCreditSpentCents: true,
        gradingCreditedLevels: true,
        productSet: {
          select: {
            name: true, isBase: true, productId: true,
            product: { select: { year: true, brand: true, sport: true } },
          },
        },
      },
    });

    const sets = records.map(record => {
      const product = record.productSet?.product;
      const productName = [product?.year, product?.brand, product?.sport]
        .filter(value => value != null && String(value).trim()).join(" ");
      const setName = record.productSet?.isBase
        ? "Base Set" : record.productSet?.name?.trim() || "Insert Set";
      return {
        productSetId: record.productSetId,
        productId: record.productSet?.productId ?? null,
        productName: productName || "Unknown product",
        setName,
        prestigeLevel: record.timesCompleted,
        creditsEarned: record.gradingCreditedLevels,
        creditsSpent: Math.floor(record.gradingCreditSpentCents / 100),
        creditsAvailable: Math.floor(record.gradingCreditBalanceCents / 100),
      };
    }).sort((a, b) =>
      b.creditsAvailable - a.creditsAvailable ||
      b.prestigeLevel - a.prestigeLevel ||
      a.productName.localeCompare(b.productName));

    const summary = {
      totalAvailable: sets.reduce((sum, set) => sum + set.creditsAvailable, 0),
      totalEarned: sets.reduce((sum, set) => sum + set.creditsEarned, 0),
      totalSpent: sets.reduce((sum, set) => sum + set.creditsSpent, 0),
      setsWithCredits: sets.filter(set => set.creditsAvailable > 0).length,
      totalTrackedSets: sets.length,
    };

    return NextResponse.json({ ok: true, summary, sets }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to load grading credits" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
