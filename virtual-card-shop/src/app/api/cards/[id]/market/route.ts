// src/app/api/cards/[id]/market/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx =
  | { params: { id?: string } }
  | { params: Promise<{ id?: string }> };

type RangeKey = "7D" | "30D" | "90D" | "ALL";

const MARKET_GRADES = [0, 6, 7, 8, 9, 10] as const;

function getGradeLabel(grade: number) {
  if (grade === 0) return "Raw";
  return `VCS ${grade}`;
}

async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  const raw = params?.id;
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getRangeStart(range: RangeKey, now: Date) {
  if (range === "ALL") return null;

  const days = range === "7D" ? 7 : range === "30D" ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return start;
}

function centsAverage(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getTrendBps(valuesNewestFirst: number[]) {
  if (valuesNewestFirst.length < 4) return 0;

  const midpoint = Math.floor(valuesNewestFirst.length / 2);
  const recent = valuesNewestFirst.slice(0, midpoint);
  const older = valuesNewestFirst.slice(midpoint);

  const recentAvg = centsAverage(recent);
  const olderAvg = centsAverage(older);

  if (olderAvg <= 0) return 0;
  return Math.round(((recentAvg - olderAvg) / olderAvg) * 10000);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDailyGraphData(
  sales: {
    createdAt: Date;
    salePriceCents: number;
  }[]
) {
  const buckets = new Map<
    string,
    {
      date: string;
      salesCount: number;
      totalCents: number;
      averageSaleCents: number;
      highSaleCents: number;
      lowSaleCents: number;
    }
  >();

  for (const sale of sales) {
    const key = dateKey(sale.createdAt);
    const existing =
      buckets.get(key) ??
      {
        date: key,
        salesCount: 0,
        totalCents: 0,
        averageSaleCents: 0,
        highSaleCents: 0,
        lowSaleCents: 0,
      };

    existing.salesCount += 1;
    existing.totalCents += sale.salePriceCents;
    existing.averageSaleCents = Math.round(existing.totalCents / existing.salesCount);
    existing.highSaleCents =
      existing.highSaleCents <= 0
        ? sale.salePriceCents
        : Math.max(existing.highSaleCents, sale.salePriceCents);
    existing.lowSaleCents =
      existing.lowSaleCents <= 0
        ? sale.salePriceCents
        : Math.min(existing.lowSaleCents, sale.salePriceCents);

    buckets.set(key, existing);
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const cardId = await getId(ctx);
    if (!cardId) {
      return NextResponse.json({ ok: false, error: "Invalid card id." }, { status: 400 });
    }

    const url = new URL(req.url);
    const requestedRange = String(url.searchParams.get("range") ?? "ALL").toUpperCase();
    const range: RangeKey =
      requestedRange === "7D" ||
      requestedRange === "30D" ||
      requestedRange === "90D" ||
      requestedRange === "ALL"
        ? requestedRange
        : "ALL";

    const now = new Date();
    const rangeStart = getRangeStart(range, now);

    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        player: true,
        cardNumber: true,
        bookValue: true,
      },
    });

    if (!card) {
      return NextResponse.json({ ok: false, error: "Card not found." }, { status: 404 });
    }

    const sales = await prisma.cardSaleHistory.findMany({
      where: {
        cardId,
        ...(rangeStart ? { createdAt: { gte: rangeStart } } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        grade: true,
        saleType: true,
        buyerType: true,
        salePriceCents: true,
        valueBasisCents: true,
        percentOfValueBps: true,
        auctionId: true,
        shopTransactionId: true,
        createdAt: true,
      },
    });

    const byGrade = MARKET_GRADES.map((grade) => {
      const gradeSales = sales.filter((sale) => sale.grade === grade);
      const salePricesNewestFirst = gradeSales.map((sale) => sale.salePriceCents);
      const salePrices = [...salePricesNewestFirst];

      const lastSale = gradeSales[0] ?? null;
      const highestSaleCents = salePrices.length ? Math.max(...salePrices) : 0;
      const lowestSaleCents = salePrices.length ? Math.min(...salePrices) : 0;
      const averageSaleCents = centsAverage(salePrices);

      return {
        grade,
        label: getGradeLabel(grade),
        salesCount: gradeSales.length,
        lastSaleCents: lastSale?.salePriceCents ?? 0,
        lastSaleAt: lastSale?.createdAt?.toISOString() ?? null,
        averageSaleCents,
        highestSaleCents,
        lowestSaleCents,
        trendBps: getTrendBps(salePricesNewestFirst),
        graphData: buildDailyGraphData(
          gradeSales.map((sale) => ({
            createdAt: sale.createdAt,
            salePriceCents: sale.salePriceCents,
          }))
        ),
        recentSales: gradeSales.slice(0, 10).map((sale) => ({
          id: sale.id,
          grade: sale.grade,
          label: getGradeLabel(sale.grade),
          saleType: sale.saleType,
          buyerType: sale.buyerType,
          salePriceCents: sale.salePriceCents,
          valueBasisCents: sale.valueBasisCents,
          percentOfValueBps: sale.percentOfValueBps,
          auctionId: sale.auctionId,
          shopTransactionId: sale.shopTransactionId,
          createdAt: sale.createdAt.toISOString(),
        })),
      };
    });

    const allPrices = sales.map((sale) => sale.salePriceCents);

    return NextResponse.json({
      ok: true,
      card: {
        id: card.id,
        player: card.player,
        cardNumber: card.cardNumber,
        bookValue: card.bookValue,
      },
      range,
      availableRanges: ["7D", "30D", "90D", "ALL"],
      grades: byGrade,
      overall: {
        salesCount: sales.length,
        lastSaleCents: sales[0]?.salePriceCents ?? 0,
        lastSaleAt: sales[0]?.createdAt?.toISOString() ?? null,
        averageSaleCents: centsAverage(allPrices),
        highestSaleCents: allPrices.length ? Math.max(...allPrices) : 0,
        lowestSaleCents: allPrices.length ? Math.min(...allPrices) : 0,
        trendBps: getTrendBps(allPrices),
        recentSales: sales.slice(0, 12).map((sale) => ({
          id: sale.id,
          grade: sale.grade,
          label: getGradeLabel(sale.grade),
          saleType: sale.saleType,
          buyerType: sale.buyerType,
          salePriceCents: sale.salePriceCents,
          valueBasisCents: sale.valueBasisCents,
          percentOfValueBps: sale.percentOfValueBps,
          auctionId: sale.auctionId,
          shopTransactionId: sale.shopTransactionId,
          createdAt: sale.createdAt.toISOString(),
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Unable to load market history.",
      },
      { status: 500 }
    );
  }
}