# Card image batches

Use this workflow to fill missing images across many sets without browser drag and drop. Run commands from `virtual-card-shop` in the existing VCS terminal with its database and R2 environment configured.

```bash
npm run import:card-images -- data/card-image-batches/2026-10-02-rare-cards/manifest.json --validate-only
npm run import:card-images -- data/card-image-batches/2026-10-02-rare-cards/manifest.json
npm run import:card-images -- data/card-image-batches/2026-10-02-rare-cards/manifest.json --apply
```

The first command checks files offline. The second checks all card identities against the database and previews changes. The third uploads to R2 and fills missing sides. It never overwrites an existing nonblank URL. There is no overwrite option. If identity fields differ from the manifest, reconcile them from the database export before applying; do not weaken the check.

The initial batch has eight reconstructed front/back images for Tim Couch, Jerome Bettis, Derek Jeter and J.D. Drew, plus the verified Cade McNown front. McNown's low-quality back is intentionally omitted. PNGs are below the existing 5 MiB per-image limit; Pacific die-cuts retain alpha transparency. Foil textures are illustrative. Bettis's 001/042 serial is arbitrary. Pacific backs follow base references and omit unverified serials. Generated microtext and edge fringes may differ from original cards.

## Prepare the next list

```bash
npm run export:missing-images -- --owned-only --limit=100
```

Attach `data/missing-card-images.json` to ChatGPT and invoke **VCS Image Factory**. Omit `--owned-only` to include unowned cards. Priority is book value times owned quantity, with a minimum multiplier of one; ownership is summed across users and grades. The export contains card IDs, exact player/set/number fields and missing sides, avoiding ambiguous copied admin rows.

## Asset and provenance rules

Prefer an exact scan, then a usable seller image, then a reconstruction grounded in a matching base and parallel reference. Keep every source URL and uncertainty in the manifest. Never classify a base scan as a verified rare parallel. Public catalog presentation should identify generated art as reconstructed imagery. This change records provenance in the batch, local run report and R2 metadata sidecar; it does not add a public UI badge or database provenance field.

Store assets under `data/card-image-batches/<batch-id>/images/`; the batch importer validates byte signatures, checksums, limits, local paths, duplicate sides and all database identities before any R2/DB writes. Each successful side has an immutable content-hash R2 key and a JSON metadata sidecar. Database writes compare the old URL to prevent races with other imports. Read back changed URLs to verify updates. Local reports under `data/card-image-runs/` retain prior URLs and outcomes. Rerun a partial import to fill remaining sides; uploaded but unlinked objects can remain if a database write fails or another admin fills the side first.

GitHub stages the files; R2 serves card images. The user runs the final `--apply` command. No API key is required for ChatGPT's built-in image generation, and creating a skill does not create an unattended image-generation service or scheduled job.

Validation:

```bash
node --import tsx --test scripts/lib/card-image-batch.test.mjs
```
