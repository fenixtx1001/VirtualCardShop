from pathlib import Path
from textwrap import dedent

ROOT = Path.cwd()


def write(rel: str, content: str):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dedent(content).lstrip(), encoding="utf-8")
    print(f"WRITE {rel}")


def replace(rel: str, old: str, new: str):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected patch target not found in {rel}:\n{old[:300]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"PATCH {rel}")


write("src/lib/analytics-math.ts", r'''
export const CHICAGO_TIME_ZONE = "America/Chicago";

export function getChicagoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

export function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function shiftDateKey(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function dateKeysBetween(firstDateKey: string, lastDateKey: string) {
  const keys: string[] = [];

  for (let key = firstDateKey; key <= lastDateKey; key = shiftDateKey(key, 1)) {
    keys.push(key);
  }

  return keys;
}

export function getPctChange(startCents: number, endCents: number) {
  if (!Number.isFinite(startCents) || startCents === 0) return null;
  return Math.round(((endCents - startCents) / startCents) * 1000) / 10;
}

export function signedFinancialAmount(
  direction: string | null | undefined,
  amountCents: number
) {
  const abs = Math.abs(Number(amountCents) || 0);
  return String(direction ?? "").toUpperCase() === "EXPENSE" ? -abs : abs;
}

export function openedPackCostBasisCents(
  totalCostBasisCents: number,
  packsOwned: number
) {
  const total = Math.max(0, Math.round(totalCostBasisCents || 0));
  const packs = Math.max(0, Math.round(packsOwned || 0));

  if (packs <= 0) return 0;
  if (packs === 1) return total;

  return Math.max(0, Math.round(total / packs));
}
''')

write("src/lib/portfolio.ts", r'''
import type { Prisma } from "@prisma/client";
import {
  RAW_GRADE,
  bookValueToCents,
  calculateGradedValueCents,
  getEffectiveGradeability,
} from "@/lib/grading";
import { getChicagoDateKey } from "@/lib/analytics-math";

type PortfolioDb = Pick<
  Prisma.TransactionClient,
  | "user"
  | "cardOwnership"
  | "gradingOrder"
  | "sealedInventory"
  | "financialDailySnapshot"
>;

export type PortfolioValue = {
  balanceCents: number;
  collectionValueCents: number;
  sealedValueCents: number;
  netWorthCents: number;
};

export async function getCollectionValueCents(db: PortfolioDb, userId: string) {
  const ownerships = await db.cardOwnership.findMany({
    where: { userId, quantity: { gt: 0 } },
    select: {
      quantity: true,
      grade: true,
      card: {
        select: {
          bookValue: true,
          gradeabilityOverride: true,
          productSet: { select: { defaultGradeability: true } },
        },
      },
    },
  });

  let total = 0;

  for (const ownership of ownerships) {
    const quantity = Math.max(0, ownership.quantity ?? 0);
    if (quantity <= 0) continue;

    const rawBookValueCents = bookValueToCents(ownership.card.bookValue);

    if (ownership.grade === RAW_GRADE) {
      total += rawBookValueCents * quantity;
      continue;
    }

    const gradeability = getEffectiveGradeability({
      cardOverride: ownership.card.gradeabilityOverride,
      productSetDefault: ownership.card.productSet?.defaultGradeability,
    });

    total +=
      calculateGradedValueCents({
        rawBookValueCents,
        gradeability,
        grade: ownership.grade,
      }) * quantity;
  }

  const pendingOrders = await db.gradingOrder.findMany({
    where: {
      userId,
      quantity: { gt: 0 },
      status: { in: ["PENDING", "READY"] },
    },
    select: {
      quantity: true,
      card: { select: { bookValue: true } },
    },
  });

  for (const order of pendingOrders) {
    total += bookValueToCents(order.card.bookValue) * Math.max(0, order.quantity ?? 0);
  }

  return total;
}

export async function getSealedValueCents(db: PortfolioDb, userId: string) {
  const result = await db.sealedInventory.aggregate({
    where: { userId, packsOwned: { gt: 0 } },
    _sum: { costBasisCents: true },
  });

  return Math.max(0, result._sum.costBasisCents ?? 0);
}

export async function getPortfolioValue(
  db: PortfolioDb,
  userId: string
): Promise<PortfolioValue> {
  const [user, collectionValueCents, sealedValueCents] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { balanceCents: true } }),
    getCollectionValueCents(db, userId),
    getSealedValueCents(db, userId),
  ]);

  if (!user) throw new Error("User not found");

  const balanceCents = user.balanceCents ?? 0;
  const netWorthCents = balanceCents + collectionValueCents + sealedValueCents;

  return {
    balanceCents,
    collectionValueCents,
    sealedValueCents,
    netWorthCents,
  };
}

export async function syncDailyPortfolioSnapshot(
  db: PortfolioDb,
  userId: string,
  now = new Date()
) {
  const dateKey = getChicagoDateKey(now);
  const portfolio = await getPortfolioValue(db, userId);

  const [existing, previous] = await Promise.all([
    db.financialDailySnapshot.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
    }),
    db.financialDailySnapshot.findFirst({
      where: { userId, dateKey: { lt: dateKey }, valuationVersion: { gte: 2 } },
      orderBy: { dateKey: "desc" },
    }),
  ]);

  const openingNetWorthCents =
    existing && existing.valuationVersion >= 2
      ? existing.openingNetWorthCents
      : previous?.closingNetWorthCents ?? portfolio.netWorthCents;

  return db.financialDailySnapshot.upsert({
    where: { userId_dateKey: { userId, dateKey } },
    create: {
      userId,
      dateKey,
      balanceCents: portfolio.balanceCents,
      collectionValueCents: portfolio.collectionValueCents,
      sealedValueCents: portfolio.sealedValueCents,
      openingNetWorthCents,
      closingNetWorthCents: portfolio.netWorthCents,
      netWorthCents: portfolio.netWorthCents,
      valuationVersion: 2,
    },
    update: {
      balanceCents: portfolio.balanceCents,
      collectionValueCents: portfolio.collectionValueCents,
      sealedValueCents: portfolio.sealedValueCents,
      openingNetWorthCents,
      closingNetWorthCents: portfolio.netWorthCents,
      netWorthCents: portfolio.netWorthCents,
      valuationVersion: 2,
    },
  });
}
''')

