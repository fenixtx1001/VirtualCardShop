/**
 * Collector-facing quantity excludes copies already committed to an auction.
 * Cards awaiting grading still belong to the collector.
 *
 * This intentionally does NOT alter stored CardOwnership quantity, auction
 * settlement, financial valuation, or earned Prestige milestones.
 */
export function collectorQuantity(
  ownershipQuantity: number,
  auctionLockedQuantity: number,
  pendingGradingQuantity = 0
): number {
  const owned = safeQuantity(ownershipQuantity);
  const locked = Math.min(owned, safeQuantity(auctionLockedQuantity));
  return owned - locked + safeQuantity(pendingGradingQuantity);
}

export function readyQuantity(
  ownershipQuantity: number,
  auctionLockedQuantity: number
): number {
  return collectorQuantity(ownershipQuantity, auctionLockedQuantity);
}

function safeQuantity(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
