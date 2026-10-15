/**
 * Product-set-preserving navigation between the canonical Checklist and Binder.
 * These URLs always use Product.id in the route, never ProductSet.id.
 */
export function checklistHref(productId: string, productSetId?: string | null) {
  const base = "/checklist/" + encodeURIComponent(productId);
  if (!productSetId) return base;
  return base + "?" + new URLSearchParams({ productSetId }).toString();
}

export function binderHref(
  productId: string,
  productSetId?: string | null,
  options: { cardId?: number | null; open?: boolean } = {},
) {
  const base = "/collection/" + encodeURIComponent(productId) + "/binder";
  const params = new URLSearchParams();
  if (productSetId) params.set("productSetId", productSetId);
  if (options.cardId != null && Number.isSafeInteger(options.cardId) && options.cardId > 0) {
    params.set("cardId", String(options.cardId));
  } else if (options.open) {
    params.set("open", "1");
  }
  const query = params.toString();
  return base + (query ? "?" + query : "");
}
