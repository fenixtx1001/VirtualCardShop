/** Shared display rules. Prestige is per ProductSet, never per product. */
export type InventorySetProgress = {
  productSetId: string;
  productId: string;
  name: string | null;
  isBase: boolean;
  level: number;
  nextLevel: number;
  totalCards: number;
  cardsAtNext: number;
  missingCopies: number;
};

export type InventoryProduct = {
  productId: string;
  packsOwned: number;
  updatedAt: string;
  packPriceCents: number;
  cardsPerPack: number | null;
  packImageUrl: string | null;
  sport: string | null;
  year: number | null;
  brand: string | null;
  sets: InventorySetProgress[];
};

export type MissingInventoryCard = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  owned: number;
  needed: number;
};

export const inventorySorts = {
  recent: "Recently updated",
  prestige: "Closest to next prestige",
  packs: "Most packs owned",
  name: "Product name",
  price: "Highest pack price",
} as const;
export type InventorySort = keyof typeof inventorySorts;
export type InventoryFilters = { query: string; sport: string; sort: InventorySort; hideEmpty: boolean };
export const defaultInventoryFilters: InventoryFilters = { query: "", sport: "all", sort: "recent", hideEmpty: true };

export function inventoryName(id: string) {
  return id.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function missingText(set: InventorySetProgress) {
  const cards = Math.max(0, set.totalCards - set.cardsAtNext);
  const copies = set.missingCopies;
  return copies === cards
    ? `${cards.toLocaleString("en-US")} ${cards === 1 ? "card" : "cards"} needed`
    : `${copies.toLocaleString("en-US")} copies across ${cards.toLocaleString("en-US")} ${cards === 1 ? "card" : "cards"}`;
}

export function baseSets(product: InventoryProduct) {
  return product.sets.filter((s) => s.isBase && s.totalCards > 0);
}

export function visibleInventory(rows: InventoryProduct[], filters: InventoryFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const closest = (row: InventoryProduct) => {
    const sets = baseSets(row);
    return sets.length ? Math.min(...sets.map((set) => set.missingCopies)) : Infinity;
  };
  return rows.filter((r) => (!filters.hideEmpty || r.packsOwned > 0)
    && (filters.sport === "all" || (r.sport || "Other") === filters.sport)
    && (!query || [inventoryName(r.productId), r.sport, r.brand, r.year].join(" ").toLocaleLowerCase().includes(query)))
    .sort((a, b) => {
      // Empty products and unavailable progress belong at the end of milestone sorting.
      let order = 0;
      if (filters.sort === "prestige") order = Number(b.packsOwned > 0) - Number(a.packsOwned > 0) || closest(a) - closest(b);
      if (filters.sort === "packs") order = b.packsOwned - a.packsOwned;
      if (filters.sort === "recent") order = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (filters.sort === "price") order = b.packPriceCents - a.packPriceCents;
      return order || inventoryName(a.productId).localeCompare(inventoryName(b.productId), "en", { numeric: true });
    });
}

export function restoreInventoryFilters(value: unknown): InventoryFilters {
  const v = (value && typeof value === "object" ? value : {}) as Partial<InventoryFilters>;
  return {
    query: typeof v.query === "string" ? v.query : "",
    sport: typeof v.sport === "string" ? v.sport : "all",
    sort: typeof v.sort === "string" && Object.hasOwn(inventorySorts, v.sort) ? v.sort : "recent",
    hideEmpty: typeof v.hideEmpty === "boolean" ? v.hideEmpty : true,
  };
}