replace(
    "prisma/schema.prisma",
    '''  packsOwned Int      @default(0)\n  createdAt  DateTime @default(now())''',
    '''  packsOwned      Int      @default(0)\n  costBasisCents Int      @default(0)\n  createdAt       DateTime @default(now())'''
)

replace(
    "prisma/schema.prisma",
    '''  balanceCents         Int\n  collectionValueCents Int\n  netWorthCents        Int\n  createdAt            DateTime @default(now())''',
    '''  balanceCents           Int\n  collectionValueCents   Int\n  sealedValueCents       Int      @default(0)\n  openingNetWorthCents   Int      @default(0)\n  closingNetWorthCents   Int      @default(0)\n  valuationVersion       Int      @default(2)\n  netWorthCents          Int\n  createdAt              DateTime @default(now())'''
)

write("prisma/migrations/20261005000000_analytics_portfolio_refresh/migration.sql", r'''
ALTER TABLE "SealedInventory"
ADD COLUMN IF NOT EXISTS "costBasisCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "sealedValueCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "openingNetWorthCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "closingNetWorthCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "valuationVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FinancialDailySnapshot"
ALTER COLUMN "valuationVersion" SET DEFAULT 2;

WITH purchase_basis AS (
  SELECT
    ft."userId",
    ft.metadata->>'productId' AS "productId",
    SUM(
      CASE
        WHEN COALESCE(ft.metadata->>'costCents', '') ~ '^[0-9]+$'
          THEN (ft.metadata->>'costCents')::INTEGER
        ELSE 0
      END
    )::BIGINT AS "totalCostCents",
    SUM(
      CASE
        WHEN COALESCE(ft.metadata->>'packsAdded', '') ~ '^[0-9]+$'
          THEN (ft.metadata->>'packsAdded')::INTEGER
        ELSE 0
      END
    )::BIGINT AS "totalPacks"
  FROM "FinancialTransaction" ft
  WHERE ft.category IN ('PACK_PURCHASE', 'BOX_PURCHASE')
    AND ft.metadata IS NOT NULL
  GROUP BY ft."userId", ft.metadata->>'productId'
)
UPDATE "SealedInventory" si
SET "costBasisCents" = GREATEST(
  0,
  ROUND(
    si."packsOwned" * pb."totalCostCents"::NUMERIC / NULLIF(pb."totalPacks", 0)
  )::INTEGER
)
FROM purchase_basis pb
WHERE si."userId" = pb."userId"
  AND si."productId" = pb."productId"
  AND si."packsOwned" > 0
  AND pb."totalPacks" > 0
  AND si."costBasisCents" = 0;

UPDATE "SealedInventory" si
SET "costBasisCents" = GREATEST(0, si."packsOwned" * COALESCE(p."packPriceCents", 0))
FROM "Product" p
WHERE p.id = si."productId"
  AND si."packsOwned" > 0
  AND si."costBasisCents" = 0;

UPDATE "FinancialDailySnapshot"
SET
  "openingNetWorthCents" = "netWorthCents",
  "closingNetWorthCents" = "netWorthCents"
WHERE "valuationVersion" = 1
  AND "openingNetWorthCents" = 0
  AND "closingNetWorthCents" = 0;
''')

