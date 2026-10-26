import type { Prisma } from "@prisma/client";
import { labelVcsGrade } from "@/lib/grading";
import { getPercentOfValueBps } from "@/lib/auctions";
import { syncDailyPortfolioSnapshot } from "@/lib/portfolio";

export type AuctionCollectionOutcome = {
  auctionId: number;
  ok: boolean;
  error?: string;
  status?: "COLLECTED";
  salePriceCents?: number;
  buyerType?: "HUMAN" | "DUMMY" | "NONE";
  collectedAt?: string;
};

/**
 * Shared settlement used by both individual and bulk collection.
 * Eligibility, inventory, bidder funds, balances, transaction history and
 * the auction status all update within the caller's database transaction.
 *
 * Expected per-auction problems return an error result without writes.
 * Unexpected database errors throw, so the transaction is rolled back.
 */
export async function collectEndedAuctionTx(
  tx: Prisma.TransactionClient,
  sellerUserId: string,
  auctionId: number,
  changedPortfolios: Set<string>,
): Promise<AuctionCollectionOutcome> {
  const reject = (error: string): AuctionCollectionOutcome => ({ auctionId, ok: false, error });

  const auction = await tx.auction.findUnique({
    where: { id: auctionId },
    include: {
      card: { select: { player: true, cardNumber: true } },
      bids: {
        orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }, { id: "asc" }],
        take: 1,
      },
    },
  });
  if (!auction) return reject("Auction not found.");
  if (auction.sellerUserId !== sellerUserId) return reject("Only the seller can collect this auction.");
  if (auction.status === "COLLECTED" || auction.collectedAt) return reject("Already collected.");
  if (auction.status !== "ENDED") return reject("Auction is not ready to collect.");

  const ownership = await tx.cardOwnership.findUnique({
    where: {
      userId_cardId_grade: {
        userId: sellerUserId, cardId: auction.cardId, grade: auction.grade,
      },
    },
  });
  if (!ownership || ownership.auctionLockedQuantity < 1)
    return reject("Reserved inventory was not found.");

  const winningBid = auction.bids[0] ?? null;
  const salePriceCents = Math.max(0, auction.currentBidCents || winningBid?.amountCents || 0);
  const hasSale = salePriceCents > 0 && !!winningBid;
  if (hasSale && ownership.quantity < 1)
    return reject("Seller no longer owns the auctioned card.");

  const buyerType = !hasSale ? "NONE" :
    winningBid!.bidderType === "DUMMY" ? "DUMMY" : "HUMAN";
  const buyerUserId = buyerType === "HUMAN" ? winningBid!.userId : null;

  // Preflight expected failures before reserving the collection claim.
  if (buyerType === "HUMAN") {
    if (!buyerUserId) return reject("Winning bidder is unavailable.");
    const buyer = await tx.user.findUnique({
      where: { id: buyerUserId },
      select: { balanceCents: true },
    });
    if (!buyer) return reject("Winning buyer was not found.");
    if (buyer.balanceCents < salePriceCents)
      return reject("Winning buyer no longer has enough cash.");
  }

  // Compare-and-set is a row-level collection claim. Concurrent individual
  // and bulk requests cannot both settle and pay the same auction.
  const claimed = await tx.auction.updateMany({
    where: { id: auctionId, sellerUserId, status: "ENDED", collectedAt: null },
    data: {
      status: "COLLECTED",
      collectedAt: new Date(),
      endedAt: auction.endedAt ?? new Date(),
    },
  });
  if (claimed.count !== 1) return reject("Auction was already collected.");

  const description = auction.card.player + " #" + auction.card.cardNumber +
    " (" + labelVcsGrade(auction.grade) + ")";

  if (!hasSale) {
    const returned = await tx.cardOwnership.updateMany({
      where: { id: ownership.id, auctionLockedQuantity: { gte: 1 } },
      data: { auctionLockedQuantity: { decrement: 1 } },
    });
    if (returned.count !== 1) throw new Error("Auction reserved copy changed during settlement.");
    const result = await tx.auction.update({
      where: { id: auctionId },
      data: { winnerUserId: null, currentBidCents: 0 },
    });
    return {
      auctionId, ok: true, status: "COLLECTED",
      salePriceCents: 0, buyerType: "NONE",
      collectedAt: result.collectedAt?.toISOString() ?? undefined,
    };
  }

  // Only sold auctions reach this branch; Prisma's sale-history enum has
  // HUMAN/DUMMY (unsold NONE is intentionally not a recorded sale).
  const saleBuyerType: "HUMAN" | "DUMMY" = buyerType === "HUMAN" ? "HUMAN" : "DUMMY";

  const sold = await tx.cardOwnership.updateMany({
    where: {
      id: ownership.id, quantity: { gte: 1 }, auctionLockedQuantity: { gte: 1 },
    },
    data: {
      quantity: { decrement: 1 },
      auctionLockedQuantity: { decrement: 1 },
    },
  });
  if (sold.count !== 1) throw new Error("Auction ownership changed during settlement.");

  if (buyerType === "HUMAN" && buyerUserId) {
    const paid = await tx.user.updateMany({
      where: { id: buyerUserId, balanceCents: { gte: salePriceCents } },
      data: { balanceCents: { decrement: salePriceCents } },
    });
    if (paid.count !== 1) throw new Error("Winning buyer's balance changed during settlement.");
    const buyerBalance = await tx.user.findUniqueOrThrow({
      where: { id: buyerUserId }, select: { balanceCents: true },
    });
    await tx.financialTransaction.create({
      data: {
        userId: buyerUserId,
        category: "AUCTION_PURCHASE",
        direction: "EXPENSE",
        amountCents: -salePriceCents,
        description: "Auction purchase: " + description,
        balanceAfterCents: buyerBalance.balanceCents,
        metadata: { auctionId, cardId: auction.cardId, grade: auction.grade },
      },
    });
    await tx.cardOwnership.upsert({
      where: {
        userId_cardId_grade: {
          userId: buyerUserId, cardId: auction.cardId, grade: auction.grade,
        },
      },
      create: {
        userId: buyerUserId, cardId: auction.cardId, grade: auction.grade,
        quantity: 1, gradedAt: auction.grade > 0 ? new Date() : null,
      },
      update: { quantity: { increment: 1 } },
    });
    changedPortfolios.add(buyerUserId);
  } else {
    await tx.shopInventory.upsert({
      where: { cardId: auction.cardId },
      create: { cardId: auction.cardId, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
  }

  const seller = await tx.user.update({
    where: { id: sellerUserId },
    data: { balanceCents: { increment: salePriceCents } },
    select: { balanceCents: true },
  });
  await tx.financialTransaction.create({
    data: {
      userId: sellerUserId,
      category: "AUCTION_SALE",
      direction: "INCOME",
      amountCents: salePriceCents,
      description: "Auction sale: " + description,
      balanceAfterCents: seller.balanceCents,
      metadata: {
        auctionId, cardId: auction.cardId, grade: auction.grade, buyerType,
      },
    },
  });
  await tx.cardSaleHistory.create({
    data: {
      cardId: auction.cardId,
      grade: auction.grade,
      saleType: "AUCTION",
      buyerType: saleBuyerType,
      sellerUserId,
      buyerUserId,
      salePriceCents,
      valueBasisCents: auction.valueBasisCents,
      percentOfValueBps: getPercentOfValueBps({
        amountCents: salePriceCents, valueBasisCents: auction.valueBasisCents,
      }),
      auctionId,
    },
  });
  const collected = await tx.auction.update({
    where: { id: auctionId },
    data: { winnerUserId: buyerUserId, currentBidCents: salePriceCents },
  });
  changedPortfolios.add(sellerUserId);
  return {
    auctionId, ok: true, status: "COLLECTED",
    salePriceCents, buyerType,
    collectedAt: collected.collectedAt?.toISOString() ?? undefined,
  };
}

export async function syncCollectedPortfolioSnapshots(
  tx: Prisma.TransactionClient,
  changedPortfolios: Set<string>,
) {
  for (const userId of [...changedPortfolios].sort()) {
    await syncDailyPortfolioSnapshot(tx, userId);
  }
}
