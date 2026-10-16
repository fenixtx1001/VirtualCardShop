/**
 * Optional rarity groups inside canonical collector checklists.
 *
 * Default/null config means the existing equal-odds Base draw and historical
 * ProductSet odds work unchanged. Each configured hit group uses exactly one
 * independently sampled 1:N per-pack Bernoulli event.
 *
 * If more groups hit than there are card slots, use a uniform random subset
 * of the hits. effectiveHitProbabilities() models that same cap for pack EV.
 */
export type RarityGroup = { productSetId: string; subset: string };
export type RarityHitRule = RarityGroup & { oddsPerPack: number };
export type PackRarityConfig = {
  version: 1;
  fallback: RarityGroup;
  hits: RarityHitRule[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function group(value: unknown, label: string): RarityGroup {
  if (!isRecord(value)) throw new Error(label + " must be an object");
  const productSetId = value.productSetId;
  const subset = value.subset;
  if (typeof productSetId !== "string" || !productSetId.trim()
      || typeof subset !== "string" || !subset.trim()) {
    throw new Error(label + " requires nonempty productSetId and subset");
  }
  return { productSetId: productSetId.trim(), subset: subset.trim() };
}
export function rarityGroupKey(group: RarityGroup): string {
  return JSON.stringify([group.productSetId, group.subset]);
}
export function parsePackRarityConfig(input: unknown): PackRarityConfig | null {
  if (input === null || input === undefined) return null;
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.hits)) {
    throw new Error("Pack rarity config requires version:1 and hits array");
  }
  if (input.hits.length === 0 || input.hits.length > 32) {
    throw new Error("Pack rarity config needs 1-32 hit groups");
  }
  const fallback = group(input.fallback, "packRarity.fallback");
  const seen = new Set([rarityGroupKey(fallback)]);
  const hits: RarityHitRule[] = input.hits.map((item, index) => {
    const result = group(item, "packRarity.hits[" + index + "]");
    const oddsPerPack = isRecord(item) ? item.oddsPerPack : undefined;
    if (typeof oddsPerPack !== "number" || !Number.isSafeInteger(oddsPerPack) || oddsPerPack < 1) {
      throw new Error("Invalid positive integer odds for rarity group " + index);
    }
    const key = rarityGroupKey(result);
    if (seen.has(key)) throw new Error("Duplicate rarity group " + key);
    seen.add(key);
    return { ...result, oddsPerPack: oddsPerPack as number };
  });
  return { version: 1, fallback, hits };
}

/** Replace Base-only subset odds while keeping all existing non-Base hit rules. */
export function replaceBaseSubsetOdds(
  current: PackRarityConfig | null,
  baseSetId: string,
  fallbackSubset: string,
  baseHits: ReadonlyArray<{ subset: string; oddsPerPack: number }>
): PackRarityConfig {
  const otherHits = (current?.hits ?? []).filter(
    hit => hit.productSetId !== baseSetId
  );
  const merged = parsePackRarityConfig({
    version: 1,
    fallback: { productSetId: baseSetId, subset: fallbackSubset },
    hits: [
      ...baseHits.map(hit => ({
        productSetId: baseSetId,
        subset: hit.subset,
        oddsPerPack: hit.oddsPerPack,
      })),
      ...otherHits,
    ],
  });
  if (!merged) throw new Error("Could not build Base subset rarity configuration");
  return merged;
}

export type PackHit = { productSetId: string; subset: string; oddsPerPack: number };

/** All hit events (including legacy inserts) are independent until slot cap. */
export function drawPackHits<T extends PackHit>(
  rules: readonly T[],
  slots: number,
  rng: () => number = Math.random
): T[] {
  if (!Number.isSafeInteger(slots) || slots < 1) {
    throw new Error("A pack must have at least one slot");
  }
  const successes = rules.filter(rule => rng() < 1 / rule.oddsPerPack);
  if (successes.length <= slots) return successes;
  // Uniform cap avoids systematic priority for the earliest declared rule.
  const copy = [...successes];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, slots);
}

/** Exact post-cap event probabilities, used by pricing; O(n^3), n<=64. */
export function effectiveHitProbabilities(
  rules: readonly Pick<PackHit, "oddsPerPack">[],
  slots: number
): number[] {
  if (!Number.isSafeInteger(slots) || slots < 1) {
    throw new Error("Pack must have positive card slots");
  }
  return rules.map((rule, index) => {
    let distribution = [1];
    for (let j = 0; j < rules.length; j++) {
      if (j === index) continue;
      const p = 1 / rules[j].oddsPerPack;
      const next = Array(distribution.length + 1).fill(0) as number[];
      for (let k = 0; k < distribution.length; k++) {
        next[k] += distribution[k] * (1 - p);
        next[k + 1] += distribution[k] * p;
      }
      distribution = next;
    }
    const retainedIfHit = distribution.reduce(
      (sum, chance, otherHits) =>
        sum + chance * Math.min(1, slots / (otherHits + 1)),
      0
    );
    return retainedIfHit / rule.oddsPerPack;
  });
}

/**
 * Fail-closed against misconfigured import data. A rule never changes
 * checklist membership: every card remains in its actual ProductSet.
 */
export function validateRarityInventory(
  config: PackRarityConfig,
  sets: ReadonlyArray<{
    id: string;
    isBase: boolean;
    oddsPerPack: number | null;
    subsets: readonly (string | null)[];
  }>
): void {
  const byId = new Map(sets.map(set => [set.id, set]));
  const fallbackSet = byId.get(config.fallback.productSetId);
  if (!fallbackSet?.isBase) {
    throw new Error("Rarity fallback must belong to a Base ProductSet");
  }
  const covered = new Map<string, Set<string>>();
  for (const r of [config.fallback, ...config.hits]) {
    const set = byId.get(r.productSetId);
    if (!set) throw new Error("Unknown rarity ProductSet: " + r.productSetId);
    if (set.oddsPerPack != null) {
      throw new Error("Do not combine per-subset odds and whole-set odds for " + set.id);
    }
    if (!set.subsets.includes(r.subset)) {
      throw new Error("Missing subset " + r.subset + " in " + set.id);
    }
    if (!covered.has(set.id)) covered.set(set.id, new Set());
    covered.get(set.id)!.add(r.subset);
  }
  for (const set of sets) {
    if (!set.isBase && !covered.has(set.id)) continue; // legacy inserts.
    const specified = covered.get(set.id) ?? new Set<string>();
    // All Base cards must be reachable, not just those currently common.
    if (set.isBase && !specified.size) {
      throw new Error("Missing rarity rules for Base ProductSet " + set.id);
    }
    for (const subset of set.subsets) {
      if (!subset || !specified.has(subset)) {
        throw new Error(
          "Rarity rules leave unreachable cards in " + set.id +
          ", subset " + String(subset)
        );
      }
    }
  }
}