write("scripts/install-analytics-portfolio-refresh.ts", r'''
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { syncDailyPortfolioSnapshot } from "../src/lib/portfolio";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    throw new Error(
      "A PostgreSQL DATABASE_URL is required in .env.local, .env, or the environment."
    );
  }

  const prisma = new PrismaClient();

  try {
    const sql = readFileSync(
      "prisma/migrations/20261005000000_analytics_portfolio_refresh/migration.sql",
      "utf8"
    );

    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await prisma.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    });

    const users = await prisma.user.findMany({ select: { id: true } });

    for (const user of users) {
      await syncDailyPortfolioSnapshot(prisma, user.id);
    }

    console.log(
      `Analytics portfolio upgrade installed. Daily baseline ready for ${users.length} user(s).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Analytics upgrade failed.");
  process.exitCode = 1;
});
''')

write("src/lib/financial-transactions.ts", r'''
import { Prisma } from "@prisma/client";
import { syncDailyPortfolioSnapshot } from "@/lib/portfolio";

export type FinancialCategory =
  | "PACK_PURCHASE"
  | "BOX_PURCHASE"
  | "SINGLE_PURCHASE"
  | "GRADING_FEE"
  | "CARD_SALE"
  | "REWARD_BONUS"
  | "PRESTIGE_REWARD"
  | "AUCTION_PURCHASE"
  | "AUCTION_SALE";

export type FinancialDirection = "INCOME" | "EXPENSE";

export function getFinancialDirection(amountCents: number): FinancialDirection {
  return amountCents >= 0 ? "INCOME" : "EXPENSE";
}

export async function createFinancialTransaction(opts: {
  tx: Prisma.TransactionClient;
  userId: string;
  category: FinancialCategory;
  amountCents: number;
  description: string;
  balanceAfterCents?: number | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const { tx, userId, category, amountCents, description, balanceAfterCents, metadata } = opts;

  const transaction = await tx.financialTransaction.create({
    data: {
      userId,
      category,
      direction: getFinancialDirection(amountCents),
      amountCents,
      description,
      balanceAfterCents: balanceAfterCents ?? null,
      metadata: metadata ?? Prisma.JsonNull,
    },
  });

  await syncDailyPortfolioSnapshot(tx, userId);
  return transaction;
}
''')

replace(
    "src/app/api/shop/buy/route.ts",
    '''        create: {\n          userId: user.id,\n          productId,\n          packsOwned: packsToAdd,\n        },\n        update: {\n          packsOwned: { increment: packsToAdd },\n        },\n        select: { packsOwned: true },''',
    '''        create: {\n          userId: user.id,\n          productId,\n          packsOwned: packsToAdd,\n          costBasisCents: costCents,\n        },\n        update: {\n          packsOwned: { increment: packsToAdd },\n          costBasisCents: { increment: costCents },\n        },\n        select: { packsOwned: true, costBasisCents: true },'''
)

