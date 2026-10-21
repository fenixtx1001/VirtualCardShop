/**
 * Deterministic, unbiased-enough Fisher-Yates shuffle of order IDs for the
 * Grading Desk's READY list. Sorting IDs before the shuffle means navigation
 * across pages yields the same permutation for a given seed regardless of DB
 * iteration order. Only IDs are shuffled: never results, grades, or status.
 *
 * A new client-generated seed produces a new ordering. Reusing that seed
 * during pagination and refetches keeps the Ready list in one stable order.
 */
export function shuffleReadyMailerIds(
  orderIds: readonly number[],
  seed: number,
): number[] {
  const ids = [...orderIds].sort((a, b) => a - b);
  let state = (seed >>> 0) || 0x9e3779b9;

  for (let i = ids.length - 1; i > 0; i--) {
    // Xorshift32: fast deterministic 32-bit PRNG; this shuffle is not used
    // for security-sensitive decisions or grading outcome generation.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
