import { inventoryName } from "@/lib/inventory";

/**
 * The Rip screen navigates by Product ID (as does Inventory).
 *
 * The previous meta API incorrectly assumed that the URL parameter was a
 * ProductSet ID, so products without matching ProductSet IDs showed
 * "(No pack image set)" even though Product.packImageUrl was populated.
 *
 * Product lookup is authoritative. Retain a set-ID fallback for any old
 * direct links to this endpoint; do not require or infer a base set.
 */
type ImageProduct = {
  id: string;
  packImageUrl: string | null;
};
type LegacyImageSet = {
  id: string;
  product: ImageProduct;
};
type MetaLookups = {
  findProductById: (id: string) => Promise<ImageProduct | null>;
  findLegacySetById: (id: string) => Promise<LegacyImageSet | null>;
};

export async function resolveOpenPackMeta(id: string, lookups: MetaLookups) {
  const product = await lookups.findProductById(id);
  if (product) {
    return {
      ok: true as const,
      productId: product.id,
      displayName: inventoryName(product.id),
      packImageUrl: product.packImageUrl,
    };
  }

  // Compatibility only. Inventory and /open-pack/[productId] never rely on it.
  const legacySet = await lookups.findLegacySetById(id);
  if (!legacySet) return null;

  return {
    ok: true as const,
    productId: legacySet.product.id,
    displayName: inventoryName(legacySet.product.id),
    packImageUrl: legacySet.product.packImageUrl,
  };
}