replace(
    "src/app/api/rip/open/route.ts",
    '''import { syncPrestigeProgressForProductSets } from "@/lib/prestige";''',
    '''import { syncPrestigeProgressForProductSets } from "@/lib/prestige";\nimport { openedPackCostBasisCents } from "@/lib/analytics-math";\nimport { syncDailyPortfolioSnapshot } from "@/lib/portfolio";'''
)

replace(
    "src/app/api/rip/open/route.ts",
    '''      await tx.sealedInventory.update({\n        where: { userId_productId: { userId: user.id, productId } },\n        data: { packsOwned: { decrement: 1 } },\n      });''',
    '''      const openedPackBasis = openedPackCostBasisCents(\n        inv.costBasisCents,\n        inv.packsOwned\n      );\n\n      await tx.sealedInventory.update({\n        where: { userId_productId: { userId: user.id, productId } },\n        data: {\n          packsOwned: { decrement: 1 },\n          costBasisCents: { decrement: openedPackBasis },\n        },\n      });'''
)

replace(
    "src/app/api/rip/open/route.ts",
    '''      if (productSetIdsTouched.length > 0) {\n        await syncPrestigeProgressForProductSets({\n          tx,\n          userId: user.id,\n          productSetIds: productSetIdsTouched,\n        });\n      }\n\n      return {''',
    '''      if (productSetIdsTouched.length > 0) {\n        await syncPrestigeProgressForProductSets({\n          tx,\n          userId: user.id,\n          productSetIds: productSetIdsTouched,\n        });\n      }\n\n      await syncDailyPortfolioSnapshot(tx, user.id);\n\n      return {'''
)

replace(
    "src/app/api/grading/reveal/route.ts",
    '''import {\n  bookValueToCents,''',
    '''import { syncDailyPortfolioSnapshot } from "@/lib/portfolio";\nimport {\n  bookValueToCents,'''
)

replace(
    "src/app/api/grading/reveal/route.ts",
    '''      const updatedUser = await tx.user.findUnique({\n        where: { id: user.id },\n        select: { balanceCents: true },\n      });''',
    '''      await syncDailyPortfolioSnapshot(tx, user.id);\n\n      const updatedUser = await tx.user.findUnique({\n        where: { id: user.id },\n        select: { balanceCents: true },\n      });'''
)

replace(
    "src/app/api/auctions/[auctionId]/collect/route.ts",
    '''import { labelVcsGrade } from "@/lib/grading";''',
    '''import { labelVcsGrade } from "@/lib/grading";\nimport { syncDailyPortfolioSnapshot } from "@/lib/portfolio";'''
)

replace(
    "src/app/api/auctions/[auctionId]/collect/route.ts",
    '''            amountCents: salePriceCents,\n            description: `Auction purchase: ${description}`,''',
    '''            amountCents: -salePriceCents,\n            description: `Auction purchase: ${description}`,'''
)

replace(
    "src/app/api/auctions/[auctionId]/collect/route.ts",
    '''      const collected = await tx.auction.update({\n        where: {\n          id: auction.id,\n        },\n        data: {\n          status: "COLLECTED",\n          endedAt: auction.endedAt ?? new Date(),\n          collectedAt: new Date(),\n          winnerUserId: buyerUserId,\n          currentBidCents: salePriceCents,\n        },\n      });\n\n      return {''',
    '''      const collected = await tx.auction.update({\n        where: {\n          id: auction.id,\n        },\n        data: {\n          status: "COLLECTED",\n          endedAt: auction.endedAt ?? new Date(),\n          collectedAt: new Date(),\n          winnerUserId: buyerUserId,\n          currentBidCents: salePriceCents,\n        },\n      });\n\n      await syncDailyPortfolioSnapshot(tx, auction.sellerUserId);\n\n      if (buyerType === "HUMAN" && buyerUserId) {\n        await syncDailyPortfolioSnapshot(tx, buyerUserId);\n      }\n\n      return {'''
)

