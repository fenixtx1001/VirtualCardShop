// src/app/api/analytics/finances/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  RAW_GRADE,
  bookValueToCents,
  calculateGradedValueCents,
  getEffectiveGradeability,
} from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHICAGO_TIME_ZONE = "America/Chicago";

type RangeKey = "7D" | "30D" | "90D" | "ALL";

function getDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getRangeDays(range: RangeKey) {
  if (range === "7D") return 7;
  if (range === "30D") return 30;
  if (range === "90D") return 90;
  return 365;
}

function makeDateKeys(days: number) {
  const today = new Date();
  const start = addDays(today, -(days - 1));

  return Array.from({ length: days }, (_, i) => getDateKey(addDays(start, i)));
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

async function getCollectionValueCents(userId: string) {
  const ownerships = await prisma.cardOwnership.findMany({
    where: { userId, quantity: { gt: 0 } },
    select: {
      quantity: true,
      grade: true,
      card: {
        select: {
          bookValue: true,
          gradeabilityOverride: true,
          productSet: {
            select: {
              defaultGradeability: true,
            },
          },
        },
      },
    },
  });

  let total = 0;

  for (const own of ownerships) {
    const qty = own.quantity ?? 0;
    if (qty <= 0) continue;

    const rawBookValueCents = bookValueToCents(own.card.bookValue);

    if (own.grade === RAW_GRADE) {
      total += rawBookValueCents * qty;
      continue;
    }

    const gradeability = getEffectiveGradeability({
      cardOverride: own.card.gradeabilityOverride,
      productSetDefault: own.card.productSet?.defaultGradeability,
    });

    total +=
      calculateGradedValueCents({
        rawBookValueCents,
        gradeability,
        grade: own.grade,
      }) * qty;
  }

  const pendingOrders = await prisma.gradingOrder.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "READY"] },
      quantity: { gt: 0 },
    },
    select: {
      quantity: true,
      card: {
        select: {
          bookValue: true,
        },
      },
    },
  });

  for (const order of pendingOrders) {
    total += bookValueToCents(order.card.bookValue) * (order.quantity ?? 0);
  }

  return total;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();

    const url = new URL(req.url);
    const rangeParam = String(url.searchParams.get("range") ?? "30D").toUpperCase();
    const range: RangeKey =
      rangeParam === "7D" || rangeParam === "30D" || rangeParam === "90D" || rangeParam === "ALL"
        ? rangeParam
        : "30D";

    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balanceCents: true },
    });

    if (!me) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const balanceCents = me.balanceCents ?? 0;
    const collectionValueCents = await getCollectionValueCents(user.id);
    const netWorthCents = balanceCents + collectionValueCents;
    const todayKey = getDateKey(new Date());

    await prisma.financialDailySnapshot.upsert({
      where: {
        userId_dateKey: {
          userId: user.id,
          dateKey: todayKey,
        },
      },
      create: {
        userId: user.id,
        dateKey: todayKey,
        balanceCents,
        collectionValueCents,
        netWorthCents,
      },
      update: {
        balanceCents,
        collectionValueCents,
        netWorthCents,
      },
    });

    const days = getRangeDays(range);
    const dateKeys = makeDateKeys(days);
    const firstDateKey = dateKeys[0] ?? todayKey;

    const transactions = await prisma.financialTransaction.findMany({
      where: {
        userId: user.id,
        createdAt: range === "ALL" ? undefined : { gte: addDays(new Date(), -days) },
      },
      orderBy: { createdAt: "desc" },
      take: range === "ALL" ? 500 : 300,
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

    const snapshots = await prisma.financialDailySnapshot.findMany({
      where: {
        userId: user.id,
        dateKey: range === "ALL" ? undefined : { gte: firstDateKey },
      },
      orderBy: { dateKey: "asc" },
      select: {
        dateKey: true,
        balanceCents: true,
        collectionValueCents: true,
        netWorthCents: true,
      },
    });

    const dailyMap = new Map<
      string,
      {
        dateKey: string;
        incomeCents: number;
        expenseCents: number;
        netCents: number;
      }
    >();

    for (const key of dateKeys) {
      dailyMap.set(key, { dateKey: key, incomeCents: 0, expenseCents: 0, netCents: 0 });
    }

    const categoryMap = new Map<
      string,
      {
        category: string;
        label: string;
        incomeCents: number;
        expenseCents: number;
        netCents: number;
      }
    >();

    for (const txn of transactions) {
      const dateKey = getDateKey(txn.createdAt);
      const existing =
        dailyMap.get(dateKey) ?? {
          dateKey,
          incomeCents: 0,
          expenseCents: 0,
          netCents: 0,
        };

      if (txn.amountCents >= 0) existing.incomeCents += txn.amountCents;
      else existing.expenseCents += Math.abs(txn.amountCents);

      existing.netCents += txn.amountCents;
      dailyMap.set(dateKey, existing);

      const cat =
        categoryMap.get(txn.category) ?? {
          category: txn.category,
          label: formatCategory(txn.category),
          incomeCents: 0,
          expenseCents: 0,
          netCents: 0,
        };

      if (txn.amountCents >= 0) cat.incomeCents += txn.amountCents;
      else cat.expenseCents += Math.abs(txn.amountCents);

      cat.netCents += txn.amountCents;
      categoryMap.set(txn.category, cat);
    }

    const dailyCashflow = Array.from(dailyMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );

    const totalIncomeCents = dailyCashflow.reduce((sum, day) => sum + day.incomeCents, 0);
    const totalExpenseCents = dailyCashflow.reduce((sum, day) => sum + day.expenseCents, 0);
    const netCashflowCents = totalIncomeCents - totalExpenseCents;

    const incomeCategories = Array.from(categoryMap.values())
      .filter((cat) => cat.incomeCents > 0)
      .sort((a, b) => b.incomeCents - a.incomeCents);

    const expenseCategories = Array.from(categoryMap.values())
      .filter((cat) => cat.expenseCents > 0)
      .sort((a, b) => b.expenseCents - a.expenseCents);

    return NextResponse.json({
      ok: true,
      range,
      summary: {
        balanceCents,
        collectionValueCents,
        netWorthCents,
        totalIncomeCents,
        totalExpenseCents,
        netCashflowCents,
        roiPct:
          totalExpenseCents > 0
            ? Math.round((netCashflowCents / totalExpenseCents) * 1000) / 10
            : null,
      },
      dailyCashflow,
      snapshots,
      incomeCategories,
      expenseCategories,
      recentTransactions: transactions.slice(0, 30),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load finance analytics" },
      { status: e?.status ?? 500 }
    );
  }
}