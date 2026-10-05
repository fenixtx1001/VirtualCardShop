import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  dateKeysBetween,
  getChicagoDateKey,
  getPctChange,
  shiftDateKey,
  signedFinancialAmount,
} from "@/lib/analytics-math";
import { syncDailyPortfolioSnapshot } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RangeKey = "TODAY" | "7D" | "30D" | "90D" | "ALL";

type SnapshotPoint = {
  dateKey: string;
  balanceCents: number;
  collectionValueCents: number;
  sealedValueCents: number;
  openingNetWorthCents: number;
  closingNetWorthCents: number;
  valuationVersion: number;
  netWorthCents: number;
};

function rangeDays(range: RangeKey) {
  if (range === "TODAY") return 1;
  if (range === "7D") return 7;
  if (range === "30D") return 30;
  if (range === "90D") return 90;
  return null;
}

function formatCategory(category: string) {
  return String(category || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function continuousSnapshots(
  allSnapshots: SnapshotPoint[],
  requestedDateKeys: string[],
  fallback: SnapshotPoint
) {
  if (requestedDateKeys.length === 0) return [fallback];

  const comparable = allSnapshots.filter((snapshot) => snapshot.valuationVersion >= 2);
  const exactByDate = new Map(comparable.map((snapshot) => [snapshot.dateKey, snapshot]));
  const firstKey = requestedDateKeys[0];

  const prior =
    [...comparable]
      .filter((snapshot) => snapshot.dateKey < firstKey)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0] ?? null;

  const firstExact =
    exactByDate.get(firstKey) ??
    comparable.find((snapshot) => snapshot.dateKey >= firstKey) ??
    fallback;

  let carried = prior ?? firstExact;

  return requestedDateKeys.map((dateKey) => {
    const exact = exactByDate.get(dateKey);

    if (exact) {
      carried = exact;
      return exact;
    }

    const closing = carried.closingNetWorthCents ?? carried.netWorthCents;

    return {
      dateKey,
      balanceCents: carried.balanceCents,
      collectionValueCents: carried.collectionValueCents,
      sealedValueCents: carried.sealedValueCents ?? 0,
      openingNetWorthCents: closing,
      closingNetWorthCents: closing,
      valuationVersion: 2,
      netWorthCents: closing,
    };
  });
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const rawRange = String(url.searchParams.get("range") ?? "TODAY").toUpperCase();

    const range: RangeKey =
      rawRange === "TODAY" || rawRange === "7D" || rawRange === "30D" ||
      rawRange === "90D" || rawRange === "ALL"
        ? rawRange
        : "TODAY";

    const today = await syncDailyPortfolioSnapshot(prisma, user.id);

    const allSnapshots = await prisma.financialDailySnapshot.findMany({
      where: { userId: user.id },
      orderBy: { dateKey: "asc" },
      select: {
        dateKey: true,
        balanceCents: true,
        collectionValueCents: true,
        sealedValueCents: true,
        openingNetWorthCents: true,
        closingNetWorthCents: true,
        valuationVersion: true,
        netWorthCents: true,
      },
    });

    const todayKey = getChicagoDateKey();
    const days = rangeDays(range);
    const comparable = allSnapshots.filter((snapshot) => snapshot.valuationVersion >= 2);

    const requestedDateKeys =
      range === "ALL"
        ? dateKeysBetween(comparable[0]?.dateKey ?? todayKey, todayKey)
        : dateKeysBetween(shiftDateKey(todayKey, -((days ?? 1) - 1)), todayKey);

    const fallback: SnapshotPoint = {
      dateKey: today.dateKey,
      balanceCents: today.balanceCents,
      collectionValueCents: today.collectionValueCents,
      sealedValueCents: today.sealedValueCents,
      openingNetWorthCents: today.openingNetWorthCents,
      closingNetWorthCents: today.closingNetWorthCents,
      valuationVersion: today.valuationVersion,
      netWorthCents: today.netWorthCents,
    };

    const visibleSnapshots = continuousSnapshots(allSnapshots, requestedDateKeys, fallback);
    const firstSnapshot = visibleSnapshots[0] ?? fallback;
    const lastSnapshot = visibleSnapshots.at(-1) ?? fallback;

    const startingNetWorthCents = firstSnapshot.openingNetWorthCents;
    const endingNetWorthCents = lastSnapshot.closingNetWorthCents;
    const netWorthChangeCents = endingNetWorthCents - startingNetWorthCents;

    const transactions = await prisma.financialTransaction.findMany({
      where: {
        userId: user.id,
        ...(range === "ALL" || !days
          ? {}
          : {
              createdAt: {
                gte: new Date(Date.now() - (days + 2) * 24 * 60 * 60 * 1000),
              },
            }),
      },
      orderBy: { createdAt: "desc" },
      take: range === "ALL" ? 2000 : 1000,
      select: {
        id: true,
        category: true,
        direction: true,
        amountCents: true,
        description: true,
        balanceAfterCents: true,
        createdAt: true,
      },
    });

    const requestedSet = new Set(requestedDateKeys);
    const filteredTransactions =
      range === "ALL"
        ? transactions
        : transactions.filter((transaction) =>
            requestedSet.has(getChicagoDateKey(transaction.createdAt))
          );

    const dailyMap = new Map<string, {
      dateKey: string;
      incomeCents: number;
      expenseCents: number;
      netCents: number;
    }>();

    for (const dateKey of requestedDateKeys) {
      dailyMap.set(dateKey, { dateKey, incomeCents: 0, expenseCents: 0, netCents: 0 });
    }

    const categoryMap = new Map<string, {
      category: string;
      label: string;
      incomeCents: number;
      expenseCents: number;
      netCents: number;
    }>();

    for (const transaction of filteredTransactions) {
      const dateKey = getChicagoDateKey(transaction.createdAt);
      const signed = signedFinancialAmount(transaction.direction, transaction.amountCents);

      const daily = dailyMap.get(dateKey) ?? {
        dateKey,
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
      };

      if (signed >= 0) daily.incomeCents += signed;
      else daily.expenseCents += Math.abs(signed);
      daily.netCents += signed;
      dailyMap.set(dateKey, daily);

      const category = categoryMap.get(transaction.category) ?? {
        category: transaction.category,
        label: formatCategory(transaction.category),
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
      };

      if (signed >= 0) category.incomeCents += signed;
      else category.expenseCents += Math.abs(signed);
      category.netCents += signed;
      categoryMap.set(transaction.category, category);
    }

    const dailyCashflow = Array.from(dailyMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );

    const totalIncomeCents = dailyCashflow.reduce((sum, day) => sum + day.incomeCents, 0);
    const totalExpenseCents = dailyCashflow.reduce((sum, day) => sum + day.expenseCents, 0);
    const netCashflowCents = totalIncomeCents - totalExpenseCents;
    const categories = Array.from(categoryMap.values());

    return NextResponse.json({
      ok: true,
      range,
      summary: {
        balanceCents: today.balanceCents,
        collectionValueCents: today.collectionValueCents,
        sealedValueCents: today.sealedValueCents,
        netWorthCents: today.closingNetWorthCents,
        totalIncomeCents,
        totalExpenseCents,
        netCashflowCents,
        startingNetWorthCents,
        endingNetWorthCents,
        netWorthChangeCents,
        netWorthChangePct: getPctChange(startingNetWorthCents, endingNetWorthCents),
      },
      dailyCashflow,
      snapshots: visibleSnapshots,
      incomeCategories: categories
        .filter((category) => category.incomeCents > 0)
        .sort((a, b) => b.incomeCents - a.incomeCents),
      expenseCategories: categories
        .filter((category) => category.expenseCents > 0)
        .sort((a, b) => b.expenseCents - a.expenseCents),
      recentTransactions: filteredTransactions.slice(0, 30),
    });
  } catch (error: unknown) {
    const status =
      typeof error === "object" && error !== null && "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load finance analytics",
      },
      { status }
    );
  }
}