write("src/app/api/collection/stats/route.ts", r'''
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
''')

write("src/app/api/analytics/finances/route.ts", r'''
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
''')

write("src/app/api/analytics/daily-climb/route.ts", r'''
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  dateKeysBetween,
  getChicagoDateKey,
  getPctChange,
  shiftDateKey,
} from "@/lib/analytics-math";
import { syncDailyPortfolioSnapshot } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotLite = {
  userId: string;
  dateKey: string;
  openingNetWorthCents: number;
  closingNetWorthCents: number;
};

function delta(snapshot: SnapshotLite | null | undefined) {
  return snapshot
    ? snapshot.closingNetWorthCents - snapshot.openingNetWorthCents
    : 0;
}

export async function GET() {
  try {
    const me = await requireUser();
    const todayKey = getChicagoDateKey();

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    const todaySnapshots = new Map<string, Awaited<ReturnType<typeof syncDailyPortfolioSnapshot>>>();

    for (const user of users) {
      todaySnapshots.set(user.id, await syncDailyPortfolioSnapshot(prisma, user.id));
    }

    const historyStart = shiftDateKey(todayKey, -62);

    const history = await prisma.financialDailySnapshot.findMany({
      where: {
        userId: { in: users.map((user) => user.id) },
        dateKey: { gte: historyStart, lte: todayKey },
        valuationVersion: { gte: 2 },
      },
      select: {
        userId: true,
        dateKey: true,
        openingNetWorthCents: true,
        closingNetWorthCents: true,
      },
    });

    const byUserDate = new Map<string, SnapshotLite>();
    for (const snapshot of history) {
      byUserDate.set(`${snapshot.userId}:${snapshot.dateKey}`, snapshot);
    }

    function uniqueWinner(dateKey: string) {
      const standings = users.map((user) => ({
        user,
        gainCents: delta(byUserDate.get(`${user.id}:${dateKey}`)),
      }));

      const best = Math.max(0, ...standings.map((row) => row.gainCents));
      if (best <= 0) return null;

      const leaders = standings.filter((row) => row.gainCents === best);
      return leaders.length === 1 ? leaders[0] : null;
    }

    const yesterdayKey = shiftDateKey(todayKey, -1);
    const completedHistoryKeys =
      yesterdayKey >= historyStart ? dateKeysBetween(historyStart, yesterdayKey) : [];

    const monthStart = `${todayKey.slice(0, 7)}-01`;
    const monthlyWins = new Map<string, number>();

    for (const dateKey of completedHistoryKeys) {
      if (dateKey < monthStart) continue;
      const winner = uniqueWinner(dateKey);
      if (!winner) continue;
      monthlyWins.set(winner.user.id, (monthlyWins.get(winner.user.id) ?? 0) + 1);
    }

    const winStreaks = new Map<string, number>();

    for (const user of users) {
      let streak = 0;

      for (let index = completedHistoryKeys.length - 1; index >= 0; index -= 1) {
        const winner = uniqueWinner(completedHistoryKeys[index]);
        if (winner?.user.id === user.id) streak += 1;
        else break;
      }

      winStreaks.set(user.id, streak);
    }

    const yesterday = uniqueWinner(yesterdayKey);

    const rows = users
      .map((user) => {
        const snapshot = todaySnapshots.get(user.id)!;
        const gainCents = snapshot.closingNetWorthCents - snapshot.openingNetWorthCents;

        return {
          userId: user.id,
          label: user.name?.trim() || user.email?.trim() || "Collector",
          image: user.image,
          isMe: user.id === me.id,
          openingNetWorthCents: snapshot.openingNetWorthCents,
          netWorthCents: snapshot.closingNetWorthCents,
          gainCents,
          gainPct: getPctChange(snapshot.openingNetWorthCents, snapshot.closingNetWorthCents),
          monthlyWins: monthlyWins.get(user.id) ?? 0,
          winStreak: winStreaks.get(user.id) ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.gainCents !== a.gainCents) return b.gainCents - a.gainCents;
        if ((b.gainPct ?? -Infinity) !== (a.gainPct ?? -Infinity)) {
          return (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity);
        }
        return a.label.localeCompare(b.label);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return NextResponse.json({
      ok: true,
      dateKey: todayKey,
      timeZone: "America/Chicago",
      currentUserId: me.id,
      yesterdayWinner: yesterday
        ? {
            userId: yesterday.user.id,
            label: yesterday.user.name?.trim() || yesterday.user.email?.trim() || "Collector",
            gainCents: yesterday.gainCents,
          }
        : null,
      rows,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Daily Climb",
      },
      { status: 500 }
    );
  }
}
''')

