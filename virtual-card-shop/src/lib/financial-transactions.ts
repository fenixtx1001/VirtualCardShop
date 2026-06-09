// src/lib/financial-transactions.ts
import { Prisma } from "@prisma/client";

export type FinancialCategory =
  | "PACK_PURCHASE"
  | "BOX_PURCHASE"
  | "SINGLE_PURCHASE"
  | "GRADING_FEE"
  | "CARD_SALE"
  | "REWARD_BONUS"
  | "PRESTIGE_REWARD";

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

  return tx.financialTransaction.create({
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
}