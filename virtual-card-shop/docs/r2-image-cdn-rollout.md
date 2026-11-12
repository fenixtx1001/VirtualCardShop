# VCS image delivery: R2 custom-domain CDN (opt-in)

## Why

As of November 11, 2026, production Card rows contain ~128,035 front
scans and ~127,678 back scans on a `pub-…r2.dev` host. R2's `r2.dev`
public URL is rate-limited and intended for development, not production
Cloudflare caching. See:
https://developers.cloudflare.com/r2/buckets/public-buckets/

The app uses native HTML `img` for scan fidelity. Keep original bytes,
aspect/orientation handling, and Next.js Image Optimization costs unchanged.

## What this PR does

- Preserves all existing `Card.frontImageUrl`, `Card.backImageUrl`, and
  `Product.*ImageUrl` database fields, and preserves upload object keys.
- Adds an **opt-in display-only mapping** from the exact, configured legacy
  public R2 origin to a separate, verified Cloudflare custom-domain host.
- Requires both variables below. If either is missing, every image keeps its
  original URL. Other domains, local files, unexpected paths and malformed
  URLs are never remapped.
- Covers pack reveal/front/back/summary, nine-pocket binder and full preview,
  slab cards, collections, search, checklist, and singles-shop surfaces.
- Adds a preconnect to the active image origin, without proxying through Vercel
  or introducing billed Next.js image transformations.
- Keeps binder next-page prefetch on normal connections, skips it for mobile
  data-saver/2G networks, and prioritizes the visible pack card front.
- No card records, prices, odds, economy, Prestige, image compression or
  existing R2 objects are modified.

## Cloudflare setup BEFORE activating the switch

1. Choose a domain/subdomain whose DNS zone is managed in the SAME Cloudflare
   account as VCS's R2 bucket. Example: `cards.example.com` (placeholder only).
2. Cloudflare Dashboard → R2 → VCS image bucket → Settings →
   **Custom Domains** → connect your chosen hostname. Follow Cloudflare
   instructions until the custom domain and TLS are **Active**.
   Do NOT CNAME an R2.dev URL: Cloudflare explicitly does not support that.
3. Check multiple existing image keys in a browser on BOTH the old R2.dev
   host and the new hostname. All must serve **identical image bytes**,
   return HTTP 200 and an image Content-Type. Include a front, a back,
   and a pack image. Repeat on desktop/mobile.
4. Configure Cloudflare caching for immutable JPEG/PNG/WebP card image assets
   on the custom hostname. Existing R2 uploads use:
   `Cache-Control: public, max-age=31536000, immutable`.
   Do not cache authenticated JSON APIs, HTML, or mutable objects.
   Objects should have unique/versioned keys; if a key can be overwritten,
   invalidate that key rather than serving stale art.
5. Only after the verification above, add these Vercel **Production** env vars
   (both values are public HTTPS URLs, not credentials):

   ```dotenv
   NEXT_PUBLIC_VCS_R2_ORIGIN_BASE_URL=https://pub-6efb0e0c843946ccb21628c5d3eb41ad.r2.dev
   NEXT_PUBLIC_VCS_R2_CDN_BASE_URL=https://cards.example.com
   ```

   Replace the example CDN hostname with the real one. Do not modify
   `R2_ACCOUNT_ID`, access keys, the R2 bucket, or Neon database URLs.

6. Redeploy **the tested GitHub commit** so Next.js incorporates these build-time
   public variables. Check the actual network requests for a pack reveal,
   binder, slabs, checklist, and singles-shop images. The images should now
   load from the custom hostname with working front/back orientation.
7. Warm the cache, then inspect Cloudflare `CF-Cache-Status` response
   headers on repeat loads. A HIT is expected only when the object/rules are
   cacheable; do not report success merely because the CDN hostname responds.
8. Measure image load time (p50/p95), failed scans, R2 public fetches and
   Vercel Fast Data Transfer before/after. Expect meaningful savings only
   once a live custom domain handles the image traffic.

## Rollback

Remove **either** of the `NEXT_PUBLIC_VCS_R2_*` variables or set its value
to empty, then redeploy. Native card-image tags fall back to the stored origin
URL. No database rollback is necessary. Existing R2 public development access
must stay enabled until ALL display paths have migrated and been tested.

## Safe validation

From an isolated worktree at the PR head:

```bash
cd virtual-card-shop
npm ci --no-audit --no-fund
npx prisma generate
npx tsc --noEmit
npx tsx --test src/lib/images/r2-cdn.test.ts
npm run build
```

The PR intentionally does NOT create a Cloudflare custom domain, alter DNS,
rewrite 250k+ card records, or enable the CDN automatically.
