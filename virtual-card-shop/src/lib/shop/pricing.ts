/** Shared by catalog and checkout. All money is integer cents. */
export const DAILY_DEAL_DISCOUNT_BPS = 1500;
export const SALE_DISCOUNT_BPS = 500;
export const SALE_COUNT = 5;
export const SHOP_TIME_ZONE = "America/Chicago";

export type PromotionDay = {
  dateKey: string;
  productId: string | null;
  saleProductIds: string[];
};

export function shopDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)!.value).join("-");
}

export function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function selectPromotions(ids: string[], dateKey: string, yesterday: PromotionDay | null, existingDeal?: string | null): PromotionDay {
  const excluded = new Set([yesterday?.productId, ...(yesterday?.saleProductIds ?? [])]);
  const eligible = [...new Set(ids)].filter((id) => !excluded.has(id)).sort((a, b) =>
    stableHash(`${dateKey}:shop:${a}`) - stableHash(`${dateKey}:shop:${b}`) || a.localeCompare(b));
  const productId = existingDeal && eligible.includes(existingDeal) ? existingDeal : eligible[0] ?? null;
  return { dateKey, productId, saleProductIds: eligible.filter((id) => id !== productId).slice(0, SALE_COUNT) };
}

export function discountPrice(cents: number, bps: number) {
  return Math.round(cents * (10000 - bps) / 10000);
}

export function productPrices(product: { id: string; packPriceCents: number | null; packsPerBox: number | null }, day: PromotionDay) {
  const pack = product.packPriceCents ?? 0;
  const box = (product.packsPerBox ?? 0) > 0 ? Math.round(pack * product.packsPerBox! * 0.75) : null;
  const isDailyDeal = product.id === day.productId;
  const isSale = !isDailyDeal && day.saleProductIds.includes(product.id);
  const discountBps = isDailyDeal ? DAILY_DEAL_DISCOUNT_BPS : isSale ? SALE_DISCOUNT_BPS : 0;
  return {
    isDailyDeal, isSale, discountBps,
    dailyDealDateKey: day.dateKey,
    dailyDealDiscountBps: DAILY_DEAL_DISCOUNT_BPS,
    standardPackPriceCents: pack, standardBoxPriceCents: box,
    effectivePackPriceCents: discountPrice(pack, discountBps),
    effectiveBoxPriceCents: box === null ? null : discountPrice(box, discountBps),
    dealPackPriceCents: discountPrice(pack, DAILY_DEAL_DISCOUNT_BPS),
    dealBoxPriceCents: box === null ? null : discountPrice(box, DAILY_DEAL_DISCOUNT_BPS),
  };
}
