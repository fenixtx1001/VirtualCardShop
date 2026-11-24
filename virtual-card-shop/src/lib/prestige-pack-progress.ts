/**
 * Snapshot the Prestige ownership state BEFORE a pack is opened.
 *
 * A card continues to belong to its collector while it is in an unrevealed
 * grading order. When revealed, the order stops counting separately because
 * its copies are added back to CardOwnership in their graded bucket.
 *
 * These quantities must match computeProductSetLevel() and /api/prestige/summary.
 * In particular, "needed for Prestige" must not be based on raw inventory only.
 */
export type PrestigeQuantityRow = {
  cardId: number;
  quantity: number | null | undefined;
};

export type SetPrestigeSnapshot = {
  totalCards: number;
  currentPrestigeLevel: number;
  nextPrestigeLevel: number;
  beforeQtyByCardId: Map<number, number>;
  missingForNextPrestigeBefore: Set<number>;
};

export function buildSetPrestigeSnapshot(
  cardsInSet: readonly { id: number }[],
  ownershipRows: readonly PrestigeQuantityRow[],
  unrevealedGradingRows: readonly PrestigeQuantityRow[]
): SetPrestigeSnapshot {
  const beforeQtyByCardId = new Map<number, number>();
  const validCardIds = new Set(cardsInSet.map((card) => card.id));

  for (const row of [...ownershipRows, ...unrevealedGradingRows]) {
    if (!validCardIds.has(row.cardId)) continue;
    const quantity = row.quantity ?? 0;
    if (quantity <= 0) continue;
    beforeQtyByCardId.set(
      row.cardId,
      (beforeQtyByCardId.get(row.cardId) ?? 0) + quantity
    );
  }

  const currentPrestigeLevel = cardsInSet.length
    ? Math.min(...cardsInSet.map((card) => beforeQtyByCardId.get(card.id) ?? 0))
    : 0;
  const nextPrestigeLevel = currentPrestigeLevel + 1;
  const missingForNextPrestigeBefore = new Set(
    cardsInSet
      .filter((card) => (beforeQtyByCardId.get(card.id) ?? 0) < nextPrestigeLevel)
      .map((card) => card.id)
  );

  return {
    totalCards: cardsInSet.length,
    currentPrestigeLevel,
    nextPrestigeLevel,
    beforeQtyByCardId,
    missingForNextPrestigeBefore,
  };
}

/**
 * Show "Needed" only when this pull actually supplied a copy absent at the
 * next level. A copy already out for grading cannot be "missing" at level 1.
 */
export function isNeededForNextPrestige(
  beforeQty: number,
  afterQty: number,
  target: number,
  wasMissingBefore: boolean
): boolean {
  return wasMissingBefore && beforeQty < target && afterQty >= target;
}
