# VCS pack image performance (2026-10-13)

## What this patch changes

- Direct HTML `<img>` downloads remain in place. Card views do **not** use Vercel Image Optimization or Vercel-proxied R2 image requests.
- The visible front image receives `fetchPriority="high"`; the hidden back and under-card receive `"low"`. Browser prioritization is advisory.
- Each image component shows an intentional dark card placeholder until `onLoad`; errors show "IMAGE UNAVAILABLE" instead of a broken/white image.
- The pre-existing under-card already requests the next card's front image. We intentionally do **not** add bulk pack prefetching: it would increase uncached R2 reads and downloads for cards the user may never reveal.
- An optional `NEXT_PUBLIC_R2_CDN_BASE_URL` may route old `https://pub-....r2.dev/... ` card and pack URLs through an R2 custom domain at render time. Nothing changes until that variable is configured. This affects only the pack-opening UI; the database and other screens retain their existing URLs.

## Audit: safe and inexpensive

From the `virtual-card-shop` directory:

```bash
npx tsx scripts/audit-pack-images.ts
```

- Checks at most 8 recent front-image URLs by default using HTTP HEAD, **not** image downloads.
- Set `IMAGE_AUDIT_COUNT=12` to sample 12 (maximum 20).
- Or use `IMAGE_AUDIT_URL='https://your-image-url' npx tsx scripts/audit-pack-images.ts` to examine a known slow card.
- Prints host, status, milliseconds, content length, `cache-control`, `cf-cache-status` and content type.
- Does not modify cards, inventory, files, R2 objects, or the database.
- HEAD requests may still count as R2 Class B operations; the default sample is intentionally tiny.
- A single `cf-cache-status` isn't definitive; compare repeated normal browser requests.

## Highest-leverage cost improvement: R2 Custom Domain

Cloudflare's `r2.dev` URL is for testing, may throttle, and cannot use CDN caching. Custom domains give R2 content Cloudflare caching. You must own/control a Cloudflare DNS domain, or use a subdomain of one.

1. Cloudflare > R2 > your bucket > Settings > Public access > Custom Domains > Connect Domain.
2. Connect, for example, `cards.example.com` **to the same bucket** storing the original `r2.dev` files.
3. Confirm that `https://cards.example.com/<existing-object-key>` returns the same card image; test a specific known front and back card manually.
4. Verify CDN caching is configured for your image content. Cloudflare normally caches eligible image file extensions on a custom domain, but nonstandard extensions need a Cache Rule. Avoid "Cache Everything" for the entire application origin.
5. In Vercel's **production deployment** environment, add:

   `NEXT_PUBLIC_R2_CDN_BASE_URL=https://cards.example.com`

6. Redeploy VCS so the public environment variable is compiled into the client. No card URL migrations or Prisma scripts required for pack opening.
7. Reopen packs, verify images resolve under the custom host in your browser Network tab, and confirm a healthy cache hit ratio after warm-up.

If not yet using a custom domain, **leave the variable unset**. No DNS changes are automated or assumed.

Avoid global infinite-cache rules if object keys are overwritten in-place. The main upload helper `src/lib/r2Upload.ts` already sets a long immutable Cache-Control TTL for its timestamped image keys; old objects and other upload pathways may have different metadata. Changing image URLs in the database or moving buckets is out of scope.

## Verify UX and performance

- Open a 4-card pack and flip the current card front/back.
- Navigate forward/back, including fast swipes on mobile.
- Compare first-load and repeat-load image times with DevTools Network (disable "Disable cache"). Test on a device that has never viewed a particular card.
- Confirm a failed image gets a legible fallback, not an empty white rectangle.
- Confirm Safari/iOS and Firefox are both usable; browsers may handle `fetchPriority` differently.
- Verify the pack count, card order, collection balance, prestige markers and net worth are unchanged.
- Watch Vercel's function usage and R2 Class B read totals over several days; this patch alone doesn't guarantee a given percent cost reduction.

## Later, separate from this patch

The rip endpoint reads all base-card candidates, prestige ownership data, then calls `syncDailyPortfolioSnapshot`, which calculates the full card collection value on **every pack**. That is potentially expensive with a large collection and may increase Neon query load/Vercel duration. Reducing it safely requires preserving transaction consistency and daily midnight-to-midnight accounting. Profile it first; do **not** remove the daily snapshot hook without a validated replacement.

After pack images are verified on the custom CDN domain, consider a single shared URL-resolver utility across Collection, Slabs, Shop and other areas, followed by a careful optional database URL migration. This patch does not silently rewrite all 30,000+ card records.
