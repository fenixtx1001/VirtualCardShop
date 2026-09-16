import { stableHash } from "./pricing";

export type ShopProduct = {
  id: string; year: number | null; brand: string | null; sport: string | null;
  packImageUrl: string | null; boxImageUrl: string | null;
  packsPerBox: number | null; cardsPerPack: number | null; productSetsCount: number;
  released: boolean; isDailyDeal: boolean; isSale: boolean; isNewProduct: boolean;
  discountBps: number; dailyDealDateKey: string;
  standardPackPriceCents: number; standardBoxPriceCents: number | null;
  effectivePackPriceCents: number; effectiveBoxPriceCents: number | null;
};
export type SetProgress = {
  productId: string; productSetId: string; name: string | null; isBase: boolean;
  totalCards: number; ownedCards: number; level: number; nextLevel: number;
  cardsAtNext: number; missingCopies: number;
};
export type ProductProgress = {
  productId: string; baseTotal: number; baseOwned: number;
  prestige: { name: string; level: number; nextLevel: number; totalCards: number; cardsAtNext: number; missingCopies: number } | null;
};
export type Shelf = { id: string; title: string; subtitle: string; products: ShopProduct[]; kind?: "completion" | "prestige" };

export function productName(product: Pick<ShopProduct, "id">) {
  return product.id.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function summarizeProgress(sets: SetProgress[]): Record<string, ProductProgress> {
  const result: Record<string, ProductProgress> = {};
  for (const set of sets) {
    const progress = result[set.productId] ??= { productId: set.productId, baseTotal: 0, baseOwned: 0, prestige: null };
    if (set.isBase) { progress.baseTotal += set.totalCards; progress.baseOwned += set.ownedCards; }
    if (set.totalCards === 0 || set.level < 1 || set.cardsAtNext === 0) continue;
    const candidate = { name: set.name || "Base set", level: set.level, nextLevel: set.nextLevel, totalCards: set.totalCards, cardsAtNext: set.cardsAtNext, missingCopies: set.missingCopies };
    const current = progress.prestige;
    if (!current || candidate.cardsAtNext / candidate.totalCards > current.cardsAtNext / current.totalCards ||
      (candidate.cardsAtNext / candidate.totalCards === current.cardsAtNext / current.totalCards && candidate.missingCopies < current.missingCopies)) progress.prestige = candidate;
  }
  return result;
}

export function buildShelves(products: ShopProduct[], progress: Record<string, ProductProgress>, dateKey: string): Shelf[] {
  const day = Math.floor(new Date(`${dateKey}T12:00:00Z`).getTime() / 86400000);
  const ordered = (items: ShopProduct[], salt: string) => [...items].sort((a, b) =>
    stableHash(`${dateKey}:${salt}:${a.id}`) - stableHash(`${dateKey}:${salt}:${b.id}`) || a.id.localeCompare(b.id));
  const shelf = (id: string, title: string, subtitle: string, items: ShopProduct[]): Shelf => ({ id, title, subtitle, products: ordered(items, id) });
  const shelves: Shelf[] = [shelf("sales", "Sales", "Five fresh finds. Packs & boxes, 5% off.", products.filter((p) => p.isSale))];
  if (shelves[0].products.length !== 5) shelves[0].subtitle = "Today's selection. Packs & boxes, 5% off.";
  const sports = [...new Set(products.map((p) => p.sport).filter((s): s is string => !!s))].sort();
  const sportShelves = sports.map((sport) => shelf(`sport:${sport}`, sport, "Find your next favorite set.", products.filter((p) => p.sport === sport)));
  const eras = [
    { id: "vintage", title: "Before the boom", subtitle: "Classics from before 1980.", min: 0, max: 1979 },
    { id: "eighties", title: "The wax-pack years", subtitle: "Back to the 1980s.", min: 1980, max: 1989 },
    { id: "nineties", title: "The '90s card shop", subtitle: "A little foil. A lot of possibility.", min: 1990, max: 1999 },
    { id: "millennium", title: "Turn of the century", subtitle: "Explore the 2000s.", min: 2000, max: 2009 },
    { id: "modern", title: "A new generation", subtitle: "2010 and beyond.", min: 2010, max: 9999 },
  ].map((era) => shelf(era.id, era.title, era.subtitle, products.filter((p) => p.year !== null && p.year >= era.min && p.year <= era.max))).filter((s) => s.products.length > 0);
  // Catalog-relative bands remain useful as the virtual economy grows.
  const byPrice = [...products].sort((a, b) => a.standardPackPriceCents - b.standardPackPriceCents || a.id.localeCompare(b.id));
  const priceShelves = [
    shelf("budget", "A few packs after school", "Easygoing picks from the lower-priced third.", byPrice.slice(0, Math.ceil(byPrice.length / 3))),
    shelf("midrange", "Something for the weekend", "Explore the middle of the price range.", byPrice.slice(Math.ceil(byPrice.length / 3), Math.ceil(byPrice.length * 2 / 3))),
    shelf("premium", "Behind the counter", "The higher-priced end of the shop.", byPrice.slice(Math.ceil(byPrice.length * 2 / 3))),
  ].filter((s) => s.products.length > 0);
  const completion: Shelf = { id: "completion", title: "Close to completion", subtitle: "Your base sets, within reach.", kind: "completion", products: products.filter((p) => {
    const r = progress[p.id]; return r && r.baseTotal > 0 && r.baseOwned / r.baseTotal >= 0.7 && r.baseOwned < r.baseTotal;
  }).sort((a, b) => {
    const x = progress[a.id], y = progress[b.id];
    return y.baseOwned / y.baseTotal - x.baseOwned / x.baseTotal || (x.baseTotal - x.baseOwned) - (y.baseTotal - y.baseOwned) || a.id.localeCompare(b.id);
  }) };
  const prestige: Shelf = { id: "prestige", title: "Close to next prestige", subtitle: "Keep your collection moving forward.", kind: "prestige", products: products.filter((p) => {
    const r = progress[p.id]?.prestige; return r && r.cardsAtNext / r.totalCards >= 0.7 && r.missingCopies > 0;
  }).sort((a, b) => {
    const x = progress[a.id].prestige!, y = progress[b.id].prestige!;
    return y.cardsAtNext / y.totalCards - x.cardsAtNext / x.totalCards || x.missingCopies - y.missingCopies || a.id.localeCompare(b.id);
  }) };
  const personal = [completion, prestige].filter((s) => s.products.length);
  const groups = [sportShelves, eras, priceShelves];
  // Rotate categories by calendar day, not each mount, purchase or render.
  if (personal.length) shelves.push(personal[day % personal.length]);
  for (const group of groups) if (group.length) shelves.push(group[day % group.length]);
  const extra = [...personal, shelf("new", "Fresh in the shop", "Added during the past week.", products.filter((p) => p.isNewProduct)), ...eras, ...sportShelves];
  const candidates = extra.filter((s) => s.products.length && !shelves.some((x) => x.id === s.id));
  if (candidates.length) shelves.push(candidates[day % candidates.length]);
  return shelves.filter((s) => s.products.length);
}
