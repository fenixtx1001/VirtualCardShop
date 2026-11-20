/**
 * TCDB sometimes labels a parallel with a letter suffix (e.g. #1G) while
 * an already-created VCS Product Set uses the numbered checklist (#1).
 *
 * This resolver is intentionally narrow: it never rewrites card identifiers
 * and it only permits a suffix -> plain number match when NO other card in the
 * same Product Set shares that numeric portion. A different parallel (1R)
 * must not silently receive a scan intended for 1G.
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

export function resolveHarvestCardNumber(
  incomingCardNumber: string,
  setCardNumbers: readonly string[]
): HarvestNumberMatch {
  const incoming = incomingCardNumber.trim();
  if (setCardNumbers.includes(incoming)) {
    return { kind: "exact", cardNumber: incoming };
  }

  const baseNumber = tcdbNumericSuffix(incoming);
  if (!baseNumber) return { kind: "not-found" };

  const sameNumericSlot = setCardNumbers.filter((stored) => {
    const match = /^([0-9]+)([A-Za-z]*)$/.exec(stored);
    return match?.[1] === baseNumber;
  });

  if (sameNumericSlot.length > 1) {
    return { kind: "ambiguous", candidates: sameNumericSlot.sort() };
  }

  if (sameNumericSlot.length === 1 && sameNumericSlot[0] === baseNumber) {
    return { kind: "alias", cardNumber: baseNumber };
  }

  return { kind: "not-found" };
}