write("src/app/api/analytics/boxes/route.ts", r'''
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dollarsToCents(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function productName(product: {
  year: number | null;
  brand: string | null;
  sport: string | null;
}) {
  return [product.year, product.brand, product.sport].filter(Boolean).join(" ") || "Product";
}

export async function GET() {
  try {
    const user = await requireUser();

    const boxes = await prisma.ripBox.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        product: {
          select: {
            id: true,
            year: true,
            brand: true,
            sport: true,
            boxImageUrl: true,
            packImageUrl: true,
          },
        },
        ripBoxCards: {
          include: {
            card: {
              select: {
                id: true,
                cardNumber: true,
                player: true,
                team: true,
                subset: true,
                variant: true,
                bookValue: true,
                frontImageUrl: true,
              },
            },
          },
        },
        gradingLinks: {
          select: {
            gradingOrder: {
              select: { id: true, feePaidCents: true },
            },
          },
        },
      },
    });

    const rows = boxes.map((box) => {
      const totalPulledCards = box.ripBoxCards.reduce((sum, row) => sum + row.quantity, 0);
      const totalPullValueCents = box.ripBoxCards.reduce(
        (sum, row) => sum + dollarsToCents(row.card.bookValue) * row.quantity,
        0
      );

      const remainingInventoryValueCents = box.ripBoxCards.reduce((sum, row) => {
        const remaining = Math.max(0, row.quantity - (row.soldQuantity ?? 0));
        return sum + dollarsToCents(row.card.bookValue) * remaining;
      }, 0);

      const realizedCents = box.ripBoxCards.reduce(
        (sum, row) => sum + (row.realizedCents ?? 0),
        0
      );

      const gradingOrders = new Map<number, number>();
      for (const link of box.gradingLinks) {
        gradingOrders.set(link.gradingOrder.id, link.gradingOrder.feePaidCents ?? 0);
      }

      const gradingFeeCents = Array.from(gradingOrders.values()).reduce(
        (sum, value) => sum + value,
        0
      );

      const totalPositionCents = remainingInventoryValueCents + realizedCents;
      const profitCents = totalPositionCents - box.purchasePriceCents - gradingFeeCents;
      const roiPct =
        box.purchasePriceCents > 0
          ? (profitCents / box.purchasePriceCents) * 100
          : null;

      const topCard =
        [...box.ripBoxCards]
          .sort(
            (a, b) =>
              dollarsToCents(b.card.bookValue) - dollarsToCents(a.card.bookValue)
          )
          .at(0) ?? null;

      return {
        id: box.id,
        productId: box.productId,
        productName: productName(box.product),
        product: box.product,
        purchasePriceCents: box.purchasePriceCents,
        packsPurchased: box.packsPurchased,
        packsOpened: box.packsOpened,
        isClosed: box.isClosed,
        createdAt: box.createdAt,
        totalPulledCards,
        totalPullValueCents,
        remainingInventoryValueCents,
        realizedCents,
        gradingFeeCents,
        totalPositionCents,
        profitCents,
        roiPct,
        breakEvenCents: Math.max(
          0,
          box.purchasePriceCents + gradingFeeCents - totalPositionCents
        ),
        topCard: topCard
          ? {
              id: topCard.card.id,
              cardNumber: topCard.card.cardNumber,
              player: topCard.card.player,
              team: topCard.card.team,
              subset: topCard.card.subset,
              variant: topCard.card.variant,
              bookValueCents: dollarsToCents(topCard.card.bookValue),
              frontImageUrl: topCard.card.frontImageUrl,
              quantity: topCard.quantity,
            }
          : null,
      };
    });

    const active = rows.filter((row) => !row.isClosed);
    const completed = rows.filter((row) => row.isClosed);

    const totals = completed.reduce(
      (acc, row) => {
        acc.completedBoxes += 1;
        acc.costCents += row.purchasePriceCents;
        acc.positionCents += row.totalPositionCents;
        acc.profitCents += row.profitCents;
        acc.gradingFeeCents += row.gradingFeeCents;
        if (row.profitCents > 0) acc.profitableBoxes += 1;
        return acc;
      },
      {
        completedBoxes: 0,
        profitableBoxes: 0,
        costCents: 0,
        positionCents: 0,
        profitCents: 0,
        gradingFeeCents: 0,
      }
    );

    const roiPct =
      totals.costCents > 0 ? (totals.profitCents / totals.costCents) * 100 : null;

    const profitablePct =
      totals.completedBoxes > 0
        ? (totals.profitableBoxes / totals.completedBoxes) * 100
        : null;

    const bestBox =
      [...completed]
        .filter((row) => row.roiPct != null)
        .sort((a, b) => (b.roiPct ?? -Infinity) - (a.roiPct ?? -Infinity))[0] ?? null;

    const productMap = new Map<string, {
      productId: string;
      productName: string;
      boxes: number;
      profitableBoxes: number;
      costCents: number;
      positionCents: number;
      profitCents: number;
    }>();

    for (const box of completed) {
      const entry = productMap.get(box.productId) ?? {
        productId: box.productId,
        productName: box.productName,
        boxes: 0,
        profitableBoxes: 0,
        costCents: 0,
        positionCents: 0,
        profitCents: 0,
      };

      entry.boxes += 1;
      entry.costCents += box.purchasePriceCents;
      entry.positionCents += box.totalPositionCents;
      entry.profitCents += box.profitCents;
      if (box.profitCents > 0) entry.profitableBoxes += 1;
      productMap.set(box.productId, entry);
    }

    const productPerformance = Array.from(productMap.values())
      .map((entry) => ({
        ...entry,
        roiPct: entry.costCents > 0 ? (entry.profitCents / entry.costCents) * 100 : null,
        profitablePct:
          entry.boxes > 0 ? (entry.profitableBoxes / entry.boxes) * 100 : null,
      }))
      .sort((a, b) => (b.roiPct ?? -Infinity) - (a.roiPct ?? -Infinity));

    return NextResponse.json({
      ok: true,
      totals: {
        ...totals,
        activeBoxes: active.length,
        roiPct,
        profitablePct,
        bestBox: bestBox
          ? {
              id: bestBox.id,
              productName: bestBox.productName,
              roiPct: bestBox.roiPct,
              profitCents: bestBox.profitCents,
            }
          : null,
      },
      active,
      completed,
      productPerformance,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load box analytics";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
''')

write("tests/analytics-portfolio.test.ts", r'''
import assert from "node:assert/strict";
import test from "node:test";
import {
  getChicagoDateKey,
  openedPackCostBasisCents,
  signedFinancialAmount,
} from "../src/lib/analytics-math";

test("financial direction wins over inconsistent historical amount signs", () => {
  assert.equal(signedFinancialAmount("EXPENSE", 2500), -2500);
  assert.equal(signedFinancialAmount("EXPENSE", -2500), -2500);
  assert.equal(signedFinancialAmount("INCOME", 2500), 2500);
  assert.equal(signedFinancialAmount("INCOME", -2500), 2500);
});

test("Chicago day changes at Chicago midnight", () => {
  assert.equal(getChicagoDateKey(new Date("2026-10-05T04:59:59.000Z")), "2026-10-04");
  assert.equal(getChicagoDateKey(new Date("2026-10-05T05:00:00.000Z")), "2026-10-05");
});

test("sealed cost basis is transferred proportionally as packs open", () => {
  assert.equal(openedPackCostBasisCents(7500, 24), 313);
  assert.equal(openedPackCostBasisCents(313, 1), 313);
  assert.equal(openedPackCostBasisCents(0, 0), 0);
});
''')

print("Backend analytics refresh prepared.")
