/**
 * Opt-in R2 custom-domain image delivery.
 *
 * Card rows store stable immutable R2 origin URLs. Never mutate them in the
 * database or proxy them through Vercel; resolve the *exact* known origin to
 * a verified Cloudflare custom domain only at display time.
 *
 * NEXT_PUBLIC_VCS_R2_ORIGIN_BASE_URL=https://pub-...r2.dev
 * NEXT_PUBLIC_VCS_R2_CDN_BASE_URL=https://cards.example.com
 *
 * Both variables must be set to activate the mapping. Unset either one to
 * roll back immediately on the next deployment.
 */
export type ImageCdnConfig = {
  originBaseUrl?: string | null;
  cdnBaseUrl?: string | null;
};

const DEFAULT_CONFIG: ImageCdnConfig = {
  originBaseUrl: process.env.NEXT_PUBLIC_VCS_R2_ORIGIN_BASE_URL,
  cdnBaseUrl: process.env.NEXT_PUBLIC_VCS_R2_CDN_BASE_URL,
};

function publicHttpsUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

/** Return the original URL unchanged on ANY configuration or input mismatch. */
export function imageDeliveryUrl(
  value: string | null | undefined,
  config: ImageCdnConfig = DEFAULT_CONFIG,
): string | null {
  if (value == null || value === "") return value ?? null;
  const source = publicHttpsUrl(config.originBaseUrl);
  const destination = publicHttpsUrl(config.cdnBaseUrl);
  if (!source || !destination || source.origin === destination.origin) return value;

  try {
    const existing = new URL(value);
    if (existing.protocol !== "https:" || existing.username || existing.password ||
        existing.origin !== source.origin) return value;

    // Only remap actual image assets from our R2 object namespace. Avoid
    // touching unrelated URLs or similar-looking hostnames / path prefixes.
    const prefix = source.pathname.replace(/\/+$/, "");
    const key = existing.pathname.slice(prefix.length);
    if (!existing.pathname.startsWith(prefix + "/") ||
        !key.startsWith("/virtual-card-shop/")) return value;

    const destinationPrefix = destination.pathname.replace(/\/+$/, "");
    return destination.origin + destinationPrefix + key +
      existing.search + existing.hash;
  } catch {
    return value;
  }
}

/**
 * Warm the browser's connection to the host actually used for image delivery.
 * In the default deployment this is the existing R2 origin. On CDN rollout
 * use the new Cloudflare custom domain instead.
 */
export function imageDeliveryPreconnectOrigin(
  config: ImageCdnConfig,
  fallbackBaseUrl?: string | null,
): string | null {
  const mapped = publicHttpsUrl(config.originBaseUrl) &&
    publicHttpsUrl(config.cdnBaseUrl)
    ? publicHttpsUrl(config.cdnBaseUrl) : null;
  return (mapped ?? publicHttpsUrl(fallbackBaseUrl) ??
    publicHttpsUrl(config.originBaseUrl))?.origin ?? null;
}
