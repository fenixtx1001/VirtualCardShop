/**
 * TCDB and VCS sometimes number the same insert/parallel differently:
 * - TCDB #1G, VCS #1 (legacy suffix -> plain)
 * - TCDB #1, VCS #1KG / #KG1 / #KG-1 (plain -> decorated)
 *
 * Resolve only within ONE Product Set. Exact matches always win. Never change
 * the stored checklist/card number. A numeric alias is permitted only when
 * there is exactly one matching card in that Product Set; ambiguous parallels
 * must stop harvesting rather than receive another card's scan.
 */
export function tcdbNumericSuffix(cardNumber: string): string | null {
  const match = /^([0-9]+)[A-Za-z]+$/.exec(cardNumber.trim());
  return match ? match[1] : null;
}

export type HarvestNumberMatch =
  | { kind: "exact"; cardNumber: string }
  | { kind: "alias"; cardNumber: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "not-found" };

/** Extract an unchanged digit sequence; recognize only simple letter affixes. */
function storedNumericSlot(cardNumber: string): { digits: string; decorated: boolean } | null {
  const plain = /^([0-9]+)$/.exec(cardNumber);
  if (plain) return { digits: plain[1], decorated: false };

  const trailingLetters = /^([0-9]+)-?([A-Za-z]+)$/.exec(cardNumber);
  if (trailingLetters) return { digits: trailingLetters[1], decorated: true };

  const leadingLetters = /^([A-Za-z]+)-?([0-9]+)$/.exec(cardNumber);
  if (leadingLetters) return { digits: leadingLetters[2], decorated: true };

  return null;
}

/**
 * Returns the candidate's exact stored number, never a synthetic number.
 * The caller must fetch all candidate patterns for the base digit sequence.
 */
export function resolveHarvestCardNumber(
  incomingCardNumber: string,
  setCardNumbers: readonly string[]
): HarvestNumberMatch {
  const incoming = incomingCardNumber.trim();

  if (setCardNumbers.includes(incoming)) {
    return { kind: "exact", cardNumber: incoming };
  }

  // Only plain source numbers or familiar number+letter suffixes get aliases.
  // Prefix-bearing source numbers are left strict rather than guessed.
  const incomingIsPlain = /^[0-9]+$/.test(incoming);
  const baseNumber = incomingIsPlain ? incoming : tcdbNumericSuffix(incoming);
  if (!baseNumber) return { kind: "not-found" };

  const sameNumericSlot = setCardNumbers.filter((stored) => {
    const slot = storedNumericSlot(stored);
    return slot?.digits === baseNumber && (incomingIsPlain ? slot.decorated : true);
  });

  if (sameNumericSlot.length > 1) {
    return { kind: "ambiguous", candidates: [...sameNumericSlot].sort() };
  }

  if (sameNumericSlot.length === 1) {
    const chosen = sameNumericSlot[0];
    // TCDB 1G can map only to plain 1, never to an unrelated 1R/KG1.
    if (!incomingIsPlain && chosen !== baseNumber) return { kind: "not-found" };
    return { kind: "alias", cardNumber: chosen };
  }

  return { kind: "not-found" };
}
